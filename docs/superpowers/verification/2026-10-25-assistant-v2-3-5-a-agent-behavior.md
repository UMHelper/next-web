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
| `npx tsc --noEmit` | **12 errors** in test fixtures (`LoadSections` missing `sectionDataComplete`; `agent.test.ts` mock arity) — same failures with Task 8 changes stashed; likely from uncommitted `lib/database/get-course-info.ts` / local workspace drift, not Task 8 files |

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
