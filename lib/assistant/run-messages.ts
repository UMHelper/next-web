import {
  MAX_RUN_BODY_BYTES,
  shapeConversation,
  type RunMessage,
} from "@/lib/assistant/conversation";

export { MAX_RUN_BODY_BYTES };

/** Must match `AGENT_HISTORY_TURNS` default in lib/assistant/config.ts */
export const DEFAULT_HISTORY_TURNS = 8;

/** Accept full client thread on the wire; model input is capped after prepareRunMessages. */
export const MAX_RUN_WIRE_BYTES = 512 * 1024;

function squeezeToolResult(content: unknown): unknown {
  if (typeof content !== "string") return content;
  const oneLine = content.replace(/\s+/g, " ").trim();
  const OLD_TOOL_RESULT_CHARS = 200;
  return oneLine.length <= OLD_TOOL_RESULT_CHARS
    ? oneLine
    : `${oneLine.slice(0, OLD_TOOL_RESULT_CHARS)}…`;
}

function squeezeCurrentTurnTools(messages: RunMessage[]): RunMessage[] {
  const lastToolIndex = messages.map((message) => message.role).lastIndexOf("tool");
  if (lastToolIndex < 0) return messages;

  return messages.map((message, index) =>
    message.role === "tool" && index !== lastToolIndex
      ? { ...message, content: squeezeToolResult(message.content) }
      : message,
  );
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function estimateToolResultBytes(messages: RunMessage[]): number {
  return messages.reduce((sum, message) => {
    if (message.role !== "tool") return sum;
    const content = message.content;
    if (typeof content === "string") return sum + utf8Bytes(content);
    if (content === undefined) return sum;
    return sum + utf8Bytes(JSON.stringify(content));
  }, 0);
}

export function prepareRunMessages(messages: RunMessage[], historyTurns: number): RunMessage[] {
  let prepared = shapeConversation(messages, historyTurns);
  const shell = (body: RunMessage[]) => utf8Bytes(JSON.stringify({ messages: body }));

  if (shell(prepared) <= MAX_RUN_BODY_BYTES) {
    return prepared;
  }

  prepared = squeezeCurrentTurnTools(prepared);
  if (shell(prepared) <= MAX_RUN_BODY_BYTES) {
    return prepared;
  }

  const lastToolIndex = prepared.map((message) => message.role).lastIndexOf("tool");
  if (lastToolIndex >= 0) {
    prepared = prepared.map((message, index) =>
      message.role === "tool" && index === lastToolIndex
        ? { ...message, content: squeezeToolResult(message.content) }
        : message,
    );
  }

  return prepared;
}

export function runPayloadBytes(messages: RunMessage[], extra: Record<string, unknown> = {}): number {
  return utf8Bytes(JSON.stringify({ ...extra, messages }));
}
