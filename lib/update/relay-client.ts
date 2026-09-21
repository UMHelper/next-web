import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createRelayClient(options: { origin?: string; publishableKey?: string } = {}): SupabaseClient {
  const origin = options.origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const publishableKey = options.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  return createClient(`${origin}/api/admin/supabase`, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
