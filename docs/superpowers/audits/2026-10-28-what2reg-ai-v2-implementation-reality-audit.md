# What2Reg AI — V2 Implementation Reality & Project Status Audit

**Audit date:** 2026-10-28
**Type:** Independent, read-only product and implementation audit
**Auditor:** External reviewer (no code, branch, prompt, grader, database, or deployment changes made)
**Newest revision examined:** `2f79726` (`feat/assistant-v2-3-5-b2-remediation`, worktree `.worktrees/assistant-v2-3-5-b2`)
**Primary worktree examined:** `718afd8` (`feat/assistant-v2-3-5-b-discovery`)
**Remote baseline examined:** `origin/feat/global-assistant-v2` @ `221e73b`

---

## 0. How to read this report

### 0.1 Evidence labels

Every material claim below is tagged with one of these labels:

| Label | Meaning |
|---|---|
| **SOURCE** | Verified by reading the current source at the cited path and line. |
| **TEST** | Verified by running a deterministic test suite in this audit. |
| **EVAL** | Read from an existing evaluation artifact; not re-run in this audit. |
| **DOC** | Stated in an existing audit/verification/spec document; not independently re-verified. |
| **UNVERIFIED** | Could not be verified in this audit (usually runtime, deployment, or browser behavior). |

Where a claim depends on an evaluation artifact, the artifact path is given. Where a claim depends on a document written by the team that built the feature, it is labelled **DOC** and treated as a claim, not proof.

### 0.2 What this audit did not do

Per the brief, this audit did **not**:

- implement or fix code;
- rewrite prompts or tool descriptions;
- modify graders, evaluation cases, fixtures, or thresholds;
- change architecture;
- merge, rebase, cherry-pick, reset, or switch branches;
- remove worktrees;
- start another coding agent;
- change database records or saved student timetables;
- run a costly live-model suite to produce a new score;
- deploy;
- read or expose secret values.

No `.env.local` values, API tokens, student records, or credentials are reproduced here. Environment variables are named only where necessary for browser-test prerequisites.

### 0.3 Confidence statement

- **High confidence:** repository topology, source-level behavior, deterministic test results, read-only boundary, tool inventory, eval artifact numbers.
- **Medium confidence:** product behavior derived from source + eval traces (because traces are real model runs but not live browser sessions).
- **Low confidence / none:** the currently deployed website, authenticated UI behavior, real user data quality, mobile rendering, and production operations.

---

## 1. Executive summary

### 1.1 Verdict

What2Reg AI V2 is a **genuinely substantial, read-only course-discovery assistant** with a clean presentation architecture, a credible deterministic course/timetable core, and unusually disciplined evaluation artifacts. It is **not** yet a verified live product. The newest implementation is **not merged, not pushed, and not demonstrably deployed**, the assistant is **invisible below 1024px**, and the most important conversational loop — "find options, then ask about one of them" — **fails deterministically** while the evaluation suite still marks it as passing.

The honest status is: **strong engineering foundation, unverified runtime, one core conversational defect, and a source-of-truth/release problem that must be resolved before any further feature work.**

### 1.2 Headline findings

1. **Source of truth is ambiguous and unpushed.** B.3 lives only in a local worktree branch at `2f79726`. The primary worktree is `718afd8`; the remote feature branch is 18 commits behind discovery; `origin/main` does not contain the V2 assistant at all. The running website's version **cannot be established** from this environment. **SOURCE / UNVERIFIED**
2. **The deterministic gate is real.** An independent run in the B.3 worktree passed **282 test files / 2,454 tests**, exit 0, in ~20s. **TEST**
3. **Discovery quality improved materially, but the preregistered holdout gate is not met.** B.3 dev: 65/72 turns (90.3%), discovery used correctly 36/36. B.3 holdout: 14/18 (77.8%), discovery used correctly **15/18 (83.3%)** against a documented **90%** gate. **EVAL / DOC**
4. **A core referent bug is proven and hidden by the grader.** In the efficiency trace for `eff-detail_followup`, turn 1 asks "Tell me more about the second option." `get_course` returns `needs_clarification` because discovery results are not treated as a source of prior course codes; the grader still passes the turn because the reply happens to mention the right course. **EVAL + SOURCE**
5. **The assistant cannot render on the devices the acceptance docs test.** The UI gate is `(min-width: 1024px)`; B.2/B.3 browser checklists use 380/450/800px. At those widths the assistant returns `null`. **SOURCE**
6. **Conversation state is ephemeral by construction.** The runtime uses an in-memory agent runner (16 threads, 8 runs/thread, 2MB) and a 30-turn cap; there is no durable conversation or planning-state store. Reload/eviction loses context. **SOURCE**
7. **Read-only is well enforced, but by convention plus a static test.** No mutating tools exist; a repository test scans the assistant tree and allowlists tool names. Database access uses a privileged service key that bypasses RLS, so the guarantee is architectural, not a database permission boundary. **SOURCE / TEST**
8. **Operational visibility is minimal.** Access modes and tester management exist; there is **no quota configuration UI, no per-user usage/cost dashboard, and no run audit trail**. Metrics are one log line per model step with no prompt/reply text. **SOURCE**
9. **The three most consequential product problems** are: cross-turn referent binding, unavailability on sub-1024px screens, and non-durable session/planning state (with latency/cost variance as the operational symptom). See §13.
10. **Recommendation:** do **not** start V2.3.5-C as originally scoped, and do **not** start V2.4. First reconcile the source of truth and fix the referent/availability/durability triad with a narrowly scoped **V2.3.5-C "Continuity & Trust"** milestone. See §14.

### 1.3 What the product can do today, in one paragraph

A signed-in user on a viewport at least 1024px wide, when the assistant is enabled for them, can open a side panel and chat with a read-only agent that searches the course catalog, counts courses/reviews, reads course details, descriptions, ILOs, instructors, reviews, and section lists; discovers candidates matching constraints such as "easy GEST that does not start in the morning" with ranked fit evidence; navigates the site; filters an existing catalog result set; checks whether one course fits the saved timetable; and previews adding up to three sections **without saving**. It explicitly asks for clarification when a course reference is ambiguous. It cannot compare courses, modify the timetable, save anything, remember a conversation after a reload, or appear on a phone. **SOURCE; runtime UNVERIFIED.**

---

## 2. Repository, worktree, and source-of-truth status

### 2.1 Worktree and branch topology

| Location | Branch | HEAD | Upstream | Position vs related branches |
|---|---|---|---|---|
| `/Users/thomaswu/workspace/next-web` (primary) | `feat/assistant-v2-3-5-b-discovery` | `718afd8` | none | Parent of the B.2/B.3 branch |
| `.worktrees/assistant-v2-3-5-b2` | `feat/assistant-v2-3-5-b2-remediation` | `2f79726` | none | **46 commits ahead of discovery** |
| `.worktrees/assistant-v2-1-ux` | `feat/assistant-v2-1-ux-refinement` | `2760617` | none | Older UX line |
| remote | `origin/feat/global-assistant-v2` | `221e73b` | — | **18 commits behind discovery**, no divergence |
| remote | `origin/main` | — | — | Does **not** contain `presentation.ts`, `discovery/`, `timetable-preview.ts`, `timetable-context.ts` |

**Evidence:** `git worktree list`, `git rev-list --count`, `git rev-parse`, tree checks against `origin/main`. **SOURCE**

Primary worktree status: clean except three untracked planning/audit documents:

```
?? docs/superpowers/audits/2026-10-26-assistant-v2-3-5-b2-forensic-failure-analysis.md
?? docs/superpowers/audits/2026-10-27-assistant-b2-worktree-session-recovery-audit.md
?? docs/superpowers/plans/2026-10-26-assistant-v2-3-5-b2-remediation.md
```

### 2.2 What this means

