# What2Reg AI V2.2 Adaptive Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the assistant answer ordinary academic questions in prose or Markdown, and mount an existing rich card only when it explicitly asks for one, without adding comparison widgets.

**Architecture:** Academic tools keep retrieving validated data. A small server tool, `present_response`, may opt in to existing `get_course` or `get_course_sections` cards during the same user turn. If that instruction is missing, invalid, or empty, the reply stays text-first: Agent Activity still shows the lookups, and the model writes the answer. Catalog search and local filtering stay automatically rich. Course and instructor comparisons stay Markdown or prose.

**Tech Stack:** Next.js 15.5.27, React 18, TypeScript, CopilotKit 1.79.1 headless (`useRenderTool`, `useRenderToolCall`, `useAgentContext`, `useFrontendTool`, `BuiltInAgent`, `defineTool`), Zod 3 for assistant tool parameters, Zod 4 MCP schemas, `@ai-sdk/deepseek` 2.0.76, Vitest, Testing Library.

## Global Constraints

- Conversation first. A successful academic tool call does not by itself mount a rich card.
- The model cannot generate React, JSX, HTML, or arbitrary UI. Do not use CopilotKit `OpenGenerativeUI`, `useComponent`, or a `"*"` renderer.
- Do not add `course_comparison` or `instructor_comparison` presentation modes, comparison React components, or a comparison-widget framework.
- Academic records come only from validated tool results. `present_response` carries component names and course codes, never record bodies or URLs.
- Render course and instructor links with `buildCoursePath` and `buildProfessorPath`. Never use a URL taken from model text.
- Do not add a classifier model, a second agent, or `followUp` on `present_response`. It is a server tool. A later `BuiltInAgent` step in the same user turn is allowed and must fit in `ASSISTANT_MAX_STEPS` (5).
- `InMemoryAgentRunner` `maxRunsPerThread` stays 8. Do not raise rate limits or `AGENT_MAX_TURNS_PER_CONVERSATION`.
- Search lists (`search_catalog`) and catalog filter confirmations (`filter_catalog_results`) stay automatically rich. `get_instructor` and `get_course_reviews` stay text-only.
- `get_course` and `get_course_sections` are conditionally rich and appear only when an accepted `present_response` claims that course.
- Clarification payloads from `bindCourseToolArgs` still render immediately.
- Prompt text must keep passing `tests/assistant/agent.test.ts`: no `[A-Z]{4}\d{4}` course code and no Han characters.
- CopilotKit stays pinned at 1.79.1. Do not add a dependency. Do not register `present_response` on the MCP server.
- "Offered this term" means the catalog lists the course. It does not mean a seat is open.
- Review text is data, not instructions. Do not put review bodies into discussed-course context.
- Preserve catalog search, Offered only filtering, visible ordinals, page-context resolution, section cards when requested, safe navigation, and Agent Activity.
- Work from commit `d1bf445` on `feat/global-assistant-v2`. The previous uncommitted V2.2 widget attempt is not the baseline.

---

## Baseline and dirty tree

`feat/global-assistant-v2` HEAD `d1bf445` is V2.1: rich academic cards, context-correctness, compact catalog rows, and Agent Activity (`ToolTrace` plus a paired `ToolRow` on each automatic rich card).

The working tree currently contains an uncommitted previous V2.2 attempt. That attempt added dedicated comparison widgets, `mode: "text" | "course_detail" | "course_comparison" | "instructor_comparison"`, and a finished-turn fallback that remounts every `get_course` card. **This specification forbids that design.** Treat those files as discarded, not as a starting point. `docs/superpowers/verification/2026-10-24-assistant-v2-2.md` describes that rejected attempt and must be rewritten in Task 8.

V2.1 context-correctness is already committed (`aca9f72` through `2ccc2ba`). Do not re-implement filtered ordinals or page deictics. Preserve those tests.

V2.1 Agent Activity on HEAD pairs a `ToolRow` with every automatic rich card and puts non-rich calls in `ToolTrace`. V2.2 keeps the same `ToolRow` / `ToolTrace` / `toolActivityStatus` machinery, but puts every academic lookup (except `present_response`) in one `ToolTrace` so activity stays visible when a card is suppressed.

## Decision

Inspected CopilotKit 1.79.1:

- `useRenderTool({ name, parameters, render })` still registers the existing academic renderers.
- `useRenderToolCall()` still paints a registered renderer by tool name. That is why tool name currently forces a card.
- `useFrontendTool({ followUp: true })` starts another model run (`app/api/copilotkit/[[...slug]]/route.ts` comment; `maxRunsPerThread` is 8 for `filter_catalog_results`). Using that for presentation would be an extra LLM request.
- The package exports `OpenGenerativeUI` and `useComponent`. This version does not use them.

Rejected:

- A `display` argument on `get_course` / `get_course_sections`. Two lookups in one turn can disagree, and a later step cannot add presentation without changing already-executed arguments.
- Sniffing the student's words or the final Markdown. The spec forbids hardcoded format rules as the decision mechanism.
- Finished-turn fallback to V2.1 cards. That remounts large cards after an explanation and fights "conversation first."
- Dedicated comparison UI. Course and instructor comparisons stay Markdown or prose.
- Changing academic MCP tools.

Selected: server tool `present_response` with a validated `show` list of existing components. Same model step is preferred. A later step in that user turn is valid. Default, omitted, rejected, and empty `show` are text-first.

| Situation | Rich UI |
| --- | --- |
| No accepted `present_response`, or `show: []` | Search and filter cards only. `get_course` / `get_course_sections` stay in Agent Activity. |
| `{ component: "course_detail", course }` claims a same-turn `get_course` | Existing `CourseDetailToolResult` for that call, including `not_found` / invalid payloads. |
| `{ component: "course_sections", course }` claims a same-turn `get_course_sections` | Existing `CourseSectionsToolResult` for each matching call. |
| Clarification `{ status: "needs_clarification", ask }` | Existing one-sentence clarification, even with no `present_response`. |
| Invalid / duplicate / conflicting `present_response` | Last accepted call wins. A later rejected call does not erase an earlier accepted one. |
| Claim names a course with no matching same-turn result | Do not fabricate a card. |

Streaming: never mount a conditional card and later remove it. Cards appear only after an accepted claim exists. A late `present_response` may add a card after activity; it must not replace a card that was already shown.

## File structure

- Create `lib/assistant/presentation.ts` — validate `present_response`, plan which existing renderers to mount, filter activity. No React.
- Create `lib/assistant/rating-semantics.ts` — submit-form scale glosses. Shared by prompt tests only. No comparison UI.
- Create `lib/assistant/discussed-courses.ts` — bounded JSON of recently retrieved courses for follow-up ordinals.
- Create `components/assistant/use-discussed-courses.tsx` — publishes that JSON through `useAgentContext`.
- Create the tests listed on each task.
- Modify `lib/assistant/tools.ts`, `prompt.ts`, `course-referent.ts`, `rich-tools.ts`.
- Modify `components/ai-elements/tool.tsx` (labels only), `components/assistant/assistant-chat-view.tsx`, `assistant-panel.tsx`.
- Modify V2.1 tests that currently assume every `get_course` mounts a card.
- Do not modify `lib/mcp/**`, timetable mutation code, Clerk checks, or catalog filter math.
- Do not create `course-comparison.tsx`, `instructor-comparison.tsx`, `course-comparison-ui.ts`, `instructor-comparison-ui.ts`, or `comparison-context.ts`.

## Rating facts the prompt must use

These are the submit-form scales in `components/submit/submit-comment-form.tsx`. MCP stores `hard` as `difficulty` (`lib/mcp/data/get-course.ts` and `get-instructor.ts`). A higher number is not automatically better. The `attendance` control is hidden in the current form; the stored scale is still 1 always checks … 5 never.

