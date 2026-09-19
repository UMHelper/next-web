import supabaseAdmin from "@/lib/supabase/admin";

const UM_API_BASE = "https://api.data.um.edu.mo/service/academic/course_catalog/all";

function normalizeText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function mapRemoteCourseInfoToLocalPatch(remote: any, local: any, code: string) {
  return {
    New_code: code.toUpperCase(),
    courseTitleEng: normalizeText(remote?.courseTitle) ?? normalizeText(local?.courseTitleEng),
    offeringProgLevel: normalizeText(remote?.offeringProgLevel) ?? normalizeText(local?.offeringProgLevel),
    suggestedYearOfStudy: remote?.suggestedYearOfStudy ?? local?.suggestedYearOfStudy,
    Credits: normalizeText(remote?.credits) ?? normalizeText(local?.Credits),
    Offering_Department: normalizeText(remote?.offeringDept) ?? normalizeText(local?.Offering_Department),
    Offering_Unit: normalizeText(remote?.offeringUnit) ?? normalizeText(local?.Offering_Unit),
    Medium_of_Instruction: normalizeText(remote?.mediumOfInstruction) ?? normalizeText(local?.Medium_of_Instruction),
    gradingSystem: normalizeText(remote?.gradingSystem) ?? normalizeText(local?.gradingSystem),
    courseType: normalizeText(remote?.courseType) ?? normalizeText(local?.courseType),
    Course_Duration: normalizeText(remote?.duration) ?? normalizeText(local?.Course_Duration),
    courseDescription: normalizeText(remote?.courseDescription) ?? normalizeText(local?.courseDescription),
    ilo: normalizeText(remote?.ilo) ?? normalizeText(local?.ilo),
  };
}

function compactPatch(patch: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null && value !== undefined),
  );
}

function buildInsertPatch(patch: Record<string, unknown>, code: string) {
  return {
    New_code: code.toUpperCase(),
    Offering_Unit: "",
    Offering_Department: "",
    Old_code: "",
    courseTitleEng: "",
    courseTitleChi: "",
    Credits: "",
    Course_Duration: "",
    Medium_of_Instruction: "",
    Is_Offered: 0,
    ...patch,
  };
}

export async function fetchUMCourse(code: string) {
  const token = process.env.UM_OPEN_DATA_TOKEN;
  if (!token) throw new Error("UM_OPEN_DATA_TOKEN is not configured");

  const response = await fetch(`${UM_API_BASE}?course_code=${encodeURIComponent(code.toUpperCase())}`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { _embedded?: unknown[] };
  return body?._embedded?.[0] ?? null;
}

export async function syncCourseByCode(code: string) {
  const remote = await fetchUMCourse(code);
  if (!remote) return { code, status: "not_found" as const };

  const { data: local, error: localError } = await supabaseAdmin
    .from("course_noporf")
    .select("*")
    .eq("New_code", code)
    .maybeSingle();
  if (localError) return { code, status: "failed" as const, error: localError.message };

  const mapped = mapRemoteCourseInfoToLocalPatch(remote, local ?? {}, code);
  const patch = compactPatch(mapped);

  if (local) {
    const { error } = await supabaseAdmin.from("course_noporf").update(patch).eq("New_code", code);
    if (error) return { code, status: "failed" as const, error: error.message };
    return { code, status: "updated" as const };
  }

  const { error } = await supabaseAdmin.from("course_noporf").insert([buildInsertPatch(patch, code)]);
  if (error) return { code, status: "failed" as const, error: error.message };
  return { code, status: "created" as const };
}

export async function runSyncUm(options: { mode: "missing" | "all" | "code"; code?: string; limit: number }) {
  let codes: string[] = [];

  if (options.mode === "code" && options.code) {
    codes = [options.code.toUpperCase()];
  } else if (options.mode === "all") {
    const { data, error } = await supabaseAdmin.from("course_noporf").select("New_code").limit(options.limit);
    if (error) throw new Error(error.message);
    codes = (data ?? []).map((row: any) => row.New_code);
  } else {
    const { data, error } = await supabaseAdmin
      .from("course_noporf")
      .select(
        "New_code, courseTitleEng, offeringProgLevel, Credits, Offering_Department, Offering_Unit, Medium_of_Instruction, gradingSystem, courseType, Course_Duration, courseDescription, ilo",
      );
    if (error) throw new Error(error.message);

    codes = (data ?? [])
      .filter((row: any) =>
        !(
          normalizeText(row.courseTitleEng) &&
          normalizeText(row.offeringProgLevel) &&
          normalizeText(row.Credits) &&
          normalizeText(row.Offering_Department) &&
          normalizeText(row.Offering_Unit) &&
          normalizeText(row.Medium_of_Instruction) &&
          normalizeText(row.gradingSystem) &&
          normalizeText(row.courseType) &&
          normalizeText(row.Course_Duration) &&
          normalizeText(row.courseDescription) &&
          normalizeText(row.ilo)
        ),
      )
      .slice(0, options.limit)
      .map((row: any) => row.New_code);
  }

  const stats = { scanned: codes.length, updated: 0, created: 0, not_found: 0, failed: 0 };
  const startedAt = Date.now();

  for (const code of codes) {
    try {
      const result = await syncCourseByCode(code);
      if (result.status === "updated") stats.updated += 1;
      else if (result.status === "created") stats.created += 1;
      else if (result.status === "not_found") stats.not_found += 1;
      else stats.failed += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`[admin/sync-um] ${code} failed:`, error instanceof Error ? error.message : String(error));
    }
  }

  return { ...stats, durationMs: Date.now() - startedAt };
}
