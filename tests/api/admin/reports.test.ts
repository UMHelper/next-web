import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin, queryResult } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  queryResult: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/admin", () => {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    range: () => builder,
    eq: () => builder,
    then: (resolve: (value: unknown) => unknown) => resolve(queryResult()),
  };
  return { default: { from: () => builder } };
});

import { GET } from "@/app/api/admin/reports/route";

describe("GET /api/admin/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "user_admin", isPlatformAdmin: false },
    });
    queryResult.mockReturnValue({ data: [{ id: 1, status: "open" }], error: null, count: 1 });
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "Admin access required" } }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/reports"));
    expect(response.status).toBe(403);
  });

  it("returns report rows for admins", async () => {
    const response = await GET(new Request("http://localhost/api/admin/reports?status=open"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reports: [{ id: 1, status: "open" }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });
});
