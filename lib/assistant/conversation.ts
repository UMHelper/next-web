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

type ToolCallLike = { id?: unknown };

/**
 * The model provider rejects an assistant tool call that has no result, and the client keeps
 * resending it, so one lost result would break the conversation for good. Unanswered calls are
 * removed, and an assistant message left with no text and no calls goes with them.
 */
function dropUnansweredToolCalls(messages: RunMessage[]): RunMessage[] {
  const answered = new Set(
    messages.flatMap((message) =>
      message.role === "tool" && typeof message.toolCallId === "string" ? [message.toolCallId] : [],
    ),
  );

  return messages.flatMap((message) => {
    const calls = message.role === "assistant" ? message.toolCalls : undefined;
    if (!Array.isArray(calls)) return [message];

    const kept = calls.filter((call: ToolCallLike) => typeof call.id === "string" && answered.has(call.id));
    if (kept.length === calls.length) return [message];
    if (kept.length === 0 && !message.content) return [];
    return [{ ...message, toolCalls: kept }];
  });
}

/**
 * Keeps the current turn plus the last `historyTurns` turns. A turn starts at a
 * user message, so cutting there never separates a tool call from its result.
 */
export function shapeConversation(messages: RunMessage[], historyTurns: number): RunMessage[] {
  const visible = dropUnansweredToolCalls(messages.filter((message) => !BLOCKED_ROLES.has(message.role)));
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