| Field | Stored as | Meaning | Scale |
| --- | --- | --- | --- |
| Overall | `result` (form `recommend`) | Recommendation | 1 Never! … 5 Completely |
| Grade | `grade` | Grade students report receiving | 1 F … 5 A. Higher means higher reported grades, not a stricter grader |
| Difficulty | `difficulty` (DB `hard`) | How hard the course felt | 1 Very hard … 5 Very easy. A higher number is easier |
| Usefulness | `reward` | How useful the course felt | 1 Waste of time … 5 Very useful |
| Attendance | `attendance` | How often attendance was checked | 1 Always … 5 Never |

There is no instructor-wide rating column. `get_instructor` returns per-course averages plus `commentCount`. Always name the review count. Do not treat a low-sample score as definitive.

---

### Task 1: Restore V2.1 and add the presentation contract

**Files:**
- Restore the listed V2.1 sources to `HEAD`, then create the new contract files.
- Create: `lib/assistant/presentation.ts`
- Create: `tests/assistant/presentation.test.ts`
- Modify: `lib/assistant/rich-tools.ts`
- Test: `tests/assistant/presentation.test.ts`

**Interfaces:**
- Consumes: `parseCourseDetailResult`, `parseCourseSectionsResult`, `clarificationAsk`, `RICH_TOOL_NAMES`.
- Produces:
  - `PRESENT_RESPONSE_TOOL_NAME = "present_response"`
  - `ALWAYS_RICH_TOOL_NAMES` — `search_catalog` and `filter_catalog_results` only
  - `executePresentResponse(args: unknown): PresentResponse`
  - `parsePresentArguments(argumentsJson: string): PresentResponse | null`
  - `activePresent(calls, results): { callId: string; request: AcceptedPresent } | null`
  - `courseCallIdentity` / `sectionCallIdentity`
  - `planRichBlocks(calls, results, alwaysRichNames, running: boolean): RichBlock[]`
  - `callsForActivity(calls)`

```ts
export type PresentComponent = "course_detail" | "course_sections";
export type PresentShow = { component: PresentComponent; course: string };
export type PresentResponse =
  | { status: "accepted"; show: PresentShow[] }
  | { status: "rejected"; reason: string };
export type AcceptedPresent = { status: "accepted"; show: PresentShow[] };
export type ToolCallLike = { id: string; function: { name: string; arguments: string } };
export type RichBlock = { kind: "tool"; callId: string };
```

- [ ] **Step 1: Restore the V2.1 baseline**

The working tree mixes V2.1 edits with the rejected widget attempt. Restore sources to `HEAD`, then delete the widget files. Do not restore `docs/superpowers/verification/2026-10-24-assistant-v2-1.md`. Do not delete this plan file.

```bash
git checkout HEAD -- \
  components/ai-elements/tool.tsx \
  components/assistant/assistant-chat-view.tsx \
  components/assistant/assistant-panel.tsx \
  components/assistant/course-detail-tool-render.tsx \
  lib/assistant/course-referent.ts \
  lib/assistant/prompt.ts \
  lib/assistant/rich-tools.ts \
  lib/assistant/tool-activity.ts \
  lib/assistant/tools.ts \
  tests/ai-elements/tool-status.test.tsx \
  tests/assistant/agent.test.ts \
  tests/assistant/course-referent.test.ts \
  tests/assistant/tool-activity.test.ts \
  tests/assistant/tools.test.ts \
  tests/components/assistant-chat-view.test.tsx \
  tests/components/assistant-chat.test.tsx \
  tests/components/assistant-search-catalog.integration.test.tsx \
  tests/components/assistant-v2-1.integration.test.tsx

rm -f \
  components/assistant/course-comparison.tsx \
  components/assistant/instructor-comparison.tsx \
  components/assistant/use-comparison-context.tsx \
  lib/assistant/comparison-context.ts \
  lib/assistant/course-comparison-ui.ts \
  lib/assistant/instructor-comparison-ui.ts \
  lib/assistant/presentation.ts \
  lib/assistant/rating-semantics.ts \
  lib/assistant/tool-labels.ts \
  evals/assistant/presentation-cases.ts \
  evals/assistant/presentation-grade.ts \
  evals/assistant/presentation.eval.ts \
  tests/assistant/comparison-context.test.ts \
  tests/assistant/course-comparison-ui.test.ts \
  tests/assistant/eval-presentation.test.ts \
  tests/assistant/instructor-comparison-ui.test.ts \
  tests/assistant/presentation.test.ts \
  tests/assistant/rating-semantics.test.ts \
  tests/components/assistant-v2-2.integration.test.tsx \
  tests/components/course-comparison.test.tsx \
  tests/components/instructor-comparison.test.tsx
```

Expected: `lib/assistant/tools.ts` lists the five academic server tools only. `assistant-chat-view.tsx` again uses `ToolTrace` / `isRichCall`. `git status` still shows this plan file and the V2.1 verification note.

- [ ] **Step 2: Write the failing contract test**

Create `tests/assistant/presentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ALWAYS_RICH_TOOL_NAMES, RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import {
  activePresent,
  callsForActivity,
  courseCallIdentity,
  executePresentResponse,
  parsePresentArguments,
  planRichBlocks,
  PRESENT_RESPONSE_TOOL_NAME,
  sectionCallIdentity,
  type ToolCallLike,
} from "@/lib/assistant/presentation";

function call(id: string, name: string, args: unknown): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function results(entries: Record<string, string>): Map<string, { content?: unknown }> {
  return new Map(Object.entries(entries).map(([id, content]) => [id, { content }]));
}

const course = (code: string) =>
  JSON.stringify({
    course: {
      courseCode: code,
      titleEn: code,
      titleZh: null,
      credits: "3",
      faculty: null,
      department: null,
      programLevel: null,
      suggestedYear: null,
      medium: null,
      gradingSystem: null,
      courseType: null,
      duration: null,
      description: null,
      isOffered: true,
      url: `https://umeh.top/course/${code}`,
    },
    page: 1,
    hasMore: false,
    totalCount: 0,
    instructors: [],
  });

describe("executePresentResponse", () => {
  it("accepts an empty show list and ignores unknown extra fields", () => {
    expect(executePresentResponse({ show: [], extra: true })).toEqual({ status: "accepted", show: [] });
    expect(executePresentResponse({})).toEqual({ status: "accepted", show: [] });
  });

  it("normalizes up to three distinct existing-component claims", () => {
    expect(
      executePresentResponse({
        show: [
          { component: "course_detail", course: "cisc2001" },
          { component: "course_sections", course: "CISC2001" },
        ],
      }),
    ).toEqual({
      status: "accepted",
      show: [
        { component: "course_detail", course: "CISC2001" },
        { component: "course_sections", course: "CISC2001" },
      ],
    });
  });

  it("rejects comparison modes, unknown components, and bad codes", () => {
    expect(executePresentResponse({ mode: "course_comparison", courses: ["CISC2001", "CISC2003"] })).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
    expect(executePresentResponse({ show: [{ component: "course_comparison", course: "CISC2001" }] })).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
    expect(executePresentResponse({ show: [{ component: "course_detail", course: "CISC 2001" }] })).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
  });
});

describe("parsePresentArguments", () => {
  it("returns null while JSON is incomplete", () => {
    expect(parsePresentArguments('{"show":')).toBeNull();
  });

  it("parses a finished payload", () => {
    expect(parsePresentArguments('{"show":[]}')).toEqual({ status: "accepted", show: [] });
  });
});

