import { z } from "zod/v4";

import type { ToolFailure } from "@/lib/assistant/tools";

export type ToolResultFailure =
  | "invalid_request"
  | "not_found"
  | "temporarily_unavailable"
  | "malformed";

const FAILURE_CODES = [
  "invalid_request",
  "not_found",
  "temporarily_unavailable",
] as const satisfies readonly ToolFailure["error"][];

const toolFailureSchema = z.object({ error: z.enum(FAILURE_CODES) }).strict();

export function parseToolResult<T>(
  content: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; reason: ToolResultFailure } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const output = schema.safeParse(parsed);
  if (output.success) {
    return { ok: true, data: output.data };
  }

  const failure = toolFailureSchema.safeParse(parsed);
  if (failure.success) {
    return { ok: false, reason: failure.data.error };
  }

  return { ok: false, reason: "malformed" };
}
