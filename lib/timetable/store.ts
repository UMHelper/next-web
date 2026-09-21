import type { PlanSection, TimetablePlanPayload } from "./schema";

export type SyncState =
  | "idle"
  | "saving"
  | "offline"
  | "error"
  | "conflict";

export type LocalPlan = {
  clientRef: string;
  serverId?: number;
  name: string;
  year: number;
  sem: number;
  payload: TimetablePlanPayload;
  revision: number;
  updatedAt?: string;
  syncState: SyncState;
};

export type Mutation = {
  id: string;
  type: "create_plan" | "update_plan" | "delete_plan";
  clientRef: string;
  baseRevision: number;
  payload?: TimetablePlanPayload;
  name?: string;
  createdAt: number;
  attempts: number;
};

export type TimetableStore = {
  schemaVersion: 1;
  plans: Record<string, LocalPlan>;
  activePlanByTerm: Record<string, string>;
  outbox: Mutation[];
  importedLegacyCart?: true;
};

export const termKey = (year: number, sem: number) => `${year}:${sem}`;

export const createEmptyStore = (): TimetableStore => ({
  schemaVersion: 1,
  plans: {},
  activePlanByTerm: {},
  outbox: [],
});

const mutationId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mutation-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const upsertPlanLocal = (
  store: TimetableStore,
  plan: LocalPlan,
  makeActive = true,
): TimetableStore => {
  const next: TimetableStore = {
    ...store,
    plans: { ...store.plans, [plan.clientRef]: plan },
    outbox: store.outbox,
  };

  if (makeActive) {
    next.activePlanByTerm = {
      ...store.activePlanByTerm,
      [termKey(plan.year, plan.sem)]: plan.clientRef,
    };
  }

  return next;
};

export const removePlanLocal = (
  store: TimetableStore,
  clientRef: string,
): TimetableStore => {
  const plans = { ...store.plans };
  delete plans[clientRef];

  const activePlanByTerm = { ...store.activePlanByTerm };
  for (const [term, activeRef] of Object.entries(activePlanByTerm)) {
    if (activeRef === clientRef) delete activePlanByTerm[term];
  }

  return {
    ...store,
    plans,
    activePlanByTerm,
    outbox: store.outbox.filter((mutation) => mutation.clientRef !== clientRef),
  };
};

export const applyAddSection = (
  store: TimetableStore,
  clientRef: string,
  section: PlanSection,
):
  | { store: TimetableStore; error?: undefined }
  | { store: TimetableStore; error: "missing" | "duplicate" | "same-course" } => {
  const plan = store.plans[clientRef];
  if (!plan) return { store, error: "missing" };
  if (plan.payload.sections.some((item) => item.key === section.key)) {
    return { store, error: "duplicate" };
  }
  if (
    plan.payload.sections.some(
      (item) => item.courseCode === section.courseCode,
    )
  ) {
    return { store, error: "same-course" };
  }

  return {
    store: upsertPlanLocal(
      store,
      {
        ...plan,
        payload: {
          ...plan.payload,
          sections: [...plan.payload.sections, section],
        },
        syncState: "idle",
      },
      false,
    ),
  };
};

export const applyRemoveSection = (
  store: TimetableStore,
  clientRef: string,
  key: string,
): TimetableStore => {
  const plan = store.plans[clientRef];
  if (!plan) return store;

  return upsertPlanLocal(
    store,
    {
      ...plan,
      payload: {
        ...plan.payload,
        sections: plan.payload.sections.filter((section) => section.key !== key),
      },
      syncState: "idle",
    },
    false,
  );
};

export const applyReplaceSection = (
  store: TimetableStore,
  clientRef: string,
  oldKey: string,
  section: PlanSection,
): TimetableStore => {
  const plan = store.plans[clientRef];
  if (!plan) return store;

  const withoutSameCourse = plan.payload.sections.filter(
    (item) => item.courseCode !== section.courseCode && item.key !== oldKey,
  );

  return upsertPlanLocal(
    store,
    {
      ...plan,
      payload: {
        ...plan.payload,
        sections: [...withoutSameCourse, section],
      },
      syncState: "idle",
    },
    false,
  );
};

export const queueMutation = (
  store: TimetableStore,
  mutation: Omit<Mutation, "id" | "createdAt" | "attempts">,
): TimetableStore => ({
  ...store,
  outbox: [
    ...store.outbox,
    {
      ...mutation,
      id: mutationId(),
      createdAt: Date.now(),
      attempts: 0,
    },
  ],
});

export const coalesceOutbox = (
  store: TimetableStore,
  mutation: Omit<Mutation, "id" | "createdAt" | "attempts">,
): TimetableStore => {
  const withoutPendingUpdates = store.outbox.filter(
    (item) =>
      !(
        item.clientRef === mutation.clientRef &&
        item.type === "update_plan" &&
        mutation.type === "update_plan"
      ),
  );

  return queueMutation({ ...store, outbox: withoutPendingUpdates }, mutation);
};
