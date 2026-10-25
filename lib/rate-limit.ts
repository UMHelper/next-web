import supabaseServer from "@/lib/supabase/server";
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";

type ConsumeRateLimitInput = {
  key: string;
  action: "comment" | "reply" | "vote" | "report" | "share_read" | "share_write" | "mcp" | "agent";
  limit: number;
  windowSeconds?: number;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

type PreviewBucket = { count: number; resetAt: number };

const previewBuckets = new Map<string, PreviewBucket>();
const PREVIEW_PRUNE_THRESHOLD = 1000;

/**
 * Preview workers must not write rate-limit counters to the production
 * database, so they count in memory per isolate. Good enough for testing.
 */
function consumePreviewRateLimit(input: ConsumeRateLimitInput, windowSeconds: number) {
  const now = Date.now();

  if (previewBuckets.size > PREVIEW_PRUNE_THRESHOLD) {
    for (const [key, bucket] of previewBuckets) {
      if (bucket.resetAt <= now) previewBuckets.delete(key);
    }
  }

  const bucketKey = `${input.action}:${windowSeconds}:${input.key}`;
  let bucket = previewBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    previewBuckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    retryAfter: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export async function consumeRateLimit(input: ConsumeRateLimitInput) {
  const windowSeconds = input.windowSeconds ?? 3600;
  if (isReadonlyPreview()) {
    return consumePreviewRateLimit(input, windowSeconds);
  }
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
