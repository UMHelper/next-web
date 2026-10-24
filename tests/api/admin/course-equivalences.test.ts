import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, writeAuditLog, resolveCourseCode, order, rpc } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  resolveCourseCode: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog }));
vi.mock("@/lib/database/course-equivalences", () => ({ resolveCourseCode }));
vi.mock("@/lib/supabase/admin", () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order,
  };
  return { default: { from: () => builder, rpc } };
});

import { GET, POST } from "@/app/api/admin/courses/[code]/equivalences/route";

describe("/api/admin/courses/[code]/equivalences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "user_admin", isPlatformAdmin: true },
    });
    resolveCourseCode.mockImplementation(async (code: string) => (
      code === "CISC1001" ? "CSCI1001" : code
    ));
    order.mockResolvedValue({
      data: [{ equivalent_code: "CISC1001", source: "backfill", confidence: 1 }],
      error: null,
    });
    rpc.mockResolvedValue({ data: { linked: 1 }, error: null });
  });

  it("loads equivalences for the resolved primary code", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ code: "CISC1001" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      primary_code: "CSCI1001",
      equivalents: [{ code: "CISC1001", source: "backfill", confidence: 1 }],
    });
  });

  it("replaces the equivalence list and writes an audit entry", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equivalent_codes: ["cisc1001"] }),
      }),
      { params: Promise.resolve({ code: "CSCI1001" }) },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_set_course_equivalences", {
      p_primary: "CSCI1001",
      p_equivalents: ["CISC1001"],
      p_source: "manual:admin",
    });
    expect(writeAuditLog).toHaveBeenCalledOnce();
  });

  it("rejects anonymous requests", async () => {
    requireAdmin.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ code: "CSCI1001" }),
    });

    expect(response.status).toBe(401);
  });
});
