import { describe, expect, it } from "vitest";

import { MAX_RUN_BODY_BYTES } from "@/lib/assistant/conversation";
import {
  DEFAULT_HISTORY_TURNS,
  estimateToolResultBytes,
  prepareRunMessages,
  runPayloadBytes,
} from "@/lib/assistant/run-messages";
import type { RunMessage } from "@/lib/assistant/conversation";

const largeToolJson = (turn: number) =>
  JSON.stringify({
    type: "course",
    page: 1,
    totalCount: 40,
    results: Array.from({ length: 40 }, (_, index) => ({
      courseCode: `COMP${1000 + index}`,
      titleEn: `Course ${turn}-${index} `.repeat(20),
      description: "x".repeat(800),
    })),
  });

const toolHeavyTurn = (turn: number, idPrefix: string): RunMessage[] => {
  const tools = ["get_course", "get_course_sections", "check_plan_conflicts"] as const;
  const messages: RunMessage[] = [{ id: `${idPrefix}-u`, role: "user", content: `turn ${turn}` }];
  for (const [index, name] of tools.entries()) {
    const callId = `${idPrefix}-c${index}`;
    messages.push({
      id: `${idPrefix}-a${index}`,
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: callId,
          type: "function",
          function: { name, arguments: "{}" },
        },
      ],
    });
    messages.push({
      id: `${idPrefix}-t${index}`,
      role: "tool",
      toolCallId: callId,
      content: largeToolJson(turn),
    });
  }
  messages.push({ id: `${idPrefix}-a-final`, role: "assistant", content: `reply ${turn}` });
  return messages;
};

function buildThread(userTurns: number): RunMessage[] {
  return Array.from({ length: userTurns }, (_, turn) => toolHeavyTurn(turn, `t${turn}`)).flat();
}

describe("prepareRunMessages", () => {
  it("shrinks a 30-turn tool-heavy thread below the model cap while keeping the last tool result full", () => {
    const full = buildThread(30);
    const rawBytes = runPayloadBytes(full);
    expect(rawBytes).toBeGreaterThan(MAX_RUN_BODY_BYTES);

    const prepared = prepareRunMessages(full, DEFAULT_HISTORY_TURNS);
    const preparedBytes = runPayloadBytes(prepared);
    expect(preparedBytes).toBeLessThanOrEqual(MAX_RUN_BODY_BYTES);
    expect(prepared.length).toBeLessThan(full.length);

    const toolMessages = prepared.filter((message) => message.role === "tool");
    const lastTool = toolMessages.at(-1);
    expect(String(lastTool?.content).length).toBeGreaterThan(500);

    const stats = {
      rawMessages: full.length,
      preparedMessages: prepared.length,
      rawToolBytes: estimateToolResultBytes(full),
      preparedToolBytes: estimateToolResultBytes(prepared),
    };
    expect(stats.rawToolBytes).toBeGreaterThan(stats.preparedToolBytes);
  });

  it("keeps the final tool message unsqueezed on a continuation-shaped thread", () => {
    const turn = toolHeavyTurn(0, "c");
    const continuation: RunMessage[] = [
      ...turn,
      {
        id: "c-a-more",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c-c3", type: "function", function: { name: "navigate", arguments: "{}" } }],
      },
      { id: "c-t3", role: "tool", toolCallId: "c-c3", content: '{"status":"navigated"}' },
    ];
    const prepared = prepareRunMessages(continuation, DEFAULT_HISTORY_TURNS);
    const last = prepared.filter((message) => message.role === "tool").at(-1);
    expect(last?.content).toBe('{"status":"navigated"}');
  });
});
