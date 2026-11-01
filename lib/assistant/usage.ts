import "server-only";

import { readAssistantConfig } from "@/lib/assistant/config";
import { resolveAssistantConfig } from "@/lib/assistant/settings";
import supabaseAdmin from "@/lib/supabase/admin";

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

export type AssistantUsageSummary = {
  generatedAt: string;
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

const DAILY_ROWS = 14;
const TOKENS_PER_MTOK = 1_000_000;

const parsePrice = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function readUsagePricing(
  env: Record<string, string | undefined> = process.env,
): UsagePricing {
  return {
    inputPerMTok: parsePrice(env.AI_PRICE_INPUT_PER_MTOK),
    cachedInputPerMTok: parsePrice(env.AI_PRICE_CACHED_INPUT_PER_MTOK),
    outputPerMTok: parsePrice(env.AI_PRICE_OUTPUT_PER_MTOK),
  };
}

/**
 * Estimated, never billed: provider token counts times configured list prices.
 * Cached input is a subset of input tokens, so it is priced separately.
 */
export function estimateUsageCost(
  tokens: UsageTokens,
  pricing: UsagePricing,
): number | null {
  if (!pricing.inputPerMTok || !pricing.outputPerMTok) return null;
  if (tokens.inputTokens == null || tokens.outputTokens == null) return null;

  const cached = Math.min(tokens.cachedInputTokens ?? 0, tokens.inputTokens);
  const uncached = tokens.inputTokens - cached;
  const cachedPrice = pricing.cachedInputPerMTok ?? pricing.inputPerMTok;

  const inputCost = (uncached * pricing.inputPerMTok + cached * cachedPrice) / TOKENS_PER_MTOK;
  const outputCost = (tokens.outputTokens * pricing.outputPerMTok) / TOKENS_PER_MTOK;
  return Number((inputCost + outputCost).toFixed(6));
}

type DailyRow = {
  day: string;
  accepted: number | string;
  completed: number | string;
  provider_errors: number | string;
  denied: number | string;
  rejected: number | string;
  input_tokens: number | string | null;
  cached_input_tokens: number | string | null;
  output_tokens: number | string | null;
};

const count = (value: number | string | null | undefined): number =>
  value == null ? 0 : Number(value);

const sumTokens = (
  rows: readonly DailyRow[],
  key: "input_tokens" | "output_tokens",
): number | null => {
  let total: number | null = null;
  for (const row of rows) {
    if (row[key] == null) continue;
    total = (total ?? 0) + Number(row[key]);
  }
  return total;
};

function toDay(row: DailyRow, pricing: UsagePricing): AssistantUsageDay {
  const inputTokens = row.input_tokens == null ? null : Number(row.input_tokens);
  const outputTokens = row.output_tokens == null ? null : Number(row.output_tokens);
  return {
    day: row.day,
    accepted: count(row.accepted),
    completed: count(row.completed),
    providerErrors: count(row.provider_errors),
    denied: count(row.denied),
    rejected: count(row.rejected),
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateUsageCost(
      {
        inputTokens,
        cachedInputTokens: row.cached_input_tokens == null ? null : Number(row.cached_input_tokens),
        outputTokens,
      },
      pricing,
    ),
  };
}

async function headCount(
  table: "assistant_turn_charges" | "assistant_usage_events",
  options: { column: string; since: string; outcome?: string },
): Promise<number> {
  let query = supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(options.column, options.since);
  if (options.outcome) query = query.eq("outcome", options.outcome);

  const { count: rows, error } = await query;
  if (error) throw new Error(error.message);
  return rows ?? 0;
}

/** Aggregates only. No user hash, thread hash, prompt, or reply leaves this module. */
export async function readAssistantUsageSummary(
  now: Date = new Date(),
): Promise<AssistantUsageSummary> {
  const pricing = readUsagePricing();
  const configured = Boolean(pricing.inputPerMTok && pricing.outputPerMTok);

  const hourSince = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const daySince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  let base: { perHour: number; perDay: number };
  try {
    const config = await resolveAssistantConfig();
    base = { perHour: config.ratePerHour, perDay: config.ratePerDay };
  } catch {
    const config = readAssistantConfig();
    base = { perHour: config.ratePerHour, perDay: config.ratePerDay };
  }

  let unavailable = false;
  let chargedTurnsHour = 0;
  let chargedTurnsDay = 0;
  let denialsToday = 0;
  try {
    [chargedTurnsHour, chargedTurnsDay, denialsToday] = await Promise.all([
      headCount("assistant_turn_charges", { column: "charged_at", since: hourSince }),
      headCount("assistant_turn_charges", { column: "charged_at", since: daySince }),
      headCount("assistant_usage_events", {
        column: "occurred_at",
        since: todayStart.toISOString(),
        outcome: "denied_quota",
      }),
    ]);
  } catch {
    unavailable = true;
  }

  let rows: DailyRow[] = [];
  try {
    const { data, error } = await supabaseAdmin.rpc("assistant_usage_daily", {
      target_days: DAILY_ROWS,
    });
    if (error) {
      unavailable = true;
    } else {
      rows = Array.isArray(data) ? (data as DailyRow[]) : [];
    }
  } catch {
    unavailable = true;
  }

  const daily = rows.map((row) => toDay(row, pricing));

  return {
    generatedAt: now.toISOString(),
    limits: base,
    current: { chargedTurnsHour, chargedTurnsDay, denialsToday },
    totals: {
      accepted: daily.reduce((total, day) => total + day.accepted, 0),
      completed: daily.reduce((total, day) => total + day.completed, 0),
      providerErrors: daily.reduce((total, day) => total + day.providerErrors, 0),
      denied: daily.reduce((total, day) => total + day.denied, 0),
      rejected: daily.reduce((total, day) => total + day.rejected, 0),
      inputTokens: sumTokens(rows, "input_tokens"),
      outputTokens: sumTokens(rows, "output_tokens"),
    },
    daily,
    cost: { estimate: true, configured, currency: "USD" },
    ...(unavailable ? { error: "usage_unavailable" as const } : {}),
  };
}
