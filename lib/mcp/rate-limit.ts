import { createHash } from "node:crypto";

import { consumeRateLimit } from "@/lib/rate-limit";

export const MCP_USER_MINUTE_LIMIT = 60;
export const MCP_USER_MINUTE_WINDOW_SECONDS = 60;
export const MCP_TOOL_HOUR_LIMIT = 300;
export const MCP_TOOL_HOUR_WINDOW_SECONDS = 3600;

/**
 * Irreversible user hash used in rate-limit keys and logs. The raw Clerk user id
 * is never persisted in counter keys or emitted to telemetry.
 */
export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

export function mcpMinuteKey(userHash: string): string {
  return `mcp:user:${userHash}:minute`;
}

export function mcpToolHourKey(userHash: string, toolName: string): string {
  return `mcp:user:${userHash}:tool:${toolName}:hour`;
}

export type McpRateLimitOutcome =
  | { allowed: true; retryAfter: 0 }
  | { allowed: false; retryAfter: number };

/**
 * Consume the per-user minute tier first, then the per-user/per-tool hour tier.
 * A rejection short-circuits before the data layer runs. Storage failures throw
 * so the executor can fail closed with `temporarily_unavailable`.
 */
export async function consumeMcpRateLimits(
  userId: string,
  toolName: string,
): Promise<McpRateLimitOutcome> {
  const userHash = hashUserId(userId);

  const minute = await consumeRateLimit({
    key: mcpMinuteKey(userHash),
    action: "mcp",
    limit: MCP_USER_MINUTE_LIMIT,
    windowSeconds: MCP_USER_MINUTE_WINDOW_SECONDS,
  });
  if (!minute.allowed) return { allowed: false, retryAfter: minute.retryAfter };

  const hour = await consumeRateLimit({
    key: mcpToolHourKey(userHash, toolName),
    action: "mcp",
    limit: MCP_TOOL_HOUR_LIMIT,
    windowSeconds: MCP_TOOL_HOUR_WINDOW_SECONDS,
  });
  if (!hour.allowed) return { allowed: false, retryAfter: hour.retryAfter };

  return { allowed: true, retryAfter: 0 };
}
