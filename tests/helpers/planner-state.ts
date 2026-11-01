import type { PlannerReadState } from "@/lib/assistant/timetable-context";
import { FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";
import { createEmptyStore, upsertPlanLocal, type LocalPlan } from "@/lib/timetable/store";

export function plannerState(
  plan?: Partial<LocalPlan>,
  overrides?: Partial<PlannerReadState>,
): PlannerReadState {
  const basePlan = plan
    ? ({
        ...FIXTURE_PLAN,
        ...plan,
        payload: plan.payload ?? FIXTURE_PLAN.payload,
      } as LocalPlan)
    : undefined;

  const store = basePlan
    ? upsertPlanLocal(createEmptyStore(), basePlan, true)
    : createEmptyStore();

  return {
    store,
    activePlan: basePlan,
    loadState: "ready",
    serverLoad: "ok",
    ...overrides,
  };
}
