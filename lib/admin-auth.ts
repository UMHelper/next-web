import { auth } from "@clerk/nextjs/server";

import { apiError } from "@/lib/api-response";
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
