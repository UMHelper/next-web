import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { convertReadableStreamToArray } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readAssistantConfig, type ThinkingMode } from "@/lib/assistant/config";
import { createAssistantModel, thinkingProviderOptions } from "@/lib/assistant/model";

type Body = Record<string, unknown> & { messages: Array<Record<string, unknown>> };

const SSE =
  [
    {
      id: "r",
      created: 1,
      model: "deepseek-flash",
      choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "Student wants the page." } }],
    },
    {
      id: "r",
      created: 1,
      model: "deepseek-flash",
      choices: [{ index: 0, delta: { content: "Done." }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 30,
        prompt_cache_hit_tokens: 80,
        completion_tokens_details: { reasoning_tokens: 20 },
      },
    },
  ]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("") + "data: [DONE]\n\n";

const NAVIGATE_TOOL = {
  type: "function" as const,
  name: "navigate",
  description: "Open a page",
  inputSchema: { type: "object" as const, properties: { destination: { type: "string" as const } } },
};

// What a follow-up run after a frontend navigate call looks like to the model.
function continuationPrompt(reasoningInHistory: boolean): LanguageModelV3Prompt {
  return [
    { role: "system", content: "prompt" },
    { role: "user", content: [{ type: "text", text: "Show me CISC3014" }] },
    {
      role: "assistant",
      content: [
        ...(reasoningInHistory ? [{ type: "reasoning" as const, text: "Earlier plan." }] : []),
        { type: "tool-call", toolCallId: "c1", toolName: "navigate", input: { destination: "course", code: "CISC3014" } },
      ],
    },
    {
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: "c1", toolName: "navigate", output: { type: "json", value: { status: "navigated" } } },
      ],
    },
  ];
}

const bodies: Body[] = [];

afterEach(() => {
  bodies.length = 0;
  vi.unstubAllGlobals();
});

async function send(thinking: ThinkingMode, prompt: LanguageModelV3Prompt, maxOutputTokens = 1200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Body);
      return new Response(SSE, { headers: { "content-type": "text/event-stream" } });
    }),
  );
  const model = createAssistantModel(readAssistantConfig({ AI_API_KEY: "sk-test", AI_THINKING: thinking }));
  const { stream } = await model.doStream({
    prompt,
    maxOutputTokens,
    tools: [NAVIGATE_TOOL],
    providerOptions: thinkingProviderOptions(thinking),
  });
  return convertReadableStreamToArray(stream);
}

describe("DeepSeek request translation", () => {
  it("sends thinking enabled, low effort and the step budget as max_tokens for low", async () => {
    await send("low", continuationPrompt(false));
    expect(bodies[0]).toMatchObject({
      model: "deepseek-flash",
      stream: true,
      max_tokens: 1200,
      thinking: { type: "enabled" },
      reasoning_effort: "low",
    });
  });

  it("sends thinking disabled and no effort for off", async () => {
    await send("off", continuationPrompt(false), 400);
    expect(bodies[0]).toMatchObject({ max_tokens: 400, thinking: { type: "disabled" } });
    expect(bodies[0]).not.toHaveProperty("reasoning_effort");
  });

  it("sends an empty reasoning_content when the history has no reasoning, which is what CopilotKit gives a follow-up run", async () => {
    await send("low", continuationPrompt(false));
    const assistant = bodies[0].messages.find((message) => message.role === "assistant");
    expect(assistant).toMatchObject({ reasoning_content: "", tool_calls: [expect.objectContaining({ id: "c1" })] });
  });

  it("passes reasoning back when the history carries it", async () => {
    await send("low", continuationPrompt(true));
    const assistant = bodies[0].messages.find((message) => message.role === "assistant");
    expect(assistant).toMatchObject({ reasoning_content: "Earlier plan." });
  });
});

describe("DeepSeek usage translation", () => {
  it("reports reasoning tokens apart from visible tokens and streams reasoning as its own parts", async () => {
    const parts = await send("low", continuationPrompt(false));
    const finish = parts.find((part): part is Extract<LanguageModelV3StreamPart, { type: "finish" }> => part.type === "finish");
    expect(finish?.usage.outputTokens).toEqual({ total: 30, text: 10, reasoning: 20 });
    expect(parts.some((part) => part.type === "reasoning-delta")).toBe(true);
  });
});
