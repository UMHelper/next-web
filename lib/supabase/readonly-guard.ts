export const PREVIEW_READONLY_CODE = "PREVIEW_READONLY";
export const PREVIEW_READONLY_MESSAGE = "Preview worker is read-only";

/**
 * RPCs a preview worker may call against the production database. Every entry
 * was checked to contain no write statement (enforced by
 * tests/supabase/readonly-guard.test.ts). `consume_rate_limit` is deliberately
 * absent because it writes counters; preview uses an in-memory limiter instead.
 */
export const READONLY_RPC_ALLOWLIST: ReadonlySet<string> = new Set([
  "get_comment_list",
  "get_comment_page",
  "get_comment_page_v2",
  "get_course_list_by_prof",
  "get_offer_list_by_prof",
  "get_popular_courses",
  "get_prof_course_id",
  "get_schedule_list",
  "search_courses",
  "search_instructors_with_courses",
  "search_planner_courses",
  "search_planner_instructors",
]);

const RPC_PATH = /^\/rest\/v1\/rpc\/([A-Za-z_][A-Za-z0-9_]*)\/?$/;

export type GuardDecision = { allowed: true } | { allowed: false; reason: string };

export function isReadonlyPreview(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.PREVIEW_DB_READONLY === "1";
}

/** Pure decision used by both the client fetch wrapper and the admin relay route. */
export function evaluateSupabaseRequest(method: string, pathname: string): GuardDecision {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return { allowed: true };

  if (verb === "POST") {
    const rpc = RPC_PATH.exec(pathname);
    if (rpc && READONLY_RPC_ALLOWLIST.has(rpc[1])) return { allowed: true };
    if (rpc) return { allowed: false, reason: `rpc ${rpc[1]} is not on the read-only allowlist` };
  }

  return { allowed: false, reason: `${verb} ${pathname} is a write` };
}

function describeInput(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): { method: string; pathname: string } {
  const isRequest = typeof Request !== "undefined" && input instanceof Request;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (isRequest ? input.method : "GET");
  return { method, pathname: new URL(url, "http://localhost").pathname };
}

export function createReadonlyFetch(
  base: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return async (input, init) => {
    const { method, pathname } = describeInput(input, init);
    const decision = evaluateSupabaseRequest(method, pathname);
    if (!decision.allowed) {
      return new Response(
        JSON.stringify({
          message: PREVIEW_READONLY_MESSAGE,
          code: PREVIEW_READONLY_CODE,
          details: decision.reason,
          hint: null,
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    return base(input, init);
  };
}
