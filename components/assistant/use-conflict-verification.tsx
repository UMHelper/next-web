"use client";

import { useAgent, useAgentContext } from "@copilotkit/react-core/v2";
import { useMemo } from "react";

import {
  CONFLICT_VERIFICATION_CONTEXT_DESCRIPTION,
  summarizeConflictVerifications,
} from "@/lib/assistant/conflict-verification";
import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import { timetableVersion } from "@/lib/timetable/analysis";

export function useConflictVerification(): void {
  const { agent } = useAgent();
  const { activePlan } = useTimetablePlanner();

  const currentVersion = useMemo(
    () => (activePlan ? timetableVersion(activePlan.payload.sections) : null),
    [activePlan],
  );

  const value = useMemo(
    () => summarizeConflictVerifications(agent?.messages ?? [], currentVersion),
    [agent?.messages, currentVersion],
  );

  useAgentContext({ description: CONFLICT_VERIFICATION_CONTEXT_DESCRIPTION, value });
}
