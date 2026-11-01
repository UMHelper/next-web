# Explicit rich UI presentation architecture

## Principle

**Data retrieval tools gather evidence. Presentation tools communicate selected evidence to the student.**

Academic tools (`search_catalog`, `get_course`, `get_course_reviews`, `get_course_sections`, etc.) feed the model thread and may appear in a compact, expandable **Agent Activity** trace. They do not mount catalog lists, course cards, recommendation shortlists, or research summary cards on their own.

## Layers

| Layer | Responsibility | Key modules |
|-------|----------------|-------------|
| 1 — Research | Fetch bounded academic evidence for reasoning | `lib/assistant/tools.ts`, MCP/data adapters |
| 2 — Presentation decisions | Model chooses layout via `present_response` | `lib/assistant/presentation.ts`, `executePresentResponse` |
| 3 — Rendering | Validate claims against turn evidence; mount UI | `planRichBlocks`, `AssistantChatView`, CopilotKit `useRenderToolCall` |

CopilotKit **1.79.1**: registering `useRenderTool` does not auto-insert UI. Rich blocks render only when `AssistantChatView` includes a call id from `planRichBlocks` and invokes `toolRenderer.render`.

## `present_response` contract

- **`show`**: `course_detail` / `course_sections` after matching successful lookups in the turn.
- **`catalog.mode: browse`**: one interactive catalog list (`resultSetId` optional).
- **`recommendations.courses`**: ordered shortlist (max 5), grounded in turn search/`get_course` evidence; drives ordinals and a compact list when all codes validate.
- **Omitted fields**: no rich academic UI for that dimension. Do not call `present_response` merely to hide UI.
- **`catalog.mode: hidden`**: deprecated; same as omitting `catalog`.

## Documented exception

`preview_timetable` remains in `ALWAYS_RICH_TOOL_NAMES` because generating a preview is inherently a visualization request.

## Model context (not chat cards)

- `hiddenSearchCount` and visible catalog result sets reflect **mounted** browse lists only.
- `research_summary` in visible-blocks context records hidden search activity for honesty without a chat card.
- Recommendation order in `discussed-courses` / visible-blocks follows validated `present_response.recommendations`.

## Related work

- V2.3.5 search presentation: catalog browse claims, streaming deferral.
- This milestone: remove auto `CatalogResearchSummary`, auto “Show details” controls, and verbose default activity; add recommendation shortlist mounting and grouped activity.
