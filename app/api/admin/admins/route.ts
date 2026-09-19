import { Clerk } from "@clerk/backend";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { getPlatformAdminIds, requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { adminGrantSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("clerk_user_id, role, active, granted_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/admins] query failed:", error.message);
    return apiError("internal_error", "Unable to load admins", 500);
  }

  return NextResponse.json({
    platformAdmins: Array.from(getPlatformAdminIds()),
    admins: data ?? [],
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const bodyResult = await readJsonBody(request, 8_192);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = adminGrantSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid Clerk user id", 400);
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return apiError("service_unavailable", "CLERK_SECRET_KEY is not configured", 503);
  }

  let user: unknown;
  try {
    const clerk = Clerk({ secretKey });
    user = await clerk.users.getUser(parsed.data.clerk_user_id);
  } catch {
    return apiError("not_found", "Clerk user not found", 404);
  }
  if (!user) return apiError("not_found", "Clerk user not found", 404);

  const { error } = await supabaseAdmin.from("admin_users").upsert([{
    clerk_user_id: parsed.data.clerk_user_id,
    role: "admin",
    granted_by: admin.session.userId,
    active: true,
    updated_at: new Date().toISOString(),
  }], { onConflict: "clerk_user_id" });

  if (error) {
    console.error("[admin/admins] grant failed:", error.message);
    return apiError("internal_error", "Unable to grant admin", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "admin.grant",
    targetType: "admin_user",
    targetId: parsed.data.clerk_user_id,
    after: { clerk_user_id: parsed.data.clerk_user_id, role: "admin", active: true },
  });

  return NextResponse.json({ ok: true });
}
