# V2.3.5-D Independent Audit — Admin Configuration & Usage Controls

**Date:** 2026-10-28
**Scope:** Independent engineering, security, and production-readiness review of the completed V2.3.5-D work. Read-only audit; no implementation.
**Branch under audit:** `feat/assistant-v2-3-5-d-admin-controls`
**Commit audited:** `ad5dd10` (`ad5dd10819ad4d3b0960bb2239811069091340dd`)
**Merge baseline:** `feat/global-assistant-v2` @ `51e726f`
**Topology:** HEAD is 12 commits ahead of and 0 behind the V2 baseline. `dev` and `main` contain neither V2 nor D. No `feat/assistant-v2-3-5-c-*` branch exists.

**Constraint compliance.** No production code, schema, policy, benchmark, or existing test was changed to make the audit pass. No production migration was executed. No merge, cherry-pick, reset, force-push, worktree deletion, or deploy was performed. The working tree already contained uncommitted changes before this audit and was left untouched; all findings about it are timestamped to the commands cited below.

---

## A. Executive verdict

**CONDITIONAL PASS — merge-blocked by one confirmed P1; no P0 findings.**

At HEAD, the committed branch implements the agreed D scope and its internal gates genuinely pass: 291 test files / 2,565 tests, `tsc --noEmit`, ESLint, and a production build. Atomic quota accounting, both-window denial, idempotent replay, fail-closed storage, platform-admin authorization, bounded execution budgets, privacy-safe telemetry, and the admin UI were independently verified, including live concurrency probes against local Supabase.

One defect prevents a clean pass:

1. **P1-1 — quota bypass.** Turn identity prefers the client-supplied message `id` and never binds message content (`lib/assistant/turn-key.ts:24-30,37`). An authenticated client that reuses one `id` with different prompts within the 5-minute replay window executes unlimited model runs on a single charge. A variant with no user message produces a constant key per thread (`"no-user"`). This defeats the cost-control purpose of the per-turn quota.

One process issue must also be resolved, though it is not a defect in HEAD:

2. **B-1 — uncommitted working tree contradicts the approved spec and is red.** The worktree replaces every hard ceiling with int-max minimums (code, validation, `supabase/schema.sql`, and a new migration `20261029_assistant_limit_min_only.sql`), adds `chart.js` UI, and currently fails `tsc` (TS2345) and one test. It is not part of `ad5dd10` and must not be swept into a merge.

Under a strict reading of the brief's taxonomy (any confirmed P1 ⇒ FAIL), read this as **FAIL-as-is** with a small, known remediation. No P0 (data loss, privilege escalation, cross-user exposure, or unmetered access without authentication) was found.

Direct answer to the integration question: **do not merge as-is.** After the P1-1 turn-key fix (one function plus tests) and with the dirty worktree excluded, HEAD is safe to merge into `feat/global-assistant-v2`. Deployment still requires browser acceptance, real-provider verification, and a reviewed production migration.

---

## B. Verified implementation matrix

### B.1 D requirements

| # | Requirement | Classification | Basis |
|---|---|---|---|
| 1 | Correct per-turn quota accounting | **Partially implemented** | Atomic claim, both windows, replay reuse, and fail-closed storage are correct; identity is client-forgeable (P1-1) |
| 2 | Configurable admin limits | **Fully implemented at HEAD** | Seven bounded columns, platform-only numeric writes, Zod + CHECK validation, effective before/after audit |
| 3 | Bounded execution budgets | **Fully implemented at HEAD** | Per-run step/token/timeout/history/turn limits derived server-side; client cannot override (P3 caveats only) |
| 4 | Privacy-preserving usage metrics | **Fully implemented (privacy); P2 labeling defect** | Content-free event schema, hashed identifiers only, aggregated API; "Accepted" metric semantics are misleading (P2-1) |
| 5 | Retention controls | **Implemented with documented limitation** | 90/30/7-day pruning, best-effort per spec; no scheduler exists and none was added |
| 6 | Student-facing operational errors | **Fully implemented** | Fixed copy for quota/limit/provider/timeout/payload/stream cases; no provider text echoed; P3 caveat on graceful execution-limit stop |

### B.2 Detailed controls

