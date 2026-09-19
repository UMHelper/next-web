import { describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc },
}));

import { consumeRateLimit } from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
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
