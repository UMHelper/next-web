import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { commentUpdateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return apiError("invalid_request", "Invalid comment id", 400);
  }

  const bodyResult = await readJsonBody(request, 16_384);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = commentUpdateSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid comment update", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const { data: before, error: beforeError } = await supabaseAdmin
    .from("comment")
    .select("*")
    .eq("id", commentId)
    .maybeSingle();

  if (beforeError) {
    console.error("[admin/comments] failed to load comment:", beforeError.message);
    return apiError("internal_error", "Unable to load comment", 500);
  }
  if (!before) return apiError("not_found", "Comment not found", 404);

  const patch = parsed.data;
  const { data: after, error: updateError } = await supabaseAdmin
    .from("comment")
    .update(patch)
    .eq("id", commentId)
    .select("*")
    .single();

  if (updateError || !after) {
    console.error("[admin/comments] update failed:", updateError?.message ?? "no data");
    return apiError("internal_error", "Unable to update comment", 500);
  }

  if (patch.hidden !== undefined && before.hidden !== patch.hidden && before.replyto === null) {
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_prof_with_course_stats", {
      target_course_id: before.course_id,
    });
    if (refreshError) {
      console.error("[admin/comments] stats refresh failed:", refreshError.message);
    }
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "comment.update",
    targetType: "comment",
    targetId: commentId,
    before,
    after,
  });

  return NextResponse.json({ comment: after });
}
