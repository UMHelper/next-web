import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider";

import { recordStepUsage, recordStreamError, type RunTelemetry } from "@/lib/assistant/telemetry";

const FIRST_OUTPUT_PARTS = new Set<LanguageModelV3StreamPart["type"]>([
  "text-delta",
  "reasoning-delta",
  "tool-input-start",
  "tool-call",
]);

/**
 * Logs one line per model step: latency, token usage, finish reason and tool names.
 * Prompt text, reply text and tool arguments never reach the log or telemetry.
 */
export function withStepMetrics<M extends LanguageModelV3>(model: M, telemetry?: RunTelemetry): M {
  const doStream: LanguageModelV3["doStream"] = async (options) => {
    const started = Date.now();
    let result: Awaited<ReturnType<LanguageModelV3["doStream"]>>;
    try {
      result = await model.doStream(options);
    } catch (error) {
      if (telemetry) recordStreamError(telemetry, error);
      console.warn(
        "[assistant] step failed",
        JSON.stringify({ ms: Date.now() - started, error: error instanceof Error ? error.name : "unknown" }),
      );
      throw error;
    }

    let firstChunkMs: number | undefined;
    const stepTools: string[] = [];
    const reader = result.stream.getReader();
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          if (firstChunkMs === undefined && FIRST_OUTPUT_PARTS.has(value.type)) {
            firstChunkMs = Date.now() - started;
          }
          if (value.type === "tool-call") stepTools.push(value.toolName);
          if (value.type === "finish") {
            if (telemetry) {
              recordStepUsage(telemetry, {
                inputTokens: value.usage.inputTokens.total,
                cachedInputTokens: value.usage.inputTokens.cacheRead,
                outputTokens: value.usage.outputTokens.total,
                reasoningTokens: value.usage.outputTokens.reasoning,
                finish: value.finishReason.unified,
                toolCalls: stepTools.length,
              });
            }
            console.log(
              "[assistant] step",
              JSON.stringify({
                ms: Date.now() - started,
                firstChunkMs,
                inputTokens: value.usage.inputTokens.total,
                cachedInputTokens: value.usage.inputTokens.cacheRead,
                outputTokens: value.usage.outputTokens.total,
                reasoningTokens: value.usage.outputTokens.reasoning,
                finish: value.finishReason.unified,
                tools: stepTools,
              }),
            );
          }
          controller.enqueue(value);
        } catch (error) {
          if (telemetry) recordStreamError(telemetry, error);
          controller.error(error);
        }
      },
      cancel(reason) {
        if (telemetry) telemetry.aborted = true;
        return reader.cancel(reason);
      },
    });

    return { ...result, stream };
  };

  return new Proxy(model, {
    get: (target, property) => (property === "doStream" ? doStream : Reflect.get(target, property)),
  });
}
