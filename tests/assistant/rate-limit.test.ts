import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import { AGENT_TURN_REPLAY_MS, claimAgentTurn } from "@/lib/assistant/rate-limit";
import { deriveTurnIdentity } from "@/lib/assistant/turn-key";

const user = (id = "u1") => ({ id, role: "user", content: "question" });
const assistant = { id: "a1", role: "assistant", content: "answer" };
const tool = { id: "t1", role: "tool", toolCallId: "c1", content: "{}" };
const limits = { perHour: 30, perDay: 80 };

const claim = (overrides: Partial<Parameters<typeof claimAgentTurn>[0]> = {}) =>
  claimAgentTurn({
    userId: "user_123",
    threadId: "t1",
    messages: [user()],
    runKey: "run-1",
    limits,
    ...overrides,
  });

const allow = (charged: boolean) =>
  rpc.mockResolvedValue({
    data: [{ allowed: true, charged, window_kind: null, retry_after: 0 }],
    error: null,
  });

describe("claimAgentTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("claims through the atomic RPC with hashed identifiers only", async () => {
    allow(true);

    const result = await claim();

    const identity = deriveTurnIdentity({ userId: "user_123", threadId: "t1", messages: [user()] });
    expect(result).toEqual({ allowed: true, charged: true, identity });
    expect(rpc).toHaveBeenCalledWith("claim_assistant_turn", {
      target_user_hash: identity.userHash,
      target_turn_key: identity.turnKey,
      target_thread_hash: identity.threadHash,
      target_run_key: "run-1",
      target_is_continuation: false,
      hour_limit: 30,
      day_limit: 80,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("user_123");
  });

  it("reports the hour window and retry time", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, charged: false, window_kind: "hour", retry_after: 120 }],
      error: null,
    });

    await expect(claim()).resolves.toMatchObject({
      allowed: false,
      window: "hour",
      retryAfter: 120,
    });
  });

  it("reports the day window", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, charged: false, window_kind: "day", retry_after: 40_000 }],
      error: null,
    });

    await expect(claim()).resolves.toMatchObject({ allowed: false, window: "day", retryAfter: 40_000 });
  });

  it("returns a replayed charge for a continuation", async () => {
    allow(false);

    await expect(claim({ messages: [user(), assistant, tool] })).resolves.toMatchObject({
      allowed: true,
      charged: false,
    });
    expect(rpc.mock.calls[0][1].target_is_continuation).toBe(true);
  });

  it("propagates storage failures so the route can fail closed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(claim()).rejects.toThrow("db down");
  });

  it("fails closed when the claim returns no row", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(claim()).rejects.toThrow("no row");
  });

  it("skips storage when the limiter is disabled in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_RATE_LIMIT", "1");

    await expect(claim()).resolves.toMatchObject({ allowed: true, charged: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("claimAgentTurn in read-only preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("charges once per turn and replays the charge for retries and continuations", async () => {
    await expect(claim({ userId: "preview-retry" })).resolves.toMatchObject({ charged: true });
    await expect(claim({ userId: "preview-retry", runKey: "run-2" })).resolves.toMatchObject({
      charged: false,
    });
    await expect(
      claim({ userId: "preview-retry", messages: [user(), assistant, tool], runKey: "run-3" }),
    ).resolves.toMatchObject({ charged: false });
    await expect(
      claim({ userId: "preview-retry", messages: [user("u2")], runKey: "run-4" }),
    ).resolves.toMatchObject({ charged: true });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("charges the same turn again after the replay window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T00:00:00Z"));

    await expect(claim({ userId: "preview-window" })).resolves.toMatchObject({ charged: true });
    vi.setSystemTime(new Date(Date.now() + AGENT_TURN_REPLAY_MS - 1));
    await expect(claim({ userId: "preview-window" })).resolves.toMatchObject({ charged: false });

    vi.setSystemTime(new Date(Date.now() + 1));
    await expect(claim({ userId: "preview-window" })).resolves.toMatchObject({ charged: true });
  });

  it("denies the hour window without consuming the day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T00:00:00Z"));
    const previewLimits = { perHour: 1, perDay: 2 };
    const userId = "preview-both-windows";

    await expect(claim({ userId, limits: previewLimits })).resolves.toMatchObject({ charged: true });
    await expect(
      claim({ userId, limits: previewLimits, messages: [user("u2")] }),
    ).resolves.toMatchObject({ allowed: false, window: "hour" });

    vi.setSystemTime(new Date(Date.now() + 61 * 60 * 1000));
    await expect(
      claim({ userId, limits: previewLimits, messages: [user("u3")] }),
    ).resolves.toMatchObject({ allowed: true, charged: true });

    vi.setSystemTime(new Date(Date.now() + 61 * 60 * 1000));
    await expect(
      claim({ userId, limits: previewLimits, messages: [user("u4")] }),
    ).resolves.toMatchObject({ allowed: false, window: "day" });
  });
});
