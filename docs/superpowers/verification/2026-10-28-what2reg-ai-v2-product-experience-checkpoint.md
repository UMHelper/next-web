# What2Reg AI — V2 Product Experience Checkpoint Report

Date: 2026-10-28
Worktree: `.worktrees/assistant-v2-3-5-b2`
Branch: `feat/assistant-v2-3-5-b2-remediation`
Implementation HEAD: `64d8b64` (referent fix `468b102`, audit preservation `5cb1509`, last-reference guard `64d8b64`). This report is a docs-only commit after the implementation.
Audit: [V2 Implementation Reality & Project Status Audit](../audits/2026-10-28-what2reg-ai-v2-implementation-reality-audit.md)

This checkpoint completes the audit's three immediate actions: establish the
source of truth, fix the discovery follow-up referent defect, and attempt website
acceptance. It does not start V2.3.5-C, V2.4, V3, or a broad stabilization cycle.

## 1. Canonical Git state and current SHA

| Location | Branch | HEAD | Relationship |
|---|---|---|---|
| `.worktrees/assistant-v2-3-5-b2` | `feat/assistant-v2-3-5-b2-remediation` | **`64d8b64`** implementation; later docs commit | Canonical V2 candidate |
| Primary `/Users/thomaswu/Workspace/next-web` | `feat/assistant-v2-3-5-b-discovery` | `718afd8` | **48 commits behind** the B.3 worktree |
| `.worktrees/assistant-v2-1-ux` | `feat/assistant-v2-1-ux-refinement` | `2760617` | Older UX line |
| `origin/feat/assistant-v2-3-5-b2-remediation` | remote branch | `64d8b64` + docs | Created in this checkpoint, non-force |
| `origin/feat/global-assistant-v2` | remote branch | `221e73b` | Older, not canonical |
| `origin/main` | remote branch | `0ff1e7a` | Does not contain V2; B.3 is 165 commits ahead |

The primary checkout is the repository root, but it is not the newest code. It
contains discovery at `718afd8` and lacks the B.2/B.3 remediation commits.
Opening the repository root does **not** show the canonical implementation.

`2f79726` is no longer the latest canonical B.3 implementation. `468b102` adds
the referent fix, `5cb1509` preserves the 2026-10-28 audit, and `64d8b64` adds
the last-reference boundary. This checkpoint report is a docs-only commit after
the implementation.

## 2. Backup and remote status

- Existing recovery backups preserved:
  - `backup/b2-f7aa687`
  - `backup/b2-pre-recovery-69a94e7`
- New non-destructive checkpoint: `backup/v2-checkpoint-2f79726`.
- Review branch pushed normally:
  `origin/feat/assistant-v2-3-5-b2-remediation`, containing `64d8b64` and this
  docs-only checkpoint report.
- Local branch now tracks that remote branch.
- No force-push, reset, history rewrite, worktree deletion, merge, or deployment.
- Primary checkout’s untracked audit/plan documents were not discarded; the
  2026-10-28 audit was copied into the B.3 branch and committed.

Remote URL: `https://github.com/UMHelper/next-web.git`. Credentials/token values
were not printed.

## 3. Running revision

| Server | Location | Revision | Result |
|---|---|---|---|
| `localhost:3000` (existing) | primary checkout | `718afd8` | Serves the **stale** primary checkout, not B.3; signed-out (`x-clerk-auth-status: signed-out`) |
| `localhost:3001` (started for this check) | B.3 worktree | `5cb1509` | Booted and returned HTTP 200; signed-out; stopped after the check |

Automated tests and the targeted live follow-up ran against the implementation
at **`64d8b64`**; the only later commit is this report.
No browser session was signed in. Browser behavior is **UNVERIFIED**; do not
attribute the stale `718afd8` server to B.3.

## 4. Referent-binding root cause

The failure was a seam between three correct-looking modules:

1. `courseReferentFromRun` read page, catalog, and discussed-courses context, but
   **not** the visible-blocks context that records what the chat actually
   displayed.
2. `collectPriorCourseCodes` harvested explicit codes, course-tool arguments,
   and course-tool results. It ignored discovery results and published
   recommendations, so a discovery shortlist contributed no prior codes.
