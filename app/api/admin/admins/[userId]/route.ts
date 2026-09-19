import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { getPlatformAdminIds, requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: { userId: string } }) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const userId = decodeURIComponent(params.userId);
  if (!/^user_[A-Za-z0-9_-]+$/.test(userId)) {
    return apiError("invalid_request", "Invalid user id", 400);
  }
  if (getPlatformAdminIds().has(userId)) {
    return apiError("invalid_request", "Platform admins are controlled by environment only", 400);
  }

  const { error } = await supabaseAdmin
    .from("admin_users")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("clerk_user_id", userId);

  if (error) {
    console.error("[admin/admins] revoke failed:", error.message);
    return apiError("internal_error", "Unable to revoke admin", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "admin.revoke",
    targetType: "admin_user",
    targetId: userId,
    after: { clerk_user_id: userId, active: false },
  });

  return NextResponse.json({ ok: true });
}
