import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAdmin, readAssistantAccess, redirect, notFound } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  readAssistantAccess: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ getCurrentAdmin }));
vi.mock("@/lib/assistant/access", () => ({ readAssistantAccess }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import AssistantAdminPage from "@/app/admin/assistant/page";

describe("AssistantAdminPage guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAssistantAccess.mockResolvedValue("testers");
  });

  it("redirects anonymous users to sign in", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    await expect(AssistantAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(readAssistantAccess).not.toHaveBeenCalled();
  });

  it("404s non-platform admins without reading the mode", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: false } });
    await expect(AssistantAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readAssistantAccess).not.toHaveBeenCalled();
  });

  it("renders the client with the current mode for platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: true } });
    const view = await AssistantAdminPage();
    expect(view.props.initialAccess).toBe("testers");
  });
});
