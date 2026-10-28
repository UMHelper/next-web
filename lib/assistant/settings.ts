import "server-only";

import { unstable_cache } from "next/cache";

import { readAssistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";
import supabaseAdmin from "@/lib/supabase/admin";

export type AssistantLimitKey =
  | "ratePerHour"
  | "ratePerDay"
  | "maxTurns"
  | "historyTurns"
  | "maxSteps"
  | "maxOutputTokens"
  | "timeoutMs";

type AssistantLimitBounds = { min: number; max: number };

export const ASSISTANT_LIMIT_BOUNDS: Record<AssistantLimitKey, AssistantLimitBounds> = {
  ratePerHour: { min: 1, max: 500 },
  ratePerDay: { min: 1, max: 2_000 },
  maxTurns: { min: 1, max: 100 },
  historyTurns: { min: 0, max: 20 },
  maxSteps: { min: 1, max: 12 },
  maxOutputTokens: { min: 128, max: 4_096 },
  timeoutMs: { min: 5_000, max: 60_000 },
};

export type AssistantLimitField = {
  column: `ai_${string}`;
  key: AssistantLimitKey;
  env: string;
};

export const ASSISTANT_LIMIT_FIELDS: readonly AssistantLimitField[] = [
  { column: "ai_quota_per_hour", key: "ratePerHour", env: "AGENT_RATE_LIMIT_PER_HOUR" },
  { column: "ai_quota_per_day", key: "ratePerDay", env: "AGENT_RATE_LIMIT_PER_DAY" },
  { column: "ai_max_turns", key: "maxTurns", env: "AGENT_MAX_TURNS_PER_CONVERSATION" },
  { column: "ai_history_turns", key: "historyTurns", env: "AGENT_HISTORY_TURNS" },
  { column: "ai_max_steps", key: "maxSteps", env: "AGENT_MAX_STEPS" },
  { column: "ai_max_output_tokens", key: "maxOutputTokens", env: "AI_MAX_OUTPUT_TOKENS" },
  { column: "ai_timeout_ms", key: "timeoutMs", env: "AI_TIMEOUT_MS" },
];

export type AssistantLimitOverrides = Partial<Record<AssistantLimitKey, number | null>>;

const SELECT_COLUMNS = ASSISTANT_LIMIT_FIELDS.map((field) => field.column).join(", ");

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Raw nullable database values. Every failure falls back to environment defaults. */
export async function readAssistantLimitOverrides(): Promise<AssistantLimitOverrides> {
  if (isReadonlyPreview()) return {};

  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select(SELECT_COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[assistant-settings] limit read failed:", error.message);
      return {};
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const overrides: AssistantLimitOverrides = {};
    for (const field of ASSISTANT_LIMIT_FIELDS) {
      const value = row[field.column];
      overrides[field.key] = typeof value === "number" ? value : null;
    }
    return overrides;
  } catch (error) {
    console.error("[assistant-settings] limit read threw:", describeError(error));
    return {};
  }
}

const getAssistantLimitOverrides = unstable_cache(
  readAssistantLimitOverrides,
  ["assistant-limits"],
  { tags: [CACHE_TAGS.appConfig], revalidate: 300 },
);

function clamp(value: number, bounds: AssistantLimitBounds) {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * Environment defaults overlaid by administrator values, then clamped to the
 * absolute code ceilings. A null column resets the field to its environment value.
 */
export async function resolveAssistantConfig(
  env: Record<string, string | undefined> = process.env,
): Promise<AssistantConfig> {
  const base = readAssistantConfig(env);
  const overrides = await getAssistantLimitOverrides();
  const resolved = { ...base };

  for (const field of ASSISTANT_LIMIT_FIELDS) {
    const candidate = overrides[field.key] ?? base[field.key];
    resolved[field.key] = clamp(candidate, ASSISTANT_LIMIT_BOUNDS[field.key]);
  }

  return resolved;
}
