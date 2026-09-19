import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  single,
  insert,
  maybeSingle,
  consumeRateLimit,
  requireWriteIdentity,
} = vi.hoisted(() => ({
  single: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  consumeRateLimit: vi.fn(),
  requireWriteIdentity: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      insert,
    })),
  },
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/api-auth", () => ({
  requireWriteIdentity,
  rateLimitKey: () => "web:user_1:reply",
}));

import { POST } from "@/app/api/reply/route";

describe("POST /api/reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when identity is missing", async () => {
    requireWriteIdentity.mockResolvedValue({
      response: new Response(JSON.stringify({ error: { code: "unauthorized", message: "Sign in required" } }), {
        status: 401,
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replyto: 1, content: "hello" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects client-controlled identity fields", async () => {
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(
      new Request("http://localhost/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          replyto: 1,
          content: "hello",
          verify_account: "spoofed",
          created_by: "spoofed",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