| # | Control | Status | Evidence |
|---|---|---|---|
| 1 | Seven nullable limit columns with database bounds | PASS (HEAD) | `supabase/migrations/20261028_assistant_admin_ops.sql`; ranges match spec §5.1 |
| 2 | Server clamps on read; ceilings not raisable from UI | PASS (HEAD) | `lib/assistant/limits.ts` (`ASSISTANT_LIMIT_BOUNDS`); `lib/assistant/settings.ts`; admin page passes `min`/`max` |
| 3 | Platform-admin-only writes for numeric limits | PASS | `app/api/admin/app-config/route.ts`; GET is platform-only |
| 4 | Access field editable by any admin | PASS | Numeric-column check excludes `ai_assistant_access` |
| 5 | Zod validation of every limit; unknown keys stripped | PASS (HEAD) | `lib/validation/admin.ts`; `.object` strips unknowns; empty patch rejected |
| 6 | Before/after audit of changed limits | PASS | Route records effective before/after for patched numeric columns; no secrets |
| 7 | Atomic, idempotent per-turn charge across both windows | PASS mechanically; P1 on identity | `claim_assistant_turn`; live probes in §D |
| 8 | 5-minute replay / continuation reuse | PASS mechanically; P1 bypass | SQL replay branch; route derives identity once per run |
| 9 | Charge on acceptance; no refund on failure/cancel | PASS (by design) | Charge commits before runtime; outcome finalized separately |
| 10 | Fail closed when quota store unavailable | PASS | Claim errors return 503 before execution |
| 11 | Reject 409/413 before claiming quota | PASS | Turn/payload checks precede claim; rejections recorded |
| 12 | Runtime applies step/token/timeout/history/turn limits | PASS | Per-run context config; `BuiltInAgent` maxSteps/maxOutputTokens; `overridableProperties: []` |
| 13 | Content-free telemetry with outcome classes | PASS | `assistant_usage_events` has no content columns; unique `run_key` |
| 14 | Usage aggregates without identifiers | PASS | `assistant_usage_daily`; API returns aggregates only; `no-store` |
| 15 | Bounded retention (90/30/7 days, ≤ every 6h per isolate) | PASS (best effort) | `prune_assistant_telemetry`; module throttle; failure swallowed |
| 16 | Student-facing error copy, no provider leakage | PASS | `lib/assistant/error-message.ts`, used by `assistant-chat.tsx` and `assistant-panel.tsx` |
| 17 | Admin UI: limits (platform admin), usage (all admins) | PASS | `app/admin/assistant/page.tsx`; settings panel gated by `isPlatformAdmin` |
| 18 | Bootstrap snapshot aligned with migration | PASS (HEAD) | `supabase/schema.sql` at `ad5dd10`; static SQL tests |
| 19 | Committed HEAD gates | PASS | §E: tsc 0, 291/2,565 tests, lint 0, build 0 |
| 20 | Working-tree gates | FAIL | tsc TS2345; stale `assistant-page` expectation; spec-violating min-only schema |
| 21 | C deferred; V2 not merged into dev | PASS | No C branch; `dev`/`main` contain neither V2 nor D |
| 22 | D scope isolated from other modules | PASS | 50 changed files, all assistant/admin/validation/telemetry plus tests; the only shared helper change (`lib/mcp/rate-limit.ts`) is a behavior-identical `hashUserId` extraction |

---

## C. Security and correctness findings

### C.1 P1-1 (confirmed) — Client-controlled message id enables quota bypass

**Path of trust.** The client controls `messages[].id` and `threadId`. `lib/assistant/conversation.ts` uses `.passthrough()`, so the id survives validation. The route passes the last user message to `deriveTurnIdentity`, which uses the id verbatim as the message key. The database treats any `(user_hash, turn_key)` younger than five minutes as a retry: `allowed=true, charged=false`, and only `continuations` is incremented.

**Evidence (deterministic derivation):**

```
userHash  = sha256("user_audit").slice(0,32)
threadId  = "thread-a"
turnKey   = sha256(userHash \0 threadId \0 messageKey).slice(0,32)

messageKey "msg-const" → 564a65058a399540ee61c1ba823738cd
messageKey "msg-const" → 564a65058a399540ee61c1ba823738cd   (different prompt, same charge)
no-user messageKey     → 4abb37bbd4180e92ada9c965e812ca61   (constant per thread)
```

