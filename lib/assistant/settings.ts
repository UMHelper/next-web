import "server-only";

import { unstable_cache } from "next/cache";

import { readAssistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import {
  ASSISTANT_LIMIT_BOUNDS,
  ASSISTANT_LIMIT_FIELDS,
  type AssistantLimitBounds,
  type AssistantLimitOverrides,
} from "@/lib/assistant/limits";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";
import supabaseAdmin from "@/lib/supabase/admin";

export {
  ASSISTANT_LIMIT_BOUNDS,
  ASSISTANT_LIMIT_FIELDS,
  type AssistantLimitField,
  type AssistantLimitKey,
  type AssistantLimitOverrides,
} from "@/lib/assistant/limits";

const SELECT_COLUMNS = ASSISTANT_LIMIT_FIELDS.map((field) => field.column).join(", ");

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Raw nullable database values. Every failure falls back to environment defaults. */
export async function readAssistantLimitOverrides(): Promise<AssistantLimitOverrides> {
  if (isReadonlyPreview()) return {};

  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select(SELECT_COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[assistant-settings] limit read failed:", error.message);
      return {};
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const overrides: AssistantLimitOverrides = {};
    for (const field of ASSISTANT_LIMIT_FIELDS) {
      const value = row[field.column];
      overrides[field.key] = typeof value === "number" ? value : null;
    }
    return overrides;
  } catch (error) {
    console.error("[assistant-settings] limit read threw:", describeError(error));
    return {};
  }
}

const getAssistantLimitOverrides = unstable_cache(
  readAssistantLimitOverrides,
  ["assistant-limits"],
  { tags: [CACHE_TAGS.appConfig], revalidate: 300 },
);

function clamp(value: number, bounds: AssistantLimitBounds) {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * Environment defaults overlaid by administrator values, then clamped to the
 * absolute code ceilings. A null column resets the field to its environment value.
 */
export async function resolveAssistantConfig(
  env: Record<string, string | undefined> = process.env,
): Promise<AssistantConfig> {
  const base = readAssistantConfig(env);
  const overrides = await getAssistantLimitOverrides();
  const resolved = { ...base };

  for (const field of ASSISTANT_LIMIT_FIELDS) {
    const candidate = overrides[field.key] ?? base[field.key];
    resolved[field.key] = clamp(candidate, ASSISTANT_LIMIT_BOUNDS[field.key]);
  }

  return resolved;
}
