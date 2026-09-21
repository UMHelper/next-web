"use client";

import { useUser } from "@clerk/nextjs";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createPlan as createPlanApi,
  deletePlan as deletePlanApi,
  listPlans,
  TimetableApiError,
  updatePlan as updatePlanApi,
  type ServerPlan,
} from "@/lib/timetable/client";
import {
  applyAddSection,
  applyRemoveSection,
  applyReplaceSection,
  coalesceOutbox,
  createEmptyStore,
  queueMutation,
  removePlanLocal,
  termKey,
  upsertPlanLocal,
  type LocalPlan,
  type TimetableStore,
} from "@/lib/timetable/store";
import type { PlanSection } from "@/lib/timetable/schema";
import { migrateLegacyCart } from "@/lib/timetable/migrate-legacy-cart";

type AddResult =
  | { ok: true }
  | { ok: false; error: "missing" | "duplicate" | "same-course" };

type PlannerContextValue = {
  store: TimetableStore;
  activePlan?: LocalPlan;
  syncState: "idle" | "saving" | "offline" | "error" | "conflict";
  addSection: (clientRef: string, section: PlanSection) => AddResult;
  replaceSection: (
    clientRef: string,
    oldKey: string,
    section: PlanSection,
  ) => void;
  removeSection: (clientRef: string, key: string) => void;
  createPlan: (name: string, term: { year: number; sem: number }) => LocalPlan;
  renamePlan: (clientRef: string, name: string) => void;
  deletePlan: (clientRef: string) => void;
  setActivePlan: (clientRef: string) => void;
  resolveConflict: (
    clientRef: string,
    strategy: "keepLocal" | "useServer",
  ) => Promise<void>;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

const storageKey = (userId: string) => `timetable:store:v1:${userId}`;

const serverToLocal = (plan: ServerPlan): LocalPlan => ({
  clientRef: plan.client_ref,
  serverId: plan.id,
  name: plan.name,
  year: plan.year,
  sem: plan.sem,
  payload: plan.payload,
  revision: plan.revision,
  updatedAt: plan.updated_at,
  syncState: "idle",
});

const readStore = (userId: string): TimetableStore => {
  if (typeof window === "undefined") return createEmptyStore();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return createEmptyStore();
    const parsed = JSON.parse(raw) as TimetableStore;
    if (parsed.schemaVersion !== 1) return createEmptyStore();
    return {
      ...createEmptyStore(),
      ...parsed,
      plans: parsed.plans ?? {},
      activePlanByTerm: parsed.activePlanByTerm ?? {},
      outbox: parsed.outbox ?? [],
    };
  } catch {
    return createEmptyStore();
  }
};