describe("planRichBlocks", () => {
  const always = ALWAYS_RICH_TOOL_NAMES;

  it("keeps search and filter rich, and hides course and section cards by default", () => {
    const calls = [
      call("s", "search_catalog", { query: "MATH" }),
      call("g", "get_course", { code: "CISC2001" }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
    ];
    expect(planRichBlocks(calls, results({}), always, true).map((block) => block.callId)).toEqual(["s"]);
    expect(planRichBlocks(calls, results({}), always, false).map((block) => block.callId)).toEqual([]);
    expect(RICH_TOOL_NAMES.has("get_course")).toBe(true);
    expect(ALWAYS_RICH_TOOL_NAMES.has("get_course")).toBe(false);
  });

  it("mounts claimed course and section cards, including a rewritten canonical code", () => {
    const calls = [
      call("g", "get_course", { code: "CISC9999" }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, {
        show: [
          { component: "course_detail", course: "CISC9999" },
          { component: "course_sections", course: "CISC2001" },
        ],
      }),
    ];
    const map = results({
      g: course("CISC2001"),
      sec: JSON.stringify({
        courseCode: "CISC2001",
        instructor: "CHAN TAI MAN",
        courseUrl: "https://umeh.top/course/CISC2001",
        sections: [],
      }),
    });
    expect(courseCallIdentity(calls[0], map.get("g")?.content as string)).toEqual({
      argument: "CISC9999",
      canonical: "CISC2001",
    });
    expect(sectionCallIdentity(calls[1], map.get("sec")?.content as string)).toEqual({
      argument: "CISC2001",
      canonical: "CISC2001",
    });
    expect(planRichBlocks(calls, map, always, false).map((block) => block.callId)).toEqual(["g", "sec"]);
  });

  it("lets a later accepted show replace an earlier one, and ignores a later rejection", () => {
    const lookups = [call("g", "get_course", { code: "CISC2001" })];
    const first = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, { show: [] }),
    ];
    expect(planRichBlocks(first, results({}), always, false)).toEqual([]);
    const rejectedLater = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, { mode: "course_comparison" }),
    ];
    const map = results({
      p2: JSON.stringify({ status: "rejected", reason: "invalid_request" }),
    });
    expect(activePresent(rejectedLater, map)?.request).toEqual({
      status: "accepted",
      show: [{ component: "course_detail", course: "CISC2001" }],
    });
    expect(planRichBlocks(rejectedLater, map, always, false)).toEqual([{ kind: "tool", callId: "g" }]);
  });

  it("still shows a clarification from get_course", () => {
    const calls = [call("g", "get_course", { code: "CISC2001" })];
    const map = results({ g: JSON.stringify({ status: "needs_clarification", ask: "Which course do you mean?" }) });
    expect(planRichBlocks(calls, map, always, true)).toEqual([{ kind: "tool", callId: "g" }]);
  });

  it("drops present_response from activity", () => {
    const calls = [
      call("g", "get_course", { code: "CISC2001" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, { show: [] }),
    ];
    expect(callsForActivity(calls).map((entry) => entry.id)).toEqual(["g"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/assistant/presentation.test.ts`

Expected: FAIL because `lib/assistant/presentation.ts` and `ALWAYS_RICH_TOOL_NAMES` do not exist.

- [ ] **Step 4: Write the contract and split always-rich names**

In `lib/assistant/rich-tools.ts`, keep `RICH_TOOL_NAMES` as the set of registered renderers (`search_catalog`, `get_course`, `get_course_sections`, `filter_catalog_results`). Add:

```ts
export const ALWAYS_RICH_TOOL_NAMES: ReadonlySet<string> = new Set([
  SEARCH_CATALOG_TOOL_NAME,
  FILTER_CATALOG_RESULTS_TOOL_NAME,
]);
```

Create `lib/assistant/presentation.ts` with the behavior the test locks:

- Course codes are `/^[A-Z]{4}\d{4}$/`. Components are only `course_detail` and `course_sections`.
- `executePresentResponse` reads `show`. Missing or empty `show` is `{ status: "accepted", show: [] }`. A non-array `show`, an unknown component, a bad code, more than 3 items, or a duplicate `(component, course)` is `{ status: "rejected", reason: "invalid_request" }`. A `mode` field is ignored except that a payload without a valid `show` array and with leftover comparison keys still rejects when `show` is not a valid array — the test payload `{ mode: "course_comparison", courses: [...] }` has no `show` and must reject. Implementation: if `show` is `undefined` and the record has any other key (`mode`, `courses`, `instructors`), reject; if the record is empty or `{ show: [] }`, accept empty.
- `activePresent` walks calls in order. Skip names other than `present_response`. Skip incomplete JSON (`parsePresentArguments` null). Skip parsed `rejected`. Skip a result body whose `status` is `"rejected"`. Keep the last remaining accepted call.
- `courseCallIdentity` reads `args.code` and, when `parseCourseDetailResult` returns `kind: "course"`, the canonical `course.courseCode`.
- `sectionCallIdentity` reads `args.code` and, when `parseCourseSectionsResult` is `sections` or `empty`, that payload's `courseCode`.
- A claim matches when the target equals `canonical` or, while `canonical` is null, `argument`.
- `planRichBlocks` never emits a comparison block. It emits `{ kind: "tool", callId }` for always-rich names when a result exists or `running` is true, for clarification payloads, and for claimed course/section calls. `running` does not remount unclaimed course or section cards.
- `callsForActivity` drops `present_response`.

Treat non-string tool `content` as missing (`typeof content === "string" ? content : undefined`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/assistant/presentation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/assistant/presentation.ts lib/assistant/rich-tools.ts tests/assistant/presentation.test.ts
git commit -m "$(cat <<'EOF'
feat(assistant): add an opt-in presentation contract for existing cards

EOF
)"
```

---

### Task 2: Register `present_response` and teach the model the default

**Files:**
- Modify: `lib/assistant/tools.ts`
- Modify: `components/ai-elements/tool.tsx` (label maps only)
- Modify: `lib/assistant/prompt.ts` (rules 11 and 15)
- Modify: `tests/assistant/tools.test.ts`
- Modify: `tests/assistant/agent.test.ts`
- Test: `tests/assistant/tools.test.ts`, `tests/assistant/agent.test.ts`

**Interfaces:**
- Consumes: `executePresentResponse`, `PRESENT_RESPONSE_TOOL_NAME` from Task 1.
- Produces: `createAssistantTools()` includes `present_response` after `get_course_sections`. `ASSISTANT_SERVER_TOOL_NAMES` includes it. The tool is not in `COURSE_TOOL_NAMES`. MCP lists stay unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/assistant/tools.test.ts`, replace `registers the five read-only tools` with:

```ts
  it("registers the read-only tools, including present_response", () => {
    expect(createAssistantTools().map((tool) => tool.name)).toEqual([...ASSISTANT_SERVER_TOOL_NAMES]);
    expect(ASSISTANT_SERVER_TOOL_NAMES).toContain("present_response");
  });

  it("validates present_response without reading academic data", async () => {
    await expect(
      call("present_response", { show: [{ component: "course_detail", course: "CISC2001" }] }),
    ).resolves.toEqual({
      status: "accepted",
      show: [{ component: "course_detail", course: "CISC2001" }],
    });
    expect(data.getCourse).not.toHaveBeenCalled();
    expect(data.getInstructor).not.toHaveBeenCalled();
    expect(data.searchCatalog).not.toHaveBeenCalled();
    expect(data.getCourseReviews).not.toHaveBeenCalled();
    expect(data.getCourseSections).not.toHaveBeenCalled();
  });
```

In `tests/assistant/agent.test.ts`, inside `formats replies for the narrow sidebar`, replace the comparison-card assertions with:

```ts
    expect(ASSISTANT_PROMPT).toContain("call present_response in the same user turn as the lookup tools");
    expect(ASSISTANT_PROMPT).toContain("A later model step in that turn is valid");
    expect(ASSISTANT_PROMPT).toContain("component course_detail");
    expect(ASSISTANT_PROMPT).toContain("component course_sections");
    expect(ASSISTANT_PROMPT).toContain("Do not call present_response for an ordinary explanation, a comparison, or a short scheduling answer");
    expect(ASSISTANT_PROMPT).toContain("If you omit present_response, no course or section card is shown");
    expect(ASSISTANT_PROMPT).toContain("Search lists still appear on their own");
    expect(ASSISTANT_PROMPT).not.toContain("give each one a bold line");
    expect(ASSISTANT_PROMPT).not.toContain("course_comparison");
    expect(ASSISTANT_PROMPT).not.toContain("instructor_comparison");
    expect(ASSISTANT_PROMPT).not.toMatch(/\b[A-Z]{4}\d{4}\b/);
    expect(ASSISTANT_PROMPT).not.toMatch(/[\p{Script=Han}]/u);
```

Keep the existing sentences the test already requires: three-column table limit, `rating numbers with their scale`, `Suggestion:`, Markdown links, `Do not repeat facts you already gave`.

In the card-brevity test, keep `answer in one or two sentences and add caveats instead of restating every field, section or meeting time`. Replace any remaining assertion that `get_course` and `get_course_sections` results are always shown as cards.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/assistant/tools.test.ts tests/assistant/agent.test.ts`

Expected: FAIL. `present_response` is missing, and the prompt still says `give each one a bold line`.

- [ ] **Step 3: Implement the tool, labels, and prompt**

In `lib/assistant/tools.ts`:

- Import `executePresentResponse`, `PRESENT_RESPONSE_TOOL_NAME` from `@/lib/assistant/presentation`.
- Append `PRESENT_RESPONSE_TOOL_NAME` to `ASSISTANT_SERVER_TOOL_NAMES`.
- Add this tool at the end of `createAssistantTools`, after `get_course_sections`. Do not wrap it in `runCourseTool`.

```ts
    defineTool({
      name: PRESENT_RESPONSE_TOOL_NAME,
      description:
        "Opt in to an existing rich card for this user turn. Call it in the same user turn as the academic lookups. Prefer the same model step when the intent is already clear. A later model step in that turn is valid. Do not wait for another student message. Omit this tool for an ordinary explanation, a comparison, a Markdown table, or a short factual answer. show is a list of existing components only: component course_detail with a course code shows the existing course card for that get_course result; component course_sections with a course code shows the existing class-time cards for that get_course_sections result. This tool does not look anything up. Pass the codes the lookup tools use. If binding rewrites a course code, the rendered course is the tool result.",
      parameters: z.object({
        show: z
          .array(
            z.object({
              component: z.string().max(40),
              course: z.string().max(40),
            }),
          )
          .max(6)
          .optional(),
      }),
      execute: (args) => Promise.resolve(executePresentResponse(args)),
    }),
```

In `components/ai-elements/tool.tsx`, add English labels so a leaked row is not the Chinese fallback in `toolLabel`:

```ts
  present_response: { running: "Choosing a layout", done: "Chose a layout" },
```

and

```ts
  present_response: "Couldn't choose a layout",
```

The view hides this row in Task 3.

In `lib/assistant/prompt.ts`, replace rule 11's comparison sentences. Keep the sidebar sentence, the three-column table limit, `rating numbers with their scale`, `Suggestion:`, Markdown links, and `Do not repeat facts you already gave`. Use:

```text
When the student wants to inspect a course card or class-time cards, call present_response in the same user turn as the lookup tools. A later model step in that turn is valid. Use component course_detail when they ask to see or inspect the full course details. Use component course_sections when they ask to see the section cards. Do not call present_response for an ordinary explanation, a comparison, or a short scheduling answer; write prose or a Markdown table instead. If you omit present_response, no course or section card is shown. Search lists still appear on their own. After a card, write a short interpretation instead of repeating every field. When they asked for a table, you may use a Markdown table with at most three short columns. Put your own recommendation after the facts, on its own line starting with "Suggestion:" in the reply language.
```

In rule 15, remove the clause that `get_course` and `get_course_sections` results are always shown as cards. Keep section-card brevity for when cards do appear: `answer in one or two sentences and add caveats instead of restating every field, section or meeting time`. State that omitted `present_response` hides those cards, and that search lists stay automatic. Keep `Do not assume every client renders cards`.

Do not add a course code or any Han character. Do not mention `course_comparison` or `instructor_comparison`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/tools.test.ts tests/assistant/agent.test.ts`

Expected: PASS. `createAssistantAgent` still expects `maxSteps: 5`.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/tools.ts lib/assistant/prompt.ts components/ai-elements/tool.tsx tests/assistant/tools.test.ts tests/assistant/agent.test.ts
git commit -m "$(cat <<'EOF'
feat(assistant): let the model opt in to existing cards in the same turn

EOF
)"
```

---

### Task 3: Make the chat view honor the planner

**Files:**
- Modify: `components/assistant/assistant-chat-view.tsx`
- Modify: `tests/components/assistant-chat-view.test.tsx`
- Test: `tests/components/assistant-chat-view.test.tsx`, `tests/components/assistant-v2-1.integration.test.tsx` (run only; updates belong in Task 6 if this run fails on auto-cards)

**Interfaces:**
- Consumes: `planRichBlocks`, `callsForActivity` from Task 1. `ALWAYS_RICH_TOOL_NAMES` for the planner. `RICH_TOOL_NAMES` stays on `toolRenderer.names` so `useRenderToolCall` can still paint course and section cards.
- Produces: one `ToolTrace` per turn for `callsForActivity`. Conditional cards mount only when the planner emits `{ kind: "tool" }`. No second `ToolRow` above a card. `present_response` never appears in activity.

- [ ] **Step 1: Write the failing view tests**

In `tests/components/assistant-chat-view.test.tsx`, change `renders one activity row and a rich block for get_course` so a finished turn with only `get_course` expects `Read course` and `queryByTestId("rich-call-course")` null.

Change `renders one activity row and a rich block for get_course_sections` the same way: activity remains, `rich-call-sections` is absent.

Keep the search and filter tests as automatic rich blocks.

Add:

```ts
it("renders a course card only when present_response claims course_detail", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "Show the full details of APAC1000." },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
          {
            id: "p",
            type: "function",
            function: {
              name: "present_response",
              arguments: '{"show":[{"component":"course_detail","course":"APAC1000"}]}',
            },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "g", content: courseBody },
      { id: "t2", role: "tool", toolCallId: "p", content: '{"status":"accepted","show":[{"component":"course_detail","course":"APAC1000"}]}' },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getByTestId("rich-g")).toBeTruthy();
  expect(screen.getByText("Read course")).toBeTruthy();
  expect(screen.queryByText("Choosing a layout")).toBeNull();
  expect(screen.queryByText("Chose a layout")).toBeNull();
});

it("does not mount two course cards for a comparison turn", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "CISC2001 vs CISC2003?" },
      {
        id: "a1",
        role: "assistant",
        content: "| Attribute | A | B |\n|---|---|---|",
        toolCalls: [
          { id: "g1", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
          { id: "g2", type: "function", function: { name: "get_course", arguments: '{"code":"APAC2000"}' } },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "g1", content: courseBody },
      { id: "t2", role: "tool", toolCallId: "g2", content: courseBody },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.queryByTestId("rich-g1")).toBeNull();
  expect(screen.queryByTestId("rich-g2")).toBeNull();
  expect(screen.getAllByText("Read course").length).toBeGreaterThan(0);
});

it("keeps a get_course clarification visible", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "the second one" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } }],
      },
      {
        id: "t",
        role: "tool",
        toolCallId: "g",
        content: '{"status":"needs_clarification","ask":"Which course do you mean?"}',
      },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getByTestId("rich-g")).toBeTruthy();
});
```

Also add a running-turn test: `get_course` plus `isRunning: true` and no `present_response` has activity and no course rich id. Then rerender with a second assistant message that only calls `present_response` claiming that course, still `isRunning: true`, and assert the rich id appears (add, not replace).

Update the domain-error test: without `present_response`, a `not_found` `get_course` shows `Couldn't read course` and no rich id. Add a sibling test where `present_response` claims that code and the existing rich failure block mounts once.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/assistant-chat-view.test.tsx`

Expected: FAIL because an unclaimed finished `get_course` still mounts a card, and activity is still paired on the card instead of one `ToolTrace`.

- [ ] **Step 3: Wire `AssistantTurn`**

In `components/assistant/assistant-chat-view.tsx`:

- Import `ALWAYS_RICH_TOOL_NAMES` from `@/lib/assistant/rich-tools`.
- Import `callsForActivity`, `planRichBlocks` from `@/lib/assistant/presentation`.
- Delete `isRichCall` and `traceCalls`.
- Compute:

```tsx
  const activityCalls = useMemo(() => callsForActivity(dedupedCalls), [dedupedCalls]);
  const richPlan = useMemo(
    () => planRichBlocks(dedupedCalls, results, ALWAYS_RICH_TOOL_NAMES, streamingHere),
    [dedupedCalls, results, streamingHere],
  );
  const richByCallId = useMemo(() => new Map(richPlan.map((block) => [block.callId, block])), [richPlan]);
```

- Render `{activityCalls.length > 0 ? <ToolTrace calls={activityCalls} results={results} isRunning={streamingHere} /> : null}` at the top of the turn.
- For each assistant part, look up `richByCallId.get(call.id)`. If missing, or `seenRichIds` already has the id, skip. If present and `toolRenderer` exists, render only `toolRenderer.render(call, result)` — no second `ToolRow`.
- Skip `present_response` even if it were in `RICH_TOOL_NAMES`.

Do not import comparison components.

- [ ] **Step 4: Run the view tests**

Run: `npx vitest run tests/components/assistant-chat-view.test.tsx tests/components/assistant-search-catalog.integration.test.tsx tests/components/course-detail-tool-render.test.tsx tests/components/course-sections-tool-render.test.tsx`

Expected: PASS. The V2.1 integration file may still fail on auto-cards; do not change product behavior to keep that file green. Task 6 updates the scripted brain.

- [ ] **Step 5: Commit**

```bash
git add components/assistant/assistant-chat-view.tsx tests/components/assistant-chat-view.test.tsx
git commit -m "$(cat <<'EOF'
feat(assistant): mount course and section cards only when opted in

EOF
)"
```

---

### Task 4: Ground comparisons and recommendations in verified ratings

**Files:**
- Create: `lib/assistant/rating-semantics.ts`
- Create: `tests/assistant/rating-semantics.test.ts`
- Modify: `lib/assistant/prompt.ts`
- Modify: `tests/assistant/agent.test.ts`
- Test: those two test files

**Interfaces:**
- Consumes: the submit-form scales listed above. No new tool.
- Produces: `RATING_SCALES`, `SMALL_REVIEW_SAMPLE = 5`. Prompt sentences the model uses for Markdown comparisons and follow-up advice.

```ts
export const RATING_SCALES: readonly {
  key: "result" | "grade" | "difficulty" | "reward" | "attendance";
  label: string;
  gloss: string;
}[];
```

- [ ] **Step 1: Write the failing tests**

Create `tests/assistant/rating-semantics.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { RATING_SCALES, SMALL_REVIEW_SAMPLE } from "@/lib/assistant/rating-semantics";

describe("rating semantics", () => {
  it("states the inverted difficulty scale and the grade scale", () => {
    expect(SMALL_REVIEW_SAMPLE).toBe(5);
    expect(RATING_SCALES.find((scale) => scale.key === "difficulty")?.gloss).toContain("higher number is easier");
    expect(RATING_SCALES.find((scale) => scale.key === "grade")?.gloss).toContain("not a stricter grader");
    expect(RATING_SCALES.find((scale) => scale.key === "result")?.gloss).toContain("Never!");
    expect(RATING_SCALES.find((scale) => scale.key === "reward")?.gloss).toContain("Waste of time");
    expect(RATING_SCALES.find((scale) => scale.key === "attendance")?.gloss).toContain("Always");
  });
});
```

In `tests/assistant/agent.test.ts` add `grounds comparisons in facts, reviews, and stated uncertainty`:

```ts
  it("grounds comparisons in facts, reviews, and stated uncertainty", () => {
    expect(ASSISTANT_PROMPT).toContain("Separate verified catalog facts from student review scores and from your own interpretation");
    expect(ASSISTANT_PROMPT).toContain("1 Very hard");
    expect(ASSISTANT_PROMPT).toContain("5 Very easy");
    expect(ASSISTANT_PROMPT).toContain("higher difficulty number is easier");
    expect(ASSISTANT_PROMPT).toContain("1 is F and 5 is A");
    expect(ASSISTANT_PROMPT).toContain("not a stricter grader");
    expect(ASSISTANT_PROMPT).toContain("Always name the review count");
    expect(ASSISTANT_PROMPT).toContain("A score on one course does not describe that instructor's other courses");
    expect(ASSISTANT_PROMPT).toContain("If a preference that would change the suggestion is missing, give a conditional suggestion or ask one question");
    expect(ASSISTANT_PROMPT).toContain("Do not call a course or instructor definitively better");
    expect(ASSISTANT_PROMPT).toContain("Use the discussed-courses context for follow-ups");
    expect(ASSISTANT_PROMPT).toContain("Do not call get_course_reviews unless the student asks what the reviews say");
    expect(ASSISTANT_PROMPT).toContain("Do not stack course cards to compare");
    expect(ASSISTANT_PROMPT).not.toMatch(/\b[A-Z]{4}\d{4}\b/);
    expect(ASSISTANT_PROMPT).not.toMatch(/[\p{Script=Han}]/u);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/assistant/rating-semantics.test.ts tests/assistant/agent.test.ts`

Expected: FAIL. The module is missing and the prompt lacks those sentences.

- [ ] **Step 3: Add the scales and the paragraph**

Create `lib/assistant/rating-semantics.ts`:

```ts
export const RATING_SCALES = [
  { key: "result", label: "Overall", gloss: "1 Never!, 5 Completely." },
  { key: "grade", label: "Reported grade", gloss: "1 is F and 5 is A. Higher means higher grades reported, not a stricter grader." },
  { key: "difficulty", label: "Difficulty", gloss: "1 Very hard, 5 Very easy. A higher number is easier." },
  { key: "reward", label: "Usefulness", gloss: "1 Waste of time, 5 Very useful." },
  { key: "attendance", label: "Attendance checks", gloss: "1 Always, 5 Never." },
] as const;

export const SMALL_REVIEW_SAMPLE = 5;
```

Append one paragraph to `ASSISTANT_PROMPT`. Include every sentence the test looks for, plus: offering status is not a seat; do not invent a difficulty number the tools did not return; on "which is harder", use the difficulty score and its scale, name the review count, and say the conclusion is an interpretation; do not stack course cards to compare. Keep `Suggestion:` from rule 11.

Do not add a course code or Han text. Do not add a preference table or a recommendation engine.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/rating-semantics.test.ts tests/assistant/agent.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/rating-semantics.ts lib/assistant/prompt.ts tests/assistant/rating-semantics.test.ts tests/assistant/agent.test.ts
git commit -m "$(cat <<'EOF'
feat(assistant): ground comparisons in catalog facts and real score scales

EOF
)"
```

---

### Task 5: Keep multi-entity references distinct

**Files:**
- Create: `lib/assistant/discussed-courses.ts`
- Create: `components/assistant/use-discussed-courses.tsx`
- Create: `tests/assistant/discussed-courses.test.ts`
- Modify: `lib/assistant/course-referent.ts`
- Modify: `tests/assistant/course-referent.test.ts`
- Modify: `components/assistant/assistant-panel.tsx`
- Modify: `lib/assistant/prompt.ts`
- Modify: `tests/assistant/agent.test.ts`
- Test: `tests/assistant/discussed-courses.test.ts`, `tests/assistant/course-referent.test.ts`, `tests/assistant/agent.test.ts`

**Interfaces:**
- Consumes: `parseCourseDetailResult`, `PAGE_CONTEXT_DESCRIPTION` is not required inside the summarizer.
- Produces:

```ts
export const DISCUSSED_COURSES_CONTEXT_DESCRIPTION =
  "Courses already retrieved in this chat, newest turn first. order is the student's mention order when the message named two or more codes; otherwise tool-result order. Use for follow-up ordinals when no catalog result set is newer";

export const MAX_DISCUSSED_CONTEXT_CHARS = 1200;

export function summarizeDiscussedCourses(messages: readonly { role: string; content?: unknown; toolCalls?: unknown; toolCallId?: string }[]): string;
```

JSON value:

```ts
{
  active: null | { id: string; order: string[]; newerThanCatalog: true };
  turns: Array<{ id: string; order: string[] }>;
}
```

Newest two turns that have at least two validated `get_course` codes. `active` is set only when that newest turn is newer than the last `search_catalog` call. Codes are parsed `course.courseCode` values, not model prose.

Order for one turn:

1. Explicit codes in the user message, in mention order, that also appear in that turn's validated `get_course` results.
2. If the user message has exactly one explicit code and the turn retrieved exactly two validated codes including that one, put the other code first, then the named code. That is "this" plus one named course.
3. Otherwise append remaining validated result codes in first-call order.

`resolveCourseReferent` gains optional `discussed?: { id: string; order: string[]; newerThanCatalog: boolean }`. When there is exactly one ordinal, the message does not name a result-set id, and `discussed.newerThanCatalog` is true, bind that ordinal to `discussed.order[position - 1]`. Return `{ kind: "ordinal", courseCode, position, resultSetId: discussed.id }`. If the position is past the end, return the existing ambiguous shape with ask `None of the discussed courses is in that position.` This branch runs before the empty-catalog `kind: "none"` return.

`courseReferentFromRun` reads `DISCUSSED_COURSES_CONTEXT_DESCRIPTION` and passes `active` through.

`bindCourseToolArgs` for `kind: "multiple"`:

```ts
  if (referent.kind === "multiple") {
    const allowed = new Set(referent.explicitCodes);
    if (referent.pageCourseCode) allowed.add(referent.pageCourseCode);
    if (
      args !== null &&
      typeof args === "object" &&
      !Array.isArray(args) &&
      typeof (args as { code?: unknown }).code === "string"
    ) {
      const code = (args as { code: string }).code.trim().toUpperCase();
      if (!allowed.has(code)) {
        return {
          action: "clarify",
          result: { status: "needs_clarification", ask: "Which course do you mean?" },
        };
      }
    }
    return { action: "passthrough", args };
  }

  if (referent.kind === "none") {
    return { action: "passthrough", args };
  }
```

`present_response` is not in `COURSE_TOOL_NAMES`, so binding returns `passthrough` before this branch. A single-referent rewrite stays in force.

Prompt addition, still free of course codes and Han: when `courseReferent` kind is `ordinal` and its `resultSetId` is a discussed-courses id, that code is the discussed course at that position. When kind is `multiple`, call each named code and the page code separately.

`useDiscussedCourses` calls `useAgent` and `useAgentContext({ description: DISCUSSED_COURSES_CONTEXT_DESCRIPTION, value: summarizeDiscussedCourses(agent?.messages ?? []) })`. Call it from `AssistantTools` next to `useCatalogResultsTool`. No new store. New chat already clears messages. Account switching already unmounts the provider.

- [ ] **Step 1: Write the failing tests**

`tests/assistant/discussed-courses.test.ts`:

- User message `CISC2001 vs CISC2003?`, two successful `get_course` results. `turns[0].order` is `["CISC2001", "CISC2003"]`. `active.order` matches. A prior turn's `MATH1001` is not in `order`.
- After a later `search_catalog`, `active` is null and `turns` still has the comparison.
- User message `Compare this with CISC2003.`, results for `CISC2001` then `CISC2003`. `order` is `["CISC2001", "CISC2003"]`.
- Empty messages stringify to `{ active: null, turns: [] }`.

`tests/assistant/course-referent.test.ts`:

- Existing "does not rewrite a comparison" stays passthrough for `CISC2001` and the page code. Add clarify for `{ code: "APAC2000" }`. Add passthrough for `present_response` with any args.
- `resolve("Tell me more about the first one", { discussed: { id: "d1", order: ["CISC2001", "CISC2003"], newerThanCatalog: true }, resultSets: [offered] })` equals ordinal `CISC2001`, `resultSetId: "d1"`.
- The same phrase with `newerThanCatalog: false` and `resultSets: [offered]` still resolves to the catalog's first visible course.
- `courseReferentFromRun` with the discussed-courses JSON and user text `the first one`, no catalog, returns `CISC2001`.

Prompt test: `ASSISTANT_PROMPT` contains `When kind is multiple, call each named code and the page code separately` and does not match a course code or Han.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/assistant/discussed-courses.test.ts tests/assistant/course-referent.test.ts tests/assistant/agent.test.ts`

Expected: FAIL. The new module and the new referent branch are absent.

- [ ] **Step 3: Implement context, referent, hook, and prompt line**

Implement `summarizeDiscussedCourses` from the Interfaces rules. Group messages into user turns. Read only same-turn `get_course` tool results through `parseCourseDetailResult`. Cap at two turns and three codes. If `JSON.stringify` exceeds `MAX_DISCUSSED_CONTEXT_CHARS`, drop the older turn.

In `bindCourseToolArgs`, keep the `ambiguous` clarify branch and the single-code rewrite branch. Insert the multiple-code allowlist before the `none` passthrough. Remove any leftover `none || multiple` combined passthrough.

Wire `useDiscussedCourses()` inside `AssistantTools`. Do not import a comparison hook.

Add the prompt sentences to the existing `courseReferent` paragraph. Do not renumber rules.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/discussed-courses.test.ts tests/assistant/course-referent.test.ts tests/assistant/agent.test.ts tests/assistant/catalog-result-sets.test.ts`

Expected: PASS. Existing ordinal tests that omit `discussed` still use the catalog.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/discussed-courses.ts lib/assistant/course-referent.ts lib/assistant/prompt.ts components/assistant/use-discussed-courses.tsx components/assistant/assistant-panel.tsx tests/assistant/discussed-courses.test.ts tests/assistant/course-referent.test.ts tests/assistant/agent.test.ts
git commit -m "$(cat <<'EOF'
feat(assistant): keep compared courses distinct across follow-up turns

EOF
)"
```

---

### Task 6: CopilotKit integration coverage

**Files:**
- Create: `tests/components/assistant-v2-2.integration.test.tsx`
- Modify: `tests/components/assistant-v2-1.integration.test.tsx` only to keep V2.1 search, filter, and ordinal coverage passing under text-first cards
- Test: both integration files

**Interfaces:**
- Consumes: the real `AssistantPanel`, `CopilotKitProvider`, `/api/copilotkit` route, and `executePresentResponse`. Scripted model pattern from `tests/components/assistant-v2-1.integration.test.tsx` (`MockLanguageModelV3`, `route.POST`, `mountAssistant`, `describeCall`).
- Produces: proof for same-step presentation, a later presentation step, omitted presentation, Markdown comparison without cards, distinct referents, and instructor text comparison. `toolNames` on a `ModelCall` is the tool calls already present in that prompt.

- [ ] **Step 1: Update the V2.1 scripted brain so preserved flows still pass**

In `tests/components/assistant-v2-1.integration.test.tsx`:

- For `Tell me more about MATH1002`, emit `get_course` and `present_response` `{ show: [{ component: "course_detail", course: "MATH1002" }] }` in the same step. Keep the assertion that article `MATH1002` appears.
- For `When is MATH1002 taught?`, keep `get_course` then `get_course_sections`. Do not emit `present_response`. Change the section assertion from `getByRole("article", { name: "Section 001" })` to `queryByRole("article", { name: "Section 001" })` null, and assert activity text `Read class times` plus the interpretation text the brain already returns.
- Leave search, Offered only, newest result set, and "the second course" ordinal tests unchanged.

- [ ] **Step 2: Write the V2.2 integration file**

Copy the V2.1 harness (`route` mock, auth mock, rate-limit mock, navigation mock, `mountAssistant`) into `tests/components/assistant-v2-2.integration.test.tsx`. Include `present_response` in the tool mock; its `execute` calls `executePresentResponse`. Do not add comparison components.

`streamFor` must allow `{ tools: { tool: string; input: Record<string, unknown> }[] }` and emit one `tool-call` chunk per entry, then `finishReason: { unified: "tool-calls" }`.

Brain, ordinary student language:

```ts
function v22Brain(call: ModelCall): Step {
  if (/Compare CISC2001 and CISC2003 slowly/i.test(call.lastUser)) {
    if (!call.lastTool) {
      return { tools: [{ tool: "get_course", input: { code: "CISC2001" } }, { tool: "get_course", input: { code: "CISC2003" } }] };
    }
    return { text: "CISC2001 is hardware; CISC2003 is programming." };
  }
  if (/What is CISC2001/i.test(call.lastUser) || /^CISC2001\?$/i.test(call.lastUser)) {
    return { tools: [{ tool: "get_course", input: { code: "CISC2001" } }] };
  }
  if (/Tell me more about CISC2001/i.test(call.lastUser) || /Show me the full details of CISC2001/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "present_response", input: { show: [{ component: "course_detail", course: "CISC2001" }] } },
      ],
    };
  }
  if (/CISC2001 vs CISC2003/i.test(call.lastUser) || /Compare CISC2001 and CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2003" } },
        { tool: "get_course", input: { code: "CISC2001" } },
      ],
    };
  }
  if (/Which professor is better for CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2003" } },
        { tool: "get_instructor", input: { name: "WONG SIU MING" } },
        { tool: "get_instructor", input: { name: "CHAN TAI MAN" } },
      ],
    };
  }
  if (/Find me some COMP electives/i.test(call.lastUser)) {
    return { tools: [{ tool: "search_catalog", input: { type: "course", query: "COMP" } }] };
  }
  if (/Show me the sections for CISC2001/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course_sections", input: { code: "CISC2001", instructor: "CHAN TAI MAN" } },
        { tool: "present_response", input: { show: [{ component: "course_sections", course: "CISC2001" }] } },
      ],
    };
  }
  if (/When is CISC2001 taught/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course_sections", input: { code: "CISC2001", instructor: "CHAN TAI MAN" } },
      ],
    };
  }
  if (/Tell me more about the second one/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC9999" } },
        { tool: "present_response", input: { show: [{ component: "course_detail", course: "CISC9999" }] } },
      ],
    };
  }
  if (/Just explain CISC2001 in one sentence/i.test(call.lastUser)) {
    return { tools: [{ tool: "get_course", input: { code: "CISC2001" } }] };
  }
  if (/Give me a table comparing CISC2001 and CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course", input: { code: "CISC2003" } },
      ],
    };
  }
  if (/Compare this with CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course", input: { code: "CISC2003" } },
      ],
    };
  }
  if (call.lastTool) return { text: "Here is the interpretation." };
  return { text: "ok" };
}
```

Fixtures: `CISC2001` description `Hardware fundamentals.`, instructor `CHAN TAI MAN` with `commentCount: 2`, `difficulty: 2`. `CISC2003` description `Programming and data structures.`, instructor `WONG SIU MING` with `commentCount: 80`, `difficulty: 5`. `get_instructor` keyed by exact normalized name.

Assertions after `typeAndSend`:

1. `What is CISC2001?` — `Read course` visible, no article `CISC2001`, interpretation text visible.
2. `CISC2001?` — same: useful text, no card required.
3. `Tell me more about CISC2001.` — article `CISC2001`, no second stacked article.
4. `Show me the full details of CISC2001.` — article `CISC2001`.
5. `CISC2001 vs CISC2003?` — two `Read course` rows, no articles named `CISC2001` or `CISC2003`, Markdown table or interpretation text visible.
6. `Which professor is better for CISC2003?` — `Read instructor` visible, no comparison region, text names both instructors and `80 reviews` or `2 reviews`.
7. `Find me some COMP electives.` — existing search list still mounts (`rich` search result or the compact catalog list).
8. `Show me the sections for CISC2001.` — section article `Section 001`.
9. `When is CISC2001 taught?` — `Read class times` visible, no section article.
10. Compare, then `Tell me more about the second one` — follow-up `referent` is `{ kind: "ordinal", courseCode: "CISC2003" }`, `get_course` output contains `CISC2003` and not `CISC9999`, detail article is `CISC2003`.
11. `nav.set("/course/CISC2001")`, then `Compare this with CISC2003.` — two tool outputs contain different codes, `referent.kind` is `multiple`, no course articles.
12. Slow compare: `modelCalls.length` is 3, first tool step has two `get_course` and no `present_response`, final text has no course articles.
13. `Just explain CISC2001 in one sentence.` — no course article.
14. `Give me a table comparing CISC2001 and CISC2003.` — no course articles; interpretation text visible.

Do not raise `maxSteps`. If one `doStream` with several `tool-call` chunks does not execute every tool, stop and record the chunk trace.

- [ ] **Step 3: Run the tests to verify they fail, then make the suite pass**

Run: `npx vitest run tests/components/assistant-v2-2.integration.test.tsx tests/components/assistant-v2-1.integration.test.tsx`

Expected first run: FAIL on missing file or outdated V2.1 card assertions. Fix only fixtures, `streamFor`, selectors, and the V2.1 brain updates above. Do not add comparison widgets. Do not remount unclaimed cards to make a test green.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/assistant-v2-2.integration.test.tsx tests/components/assistant-v2-1.integration.test.tsx tests/components/assistant-runtime.integration.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/components/assistant-v2-2.integration.test.tsx tests/components/assistant-v2-1.integration.test.tsx
git commit -m "$(cat <<'EOF'
test(assistant): cover text-first presentation through the real CopilotKit route

EOF
)"
```

