# Explicit rich UI presentation — verification

- Verified: 2026-10-26
- Workspace: `/Users/thomaswu/workspace/next-web`

## Architecture

See [spec](specs/2026-10-26-assistant-explicit-rich-ui.md). Academic tools feed the model and compact **Agent Activity** only. Rich blocks mount via `present_response` + `planRichBlocks`, except `preview_timetable` (always-rich).

## Before / after (UI)

| Scenario | Before | After |
|----------|--------|--------|
| Multi-search research | Catalog research card + per-tool rows | Collapsed “Research completed” + optional expand (per-tool rows + merged research list) |
| `get_course` without PR | “Show … details” buttons | No card, no detached buttons |
| Recommendations | Context ordinals only | Shortlist UI when all codes validate |
| Catalog browse | PR `catalog.browse` (unchanged) | Same |
| Timetable preview | Always-rich (unchanged) | Same |

## Gates

| Gate | Result |
|------|--------|
| `npx vitest run` | 266 files / **2176** pass |
| `eslint . --max-warnings=0` | pass |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass |

## Live model evaluation (§12)

**UNVERIFIED** — no bounded DeepSeek run recorded in this session.

## Browser acceptance (§13)

**UNVERIFIED** — no authenticated pass at 380 / 450 / 800px recorded in this session.

## §17 checklist

| Question | Answer |
|----------|--------|
| Search ten times without ten UI elements? | **Yes** — no auto lists/cards; activity is one collapsed summary per turn. |
| Intentional catalog list? | **Yes** — `present_response` `catalog.browse`. |
| Intentional shortlist? | **Yes** — `present_response` `recommendations` + planner mount. |
| Text-only despite lookups? | **Yes** — no PR ⇒ no rich academic UI. |
| Natural course/section cards? | **Yes** — via PR + existing card renderers. |
| Hidden research vs visible recommendations? | **Yes** — `hiddenSearchCount`, visible-blocks `recommendations`, discussed ordinals. |
| No redundant research card / detached controls? | **Yes** — `CatalogResearchSummary` and show-card offers removed. |
| Timetable / safety preserved? | **Yes** — `ALWAYS_RICH_TOOL_NAMES` unchanged; no tool payload changes. |

## Limitations

- Expanded activity merged research is client-only (not persisted on reload).
- Model must call `present_response` for shortlists and cards (no manual show-details fallback).
- `catalog.mode: hidden` remains parse-compatible but is deprecated in copy.

## V2.3.5-B/C

Presentation layer only; discovery may add more research calls without changing mount rules. Thread rehydration still uses the same planner.