1. **The implementation students would actually use is ambiguous.** The newest, best-tested code (`2f79726`) exists only on a local branch in a secondary worktree. Nothing in this environment proves that any deployed site runs it.
2. **`main` is not the V2 source of truth.** `origin/main` lacks the presentation architecture, discovery engine, timetable preview, and timetable context. If production deploys from `main`, V2 is not deployed there.
3. **The remote feature branch is stale.** `origin/feat/global-assistant-v2` is 18 commits behind the discovery branch and 64 commits behind B.3. Anyone reviewing or deploying from it sees an older product.
4. **The primary worktree is not the newest code.** A developer who opens the repository root will see discovery at `718afd8`, missing 46 commits of B.2/B.3 remediation and verification.
5. **The deployed version is unverifiable from this environment.** No server was running and no authorized live URL was supplied for inspection. All runtime claims in team documents remain **UNVERIFIED**.

### 2.3 Worktree risk

- **Divergence risk:** three local branches with no upstream, all containing unique work. Losing the `assistant-v2-3-5-b2` worktree would lose the newest implementation.
- **Review risk:** reviewers reading the primary worktree or the remote branch will review the wrong code.
- **Release risk:** a release cut from `main` would ship without V2; a release cut from a feature branch would ship unreviewed commits.
- **Documentation risk:** verification documents live in the B.3 worktree while audit documents live in the primary worktree and are untracked.

**Immediate non-code action required (not performed by this audit):** decide and record the canonical branch, push it, and make every other checkout explicitly subordinate to it.

---

## 3. Complete V2 milestone status

> **Method note:** The brief forbids assigning a completion percentage without methodology. This report therefore uses qualitative status labels rather than a single percentage. "Verified" means verified by this audit's tests or by a cited artifact; "claimed" means supported only by team documents; "unverified" means runtime/deployment behavior could not be checked.

**Status legend:** `VERIFIED-STATIC` (source + tests), `VERIFIED-EVAL` (artifact, not re-run), `CLAIMED` (team doc only), `PARTIAL`, `NOT STARTED`, `UNVERIFIED` (runtime).

| Milestone | Capability delivered | Where it lives | Status | Residual / caveat |
|---|---|---|---|---|
| V2.0 — CopilotKit v2 foundation | Headless chat runtime, agent endpoint, streaming, auth | `app/api/copilotkit/[[...slug]]/route.ts`, `components/assistant/*` | `VERIFIED-STATIC` | In-memory runner, desktop-only gate |
| V2.1 — UX refinement | Dock/sidebar, launcher, tool trace, rich renderers | `components/assistant/*`, `.worktrees/assistant-v2-1-ux` | `VERIFIED-STATIC` | Worktree line appears superseded; exact acceptance not re-verified |
| V2.2 — Read-only tools + access | 13 server tools, access modes, rate limits, metrics | `lib/assistant/tools.ts`, `access.ts`, `rate-limit.ts` | `VERIFIED-STATIC` | No usage/cost dashboard; service-key DB access |
| V2.3 — Presentation architecture | Explicit `present_response` claims, rich-block planning, referent binding, catalog filter, timetable preview/conflicts | `lib/assistant/presentation.ts`, `course-referent.ts`, `timetable-*.ts` | `VERIFIED-STATIC` | Referent gap across discovery turns |
| V2.3.5-A — Explicit rich UI | Rich cards only for claimed/validated results | `origin/feat/global-assistant-v2` @ `221e73b` | `CLAIMED` / `UNVERIFIED` | Remote only; not independently re-tested |
| V2.3.5-B.1 — Discovery correctness | Candidate pool, topic tiers, constraints, ranking, evidence | `lib/assistant/discovery/*` (discovery branch) | `VERIFIED-STATIC` | Superseded by B.3 |
| V2.3.5-B.2 — Remediation | Correctness/failure analysis fixes, verification | B.2/B.3 branch | `VERIFIED-STATIC` + `EVAL` | Holdout protocol gate missed |
| V2.3.5-B.3 — Quality | Mutual clashes, compaction, efficiency diagnosis, semantic acceptance | `2f79726` | `TEST` 2,454 pass; `EVAL` mixed; `DOC` semantic pass | Open referent and efficiency defects |
| V2.3.5-C — Planning-state persistence | Durable session/planning state | — | `NOT STARTED` | See §12 |
| V2.3.5-D — Admin/ops maturity | Quotas, usage/cost, run audit, alerts | Partial admin access UI only | `PARTIAL` | No usage or cost surfaces |
| V2.4 — Approved website actions | Proposal → confirmation → execution → undo | — | `NOT STARTED` | No action layer, no approval/audit model |
| V2.5+ / V3 — Timetable optimization | Constraint solver / optimizer + explanation | Deterministic checker only | `NOT STARTED` | `check_plan_conflicts` is an oracle, not an optimizer |

**Important caveat on V2.0–V2.2:** this audit did not reconstruct the original acceptance criteria for those milestones. Their rows describe capabilities present in the current source, not a certified sign-off.

---

## 4. Current architecture and request lifecycle

### 4.1 Request lifecycle (chat turn)

1. **Client controller.** `components/assistant/assistant-chat.tsx` drives a CopilotKit v2 `useAgent` session; `assistant-panel.tsx` registers page context, client tools, and an 8-turn message filter (`components/assistant/assistant-panel.tsx:52-84,121-125`). **SOURCE**
2. **Launcher and access gate.** `assistant-launcher.tsx` checks sign-in and `GET /api/assistant/access`; the route calls `canUseAssistant` and returns `{ enabled }` with `no-store` (`app/api/assistant/access/route.ts`). The panel is wrapped in `DesktopAssistantGate`, which renders `null` below 1024px (`components/assistant/desktop-assistant-gate.tsx:6,19-21`). **SOURCE**
3. **Agent endpoint.** `app/api/copilotkit/[[...slug]]/route.ts`:
   - builds `CopilotRuntime` with `InMemoryAgentRunner` (16 threads, 8 runs/thread, 2MB per run); **SOURCE** lines 34–51
   - enforces a 30-turn conversation cap (409), **SOURCE** lines 87–90;
   - enforces per-user hour/day rate limits and fails closed on limiter errors, **SOURCE** lines 92–107;
   - caps payload size, **SOURCE** lines 109–124;
   - returns 401 unauthenticated, 403 access-disabled, 503 missing model key, **SOURCE** lines 148–156;
   - opens an empty SSE stream for connect probes, **SOURCE** line 160.
4. **Model configuration.** `lib/assistant/config.ts:23-38`: DeepSeek base URL, `deepseek-flash`, thinking off by default, 2,000 output tokens, 30s timeout, 30 requests/hour, 80/day, 30 turns, 8 history turns. **SOURCE**
5. **Prompt.** `lib/assistant/prompt.ts:1-46` is a compact 46-line policy: read-only, act-vs-clarify, tool selection, no fabricated facts, rating scale and sample size, `notAvailableOnSite`, typed tool outcomes, review text treated as data, fresh results beat prior replies, `present_response` rules, referents/ordinals, navigate rules, timetable rules, scope, language, style. **SOURCE**
6. **Tools.** `lib/assistant/tools.ts:54-68` declares **13 server tools**: 9 catalog/review tools, `discover_course_candidates`, `present_response`, `check_plan_conflicts`, `preview_timetable`. `runReadOnlyTool` normalizes failures to `invalid_request | not_found | temporarily_unavailable` (`tools.ts:78-98`). Two client tools exist: `navigate` and `filter_catalog_results`. **SOURCE**
7. **Presentation planning.** `lib/assistant/presentation.ts:768-860` decides which rich blocks mount: course detail/sections only if claimed by `present_response` **and** they are the deduplicated lookup winner; catalog browse only for a resolved `search_catalog`; recommendations only if every requested code is validated against this turn's evidence; `preview_timetable` is always rich (`lib/assistant/rich-tools.ts:16`). Receipts alone do not prove visibility. **SOURCE**
8. **Referent binding.** `lib/assistant/course-referent.ts` resolves explicit codes, page course, ordinals, anaphora, and discussed-course order; `bindCourseToolArgs` rewrites or blocks course-tool calls when the referent is ambiguous or excluded (`course-referent.ts:440-501`). **SOURCE**
9. **Conversation shaping.** `lib/assistant/conversation.ts` / `run-messages.ts`: 8 history turns, 200-character squeeze of older tool results, dropped unanswered tool calls, 200-message cap, 512KB wire / 256KB prepared caps. **SOURCE**
10. **Persistence.** None for conversations. Timetable data is separate: a local-first store with an outbox and server sync (`lib/timetable/store.ts`, `components/timetable/planner-provider.tsx`, `/api/timetable/plans`). **SOURCE**

