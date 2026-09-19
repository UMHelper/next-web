import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { courseUpdateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { code: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const code = decodeURIComponent(params.code).toUpperCase();
  if (!/^[A-Z]{4}\d{4}$/.test(code)) {
    return apiError("invalid_request", "Invalid course code", 400);
  }

  const bodyResult = await readJsonBody(request, 32_768);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = courseUpdateSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid course update", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const { data: before, error: beforeError } = await supabaseAdmin
    .from("course_noporf")
    .select("*")
    .eq("New_code", code)
    .maybeSingle();

  if (beforeError) {
    console.error("[admin/courses] failed to load course:", beforeError.message);
    return apiError("internal_error", "Unable to load course", 500);
  }
  if (!before) return apiError("not_found", "Course not found", 404);

  const { data: after, error: updateError } = await supabaseAdmin
    .from("course_noporf")
    .update(parsed.data)
    .eq("New_code", code)
    .select("*")
    .single();

  if (updateError || !after) {
    console.error("[admin/courses] update failed:", updateError?.message ?? "no data");
    return apiError("internal_error", "Unable to update course", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "course.update",
    targetType: "course",
    targetId: code,
    before,
    after,
  });

  return NextResponse.json({ course: after });
}