---

### Task 7: DeepSeek presentation-selection measurement

**Files:**
- Create: `evals/assistant/presentation-cases.ts`
- Create: `evals/assistant/presentation-grade.ts`
- Create: `evals/assistant/presentation.eval.ts`
- Create: `tests/assistant/eval-presentation.test.ts`
- Test: `tests/assistant/eval-presentation.test.ts`

**Interfaces:**
- Consumes: `runCase` from `evals/assistant/harness.ts` and the fictional catalog already used by `navigation.eval.ts`. Does not change `grade.ts` or the navigation suite fingerprint.
- Produces: an opt-in live measurement. `npm test` runs only the grader unit test. The live command does nothing unless `ASSISTANT_EVAL=1`.

Cases, English only, using catalog codes that already exist (`CISC3014`, `CISC2001`):

| Id | Student text | Required lookups | Accepted presentation |
| --- | --- | --- | --- |
| `explain` | What is CISC3014? | `get_course` CISC3014 | omit / empty `show` |
| `short` | CISC3014? | `get_course` CISC3014 | omit / empty `show` |
| `inspect` | Tell me more about CISC3014. | `get_course` CISC3014 | `course_detail` CISC3014 |
| `details` | Show me the full details of CISC3014. | `get_course` CISC3014 | `course_detail` CISC3014 |
| `compare` | CISC2001 vs CISC3014? | `get_course` for both | omit / empty `show` |
| `sections` | Show me the sections for CISC3014. | `get_course_sections` | `course_sections` CISC3014 |
| `when` | When is CISC3014 taught? | sections lookup | omit / empty `show` |
| `sentence` | Just explain CISC3014 in one sentence. | `get_course` CISC3014 | omit / empty `show` |
| `table` | Give me a table comparing CISC2001 and CISC3014. | `get_course` for both | omit / empty `show` |

