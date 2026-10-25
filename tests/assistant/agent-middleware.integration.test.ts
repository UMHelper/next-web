import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const textId = "text-1";

const { recordPrompt, createMockModel } = vi.hoisted(() => {
  let recorder: (prompt: LanguageModelV3Prompt) => void = () => undefined;
  const recordPrompt = (fn: (prompt: LanguageModelV3Prompt) => void) => {
    recorder = fn;
  };
  const createMockModel = () =>
    new MockLanguageModelV3({
      doStream: async (options) => {
        recorder(options.prompt);
        return {
          stream: simulateReadableStream({
            initialDelayInMs: null,
            chunkDelayInMs: null,
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: textId },
            { type: "text-delta", id: textId, delta: "ok" },
            { type: "text-end", id: textId },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
              },
            },
          ] satisfies LanguageModelV3StreamPart[],
          }),
        };
      },
    });
  return { recordPrompt, createMockModel };
});

vi.mock("@/lib/assistant/tools", () => ({ createAssistantTools: () => [] }));
vi.mock("@/lib/assistant/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/model")>()),
  createAssistantModel: () => createMockModel(),
}));

import { createAssistantAgent } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";

function systemPromptText(prompt: LanguageModelV3Prompt): string {
  return prompt
    .filter((message): message is { role: "system"; content: string } => message.role === "system")
    .map((message) => message.content)
    .join("\n");
}

describe("createAssistantAgent middleware (integration)", () => {
  beforeEach(() => {
    recordPrompt(() => undefined);
  });

  it("appends the script hint to the system prompt on a cloned agent", async () => {
    let recorded = "";
    recordPrompt((prompt) => {
      recorded = systemPromptText(prompt);
    });

    const agent = createAssistantAgent(readAssistantConfig({ AI_API_KEY: "sk-test" })).clone();
    agent.addMessage({ id: "u1", role: "user", content: "ACCT1000 难不难？" });

    await agent.runAgent({ runId: "r1" });

    expect(recorded).toContain("Script of the student's latest message:");
    expect(recorded).toContain("Simplified Chinese");
  });

  it("omits the script hint when the latest message has no distinctive script", async () => {
    let recorded = "";
    recordPrompt((prompt) => {
      recorded = systemPromptText(prompt);
    });

    const agent = createAssistantAgent(readAssistantConfig({ AI_API_KEY: "sk-test" })).clone();
    agent.addMessage({ id: "u1", role: "user", content: "ACCT1000" });

    await agent.runAgent({ runId: "r2" });

    expect(recorded).not.toContain("Script of the student's latest message:");
  });
});
