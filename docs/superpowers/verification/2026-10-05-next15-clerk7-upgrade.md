# Next.js 15 + Clerk 7 upgrade verification

> Plan: `docs/superpowers/plans/2026-10-05-next15-clerk7-upgrade.md`
> Spec: `docs/superpowers/specs/2026-10-05-next15-clerk7-upgrade-design.md`
> Date: 2026-10-05
> Branch / worktree: `feat/next15-clerk7-upgrade` at `.worktrees/next15-clerk7-upgrade`

## 1. Result

Tasks 1–7 of the plan are complete and the full automated gate passes:

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `npm test` | 0 | 128 test files, 484 tests passed |
| 2 | `npx tsc --noEmit` | 0 | no errors |
| 3 | `npm run lint` (`eslint . --max-warnings=0`) | 0 | no errors, no warnings |
| 4 | `npm run build` (`next build`) | 0 | 60 static pages generated, catalog SSG produces 44 paths |
| 5 | `npm run build:pages` (`opennextjs-cloudflare build`) | 0 | `.open-next/worker.js` emitted, "OpenNext build complete" |

The five commands were run in this order on the final dependency state.

## 2. Environment

- Node.js `v25.8.1` (satisfies the new `engines.node >=20.9.0`)
- npm `11.11.0`
- Worktree installed with a workspace-local npm cache
  (`npm_config_cache=/Users/box/UMHelper/.npm-cache`) because `~/.npm` is outside the
  sandbox-writable workspace.

## 3. Installed versions (`npm ls`)

| Package | Version | Note |
| --- | --- | --- |
| `next` | `15.5.27` | exact pin |
| `eslint-config-next` | `15.5.27` | exact pin |
| `@clerk/nextjs` | `7.9.10` | exact pin |
| `@clerk/backend` | `3.22.0` | transitive via `@clerk/nextjs`; direct dependency removed |
| `react` / `react-dom` | `18.3.1` | unchanged major (React 18 retained) |
| `eslint` | `8.57.1` | unchanged |
| `typescript` | `5.2.2` | unchanged |
| `vitest` | `2.1.9` | unchanged |
| `@opennextjs/cloudflare` | `1.16.6` | raised from `1.14.10` — see Deviations #4 |
| `@opennextjs/aws` | `3.9.16` | transitive |
| `wrangler` | `4.62.0` | unchanged |
| `sharp` | `0.35.5` | newly pulled in by Next 15 — see Deviations #4 |

## 4. Warnings and classification

| Warning | Class | Why it is safe |
| --- | --- | --- |
| "Next.js inferred your workspace root … multiple lockfiles" | Worktree artifact | A linked worktree nests one `package-lock.json` inside the main checkout's. Not present for a standalone checkout/CI run. Does not affect the build output. |
| `webpack.cache.PackFileCacheStrategy` big-string serialization | Perf hint | Pre-existing webpack cache note, unrelated to the migration. |
| Browserslist `caniuse-lite` is 9 months old | Informational | Data-freshness notice only. |
| wrangler cannot write `~/Library/Preferences/.wrangler/logs/*.log` (EPERM) | Sandbox artifact | The OpenNext CLI still exits 0; only its debug log write is blocked because the path is outside the writable workspace. |

No Next.js 15 or Clerk 7 deprecation required code changes beyond the ones implemented.

## 5. Behaviour confirmations

- React and React DOM remained on **18.3.1**; no React 19 changes were introduced.
- No MCP tooling or `/mcp` / OAuth discovery route was added (`@clerk/mcp-tools` is not installed).
- No iOS HMAC code changed. `lib/ios-auth.ts`, `lib/ios-version.ts`, `lib/ios-comment-compat.ts`
  and the `x-um-viewer-id` handling are untouched; the iOS branches of `lib/api-auth.ts` are unchanged.
- No database schema, Supabase RPC, admin model, or iOS HMAC protocol change.
- `tests/security/api-route-guards.test.ts` still passes (36 assertions); every sensitive
  Route Handler still references an approved guard. Middleware no longer performs resource
  authorization.

## 6. Deviations from the plan