`gradePresentation(trace)` reads `trace.toolCalls` in order. The last accepted `present_response` is the selection. `expected: "omit"` hits when there is no accepted call or `show` is `[]`. `expected: "course_detail"` / `"course_sections"` hits when that component and course are in `show` (order-insensitive). A rejected-only call is omit. Return `{ id, selection, expected, hit, omitted }`. `summarizePresentation` returns `{ cases, hits, omitted, hitRate }`.

The unit test feeds: an omit hit, an inspect hit, an explain miss that selected `course_detail`, and a rejected call followed by an accepted inspect hit. `summarizePresentation` of those four has `hitRate` `0.75` and `omitted` `1`.

`presentation.eval.ts` follows `navigation.eval.ts`: mock the five MCP data functions with the eval catalog, call `runCase` only when `ASSISTANT_EVAL=1`, write `.eval-results/assistant/presentation-<label>.json`. Repeat each case `ASSISTANT_EVAL_REPEATS` times, default 1. Do not add these cases to `SUITES`.

- [ ] **Step 1: Write the failing grader test**

Create `tests/assistant/eval-presentation.test.ts` with the four traces above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/assistant/eval-presentation.test.ts`

Expected: FAIL. The grader module does not exist.

- [ ] **Step 3: Implement the grader and the opt-in eval**

Implement `presentation-grade.ts`, `presentation-cases.ts`, and `presentation.eval.ts` as specified. `describe.skipIf(process.env.ASSISTANT_EVAL !== "1")` keeps `npm test` from calling DeepSeek. `npm test` does not include `evals/**/*.eval.ts`.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/assistant/eval-presentation.test.ts`