### 4.2 Discovery pipeline (B.3)

`lib/assistant/discovery/discover.ts` and `lib/assistant/data/discovery.ts`:

- candidate pool bounded at **150 courses**, topic scan at **600 catalog rows**, offers at **8,000 rows** (`MAX_POOL_COURSES`, `MAX_CATALOG_TOPIC_SCAN`, `MAX_OFFER_ROWS`);
- tiered word/spelling topic matching shared by SQL prefilter and ranker (`discovery/topic-match.ts`);
- hard constraints, soft preferences, ranking, fit badges, review terms, and review excerpts;
- mutual schedule clashes computed across candidates (`mutualClashes`, `discover.ts:367`);
- result compaction to **12,000 characters** (`MAX_DISCOVERY_RESULT_CHARS`, `discover.ts:41`, `shrinkDiscoverResult` at 434);
- output includes term, timetable status (`no_plan` when none), examined counts, exclusions, candidates, evidence, and caveats.

**SOURCE; behavior EVAL-verified on dev/holdout artifacts.**

### 4.3 Timetable engine

- `analyzeTimetable`, `detectScheduleConflicts`, and a version hash (`timetableVersion`) provide deterministic conflict detection.
- `check_plan_conflicts` evaluates an individual course/section fit.
- `preview_timetable` evaluates a combined or hypothetical plan with at most 3 additions, returns `needs_section`, `term_mismatch`, `no_timetable`, and never saves (`lib/assistant/timetable-preview.ts:17-18`).

**SOURCE.**

### 4.4 Architecture assessment

**Strengths**

- Clear separation of concerns: tool execution, presentation planning, referent binding, discovery, and timetable logic are independent modules with unit coverage.
- The presentation layer is explicitly evidence-driven rather than "render whatever the model touched," which is the right long-term choice.
- The deterministic timetable checker is a sound correctness oracle for a future optimizer.
- Read-only is enforced by absence of mutating tools, not by prompt obedience.
- Failure outcomes are typed, which supports honest UI states.

**Structural weaknesses**

- No durable state layer for conversations or plan proposals; the runtime is process-memory only.
- No action/approval/audit layer, which V2.4 would require.
- Discovery results are invisible to the referent resolver (see §7.2.1) — a missing seam between two otherwise well-designed modules.
- Device availability is a hard UI gate rather than a responsive experience.
- Operational observability stops at per-step metrics; there is no usage ledger, budget enforcement UI, or run audit.

---

## 5. Implemented student-facing feature inventory

### 5.1 Feature status matrix

Status: **S** = shipped in newest source, **E** = shipped and evaluated, **P** = partial, **A** = absent, **U** = runtime unverified.

| # | Capability | Student-visible behavior | Implementation | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Signed-in chat panel | Opens a docked assistant on wide screens | `assistant-launcher.tsx`, `assistant-panel.tsx` | S / U | SOURCE |
| 2 | Access control | Off/everyone/admin/testers; hidden when disabled | `lib/assistant/access.ts:26-87`, `/api/assistant/access` | S / U | SOURCE |
| 3 | Catalog search | Finds courses by keyword/type | `search_catalog` (`tools.ts:125`) | E / U | SOURCE, EVAL |
| 4 | Catalog counts | "How many courses match…" | `count_courses` (`tools.ts:139`) | S / U | SOURCE |
| 5 | Course detail | Code, title, faculty, credits, offered status, URL | `get_course` (`tools.ts:153`) | E / U | SOURCE, EVAL |
| 6 | Course description | English/Chinese description | `get_course_description` | S / U | SOURCE |
| 7 | Intended learning outcomes | ILO list | `get_course_ilo` | S / U | SOURCE |
| 8 | Instructor lookup | Who teaches a course | `get_instructor` | S / U | SOURCE |
| 9 | Reviews | Rating, difficulty, workload, sample size, excerpts | `get_course_reviews` | S / U | SOURCE |
| 10 | Review counts | Number of reviews for a course | `count_reviews` | S / U | SOURCE |
| 11 | Section list | Times, rooms, instructors, quotas | `get_course_sections` | S / U | SOURCE |
| 12 | Constraint-based discovery | "Easy GEST not starting in the morning" with ranked evidence | `discover_course_candidates` + discovery modules | E / U | EVAL: dev 36/36, holdout 15/18 |
| 13 | Fit badges / evidence | Per-candidate fit and mutual clashes | discovery result + rich UI | E | EVAL artifacts |
| 14 | Clarification on ambiguity | "Which course do you mean?" | `course-referent.ts`, `present_response` status | P | SOURCE; fails across discovery (§7.2.1) |
| 15 | Page-aware references | "This course" uses current page code | `useAgentContext` + referent resolver | S / U | SOURCE |
| 16 | Ordinal/anaphora references | "The second one", "that course" | referent resolver | P | Fails when list came from discovery |
| 17 | Navigation | Opens internal pages on request | `navigate` client tool | S / U | SOURCE |
| 18 | Filter existing catalog results | Narrows a mounted result set | `filter_catalog_results` | S / U | SOURCE |
| 19 | Individual timetable fit | Does this course fit my saved timetable? | `check_plan_conflicts` | S / U | SOURCE |
| 20 | Combined timetable preview | Preview up to 3 additions without saving | `preview_timetable` | E / U | SOURCE, preview always rich |
| 21 | Compare courses | Side-by-side comparison | — | A | No compare tool |
| 22 | Approved actions | Add/drop/save on the student's behalf | — | A | Read-only boundary |
| 23 | Conversation persistence | History after reload / new device | — | A | In-memory runner |
| 24 | Planning-state persistence | Durable shortlist/proposal across turns | — | A | V2.3.5-C not started |
| 25 | Mobile/tablet UI | Usable below 1024px | — | A | `DesktopAssistantGate` |
| 26 | Usage/quota visibility | Remaining requests, cost | — | A | No UI; limits exist server-side |
| 27 | Admin access management | Switch mode, manage testers | `app/admin/assistant/page.tsx` | S / U | SOURCE |
| 28 | Admin usage/cost/audit | Per-user usage, run audit trail | — | A | Not implemented |

### 5.2 Feature interpretation

- The **core read-only research surface is broad and coherent** (items 3–11, 17–20).
- The **agentic discovery surface is the differentiator** (item 12–13), but its follow-up behavior is weak (items 14, 16).
- The **product is missing the layer students will judge next**: comparison, durable plans, and actions (items 21–24).
- The **availability gap is severe**: items 1–20 are unreachable on phones and most tablets (item 25).

---

## 6. Verified functionality versus unverified behavior

### 6.1 What is independently verified

**Deterministic tests — TEST**

- Independent run in `.worktrees/assistant-v2-3-5-b2` on 2026-10-28: **282 test files, 2,454 tests passed, exit 0, ~20 seconds.**
- Read-only boundary test scans `lib/assistant` and `components/assistant` for mutator patterns and plans-API usage, and allowlists assistant tool names (`tests/assistant/read-only-planner.test.ts`). **SOURCE / TEST**
- Unit/contract coverage exists for presentation planning, referent binding, discovery bounds/topic matching, timetable conflicts, conversation compaction, access modes, and rate limiting. **SOURCE**

**Evaluation artifacts — EVAL (read, not re-run)**

