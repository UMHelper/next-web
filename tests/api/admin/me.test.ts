import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));

import { GET } from "@/app/api/admin/me/route";

describe("GET /api/admin/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the admin error response for non-admins", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: { code: "forbidden", message: "Admin access required" } },
        { status: 403 },
      ),
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("returns the admin session for admins", async () => {
    requireAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "user_admin", isPlatformAdmin: false },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isAdmin: true,
      isPlatformAdmin: false,
    });
  });
});