3. `ENGLISH_ORDINAL_GATE` recognised “course”, “one”, and “result”, but not
   “option”, “recommendation”, “choice”, or “pick”. “Tell me more about the
   second option” was therefore not parsed as an ordinal; it fell through to the
   anaphora “it” with no prior course.

The resolver returned an ambiguous referent. `bindCourseToolArgs` then returned
`needs_clarification`; the model retried, sometimes guessed a different course,
and the evaluator still passed because it only checked that the reply mentioned a
course code. The audit’s trace showed the second displayed recommendation was
GEST1005 while a retry used GEST1006.

The fix uses **visible recommendations**, not the full internal discovery
candidate list. An unpresented discovery result is not a visible list.

## 5. Code changes and commits

| Commit | Change |
|---|---|
| `468b102` | Bind follow-up ordinals to displayed recommendations |
| `5cb1509` | Preserve the 2026-10-28 audit in the canonical branch |
| `64d8b64` | Keep unrelated “last semester” text out of recommendation ordinals |

Implementation:

- New `lib/assistant/visible-blocks-context.ts` parses displayed recommendation
  blocks in newest-first order. `visible-blocks.ts` re-exports the shared
  description/types.
- `course-referent.ts` now:
  - treats “second option/recommendation/choice/pick” as an ordinal;
  - supports “last” recommendation;
  - uses the newest displayed recommendation list for ordinals;
  - keeps explicit codes and fresh page context ahead of older lists;
  - does not treat an unpresented discovery tool result as visible;
  - keeps a later course lookup ahead of an older recommendation list for “its”;
  - appends recommendation codes only when no later course tool call exists.
- `tools.ts` returns a terminal clarification result on a repeated course-tool
  call after the first blocked referent, so the model is told not to retry.
- `agent.ts` resets that per-turn clarification state at the start of each run.

## 6. Regression results

Focused tests for modified files:

- `tests/assistant/course-referent.test.ts`: 42 tests, including displayed order,
  different internal/display order, newer list, last, explicit code, page
  precedence, unpresented discovery, and genuine ambiguity.
- `tests/assistant/tools.test.ts`: repeated ambiguous course tool returns a
  terminal clarification and does not fetch.
- `tests/components/assistant-v2-3-5-b.integration.test.tsx` **J3b**:
  - turn 1 discovers and presents `["GEST1006", "GESB1013"]`;
  - turn 2 asks about “the second option and who teaches it”;
  - the model deliberately guesses `GEST1006`;
  - the referent resolver rewrites it to `GESB1013`;
  - the actual `get_course` result contains `"courseCode":"GESB1013"` and
    `LEE MEI LING`;
  - there is no `needs_clarification`;
  - the final answer renders the instructor.

Targeted live follow-up (`eff-detail_followup`, 1 repeat, implementation SHA `64d8b64`):

- Turn 1 presented five GEST options; turn 2 resolved “second option” to
  **GEST1005**.
- Calls: `get_course(GEST1005)`, `get_course_reviews(GEST1005, CHEUNG WAI)`,
  `get_course_sections(GEST1005, CHEUNG WAI)`, relevant `present_response`.
- No `needs_clarification`, no wrong-course retry, no fabricated instructor.
- Result: **2/2 turns passed**; artifact
  `.eval-results/assistant/discovery-v2-referent-live.json`.

Historical B.3 evaluation results are unchanged and were not rerun to chase
scores:

| Artifact | Result |
|---|---:|
| `discovery-b3-dev-final.json` | 65/72 (90.3%); discovery 36/36 |
| `discovery-b3-holdout-final.json` | 14/18 (77.8%); discovery 15/18 (83.3%) |
| `discovery-b3-shadow-v2.json` | 7/8; discovery 5/5 |
| Semantic B.3 | holdout 18/18; shadow-v2 8/8 (team/manual evidence) |

The historical discovery-use gate remains **FAIL** (15/18 vs 90%); the
year-one CIS listing ambiguity remains the documented cause. The referent fix
does not change that protocol result.

## 7. Full automated verification

| Gate | Result |
|---|---|
| Full Vitest | **282 files / 2466 tests passed** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, no warnings |
| `npm run build` | exit 0 |

Logs: `.eval-results/assistant/v2-referent-final-{vitest,tsc,lint,build}.log`.

## 8. Real-browser acceptance — UNVERIFIED

No authenticated browser session was available:

- the existing `localhost:3000` server runs the stale primary checkout
  (`718afd8`), not B.3;
- the B.3 worktree server on `3001` boots at `5cb1509` but is signed-out;
- no Clerk test-account credentials are available;
- no Playwright/Puppeteer/browser automation binary is installed.

Therefore none of the required student journey was browser-tested. This is an
**UNVERIFIED** result, not a pass.

Manual checklist for the exact build `64d8b64`, at desktop viewport
**1440×900 and 1280×800** (assistant is hidden below 1024px):

1. Sign in as an authorized tester; open the assistant on `/`.
2. “I’m a second-year CS student. Recommend some easy GEST courses without morning classes.” — relevant offered candidates, real sections, caveats, no excessive clarification.
3. “I’d also prefer not to have Friday classes.” — context retained; requirements vs preferences distinguished.
4. “Tell me more about the second option and who teaches it.” — correct displayed second course, successful detail/instructor lookup, no `needs_clarification`, no retry loop.
5. “Compare it with the first recommendation. Which seems easier?” — grounded comparison, correct scale/sample caveats, no invented field.
6. “Which one actually fits my existing timetable?” — deterministic section-level check, no unverified clash-free claim, correct `no_timetable` when empty.
7. “Can I take these three sections together?” — combined `preview_timetable`, real section IDs, hypothetical vs saved distinction, no mutation.
8. Navigate to a course page and change catalog filters — fresh page context beats stale conversation; manual timetable change invalidates old compatibility evidence.
9. Failure behavior: unknown course, empty discovery, temporarily unavailable lookup, unreadable reviews, genuine ambiguity, failed timetable check, rate limit — truthful recovery, no repeated equivalent searches.
10. UI at panel widths ≈380/450/800 inside a supported desktop viewport — readability, cards, tables, scrolling, streaming, loading, tool activity, focus, reopen; capture screenshots and record the tested SHA.

Do not use the stale `3000` server as evidence for B.3.

## 9. Remaining student-facing defects

1. **Desktop-only gate.** `DesktopAssistantGate` hides the assistant below
   `1024px`; the older 380/450/800px browser checklists were invalid. The product
   and acceptance docs still need an explicit supported-viewport decision.
2. **Browser runtime unverified.** Rich UI, streaming, focus, loading, panel
   resizing, and failure states were not exercised in a signed-in browser.
3. **Retry/efficiency variance remains.** The referent fix removes the common
   wrong-course loop, but `temporarily_unavailable` retries and over-research
   can still inflate calls.
4. **No durable conversation or planning state.** Reload loses context; this is
   out of scope for this checkpoint and remains a V2.3.5-C concern.
5. **No course comparison tool.** The assistant can compare from existing tool
   evidence, but there is no dedicated comparison surface.
6. **B.3 historical protocol FAIL remains.** The year-one CIS listing conflict is
   an evaluation-methodology limitation, not a product pass.

## 10. Supported viewport decision still required

Current source is desktop-only at `(min-width: 1024px)`. Choose one:

- **Declare desktop-only** for the controlled pilot and rewrite acceptance to
  1440×900/1280×800 plus panel widths only; or
- **Approve responsive work** as a separate product decision; do not smuggle a
  mobile redesign into this checkpoint.

No viewport code was changed here.

## 11. Can V2.3.5-B be closed as an implementation milestone?

**Yes — close V2.3.5-B as an implementation milestone, with separate acceptance
labels.**

| Classification | Result |
|---|---|
| Implementation complete | **Yes** — referent seam fixed; B.3 efficiency/correctness changes preserved; deterministic tests pass |
| Internal acceptance | **PASS** — 2465 tests, tsc/lint/build, focused referent integration, targeted live follow-up |
| Browser acceptance | **UNVERIFIED** |
| Controlled-pilot readiness | **Conditional** — desktop viewport ≥1024px, authorized testers, browser checklist, canonical `5cb1509` |
| Broad-deployment readiness | **Not ready** — browser runtime, viewport policy, durable state, and operational visibility remain |

The canonical implementation candidate is `64d8b64`; the remote branch also
contains this report commit on `origin/feat/assistant-v2-3-5-b2-remediation`. No merge was performed. Do not
start V2.3.5-C, V2.4, or V3 from this checkpoint without a separate decision.
