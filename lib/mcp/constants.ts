export const MCP_RESOURCE_URL = "https://umeh.top/mcp";
export const MCP_REQUIRED_SCOPE = "umhelper:read";
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";
export const MCP_RESOURCE_PATH = "/mcp";
export const MCP_MAX_BODY_BYTES = 64 * 1024;
export const MCP_MAX_RESULT_BYTES = 64 * 1024;
export const MCP_TOOL_TIMEOUT_MS = 10_000;

/**
 * True when the bundle was built for production.
 *
 * Next inlines `process.env.NODE_ENV` at build time, so in the production bundle
 * this is the literal `true` and the development branch below becomes dead code.
 * That is deliberate: production must never be able to advertise a local origin
 * because of a runtime environment mistake.
 */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resource identifier advertised to MCP clients (RFC 9728 `resource` and the
 * 401 challenge's `resource_metadata` origin).
 *
 * Production is the exact pinned `https://umeh.top/mcp`. `next dev` derives it
 * from the incoming request instead, so local OAuth discovery stays
 * self-consistent on any dev port, host or tunnel — otherwise a local server
 * would send clients to the production metadata while holding dev Clerk keys,
 * and the token they receive could never be verified locally.
 */
export function resolveMcpResourceUrl(request: Request): string {
  if (isProductionRuntime()) return MCP_RESOURCE_URL;
  return new URL(MCP_RESOURCE_PATH, new URL(request.url).origin).toString();
}
