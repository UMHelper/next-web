import { auth } from "@clerk/nextjs/server";

import { apiError } from "@/lib/api-response";
import { getDirectoryUsers } from "@/lib/clerk/user-directory";
import supabaseAdmin from "@/lib/supabase/admin";

export type AdminSession = {
  userId: string;
  isPlatformAdmin: boolean;
};

export function getPlatformAdminIds(value = process.env.PLATFORM_ADMIN_USER_IDS) {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function getPlatformAdminEmails(value = process.env.PLATFORM_ADMIN_EMAILS) {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getClerkUserEmail(userId: string): Promise<string | null> {
  const users = await getDirectoryUsers([userId]);
  return users.get(userId)?.primaryEmail ?? null;
}

export async function getClerkUserEmails(userIds: string[]): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const users = await getDirectoryUsers(uniqueIds);
  return new Map(uniqueIds.map((id) => [id, users.get(id)?.primaryEmail ?? null]));
}

export async function getCurrentAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: ReturnType<typeof apiError> }
> {
  const { userId } = auth();
  if (!userId) {
    return { ok: false, response: apiError("unauthorized", "Sign in required", 401) };
  }

  if (getPlatformAdminIds().has(userId)) {
    return { ok: true, session: { userId, isPlatformAdmin: true } };
  }

  const platformEmails = getPlatformAdminEmails();
  if (platformEmails.size > 0) {
    const email = await getClerkUserEmail(userId);
    if (email && platformEmails.has(email)) {
      return { ok: true, session: { userId, isPlatformAdmin: true } };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("clerk_user_id, active")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[admin-auth] failed to load admin user:", error.message);
    return { ok: false, response: apiError("internal_error", "Unable to verify admin access", 500) };
  }

  if (!data || data.active !== true) {
    return { ok: false, response: apiError("forbidden", "Admin access required", 403) };
  }

  return { ok: true, session: { userId, isPlatformAdmin: false } };
}

export async function requireAdmin(options: { platformOnly?: boolean } = {}) {
  const result = await getCurrentAdmin();
  if (!result.ok) return result;

  if (options.platformOnly && !result.session.isPlatformAdmin) {
    return { ok: false as const, response: apiError("forbidden", "Platform admin required", 403) };
  }

  return result;
}
