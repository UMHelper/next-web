import supabaseServer from "@/lib/supabase/server";

export type CourseAlias = { primaryCode: string; aka: string[] };

function readCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Resolve a primary or old course code through the public `course_catalog`
 * view. The primary code is authoritative; every old code is returned as `aka`.
 */
export async function resolveCourseAlias(code: string): Promise<CourseAlias> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(normalized)) return { primaryCode: normalized, aka: [] };

  const { data, error } = await supabaseServer
    .from("course_catalog")
    .select("New_code,equivalent_codes")
    .or(`New_code.eq.${normalized},equivalent_codes.cs.{${normalized}}`)
    .limit(1)
    .maybeSingle();

  if (error || !data?.New_code) return { primaryCode: normalized, aka: [] };

  return {
    primaryCode: String(data.New_code).toUpperCase(),
    aka: readCodes(data.equivalent_codes),
  };
}