1. **`cloudflare-env.d.ts` regeneration flags.** The plan's bare `npm run cf-typegen` emits
   ~10,900 lines of workerd runtime types and drops six production variable declarations that
   are absent from the local `.env.local`. Per review decision, the file was regenerated with
   the flag its own header documents (`--include-runtime false`) after adding empty placeholders
   for the missing variables to the ignored local env. Net diff vs the pre-upgrade file: header
   hash, the two renamed Clerk variables, the R2/D1 bindings that were previously missing, and
   `SUPABASE_DB_URL`; all existing declarations are preserved.

2. **`fix: read clerk 7 paginated user list` (extra commit).** Clerk 7's
   `client.users.getUserList()` returns a `PaginatedResourceResponse<User[]>` (array under
   `.data`) rather than a bare array. The plan described only awaiting `clerkClient()`. Fixed in
   `lib/clerk/user-directory.ts` and `app/api/admin/admins/route.ts`, with test mocks updated to
   the real shape. This surfaced only through `tsc`, because the first version of the mocks
   returned arrays and the Vitest assertions still passed.

3. **`.eslintrc.json` gains `root: true`.** `eslint .` walks up from the worktree and found the
   main checkout's `.eslintrc.json` as well, producing "couldn't determine the plugin
   '@next/next' uniquely". `root: true` stops the upward cascade. This is also correct for a
   standalone checkout, where it is a no-op.

4. **`@opennextjs/cloudflare` raised `1.14.10` → `1.16.6` (aws `3.9.16`).** Next 15.5.27
   declares `sharp` as an optional dependency, so a root `sharp@0.35.5` is installed. OpenNext
   1.14.10/aws 3.9.10 patches `NextServer#imageOptimizer` but **not** `handleNextImageRequest`,
   so esbuild follows the `require('sharp')` in Next's image optimizer and fails with
   `.node`/native-module resolve errors during "Bundling the OpenNext server". aws `3.9.16`
   adds a `handleNextImageRequest` no-op patch explicitly "to avoid pulling `sharp`" for
   Next 14/15/16. `1.16.6` still accepts `next@15.5.27` and the installed `wrangler@4.62.0`
   (`wrangler: ^4.59.2`, `next: ~15.5.10`). This deviates from the spec row that said to keep
   `@opennextjs/cloudflare` unchanged; without it `npm run build:pages` cannot pass.

5. **Static enforcement of Next 15 async page props was not reproducible.** The plan's Task 6
   Step 1 expected `npx tsc --noEmit` to fail on synchronous `params`/`searchParams`. In Next
   15.5.27 the generated `.next/types/validator.ts` types the prop as
   `{ params: Promise<ParamMap[Route]> } & any`; the `& any` collapses the check, so `tsc`
   passes even with synchronous props. All nine dynamic pages/layouts were migrated anyway, and
   correctness is evidenced by the successful prerender of dynamic and `generateStaticParams`
   routes in `next build` plus the focused SEO/route tests.

## 7. Commits on `feat/next15-clerk7-upgrade`

```
1524d0b chore: pin next 15 and clerk 7 baseline
07c2a3a refactor: migrate clerk middleware and controls
30ff287 refactor: await clerk server APIs
cdee6d3 fix: read clerk 7 paginated user list
296238b refactor: await clerk auth in timetable APIs
851b14c refactor: await next route params
4c72216 refactor: migrate app router props to next 15
```
plus a final Task 7 commit for `.eslintrc.json`, `package.json`, `package-lock.json`,
`cloudflare-env.d.ts` and this record.

The two unrelated untracked scripts `scripts/ga4-provision.mjs` and `scripts/gtm-provision.mjs`
were never staged.

## 8. Remaining work — Task 8 (manual)

The preview smoke matrix is not automatable in this session and remains to be done before
integration:

- configure preview `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/` and
  `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`; keep the old `NEXT_PUBLIC_CLERK_AFTER_*`
  variables for the rollback window;
- run `npm run preview` and verify: anonymous public pages, modal sign-in return,
  `/sign-in` / `/sign-up` / sign-out, `/admin` for anonymous / non-admin / admin, JSON `401/403`
  for protected APIs, comment/reply/vote/report and timetable CRUD, and one iOS HMAC request;
- then request code review and finish the branch.

## 9. Rollback

No database migration is involved. Rollback is the pre-upgrade build artifact plus the
previous lockfile; the old Clerk environment variables stay configured during the rollback
window.
