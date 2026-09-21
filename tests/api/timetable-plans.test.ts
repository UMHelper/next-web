import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase/admin", () => ({ default: {} }));

import { GET, POST } from "@/app/api/timetable/plans/route";
import { GET as GET_BY_ID } from "@/app/api/timetable/plans/[id]/route";

describe("timetable plan API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous list requests", async () => {
    authMock.mockReturnValue({ userId: null });
    const response = await GET(new Request("http://localhost/api/timetable/plans"));
    expect(response.status).toBe(401);
  });

  it("rejects invalid create payloads before database access", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    const response = await POST(
      new Request("http://localhost/api/timetable/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "bad" }),
      }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects anonymous single-plan requests", async () => {
    authMock.mockReturnValue({ userId: null });
    const response = await GET_BY_ID(
      new Request("http://localhost/api/timetable/plans/1"),
      { params: { id: "1" } },
    );
    expect(response.status).toBe(401);
  });
});
