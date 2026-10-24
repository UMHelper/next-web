"use client";

import { useAgent, useAgentContext } from "@copilotkit/react-core/v2";
import { useMemo } from "react";

import {
  DISCUSSED_COURSES_CONTEXT_DESCRIPTION,
  summarizeDiscussedCourses,
} from "@/lib/assistant/discussed-courses";

export function useDiscussedCourses(): void {
  const { agent } = useAgent();

  const contextValue = useMemo(
    () => summarizeDiscussedCourses(agent?.messages ?? []),
    [agent?.messages],
  );

  useAgentContext({ description: DISCUSSED_COURSES_CONTEXT_DESCRIPTION, value: contextValue });
}
