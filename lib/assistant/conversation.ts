import { z } from "zod";

export const MAX_RUN_BODY_BYTES = 256 * 1024;
export const MAX_RUN_MESSAGES = 200;
const OLD_TOOL_RESULT_CHARS = 200;
const BLOCKED_ROLES = new Set(["system", "developer"]);

const runMessageSchema = z
  .object({ role: z.string(), content: z.unknown().optional() })
  .passthrough();

export const runInputSchema = z
  .object({ messages: z.array(runMessageSchema).max(MAX_RUN_MESSAGES) })
  .passthrough();

export type RunMessage = z.infer<typeof runMessageSchema>;
export type RunInput = z.infer<typeof runInputSchema>;

export function countUserTurns(messages: RunMessage[]): number {
  return messages.filter((message) => message.role === "user").length;
}

function squeezeToolResult(content: unknown): unknown {
  if (typeof content !== "string") return content;
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= OLD_TOOL_RESULT_CHARS
    ? oneLine
    : `${oneLine.slice(0, OLD_TOOL_RESULT_CHARS)}…`;
}

/**
 * Keeps the current turn plus the last `historyTurns` turns. A turn starts at a
 * user message, so cutting there never separates a tool call from its result.
 */
export function shapeConversation(messages: RunMessage[], historyTurns: number): RunMessage[] {
  const visible = messages.filter((message) => !BLOCKED_ROLES.has(message.role));
  const userIndexes = visible.flatMap((message, index) => (message.role === "user" ? [index] : []));
  const keepFrom =
    userIndexes.length > historyTurns + 1
      ? userIndexes[userIndexes.length - historyTurns - 1]
      : 0;
  const window = visible.slice(keepFrom);
  const lastUser = window.map((message) => message.role).lastIndexOf("user");

  return window.map((message, index) =>
    message.role === "tool" && index < lastUser
      ? { ...message, content: squeezeToolResult(message.content) }
      : message,
  );
}
