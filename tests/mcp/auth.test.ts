import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, verifyClerkTokenMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  verifyClerkTokenMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: verifyClerkTokenMock }));

import { McpAuthError, requireMcpPrincipal, verifyMcpAccessToken } from "@/lib/mcp/auth";
import { MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";

const oauthAuth = {
  isAuthenticated: true,
  tokenType: "oauth_token",
  clientId: "client_1",
  scopes: ["openid", MCP_REQUIRED_SCOPE],
  userId: "user_1",
};

const request = new Request("https://umeh.top/mcp", { method: "POST" });

describe("verifyMcpAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies through Clerk's oauth_token path and normalizes AuthInfo", async () => {
    authMock.mockResolvedValue(oauthAuth);
    verifyClerkTokenMock.mockReturnValue({
      token: "tok",
      clientId: "client_1",
      scopes: ["openid", MCP_REQUIRED_SCOPE],
      extra: { userId: "user_1" },
    });

    const info = await verifyMcpAccessToken(request, "tok");

    expect(authMock).toHaveBeenCalledWith({ acceptsToken: "oauth_token" });
    expect(verifyClerkTokenMock).toHaveBeenCalledWith(oauthAuth, "tok");
    expect(info).toEqual({
      token: "tok",
      clientId: "client_1",
      scopes: ["openid", MCP_REQUIRED_SCOPE],
      extra: { userId: "user_1" },
    });
  });

  it("returns undefined when no bearer token is supplied", async () => {
    authMock.mockResolvedValue(oauthAuth);
    verifyClerkTokenMock.mockReturnValue(undefined);

    expect(await verifyMcpAccessToken(request, undefined)).toBeUndefined();
  });

  it("returns undefined for a non-oauth token type without validating", async () => {
    authMock.mockResolvedValue({ ...oauthAuth, tokenType: "session_token" });

    expect(await verifyMcpAccessToken(request, "tok")).toBeUndefined();
    expect(verifyClerkTokenMock).not.toHaveBeenCalled();
  });

  it("returns undefined for an unauthenticated machine token", async () => {
    authMock.mockResolvedValue({
      isAuthenticated: false,
      tokenType: "oauth_token",
      clientId: null,
      scopes: null,
      userId: null,
    });
    verifyClerkTokenMock.mockReturnValue(undefined);

    expect(await verifyMcpAccessToken(request, "tok")).toBeUndefined();
  });

  it("never logs the bearer token or Clerk metadata", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    authMock.mockResolvedValue({ isAuthenticated: false, tokenType: "oauth_token" });
    verifyClerkTokenMock.mockReturnValue(undefined);

    await verifyMcpAccessToken(request, "super-secret-bearer-token");

    const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .join(" ");
    expect(logged).not.toContain("super-secret-bearer-token");
  });
});

describe("requireMcpPrincipal", () => {
  it("accepts an authenticated principal with the required scope", () => {
    expect(
      requireMcpPrincipal({
        token: "tok",
        scopes: ["openid", MCP_REQUIRED_SCOPE],
        extra: { userId: "user_1" },
      }),
    ).toEqual({ userId: "user_1", scopes: ["openid", MCP_REQUIRED_SCOPE] });
  });

  it("fails closed as unauthorized without an identity", () => {
    for (const value of [undefined, null, {}, { token: "tok", scopes: [], extra: {} }]) {
      try {
        requireMcpPrincipal(value);
        throw new Error("expected requireMcpPrincipal to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(McpAuthError);
        expect((error as McpAuthError).code).toBe("unauthorized");
      }
    }
  });

  it("rejects a token that lacks umhelper:read as forbidden", () => {
    try {
      requireMcpPrincipal({ token: "tok", scopes: ["openid", "profile"], extra: { userId: "user_1" } });
      throw new Error("expected requireMcpPrincipal to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(McpAuthError);
      expect((error as McpAuthError).code).toBe("forbidden");
    }
  });
});
