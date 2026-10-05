import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { auth } from "@clerk/nextjs/server";
import type { AuthInfo } from "@modelcontextprotocol/server";

import { MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";

export type McpAuthInfo = AuthInfo;

export type McpAuthErrorCode = "unauthorized" | "forbidden";

export class McpAuthError extends Error {
  constructor(public readonly code: McpAuthErrorCode) {
    super(code === "forbidden" ? "Missing required scope" : "Sign in required");
    this.name = "McpAuthError";
  }
}

/**
 * MCP bearer-token verifier, shaped for `withMcpAuth(handler, verifyToken)`.
 *
 * Clerk's `auth()` performs the cryptographic verification (signature, issuer,
 * expiry) and returns the `oauth_token` machine object; `verifyClerkToken`
 * normalizes it into the MCP `AuthInfo` shape carrying the Clerk `userId` in
 * `extra`.
 *
 * Audience/resource binding is the authorization server's responsibility: the
 * installed Clerk SDK exposes neither an `audience` option on `auth()` nor token
 * claims, so Clerk's own helper is the supported verification path. The tool
 * boundary re-checks identity and scope in `requireMcpPrincipal`.
 */
export async function verifyMcpAccessToken(
  _req: Request,
  bearerToken?: string,
): Promise<McpAuthInfo | undefined> {
  const clerkAuth = await auth({ acceptsToken: "oauth_token" });
  if (clerkAuth.tokenType !== "oauth_token") return undefined;

  const authInfo = verifyClerkToken(clerkAuth, bearerToken);
  if (!authInfo) return undefined;

  return {
    token: authInfo.token,
    clientId: authInfo.clientId,
    scopes: authInfo.scopes,
    extra: authInfo.extra,
  };
}

/**
 * Second check at the tool boundary: a missing identity is unauthorized, a valid
 * token without `umhelper:read` is forbidden. Never degrades to anonymous.
 */
export function requireMcpPrincipal(authInfo: unknown): { userId: string; scopes: string[] } {
  const info = authInfo as McpAuthInfo | null | undefined;
  const extra = info?.extra ?? {};
  const userId = typeof extra.userId === "string" ? extra.userId : "";

  if (!info?.token || !userId) throw new McpAuthError("unauthorized");

  const scopes = Array.isArray(info.scopes) ? info.scopes : [];
  if (!scopes.includes(MCP_REQUIRED_SCOPE)) throw new McpAuthError("forbidden");

  return { userId, scopes };
}
