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
