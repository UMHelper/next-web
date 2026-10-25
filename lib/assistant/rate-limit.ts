import { hashUserId } from "@/lib/mcp/rate-limit";
import { consumeRateLimit } from "@/lib/rate-limit";

export const AGENT_HOUR_WINDOW_SECONDS = 3600;
export const AGENT_DAY_WINDOW_SECONDS = 86_400;

export const agentHourKey = (userHash: string) => `agent:user:${userHash}:hour`;
export const agentDayKey = (userHash: string) => `agent:user:${userHash}:day`;

export type AgentRateLimitOutcome =
  | { allowed: true }
  | { allowed: false; window: "hour" | "day"; retryAfter: number };

/** Storage failures throw so the route can fail closed. */
export async function consumeAgentRateLimits(
  userId: string,
  limits: { perHour: number; perDay: number },
): Promise<AgentRateLimitOutcome> {
  const userHash = hashUserId(userId);

  const hour = await consumeRateLimit({
    key: agentHourKey(userHash),
    action: "agent",
    limit: limits.perHour,
    windowSeconds: AGENT_HOUR_WINDOW_SECONDS,
  });
  if (!hour.allowed) return { allowed: false, window: "hour", retryAfter: hour.retryAfter };

  const day = await consumeRateLimit({
    key: agentDayKey(userHash),
    action: "agent",
    limit: limits.perDay,
    windowSeconds: AGENT_DAY_WINDOW_SECONDS,
  });
  if (!day.allowed) return { allowed: false, window: "day", retryAfter: day.retryAfter };

  return { allowed: true };
}
