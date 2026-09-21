import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import {
  getClerkUserEmails,
  getPlatformAdminEmails,
  getPlatformAdminIds,
  requireAdmin,
} from "@/lib/admin-auth";
import { toDirectoryUser } from "@/lib/clerk/user-directory";
import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { adminGrantSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const from = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("admin_users")
    .select("clerk_user_id, role, active, granted_by, created_at", { count: "exact" })
    .order("created_at", { ascending: true })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[admin/admins] query failed:", error.message);
    return apiError("internal_error", "Unable to load admins", 500);
  }

  const admins = data ?? [];
  const platformAdminIds = Array.from(getPlatformAdminIds());
  const idsToResolve = Array.from(new Set([
    ...admins.map((row) => row.clerk_user_id),
    ...admins.map((row) => row.granted_by),
    ...platformAdminIds,
  ]));
  const emailById = await getClerkUserEmails(idsToResolve);

  return NextResponse.json({
    platformAdmins: platformAdminIds,
    platformAdminEmails: Array.from(getPlatformAdminEmails()),
    platformAdminRows: platformAdminIds.map((id) => ({
      clerk_user_id: id,
      email: emailById.get(id) ?? null,
    })),
    admins: admins.map((row) => ({
      ...row,
      email: emailById.get(row.clerk_user_id) ?? null,
      granted_by_email: emailById.get(row.granted_by) ?? null,
    })),
    total: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const bodyResult = await readJsonBody(request, 8_192);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = adminGrantSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid Clerk user id or email", 400);
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return apiError("service_unavailable", "CLERK_SECRET_KEY is not configured", 503);
  }

  const identifier = parsed.data.clerk_user_id;
  const isEmail = identifier.includes("@");
  let userId = identifier;
  let userEmail: string | null = null;

  try {
    if (isEmail) {
      const users = await clerkClient.users.getUserList({ emailAddress: [identifier], limit: 2 });
      if (users.length === 0) return apiError("not_found", "Clerk user not found", 404);
      if (users.length > 1) {
        return apiError("invalid_request", "Email matches multiple Clerk users", 400);
      }
      userId = users[0].id;
      userEmail = toDirectoryUser(users[0] as never).primaryEmail;
    } else {
      const user = await clerkClient.users.getUser(identifier);
      userEmail = toDirectoryUser(user as never).primaryEmail;
    }
  } catch {
    return apiError("not_found", "Clerk user not found", 404);
  }

  const { error } = await supabaseAdmin.from("admin_users").upsert([{
    clerk_user_id: userId,
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
    targetId: userId,
    after: { clerk_user_id: userId, email: userEmail, role: "admin", active: true },
  });

  return NextResponse.json({ ok: true, clerk_user_id: userId, email: userEmail });
}
