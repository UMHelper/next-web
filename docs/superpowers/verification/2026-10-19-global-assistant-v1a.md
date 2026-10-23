# Global assistant V1-A verification

- Branch: `feat/global-assistant-v1`
- HEAD at verification: `b1e9a66` (`feat(assistant): drop the timetable-page wording from the prompt`)
- Plan: [2026-10-19-global-assistant-v1a.md](../plans/2026-10-19-global-assistant-v1a.md)
- Bundle baselines: `/tmp/v1a-before.txt` (pre–V1-A), `/tmp/v1a-after.txt` (post–Task 4 build; Task 5 prompt-only)

## 1. Automated checks

Command:

```bash
npx vitest run && npx tsc --noEmit -p . && npm run lint
```

| Step | Result | Notes |
|---|---|---|
| `npx vitest run` | **PASS** | 198 test files, 1259 tests passed (~8.9s) |
| `npx tsc --noEmit -p .` | **PASS** | exit 0 |
| `npm run lint` | **PASS** | `eslint . --max-warnings=0`, exit 0 |

## 2. Bundle comparison

Source: Next.js build route table in `/tmp/v1a-before.txt` vs `/tmp/v1a-after.txt`.

Acceptance: First Load JS on `/`, `/course/[code]`, `/reviews/[code]/[...prof]` grows ≤ 1.5 kB; `/timetable` same or smaller; shared First Load JS grows ≤ 1.5 kB.

| Route / metric | Before | After | Δ | Verdict |
|---|---|---|---|---|
| `/` First Load JS | 176 kB | 176 kB | 0 | OK (≤ 1.5 kB) |
| `/course/[code]` First Load JS | 133 kB | 133 kB | 0 | OK |
| `/reviews/[code]/[...prof]` First Load JS | 252 kB | 252 kB | 0 | OK |
| `/timetable` First Load JS | 206 kB | 204 kB | −2 kB | OK (shrunk) |
| First Load JS shared by all | 103 kB | 103 kB | 0 | OK (≤ 1.5 kB) |
| other shared chunks (total) | 3 kB | 3.01 kB | +0.01 kB | OK |

**Overall bundle verdict:** within cap. No CopilotKit leak investigation required.

## 3. Preview deployment

Command attempted:

```bash
npm run deploy:preview
```

Result: **failed immediately** — `Missing .env.preview.local. See docs/preview-worker.md and the Preview worker section of .env.example.`

- `.env.preview.local` is **not present** in the workspace (required for preview build/deploy per `scripts/deploy-preview.sh`).
- Preview checklist was **not run** (no deployed URL, no Clerk tester session).

**Plan note:** Task 6 asks for assistant access `testers` on preview. The preview worker runbook sets `ASSISTANT_ACCESS_OVERRIDE=everyone` in `wrangler.jsonc` because production DB lacks `ai_assistant_access` and `testers` mode cannot be exercised on preview as documented in `docs/superpowers/specs/2026-10-19-preview-worker-design.md`. When preview env exists, reconcile this with manual `testers` testing on staging/production if required.

## 4. Preview checklist (manual)

All items **not run** — blocker: cannot deploy preview without `.env.preview.local` (and subsequent Clerk sign-in as tester).

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Lazy loading (`/`, no copilotkit until bubble; one access call) | **Not run** | No preview deploy |
| 2 | V1-A acceptance (conversation persists across routes) | **Not run** | No preview deploy |
| 3 | Global plan (`check_plan_conflicts` on course page) | **Not run** | No preview deploy |
| 4 | Desktop layout ≥1280px + FloatingPlanner vs sidebar | **Not run** | No preview deploy |
| 5 | Narrow desktop 800px FloatingPlanner clip | **Not run** | No preview deploy |
| 6 | Mobile 375×812 | **Not run** | No preview deploy |
| 7 | Suppressed routes (`/admin`) | **Not run** | No preview deploy |
| 8 | Sign-out clears assistant | **Not run** | No preview deploy |
| 9 | Access off | **Not run** | No preview deploy |
| 10 | Skins (animal-island + dark, no style bleed) | **Not run** | No preview deploy |
| 11 | Transient overlaps (toasts / anchor ads) | **Not run** | No preview deploy |

## 5. Commit

Verification doc **not committed** — preview checklist incomplete per Task 6 rules.
