"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { useMemo } from "react";

import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import {
  TIMETABLE_CONTEXT_DESCRIPTION,
  buildTimetableContextPayload,
  serializeTimetableContext,
} from "@/lib/assistant/timetable-context";
import { plannerCurrentTerm } from "@/lib/timetable/current-term";

export function useTimetableContext() {
  const { activePlan, store, loadState, serverLoad } = useTimetablePlanner();
  const value = useMemo(
    () =>
      serializeTimetableContext(
        buildTimetableContextPayload({ store, activePlan, loadState, serverLoad }, plannerCurrentTerm()),
      ),
    [activePlan, store.plans, loadState, serverLoad],
  );

  useAgentContext({ description: TIMETABLE_CONTEXT_DESCRIPTION, value });
}