export const TimetablePlannerProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { user, isLoaded } = useUser();
  const userId = user?.id;
  const [store, setStore] = useState<TimetableStore>(() => createEmptyStore());
  const [hydrated, setHydrated] = useState(false);
  const storeRef = useRef(store);
  const flushTimer = useRef<ReturnType<typeof setTimeout>>();
  const flushingRef = useRef(false);

  storeRef.current = store;

  const persist = useCallback(
    (next: TimetableStore) => {
      if (!userId || typeof window === "undefined") return;
      window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    },
    [userId],
  );

  const updateStore = useCallback(
    (next: TimetableStore) => {
      storeRef.current = next;
      setStore(next);
      persist(next);
    },
    [persist],
  );

  const flushOutbox = useCallback(async () => {
    if (!userId || flushingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const next = {
        ...storeRef.current,
        plans: Object.fromEntries(
          Object.entries(storeRef.current.plans).map(([key, plan]) => [
            key,
            { ...plan, syncState: "offline" as const },
          ]),
        ),
      };
      updateStore(next);
      return;
    }

    flushingRef.current = true;
    try {
      let current = storeRef.current;

      while (current.outbox.length > 0) {
        const mutation = current.outbox[0];
        const plan = current.plans[mutation.clientRef];

        try {
          if (mutation.type === "create_plan" && plan) {
            const serverPlan = await createPlanApi({
              clientRef: plan.clientRef,
              name: plan.name,
              year: plan.year,
              sem: plan.sem,
              payload: plan.payload,
            });
            current = {
              ...current,
              plans: {
                ...current.plans,
                [plan.clientRef]: {
                  ...plan,
                  serverId: serverPlan.id,
                  revision: serverPlan.revision,
                  updatedAt: serverPlan.updated_at,
                  syncState: "idle",
                },
              },
              outbox: current.outbox.filter((item) => item.id !== mutation.id),
            };
          } else if (mutation.type === "update_plan" && plan?.serverId) {
            const serverPlan = await updatePlanApi(plan.serverId, {
              baseRevision: mutation.baseRevision,
              name: mutation.name,
              payload: mutation.payload,
            });
            current = {
              ...current,
              plans: {
                ...current.plans,
                [plan.clientRef]: {
                  ...plan,
                  name: serverPlan.name,
                  payload: serverPlan.payload,
                  revision: serverPlan.revision,
                  updatedAt: serverPlan.updated_at,
                  syncState: "idle",
                },
              },
              outbox: current.outbox.filter((item) => item.id !== mutation.id),
            };
          } else if (mutation.type === "delete_plan" && plan?.serverId) {
            await deletePlanApi(plan.serverId);
            current = removePlanLocal(current, plan.clientRef);
            current.outbox = current.outbox.filter(
              (item) => item.id !== mutation.id,
            );
          } else {
            current = {
              ...current,
              outbox: current.outbox.filter((item) => item.id !== mutation.id),
            };
          }

          updateStore(current);
        } catch (error) {
          const conflict = error instanceof TimetableApiError && error.status === 409;
          const failedPlan = plan
            ? {
                ...plan,
                syncState: conflict ? ("conflict" as const) : ("error" as const),
              }
            : undefined;

          updateStore({
            ...current,
            plans: failedPlan
              ? { ...current.plans, [plan!.clientRef]: failedPlan }
              : current.plans,
          });
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [updateStore, userId]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      void flushOutbox();
    }, 800);
  }, [flushOutbox]);

  const queuePlanSync = useCallback(
    (clientRef: string, name?: string) => {
      const plan = storeRef.current.plans[clientRef];
      if (!plan) return;

      const next = coalesceOutbox(storeRef.current, {
        type: plan.serverId ? "update_plan" : "create_plan",
        clientRef,
        baseRevision: plan.revision,
        name,
        payload: plan.payload,
      });
      updateStore(next);
      scheduleFlush();
    },
    [scheduleFlush, updateStore],
  );

  useEffect(() => {
    if (!isLoaded || !userId) {
      setHydrated(false);
      return;
    }

    let cancelled = false;
    const local = readStore(userId);

    const migrate = async () => {
      if (
        Object.keys(local.plans).length === 0 &&
        !local.importedLegacyCart &&
        typeof window !== "undefined"
      ) {
        const legacy = window.localStorage.getItem("timetableCart");
        if (legacy) {
          try {
            const migrated = migrateLegacyCart(JSON.parse(legacy), {
              year: Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026),
              sem: Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1),
            });
            if (migrated) {
              const clientRef = crypto.randomUUID();
              const year = Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026);
              const sem = Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1);
              const migratedPlan: LocalPlan = {
                clientRef,
                name: "我的课表",
                year,
                sem,
                payload: migrated,
                revision: 0,
                syncState: "idle",
              };
              const next = upsertPlanLocal(
                { ...local, importedLegacyCart: true },
                migratedPlan,
              );
              const queued = queueMutation(next, {
                type: "create_plan",
                clientRef,
                baseRevision: 0,
              });
              window.localStorage.removeItem("timetableCart");
              if (!cancelled) updateStore(queued);
              return;
            }
          } catch {
            window.localStorage.removeItem("timetableCart");
          }
        }
      }
      if (!cancelled) updateStore(local);
    };

    void migrate();
    setHydrated(true);

    const loadServer = async () => {
      try {
        const year = Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026);
        const serverPlans = await listPlans({ year });
        if (cancelled) return;
        let next = storeRef.current;
        for (const serverPlan of serverPlans) {
          const pending = next.outbox.some(
            (mutation) => mutation.clientRef === serverPlan.client_ref,
          );
          if (!pending) next = upsertPlanLocal(next, serverToLocal(serverPlan), false);
        }
        updateStore(next);
      } catch {
        // Local cache remains usable when the server is unavailable.
      }
    };

    if (typeof navigator === "undefined" || navigator.onLine) void loadServer();

    const onOnline = () => void flushOutbox();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [flushOutbox, isLoaded, updateStore, userId]);

  const addSection = useCallback(
    (clientRef: string, section: PlanSection): AddResult => {
      const result = applyAddSection(storeRef.current, clientRef, section);
      if (result.error) return { ok: false, error: result.error };
      updateStore(result.store);
      queuePlanSync(clientRef);
      return { ok: true };
    },
    [queuePlanSync, updateStore],
  );

  const replaceSection = useCallback(
    (clientRef: string, oldKey: string, section: PlanSection) => {
      const next = applyReplaceSection(storeRef.current, clientRef, oldKey, section);
      updateStore(next);
      queuePlanSync(clientRef);
    },
    [queuePlanSync, updateStore],
  );

  const removeSection = useCallback(
    (clientRef: string, key: string) => {
      const next = applyRemoveSection(storeRef.current, clientRef, key);
      updateStore(next);
      queuePlanSync(clientRef);
    },
    [queuePlanSync, updateStore],
  );

  const createPlan = useCallback(
    (name: string, term: { year: number; sem: number }) => {
      const clientRef = crypto.randomUUID();
      const plan: LocalPlan = {
        clientRef,
        name,
        year: term.year,
        sem: term.sem,
        payload: { schemaVersion: 1, sections: [] },
        revision: 0,
        syncState: "idle",
      };
      const next = queueMutation(upsertPlanLocal(storeRef.current, plan), {
        type: "create_plan",
        clientRef,
        baseRevision: 0,
      });
      updateStore(next);
      scheduleFlush();
      return plan;
    },
    [scheduleFlush, updateStore],
  );

  const renamePlan = useCallback(
    (clientRef: string, name: string) => {
      const plan = storeRef.current.plans[clientRef];
      if (!plan) return;
      updateStore(
        upsertPlanLocal(storeRef.current, { ...plan, name }, false),
      );
      queuePlanSync(clientRef, name);
    },
    [queuePlanSync, updateStore],
  );

  const deletePlan = useCallback(
    (clientRef: string) => {
      const plan = storeRef.current.plans[clientRef];
      if (!plan) return;
      const next = plan.serverId
        ? queueMutation(removePlanLocal(storeRef.current, clientRef), {
            type: "delete_plan",
            clientRef,
            baseRevision: plan.revision,
          })
        : removePlanLocal(storeRef.current, clientRef);
      updateStore(next);
      scheduleFlush();
    },
    [scheduleFlush, updateStore],
  );

  const setActivePlan = useCallback(
    (clientRef: string) => {
      const plan = storeRef.current.plans[clientRef];
      if (!plan) return;
      updateStore({
        ...storeRef.current,
        activePlanByTerm: {
          ...storeRef.current.activePlanByTerm,
          [termKey(plan.year, plan.sem)]: clientRef,
        },
      });
    },
    [updateStore],
  );

  const resolveConflict = useCallback(
    async (clientRef: string, strategy: "keepLocal" | "useServer") => {
      const plan = storeRef.current.plans[clientRef];
      if (!plan?.serverId) return;

      if (strategy === "useServer") {
        const plans = await listPlans({ year: plan.year, sem: plan.sem });
        const serverPlan = plans.find((item) => item.id === plan.serverId);
        if (serverPlan) {
          const withoutPending = {
            ...storeRef.current,
            outbox: storeRef.current.outbox.filter(
              (mutation) => mutation.clientRef !== clientRef,
            ),
          };
          updateStore(upsertPlanLocal(withoutPending, serverToLocal(serverPlan), false));
        }
        return;
      }

      const latest = await listPlans({ year: plan.year, sem: plan.sem });
      const serverPlan = latest.find((item) => item.id === plan.serverId);
      if (!serverPlan) return;
      const next = {
        ...storeRef.current,
        plans: {
          ...storeRef.current.plans,
          [clientRef]: { ...plan, revision: serverPlan.revision, syncState: "idle" as const },
        },
      };
      updateStore(next);
      queuePlanSync(clientRef);
    },
    [queuePlanSync, updateStore],
  );

  const activePlan = useMemo(() => {
    const term = `${Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026)}:${Number(
      process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1,
    )}`;
    const activeRef =
      store.activePlanByTerm[term] ?? Object.values(store.plans)[0]?.clientRef;
    return activeRef ? store.plans[activeRef] : undefined;
  }, [store]);

  const syncState = useMemo(() => {
    if (!hydrated) return "idle" as const;
    if (Object.values(store.plans).some((plan) => plan.syncState === "conflict")) {
      return "conflict" as const;
    }
    if (Object.values(store.plans).some((plan) => plan.syncState === "error")) {
      return "error" as const;
    }
    if (store.outbox.length > 0) return "saving" as const;
    return "idle" as const;
  }, [hydrated, store]);

  const value = useMemo<PlannerContextValue>(
    () => ({
      store,
      activePlan,
      syncState,
      addSection,
      replaceSection,
      removeSection,
      createPlan,
      renamePlan,
      deletePlan,
      setActivePlan,
      resolveConflict,
    }),
    [
      activePlan,
      addSection,
      createPlan,
      deletePlan,
      removeSection,
      renamePlan,
      replaceSection,
      resolveConflict,
      setActivePlan,
      store,
      syncState,
    ],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
};

export const useTimetablePlanner = () => {
  const context = useContext(PlannerContext);
  if (!context) {
    throw new Error("useTimetablePlanner must be used within TimetablePlannerProvider");
  }
  return context;
};
