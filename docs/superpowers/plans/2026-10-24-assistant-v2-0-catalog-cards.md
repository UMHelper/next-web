# Assistant V2.0 — search_catalog Interactive Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render validated `search_catalog` tool results as interactive course / instructor cards inside the headless What2Reg AI chat, with View Course handled by Next.js routing and no extra model run.

**Architecture:** A pure parser (`lib/assistant/search-catalog-ui.ts`) validates the serialized tool message with the existing `searchCatalogOutputSchema`. A renderer registered once with `useRenderTool` in the always-mounted `AssistantTools` maps CopilotKit's `inProgress | executing | complete` states to skeleton / cards / empty / failure UI. `AssistantChat` calls `useRenderToolCall()` and hands `AssistantChatView` a `toolRenderer` prop; the view renders rich calls inline after their assistant fragment and keeps `ToolTrace` for every other call (and for rich calls that ended with no result).

**Tech Stack:** Next.js 15, React 18, CopilotKit 1.79.1 v2 headless, zod/v4 (via `lib/mcp/schemas.ts`), Tailwind tokens, Vitest + Testing Library.

**Spec:** The "What2Reg AI — V2.0/V2.1 Implementation Kickoff" brief (session prompt, 2026-10-24).

## Global Constraints

- No changes to server tools, MCP schemas, auth, access, rate limits, LLM config, prompt (unless a test shows a need).
- Course links use `buildCoursePath(courseCode)`; instructor links use `buildProfessorPath(name)`. Never the model's or the result's `url`.
- `isOffered` shows as "Offered this term" / "Not offered this term" — never seat availability.
- No ratings, no invented fields, no Select button, no new model-callable tools, no `useComponent`.
- Only theme tokens (no raw Tailwind palette colors — `tests/no-light-only-colors.test.ts`).
- Client code must not import `lib/assistant/tools.ts` at runtime (server deps); type-only import is fine.
- Do not commit (brief: no commits unless separately instructed).

## Review Focus

- Run stopped or failed before the tool result arrived → card area must not spin forever; falls back to the trace's "Not completed" row (view test `interrupted search falls back to the trace`).
- Hard runtime failure arrives as plain text `Error: …` → friendly failure, no crash (parser test `non-JSON content`).
- A result whose `results[]` row fails the schema (e.g. url off-site) → whole result treated as malformed, nothing rendered as data (parser test `rejects off-site url`).
- Replayed duplicate call with empty args next to the real one → only one card block (view test `dedupes replayed call`).
- Course code with characters needing encoding → link stays under `/course/` (card test `encodes course code`).

---

### Task 1: Tool-result parser

**Files:**
- Create: `lib/assistant/search-catalog-ui.ts`
- Test: `tests/assistant/search-catalog-ui.test.ts`

**Interfaces:**
- Produces:
  - `SEARCH_CATALOG_TOOL_NAME = "search_catalog"`
  - `type SearchCatalogFailure = "invalid_request" | "not_found" | "temporarily_unavailable" | "malformed"`
  - `type SearchCatalogView = { kind: "courses"; totalCount: number; hasMore: boolean; courses: CatalogCourse[] } | { kind: "instructors"; totalCount; hasMore; instructors: CatalogInstructor[] } | { kind: "empty"; searchType: "course" | "instructor" } | { kind: "failure"; reason: SearchCatalogFailure }`
  - `parseSearchCatalogResult(content: string): SearchCatalogView`

- [ ] Step 1: tests — valid course result (bilingual titles kept), valid instructor result, `results: []` → `empty` with searchType, each of the three `{error}` codes → failure with that reason, `"Error: boom"` → malformed, `""` → malformed, `{error:"other"}` → malformed, off-site url → malformed, null titleZh/faculty/department/credits accepted, missing `courseCode` → malformed, `type:"professor"` → malformed.
- [ ] Step 2: run `npx vitest run tests/assistant/search-catalog-ui.test.ts` → FAIL (module missing).
- [ ] Step 3: implement with `JSON.parse` in try/catch, `searchCatalogOutputSchema.safeParse`, a local `z.object({ error: z.enum(FAILURE_CODES) }).strict()` where `FAILURE_CODES satisfies readonly ToolFailure["error"][]`.
- [ ] Step 4: rerun → PASS.

### Task 2: Course card + search result UI + renderer registration

