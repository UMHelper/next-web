import { auth, clerkClient } from "@clerk/nextjs/server";

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

export function getPlatformAdminEmails(value = process.env.PLATFORM_ADMIN_EMAILS) {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

type ClerkUserEmail = {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
};

export function getPrimaryClerkEmail(user: ClerkUserEmail): string | null {
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  return email ? email.toLowerCase() : null;
}

export async function getClerkUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return getPrimaryClerkEmail(user);
  } catch (error) {
    console.error(
      "[admin-auth] failed to load Clerk user email:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export async function getClerkUserEmails(userIds: string[]): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  try {
    const users = await clerkClient.users.getUserList({ userId: uniqueIds, limit: uniqueIds.length });
    return new Map(users.map((user) => [user.id, getPrimaryClerkEmail(user)]));
  } catch (error) {
    console.error(
      "[admin-auth] failed to load Clerk user emails:",
      error instanceof Error ? error.message : String(error),
    );
    return new Map();
  }
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
