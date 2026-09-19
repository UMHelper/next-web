import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { reportUpdateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const reportId = Number(params.id);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return apiError("invalid_request", "Invalid report id", 400);
  }

  const bodyResult = await readJsonBody(request, 8_192);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = reportUpdateSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid report update", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const { data: before, error: beforeError } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (beforeError) {
    console.error("[admin/reports] failed to load report:", beforeError.message);
    return apiError("internal_error", "Unable to load report", 500);
  }
  if (!before) return apiError("not_found", "Report not found", 404);

  const patch: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
    if (parsed.data.status === "open") {
      patch.resolved_by = null;
      patch.resolved_at = null;
    } else {
      patch.resolved_by = admin.session.userId;
      patch.resolved_at = new Date().toISOString();
    }
  }
  if (parsed.data.admin_note !== undefined) patch.admin_note = parsed.data.admin_note;

  const { data: after, error: updateError } = await supabaseAdmin
    .from("reports")
    .update(patch)
    .eq("id", reportId)
    .select("*")
    .single();

  if (updateError || !after) {
    console.error("[admin/reports] update failed:", updateError?.message ?? "no data");
    return apiError("internal_error", "Unable to update report", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "report.update",
    targetType: "report",
    targetId: reportId,
    before,
    after,
  });

  return NextResponse.json({ report: after });
}
