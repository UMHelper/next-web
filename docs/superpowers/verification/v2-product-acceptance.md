# What2Reg AI — V2 Product Acceptance & Milestone Closure

Date: 2026-10-28
Canonical branch: `feat/assistant-v2-3-5-b2-remediation`
Verified revision: **`15723e0`**
Academic-consistency implementation: `833b977`
Remote branch: `origin/feat/assistant-v2-3-5-b2-remediation` at `15723e0`

This is an acceptance assessment. No implementation, prompt, grader, schema,
timetable, or deployment change was made in this checkpoint.

## 1. Baseline verification

| Item | State |
|---|---|
| B.3 worktree | `/Users/thomaswu/Workspace/next-web/.worktrees/assistant-v2-3-5-b2` |
| B.3 HEAD | **`15723e0`** |
| B.3 status | Clean |
| Remote review branch | `15723e0`, non-force history |
| Primary checkout | `/Users/thomaswu/Workspace/next-web` at **`718afd8`**, 49+ commits behind |
| Existing server on `3000` | Runs the **stale primary checkout `718afd8`**, signed-out |
| B.3 server on `3001` | Booted from the B.3 worktree at `15723e0`, HTTP 200, signed-out; stopped after verification |
| Browser automation | Not installed |
| Authenticated test account | Not available |

The stale `3000` server must not be used as evidence for this revision.

## 2. V2.3.5-B implementation scope — frozen

V2.3.5-B is **implementation complete** and should not be reopened for another
general stabilization cycle.

Implemented and internally verified:

- conversational course discovery with bounded candidate pools;
- preference-aware ranking and hard/soft constraint separation;
- course, instructor, review and section retrieval;
- deterministic individual timetable conflict checking;
- hypothetical combined timetable previews;
- cross-turn course-reference resolution, including displayed recommendation
  order and old-list/new-list precedence;
- selective rich UI and natural-text responses;
- academic evidence, rating scales, sample-size caveats and uncertainty;
- read-only website integration with no timetable mutation tools.

Relevant accepted engineering evidence:

- referent fix `64d8b64`;
- academic-consistency fix `833b977`;
- **282 files / 2472 tests passed**;
- TypeScript, lint, and production build passed.

The following are **not** part of the frozen B milestone:

- durable conversation or planning state;
- approved website actions;
- timetable optimization;
- comparison-specific tools;
- mobile/responsive assistant support below the desktop gate;
- usage/cost dashboards.

## 3. Browser acceptance — UNVERIFIED

No authorized authenticated browser session was available. The existing
`localhost:3000` server is stale (`718afd8`), the B.3 server boots but is
signed-out, and no Playwright/Puppeteer browser is installed.

Therefore browser acceptance is **UNVERIFIED**, not passed. Unit and integration
tests are not a substitute.

### Manual Journey A — natural academic conversation

Use the exact revision `15723e0`, an authorized tester account, and desktop
viewport **1440×900** or **1280×800**.

1. “Recommend three easy GEST courses offered this semester, preferably after 10 AM.”
   - Real offered courses/sections, rating caveats, no invented data.
2. “Also avoid Friday classes.”
   - Previous constraints retained; Friday options clearly labelled as compromises,
     not as “no-Friday” matches.
3. “Tell me more about the second recommendation and who teaches it.”
   - Correct displayed second course; successful detail/instructor lookup; no
     `needs_clarification`; no retry loop.
4. “Compare it with the first recommendation on ease, grades, review sample and schedule.”
   - Higher difficulty score described as easier; sample size stated; no claim
     that the easiest is automatically the best overall.
5. “Which of these fits my existing timetable?”
   - Deterministic section-level evidence; no unverified clash-free claim;
     correct `no_timetable` behavior when no plan exists.
6. “Can I take these three sections together? Show me a possible combination.”
   - Direct known overlaps may be stated as conflicts; a proposed full
     combination uses `preview_timetable` with exact section IDs and
     `facts.week`; preview is clearly hypothetical, not saved.

### Manual Journey B — academic correctness

Check the actual text against the tool data on screen:

- difficulty direction: 1 very hard, 5 very easy; higher is easier;
- exact meeting days and start/end times;
- section and instructor identity;
- conflicts versus verified non-conflicts;
- review counts and weak-sample caveats;
- prerequisites, seats and assessment format described as unavailable when the
  site has no official data.

### Manual Journey C — UI and failure handling

At 1440×900 and 1280×800, with chat panel widths around 380/450/800 where the
layout allows:

