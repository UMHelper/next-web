import supabaseServer from "@/lib/supabase/server";

type ConsumeRateLimitInput = {
  key: string;
  action: "comment" | "reply" | "vote" | "report";
  limit: number;
  windowSeconds?: number;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

export async function consumeRateLimit(input: ConsumeRateLimitInput) {
  const windowSeconds = input.windowSeconds ?? 3600;
  const { data, error } = await supabaseServer.rpc("consume_rate_limit", {
    target_key: input.key,
    window_seconds: windowSeconds,
    max_hits: input.limit,
  });

  if (error) {
    throw new Error(`rate limit failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
  if (!row) {
    throw new Error("rate limit returned no row");
  }

  const resetAt = new Date(row.reset_at).getTime();
  const retryAfter = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));

  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfter,
  };
}
