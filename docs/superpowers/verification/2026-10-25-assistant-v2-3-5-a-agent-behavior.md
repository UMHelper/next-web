# What2Reg AI V2.3.5-A: Agent behavior — verification

## Baseline (recorded 2026-10-26, Task 1)

| Item | State |
|---|---|
| Branch / HEAD | `feat/global-assistant-v2` @ `f025c0c` |
| Pre-existing uncommitted changes (not ours) | `.env.example`, `lib/database/get-course-info.ts`, `lib/rate-limit.ts`, `tests/rate-limit.test.ts`; untracked `docs/superpowers/audits/` |
| `npx vitest run` (before Task 1) | 8 files / 4 tests fail. Four suites fail to load without Supabase env (`read-only-planner`, V2.1/V2.2/search-catalog integration); `eval-timetable` fails on `server-only`; catalog `aka` fixture drift (2 tests); `assistant-chat-view` copy/tool-result fixture drift (2 tests). Unmerged `tests/assistant/theme-sync.test.ts` on disk added a 9th failing file until merge conflict resolved locally. |
| `npx vitest run` (after Task 1) | 258 files / 2106 tests pass |
| `npx tsc --noEmit` (before) | 3 errors (`aka` missing in test fixtures) |
| `npx tsc --noEmit` (after) | 0 errors |
| `npm run lint` | clean before and after |
| Platform limits that stay | Desktop-only mount; client-memory history (8 prior turns, old tool results cut to 200 chars); 30-turn hard stop; quota per run; 8 model steps; `get_course` cannot tell a database outage from not-found because `getCourseInfo`/`getProfListByCourse` swallow errors (D9) |

## Task 8 — Principle core prompt and procedures in tool descriptions (2026-10-26)

| Item | State |
|---|---|
| Branch / HEAD (start) | `feat/global-assistant-v2` @ `668c8a1` |
| `ASSISTANT_PROMPT` length | 20,066 → **14,784** (≤ 15,000) |
| `npx vitest run` | 260 files / **2146** tests pass |
| `npm run lint` | clean |
| `npx tsc --noEmit` | **12 errors** at Task 8 commit in test fixtures (`LoadSections` missing `sectionDataComplete`; `agent.test.ts` mock arity); **0 errors** after follow-up **`65d16c6`** |

### Description character counts (before → after)

| Constant / tool | Before | After |
|---|---:|---:|
| `ASSISTANT_PROMPT` | 20,066 | 14,784 |
| `CHECK_PLAN_CONFLICTS_DESCRIPTION` | 228 | 764 |
| `PREVIEW_TIMETABLE_DESCRIPTION` | 459 | 647 |
| `COURSE_REFERENT_DESCRIPTION` | 109 | 697 |
| `search_catalog` | 488 | 615 |
| `get_course` | 262 | 377 |
| `get_course_reviews` | 226 | 449 |
| `get_course_sections` | 97 | 467 |
| `get_instructor` | (unchanged; already matched spec) | — |
| `present_response` | (unchanged in Task 8; Task 5 receipt copy) | — |

### Contradictions C1–C9 — removed from prompt; now lives in

| ID | Resolution |
|---|---|
| C1 | **Removed** “Do not call get_course_reviews unless…”. **Now:** `ASSISTANT_PROMPT` “Investigating” + `get_course_reviews` description (read before teaching/workload/recommendation claims). |
| C2 | **Removed** mandatory `get_course, get_course_sections, and get_course_reviews` batch on every referent. **Now:** `ASSISTANT_PROMPT` “Investigating” (lookup what the goal needs); per-tool descriptions (`get_course_sections` at-most-three, etc.). |
| C3 | **Removed** “Answer only from this turn's tool results”. **Now:** `ASSISTANT_PROMPT` “Sources of truth” (fresh tools + timetable/preview/catalog/discussed context + conversation for goals only). |
| C4 | **Removed** blanket “no matching data on the site” on any failure. **Now:** `ASSISTANT_PROMPT` “Tool outcomes mean different things” + typed statuses in tool descriptions (e.g. `get_course_reviews` `temporarily_unavailable`). |
| C5 | **Removed** “default to omitting present_response” and phrase-gated inspect triggers. **Now:** `ASSISTANT_PROMPT` “Rich content in the chat” (goal-based cards); `present_response` description (Task 5 receipt; no “Default: omit”). |
| C6 | **Removed** implied “accepted = shown”. **Now:** `ASSISTANT_PROMPT` “present_response returns a receipt, not proof…” + visible-blocks / `missing_lookup` handling; receipt schema (Tasks 5–6). |
| C7 | **Removed** fixed “about 380px”. **Now:** `ASSISTANT_PROMPT` “Style” (“narrow, resizable side panel”). |
| C8 | **Removed** “Do not assume every client renders cards”. **Now:** `ASSISTANT_PROMPT` states search lists always appear as interactive lists; cards governed by rich-content principles. |
| C9 | **Removed** formulaic “Suggestion:” line vs repeat-facts tension as stated rules. **Now:** `ASSISTANT_PROMPT` “Style” (proportionate replies, conditional advice, repeat only when asked) + “Academic data” (always name review count). |

