import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, convertReadableStreamToArray, simulateReadableStream } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withStepMetrics } from "@/lib/assistant/metrics";

const usage = {
  inputTokens: { total: 1200, noCache: 200, cacheRead: 1000, cacheWrite: undefined },
  outputTokens: { total: 90, text: 90, reasoning: undefined },
};

const toolStep: LanguageModelV3StreamPart[] = [
  { type: "stream-start", warnings: [] },
  { type: "tool-input-start", id: "c1", toolName: "get_course" },
  { type: "tool-input-end", id: "c1" },
  { type: "tool-call", toolCallId: "c1", toolName: "get_course", input: '{"code":"SECRET9999"}' },
  { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
];

const textStep: LanguageModelV3StreamPart[] = [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Private reply text" },
  { type: "text-end", id: "t1" },
  { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
];

const modelStreaming = (chunks: LanguageModelV3StreamPart[]) =>
  new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks }),
    }),
  });

const callOptions = {
  prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "my private question" }] }],
};

const stepLogs = (log: ReturnType<typeof vi.spyOn>) =>
  log.mock.calls.filter(([label]) => label === "[assistant] step").map(([, json]) => JSON.parse(json as string));

describe("withStepMetrics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes every stream part through unchanged", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const model = withStepMetrics(modelStreaming(textStep));

    const { stream } = await model.doStream(callOptions);

    expect(await convertReadableStreamToArray(stream)).toEqual(textStep);
  });

  it("logs latency, token usage, finish reason and tool names for each step", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const model = withStepMetrics(modelStreaming(toolStep));

    await convertReadableStreamToArray((await model.doStream(callOptions)).stream);

    const [step] = stepLogs(log);
    expect(step).toEqual({
      ms: expect.any(Number),
      firstChunkMs: expect.any(Number),
      inputTokens: 1200,
      cachedInputTokens: 1000,
      outputTokens: 90,
      finish: "tool-calls",
      tools: ["get_course"],
    });
  });

  it("logs reasoning tokens separately when the provider reports them", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const thinkingUsage = { ...usage, outputTokens: { total: 90, text: 30, reasoning: 60 } };
    const chunks = textStep.map((part) => (part.type === "finish" ? { ...part, usage: thinkingUsage } : part));

    await convertReadableStreamToArray((await withStepMetrics(modelStreaming(chunks)).doStream(callOptions)).stream);

    expect(stepLogs(log)[0]).toMatchObject({ outputTokens: 90, reasoningTokens: 60 });
  });

  it("never logs prompt text, reply text or tool arguments", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    for (const chunks of [toolStep, textStep]) {
      await convertReadableStreamToArray((await withStepMetrics(modelStreaming(chunks)).doStream(callOptions)).stream);
    }

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("SECRET9999");
    expect(logged).not.toContain("Private reply text");
    expect(logged).not.toContain("my private question");
  });

  it("logs a failed step with only the error name and rethrows", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("upstream said: my private question"), { name: "APICallError" });
    const model = withStepMetrics(
      new MockLanguageModelV3({
        doStream: async () => {
          throw failure;
        },
      }),
    );

    await expect(model.doStream(callOptions)).rejects.toBe(failure);

    expect(warn).toHaveBeenCalledWith("[assistant] step failed", expect.any(String));
    const [, json] = warn.mock.calls[0];
    expect(JSON.parse(json as string)).toEqual({ ms: expect.any(Number), error: "APICallError" });
  });

  it("keeps the wrapped model's identity", () => {
    const inner = modelStreaming(textStep);
    const model = withStepMetrics(inner);

    expect(model.modelId).toBe(inner.modelId);
    expect(model.provider).toBe(inner.provider);
    expect(model.specificationVersion).toBe("v3");
  });
});