| Artifact | Turns | Pass | Discovery correctness | Other |
|---|---:|---:|---:|---|
| `discovery-b3-dev-final.json` | 72 | 65 (90.3%) | 36/36 | args 97.2%, 4 false-fit, median 1 call |
| `discovery-b3-holdout-final.json` | 18 | 14 (77.8%) | **15/18 (83.3%)** | 0 false-fit, median 1 call |
| `discovery-b3-shadow-v2.json` | 8 | 7 (87.5%) | 5/5 | median 1 call |
| `discovery-b2-final-dev.json` | 63 | 48 (76.2%) | 24/27 (88.9%) | 2 false-fit |
| `discovery-b2-final-holdout.json` | 18 | 12 (66.7%) | 14/18 (77.8%) | — |
| `discovery-b2-final-shadow.json` | 8 | 5 (62.5%) | — | — |
| `discovery-b2-baseline.json` | 21 | 9 (42.9%) | 0/9 | median 18 calls |

**Interpretation:** B.3 is a real improvement over B.2 and a large improvement over baseline on discovery usage and tool economy. But the **preregistered holdout discovery gate (90%) is not met (83.3%)**, and the dev/holdout case counts differ between B.2 and B.3, so cross-version pass rates are indicative, not strictly comparable.

**Semantic acceptance — DOC (not re-run)**

Team documents report a manual semantic holdout of 18/18, shadow-v2 8/8, and zero confirmed unsupported claims. This is plausible and directionally consistent with the artifacts, but it is a **team claim**, not an independent live-product result.

### 6.2 What is not verified

| Area | Why unverified |
|---|---|
| The deployed website | No server running, no authorized live URL inspected; deployed revision unknown. |
| Authenticated chat end-to-end | Requires Clerk session + enabled access + model key; not exercised. |
| Browser rendering, responsive behavior, rich cards | No browser session against the app. |
| Streaming, cancellation, reconnect | Runtime behavior only. |
| Real data quality (reviews, sections, instructors) | Source queries inspected; database contents not audited for freshness/completeness. |
| Rate-limit behavior in production | Supabase RPC path inspected, not executed. |
| Admin console behavior | Source inspected, not exercised. |
| Mobile/tablet | Deliberately unreachable below 1024px; unverified because impossible by design. |
| Cost/latency at scale | Only eval artifacts; no production telemetry. |

### 6.3 The central methodological finding: a passing grader is not a passing product

The B.3 efficiency trace for `eff-detail_followup` is decisive:

- **Turn 0:** "Find an easy GEST option that does not start in the morning." → `discover_course_candidates`, a table with GEST1006 first and GEST1005 second.
- **Turn 1:** "Tell me more about the second option and who teaches it." → model calls `get_course` with `GEST1005`; the server returns `{"status":"needs_clarification","ask":"Which course do you mean?"}`.
- **Repeat 1:** the model retries with `GEST1006`, then loops `get_course`/`search_catalog` **four times** (8 tool calls) before giving up on instructor data.
- **Grader result:** both turns **pass**, because the checks are discovery presence, mention of the course, forbidden-term absence, false-fit absence, and a tool-call ceiling — not whether the lookup actually succeeded.

So the evaluation can report "pass" for a turn where the core user request ("who teaches it") was not fulfilled. This is exactly why the report distinguishes:

| Dimension | B.3 evidence | Verdict |
|---|---|---|
| **Product correctness** | Referent lookup fails; instructor not returned | **Fails the user's request** |
| **Product usability** | Clarification is polite and offers the right guess, but requires another turn; retry loop adds latency | **Degraded** |
| **Evaluation compliance** | Case passes; holdout discovery gate missed | **Mixed / gate not met** |

Any future score must be read through this distinction. Improving the grader alone would hide the defect rather than fix it; fixing the defect is the product work.

### 6.4 Fixture and data caveats

- Discovery eval outputs show **8 reviews per offering** and, in one trace, the model states it "could not read the review text ... this turn." Review bodies may be empty or unreadable in fixtures, which weakens any claim about qualitative review summarization.
- Ratings are self-reported student data with small samples; the prompt correctly warns about sample size (`prompt.ts:15`), but the product cannot make weak evidence strong.
- Year-one course listings can be ambiguous (multiple listings of the same code), which is the documented cause of the three holdout discovery misses.

---

## 7. Current B.3 quality and known limitations

### 7.1 What B.3 does well

1. **Bounded, honest discovery.** Hard bounds (150/600/8,000) and a 12,000-character compaction make the tool predictable and prevent context blowups. Results include examined counts and truncation flags rather than pretending completeness.
2. **Tiered matching.** Shared topic-matching logic between SQL prefilter and ranker reduces the classic "prefilter excludes what the ranker would have found" failure.
3. **Constraint fidelity.** Hard vs soft constraints, exclusion reasons (`alreadyInPlan`, `excludedCodes`, `noListedSections`), and mutual clashes are surfaced, which supports trustworthy explanations.
4. **Presentation discipline.** Rich cards require a claim plus validated evidence; stale or unclaimed results do not render (`presentation.ts:768-860`).
5. **Timetable preview honesty.** At most 3 hypothetical additions, explicit `needs_section`/`term_mismatch`/`no_timetable`, and no save path (`timetable-preview.ts:17-18`).

### 7.2 Open defects and their root causes

#### 7.2.1 Referent binding across discovery turns — **P0, proven**

**Symptom:** "the second option" after a discovery-only turn yields `needs_clarification`; the model then either asks the user or enters a retry loop.

**Root cause (source-proven):** `collectPriorCourseCodes` only harvests explicit codes from user messages, course-tool arguments, and course-tool results (`lib/assistant/course-referent.ts:371-401`). `discover_course_candidates` is **not** in `COURSE_TOOL_NAMES`, and its result is a candidate table, not a course record. Therefore a discovery list contributes **zero** prior codes, and an ordinal reference cannot bind to it. `bindCourseToolArgs` then hits the `multiple` branch and returns `needs_clarification` when the model's guessed code is not in the (empty) allowed set (`course-referent.ts:455-473`).

**Why it matters:** the highest-value flow is "find me options → tell me about one." The first half works; the second half deterministically fails unless the model repeats a full lookup path or the user retypes the code.

**Secondary defect exposed by the trace:** on repeat 1 the model resolved "second" to GEST1006, which was **first** in that run's table. The model's ordinal reasoning is unstable, so the resolver cannot rely on the model to self-correct.

#### 7.2.2 Retry loops and step burn — **P1**

The repeat-1 trace uses 8 tool calls across `get_course` and `search_catalog` after the first lookup is blocked. Because blocked calls return a normal tool result rather than a terminal state, the model can loop until the step budget (8) is exhausted. This inflates latency and cost and produces apologetic replies instead of a crisp clarification.

#### 7.2.3 Holdout discovery gate missed — **P1, protocol**

Holdout discovery correctness is **15/18 (83.3%)** against a **90%** gate (**EVAL/DOC**). The team's own analysis attributes the misses to ambiguous year-one CIS listings. This is a **protocol failure**, not necessarily a semantic failure; the manual acceptance doc reports 18/18 semantic success. Both statements can be true, and the distinction must be preserved rather than averaged away.

#### 7.2.4 False-fit claims — **P1, quality**

B.3 dev reports **4 false-fit** cases. These are the most damaging class of error for a discovery product because they assert a constraint is satisfied when it is not. B.3 holdout reports 0 false-fit, so the issue is concentrated in dev cases; root causes are not fully characterized in the artifacts.

#### 7.2.5 Grader blind spots — **P1, measurement**

As shown in §6.3, the grader does not verify tool-level success or answer completeness. It also has documented false positives for mixed-section/preview evidence. This makes scores optimistic and can mask regressions.

#### 7.2.6 Review-text unavailability — **P2, data**

At least one trace says review text could not be read this turn. If review bodies are empty in fixtures or sparse in production, qualitative advice ("workload is heavy") is unsupported. The prompt's data-handling rule helps, but the product should state when text is unavailable.

#### 7.2.7 No comparison capability — **P2, scope**