A content-bound key would separate the two prompts (`5f20f613…` vs `a36aa7ce…`), which is the fix below.

**Impact.** With a limit of N turns per hour, an attacker gets N charged runs per hour and, for each charge, up to five minutes of runs with arbitrary different prompts. Hour/day counters and the derived per-user quota stop bounding provider spend. The attacker must be an authenticated, assistant-enabled user sending a deliberately forged body, which is why this is P1 rather than P0 (it is not an unauthenticated or cross-user compromise).

**Note on the contract.** Spec §3.1 explicitly defines `turnMessageKey` as the message `id`, so the code is faithful to the written design. The design itself is weak; both must be corrected.

**Smallest fix (no migration):**

```ts
const messageKey = typeof turn?.id === "string" && turn.id.length > 0 ? turn.id : "…";
const contentKey = digest(JSON.stringify(turn?.content ?? ""));
turnKey: digest(`${userHash}\0${threadId}\0${messageKey}\0${contentKey}`)
```

Retries and frontend-tool continuations keep the same last user message, so reuse is preserved. Add three regression tests: same id + different content → different keys; same id + same content → same key; continuation with unchanged content → same key. Existing tests cover only the last case (`tests/assistant/turn-key.test.ts`, `tests/api/copilotkit.test.ts`).

### C.2 Logical-turn identity coverage (cases A–E)

| Case | Behavior | Assessment |
|---|---|---|
| A. Same text sent twice, distinct ids | Different ids → different turn keys → two charges | Correct |
| A′. Same text twice, no ids | Content-hash fallback → same key within 5 min → one charge | Undercharge, not a bypass; spec-accepted limitation |
| B. Real continuation (last message is `tool`) | Last user message unchanged → same key → reuse | Correct; verified by tests and live replay |
| C. Different thread or user | Thread id and user hash both in the key → separate charges | Correct |
| D. Retry inside 5 minutes | Same key → `charged=false`, continuation counted | Correct; verified live |
| D′. Retry after 5 minutes | Charge row older than window → new charge | Correct; verified live (6-minute replay charged again) |
| E. Missing id | Content hash fallback | Works, subject to A′ |
| E′. No user message | Constant `"no-user"` key per thread | Bypass variant of P1-1 |
| E″. Unstable per-request ids | Every request is a new key | Forces a charge per attempt (overcharge, not a bypass) |

### C.3 P2-1 (confirmed, not merge-blocking) — "Accepted" dashboard metric counts only unfinalized runs

`assistant_usage_daily` counts `outcome = 'accepted'` (migration line 262). Finalization overwrites the same row with `completed` / `provider_error` / `client_aborted` / `execution_limit`. Live probe: one `accepted` row reads accepted=1; after finalization accepted=0 and completed=1. In steady state the headline "Accepted · last 14 days" therefore counts in-flight or abandoned runs and usually reads near zero. The hourly/daily "Accepted turns" counters come from the charge ledger and are not affected.

**Minimal fix:** relabel to "In flight", or derive accepted turns from the charge ledger / `charged` events. Enforcement and privacy are unaffected.

### C.4 P2-2 (accepted limitation) — Retention is opportunistic only

`maybePruneAssistantTelemetry` runs fire-and-forget after stream finalization, at most once per six hours per isolate, and swallows failures without retry until the next window. Low-traffic isolates can skip pruning indefinitely. This matches the approved design ("opportunistic, no scheduler") and is not a compliance guarantee. `tests/assistant/retention.test.ts` verifies the throttle, failure swallowing, and read-only skip.

### C.5 P3 findings (backlog)

