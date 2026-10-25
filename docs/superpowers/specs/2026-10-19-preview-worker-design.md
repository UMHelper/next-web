# Preview Testing Worker

Date: 2026-10-19
Status: Draft, awaiting review

## 1. Goal

Host the current (uncommitted) version of the site on a separate Cloudflare Worker so it can be tested with real data and real DeepSeek calls, without touching production infrastructure or production data.

Goals:

- A second Worker, `next-web-preview`, deployed with one command, on a `workers.dev` URL.
- Uses the existing DeepSeek API key.
- Reads the production Supabase database, with writes blocked.
- Isolated cache storage, so preview never pollutes production ISR/tag caches.
- Production behavior is unchanged: every new code path is inert unless a preview-only variable is set.

Non-goals:

- Testing write flows (comments, votes, reports, admin pipeline). They fail by design in preview.
- A custom domain, CI-driven preview deploys, or per-branch previews.
- Applying the `ai_assistant_access` migration to the production DB.

## 2. Worker and infrastructure

`wrangler.jsonc` gets an `env.preview` block. Wrangler does not inherit bindings, so every binding is redeclared.

| Item | Production | Preview |
|---|---|---|
| Worker name | `next-web` | `next-web-preview` |
| `WORKER_SELF_REFERENCE` service | `next-web` | `next-web-preview` |
| Incremental cache | R2 `next-web-inc-cache` | none. `open-next.config.ts` uses `"dummy"` when `PREVIEW_DB_READONLY=1` |
| Tag cache | D1 `next-web-tag-cache` | none. same `"dummy"` switch |
| Observability sampling | 0.1 | 1.0 |
| `keep_vars` | true | true |

Other settings (`main`, `assets`, `images`, compatibility date and flags) are repeated unchanged.

New script in `package.json`:

```
"deploy:preview": "bash scripts/deploy-preview.sh"
```

`scripts/deploy-preview.sh` validates `.env.preview.local` (section 3), then runs `opennextjs-cloudflare build` and `opennextjs-cloudflare deploy --env preview`.

No new R2 bucket or D1 database. `env.preview` does not declare `r2_buckets` or `d1_databases`. `open-next.config.ts` selects the caches from the env the deploy script exports before the build:

```ts
const preview = process.env.PREVIEW_DB_READONLY === "1";

export default defineCloudflareConfig({
  incrementalCache: preview ? "dummy" : r2IncrementalCache,
  tagCache: preview ? "dummy" : d1NextTagCache,
});
```

`"dummy"` is a cache OpenNext accepts on Cloudflare. Deploy then skips cache population (which would otherwise throw `No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`). At runtime a cache read misses and the page renders. Production builds do not set the flag, so they keep the R2 and D1 caches. Preview never binds the production bucket or database.

## 3. Variables and secrets

Two groups, because `NEXT_PUBLIC_*` values are inlined at build time while the rest are read at runtime.

**Build-time (public) values**: stored in `.env.preview.local` (git-ignored by the existing `.env*.local` rule) and loaded for the preview build only. `deploy:preview` runs through a small `scripts/deploy-preview.sh` that exports the file (`set -a; . ./.env.preview.local; set +a`) before building. Next.js gives real process environment variables precedence over `.env*` files, so the exported preview values win over any `.env.local`. The script aborts if the file is missing or if `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` does not start with `pk_test_`, which prevents a preview build with the production Clerk key.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: production values.
- `SUPABASE_SECRET_KEY` (production), `PREVIEW_MODE=1`, and `PREVIEW_DB_READONLY=1`. The build itself reads the database (static generation), so it needs the secret key, and it runs under the same read-only guard as the deployed Worker. The script aborts if `PREVIEW_DB_READONLY` is not `1`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk **Development** instance (`pk_test_...`).
- Remaining `NEXT_PUBLIC_*` values copied from `.env.example` defaults.

**Runtime secrets**: set once with `wrangler secret put <NAME> --env preview`. Nothing is read from or written to disk by tooling.

- `AI_API_KEY` (existing DeepSeek key)
- `SUPABASE_SECRET_KEY` (production)
- `CLERK_SECRET_KEY` (Clerk dev instance, `sk_test_...`)
- `UM_OPEN_DATA_TOKEN` and `UM_IOS_API_SECRET` only if the user wants those paths exercised.