**Files:**
- Create: `components/assistant/catalog-course-card.tsx`, `components/assistant/search-catalog-tool-render.tsx`
- Modify: `components/assistant/assistant-panel.tsx` (call `useSearchCatalogToolRender()` inside `AssistantTools`)
- Test: `tests/components/catalog-course-card.test.tsx`, `tests/components/search-catalog-tool-render.test.tsx`, `tests/components/assistant-panel.test.tsx` (add `useRenderTool` to the `/v2` mock; assert `search_catalog` registered)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `CatalogCourseCard({ course }: { course: CatalogCourse })` — `<article>` with heading = code, titles, credits / faculty / department, offering status, `<Link href={buildCoursePath(code)}>` with accessible name `View course <CODE>`.
  - `SearchCatalogToolResult({ status, result }: { status: "inProgress" | "executing" | "complete"; result?: string })` — loading (`role="status"`, "Searching the catalog…"), courses list, instructor list (links `buildProfessorPath`, "N courses"), empty ("No matching courses/instructors on this site."), failure (per-reason copy + "Try rephrasing or ask again." / "Try again in a moment.").
  - `useSearchCatalogToolRender(): void` — `useRenderTool({ name: SEARCH_CATALOG_TOOL_NAME, parameters: z.object({}).passthrough(), render }, [])`; `render` closes over nothing.

- [ ] Step 1: card tests — code/titles/credits/faculty/department visible, null fields omitted, "Offered this term" vs "Not offered this term", link href `/course/ACCT1000` (from lower-case input too), `encodes course code` (`A/B 1` → `/course/A%2FB%201`), no `umeh.top` href used.
- [ ] Step 2: render tests — inProgress & executing show status row and no article; complete with courses shows N articles + "58 courses found" + "Showing 10 of 58"; instructor links; empty copy; failure copy for `temporarily_unavailable` and malformed; none render `role="alert"` spam beyond one.
- [ ] Step 3: run both → FAIL. Implement. Rerun → PASS.
- [ ] Step 4: panel test asserts `useRenderTool` received `name: "search_catalog"`; run → PASS.

### Task 3: Headless chat integration

**Files:**
- Modify: `components/ai-elements/tool.tsx` (export `dedupeCalls`), `components/assistant/assistant-chat-view.tsx`, `components/assistant/assistant-chat.tsx`
- Test: `tests/components/assistant-chat-view.test.tsx`, `tests/components/assistant-chat.test.tsx` (mock `useRenderToolCall`)

**Interfaces:**
- Produces: `AssistantChatViewProps.toolRenderer?: { names: ReadonlySet<string>; render: (call: ToolCall, result: ToolMessage | undefined) => ReactNode }`.
- Rule in `AssistantTurn`: dedupe all calls once; a call is *rich* iff `toolRenderer?.names.has(name) && (result || isRunning)`; rich calls render right after the text of the assistant fragment that carried them; the rest go to `ToolTrace`.

- [ ] Step 1: view tests with a fake `toolRenderer` (renders `<div data-testid="rich-{id}">{result?.content ?? "loading"}</div>`): rich call shown, no "Searched courses" trace; non-rich `get_course` still traced; result paired by id only (result for `call-x` not shown under `call-1`); result arriving after later messages still paired; two searches → two blocks in order; interrupted (no result, not running) → trace "Not completed", no rich block; running without result → rich "loading"; replayed empty-arg call deduped; without `toolRenderer` legacy trace unchanged.
- [ ] Step 2: run → FAIL. Implement. Rerun → PASS.
- [ ] Step 3: chat test mocks `useRenderToolCall` and asserts the view receives a renderer (rich block shown for a `search_catalog` message).

### Task 4: End-to-end integration (real provider, runtime, chat; scripted model)

**Files:**
- Create: `tests/components/assistant-search-catalog.integration.test.tsx`

- [ ] Step 1: Mount real `AssistantPanel` + real `AssistantChat`; mock `@/lib/assistant/tools` with a `search_catalog` that returns fixture results through the real `runReadOnlyTool` + `searchCatalogOutputSchema`; scripted model calls `search_catalog` then answers. Type into the composer, send, assert: loading or cards appear, cards show `ACCT1000` + Chinese title, click "View course ACCT1000" → `nav.pushes == ["/course/ACCT1000"]` and run count unchanged; Close → bubble → cards still present; second question (instructor search) keeps the first cards and adds instructor links; New chat clears cards.
- [ ] Step 2: run → PASS.

### Task 5: Verification

- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run test` all green; `npm run build` if practical; manual browser check if a dev server + credentials are available, otherwise report as unverified.