- **Run-context eviction.** `lib/assistant/run-context.ts` evicts the oldest entry beyond 64 concurrent contexts; the route then falls back to environment defaults. A stricter admin limit can be relaxed under extreme per-isolate concurrency, but never beyond environment defaults.
- **Settings read fails open.** `lib/assistant/settings.ts` returns `{}` on read failure, so admin overrides silently fall back to bounded environment defaults. Safe default; an alert on the log line would help.
- **"Run timeout" is per fetch/step.** `lib/assistant/model.ts` applies the timeout to each fetch, not the whole run. The label is misleading; the total run can exceed `ai_timeout_ms`.
- **Execution-limit student surfacing.** When the model stops gracefully at `maxSteps` with finish reason `tool-calls`, telemetry records `execution_limit`, but the student may not receive an explicit error. Copy exists (`error-message.ts`); wiring depends on the stream ending in an error.
- **Access-mode audit lacks `before`.** Numeric limit changes record effective before/after; an `ai_assistant_access`-only change records no `before`. This predates D (same behavior at `51e726f`) and is not a D regression.
- **Dead UI branch in worktree.** The uncommitted settings client keeps a `canEdit=false` branch that the page never renders; not present at HEAD.
- **Verification-document drift.** The implementation report claims 2,563 tests; HEAD produced 2,565. Its "every value is clamped to code ceilings" is true at HEAD and false for the working tree.

### C.6 B-1 (working tree only) — Min-only limits contradict the spec and fail gates

The working tree (not HEAD) carries 24 modified and 8 untracked paths, including:

- `lib/assistant/limits.ts` — `ASSISTANT_LIMIT_BOUNDS` replaced by `ASSISTANT_LIMIT_MIN` + `ASSISTANT_LIMIT_INTEGER_MAX`.
- `lib/validation/admin.ts` — validation widened to int-max.
- `supabase/schema.sql` and `supabase/migrations/20261029_assistant_limit_min_only.sql` — all seven bounded CHECKs dropped and re-added as `>= min`.
- `components/admin/assistant-settings-client.tsx`, `app/admin/assistant/page.tsx` — `max` removed from the UI.
- `package.json` / `package-lock.json` + `components/admin/assistant-usage-charts.tsx` — new `chart.js` dependency and charts.
- New `lib/assistant/limit-audit.ts`, `usage-recording.ts`, `usage-shared.ts`.

This contradicts spec §5.1 ("CHECK constraints enforce the same ranges"), §6.1 ("absolute ceilings … cannot be raised from the admin UI"), and §5.2's bounded ranges. It also fails verification today:

- `npx tsc --noEmit` → exit 1: `tests/components/admin-assistant-settings.test.tsx(114,28): TS2345` (`Element` vs `HTMLElement`).
- Targeted tests → 1 failed / 12 passed: `tests/api/admin/assistant-page.test.ts:100` still expects `{ min: 1, max: 500, configuredValue: 60 }` while the worktree emits no `max`.
- Earlier full-suite run → 292 files, 1 failed / 2,581 passed.

The min-only migration does apply cleanly to a bounded scratch schema, so the direction is technically implementable — it simply has not been reviewed, specified, or made green. It must not be folded into the D merge.

### C.7 Threat model (adversarial review)

| # | Attacker input | Path | Trust boundary | Impact | Status | Minimum fix |
|---|---|---|---|---|---|---|
| 1 | Reused message `id` + different prompt | `/api/copilotkit/run` | Authenticated student → server | Unbounded runs per charge | **Confirmed (P1-1)** | Content-bind turn key |
| 2 | No user message, same thread | `/run` | Authenticated student → server | Unbounded runs per charge | **Confirmed (P1-1 variant)** | Same fix (content/`"no-user"` binding) |
| 3 | Direct POST to app-config as student/tester | `/api/admin/app-config` | Student → admin API | None | Confirmed safe | 403 via `requireAdmin` |
| 4 | Direct GET usage as student | `/api/admin/assistant/usage` | Student → admin API | None | Confirmed safe | 403 |
| 5 | Non-platform admin sends numeric limit + access in one body | `/api/admin/app-config` | Admin → platform-only field | None | Confirmed safe | Mixed payload → 403 |
| 6 | Unknown/extra JSON keys or empty body | `/api/admin/app-config` | Admin → validation | None | Confirmed safe | Zod strip + non-empty refine |
| 7 | Extreme or negative limit values | app-config | Admin → DB | None at HEAD | Confirmed safe | Zod + CHECK + read clamp |
| 8 | Forged `x-assistant-run-key` | `/run` | Client → runtime | None | Confirmed safe | Header overwritten with server UUID |
| 9 | Oversized or malformed body | `/run` | Client → server | None | Confirmed safe | 400/413 before claim |
| 10 | Quota store outage | `/run` | Server → DB | None | Confirmed safe | 503 fail-closed |
| 11 | Provider 402/429/401 | Runtime | Server → provider | Charged run, clear error | Confirmed (by design) | No refund on provider failure |
| 12 | Admin sets int-max limit (worktree only) | app-config / migration | Admin → DB | Weakens cost ceiling | **Confirmed in worktree, absent at HEAD** | Do not merge worktree; keep spec bounds |
| 13 | >64 concurrent runs per isolate | Runtime | Concurrency | Stricter admin limit relaxed to env default | Speculative/edge (P3) | Raise cap or persist run config |
| 14 | Cross-replica advisory-lock race | DB | Infrastructure | Double charge would require multiple primaries | Speculative; not applicable to single-primary Supabase | None |
| 15 | Read another user's usage by hash | Usage API | Admin → API | None | Confirmed safe | Aggregates only; no hashes returned |

