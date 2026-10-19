import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeRateLimit } = vi.hoisted(() => ({ consumeRateLimit: vi.fn() }));

vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));

import { consumeAgentRateLimits } from "@/lib/assistant/rate-limit";
import { hashUserId } from "@/lib/mcp/rate-limit";

const limits = { perHour: 30, perDay: 80 };

describe("consumeAgentRateLimits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks the hour window, then the day window, keyed by the hashed user id", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfter: 0 });

    await expect(consumeAgentRateLimits("user_123", limits)).resolves.toEqual({ allowed: true });

    const hash = hashUserId("user_123");
    expect(consumeRateLimit.mock.calls.map(([input]) => input)).toEqual([
      { key: `agent:user:${hash}:hour`, action: "agent", limit: 30, windowSeconds: 3600 },
      { key: `agent:user:${hash}:day`, action: "agent", limit: 80, windowSeconds: 86_400 },
    ]);
    expect(JSON.stringify(consumeRateLimit.mock.calls)).not.toContain("user_123");
  });

  it("stops at the hour window", async () => {
    consumeRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 120 });

    await expect(consumeAgentRateLimits("user_123", limits)).resolves.toEqual({
      allowed: false,
      retryAfter: 120,
    });
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
  });

  it("reports the day window's retry time", async () => {
    consumeRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 5, retryAfter: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 40_000 });

    await expect(consumeAgentRateLimits("user_123", limits)).resolves.toEqual({
      allowed: false,
      retryAfter: 40_000,
    });
  });

  it("propagates storage failures so the route can fail closed", async () => {
    consumeRateLimit.mockRejectedValue(new Error("rate limit failed: db down"));

    await expect(consumeAgentRateLimits("user_123", limits)).rejects.toThrow("db down");
  });
});
