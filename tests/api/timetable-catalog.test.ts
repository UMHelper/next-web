import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, rpcMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase/admin", () => ({
  default: { rpc: rpcMock, from: vi.fn() },
}));
vi.mock("@/lib/database/get-course-info", () => ({
  fetchCourseInfo: vi.fn().mockResolvedValue({
    course: { courseCode: "ACCT1000" },
    profList: [],
    isOffer: true,
  }),
}));
vi.mock("@/lib/database/get-schedule-list", () => ({
  default: vi.fn().mockResolvedValue([]),
}));

import { GET as GET_FILTERS } from "@/app/api/timetable/catalog/filters/route";
import { GET as GET_SEARCH } from "@/app/api/timetable/catalog/search/route";
import { GET as GET_COURSE } from "@/app/api/timetable/catalog/courses/[code]/route";
import { GET as GET_SECTIONS } from "@/app/api/timetable/catalog/courses/[code]/[prof]/sections/route";

describe("timetable catalog API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires login for all catalog routes", async () => {
    authMock.mockReturnValue({ userId: null });
    expect(
      (await GET_FILTERS()).status,
    ).toBe(401);
    expect(
      (await GET_SEARCH(new Request("http://localhost/api/timetable/catalog/search?q=A"))).status,
    ).toBe(401);
    expect(
      (await GET_COURSE(new Request("http://localhost/api/timetable/catalog/courses/A"), { params: { code: "A" } })).status,
    ).toBe(401);
    expect(
      (await GET_SECTIONS(new Request("http://localhost/api/timetable/catalog/courses/A/P/sections"), { params: { code: "A", prof: "P" } })).status,
    ).toBe(401);
  });

  it("returns paginated course search results", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    rpcMock.mockResolvedValue({
      data: [{ course_code: "ACCT1000", total_count: 1 }],
      error: null,
    });

    const response = await GET_SEARCH(
      new Request("http://localhost/api/timetable/catalog/search?type=course&q=ACCT"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});
