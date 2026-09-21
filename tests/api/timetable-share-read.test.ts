import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShareToken } from "@/lib/timetable/share-token";

const { authMock, maybeSingleMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  },
}));

import { GET } from "@/app/api/timetable/shares/[token]/route";

describe("shared timetable read API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockReturnValue({ userId: "user_viewer" });
  });

  it("requires login", async () => {
    authMock.mockReturnValue({ userId: null });
    const response = await GET(
      new Request("http://localhost/api/timetable/shares/x"),
      { params: { token: "x".repeat(43) } },
    );
    expect(response.status).toBe(401);
  });

  it("returns a sanitized plan", async () => {
    const token = createShareToken();
    maybeSingleMock.mockResolvedValue({
      data: {
        name: "A",
        year: 2026,
        sem: 1,
        payload: { schemaVersion: 1, sections: [] },
        revision: 4,
        updated_at: "2026-09-21T00:00:00.000Z",
      },
      error: null,
    });

    const response = await GET(
      new Request(`http://localhost/api/timetable/shares/${token}`),
      { params: { token } },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plan.name).toBe("A");
    expect(body.plan.owner_clerk_id).toBeUndefined();
    expect(body.plan.share_token).toBeUndefined();
  });

  it("returns 304 when revision is unchanged", async () => {
    const token = createShareToken();
    maybeSingleMock.mockResolvedValue({
      data: {
        name: "A",
        year: 2026,
        sem: 1,
        payload: { schemaVersion: 1, sections: [] },
        revision: 4,
        updated_at: "2026-09-21T00:00:00.000Z",
      },
      error: null,
    });

    const response = await GET(
      new Request(`http://localhost/api/timetable/shares/${token}?revision=4`),
      { params: { token } },
    );
    expect(response.status).toBe(304);
  });
});
