import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getReviewInfo,
  getComentListByCourseIDAndPage,
  getCourseInfo,
  getScheduleList,
  verifyIOSRequest,
  iosVersionGuard,
} = vi.hoisted(() => ({
  getReviewInfo: vi.fn(),
  getComentListByCourseIDAndPage: vi.fn(),
  getCourseInfo: vi.fn(),
  getScheduleList: vi.fn(),
  verifyIOSRequest: vi.fn(),
  iosVersionGuard: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ default: {} }));
vi.mock("@/lib/database/get-prof-info", () => ({ getReviewInfo }));
vi.mock("@/lib/database/get-comment-list", () => ({ getComentListByCourseIDAndPage }));
vi.mock("@/lib/database/get-course-info", () => ({ getCourseInfo }));
vi.mock("@/lib/database/get-schedule-list", () => ({ default: getScheduleList }));
vi.mock("@/lib/ios-auth", () => ({
  verifyIOSRequest,
  iosUnauthorized: vi.fn(() => new Response("unauthorized", { status: 401 })),
}));
vi.mock("@/lib/ios-version", () => ({ iosVersionGuard }));
vi.mock("@/lib/cache-invalidation", () => ({ invalidateAfterCommentWrite: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({
  rateLimitKey: vi.fn(),
  resolveCommentIdentity: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

import { GET } from "@/app/api/comment/[code]/[prof]/route";

describe("GET /api/comment/[code]/[prof]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIOSRequest.mockReturnValue(true);
    iosVersionGuard.mockReturnValue(undefined);
    getReviewInfo.mockResolvedValue({ id: 42, comments: 1 });
    getCourseInfo.mockResolvedValue({ New_code: "ACCT1000" });
    getScheduleList.mockResolvedValue([]);
    getComentListByCourseIDAndPage.mockResolvedValue([
      {
        id: 7,
        content: "good",
        avatar_seed: "md5-seed",
        verify: 0,
      },
    ]);
  });

  it("adds a pseudonymous verify_account field for legacy iOS decoding", async () => {
    const response = await GET(
      new Request("http://localhost/api/comment/ACCT1000/TEACHER?page=1"),
      { params: { code: "ACCT1000", prof: "TEACHER" } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comments[0]).toMatchObject({
      id: 7,
      avatar_seed: "md5-seed",
      verify_account: "md5-seed",
    });
  });

  it("falls back to an empty string when avatar_seed is null", async () => {
    getComentListByCourseIDAndPage.mockResolvedValue([
      { id: 8, avatar_seed: null, verify: 0 },
    ]);

    const response = await GET(
      new Request("http://localhost/api/comment/ACCT1000/TEACHER?page=1"),
      { params: { code: "ACCT1000", prof: "TEACHER" } },
    );

    const body = await response.json();
    expect(body.comments[0].verify_account).toBe("");
  });
});
