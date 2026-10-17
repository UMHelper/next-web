import { createDeepSeek } from "@ai-sdk/deepseek";

import type { AssistantConfig, ThinkingMode } from "./config";

/** The timeout covers the whole streamed response, not just the headers. */
export function withTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal,
): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const abort = (reason: unknown) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    setTimeout(() => abort(new DOMException("Model request timed out", "TimeoutError")), timeoutMs);
    for (const source of [signal, init?.signal ?? undefined]) {
      if (!source) continue;
      if (source.aborted) abort(source.reason);
      else source.addEventListener("abort", () => abort(source.reason), { once: true });
    }
    return fetchImpl(input, { ...init, signal: controller.signal });
  };
}

export function thinkingProviderOptions(mode: ThinkingMode) {
  if (mode === "low") {
    return { deepseek: { thinking: { type: "enabled" as const }, reasoningEffort: "low" as const } };
  }
  return { deepseek: { thinking: { type: "disabled" as const } } };
}

export function createAssistantModel(config: AssistantConfig, signal?: AbortSignal) {
  if (!config.apiKey) throw new Error("AI_API_KEY is not configured");
  const deepseek = createDeepSeek({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    fetch: withTimeout(fetch, config.timeoutMs, signal),
  });
  return deepseek(config.model);
}