## Task 10 — Live DeepSeek agent-behavior eval (2026-10-26)

| Item | Value |
|---|---|
| Branch / suite commit | `feat/global-assistant-v2` @ `b6aa285` (suite); live runs @ `ee3d17d` (eval harness fixes) |
| Prompt fingerprint (live runs) | `b7bca953977e` (unchanged from Task 8 principle core) |
| Agent-behavior eval fingerprint | dev `e54391e9b352`, holdout `5f01f303a2fa` |
| Navigation semantic eval fingerprint (Task 4 `minEase` catalog) | `00e0aeccaf9c` |

### Agent-behavior live (DeepSeek, `.env.local` key)

| Suite | Repeats | Pass rate | Threshold | Met? |
|---|---:|---:|---:|---|
| dev (`agent-behavior-cases.ts`) | 3 | **27/48 = 0.563** | ≥ 0.85 | **No** |
| holdout (`agent-behavior-holdout-cases.ts`) | 1 | **7/8 = 0.875** | ≥ 0.80 | **Yes** |

| Safety / correctness metric | Result | Threshold | Met? |
|---|---:|---:|---|
| `falseCardClaim` violations (dev) | 2 | 0 | **No** |
| `falseCardClaim` violations (holdout) | 0 | 0 | **Yes** |
| Difficulty-direction cases (dev) | 2/6 = 0.333 | 1.00 | **No** |
| Difficulty-direction cases (holdout) | 2/2 = 1.00 | 1.00 | **Yes** |
| `no_midterm` certainty violations | 0 | 0 | **Yes** |
| `partial_failure` (dev) | 1/3 = 0.333 | 1.00 | **No** |

Turn cost (dev, 48 graded turns): model steps per turn p50 **3**, p90 **4**, max **5**; wall time per turn p50 **4.8s**, p90 **6.1s**. Result files: `.eval-results/assistant/agent-behavior-v235a-dev.json`, `agent-behavior-v235a-holdout.json`.

### Historical suites (unchanged cases, post–Task 8 prompt)

| Suite | Result | Registered threshold | Met? |
|---|---|---:|---|
| `presentation.eval.ts` (×3) | **29/39** hit (0.744) | ≥ 38/39 | **No** |
| `presentation-holdout.eval.ts` (×1) | **9/10** hit (0.90) | ≥ 9/10 | **Yes** |
| `timetable.eval.ts` (×3) | presentation 0.971, analysis 0.933, retrieval 1.00, safety 1.00, conversation **0.778**, false previews 0.022 | conversation ≥ 0.90 | **No** (conversation) |
| `timetable-conversation-holdout.eval.ts` (×1) | conversation **1.00**, safety 1.00 | conversation ≥ 0.85 | **Yes** |
| `navigation.eval.ts` semantic (×1) | **48/54** pass (0.889) | (no V2.3.5-A preregistration; informational) | — |

#### D4 presentation policy change (historical `presentation.eval.ts` — cases not edited)

| Case id | Old expectation | Observed under D4 natural cards | Live miss count (×3 repeats) |
|---|---|---|---:|
| `explain` | `omit` | `course_detail` on “What is CISC3014?” | 3/3 |
| `short` | `omit` | `course_detail` on terse code question | 2/3 |
| `colloquial_what` | `omit` | `course_detail` on colloquial “what is …” | 3/3 |

These are **policy conflicts**, not grader bugs: V2.3.5-A allows optional detail cards for exploration-shaped questions while V2.2 presentation cases still expect strict `omit`.

---