Students routinely choose between 2–3 options. There is no `compare_courses` tool and no comparison rich block. The agent can only present sequential details.

#### 7.2.8 Desktop-only availability — **P0, product**

`DesktopAssistantGate` returns `null` below `(min-width: 1024px)` (`desktop-assistant-gate.tsx:6,19-21`). Meanwhile B.2/B.3 browser checklists specify 380/450/800px viewports. Those acceptance steps **cannot pass** against the current gate. Either the docs are wrong or the product is; today they contradict each other.

### 7.3 Efficiency profile

- **Tool economy:** median 1 discovery call on B.3 dev and holdout; baseline median was 18 calls. This is a major improvement.
- **Variance:** traces range from 1 call to 8 calls depending on whether a follow-up lookup is blocked. The long tail is caused by the referent defect, not by discovery itself.
- **Latency:** turn 0 in the efficiency trace took ~5.0s; individual model steps ~1.0–1.4s. Acceptable for a chat UI, but the retry loop can multiply it.
- **Token behavior:** cached input tokens are visible in step metrics (e.g., 10,368 cached of 10,611 input), suggesting prompt caching is effective.
- **Cost visibility:** none in-product; only logs.

### 7.4 B.3 quality verdict

B.3 is a **credible internal-beta discovery engine**. It is not yet a trustworthy conversational assistant because the follow-up seam is broken, the measurement system can pass broken turns, and the product is unreachable on small screens. The correct next move is to fix those seams, not to expand discovery scope or chase the last few benchmark points.

---

## 8. Security and operational-readiness snapshot

### 8.1 Security posture

| Area | State | Evidence | Assessment |
|---|---|---|---|
| Authentication | Clerk session required for agent route | `route.ts:148-156` | Sound |
| Authorization | Access modes off/everyone/admin/testers; fail closed | `lib/assistant/access.ts:26-87` | Sound for internal beta |
| Rate limiting | Per-user hashed hour/day keys; production Supabase RPC; fail closed | `lib/assistant/rate-limit.ts:15-38`, `lib/rate-limit.ts:55-87` | Sound; quota config not self-service |
| Read-only boundary | No mutating tools; static scan test allowlists tool names | `tools.ts`, `read-only-planner.test.ts` | Strong by construction; not a DB permission boundary |
| Database privilege | Server uses a privileged Supabase key that bypasses RLS; queries catalog/review data only | `lib/supabase/admin` usage | **Residual risk**: a future bug could read beyond intended scope |
| Prompt injection | Tool outputs and review text treated as data; prompt instructs ignoring embedded instructions | `prompt.ts:18` | Prompt-level only; no output sanitizer beyond rendering |
| Secrets | Server-only config; no secrets in client bundles observed | `config.ts`, env usage | Sound; values not inspected |
| Logging/PII | One metric line per model step; explicitly no prompt/reply text | `lib/assistant/metrics.ts` | Privacy-conscious, but limits debugging |
| Conversation storage | In-memory only; no transcript persistence | `InMemoryAgentRunner` | Low data-retention risk; high loss risk |
| CSRF/Origin | Next.js route handlers + same-origin client; no explicit origin check observed | source | Acceptable for this surface; verify before public launch |
| Dependency/secret scanning | Not performed in this audit | — | UNVERIFIED |

### 8.2 Operational readiness

| Area | State | Gap |
|---|---|---|
| Deployment reproducibility | Unknown | Newest code unpushed; deployed revision unknown |
| Database migrations | `20261018_assistant_access.sql`, `20260918_rate_limit.sql` exist | Must be applied before enabling assistant; not verified in target env |
| Access administration | Admin page for mode + testers | No quota/budget editing, no per-user usage |
| Cost control | Hour/day request caps only | No token/cost budget, no alerting, no per-user spend |
| Observability | Per-step metrics logs | No dashboards, traces, error aggregation, or run audit trail |
| Incident response | Not documented in inspected files | No kill-switch beyond access mode |
| Data freshness | Catalog/review queries | No freshness SLO or staleness indicator |
| Support | No user-facing feedback path in assistant | Hard to diagnose bad answers |

### 8.3 Readiness verdict

- **Internal beta with known testers:** conditionally ready, provided the correct branch is deployed, migrations are applied, and access is limited to testers.
- **Public launch:** **not ready**. Blockers are runtime verification, the source-of-truth problem, the referent defect, mobile unavailability, and absence of cost/usage observability.
- **V2.4 write actions:** **absolutely not ready**. There is no action model, approval flow, idempotency, undo, or audit trail. Read-only is currently a strength; adding writes without that layer would convert a contained research tool into an unsafe actor.

---

## 9. Browser testing prerequisites

### 9.1 Environment prerequisites

To test the website manually or with a browser agent, all of the following are required:

