import "server-only";

import {
  resolveOutcome,
  type RunTelemetry,
  type UsageOutcome,
} from "@/lib/assistant/telemetry";
import type { TurnIdentity } from "@/lib/assistant/turn-key";
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

/** Best-effort persistence. A usage write never blocks or fails a response. */
export async function finalizeRunUsage(
  telemetry: RunTelemetry,
  outcomeHint?: UsageOutcome,
): Promise<void> {
  if (isReadonlyPreview()) return;

  const outcome = resolveOutcome(telemetry, outcomeHint);
  try {
    const { error } = await supabaseAdmin
      .from("assistant_usage_events")
      .update({
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
      })
      .eq("run_key", telemetry.runKey);

    if (error) {
      console.warn("[assistant-telemetry] finalize failed:", error.message);
    }
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
