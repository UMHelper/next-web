import { readAssistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import { ASSISTANT_LIMIT_FIELDS, type AssistantLimitKey } from "@/lib/assistant/limits";

const COLUMN_TO_KEY = Object.fromEntries(
  ASSISTANT_LIMIT_FIELDS.map((field) => [field.column, field.key]),
) as Record<string, AssistantLimitKey>;

/** Effective limit for audit display (matches admin UI and runtime resolution). */
export function effectiveAssistantLimit(
  column: string,
  stored: unknown,
  env: AssistantConfig = readAssistantConfig(),
): number {
  if (typeof stored === "number") return stored;
  const key = COLUMN_TO_KEY[column];
  return key ? env[key] : 0;
}

export function buildAssistantLimitAuditDiff(
  columns: string[],
  row: Record<string, unknown>,
  patch: Record<string, unknown>,
  env: AssistantConfig = readAssistantConfig(),
) {
  const before = Object.fromEntries(
    columns.map((column) => [column, effectiveAssistantLimit(column, row[column], env)]),
  );
  const after = Object.fromEntries(
    columns.map((column) => {
      if (!(column in patch)) {
        return [column, effectiveAssistantLimit(column, row[column], env)];
      }
      const next = patch[column];
      if (next === null) {
        return [column, effectiveAssistantLimit(column, null, env)];
      }
      if (typeof next === "number") return [column, next];
      return [column, effectiveAssistantLimit(column, row[column], env)];
    }),
  );
  return { before, after };
}
