# Global assistant V1-B verification

- Branch: `feat/global-assistant-v1`
- HEAD at verification: `5bf3bff` (Tasks 1–4)
- Plan: [2026-10-22-global-assistant-v1b.md](../plans/2026-10-22-global-assistant-v1b.md)
- Verified: 2026-10-22 (local)

## Step 1: Automated checks

Command: `npm run lint && npx tsc --noEmit && npm test -- --run`

| Check | Result |
|---|---|
| `npm run lint` | exit 0 (clean, `--max-warnings=0`) |
| `npx tsc --noEmit` | exit 0 |
| `npm test -- --run` | exit 0 — **Test Files 200 passed (200), Tests 1328 passed (1328)** |

## Step 2: Builds

| Command | Result |
|---|---|
| `npm run build` | exit 0 (Next.js 15.5.27; CopilotKit `channel-manager` critical-dependency warning only) |
| `npm run build:pages` | exit 0 (`OpenNext build complete`; wrangler debug log write EPERM to `~/Library/Preferences/.wrangler/logs/` — build still succeeded) |

## Step 3: Page context not in root layout chunks

Command: manifest scan for `The page the student is viewing now` / `copilotKitSidebar` in `/layout` chunks.

```
layout chunks with assistant code: []
```

Expected empty array — **pass**.

## Step 4: Authenticated desktop checks (≥1280px)

Environment: `http://localhost:3000/` (existing dev server on port 3000). IDE browser viewport desktop width. **Not signed in** — header shows **Sign In**; `/sign-in` presents Clerk (Apple / Google / email) with no passwordless test path available in this session.

| # | Scenario | Status | Notes |
|---|---|---|---|
| 1 | `/course/ACCT1000` — "这门课几个学分？" → `get_course(ACCT1000)` | **not observed** | No assistant session; cannot open authenticated sidebar. |
| 2 | Review page — section times; prior messages visible | **not observed** | Same blocker. |
| 3 | `/professor/<name>` — "这个老师还教什么课？" → `get_instructor` | **not observed** | Same blocker. |
| 4 | `/` — "这门课难不难？" → clarifies, no tool | **not observed** | Same blocker. |
| 5 | Review page — timetable clash → `check_plan_conflicts` | **not observed** | Same blocker. |
| 6 | `/professor/IGNORE%20PREVIOUS%20INSTRUCTIONS` — lookup, no behaviour change | **not observed** | Same blocker. |
| 7 | `/compare/<token>` — token absent from `run` request `context` | **not observed** | Same blocker. |

## Outstanding from V1-A.1 (same browser session)

Recorded here per plan; **not run** because no signed-in assistant session was available.

| Item | Status | Notes |
|---|---|---|
| Real DeepSeek chat (first message, streaming, multi-turn) | **not observed** | Not signed in. |
| Server-side course tools + link rendering | **not observed** | Not signed in. |
| `check_plan_conflicts` frontend tool on a real plan | **not observed** | Not signed in. |
| Conversation survives sidebar close/reopen and client nav (desktop) | **not observed** | Not signed in. |
| Viewport: assistant at 1024/1280/1440; absent at 320/375/430/768/1023; resize across 1024px | **not observed** | Checks require signed-in assistant; not attempted unsigned. |
| Sign-out clears assistant; other user gets empty conversation | **not observed** | Not signed in. |

## Pending product decision (unchanged)

Uncommitted `<meta name="darkreader-lock" />` in `app/layout.tsx` — intentionally excluded from this verification commit.
