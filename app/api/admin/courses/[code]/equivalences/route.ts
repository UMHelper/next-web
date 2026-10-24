import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import { resolveCourseCode } from "@/lib/database/course-equivalences";
import supabaseAdmin from "@/lib/supabase/admin";
import { courseEquivalencesSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

async function loadEquivalences(code: string) {
  const primary = await resolveCourseCode(code);
  const { data, error } = await supabaseAdmin
    .from("course_equivalences")
    .select("equivalent_code,source,confidence")
    .eq("primary_code", primary)
    .order("equivalent_code", { ascending: true });

  if (error) throw error;

  return {
    primary_code: primary,
    equivalents: (data ?? []).map((row) => ({
      code: String(row.equivalent_code),
      source: row.source,
      confidence: row.confidence,
    })),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).trim().toUpperCase();
  if (!code) return apiError("invalid_request", "Invalid course code", 400);

  try {
    return NextResponse.json(await loadEquivalences(code));
  } catch (error) {
    console.error("[admin/courses/equivalences] failed to load:", error instanceof Error ? error.message : error);
    return apiError("internal_error", "Unable to load course equivalences", 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).trim().toUpperCase();
  if (!code) return apiError("invalid_request", "Invalid course code", 400);

  const bodyResult = await readJsonBody(request, 16_384);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = courseEquivalencesSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid equivalence payload", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const primary = await resolveCourseCode(code);

  const before = await loadEquivalences(primary).catch(() => null);

  const { data, error } = await supabaseAdmin.rpc("admin_set_course_equivalences", {
    p_primary: primary,
    p_equivalents: parsed.data.equivalent_codes,
    p_source: "manual:admin",
  });

  if (error) {
    console.error("[admin/courses/equivalences] update failed:", error.message);
    return apiError("invalid_request", error.message, 400);
  }

  const after = await loadEquivalences(primary).catch(() => null);

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "course.equivalence",
    targetType: "course",
    targetId: primary,
    before,
    after,
  });

  return NextResponse.json({ result: data, ...(after ?? { primary_code: primary, equivalents: [] }) });
}
