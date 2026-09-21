import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAdmin, redirect, notFound } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/admin-auth", () => ({ getCurrentAdmin }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import UpdatePage from "@/app/admin/update/page";

describe("UpdatePage guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous users to sign in", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    await expect(UpdatePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("404s non-platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: false } });
    await expect(UpdatePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders for platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: true } });
    const view = await UpdatePage();
    expect(view).toBeTruthy();
  });
});
