import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Supabase env: ${name}`);
  }

  return value;
}

export function createSupabaseBrowserClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY",
      supabasePublishableKey,
    ),
  );
}

export function createSupabaseServerClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY",
      supabasePublishableKey,
    ),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function createSupabaseAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    requireEnv(
      "SUPABASE_SECRET_KEY | SUPABASE_SERVICE_ROLE_KEY",
      supabaseSecretKey,
    ),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function areSupabaseKeysIsolated() {
  if (!supabasePublishableKey || !supabaseSecretKey) {
    return false;
  }

  return supabasePublishableKey !== supabaseSecretKey;
}
