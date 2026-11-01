import "server-only";

import {
  resolveOutcome,
  type RunTelemetry,
  type UsageOutcome,
} from "@/lib/assistant/telemetry";
import type { TurnIdentity } from "@/lib/assistant/turn-key";
import { isRateLimitDisabled } from "@/lib/rate-limit";
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";
import supabaseAdmin from "@/lib/supabase/admin";

export const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let lastPruneAt: number | null = null;

/**
 * Opportunistic retention: no scheduler exists, so an isolate prunes its
 * service-role tables at most once every six hours after a finalized run.
 */
export async function maybePruneAssistantTelemetry(now: number = Date.now()): Promise<void> {
  if (isReadonlyPreview()) return;
  if (lastPruneAt !== null && now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;

  try {
    const { error } = await supabaseAdmin.rpc("prune_assistant_telemetry");
    if (error) {
      console.warn("[assistant-telemetry] prune failed:", error.message);
    }
  } catch (error) {
    console.warn(
      "[assistant-telemetry] prune threw:",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

function finalizeUsagePayload(telemetry: RunTelemetry, outcome: UsageOutcome) {
  return {
    outcome,
    is_continuation: telemetry.isContinuation,
    charged: telemetry.charged,
    duration_ms: Math.max(0, Date.now() - telemetry.startedAt),
    steps: telemetry.steps,
    tool_calls: telemetry.toolCalls,
    input_tokens: telemetry.inputTokens,
    cached_input_tokens: telemetry.cachedInputTokens,
    output_tokens: telemetry.outputTokens,
    reasoning_tokens: telemetry.reasoningTokens,
    error_class: telemetry.errorClass,
  };
}

/** Dev bypass skips claim_assistant_turn; mirror charge rows so admin counters move. */
async function recordDevTurnCharge(telemetry: RunTelemetry): Promise<void> {
  if (!isRateLimitDisabled()) return;

  try {
    const { error } = await supabaseAdmin.from("assistant_turn_charges").upsert(
      {
        user_hash: telemetry.userHash,
        turn_key: telemetry.turnKey,
        charged_at: new Date().toISOString(),
        continuations: 0,
      },
      { onConflict: "user_hash,turn_key" },
    );

    if (error) {
      console.warn("[assistant-telemetry] dev charge upsert failed:", error.message);
    }
  } catch (error) {
    console.warn(
      "[assistant-telemetry] dev charge upsert threw:",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/** Best-effort persistence. A usage write never blocks or fails a response. */
export async function finalizeRunUsage(
  telemetry: RunTelemetry,
  outcomeHint?: UsageOutcome,
): Promise<void> {
  if (isReadonlyPreview()) return;

  const outcome = resolveOutcome(telemetry, outcomeHint);
  const payload = finalizeUsagePayload(telemetry, outcome);

  try {
    const { data, error } = await supabaseAdmin
      .from("assistant_usage_events")
      .update(payload)
      .eq("run_key", telemetry.runKey)
      .select("run_key");

    if (error) {
      console.warn("[assistant-telemetry] finalize failed:", error.message);
      return;
    }

    if (!data?.length) {
      const { error: insertError } = await supabaseAdmin.from("assistant_usage_events").insert([
        {
          run_key: telemetry.runKey,
          user_hash: telemetry.userHash,
          thread_hash: telemetry.threadHash,
          turn_key: telemetry.turnKey,
          ...payload,
        },
      ]);

      if (insertError) {
        console.warn("[assistant-telemetry] finalize insert failed:", insertError.message);
      }
    }

    await recordDevTurnCharge(telemetry);
  } catch (error) {
    console.warn(
      "[assistant-telemetry] finalize threw:",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/** Records a request rejected before execution. Best-effort and content-free. */
export async function recordRejectedRun(input: {
  runKey: string;
  identity: TurnIdentity;
}): Promise<void> {
  if (isReadonlyPreview()) return;

  try {
    const { error } = await supabaseAdmin.from("assistant_usage_events").insert([
      {
        run_key: input.runKey,
        user_hash: input.identity.userHash,
        thread_hash: input.identity.threadHash,
        turn_key: input.identity.turnKey,
        outcome: "rejected",
        is_continuation: input.identity.isContinuation,
        charged: false,
      },
    ]);

    if (error) {
      console.warn("[assistant-telemetry] rejection insert failed:", error.message);
    }
  } catch (error) {
    console.warn(
      "[assistant-telemetry] rejection insert threw:",
      error instanceof Error ? error.message : "unknown",
    );
  }
}
