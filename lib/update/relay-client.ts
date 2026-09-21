import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createRelayClient(options: { origin?: string; publishableKey?: string } = {}): SupabaseClient {
  const origin = options.origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const publishableKey =
    options.publishableKey || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "relay-placeholder";

  return createClient(`${origin}/api/admin/supabase`, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // The relay authenticates the browser via Clerk's __session cookie. supabase-js
      // would otherwise add `Authorization: Bearer <publishableKey>`, and Clerk prefers
      // that header over the cookie — then fails to verify it and reports "Sign in
      // required". Strip it so Clerk falls back to the session cookie. The relay injects
      // the real Supabase apikey server-side, so the client value does not matter.
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.delete("authorization");
        return fetch(input, { ...init, headers, credentials: "same-origin" });
      },
    },
  });
}
