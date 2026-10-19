import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), canUseAssistant: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/assistant/access", () => ({ canUseAssistant: mocks.canUseAssistant }));

import { GET } from "@/app/api/assistant/access/route";

describe("GET /api/assistant/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled for signed-out visitors without checking access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ enabled: false });
    expect(mocks.canUseAssistant).not.toHaveBeenCalled();
  });

  it("returns enabled when the user has access", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.canUseAssistant.mockResolvedValue(true);
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ enabled: true });
    expect(mocks.canUseAssistant).toHaveBeenCalledWith("user_1");
  });

  it("returns disabled when the user has no access", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_2" });
    mocks.canUseAssistant.mockResolvedValue(false);
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ enabled: false });
  });
});
