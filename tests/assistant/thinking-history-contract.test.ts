import type { Message } from "@ag-ui/client";
import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 8, text: 3, reasoning: 5 },
};

const reasoningThenText: LanguageModelV3StreamPart[] = [
  { type: "stream-start", warnings: [] },
  { type: "reasoning-start", id: "r" },
  { type: "reasoning-delta", id: "r", delta: "PRIVATE-CHAIN" },
  { type: "reasoning-end", id: "r" },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "Answer." },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
];

const NAVIGATE = { name: "navigate", description: "Open a page", parameters: { type: "object", properties: {} } };

function recordingModel(prompts: LanguageModelV3Prompt[]) {
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      prompts.push(prompt);
      return { stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: reasoningThenText }) };
    },
  });
}

describe("CopilotKit BuiltInAgent and thinking-mode history", () => {
  it("streams the model's reasoning to the client as a reasoning message", async () => {
    const agent = new BuiltInAgent({ model: recordingModel([]), prompt: "p", maxSteps: 1 });
    agent.setMessages([{ id: "u1", role: "user", content: "Hello" }] as Message[]);

    const { newMessages } = await agent.runAgent({ runId: "run-1", tools: [NAVIGATE], context: [] });

    expect(newMessages.filter((message) => message.role === "reasoning")).toEqual([
      expect.objectContaining({ role: "reasoning", content: "PRIVATE-CHAIN" }),
    ]);
  });

  it("drops reasoning messages from the history it gives the model", async () => {
    const prompts: LanguageModelV3Prompt[] = [];
    const agent = new BuiltInAgent({ model: recordingModel(prompts), prompt: "p", maxSteps: 1 });
    agent.setMessages([
      { id: "u1", role: "user", content: "Show me CISC3014" },
      { id: "r1", role: "reasoning", content: "Earlier plan." },
      {
        id: "a1",
        role: "assistant",
        toolCalls: [
          { id: "c1", type: "function", function: { name: "navigate", arguments: '{"destination":"course","code":"CISC3014"}' } },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "c1", content: '{"status":"navigated"}' },
    ] as Message[]);

    await agent.runAgent({ runId: "run-2", tools: [NAVIGATE], context: [] });

    const assistant = prompts[0].find((message) => message.role === "assistant");
    const content = assistant?.content;
    expect(Array.isArray(content) ? content.map((part) => part.type) : content).toEqual(["tool-call"]);
    expect(JSON.stringify(prompts[0])).not.toContain("Earlier plan.");
  });
});
