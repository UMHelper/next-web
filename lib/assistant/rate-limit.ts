import type { RunMessage } from "@/lib/assistant/conversation";
import { deriveTurnIdentity, type TurnIdentity } from "@/lib/assistant/turn-key";
import { isRateLimitDisabled } from "@/lib/rate-limit";
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";
import supabaseServer from "@/lib/supabase/server";

export const AGENT_HOUR_WINDOW_SECONDS = 3600;
export const AGENT_DAY_WINDOW_SECONDS = 86_400;
export const AGENT_TURN_REPLAY_MS = 5 * 60 * 1000;

export const agentHourKey = (userHash: string) => `agent:user:${userHash}:hour`;
export const agentDayKey = (userHash: string) => `agent:user:${userHash}:day`;

export type AgentTurnClaim =
  | { allowed: true; charged: boolean; identity: TurnIdentity }
  | { allowed: false; window: "hour" | "day"; retryAfter: number; identity: TurnIdentity };

export type AgentTurnClaimInput = {
  userId: string;
  threadId: string | undefined;
  messages: RunMessage[];
  runKey: string;
  limits: { perHour: number; perDay: number };
};

type ClaimRow = {
  allowed: boolean;
  charged: boolean;
  window_kind: string | null;
  retry_after: number | string | null;
};

type PreviewBucket = { startedAt: number; count: number };

const previewTurns = new Map<string, number>();
const previewBuckets = new Map<string, PreviewBucket>();
const PREVIEW_PRUNE_THRESHOLD = 1000;

function previewBucket(key: string, windowMs: number, now: number): PreviewBucket {
  const existing = previewBuckets.get(key);
  if (!existing || now - existing.startedAt >= windowMs) {
    const fresh = { startedAt: now, count: 0 };
    previewBuckets.set(key, fresh);
    return fresh;
  }
  return existing;
}

function claimPreview(input: AgentTurnClaimInput, identity: TurnIdentity): AgentTurnClaim {
  const now = Date.now();
  if (previewBuckets.size > PREVIEW_PRUNE_THRESHOLD) {
    for (const [key, bucket] of previewBuckets) {
      if (now - bucket.startedAt >= AGENT_DAY_WINDOW_SECONDS * 1000) previewBuckets.delete(key);
    }
  }

  const turnKey = `${identity.userHash}:${identity.turnKey}`;
  const chargedAt = previewTurns.get(turnKey);
  if (chargedAt !== undefined && now - chargedAt < AGENT_TURN_REPLAY_MS) {
    return { allowed: true, charged: false, identity };
  }

  const hour = previewBucket(agentHourKey(identity.userHash), AGENT_HOUR_WINDOW_SECONDS * 1000, now);
  const day = previewBucket(agentDayKey(identity.userHash), AGENT_DAY_WINDOW_SECONDS * 1000, now);

  if (hour.count + 1 > input.limits.perHour) {
    return {
      allowed: false,
      window: "hour",
      retryAfter: Math.max(0, Math.ceil((hour.startedAt + AGENT_HOUR_WINDOW_SECONDS * 1000 - now) / 1000)),
      identity,
    };
  }
  if (day.count + 1 > input.limits.perDay) {
    return {
      allowed: false,
      window: "day",
      retryAfter: Math.max(0, Math.ceil((day.startedAt + AGENT_DAY_WINDOW_SECONDS * 1000 - now) / 1000)),
      identity,
    };
  }

  hour.count += 1;
  day.count += 1;
  previewTurns.set(turnKey, now);
  return { allowed: true, charged: true, identity };
}

function toClaim(row: ClaimRow, identity: TurnIdentity): AgentTurnClaim {
  if (row.allowed) return { allowed: true, charged: Boolean(row.charged), identity };
  return {
    allowed: false,
    window: row.window_kind === "day" ? "day" : "hour",
    retryAfter: Math.max(0, Math.ceil(Number(row.retry_after ?? 0))),
    identity,
  };
}

/**
 * Claims exactly one quota unit for a logical turn. Retries and frontend-tool
 * continuations reuse the existing charge for five minutes. Storage failures
 * throw so the route can fail closed.
 */
export async function claimAgentTurn(input: AgentTurnClaimInput): Promise<AgentTurnClaim> {
  const identity = deriveTurnIdentity(input);

  if (isRateLimitDisabled()) {
    return { allowed: true, charged: false, identity };
  }

  if (isReadonlyPreview()) {
    return claimPreview(input, identity);
  }

  const { data, error } = await supabaseServer.rpc("claim_assistant_turn", {
    target_user_hash: identity.userHash,
    target_turn_key: identity.turnKey,
    target_thread_hash: identity.threadHash,
    target_run_key: input.runKey,
    target_is_continuation: identity.isContinuation,
    hour_limit: input.limits.perHour,
    day_limit: input.limits.perDay,
  });

  if (error) {
    throw new Error(`quota claim failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null;
  if (!row) {
    throw new Error("quota claim returned no row");
  }

  return toClaim(row, identity);
}
