import { NextResponse } from "next/server";

import { runSyncUm } from "@/lib/admin/sync-um";
import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import { syncUmSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const bodyResult = await readJsonBody(request, 4_096);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = syncUmSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid sync request", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  try {
    const stats = await runSyncUm(parsed.data);
    await writeAuditLog({
      actorId: admin.session.userId,
      action: "sync.um",
      targetType: "course",
      targetId: parsed.data.code ?? parsed.data.mode,
      after: stats,
    });
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[admin/sync-um] failed:", error instanceof Error ? error.message : String(error));
    return apiError("internal_error", "UM sync failed", 500);
  }
}
