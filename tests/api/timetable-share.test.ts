import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase/admin", () => ({ default: {} }));
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 1,
    retryAfter: 0,
  }),
}));

import { GET, POST, DELETE } from "@/app/api/timetable/plans/[id]/share/route";

describe("timetable share owner API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous access", async () => {
    authMock.mockReturnValue({ userId: null });
    const request = new Request("http://localhost/api/timetable/plans/1/share");

    expect((await GET(request, { params: { id: "1" } })).status).toBe(401);
    expect((await POST(request, { params: { id: "1" } })).status).toBe(401);
    expect((await DELETE(request, { params: { id: "1" } })).status).toBe(401);
  });
});
