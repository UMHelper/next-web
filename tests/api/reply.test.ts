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
      insert: (payload: unknown) => {
        insert(payload);
        return { select: () => ({ single }) };
      },
    })),
  },
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/cache-invalidation", () => ({ invalidateAfterReplyWrite: vi.fn() }));
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

  it("ignores client-controlled identity fields", async () => {
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 });
    maybeSingle.mockResolvedValue({
      data: {
        id: 1,
        course_id: 10,
        attendance: 3,
        pre: 3,
        grade: 3,
        hard: 3,
        reward: 3,
        recommend: 3,
        assignment: 3,
        result: 3,
        hidden: 0,
      },
      error: null,
    });
    single.mockResolvedValue({ data: { id: 99 }, error: null });

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

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        content: "hello",
        replyto: 1,
        verify_account: "user_1",
      }),
    ]);
  });

  it("marks an iOS device reply as unverified", async () => {
    requireWriteIdentity.mockResolvedValue({
      identity: { platform: "ios", id: "3f2a1c44-5b0e-4a7d-9f1e-2b3c4d5e6f70" },
    });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 });
    maybeSingle.mockResolvedValue({
      data: {
        id: 7,
        course_id: 10,
        attendance: 3,
        pre: 3,
        grade: 3,
        hard: 3,
        reward: 3,
        recommend: 3,
        assignment: 3,
        result: 3,
        hidden: 0,
      },
      error: null,
    });
    single.mockResolvedValue({ data: { id: 99 }, error: null });

    const response = await POST(
      new Request("http://localhost/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replyto: 7, content: "nice" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        replyto: 7,
        content: "nice",
        verify: 0,
        verify_account: "3f2a1c44-5b0e-4a7d-9f1e-2b3c4d5e6f70",
      }),
    ]);
  });
});
