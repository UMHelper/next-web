import { describe, expect, it } from "vitest";

import { deriveTurnIdentity } from "@/lib/assistant/turn-key";

const user = { id: "u1", role: "user", content: "question" };
const assistant = { id: "a1", role: "assistant", content: "answer" };
const tool = { id: "t1", role: "tool", toolCallId: "c1", content: "{}" };

describe("deriveTurnIdentity", () => {
  it("is stable across retries and continuations", () => {
    const first = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user] });
    const retry = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user] });
    const continuation = deriveTurnIdentity({
      userId: "user_1",
      threadId: "t1",
      messages: [user, assistant, tool],
    });

    expect(retry.turnKey).toBe(first.turnKey);
    expect(continuation.turnKey).toBe(first.turnKey);
    expect(continuation.isContinuation).toBe(true);
    expect(first.isContinuation).toBe(false);
  });

  it("changes for a new user message or thread", () => {
    const base = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user] });
    const next = deriveTurnIdentity({
      userId: "user_1",
      threadId: "t1",
      messages: [user, { id: "u2", role: "user", content: "next" }],
    });
    const otherThread = deriveTurnIdentity({ userId: "user_1", threadId: "t2", messages: [user] });

    expect(next.turnKey).not.toBe(base.turnKey);
    expect(otherThread.turnKey).not.toBe(base.turnKey);
  });

  it("never exposes raw ids or content", () => {
    const identity = deriveTurnIdentity({
      userId: "user_1",
      threadId: "thread-secret",
      messages: [user],
    });
    const serialized = JSON.stringify(identity);

    expect(serialized).not.toContain("user_1");
    expect(serialized).not.toContain("thread-secret");
    expect(serialized).not.toContain("question");
  });

  it("falls back to a content fingerprint when the message id is missing", () => {
    const a = deriveTurnIdentity({
      userId: "user_1",
      threadId: "t1",
      messages: [{ role: "user", content: "same" }],
    });
    const b = deriveTurnIdentity({
      userId: "user_1",
      threadId: "t1",
      messages: [{ role: "user", content: "same" }],
    });
    const c = deriveTurnIdentity({
      userId: "user_1",
      threadId: "t1",
      messages: [{ role: "user", content: "different" }],
    });

    expect(a.turnKey).toBe(b.turnKey);
    expect(a.turnKey).not.toBe(c.turnKey);
  });

  it("uses a no-user sentinel when the run has no user message", () => {
    const identity = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [tool] });

    expect(identity.isContinuation).toBe(true);
    expect(identity.turnKey).toHaveLength(32);
  });
});
