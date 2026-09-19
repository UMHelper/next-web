import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcSingle, rpc, requireWriteIdentity, consumeRateLimit, getReviewInfo } = vi.hoisted(() => ({
  rpcSingle: vi.fn(),
  rpc: vi.fn(),
  requireWriteIdentity: vi.fn(),
  consumeRateLimit: vi.fn(),
  getReviewInfo: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  default: { rpc },
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/api-auth", () => ({
  requireWriteIdentity,
  rateLimitKey: () => "web:user_1:comment",
}));
vi.mock("@/lib/database/get-prof-info", () => ({ getReviewInfo }));
vi.mock("@/lib/database/get-comment-list", () => ({ getComentListByCourseIDAndPage: vi.fn() }));
vi.mock("@/lib/database/get-course-info", () => ({ getCourseInfo: vi.fn() }));
vi.mock("@/lib/database/get-schedule-list", () => ({ default: vi.fn() }));

import { POST } from "@/app/api/comment/[code]/[prof]/route";

function validForm() {
  const form = new FormData();
  form.set("attendance", "3");
  form.set("pre", "3");
  form.set("grade", "4");
  form.set("hard", "2");
  form.set("reward", "4");
  form.set("assignment", "3");
  form.set("recommend", "5");
  form.set("content", "Very useful course.");
  form.set("verify", "1");
  form.set("verify_account", "spoofed");
  return form;
}

describe("POST /api/comment/[code]/[prof]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 });
    getReviewInfo.mockResolvedValue({ id: 99 });
    rpc.mockReturnValue({ single: rpcSingle });
    rpcSingle.mockResolvedValue({ data: { id: 1 }, error: null });
  });

  it("returns 400 for an invalid course code", async () => {
    const response = await POST(
      new Request("http://localhost/api/comment/BAD/BAD", { method: "POST", body: validForm() }),
      { params: { code: "BAD", prof: "BAD" } },
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ignores client verify/verify_account and uses the server identity", async () => {
    const response = await POST(
      new Request("http://localhost/api/comment/ACCT1000/TEACHER", {
        method: "POST",
        body: validForm(),
      }),
      { params: { code: "ACCT1000", prof: "TEACHER" } },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "insert_comment_and_refresh_prof_stats",
      expect.objectContaining({
        target_verify: 1,
        target_verify_account: "user_1",
        target_content: "Very useful course.",
      }),
    );
  });
});
