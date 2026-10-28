import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, convertReadableStreamToArray, simulateReadableStream } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { update, eq, insert } = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(async () => ({ error: null })),
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: () => ({
      update: (payload: unknown) => {
        update(payload);
        return { eq };
      },
      insert: (payload: unknown) => insert(payload),
    }),
  },
}));

import { withStepMetrics } from "@/lib/assistant/metrics";
import {
  classifyRunError,
  createRunTelemetry,
  recordStreamError,
  resolveOutcome,
} from "@/lib/assistant/telemetry";
import { finalizeRunUsage, recordRejectedRun } from "@/lib/assistant/telemetry-store";
import { deriveTurnIdentity } from "@/lib/assistant/turn-key";

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

const identity = () =>
  deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [{ id: "u1", role: "user", content: "question" }] });

const telemetryFor = (maxSteps = 8) =>
  createRunTelemetry({ runKey: "run-1", identity: identity(), charged: true, maxSteps, startedAt: Date.now() - 25 });

describe("run telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sums tokens, steps and tool calls across model steps", async () => {
    const telemetry = telemetryFor();
    const model = withStepMetrics(modelStreaming(toolStep), telemetry);

    await convertReadableStreamToArray((await model.doStream(callOptions)).stream);
    await convertReadableStreamToArray((await withStepMetrics(modelStreaming(textStep), telemetry).doStream(callOptions)).stream);

    expect(telemetry).toMatchObject({
      steps: 2,
      toolCalls: 1,
      inputTokens: 2400,
      cachedInputTokens: 2000,
      outputTokens: 180,
      reasoningTokens: null,
      lastFinish: "stop",
    });

    await finalizeRunUsage(telemetry);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "completed",
        steps: 2,
        tool_calls: 1,
        input_tokens: 2400,
        cached_input_tokens: 2000,
        output_tokens: 180,
        charged: true,
        duration_ms: expect.any(Number),
      }),
    );
    expect(eq).toHaveBeenCalledWith("run_key", "run-1");
  });

  it("keeps token fields null when the provider reports no usage", async () => {
    const telemetry = telemetryFor();
    const chunks = textStep.map((part) =>
      part.type === "finish"
        ? {
            ...part,
            usage: {
              inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: undefined, text: undefined, reasoning: undefined },
            },
          }
        : part,
    );

    await convertReadableStreamToArray(
      (await withStepMetrics(modelStreaming(chunks as LanguageModelV3StreamPart[]), telemetry).doStream(callOptions)).stream,
    );

    expect(telemetry.inputTokens).toBeNull();
    expect(telemetry.outputTokens).toBeNull();
  });

  it.each([
    [{ statusCode: 402 }, "provider_balance"],
    [{ statusCode: 401 }, "provider_auth"],
    [{ statusCode: 403 }, "provider_auth"],
    [{ statusCode: 429 }, "provider_rate_limit"],
    [{ name: "TimeoutError" }, "provider_timeout"],
    [{ code: "ETIMEDOUT" }, "provider_timeout"],
  ])("classifies %o as %s", (shape, errorClass) => {
    expect(classifyRunError({ ...shape, message: "raw provider text" })).toEqual({
      outcome: "provider_error",
      errorClass,
    });
  });

  it("classifies abort separately", () => {
    expect(classifyRunError({ name: "AbortError", message: "raw" })).toEqual({
      outcome: "client_aborted",
      errorClass: "client_aborted",
    });
  });

  it("records a provider failure without persisting the provider message", async () => {
    const telemetry = telemetryFor();
    const failure = Object.assign(new Error("402 Insufficient Balance sk-live-secret"), {
      name: "APICallError",
      statusCode: 402,
    });
    const model = withStepMetrics(
      new MockLanguageModelV3({
        doStream: async () => {
          throw failure;
        },
      }),
      telemetry,
    );

    await expect(model.doStream(callOptions)).rejects.toBe(failure);
    await finalizeRunUsage(telemetry);

    const persisted = JSON.stringify([update.mock.calls, insert.mock.calls]);
    expect(persisted).not.toContain("Insufficient Balance");
    expect(persisted).not.toContain("sk-live-secret");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "provider_error", error_class: "provider_balance" }),
    );
  });

  it("treats a cancelled stream as a charged client abort", async () => {
    const telemetry = telemetryFor();
    const { stream } = await withStepMetrics(
      new MockLanguageModelV3({
        doStream: async () => ({
          stream: new ReadableStream<LanguageModelV3StreamPart>({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
            },
          }),
        }),
      }),
      telemetry,
    ).doStream(callOptions);

    const reader = stream.getReader();
    await reader.read();
    await reader.cancel("client stopped");

    expect(telemetry.aborted).toBe(true);
    await finalizeRunUsage(telemetry);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ outcome: "client_aborted" }));
  });

  it("marks a run that stops at its step budget while still calling tools", async () => {
    const telemetry = telemetryFor(2);
    const model = withStepMetrics(modelStreaming(toolStep), telemetry);

    await convertReadableStreamToArray((await model.doStream(callOptions)).stream);
    await convertReadableStreamToArray((await withStepMetrics(modelStreaming(toolStep), telemetry).doStream(callOptions)).stream);

    expect(resolveOutcome(telemetry)).toBe("execution_limit");
    await finalizeRunUsage(telemetry);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ outcome: "execution_limit" }));
  });

  it("persists a rejection without identifiers or prompt text", async () => {
    await recordRejectedRun({ runKey: "run-2", identity: identity() });

    const [payload] = insert.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(payload[0]).toMatchObject({ run_key: "run-2", outcome: "rejected", charged: false });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("user_1");
    expect(serialized).not.toContain("question");
  });

  it("writes nothing in read-only preview", async () => {
    vi.stubEnv("PREVIEW_DB_READONLY", "1");

    await finalizeRunUsage(telemetryFor());
    await recordRejectedRun({ runKey: "run-3", identity: identity() });

    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not throw when the usage write fails", async () => {
    eq.mockResolvedValueOnce({ error: { message: "db down" } } as never);

    await expect(finalizeRunUsage(telemetryFor())).resolves.toBeUndefined();
  });

  it("records a stream error into the telemetry object", () => {
    const telemetry = telemetryFor();
    recordStreamError(telemetry, Object.assign(new Error("nope"), { name: "TimeoutError" }));

    expect(telemetry.errorClass).toBe("provider_timeout");
    expect(telemetry.aborted).toBe(false);
  });
});
