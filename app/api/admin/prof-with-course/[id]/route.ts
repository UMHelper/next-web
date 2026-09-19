import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { profWithCourseUpdateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const rowId = Number(params.id);
  if (!Number.isInteger(rowId) || rowId <= 0) {
    return apiError("invalid_request", "Invalid mapping id", 400);
  }

  const bodyResult = await readJsonBody(request, 32_768);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = profWithCourseUpdateSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid mapping update", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const { data: before, error: beforeError } = await supabaseAdmin
    .from("prof_with_course")
    .select("*")
    .eq("id", rowId)
    .maybeSingle();

  if (beforeError) {
    console.error("[admin/prof-with-course] failed to load row:", beforeError.message);
    return apiError("internal_error", "Unable to load professor mapping", 500);
  }
  if (!before) return apiError("not_found", "Professor mapping not found", 404);

  const { data: after, error: updateError } = await supabaseAdmin
    .from("prof_with_course")
    .update(parsed.data)
    .eq("id", rowId)
    .select("*")
    .single();

  if (updateError || !after) {
    console.error("[admin/prof-with-course] update failed:", updateError?.message ?? "no data");
    return apiError("internal_error", "Unable to update professor mapping", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "prof.update",
    targetType: "prof_with_course",
    targetId: rowId,
    before,
    after,
  });

  return NextResponse.json({ row: after });
}
