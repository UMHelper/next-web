"use client";

import { useAgent, useAgentContext } from "@copilotkit/react-core/v2";
import { useMemo } from "react";

import {
  summarizeVisibleBlocks,
  VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
} from "@/lib/assistant/visible-blocks";

export function useVisibleBlocks(): void {
  const { agent } = useAgent();

  const contextValue = useMemo(
    () => summarizeVisibleBlocks(agent?.messages ?? []),
    [agent?.messages],
  );

  useAgentContext({ description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION, value: contextValue });
}
