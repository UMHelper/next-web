import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, maybeSingle } = vi.hoisted(() => ({
  auth: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  },
}));

import { getCurrentAdmin, getPlatformAdminIds, requireAdmin } from "@/lib/admin-auth";

describe("admin auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PLATFORM_ADMIN_USER_IDS;
  });

  it("parses platform admin ids", () => {
    expect(Array.from(getPlatformAdminIds("user_a, user_b ,,user_c"))).toEqual([
      "user_a",
      "user_b",
      "user_c",
    ]);
  });

  it("allows platform admin from env", async () => {
    process.env.PLATFORM_ADMIN_USER_IDS = "user_platform";
    auth.mockReturnValue({ userId: "user_platform" });

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_platform", isPlatformAdmin: true },
    });
  });

  it("allows active db admin", async () => {
    auth.mockReturnValue({ userId: "user_db" });
    maybeSingle.mockResolvedValue({ data: { clerk_user_id: "user_db", active: true }, error: null });

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_db", isPlatformAdmin: false },
    });
  });

  it("rejects non-admin users", async () => {
    auth.mockReturnValue({ userId: "user_plain" });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getCurrentAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects anonymous users", async () => {
    auth.mockReturnValue({ userId: null });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
