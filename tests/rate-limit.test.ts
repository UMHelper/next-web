import { describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc },
}));

import { consumeRateLimit, isRateLimitDisabled } from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
  it("skips storage when DISABLE_RATE_LIMIT=1 in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_RATE_LIMIT", "1");

    await expect(
      consumeRateLimit({ key: "agent:user:test:hour", action: "agent", limit: 30 }),
    ).resolves.toEqual({ allowed: true, remaining: 30, retryAfter: 0 });
    expect(rpc).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("does not disable in production even when the flag is set", () => {
    expect(isRateLimitDisabled({ NODE_ENV: "production", DISABLE_RATE_LIMIT: "1" })).toBe(false);
  });

  it("returns retryAfter when the limit is exceeded", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          allowed: false,
          remaining: 0,
          reset_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ],
      error: null,
    });

    const result = await consumeRateLimit({
      key: "web:user_1:comment",
      action: "comment",
      limit: 10,
      windowSeconds: 3600,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});