**Runtime plain vars** in `env.preview.vars`:

- `COPILOTKIT_TELEMETRY_DISABLED=true`
- `AI_BASE_URL=https://api.deepseek.com`, `AI_MODEL`, `AI_THINKING`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`
- `AGENT_RATE_LIMIT_PER_HOUR`, `AGENT_RATE_LIMIT_PER_DAY`, `AGENT_MAX_TURNS_PER_CONVERSATION`, `AGENT_HISTORY_TURNS`
- `PREVIEW_MODE=1`, `PREVIEW_DB_READONLY=1`, `ASSISTANT_ACCESS_OVERRIDE=everyone`

`PLATFORM_ADMIN_EMAILS` (the user's Clerk dev email) is set as a Worker **secret** rather than a var, so a personal email is not committed to the repo.

`.env.example` gains a "Preview worker" section documenting every name above, with no real values.

## 4. Production-DB read-only guard

Single chokepoint: `createSupabaseAdminClient()` in `lib/supabase/shared.ts` (every server-side Supabase client is built from it).

New module `lib/supabase/readonly-guard.ts`:

```ts
export function isReadonlyPreview(): boolean;          // PREVIEW_DB_READONLY === "1"
export function createReadonlyFetch(base: typeof fetch): typeof fetch;
```

`createSupabaseAdminClient()` passes `global: { fetch: createReadonlyFetch(fetch) }` only when `isReadonlyPreview()` is true. Otherwise the client is constructed exactly as today.

Rules enforced by `createReadonlyFetch`, applied to every request the Supabase client makes (no path prefixes are exempt, so unknown endpoints fail closed):

1. `GET` and `HEAD` pass.
2. `POST /rest/v1/rpc/<name>` passes only if `<name>` is in `READONLY_RPC_ALLOWLIST`. Any other RPC is rejected.
3. Every other method (`POST`, `PUT`, `PATCH`, `DELETE`) is rejected.
4. A rejection returns a synthetic `403` response with a PostgREST-shaped JSON body (`{ "message": "Preview worker is read-only", "code": "PREVIEW_READONLY" }`), so supabase-js surfaces it as a normal `error` and callers fail the same way they would on any DB error. It never throws synchronously and never reaches the network.

`READONLY_RPC_ALLOWLIST` is built during implementation by listing every `.rpc(` call and every function in `supabase/schema.sql` / migrations, and including only functions that are provably read-only (no insert/update/delete/`perform` of a write). `consume_rate_limit` is explicitly **not** on the list, since it writes counters.

**Rate limiting in preview**: `consumeRateLimit` (`lib/rate-limit.ts`) checks `isReadonlyPreview()` first and, if true, uses an in-memory fixed-window limiter (a `Map` keyed by `key + action`, per isolate) with the same return shape (`allowed`, `remaining`, `retryAfter`). Per-isolate state is acceptable for a test environment, and it means preview never writes to the production rate-limit table.

**Fail closed**: if `PREVIEW_DB_READONLY` is set but the guard cannot be installed for any reason, client creation throws.

Production never sets `PREVIEW_DB_READONLY`, so none of this runs there.

Known, accepted consequence: any feature that writes (comments, replies, votes, reports, timetable plans, admin edits, the update pipeline, tester management) returns an error in preview.

## 5. Preview-only overrides

All gated by `PREVIEW_MODE === "1"`; ignored otherwise.

- **Assistant access**: `lib/assistant/access.ts` `readAssistantAccess()` returns `ASSISTANT_ACCESS_OVERRIDE` (parsed with `parseAssistantAccess`) instead of reading `app_config`, because the production DB lacks the `ai_assistant_access` column. In `testers` mode the tester table read would also fail; the override value `everyone` avoids that, and `testers` is documented as unusable in preview. If `PREVIEW_MODE` is unset the override is never consulted.
- **Admin / identity**: no new code. The Clerk dev user's verified email is listed in `PLATFORM_ADMIN_EMAILS`, which the existing admin logic already honors. Clerk dev user IDs differ from production, so `admin_users` rows do not apply, and that is expected.

## 6. Components and boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `open-next.config.ts` | Dummy caches when `PREVIEW_DB_READONLY=1` | process env at build |
| `wrangler.jsonc` `env.preview` | Preview Worker, no R2 or D1 | none |
| `lib/supabase/readonly-guard.ts` | Block writes to Supabase | `process.env` only; no app imports |
| `lib/supabase/shared.ts` | Install guard when flag set | `readonly-guard` |
| `lib/rate-limit.ts` | In-memory limiter in preview | `readonly-guard` (`isReadonlyPreview`) |
| `lib/assistant/access.ts` | Preview access override | `PREVIEW_MODE` env |
| `app/api/admin/supabase/[...path]/route.ts` | Apply the same decision to the admin relay (raw `fetch`, bypasses the client guard) | `readonly-guard` |
| `scripts/deploy-preview.sh` | Validate env, build, deploy | `.env.preview.local` |
| `.env.example`, `docs/preview-worker.md` | Document names and runbook | none |

## 7. Testing

Unit tests (vitest, alongside existing `tests/`):

- `readonly-guard`: `GET`/`HEAD` pass; `POST`, `PATCH`, `PUT`, `DELETE` rejected with the `PREVIEW_READONLY` body and the base fetch not called; allowlisted RPC passes; non-allowlisted RPC rejected; `consume_rate_limit` rejected; flag off returns the unwrapped client behavior.
- `createSupabaseAdminClient`: guard installed only when the flag is `"1"`; not installed for unset, `"0"`, or other values.
- `consumeRateLimit` in preview: allows up to the limit then denies, `retryAfter` is positive and decreases, separate keys and actions are independent, and no Supabase call is made.
- `readAssistantAccess`: override honored only with `PREVIEW_MODE=1`; invalid override value becomes `off`; without `PREVIEW_MODE` the DB path is used and an override variable is ignored.
- Allowlist test: every RPC name in `READONLY_RPC_ALLOWLIST` exists in the schema, and `consume_rate_limit` is not in it.

Build and deploy verification (run, not assumed):

1. `npm test` and `npm run lint` pass.
2. `opennextjs-cloudflare build` succeeds.
3. `npm run deploy:preview` succeeds and prints the `workers.dev` URL.
4. Smoke test on the deployed URL: home page renders; a course page shows production data; sign-in works with the Clerk dev instance; an assistant chat streams a DeepSeek reply; a deliberate write (posting a comment) is rejected with the read-only message and no new row appears in production.
5. Confirm the production Worker, its R2 bucket, and its D1 database are unmodified (`wrangler deployments list` for `next-web` shows no new deployment).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Preview holds the production `SUPABASE_SECRET_KEY` (service role, bypasses RLS) | Fetch guard blocks all mutations at the client chokepoint; flag fails closed; guard is unit-tested. The key is still valid if code bypasses `createSupabaseAdminClient`, so a code scan for direct `createClient(` / raw `fetch` to Supabase is part of implementation (`lib/update/relay-client.ts` and the admin relay route are checked specifically) |
| A read-only-looking RPC actually writes | Allowlist is explicit and built from reviewing function bodies; default is deny |
| Preview shares prod cache | Preview declares no R2 or D1 binding and builds with the dummy cache |
| `NEXT_PUBLIC_*` baked from wrong env | Preview build loads `.env.preview.local` only; the smoke test confirms the Clerk key prefix is `pk_test_` |
| Clerk dev users cannot be matched to prod user data | Accepted; admin access via `PLATFORM_ADMIN_EMAILS` |
| DeepSeek spend from the preview | Existing agent rate limits apply (in-memory in preview); the URL is unlisted, and access requires sign-in |
| Preview URL is public | Sign-in required for assistant and admin; data exposed is the same public read data as production |

## 9. Runbook

1. Create `.env.preview.local` with the public build-time values.
2. `wrangler secret put AI_API_KEY --env preview`, then the same for `SUPABASE_SECRET_KEY` and `CLERK_SECRET_KEY`.
3. `wrangler secret put PLATFORM_ADMIN_EMAILS --env preview` (your Clerk dev email).
4. `npm run deploy:preview`.
5. Run the smoke test (section 7).
6. Teardown: `wrangler delete --env preview`.
