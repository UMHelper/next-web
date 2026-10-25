import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import { consumeRateLimit } from "@/lib/rate-limit";

describe("consumeRateLimit in a read-only preview", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows up to the limit, then denies, without touching Supabase", async () => {
    const input = { key: "agent:user_a", action: "agent", limit: 2, windowSeconds: 60 } as const;

    const first = await consumeRateLimit(input);
    const second = await consumeRateLimit(input);
    const third = await consumeRateLimit(input);

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfter).toBe(60);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts down retryAfter and resets after the window", async () => {
    const input = { key: "agent:user_b", action: "agent", limit: 1, windowSeconds: 60 } as const;
    await consumeRateLimit(input);

    vi.advanceTimersByTime(20_000);
    const denied = await consumeRateLimit(input);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBe(40);

    vi.advanceTimersByTime(41_000);
    const fresh = await consumeRateLimit(input);
    expect(fresh.allowed).toBe(true);
  });

  it("keeps keys, actions, and windows independent", async () => {
    await consumeRateLimit({ key: "k1", action: "agent", limit: 1, windowSeconds: 60 });

    const otherKey = await consumeRateLimit({ key: "k2", action: "agent", limit: 1, windowSeconds: 60 });
    const otherAction = await consumeRateLimit({ key: "k1", action: "mcp", limit: 1, windowSeconds: 60 });
    const otherWindow = await consumeRateLimit({ key: "k1", action: "agent", limit: 1, windowSeconds: 3600 });

    expect(otherKey.allowed).toBe(true);
    expect(otherAction.allowed).toBe(true);
    expect(otherWindow.allowed).toBe(true);
  });

  it("defaults the window to one hour", async () => {
    const result = await consumeRateLimit({ key: "k3", action: "agent", limit: 1 });
    expect(result.retryAfter).toBe(3600);
  });
});

describe("consumeRateLimit outside preview", () => {
  it("still uses the database rpc", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ allowed: true, remaining: 4, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    });

    const result = await consumeRateLimit({ key: "web:u:comment", action: "comment", limit: 5 });

    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      target_key: "web:u:comment",
      window_seconds: 3600,
      max_hits: 5,
    });
    expect(result.allowed).toBe(true);
  });
});
