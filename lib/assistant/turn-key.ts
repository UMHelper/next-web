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
  const messageKey =
    typeof turn?.id === "string" && turn.id.length > 0
      ? turn.id
      : turn
        ? digest(JSON.stringify(turn.content ?? ""))
        : "no-user";
  const threadId = input.threadId ?? "no-thread";
  const userHash = hashUserId(input.userId);

  return {
    userHash,
    threadHash: digest(threadId),
    turnKey: digest(`${userHash}\0${threadId}\0${messageKey}`),
    isContinuation: input.messages.at(-1)?.role === "tool",
  };
}
