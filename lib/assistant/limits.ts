/** Shared limit field metadata. Minimums are fixed; maximum is Postgres integer range only. */

export type AssistantLimitKey =
  | "ratePerHour"
  | "ratePerDay"
  | "maxTurns"
  | "historyTurns"
  | "maxSteps"
  | "maxOutputTokens"
  | "timeoutMs";

/** Upper bound for `integer` columns in `app_config` and API validation. */
export const ASSISTANT_LIMIT_INTEGER_MAX = 2_147_483_647;

export const ASSISTANT_LIMIT_MIN: Record<AssistantLimitKey, number> = {
  ratePerHour: 1,
  ratePerDay: 1,
  maxTurns: 1,
  historyTurns: 0,
  maxSteps: 1,
  maxOutputTokens: 1,
  timeoutMs: 1,
};

export type AssistantLimitField = {
  column: `ai_${string}`;
  key: AssistantLimitKey;
  env: string;
  label: string;
  unit: "requests" | "turns" | "steps" | "tokens" | "milliseconds";
};

export const ASSISTANT_LIMIT_FIELDS: readonly AssistantLimitField[] = [
  { column: "ai_quota_per_hour", key: "ratePerHour", env: "AGENT_RATE_LIMIT_PER_HOUR", label: "Turns per hour", unit: "requests" },
  { column: "ai_quota_per_day", key: "ratePerDay", env: "AGENT_RATE_LIMIT_PER_DAY", label: "Turns per day", unit: "requests" },
  { column: "ai_max_turns", key: "maxTurns", env: "AGENT_MAX_TURNS_PER_CONVERSATION", label: "Turns per conversation", unit: "turns" },
  { column: "ai_history_turns", key: "historyTurns", env: "AGENT_HISTORY_TURNS", label: "History turns sent", unit: "turns" },
  { column: "ai_max_steps", key: "maxSteps", env: "AGENT_MAX_STEPS", label: "Steps per run", unit: "steps" },
  { column: "ai_max_output_tokens", key: "maxOutputTokens", env: "AI_MAX_OUTPUT_TOKENS", label: "Output tokens per step", unit: "tokens" },
  { column: "ai_timeout_ms", key: "timeoutMs", env: "AI_TIMEOUT_MS", label: "Run timeout", unit: "milliseconds" },
];

export type AssistantLimitOverrides = Partial<Record<AssistantLimitKey, number | null>>;

export function normalizeAssistantLimit(key: AssistantLimitKey, value: number): number {
  const rounded = Math.round(value);
  const min = ASSISTANT_LIMIT_MIN[key];
  return Math.min(ASSISTANT_LIMIT_INTEGER_MAX, Math.max(min, rounded));
}
