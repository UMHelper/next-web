type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** What one provider request asked for. Counts only: no prompt, reply or reasoning text. */
export type RequestAudit = {
  model: unknown;
  stream: unknown;
  maxTokens: unknown;
  thinking: unknown;
  reasoningEffort: unknown;
  toolChoice: unknown;
  tools: string[];
  messages: number;
  assistantMessages: number;
  /** Earlier assistant messages sent with their reasoning_content. */
  reasoningReplayed: number;
  /** Earlier assistant messages sent with reasoning_content "", the provider's stand-in when the history has none. */
  reasoningEmpty: number;
  /** Earlier assistant messages sent without a reasoning_content field. */
  reasoningAbsent: number;
};

export function auditRequestBody(body: unknown): RequestAudit | null {
  if (typeof body !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !Array.isArray(parsed.messages)) return null;
  const assistants = parsed.messages.filter((message): message is Json => isObject(message) && message.role === "assistant");
  const tools = Array.isArray(parsed.tools)
    ? parsed.tools.flatMap((tool) =>
        isObject(tool) && isObject(tool.function) && typeof tool.function.name === "string" ? [tool.function.name] : [],
      )
    : [];
  return {
    model: parsed.model ?? null,
    stream: parsed.stream ?? null,
    maxTokens: parsed.max_tokens ?? null,
    thinking: parsed.thinking ?? null,
    reasoningEffort: parsed.reasoning_effort ?? null,
    toolChoice: parsed.tool_choice ?? null,
    tools: tools.sort(),
    messages: parsed.messages.length,
    assistantMessages: assistants.length,
    reasoningReplayed: assistants.filter(
      (message) => typeof message.reasoning_content === "string" && message.reasoning_content !== "",
    ).length,
    reasoningEmpty: assistants.filter((message) => message.reasoning_content === "").length,
    reasoningAbsent: assistants.filter((message) => !("reasoning_content" in message)).length,
  };
}

/** Records an audit of every chat request sent through the global fetch until the returned function is called. */
export function captureRequests(into: RequestAudit[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const audit = auditRequestBody(init?.body);
    if (audit) into.push(audit);
    return original(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
