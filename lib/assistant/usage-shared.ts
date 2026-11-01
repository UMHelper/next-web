export type UsageTokens = {
  inputTokens: number | null;
  cachedInputTokens?: number | null;
  outputTokens: number | null;
};

export type UsagePricing = {
  inputPerMTok: number | null;
  cachedInputPerMTok: number | null;
  outputPerMTok: number | null;
};

export type AssistantUsageDay = {
  day: string;
  accepted: number;
  completed: number;
  providerErrors: number;
  denied: number;
  rejected: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

export type AssistantUsageRecording =
  | { status: "live" }
  | { status: "preview_readonly" }
  | { status: "dev_quota_bypass" };

export type AssistantUsageSummary = {
  generatedAt: string;
  recording: AssistantUsageRecording;
  limits: { perHour: number; perDay: number };
  current: { chargedTurnsHour: number; chargedTurnsDay: number; denialsToday: number };
  totals: {
    accepted: number;
    completed: number;
    providerErrors: number;
    denied: number;
    rejected: number;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  daily: AssistantUsageDay[];
  cost: { estimate: true; configured: boolean; currency: "USD" };
  error?: "usage_unavailable";
};

export const ASSISTANT_USAGE_DAY_WINDOWS = [7, 14, 30] as const;
export type AssistantUsageDayWindow = (typeof ASSISTANT_USAGE_DAY_WINDOWS)[number];

const DEFAULT_USAGE_DAYS: AssistantUsageDayWindow = 14;

export function parseAssistantUsageDays(
  value: number | string | null | undefined,
): AssistantUsageDayWindow {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (parsed === 7 || parsed === 14 || parsed === 30) return parsed;
  return DEFAULT_USAGE_DAYS;
}
