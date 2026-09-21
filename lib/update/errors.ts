// Formats supabase-js / PostgREST errors into a readable, non-empty message.
export function formatRpcError(error: unknown, fallback = "RPC failed"): string {
  if (!error) return fallback;
  if (error instanceof Error) return error.message || fallback;

  const record = error as Record<string, unknown>;
  const parts = [record.message, record.details, record.hint, record.code]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (parts.length > 0) return parts.join(" | ");

  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : fallback;
  } catch {
    return fallback;
  }
}