No speculative item is reported as a confirmed vulnerability.

---

## D. Database and operational assessment

**Migration (HEAD).** `supabase/migrations/20261028_assistant_admin_ops.sql` is additive and idempotent (`add column if not exists`, `create table if not exists`, `create or replace function`):

- Seven nullable `app_config` limits with bounded CHECKs.
- `assistant_turn_charges` — PK `(user_hash, turn_key)`, `charged_at` index.
- `assistant_usage_events` — unique `run_key`, outcome CHECK list, token/step/duration columns, `occurred_at` index.
- RLS enabled on both tables (lines 62–63); privileges revoked from `public/anon/authenticated` (65–66); service-role grants.
- `claim_assistant_turn`, `assistant_usage_daily` (1–90 days), `prune_assistant_telemetry` (90/30/7 days), all `security invoker`, revoked from public roles, granted to `service_role` only (326–334).

**Atomicity and concurrency (local Supabase; scoped hashes; rows removed after probing; no production DB touched):**

| Scenario | Result |
|---|---|
| 10 concurrent deliveries of one turn | 1 charged, 10 allowed, counters 1/1, exactly 1 charge row |
| 10 concurrent distinct turns, hour limit 3 | 3 charged/allowed, 7 denied with `window_kind='hour'`, counters 3/3 |
| Day-window denial after hour increment | Hour counter remains 1; no partial write |
| Immediate replay | `charged=false`, continuation counted |
| Replay after 6 minutes | `charged=true`, counters 2/2 |
| `anon` table select / function execute | Permission denied |
| `service_role` insert + claim | Succeeded (inside a rolled-back transaction) |

This confirms advisory-lock serialization, idempotent replay, check-before-write across both windows, and denial isolation.

**Install/upgrade.** A fresh bootstrap of the on-disk `supabase/schema.sql` was verified on a scratch database, and the committed HEAD snapshot was confirmed to contain the same bounded columns, tables, RLS, and service-role RPC grants (`git show HEAD:supabase/schema.sql`, lines 2345–2358, 2403–2413, 2413–2675). The committed migration and the uncommitted min-only migration were each applied to a bounded scratch schema; both executed cleanly. All new columns are nullable, so existing rows inherit environment defaults with no backfill or downtime. See B-1 for why the min-only variant must not ship.

**Failure safety.** Quota writes fail closed (route 503). Settings reads fail open to bounded environment defaults. Telemetry writes are best-effort and cannot fail a response (`lib/assistant/telemetry-store.ts`, "Best-effort persistence"). Rejections and denials are recorded without blocking the response.

**Deployment notes.** No migration was run against production. The usage RPC avoids PostgREST row limits. `prune_assistant_telemetry` is bounded and safe to run manually. Retention and audit-log retention remain operational, not contractual, concerns.

---

## E. Independent test evidence

All runs below were executed by this audit, not copied from the implementation report.

| Gate | Target | Command | Result |
|---|---|---|---|
| Type check | committed HEAD (`git archive HEAD` → `/tmp/audit-head`, symlinked `node_modules`) | `npx tsc --noEmit` | **exit 0** |
| Full suite | committed HEAD | `npx vitest run` | **291 files / 2,565 tests passed** |
| Targeted D tests | committed HEAD | `assistant-page` + `admin-assistant-settings` | **9/9 passed** |
| Lint | worktree (same config as HEAD) | `npm run lint` (`eslint . --max-warnings=0`) | **exit 0** |
| Production build | committed HEAD | `npx next build` with dummy env names from `.env.local` | **exit 0**; type-check passed, route manifest emitted |
| Type check | working tree | `npx tsc --noEmit` | **exit 1** — TS2345 at `tests/components/admin-assistant-settings.test.tsx:114` |
| Targeted tests | working tree | `npx vitest run` on the two D UI/admin suites | **1 failed / 12 passed** — `tests/api/admin/assistant-page.test.ts:100` expects `max: 500` |
| Full suite | working tree | `npx vitest run` | **292 files, 1 failed / 2,581 passed** |

