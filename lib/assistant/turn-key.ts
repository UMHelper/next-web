import { createHash } from "node:crypto";

import type { RunMessage } from "@/lib/assistant/conversation";
import { hashUserId } from "@/lib/user-hash";

export type TurnIdentity = {
  userHash: string;
  threadHash: string;
  turnKey: string;
  isContinuation: boolean;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

function turnContentKey(turn: RunMessage | undefined, messages: RunMessage[]): string {
  if (turn) return JSON.stringify(turn.content ?? "");
  return JSON.stringify(messages.map((message) => message.content ?? ""));
}

/**
 * Identifies one logical user turn so retries and frontend-tool continuations
 * reuse a single quota charge. Raw ids and prompt text never leave this function.
 */
export function deriveTurnIdentity(input: {
  userId: string;
  threadId: string | undefined;
  messages: RunMessage[];
}): TurnIdentity {
  const turn = [...input.messages].reverse().find((message) => message.role === "user");
  const contentKey = digest(turnContentKey(turn, input.messages));
  const messageKey =
    typeof turn?.id === "string" && turn.id.length > 0
      ? turn.id
      : turn
        ? "no-id"
        : "no-user";
  const threadId = input.threadId ?? "no-thread";
  const userHash = hashUserId(input.userId);

  return {
    userHash,
    threadHash: digest(threadId),
    turnKey: digest(`${userHash}\0${threadId}\0${messageKey}\0${contentKey}`),
    isContinuation: input.messages.at(-1)?.role === "tool",
  };
}