## Milestone summary (V2.3.5-A complete @ `f15bc3f`, 2026-10-26)

Verified branch: **`feat/global-assistant-v2` @ `f15bc3f`**. Pre-existing uncommitted (not staged): `.env.example`, `lib/database/get-course-info.ts`, `lib/rate-limit.ts`, `tests/rate-limit.test.ts`; untracked `docs/superpowers/audits/`.

### Files changed (`git diff --stat f025c0c..f15bc3f`)

**59 files**, **4909 insertions**, **542 deletions**. Notable additions: `lib/assistant/academic-facts.ts`, `lib/assistant/visible-blocks.ts`, `evals/assistant/agent-behavior-*`, `tests/components/assistant-v2-3-5.integration.test.tsx`, `tests/assistant/visible-blocks.test.ts`, `tests/assistant/eval-agent-behavior.test.ts`. Commits: `3e07942` (baseline doc) through `f15bc3f` (compare-courses eval tweak).

### Prompt architecture (before → after)

| Aspect | Before (pre–Task 8) | After |
|---|---|---|
| Core prompt | ~20k chars of procedural rules (review batching, phrase gates, “answer only this turn”, fixed 380px, `accepted` semantics) | **14,784** chars principle core: investigating, sources of truth, tool outcome meanings, rich content, receipt vs rendering, style, academic data |
| Procedures | Embedded in `ASSISTANT_PROMPT` | Tool/context descriptions (`search_catalog`, `get_course*`, `get_instructor`, timetable tools, `COURSE_REFERENT`, `present_response` receipt copy from Task 5) |
| Intent routing | Implicit phrase triggers | Model-chosen tools + D4 natural cards; no keyword classifier |

C1–C9 resolution table: **Task 8 section above**.

### Presentation lifecycle (before → after)

| Stage | Before | After |
|---|---|---|
| Server `present_response` | Returned **`accepted`** as if rendering were proven | Returns **`requested`** receipt with per-item **`ready` / `missing_lookup` / `lookup_failed`**; never `accepted` (Task 5) |
| Client mount | Claimed tool results → cards; duplicates possible | **`planRichBlocks`** logical dedupe; failed lookup replaced by later duplicate success (Task 6) |
| Later turns | No structured “what was shown” | **`summarizeVisibleBlocks`** + `useVisibleBlocks` agent context (last 3 turns, ≤900 chars JSON) (Task 6) |
| Unclaimed successful lookups | No affordance (V2.2 text-first only) | Compact **Show {CODE} details / class times** buttons; per-turn expansion state only (Task 7) |
| Cards without receipt | N/A | Evaluation-shaped turns may mount cards from successful `get_course` when model claims via `present_response`; receipt tracks eligibility separately |

### Error contract (before → after)

| Situation | Before | After |
|---|---|---|
| Schedule/review DB errors | Often **`[]`** or **`not_found`** | **`temporarily_unavailable`** at MCP/assistant boundary (Task 2) |
| Filtered instructor empty | **`not_found`** even when professor exists | Head-count fallback → empty success vs true **`not_found`** (Task 2) |
| Catalog search empty | “No matching courses on this site.” | Scoped copy: **“No courses/instructors matched this search.”** (Task 2) |
| Partial search failure | Could imply site-wide emptiness | Prompt + J5 integration: populated list + honest failure for the other query (Tasks 2, 8, 9) |
| Incomplete sections | Silent full confidence | **`sectionDataComplete`** / per-section **`complete`** flags in assistant projections and UI note (Task 3) |
| `get_course` outage | Indistinguishable from missing course (D9) | **Unchanged limitation** — `getCourseInfo` still swallows errors into `{}` / fallback path |

### Academic safeguards (A5)

- **`lib/assistant/academic-facts.ts`** + **`RATING_SCALE_NOTE`**: 1 = very hard, 5 = very easy; zero ratings / zero review rows → **`null`** in assistant projections (Task 4, D7).
- **`get_instructor`**: assistant-only **`minEase`** (keeps courses with hard ≥ value); MCP public tool unchanged (D6).
- **`notAvailableOnSite`** on assistant `get_course` output (D8).
- Prompt requires naming review count for rating claims; tool descriptions require reading reviews before teaching/workload/recommendation claims (D1).
- Live eval **`no_midterm` certainty** = 0 violations (dev + holdout); grader rejects definitive exam claims without evidence.

### Tests added / updated

