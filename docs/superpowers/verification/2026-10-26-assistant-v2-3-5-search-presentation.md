# Assistant V2.3.5 search presentation verification

- Verified: 2026-10-26
- Workspace: `/Users/thomaswu/workspace/next-web`

## 1. Root cause

`search_catalog` and `filter_catalog_results` were in `ALWAYS_RICH_TOOL_NAMES`, so `planRichBlocks` mounted every completed (or in-progress) search during streaming. Multi-search turns flooded the sidebar with full lists.

## 2. Before / after

| Before | After |
|--------|--------|
| Every `search_catalog` → rich list | Default: compact research summary + grouped activity; no per-search lists |
| No model control over catalog UI | `present_response.catalog.mode: "browse"` mounts one list (`resultSetId` optional) |
| Recommendations implied list row order | `present_response.recommendations.courses` drives ordinals / discussed context without auto-lists |
| Filter UI always paired with search | Filter rich UI when applied to a mounted browse set, or when filter fails (`unknown_result_set` / `invalid_request`) |

## 3. Architecture chosen (hybrid A + B)

- **A:** Extended `present_response` with optional `catalog` and `recommendations` (backward compatible empty `show`).
- **B:** Turn-level policy in `planRichBlocks` + `AssistantChatView` (streaming deferral, research summary, row cap, client expansion).

Rejected: phrase heuristics only, hide-all catalog UI, separate `present_catalog` tool, frontend-only hide without model claims.

## 4. Streaming

Catalog **lists** do not mount while the last turn is streaming (`streamingHere` gate). Tool activity still shows search progress; research summary can appear when multiple searches or hidden research exists.

## 5. Referents and context

- `summarizeCatalogResultSets` uses **visible** mounted result sets + `hiddenSearchCount`.
- `summarizeVisibleBlocks` adds `research_summary` when research is hidden.
- `discussed-courses` / ordinals prefer validated `recommendations` order when present.
- `planRichBlocks` accepts **thread context** so a later-turn `filter_catalog_results` still sees an earlier turn’s browse mount.

## 6. UI

- `CatalogResearchSummary` + turn expansion for merged deduped research.
- Browse lists: 15-row initial cap with in-page expand (`CATALOG_INITIAL_VISIBLE_ROWS`).
- `filter_catalog_results` renders via `useRenderTool` + explicit path in `assistant-chat.tsx`.
- Grouped catalog activity when ≥2 searches in a turn.

## 7. Tests

| Area | Location |
|------|----------|
| Presentation / planner | `tests/assistant/catalog-presentation.test.ts`, `tests/assistant/presentation.test.ts` |
| Visible blocks | `tests/assistant/visible-blocks.test.ts` |
| Chat view | `tests/components/assistant-chat-view.test.tsx` |
| Integration | `assistant-v2-1`, `v2-2`, `v2-3-5`, `assistant-search-catalog` (+ `integration-catalog-present.ts`, `integration-mock-present-response.ts`) |

**Gate results (2026-10-26):** `npx vitest run` 2174/2174, `eslint . --max-warnings=0`, `tsc --noEmit`, `npm run build` — pass.

## 8. Live model evaluation

**UNVERIFIED** — no bounded live DeepSeek comparison run in this session (no `.env.local` key exercise recorded).

## 9. Browser evaluation

**UNVERIFIED** — no manual authenticated pass at 380 / 450 / 800px recorded in this session.

## 10. Limitations

- Turn-level “View catalog research” expansion is client-only (not persisted across reload).
- Course detail cards after panel close/reopen depend on full thread replay; not re-validated for every card type in this pass.
- Instructor browse requires explicit `catalog.browse` (same as course browse).

## 11. V2.3.5-B compatibility

Planning-discovery may add more research calls; this layer only changes **presentation**. Tool payloads and compaction (`prepareRunMessages`) unchanged.

## 12. V2.3.5-C compatibility

Threads rehydrate from messages + the same planner; no new storage for browse/research MVP.

## 13. Circular dependency fix

`FILTER_CATALOG_RESULTS_TOOL_NAME` moved to `lib/assistant/catalog-tool-names.ts`; `catalog-research` avoids importing `rich-tools` for planner constants.

## 14. Release verdict

**Ready for merge** from automated gates and integration coverage. Live model and browser acceptance remain **UNVERIFIED** and should be completed before production sign-off if required by release policy.
