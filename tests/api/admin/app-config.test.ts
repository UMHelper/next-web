import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin, writeAuditLog, revalidateTag, maybeSingle, single, update } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidateTag: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/supabase/admin", () => {
  const builder: any = {
    select: () => builder,
    update: (value: unknown) => {
      update(value);
      return builder;
    },
    eq: () => builder,
    maybeSingle,
    single,
  };
  return { default: { from: () => builder } };
});

import { GET, POST } from "@/app/api/admin/app-config/route";

const row = {
  current_year: 2026,
  current_sem: 1,
  is_preenrollment_open: true,
  database_last_update: "2026-08-08",
  updated_at: null,
  updated_by: null,
};

describe("/api/admin/app-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
    maybeSingle.mockResolvedValue({ data: row, error: null });
    single.mockResolvedValue({ data: { ...row, current_sem: 2 }, error: null });
  });

  it("requires platform admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }),
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledWith({ platformOnly: true });
  });

  it("returns the mapped config", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: {
        currentYear: 2026,
        currentSem: 1,
        isPreenrollmentOpen: true,
        databaseLastUpdate: "2026-08-08",
        updatedAt: null,
        updatedBy: null,
      },
    });
  });

  it("updates, revalidates and audits", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_sem: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({ current_sem: 2, updated_by: "user_admin" });
    expect(revalidateTag).toHaveBeenCalledWith("app-config");
    expect(writeAuditLog).toHaveBeenCalledOnce();
  });

  it("rejects invalid bodies", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_sem: 9 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