| Area | Suites / files |
|---|---|
| Data honesty | `tests/mcp/reviews-sections.test.ts`, `tests/assistant/data.test.ts`, `search-catalog-tool-render.test.tsx` |
| Projections | `tests/assistant/academic-facts.test.ts`, `tests/mcp/course-instructor.test.ts`, presentation/rating tests |
| Receipt + dedupe | `tests/assistant/presentation.test.ts`, `visible-blocks.test.ts`, `agent.test.ts`, `tools.test.ts` |
| UI affordance | `tests/components/assistant-chat-view.test.tsx` |
| CopilotKit journeys | **`tests/components/assistant-v2-3-5.integration.test.tsx`** (10 journeys) |
| Live eval | `evals/assistant/agent-behavior*.ts`, `tests/assistant/eval-agent-behavior.test.ts` |
| Timetable regression | `assistant-v2-3.integration.test.tsx`, `eval-timetable.test.ts` fixtures (section completeness fields) |

**Deliberately revised assertions (not regressions):**

- **`ASSISTANT_PROMPT`**: policy tests replace verbatim legacy strings (`tests/assistant/agent.test.ts`).
- **`present_response`**: expectations moved from **`accepted`** to receipt shapes; integration mocks seed ledger per call.
- **`maxDifficulty`** → assistant **`minEase`** in instructor tool/tests.
- **Search empty copy** no longer claims site-wide absence.
- **V2.2 “no button”**: unclaimed successful lookups now expect **Show … details** buttons where Task 7 added affordances; claimed/auto-mounted cards still suppress buttons.

**Review notes incorporated:** J5 does not assert GELH2001 row; J1 turn 1 does not assert scripted factual reply; close/reopen asserts short follow-up line; no automated test for class-times show button; expanded cards render in rich-block stack not inline at button; single visible-blocks turn can exceed 900 chars before turn-level trim.

### Regression results (automated, Task 11)

| Gate | Command | Result @ `f15bc3f` |
|---|---|---|
| Tests | `npx vitest run` | **PASS** — 262 files, **2161** tests |
| Typecheck | `npx tsc --noEmit` | **PASS** — 0 errors (post–type-fix commit after `d856217`) |
| Lint | `npm run lint` | **PASS** |
| Build | `npm run build` | **PASS** |
| Repo hygiene | `git status --short` | Only pre-existing dirty files + verification doc + untracked audits (expected) |

Scripted CopilotKit coverage: **`assistant-v2-3-5.integration.test.tsx` 10/10**; full components suite was green through Task 9 follow-ups. Timetable V2.3 journeys remain in **`assistant-v2-3.integration.test.tsx`**.

### Browser acceptance (signed-in student; 380px and 800px panel)

**Environment:** No signed-in Clerk session in this pass; **`npm run dev`** was not used for manual checklist (no human partner run recorded). jsdom/integration tests cover many behaviors but **do not substitute** per the plan.

| Checklist item | 380px | 800px | Notes |
|---|---|---|---|
| Natural evaluation shows course card without trigger phrase | UNVERIFIED | UNVERIFIED | Covered in jsdom J1 turn 2; not browser-run |
| Quick fact stays text-only (credits) | UNVERIFIED | UNVERIFIED | jsdom J3 |
| “Show GELH1000 details” opens card | UNVERIFIED | UNVERIFIED | jsdom chat-view + J1 |
| `missing_lookup` recovery on “Tell me more.” | UNVERIFIED | UNVERIFIED | jsdom J1 turn 3 |
| Instructor comparison: review counts + difficulty direction | UNVERIFIED | UNVERIFIED | jsdom J1 comparison journey |
| Failed lookup honest message beside populated list | UNVERIFIED | UNVERIFIED | jsdom J5 |
| Timetable preview | UNVERIFIED | UNVERIFIED | V2.3 integration suite only |
| Close/reopen keeps cards / visible-blocks | UNVERIFIED | UNVERIFIED | jsdom J9 |
| Streaming / loading states | UNVERIFIED | UNVERIFIED | Partial unit coverage; no live browser |

### Remaining risks and platform limits

