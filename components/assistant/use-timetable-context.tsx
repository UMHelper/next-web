"use client";

import { useAgent, useAgentContext } from "@copilotkit/react-core/v2";
import { useMemo } from "react";

import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import {
  TIMETABLE_CONTEXT_DESCRIPTION,
  buildTimetableContextPayload,
  serializeTimetableContext,
} from "@/lib/assistant/timetable-context";
import {
  TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION,
  summarizeTimetablePreviews,
} from "@/lib/assistant/timetable-previews";
import { timetableVersion } from "@/lib/timetable/analysis";
import { plannerCurrentTerm } from "@/lib/timetable/current-term";

export function useTimetableContext() {
  const { agent } = useAgent();
  const { activePlan, store, loadState, serverLoad } = useTimetablePlanner();
  const value = useMemo(
    () =>
      serializeTimetableContext(
        buildTimetableContextPayload({ store, activePlan, loadState, serverLoad }, plannerCurrentTerm()),
      ),
    [activePlan, store.plans, loadState, serverLoad],
  );

  const currentVersion = useMemo(
    () => (activePlan ? timetableVersion(activePlan.payload.sections) : null),
    [activePlan],
  );

  const previewsValue = useMemo(
    () => summarizeTimetablePreviews(agent?.messages ?? [], currentVersion),
    [agent?.messages, currentVersion],
  );

  useAgentContext({ description: TIMETABLE_CONTEXT_DESCRIPTION, value });
  useAgentContext({ description: TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION, value: previewsValue });
}
