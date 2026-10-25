import { createClient } from "@supabase/supabase-js";

import { createReadonlyFetch, isReadonlyPreview } from "./readonly-guard";

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Supabase env: ${name}`);
  }

  return value;
}

export function createSupabaseAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      // Preview workers read production data. Block every write at the source.
      ...(isReadonlyPreview() ? { global: { fetch: createReadonlyFetch() } } : {}),
    },
  );
}
