import { describe, expect, it, vi } from "vitest";

const { auth, verifyIOSRequest, iosVersionGuard } = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyIOSRequest: vi.fn(),
  iosVersionGuard: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/ios-auth", () => ({ verifyIOSRequest }));
vi.mock("@/lib/ios-version", () => ({ iosVersionGuard }));

import { requireWriteIdentity, resolveReportIdentity } from "@/lib/api-auth";

describe("requireWriteIdentity", () => {
  it("returns a web identity from Clerk", async () => {
    verifyIOSRequest.mockReturnValue(false);
    auth.mockReturnValue({ userId: "user_2abcDEF" });
    const request = new Request("http://localhost/api/reply", { method: "POST" });

    const result = await requireWriteIdentity(request);

    expect("identity" in result && result.identity).toEqual({ platform: "web", id: "user_2abcDEF" });
  });

  it("returns 401 when there is no Clerk session", async () => {
    verifyIOSRequest.mockReturnValue(false);
    auth.mockReturnValue({ userId: null });
    const request = new Request("http://localhost/api/reply", { method: "POST" });

    const result = await requireWriteIdentity(request);

    expect("response" in result && result.response.status).toBe(401);
  });

  it("returns an iOS identity from the viewer header", async () => {
    verifyIOSRequest.mockReturnValue(true);
    iosVersionGuard.mockReturnValue(null);
    const request = new Request("http://localhost/api/vote/1", {
      method: "POST",
      headers: { "x-um-viewer-id": "123e4567-e89b-12d3-a456-426614174000" },
    });

    const result = await requireWriteIdentity(request);

    expect("identity" in result && result.identity).toEqual({
      platform: "ios",
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });
});

describe("resolveReportIdentity", () => {
  it("returns a web identity for signed-in users", async () => {
    verifyIOSRequest.mockReturnValue(false);
    auth.mockReturnValue({ userId: "user_2abcDEF" });
    const request = new Request("http://localhost/api/report", { method: "POST" });

    const result = await resolveReportIdentity(request);

    expect("identity" in result && result.identity).toEqual({
      platform: "web",
      id: "user_2abcDEF",
      source: "web",
    });
  });

  it("returns 401 for anonymous web users", async () => {
    verifyIOSRequest.mockReturnValue(false);
    auth.mockReturnValue({ userId: null });
    const request = new Request("http://localhost/api/report", { method: "POST" });

    const result = await resolveReportIdentity(request);

    expect("response" in result && result.response.status).toBe(401);
  });
});