Expected: PASS. Do not run the live eval in this task.

- [ ] **Step 5: Commit**

```bash
git add evals/assistant/presentation-cases.ts evals/assistant/presentation-grade.ts evals/assistant/presentation.eval.ts tests/assistant/eval-presentation.test.ts
git commit -m "$(cat <<'EOF'
test(assistant): grade live presentation choices without calling the model in CI

EOF
)"
```

---

### Task 8: Gates and the verification note

**Files:**
- Create: `docs/superpowers/verification/2026-10-24-assistant-v2-2.md` (replace the rejected-widget writeup)
- Test: the commands below

**Interfaces:**
- Consumes: the finished tasks.
- Produces: a verification note filled from command output. Unrun browser scenarios stay `unverified`.

- [ ] **Step 1: Run the gates**

Run, in this order:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Expected: each command exits 0. Record file counts and test counts from the Vitest summary. Record the known CopilotKit `channel-manager` warning if the build prints it, and record that the build still exited 0.

- [ ] **Step 2: Live presentation measurement**

When `AI_API_KEY` is available, run:

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=v22 ASSISTANT_EVAL_REPEATS=3 npm run eval:assistant -- evals/assistant/presentation.eval.ts
```

Record `hits`, `omitted`, `cases`, and `hitRate` from the result JSON. This measures whether DeepSeek omits cards for explanations/comparisons and requests them for inspection. A low hit rate does not by itself fail the UI: omitted presentation still yields a text answer.

If `AI_API_KEY` is absent, write `unverified` and do not invent a rate. The eval mocks the catalog the way `navigation.eval.ts` does.

- [ ] **Step 3: Browser check**

Start the existing dev server only if one is already the project's server. Open the assistant sidebar only when a Clerk session is already signed in. Do not sign in. Do not send a message that calls the paid model.

If there is no authenticated session, write each scenario as `unverified` and say why. Scenarios: `What is CISC2001?` (no card); `Tell me more about CISC2001.` (card); `CISC2001 vs CISC2003?` (Markdown, no stacked cards); `Which professor is better for CISC2003?` (prose/Markdown, no new widget); `Show me the sections for CISC2001.` (section cards); `When is CISC2001 taught?` (short answer); follow up `the second one`; catalog search + Offered only; Agent Activity on a text-first turn.

If a session exists, exercise those flows and write what you clicked and what appeared. A single screenshot is not the verification.

- [ ] **Step 4: Write the verification note**

Create `docs/superpowers/verification/2026-10-24-assistant-v2-2.md` with:

1. Features delivered — text-first default, opt-in course/section cards, Markdown comparisons, recommendation prompt, discussed-course follow-ups.
2. Architecture — `present_response.show` in the same user turn; omitted/invalid/empty show is text-first; no comparison widgets.
3. Files changed — `git diff --stat` against `d1bf445`.
4. Academic correctness — scales from Task 4; review counts; no review bodies in context.
5. Context — `kind: "multiple"` allowlist; "the first one" uses discussed courses only when newer than the catalog.
6. Testing — the four commands, exit codes, Vitest counts, live `hitRate` or `unverified`.
7. Browser — what was actually opened, or `unverified`.
8. Limitations — omitted presentation hides course/section cards; DeepSeek may still request a card for an explanation; `ASSISTANT_MAX_STEPS` is still 5; authenticated browser gaps stay listed.
9. V2.3 — a later timetable preview can be another closed `show` component pointing at validated plan data. Do not start that work.

Do not mark a requirement done when its test or browser check did not run. Do not claim the rejected comparison-widget design shipped.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/verification/2026-10-24-assistant-v2-2.md
git commit -m "$(cat <<'EOF'
docs(assistant): record V2.2 text-first presentation verification

EOF
)"
```

