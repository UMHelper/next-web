import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider";

const FIRST_OUTPUT_PARTS = new Set<LanguageModelV3StreamPart["type"]>([
  "text-delta",
  "reasoning-delta",
  "tool-input-start",
  "tool-call",
]);

/**
 * Logs one line per model step: latency, token usage, finish reason and tool names.
 * Prompt text, reply text and tool arguments never reach the log.
 */
export function withStepMetrics<M extends LanguageModelV3>(model: M): M {
  const doStream: LanguageModelV3["doStream"] = async (options) => {
    const started = Date.now();
    let result: Awaited<ReturnType<LanguageModelV3["doStream"]>>;
    try {
      result = await model.doStream(options);
    } catch (error) {
      console.warn(
        "[assistant] step failed",
        JSON.stringify({ ms: Date.now() - started, error: error instanceof Error ? error.name : "unknown" }),
      );
      throw error;
    }

    let firstChunkMs: number | undefined;
    const tools: string[] = [];
    const stream = result.stream.pipeThrough(
      new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform(part, controller) {
          if (firstChunkMs === undefined && FIRST_OUTPUT_PARTS.has(part.type)) firstChunkMs = Date.now() - started;
          if (part.type === "tool-call") tools.push(part.toolName);
          if (part.type === "finish") {
            console.log(
              "[assistant] step",
              JSON.stringify({
                ms: Date.now() - started,
                firstChunkMs,
                inputTokens: part.usage.inputTokens.total,
                cachedInputTokens: part.usage.inputTokens.cacheRead,
                outputTokens: part.usage.outputTokens.total,
                reasoningTokens: part.usage.outputTokens.reasoning,
                finish: part.finishReason.unified,
                tools,
              }),
            );
          }
          controller.enqueue(part);
        },
      }),
    );
    return { ...result, stream };
  };

  return new Proxy(model, {
    get: (target, property) => (property === "doStream" ? doStream : Reflect.get(target, property)),
  });
}
