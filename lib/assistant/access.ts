import "server-only";

import { unstable_cache } from "next/cache";

import { resolveAdminSession } from "@/lib/admin-auth";
import { parseAssistantAccess, type AssistantAccess } from "@/lib/assistant/access-mode";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { getDirectoryUser } from "@/lib/clerk/user-directory";
import supabaseAdmin from "@/lib/supabase/admin";

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Selects only the mode column so a missing column cannot affect other app_config readers. */
export async function readAssistantAccess(): Promise<AssistantAccess> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("ai_assistant_access")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[assistant-access] mode read failed:", error.message);
      return "off";
    }
    return parseAssistantAccess(data?.ai_assistant_access);
  } catch (error) {
    console.error("[assistant-access] mode read threw:", describeError(error));
    return "off";
  }
}

export const getAssistantAccess = unstable_cache(readAssistantAccess, ["assistant-access"], {
  tags: [CACHE_TAGS.appConfig],
  revalidate: 300,
});

async function isAssistantTester(userId: string): Promise<boolean> {
  const user = await getDirectoryUser(userId);
  const email = user?.primaryEmail?.toLowerCase();
  if (!email) return false;

  const { data, error } = await supabaseAdmin
    .from("assistant_testers")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[assistant-access] tester lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function canUseAssistant(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  const mode = await getAssistantAccess();
  if (mode === "off") return false;
  if (mode === "everyone") return true;

  try {
    const admin = await resolveAdminSession(userId);
    if (!admin.ok) return false;
    if (admin.session) return true;
    return await isAssistantTester(userId);
  } catch (error) {
    console.error("[assistant-access] access check threw:", describeError(error));
    return false;
  }
}
