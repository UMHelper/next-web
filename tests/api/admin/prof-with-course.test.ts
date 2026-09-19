import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, writeAuditLog, update, maybeSingle, single } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  update: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog }));
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

import { PATCH } from "@/app/api/admin/prof-with-course/[id]/route";

describe("PATCH /api/admin/prof-with-course/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "user_admin", isPlatformAdmin: false },
    });
    maybeSingle.mockResolvedValue({
      data: { id: 1, course_id: "ACCT1000", prof_id: "PROF", admin_note: null, admin_note_en: null },
      error: null,
    });
    single.mockResolvedValue({
      data: { id: 1, course_id: "ACCT1000", prof_id: "PROF", admin_note: "中文", admin_note_en: "English" },
      error: null,
    });
  });

  it("updates professor-course notes through the whitelist", async () => {
    const request = new Request("http://localhost/api/admin/prof-with-course/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_note: "中文", admin_note_en: "English" }),
    });

    const response = await PATCH(request, { params: { id: "1" } });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ admin_note: "中文", admin_note_en: "English" });
    expect(writeAuditLog).toHaveBeenCalledOnce();
  });
});
