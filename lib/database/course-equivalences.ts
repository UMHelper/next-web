import supabaseServer from "@/lib/supabase/server";

/**
 * A course code can be a historical equivalent of a newer primary code. All
 * reads go through these helpers so an old URL/search term lands on the new
 * course while historical reviews stay attached to the old row.
 */
export async function resolveCourseCode(code: string): Promise<string> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return normalized;

  const { data, error } = await supabaseServer
    .from("course_equivalences")
    .select("primary_code")
    .eq("equivalent_code", normalized)
    .order("primary_code", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[resolveCourseCode] query failed:", error.message);
    return normalized;
  }

  const primary = data?.primary_code;
  return typeof primary === "string" && primary.length > 0 ? primary.toUpperCase() : normalized;
}

/** Returns `[primary, ...equivalents]` for a course group. */
export async function getCourseGroupCodes(code: string): Promise<string[]> {
  const primary = await resolveCourseCode(code);

  const { data, error } = await supabaseServer
    .from("course_equivalences")
    .select("equivalent_code")
    .eq("primary_code", primary)
    .order("equivalent_code", { ascending: true });

  if (error) {
    console.error("[getCourseGroupCodes] query failed:", error.message);
    return [primary];
  }

  const equivalents = (data ?? [])
    .map((row) => row.equivalent_code)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toUpperCase());

  return Array.from(new Set([primary, ...equivalents]));
}

export function normalizeEquivalentCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((code): code is string => typeof code === "string")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}
