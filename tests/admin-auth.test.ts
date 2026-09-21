import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getDirectoryUsers, maybeSingle } = vi.hoisted(() => ({
  auth: vi.fn(),
  getDirectoryUsers: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/clerk/user-directory", () => ({ getDirectoryUsers }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  },
}));

import {
  getCurrentAdmin,
  getPlatformAdminEmails,
  getPlatformAdminIds,
  requireAdmin,
} from "@/lib/admin-auth";

describe("admin auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PLATFORM_ADMIN_USER_IDS;
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it("parses platform admin ids", () => {
    expect(Array.from(getPlatformAdminIds("user_a, user_b ,,user_c"))).toEqual([
      "user_a",
      "user_b",
      "user_c",
    ]);
  });

  it("parses and normalizes platform admin emails", () => {
    expect(Array.from(getPlatformAdminEmails("Admin@Example.com, b@test.com "))).toEqual([
      "admin@example.com",
      "b@test.com",
    ]);
  });

  it("allows platform admin from env id", async () => {
    process.env.PLATFORM_ADMIN_USER_IDS = "user_platform";
    auth.mockReturnValue({ userId: "user_platform" });

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_platform", isPlatformAdmin: true },
    });
  });

  it("allows platform admin by a verified primary Clerk email", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
    auth.mockReturnValue({ userId: "user_email" });
    getDirectoryUsers.mockResolvedValue(
      new Map([["user_email", { id: "user_email", primaryEmail: "admin@example.com" }]]),
    );

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_email", isPlatformAdmin: true },
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("does not allow an unverified email", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
    auth.mockReturnValue({ userId: "user_unverified" });
    getDirectoryUsers.mockResolvedValue(
      new Map([["user_unverified", { id: "user_unverified", primaryEmail: null }]]),
    );
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getCurrentAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("allows an active db admin", async () => {
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
