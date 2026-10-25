# Global assistant V1-C verification

- Branch: `feat/global-assistant-v1`
- Code verified through: `ea5be95` (this doc correction is the commit after that)
- Baseline before V1-C: `4b592d1` — 200 test files, 1,328 tests
- Plan: [2026-10-22-global-assistant-v1c.md](../plans/2026-10-22-global-assistant-v1c.md)
- Verified: 2026-10-22 (local)

## Step 1: Automated checks

Commands run separately (not chained).

| Check | Result |
|---|---|
| `npm run lint` | exit 0 at `ea5be95` |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | exit 0 — **Test Files 202 passed (202), Tests 1429 passed (1429)** (vs baseline 200 / 1,328: +2 files, +101 tests) |

## Step 2: Builds

| Command | Result |
|---|---|
| `npm run build` | exit 0 (Next.js 15.5.27; pre-existing CopilotKit `channel-manager` critical-dependency warning during compile; build lint/type step clean — no `use-navigate-tool.ts` exhaustive-deps warning) |
| `npm run build:pages` | exit 0 (`OpenNext build complete`; no wrangler EPERM in this run) |

## Step 3: Lazy-chunk check (`landed_elsewhere`)

After `npm run build`, searched `.next` for `landed_elsewhere`.

| Chunk | `landed_elsewhere` | `CopilotSidebar` |
|---|---|---|
| `.next/static/chunks/792.8e95324abd7747c1.js` | yes (only chunk) | no |
| `.next/static/chunks/950a34e6.4e16e1a3c4e6d61e.js` | no | yes (only chunk) |
| `.next/static/chunks/app/layout-87c52d55012f1df2.js` (root layout) | no | no |

Also checked root layout chunk for `CopilotKit`, `copilotKitSidebar`, and `navigate`: no matches.

**Automated lazy-chunk criterion:** `landed_elsewhere` is not in the root layout chunk (only in lazy chunk 792). Plan checklist also expects co-location with `CopilotSidebar`; this build splits them across 792 and 950 (both lazy, not in root layout).

## Step 4: Git hygiene (pre-commit)

| Item | Observed |
|---|---|
| `app/layout.tsx` `darkreader-lock` hunk | unstaged |
| `docs/superpowers/plans/2026-10-22-global-assistant-v1b.md` | untracked |
| `docs/superpowers/plans/2026-10-22-global-assistant-v1c.md` | untracked |
| `git stash list` | `stash@{0}: WIP on feat/global-assistant-v1: b1e9a66 feat(assistant): drop the timetable-page wording from the prompt` |

## Step 5: Acceptance scenarios (signed-in, allowlisted, desktop ≥1024px)

Environment: no signed-in desktop assistant session in this workspace (same blocker as V1-B). **None of the scenarios below are marked passed.** Each is **not observed**.

| # | Scenario | Status | `/run` count | Follow-up page context | Final URL | Prior messages visible |
|---|---|---|---|---|---|---|
| 1 | `/` → "帶我去 ACCT1000" | **not observed** | — | — | — | — |
| 2 | Course A → course B (ACCT1000 → ECON1001) | **not observed** | — | — | — | — |
| 3 | Reviews for instructor on ACCT1000 | **not observed** | — | — | — | — |
| 4 | Co-taught instructor reviews (GELH2009) | **not observed** | — | — | — | — |
| 5 | Instructor page (CHAN TAI MAN) | **not observed** | — | — | — | — |
| 6 | Catalog FST → CIS → 通識 | **not observed** | — | — | — | — |
| 7 | Timetable | **not observed** | — | — | — | — |
| 8 | Already on ACCT1000 | **not observed** | — | — | — | — |
| 9 | ZZZZ9999 not found | **not observed** | — | — | — | — |
| 10 | Ambiguous "去那個頁面" | **not observed** | — | — | — | — |
| 11 | External URL | **not observed** | — | — | — | — |
| 12 | Injection professor URL | **not observed** | — | — | — | — |
| 13 | Answer without navigate | **not observed** | — | — | — | — |
| 14 | Stop mid-navigation | **not observed** | — | — | — | — |
| 15 | Resize below 1024px during navigation | **not observed** | — | — | — | — |
| 16 | Rate limits vs plan table (scenarios 1–9) | **not observed** | — | — | — | — |
| 17 | Outstanding V1-A.1 + V1-B authenticated checks | **not observed** | — | — | — | — |

## Outstanding from V1-A.1 and V1-B (scenario 17)

Recorded per plan; **not run** in this session.

| Area | Status | Notes |
|---|---|---|
| V1-A.1 desktop/mobile assistant, streaming, tools, conversation persistence, sign-out | **not observed** | No signed-in session. |
| V1-B page-context scenarios and authenticated desktop checks | **not observed** | No signed-in session. |

## Rollout risks (unchanged; not re-validated here)

Documented in the V1-C plan (rate limits, injection, `%2F` builders, existence checks, dev timeouts, CopilotKit internals, model compliance, authenticated gap). Automated tests and builds above do not substitute for signed-in acceptance.

## Pending product decision (unchanged)

Uncommitted `<meta name="darkreader-lock" />` in `app/layout.tsx` — intentionally excluded from verification commits.
