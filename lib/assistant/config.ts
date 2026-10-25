export type ThinkingMode = "off" | "low";

export type AssistantConfig = {
  apiKey: string | undefined;
  baseURL: string;
  model: string;
  thinking: ThinkingMode;
  maxOutputTokens: number;
  timeoutMs: number;
  ratePerHour: number;
  ratePerDay: number;
  maxTurns: number;
  historyTurns: number;
};

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function readAssistantConfig(
  env: Record<string, string | undefined> = process.env,
): AssistantConfig {
  return {
    apiKey: env.AI_API_KEY || undefined,
    baseURL: env.AI_BASE_URL || "https://api.deepseek.com",
    model: env.AI_MODEL || "deepseek-flash",
    thinking: env.AI_THINKING === "low" ? "low" : "off",
    maxOutputTokens: positiveInt(env.AI_MAX_OUTPUT_TOKENS, 2_000),
    timeoutMs: positiveInt(env.AI_TIMEOUT_MS, 30_000),
    ratePerHour: positiveInt(env.AGENT_RATE_LIMIT_PER_HOUR, 30),
    ratePerDay: positiveInt(env.AGENT_RATE_LIMIT_PER_DAY, 80),
    maxTurns: positiveInt(env.AGENT_MAX_TURNS_PER_CONVERSATION, 30),
    historyTurns: positiveInt(env.AGENT_HISTORY_TURNS, 8),
  };
}
