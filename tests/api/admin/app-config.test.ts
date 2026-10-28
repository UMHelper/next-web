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

  it("lets any admin update only the assistant access mode", async () => {
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: false } });
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_assistant_access: "testers" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledWith();
    expect(update.mock.calls[0][0]).toMatchObject({ ai_assistant_access: "testers" });
  });

  it("rejects other config changes from a non-platform admin", async () => {
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: false } });
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_assistant_access: "off", current_sem: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates the assistant access mode", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_assistant_access: "everyone" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ ai_assistant_access: "everyone", updated_by: "user_admin" });
    expect(revalidateTag).toHaveBeenCalledWith("app-config");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "config.update",
        after: expect.objectContaining({ ai_assistant_access: "everyone" }),
      }),
    );
  });

  it("rejects unknown assistant access modes", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_assistant_access: "admins" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects assistant limit changes from a non-platform admin", async () => {
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: false } });
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_quota_per_hour: 60 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates assistant limits and audits the previous values", async () => {
    maybeSingle.mockResolvedValue({
      data: { ...row, ai_quota_per_hour: 30, ai_max_steps: 6 },
      error: null,
    });
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_quota_per_hour: 60, ai_history_turns: null }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ ai_quota_per_hour: 60, ai_history_turns: null });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ ai_quota_per_hour: 30, ai_history_turns: null }),
        after: expect.objectContaining({ ai_quota_per_hour: 60, ai_history_turns: null }),
      }),
    );
  });

  it("rejects assistant limits outside the allowed range", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_max_steps: 13 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
