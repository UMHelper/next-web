/** Server, admin UI, and validation share these ceilings; nothing else may widen them. */

export type AssistantLimitKey =
  | "ratePerHour"
  | "ratePerDay"
  | "maxTurns"
  | "historyTurns"
  | "maxSteps"
  | "maxOutputTokens"
  | "timeoutMs";

export type AssistantLimitBounds = { min: number; max: number };

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
