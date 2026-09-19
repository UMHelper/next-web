import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, requireWriteIdentity, consumeRateLimit } = vi.hoisted(() => ({
  insert: vi.fn(),
  requireWriteIdentity: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: vi.fn(() => ({ insert })),
  },
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/cache-invalidation", () => ({ invalidateAfterVoteWrite: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({
  requireWriteIdentity,
  rateLimitKey: () => "web:user_1:vote",
}));

import { POST } from "@/app/api/vote/[comment_id]/route";

describe("POST /api/vote/[comment_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 119, retryAfter: 0 });
  });

  it("rejects a body comment id that does not match the path", async () => {
    const response = await POST(
      new Request("http://localhost/api/vote/7", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: 8, offset: 1 }),
      }),
      { params: { comment_id: "7" } },
    );

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("ignores client-created_by and writes the Clerk identity", async () => {
    insert.mockResolvedValueOnce({ data: [], error: null });

    const response = await POST(
      new Request("http://localhost/api/vote/7", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: 7, offset: 1, created_by: "spoofed" }),
      }),
      { params: { comment_id: "7" } },
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ created_by: "user_1", comment_id: 7, offset: 1 }),
    ]);
  });
});
