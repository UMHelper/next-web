"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TimetablePlanPayload } from "@/lib/timetable/schema";

export type SharedPlan = {
  name: string;
  year: number;
  sem: number;
  revision: number;
  updatedAt: string;
  payload: TimetablePlanPayload;
};

const POLL_MS = 15_000;

export const useSharedPlan = (
  token: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const [plan, setPlan] = useState<SharedPlan | null>(null);
  const [loading, setLoading] = useState(Boolean(token && enabled));
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisionRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const query = revisionRef.current === null ? "" : `?revision=${revisionRef.current}`;
      const response = await fetch(
        `/api/timetable/shares/${encodeURIComponent(token)}${query}`,
        { credentials: "same-origin" },
      );
      if (response.status === 304) {
        setStale(false);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { plan: SharedPlan };
      revisionRef.current = body.plan.revision;
      setPlan(body.plan);
      setStale(false);
      setError(null);
    } catch (fetchError) {
      setStale(true);
      setError(fetchError instanceof Error ? fetchError.message : "Unable to update");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!enabled || !token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      await refresh();
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refresh, token]);

  return { plan, loading, stale, error, refresh };
};