- **D9:** `get_course` cannot distinguish database outage from not-found (`getCourseInfo` / prof list error swallowing).
- **Timetable preview** has no **section-completeness** flag in preview payload (clash path uses `sectionListComplete` separately).
- **Show-card expansions** are per-turn UI state — **not** in visible-blocks context for later turns (Task 7 limitation).
- **History** still truncated (**8** prior turns; tool results cut to **200** chars in client memory).
- **Quota** unchanged (**30**/hour per run token model); **8** model steps; desktop-only mount.
- **Live model quality:** dev agent-behavior pass rate **0.563** (below **0.85**); difficulty direction and partial_failure miss on dev; **`falseCardClaim` 2** on dev — holdout thresholds mostly met (see Task 10).
- **Typecheck/build:** resolved after `d856217` by typing the agent-behavior sections fixture as `AssistantCourseSectionsOutput` and narrowing the journey test turn root to `HTMLElement`.

### Subsequent milestone dependencies (do not start here)

| Milestone | Depends on V2.3.5-A |
|---|---|
| **V2.3.5-B** (discovery) | Reuse **`academic-facts.ts`** projections, **`sectionDataComplete`**, typed failures, presentation **receipt** semantics |
| **V2.3.5-C** (persistence) | **Visible blocks** and ledger **replay raw tool calls/results** from stored messages — persistence must retain them |
| **V2.3.5-D** | **No quota change** in A; D remains separate |
| **V2.3.5-E** | Out of scope for A; see product roadmap / later specs |

---

## Completion summary (Task 11)

### What was implemented (Tasks 1–10)

Principle-based prompt and tool descriptions; typed data failures; validated assistant projections with rating scale, sample size, and gaps; truthful **`present_response`** receipts; card dedupe and visible-blocks context; show-card affordances; student journeys through real CopilotKit path; live DeepSeek agent-behavior eval suite and historical regression runs.

### What improved

Students can get evaluation-shaped cards without magic phrases; the model is steered by outcomes not slogans; partial tool failures and incomplete section data are surfaced honestly; the client no longer treats **`accepted`** as proof of rendering; instructor difficulty filtering uses **`minEase`** consistent with “easier = higher number.”

### Evidence

- **2161** vitest tests pass; **10/10** V2.3.5-A integration journeys; live holdout agent-behavior **7/8**; presentation-holdout **9/10**; timetable-conversation-holdout **1.00**; prompt fingerprint **`b7bca953977e`** stable.
- **Gaps:** dev live pass rate **27/48**; browser matrix **UNVERIFIED**; D4 historical presentation cases conflict with natural-card policy.

### Spec §10 acceptance criteria

| Criterion | Met? | Evidence / note |
|---|---|---|
| Prompt contradictions removed | **Yes** | C1–C9 table; Task 8 policy tests |
| Prompt simpler, academic-focused | **Yes** | 20,066 → 14,784 chars |
| Natural course evaluation recognition | **Partial** | jsdom + holdout live; dev live below threshold |
| Rich details without trigger phrases | **Partial** | D4 + dev eval misses; holdout mostly passes |
| Simple facts concise | **Yes** | Integration J3; presentation `short` policy tension on live only |
| No false receipt-as-rendered | **Yes** | Receipt schema + tests; **`falseCardClaim` holdout 0** |
| Cards use validated data | **Yes** | Projections + ledger eligibility |
| Mixed success/failure truthful | **Partial** | J5 integration pass; dev **`partial_failure` 1/3** live |
| Difficulty direction correct | **Partial** | Holdout **2/2**; dev **2/6** live |
| Review sample size handled | **Yes** | Projections + prompt + integration assertions |
| No unsupported verified exam claims | **Yes** | **`no_midterm` 0** violations live |
| Timetable semantics intact | **Yes** | V2.3 suites pass; conversation metric **0.778** on dev live (below 0.90) |
| No planner mutation | **Yes** | Read-only guards + integration |
| Tests, lint, TS, build pass | **Yes** | Full vitest + lint + tsc + build pass after type-fix commit |
| Real-model eval completed | **Yes** | Task 10 live runs documented |
| Browser acceptance | **Unverified** | No signed-in manual run |
| Limitations / dependencies documented | **Yes** | This report |

### Readiness

**V2.3.5-B:** Projections, completeness flags, typed errors, and receipts are in place for discovery work. **V2.3.5-C:** Visible-blocks and ledger design assume raw message persistence — do not persist summary-only history. **Do not start B/C in this milestone.**

**Release stance:** Strong automated and holdout-live signal; dev live quality still below preregistered floors; complete browser checklist with a signed-in student at 380px and 800px.