The first build attempt against HEAD failed only on missing Supabase/Clerk variables during page-data collection (type checking had already passed); rerunning with dummy values matching the required names produced exit 0. No credentials or network calls were required.

**D-specific test quality.**

- **Real-path coverage:** `tests/assistant/telemetry.test.ts` drives the actual `withStepMetrics` model wrapper with `MockLanguageModelV3` (token sums, null tokens, classification, cancellation, execution limit); `tests/api/copilotkit.test.ts` exercises the real route handler with mocked auth/claim/runtime; `tests/database/assistant-ops-sql.test.ts` statically asserts SQL shape but does not execute it. The live probes in §D supply the missing execution evidence.
- **Mock masking:** `tests/assistant/rate-limit.test.ts` mocks the RPC, so it cannot catch SQL behavior; `tests/api/admin/app-config.test.ts` mocks the config store, so it validates authorization and validation, not persistence.
- **Coverage gap:** no test asserts that the same message id with different content produces a different turn key. That gap is why P1-1 passed CI.

---

## F. Known limitations

- **No browser acceptance.** UI is verified by component tests and code reading only; the golden-path admin flow was not exercised in a browser.
- **No real provider calls.** Cost is a list-price estimate; token counts are provider-reported and not reconciled with billing.
- **Best-effort retention.** No scheduler was added, by design.
- **Fixed 14-day usage window at HEAD.** The 7/14/30-day selector exists only in the uncommitted worktree.
- **No durable conversations.** V2.3.5-C remains deferred; no conversation persistence was added.
- **Aggregate-only usage.** Deliberately no per-user drilldown, to preserve the privacy boundary.
- **Run-context and prune state are per-isolate** and assume modest concurrency (<64 concurrent runs per isolate).
- **Audit-log insert is best-effort.** A failed insert is logged but does not fail the config update.
- **Working tree is not mergeable as-is** (B-1).

---

## G. Smallest required fixes (P0/P1 only)

1. **P1-1 (required).** Bind a digest of the last user message content into `turnKey` in `lib/assistant/turn-key.ts`; update spec §3.1 to match; add the same-id/different-content regression tests. Single-function change; no schema or migration change.
2. **B-1 (required process step, not a HEAD defect).** Exclude the uncommitted min-only/charts iteration from the merge. Revert it or move it to its own branch with a spec revision and green gates. Do not merge a tree that fails `tsc` and one test.
3. **P2-1 (recommended, not required).** Relabel the "Accepted" dashboard metric to "In flight" or compute accepted turns from the charge ledger.

No P0 findings were identified.

---

## H. Integration recommendation

- **Do not merge `ad5dd10` as-is.** Fix P1-1 first, re-run the full gate set green (tsc, vitest, lint, build), then merge into `feat/global-assistant-v2` (a `--no-ff` merge keeps the 12-commit history reviewable).
- **Do not include the dirty worktree.** Keep it out of the merge; it contradicts the approved hard ceilings and fails two gates.
- **Do not merge V2 into `dev`.** Verified that `dev` and `main` contain neither V2 nor D.
- **Keep V2.3.5-C deferred.** No C branch exists and no conversation persistence was added.
- **Separate engineering merge from deployment acceptance.** This audit certifies code, tests, build, and local database behavior. Browser acceptance, real-provider behavior, and the production migration run remain deployment gates.
- **No automatic merge was performed.**

**Bottom line:** V2.3.5-D delivers the agreed administration and usage controls with sound atomic accounting, correct authorization, bounded execution, and privacy-safe telemetry. The one P1 is a real but small identity-binding flaw, locally fixable without schema changes. Once that fix lands and the uncommitted min-only iteration is kept out of the merge, D is safe to merge into the V2 development branch.