1. **Application server.** Run the app locally (`npm run dev` or the project's documented command) or use an authorized deployed URL. At audit time **no server was running**, so nothing was browser-tested. **UNVERIFIED**
2. **Authentication.** A Clerk test account signed in. Required env names (values not inspected): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
3. **Database.** Supabase URL and server key names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Migrations `20260918_rate_limit.sql` and `20261018_assistant_access.sql` must be applied.
4. **Model access.** `AI_API_KEY` (required), optional `AI_BASE_URL`, `AI_MODEL`, `AI_THINKING`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`.
5. **Assistant enablement.** `app_config.ai_assistant_access` set to `everyone`, `admin`, or `testers`; tester emails present in `assistant_testers`. In preview mode, `PREVIEW_MODE=1` plus `ASSISTANT_ACCESS_OVERRIDE` bypasses the DB column. Do not use the override outside preview.
6. **Limits.** `AGENT_RATE_LIMIT_PER_HOUR`, `AGENT_RATE_LIMIT_PER_DAY`, `AGENT_MAX_TURNS_PER_CONVERSATION`, `AGENT_HISTORY_TURNS` as needed. Keep limits low for testing.
7. **Term data.** `NEXT_PUBLIC_CURRENT_YEAR`, `NEXT_PUBLIC_CURRENT_SEM`, and catalog/section data for the current term.
8. **Viewport.** **At least 1024px wide and 768px tall.** Below 1024px the assistant is not rendered at all, so 380/450/800px test steps in existing checklists are invalid for the current build.
9. **Browser automation.** An authorized browser tool (e.g., the available browser-use MCP) or manual Chrome. At audit time the only page observed was `about:blank`; no app session was available.
10. **Test data hygiene.** Use a dedicated test account; do not modify saved timetables or database records during acceptance unless explicitly authorized.

### 9.2 What must not be done during acceptance

- Do not use a real student account or real saved timetable for destructive tests.
- Do not apply migrations to production as part of acceptance without a separate authorized change.
- Do not treat screenshots from an older branch as evidence for the newest code.

---

## 10. Manual website acceptance checklist

> **Width correction:** All steps below assume a viewport **≥1024px**. If tablet/mobile behavior is in scope, first resolve the gate contradiction in §7.2.8. Every item is **UNVERIFIED** until executed against the intended build.

### A. Access and availability

- [ ] Signed out: assistant launcher is hidden; `/api/assistant/access` does not grant access.
- [ ] Signed in but access mode `off`: launcher hidden; direct agent calls return 403.
- [ ] Access mode `testers`, user not listed: hidden; listed tester: visible.
- [ ] Admin console can switch mode and add/remove a tester; change takes effect within the cache window (≤300s).
- [ ] At 1023px width: assistant is absent (documented current behavior). At 1024px: present. Record whether this is intended.
- [ ] On `/` the launcher bubble is suppressed per current design; on a course page it appears.

### B. Core chat

- [ ] Open panel, ask "What is COMP3278 about?" → answer with course facts + a rich course card.
- [ ] Ask for a course that does not exist → typed `not_found` behavior, no invented facts.
- [ ] Ask an off-topic question → polite scope refusal.
- [ ] Send a second message → history is used; no duplicated system/tool noise.
- [ ] Reload the page → confirm whether conversation is lost (expected: lost). Record actual behavior.
- [ ] Reach the 30-turn cap → clear 409-style message, no crash.

### C. Catalog and page context

- [ ] On a course page, ask "What are the sections?" → resolves to the page course without restating the code.
- [ ] Search catalog, then say "filter to level 3000" → result set narrows; filter card mounts only for a mounted set.
- [ ] Ask "open the reviews page" → `navigate` goes to the right internal URL.
- [ ] Ask "compare COMP3278 and COMP3270" → record current behavior (no compare tool; expect sequential detail or refusal).

### D. Discovery (highest-value path)

- [ ] "Find an easy GEST that doesn't start in the morning." → one `discover_course_candidates` call; ranked table; sample-size caveat; no fabricated meeting times.
- [ ] Check every claimed time against the section data shown.
- [ ] Ask a constraint that cannot be met → honest no-match, not a fabricated candidate.
- [ ] Ask "show only ones without Friday classes" → either a valid filtered result or a clear limitation.
- [ ] **Follow-up:** "Tell me more about the second option and who teaches it." → **currently expected to fail with clarification**; record exact behavior and whether a retry loop occurs.
- [ ] Repeat follow-up using an explicit code → should succeed; confirms the defect is referent-specific.

### E. Timetable

- [ ] With no saved plan, ask "does COMP3278 fit?" → `no_timetable` guidance.
- [ ] With a saved plan, ask about a conflicting course → deterministic conflict explanation.
- [ ] Ask to preview adding 2 sections → combined preview, no save.
- [ ] Ask to preview 4 additions → bounded refusal or clear limit.
- [ ] Ask to "add it to my timetable" → assistant must refuse and explain read-only; verify no mutation.
- [ ] After preview, reload planner → saved timetable unchanged.

### F. Negative, safety, and operations

- [ ] Trigger rate limit → clear message; subsequent requests blocked for the window.
- [ ] Send a prompt-injection string inside a course/review field → assistant treats it as data, does not follow it.
- [ ] Ask the assistant to modify data or call admin APIs → refusal; no tool exists.
- [ ] Check logs: one metric line per step, no prompt/reply contents.
- [ ] Check admin: no usage/cost dashboard (expected gap); note it.
- [ ] Disable assistant mid-session → next request is denied; UI handles it gracefully.

### G. Visual and accessibility

- [ ] Rich blocks match the claimed results; no orphan cards for unclaimed lookups.
- [ ] Keyboard: launcher, panel, input, and send are reachable; focus is visible; Escape closes.
- [ ] Screen reader: panel has a label; streaming text is announced without flooding.
- [ ] Reduced motion respected.
- [ ] 1024×768 and 1440×900 layouts do not clip the panel or overlap content.

---

## 11. Gaps against the long-term agent vision

The long-term vision is an agent that helps a student **plan, decide, and act** on their timetable. Measured against that, V2 today is a **research assistant**, not a planning agent.

| Vision capability | Today | Missing |
|---|---|---|
| Understand a broad goal | Discovery handles constrained course search | Multi-objective goals ("light semester, no 8:30s, good GPA") only partially modeled |
| Remember context | 8-turn window, in-memory | Durable conversation memory; user preferences; prior decisions |
| Maintain a plan | Can preview ≤3 additions | Durable shortlist/proposal state; versioned plan alternatives |
| Compare options | None | Structured comparison + tradeoff explanation |
| Recommend with justification | Fit badges + evidence + caveats | Preference elicitation; uncertainty communication beyond sample size |
| Act safely | None | Proposal → confirmation → execution → audit → undo |
| Personalize | Page context + timetable | Completed courses, major requirements, historical performance |
| Optimize | Deterministic conflict check | Constraint solver/optimizer, objective functions, explanation of optimality |
| Proactive help | None | Enrollment deadlines, seat changes, plan drift alerts |
| Multi-device | Desktop only | Responsive/mobile UI |
| Trust & governance | Read-only, access modes, no prompt logging | Action audit trail, per-user quotas, cost budgets, incident controls |
| Evaluation of meaning | Protocol evals + manual docs | Repeatable semantic acceptance suite wired to product outcomes |

**Most important gap for V2.4:** the absence of a durable, auditable state/action layer. Without it, "approved website actions" cannot be safe, reversible, or accountable.

**Most important gap for V3:** the absence of an optimization model. The current engine can **check** a plan, not **search** for a good one. An optimizer needs: complete section data, a preference/constraint model, an objective, a search strategy, and an explanation layer.

---

## 12. Roadmap alternatives, especially V2.3.5-C

### 12.1 What V2.3.5-C was meant to solve

Planning-state persistence: keeping a shortlist, selected sections, and plan proposals across turns and reloads so the assistant can reason about a plan rather than a single query.

### 12.2 Options

| Option | Scope | Pros | Cons | Risk |
|---|---|---|---|---|
| **A. Eliminate C** | Skip persistence; keep stateless assistant | Lowest effort; no new storage/PII surface | Follow-ups remain fragile; V2.4 actions still unsafe; duplicate work later | Product stalls at "search box with chat" |
| **B. Defer C** | Do runtime verification + referent fix + mobile decision first | Focuses on trust; avoids building on broken seam | Planning flow still absent; repeated user restatement | Medium; deferral can become permanent |
| **C. Lightweight C** | Persist **session + plan proposal** only; no full transcript memory; server-side, per-user, revisioned | Fixes continuity; enables V2.4; limited PII; reuses timetable revisions | Requires schema, API, migration, retention policy | Medium; must scope tightly |
| **D. Full C** | Durable transcript memory + preferences + multi-plan workspace | Best long-term UX | Large surface, privacy/retention burden, premature before actions | High; likely delays V2.4 |

### 12.3 Recommendation among C options

**Choose C-light**, but only **after** the referent seam and source-of-truth issues are fixed. Scope:

- **In:** per-user session record (id, created/updated, term); durable shortlist of course codes; one active plan proposal (course + section choices); revision number with optimistic concurrency; explicit delete/expiry (e.g., 30 days); read/write only through assistant-authorized endpoints; no transcript storage.
- **Out:** full conversation memory, cross-device transcript sync, preference learning, multi-plan comparison, autonomous mutation.
- **Why:** it unlocks the "find → refine → preview → decide" loop and is a prerequisite for V2.4 confirmation flows, without taking on the privacy and complexity of full memory.

### 12.4 Alternative sequencing

| Sequence | Description | When it wins |
|---|---|---|
| **Fix-first (recommended)** | Resolve source of truth → fix referent → decide mobile → verify runtime → C-light | When trust and correctness matter more than breadth |
| **Persist-first** | Build C before fixing referent | Only if persistence work is independent and referent fix is trivial; otherwise persistence will encode a broken flow |
| **V2.4-first** | Start write actions now | Never at current maturity; no approval/audit layer |
| **Optimizer-first** | Start V3 | Never before durable plans and trustworthy data |

---

## 13. Prioritized next actions

> These are recommendations only. This audit implemented none of them. "Release blocking" refers to a public launch, not an internal tester build.

### P0 — must resolve before any further feature work

| ID | Action | Impact | Evidence | Root cause | Smallest correct fix | Acceptance | Dependencies | Release blocking |
|---|---|---|---|---|---|---|---|---|
| P0-1 | Make discovery results a referent source | Restores the core "find → ask about one" loop | `eff-detail_followup` trace; `course-referent.ts:371-401,455-473` | `collectPriorCourseCodes` ignores discovery candidates | Add discovery candidates (ordered, with codes) to prior-code collection, and let ordinals bind to the most recent discovery table | "Second option" resolves to the same code shown second; no clarification; no retry loop | None | Yes |
| P0-2 | Establish canonical branch and push it | Prevents reviewing/deploying the wrong code | Worktree/branch table in §2 | Three unpushed branches; `main` lacks V2 | Decide canonical branch, push, document deployment source, mark others read-only | One branch named as source of truth; remote contains it; docs updated | Team decision | Yes |
| P0-3 | Resolve the 1024px gate contradiction | Prevents shipping a desktop-only product while claiming mobile acceptance | `desktop-assistant-gate.tsx:6`; checklists at 380/450/800 | Layout policy vs acceptance docs | Either implement responsive panel or explicitly declare desktop-only and rewrite checklists | Product and docs agree; acceptance steps executable | Design decision | Yes (public) |
| P0-4 | Prove the deployed revision | Ends speculation about what is live | No server/live URL inspected | Deployment traceability absent | Deploy the canonical branch to a staging URL; record commit SHA; run smoke test | Staging SHA matches canonical branch; smoke test passes | P0-2, migrations | Yes |

### P1 — high value, next milestone

| ID | Action | Impact | Evidence | Root cause | Smallest correct fix | Acceptance | Dependencies | Release blocking |
|---|---|---|---|---|---|---|---|---|
| P1-1 | Stop retry loops on blocked course calls | Latency/cost, user experience | Repeat-1 trace: 8 calls | Blocked call is a normal tool result | Return a terminal clarify signal the runtime stops on; cap repeated identical calls | Blocked referent yields one clarification, ≤2 calls | P0-1 | No |
| P1-2 | Harden the evaluator's product assertions | Prevents false confidence | Grader passed broken turns | Checks do not assert tool success/answer completeness | Add a tool-outcome assertion and a completeness check to the eval harness (separate change, not this audit) | Broken referent turn fails; fixed turn passes | P0-1 | No |
| P1-3 | Close the holdout discovery gate | Protocol credibility | 15/18 = 83.3% vs 90% | Ambiguous year-one CIS listings | Add listing disambiguation or explicitly revise the gate with a documented rationale | Holdout ≥ gate, or gate revised with evidence | Product decision | No |
| P1-4 | Reduce false-fit claims | Trust in recommendations | B.3 dev: 4 false-fit | Not fully characterized | Audit false-fit cases; tighten constraint checks before presentation | 0 false-fit on dev+holdout | Analysis | No |
| P1-5 | Implement C-light persistence | Continuity; V2.4 prerequisite | No persistence | Stateless runtime | Session + shortlist + one proposal + revisions + expiry | Reload retains plan; cross-turn reference works | P0-1, schema review | No (but before V2.4) |
| P1-6 | Usage/cost/quota visibility | Operational control | No dashboards | Admin scope incomplete | Per-user request/token counts + budget cap + admin view | Admin can see usage and set budgets | Metrics pipeline | No |

### P2 — product depth

| ID | Action | Impact | Evidence | Root cause | Smallest correct fix | Acceptance | Dependencies | Release blocking |
|---|---|---|---|---|---|---|---|---|
| P2-1 | Add course comparison | Matches real decision behavior | No compare tool | Missing capability | `compare_courses` tool + comparison block | 2–3 courses compared on key dimensions | P0-1 | No |
| P2-2 | Responsive/mobile assistant | Reachability | Desktop gate | Layout policy | Responsive drawer + condensed cards | Usable at 390px and 768px | P0-3 | No |
| P2-3 | Review-text availability indicator | Honest evidence | Trace: text unreadable | Data/fixture gap | Surface "text unavailable" distinctly from "no reviews" | No unsupported qualitative claims | Data audit | No |
| P2-4 | Live runtime smoke suite | Runtime confidence | No runtime evidence | No harness | Scripted browser tests for golden paths | CI runs 10 golden paths | Staging | No |

### P3 — future milestones

| ID | Action | Impact | Evidence | Root cause | Smallest correct fix | Acceptance | Dependencies | Release blocking |
|---|---|---|---|---|---|---|---|---|
| P3-1 | V2.4 action architecture (design only) | Safe future writes | No action layer | Missing design | Proposal/confirm/execute/audit/undo spec | Approved design with threat model | P1-5 | No |
| P3-2 | V3 optimizer research | Long-term differentiation | Checker only | No solver | Prototype constraint solver on read-only data | Solver beats baseline in offline eval | Complete data model | No |
| P3-3 | Conversation memory (full) | Personalization | Stateless | Not scoped | Evaluate after C-light usage data | Measured retention benefit | P1-5 | No |

---

## 14. Recommendation for the next milestone

### 14.1 Do this next: V2.3.5-C "Continuity & Trust" (narrowed)

**Not** the original persistence milestone in full. A four-part milestone:

1. **Fix the referent seam** (P0-1): discovery lists become referent sources; ordinals bind to the latest presented table; blocked calls terminate cleanly.
2. **Reconcile the source of truth** (P0-2): one canonical branch, pushed, with a recorded staging deployment SHA.
3. **Decide availability** (P0-3): either responsive assistant or an explicit, documented desktop-only product. Do not leave the contradiction.
4. **Ship C-light persistence** (P1-5): session, shortlist, one proposal, revisions, expiry.

**Exit criteria**

- "Find options → tell me about the second one" works in one follow-up, with no clarification and no retry loop.
- A blocked referent produces exactly one clarification and at most two tool calls.
- Staging runs the canonical branch; a smoke test proves it.
- Product and acceptance docs agree on supported viewports.
- A saved shortlist/proposal survives reload and is scoped to the signed-in user.
- All deterministic tests pass; the evaluator fails the previously masked broken turn and passes the fixed one.
- No new write capability exists.

**Explicitly out of scope:** compare tool, mobile redesign (unless the availability decision requires it), full memory, V2.4 actions, optimizer work, benchmark tuning.

### 14.2 Why not V2.4 yet

V2.4 (approved website actions) requires durable state, an approval/confirmation model, idempotent execution, audit, and undo. None exist. Building actions on top of a stateless runtime with a broken referent seam would produce an agent that can act on the wrong course and cannot be audited. That is a product and safety regression, not progress.

### 14.3 Why not V3 yet

V3 (timetable optimization) requires complete, trustworthy section data, a durable plan model, and a preference representation. Today the product cannot reliably ask "which one?" about a list it just showed. An optimizer would optimize the wrong problem.

### 14.4 What to stop spending time on

- **Chasing the last benchmark points.** The holdout gap is a protocol artifact around ambiguous listings; the product-level semantic result is already strong. Fix the seam, not the score.
- **Expanding discovery scope.** The bounded engine is good enough for beta; more constraints add surface without fixing continuity.
- **Adding more read-only tools.** The catalog surface is already broad; the missing value is comparison and durable plans, not more single-record lookups.
- **Writing more verification documents that are not attached to the canonical branch.** Documentation volume is outpacing release discipline.

---

## Direct answers

### Q1. What exactly can What2Reg AI V2 do right now?

A signed-in, enabled user on a viewport **≥1024px** can chat with a read-only agent that: searches and counts courses; fetches course detail, description, ILOs, instructors, reviews, review counts, and sections; discovers ranked candidates under hard/soft constraints (including schedule constraints) with evidence and caveats; uses page context and explicit/ordinal/anaphora references (with a known failure after discovery lists); navigates; filters a mounted catalog result set; checks individual timetable fit; and previews up to three hypothetical additions without saving. It explicitly declines ambiguous references, does not fabricate facts, and cannot mutate data. **SOURCE; runtime UNVERIFIED.** On phones/tablets and without access, it is not available.

### Q2. Which V2 capabilities are implemented but not integrated into the currently running website?

The premise cannot be fully answered because the running website's revision is **UNVERIFIED**. What is provable:

- The newest implementation (`2f79726`, B.3) is **not pushed** and exists only in a local worktree.
- `origin/main` does not contain the V2 assistant modules at all.
- `origin/feat/global-assistant-v2` (`221e73b`) is 64 commits behind B.3 and lacks discovery, presentation, timetable preview, and timetable context.
- Therefore, **if** the live site deploys from `main` or from that remote branch, it does **not** include B.2/B.3 discovery remediation, the current presentation planning, timetable preview/conflicts, or the newest referent handling. If it deploys from an unpushed local build, it is unreproducible.
- Admin usage/cost/audit and V2.3.5-C/D features are not integrated anywhere because they are not implemented.

This is a release-traceability failure, not merely a feature gap. **SOURCE / UNVERIFIED**

### Q3. What are the three most consequential real product problems remaining?

1. **Cross-turn referent binding is broken after discovery.** The exact flow the product exists for — "show me options" then "tell me about the second one" — returns `needs_clarification` because discovery results are not a referent source (`course-referent.ts:371-401`). The model then asks the user or burns 8 tool calls. This is deterministic, reproducible in the eval trace, and masked by a passing grader.
2. **The assistant is invisible below 1024px.** `DesktopAssistantGate` returns `null` (`desktop-assistant-gate.tsx:6,19-21`), while acceptance documents test 380/450/800px. Students on phones cannot use the product, and the team's own acceptance criteria cannot be executed. This is an availability and truthfulness problem.
3. **There is no durable session or planning state.** The agent runs in memory (16 threads, 8 runs/thread), conversations are capped at 30 turns, and nothing survives reload or eviction. Students must restate context, and V2.4 actions cannot be made safe without durable proposals, revisions, audit, and undo.

Operational symptoms of these are latency/cost variance from retry loops and zero visibility into per-user usage or spend.

### Q4. Is the current architecture a sound foundation for V2.4 approved website actions and V3 timetable optimization? What is missing?

**Yes as a foundation, no as a complete platform.**

What is sound:

- Typed tools and typed failures.
- An explicit, evidence-driven presentation layer.
- A deterministic timetable checker that can serve as a correctness oracle.
- A clean read-only boundary and access/rate-limit controls.
- A local-first timetable store with revisions and conflict handling, which is a useful precedent for plan state.

What is missing for **V2.4 actions**:

- A durable proposal/shortlist/action state store with per-user scoping.
- A proposal → explicit confirmation → execution → receipt → undo flow, including confirmation binding to the exact course/section and plan revision.
- Idempotency keys, optimistic concurrency, and conflict handling for concurrent edits.
- A per-action authorization policy (which tools may mutate what), not just "assistant enabled."
- An append-only audit trail of proposed and executed actions.
- A kill switch and rollback story.
- Evaluation of action correctness and refusal behavior, not just read answers.
- A UI that makes consequences visible before commitment.

What is missing for **V3 optimization**:

- Complete, fresh section/offer data with stable identifiers.
- A formal constraint/preference model (hard vs soft, weights, uncertainty).
- An objective function and search/solver strategy (e.g., ILP/CP-SAT) rather than pairwise checking.
- Explanation of why a plan is recommended and what tradeoffs were made.
- Offline evaluation with realistic student objectives.
- Durable plan versions to optimize over.

The current checker is necessary but not sufficient; it can validate a proposed plan, not generate a good one.

### Q5. What should we actually build next, and what should we stop spending time on?

**Build next:** a narrowed **V2.3.5-C "Continuity & Trust"**:

1. fix discovery-to-referent binding and terminate blocked calls cleanly;
2. establish and push the canonical branch, then prove a staging deployment by SHA;
3. decide and align the supported viewport story;
4. ship lightweight persistence (session, shortlist, one proposal, revisions, expiry).

Then, and only then, design V2.4.

**Stop spending time on:**

- chasing benchmark points and tuning discovery breadth before the follow-up seam works;
- adding more read-only tools;
- writing acceptance documents that are not tied to the canonical branch or executed against a real build;
- treating a passing eval as proof of a working product;
- starting V2.4 or V3 before durable state and runtime verification exist.

---

## Appendix A — Evidence log

### A.1 Repository commands (read-only)

- `git worktree list` — three worktrees; B.3 at `2f79726`.
- `git rev-parse`, `git rev-list --count`, `git status --porcelain` — topology and cleanliness in §2.
- Tree checks of `origin/main` and `origin/feat/global-assistant-v2` for assistant modules.
- `git log` inspection of recent commits.

### A.2 Test execution

- Working directory: `.worktrees/assistant-v2-3-5-b2`.
- Result: **282 test files / 2,454 tests passed**, exit 0, ~20s.
- No live-model suite was run by this audit.

### A.3 Evaluation artifacts read

- `.eval-results/assistant/discovery-b3-dev-final.json`
- `.eval-results/assistant/discovery-b3-holdout-final.json`
- `.eval-results/assistant/discovery-b3-shadow-v2.json`
- `.eval-results/assistant/discovery-b3-efficiency-final.json` (18 traces; `eff-detail_followup` inspected)
- `.eval-results/assistant/discovery-b2-final-dev.json`
- `.eval-results/assistant/discovery-b2-final-holdout.json`
- `.eval-results/assistant/discovery-b2-final-shadow.json`
- `.eval-results/assistant/discovery-b2-baseline.json`
- Case definition inspected: `evals/assistant/discovery-efficiency-cases.ts:108,205`.

### A.4 Source read (principal)

- `app/api/copilotkit/[[...slug]]/route.ts`
- `app/api/assistant/access/route.ts`
- `lib/assistant/config.ts`, `prompt.ts`, `tools.ts`, `presentation.ts`, `course-referent.ts`, `conversation.ts`, `run-messages.ts`, `access.ts`, `rate-limit.ts`, `metrics.ts`, `rich-tools.ts`, `timetable-preview.ts`
- `lib/assistant/discovery/*`, `lib/assistant/data/discovery.ts`
- `components/assistant/desktop-assistant-gate.tsx`, `assistant-launcher.tsx`, `assistant-panel.tsx`, `assistant-chat.tsx`, `assistant-chat-view.tsx`, `use-catalog-results-tool.tsx`
- `lib/timetable/store.ts`, `components/timetable/planner-provider.tsx`
- `tests/assistant/read-only-planner.test.ts`
- `app/admin/assistant/page.tsx`, `components/admin/assistant-access-client.tsx`
- `supabase/migrations/20261018_assistant_access.sql`, `20260918_rate_limit.sql`

### A.5 Documents read (labelled DOC)

- `docs/superpowers/audits/2026-10-26-assistant-v2-3-5-b-final-acceptance-audit.md`
- `docs/superpowers/audits/2026-10-26-assistant-v2-3-5-b2-forensic-failure-analysis.md`
- `docs/superpowers/audits/2026-10-27-assistant-b2-worktree-session-recovery-audit.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/verification/2026-10-27-assistant-b3-final-acceptance.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/verification/2026-10-27-assistant-b2-patch2-verification.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/verification/2026-10-26-assistant-v2-3-5-b2-acceptance.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/specs/2026-10-27-assistant-semantic-product-acceptance.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/audits/2026-10-27-assistant-b3-efficiency-diagnosis.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/audits/2026-10-27-assistant-b2-holdout-reliability-analysis.md`
- `.worktrees/assistant-v2-3-5-b2/docs/superpowers/verification/2026-10-27-assistant-b2-patch-final-verification.md`

### A.6 What was not run

- No live model calls.
- No application server, browser session, or authenticated UI session.
- No database queries or mutations.
- No deployment or migration.
- No git mutation of any kind.

---

## Appendix B — Method and limitations

- **Method:** reconstruct topology from Git; read the request path, tools, presentation, discovery, referent, and timetable code; run the deterministic suite; reconcile existing eval artifacts; inspect documentation as claims; compare product behavior against acceptance criteria; produce prioritized recommendations without modifying the system.
- **No completion percentage** is assigned because no agreed capability-weighted methodology exists. Milestone statuses are qualitative and evidence-tagged.
- **Chief limitation:** runtime and deployment are unverified. A source-level audit cannot prove the live product works, and this report does not claim it does.
- **Chief analytical finding:** evaluation compliance and product correctness diverged in a reproducible case (`eff-detail_followup`). Future decisions should optimize the latter and use the former only as a guardrail.
- **Scope discipline:** this report intentionally stops at assessment. It does not implement fixes, merge branches, or start V2.3.5-C, V2.4, or V3.