---

## Spec coverage

- Simple explanation, short `CISC2001?`, inspect, explicit details: Tasks 2, 3, 6, 7.
- Natural course comparison as Markdown, no stacked cards, no comparison widget: Tasks 2, 3, 4, 6.
- Instructor comparison as Markdown/prose with real scales and review counts: Tasks 4 and 6.
- Catalog discovery stays interactive: Tasks 1 and 6.
- Section cards when asked, short scheduling answers without oversized UI: Tasks 1, 3, 6.
- Contextual follow-up and current-page plus explicit entity: Task 5 and 6.
- Explicit formatting preference: Task 6 cases 13–14 and Task 7 `sentence` / `table`.
- Missing / invalid / duplicate / conflicting presentation: Task 1 planner tests and Task 6 omitted-presentation case.
- Multi-step presentation and no extra LLM for layout: Tasks 2 and 6.
- Agent Activity shows real lookups and hides `present_response`: Tasks 1 and 3.
- V2.1 referent binding, filtered ordinals, search, Offered only: Task 5 plus Task 6 V2.1 file.
- Security: no MCP tool, no timetable write, internal path builders, reviews kept out of context.
- Browser honesty and live DeepSeek measurement: Task 8. Offline grader: Task 7.

## Known limits to leave in the verification note

- If the model forgets `present_response` on "tell me more" or "show details", the student gets a text answer and activity, not a card. They can ask again.
- If the model wrongly requests a card for "What is CISC2001?", a card will appear. The live eval measures that rate. There is no client-side keyword override.
- "Compare the first and the second" in a catalog list stays the V2.1 ambiguous ask. This plan binds a single ordinal to discussed courses, not two ordinals at once.
- `get_course_reviews` is not fetched for a comparison. Aggregate scores on the course and instructor payloads are the evidence.
- Attendance remains in the scale list because it is in the schema. The submit control is hidden.
- `ASSISTANT_MAX_STEPS` is still 5. A later presentation step consumes one step.