- course cards and recommendation deduplication;
- readable comparison tables and prose;
- streaming, loading, and agent-activity states;
- sidebar scrolling, focus, close/reopen;
- empty search result;
- temporary tool/API failure;
- exhausted API balance produces a clear error, not a duplicated user message;
- no timetable mutation and no false “saved” language.

The assistant is hidden below `1024px`. That is a documented product limitation,
not a bug to fix inside this acceptance checkpoint.

## 4. Problem classification

### P0 — immediate blocker

**None identified** in source, tests, or available evidence.

### P1 — controlled-pilot blocker

**No confirmed P1 product defect remains from the assessed V2 scope.** The
discovery follow-up referent defect and the academic-evidence gaps found in the
six-turn conversation were addressed in `64d8b64` and `833b977`.

Caveat: because browser acceptance is unverified, a browser-only P1 cannot be
ruled out until Journey A/B/C is executed. That is a verification condition, not
a known code defect.

### P2 — product backlog

1. Intermittent unnecessary tool calls and `temporarily_unavailable` retry loops.
2. Model prose can still ignore or misstate structured evidence fields in a
   particular reply, even though the fields are now present.
3. Sparse or unreadable review text limits qualitative workload advice.
4. No dedicated comparison surface; comparisons rely on sequential tools and prose.
5. No durable conversation/shortlist/proposal state across reloads.
6. Desktop-only availability below `1024px`.
7. No per-user usage/cost visibility or admin budget controls.
8. Stale local server on port 3000 can mislead manual testing unless the running
   revision is checked first.

### P3 — polish

- occasional “I’ll look…” openings despite the style rule;
- card/activity presentation polish;
- minor wording and formatting variation;
- extra explanatory detail in some answers.

These do not block a controlled pilot.

## 5. Historical benchmark status — unchanged

No historical holdout case, threshold, or result was changed or rerun to improve
a score.

| Artifact | Result |
|---|---:|
| B.3 dev | 65/72 (90.3%); discovery 36/36 |
| B.3 frozen holdout | 14/18 (77.8%); discovery **15/18 (83.3%)** |
| Historical protocol gate | **FAIL** on ≥90% discovery use |
| B.3 semantic evidence | holdout 18/18; shadow-v2 8/8 (team/manual) |

The discovery-use failure is the documented year-one CIS listing ambiguity. It
is not retroactively relabeled PASS. The semantic rubric remains a separate
proposed product gate.

## 6. Controlled-pilot recommendation

**B. Conditional pilot.**

V2.3.5-B is implementation-complete and internally accepted, but a controlled
student pilot should proceed only after:

1. Authenticated browser validation of Journey A/B/C against **`15723e0`** at
   supported desktop viewports.
2. Confirmation that browser validation finds no P0/P1 issues.
3. Explicit acceptance of the desktop-only viewport limitation for the pilot.
4. A support path for API-balance failures and temporary tool errors.
5. Testers restricted to authorized accounts; no real student timetable changes.

If those conditions are met, the current capability is suitable for a controlled
read-only pilot. It is **not** broadly deployment-ready.

## 7. What was and was not verified

**Verified:**

- source revision and Git state;
- deterministic test suite, types, lint, production build;
- referent resolution and academic-evidence consistency through unit,
  integration, and data-boundary tests;
- read-only tool surface and no timetable write path;
- B.3 server can boot from the canonical worktree.

**Not verified:**

- authenticated browser rendering, streaming, focus, and panel behavior;
- real Clerk/Supabase/model behavior in the current running revision;
- production deployment revision;
- mobile/tablet behavior below `1024px`;
- real review-body data quality and cost/usage at scale.

## 8. Recommended next product milestone

**V2.3.5-C candidate: Read-only Feasible Plan Builder.**

Build the first end-to-end “requirements → feasible term plan” workflow:

- student states degree/term constraints and preferences;
- assistant proposes a complete set of sections, not just isolated courses;
- existing discovery, `check_plan_conflicts`, and `preview_timetable` provide the
  deterministic feasibility evidence;
- the assistant explains tradeoffs and unavailable evidence;
- the proposal is explicitly hypothetical and never writes to the timetable;
- only the minimum ephemeral proposal state needed for the turn is retained.

This is higher student value than adding more read-only lookup tools or rich UI,
and it is a safer prerequisite for V2.4 actions than building persistence first.
It should be scoped and approved separately; this checkpoint does not start it.

Do not start V2.4 writes or V3 optimization until a durable plan/action/audit
model exists.

## 9. Final statement

V2.3.5-B can be closed as an **implementation milestone**. The next decision is
product acceptance: run the authenticated browser checklist, then either confirm
Conditional Pilot or record a concrete P0/P1 blocker with reproduction evidence.

No merge, deployment, benchmark change, or further B remediation was performed.
