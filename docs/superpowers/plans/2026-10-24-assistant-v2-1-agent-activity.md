# V2.1 Agent Activity UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one compact activity row for each logical tool call, paired with the existing rich academic card when that tool has one, and make the row's status match transport errors, domain errors, empty successes, and interrupted calls.

**Architecture:** Option A-lite. `classifyToolContent` reuses the existing rich-result parsers and the shared tool-failure envelope. `ToolRow` becomes the only activity presentation. Rich calls stay out of the turn-level `ToolTrace` and render that same `ToolRow` immediately before their rich block. Non-rich calls stay in `ToolTrace` only. Results stay paired by tool-call id. Duplicate ids render once, using the deduped arguments.

**Tech Stack:** Next.js, React, TypeScript, CopilotKit v2 message types, Vitest, Testing Library, existing Zod tool schemas.

## Global Constraints

- Option A-lite: pair a compact activity row with each rich result. Do not build a timeline, a "Completed N actions" summary, or a second status component.
- Each logical tool call produces at most one visible activity entry. A rich call must not appear in both `ToolTrace` and a paired row.
- Preserve tool-call order. Pair results by `toolCallId`. Do not redesign the CopilotKit message pipeline.
- Do not modify academic MCP implementations, server tool contracts, tool authorization, CopilotKit runtime configuration, DeepSeek model selection, catalog filtering logic, context-resolution logic, or timetable business logic.
- Do not enable DeepSeek thinking mode. Do not render raw reasoning messages. Leave `AI_THINKING` unchanged. `ThinkingRow` stays operational waiting feedback.
- A result body of `{ "error": "not_found" }`, `{ "error": "invalid_request" }`, or `{ "error": "temporarily_unavailable" }` is a failure, not a green success. `{ "status": "unknown_result_set" }` and `{ "status": "invalid_request" }` from `filter_catalog_results` are failures. `{ "found": false, "error": "request_failed" }` from `check_plan_conflicts` is a failure.
- A schema-valid empty academic payload is success. Examples: catalog `results: []`, sections `sections: []`, reviews `reviews: []`, an applied filter with `shownCount: 0`.
- No result and the turn is active: running. No result and the turn is inactive: pending, label `Not completed`. A later turn must not restart an older call's spinner.
- `result.error` (transport) is a failure even when the body looks successful.
- Default labels stay student-facing: `Searching courses…` / `Searched courses`, `Reading course…` / `Read course`, `Reading class times…` / `Read class times`, `Filtering results…` / `Filtered results`, `Reading instructor…` / `Read instructor`. Failure labels: `Couldn't search courses`, `Couldn't read course`, `Couldn't read class times`, `Couldn't filter results`, `Couldn't read instructor`, `Couldn't read reviews`, `Couldn't check timetable`, otherwise `Lookup failed`.
- Do not show raw tool JSON in the default UI. Optional detail is one safe string from `query`, `code`, `courseCode`, `course`, `name`, or `instructor`, in that order.
- Reuse `ToolRow` icons, type size, and status colors. No new decorative background. Spinner class is `motion-safe:animate-spin`.
- Do not remove the rich renderers' existing loading lines (`Searching the catalog…`, `Loading course details…`, `Loading class sections…`, `Filtering results…`). `agentBusy()` in the V2.1 integration test waits on those exact strings.
- Do not commit, push, merge, or deploy. Do not stage or edit `docs/superpowers/verification/2026-10-24-assistant-v2-1.md`.
- Work on the current branch `feat/global-assistant-v2`. Do not switch branches.

---

## File structure

- `lib/assistant/tool-result.ts` — add `readToolFailure`, the single failure-envelope reader. Existing `parseToolResult` stays the success-schema parser.
- `lib/assistant/tool-activity.ts` — `classifyToolContent` and `toolActivityStatus`. One place that maps a tool name and a result onto success, domain error, or malformed.
- `components/ai-elements/tool.tsx` — `ToolRow` uses `toolActivityStatus`, exports itself, and remains the only row renderer. `ToolTrace` still lists non-rich calls.
- `components/assistant/assistant-chat-view.tsx` — rich calls render `ToolRow` then the existing renderer, once per deduped id.
- `lib/assistant/rich-tools.ts` — comment only. The name set does not change.
- Tests listed on each task. No new production UI component.

---

### Task 1: Classify tool results

**Files:**
- Modify: `lib/assistant/tool-result.ts`
- Create: `lib/assistant/tool-activity.ts`
- Test: `tests/assistant/tool-activity.test.ts`

**Interfaces:**
- Consumes: `parseToolResult` and `toolFailureSchema` in `lib/assistant/tool-result.ts`; `parseSearchCatalogResult`; `parseCourseDetailResult`; `parseCourseSectionsResult`; `parseFilterCatalogResult`; `getInstructorOutputSchema`; `getCourseReviewsOutputSchema`.
- Produces:
  - `readToolFailure(content: string): ToolResultFailure | "none" | "malformed"`
  - `classifyToolContent(toolName: string, content: string): "success" | "domain_error" | "malformed"`
  - `toolActivityStatus(toolName: string, result: Pick<ToolMessage, "content" | "error"> | undefined, turnActive: boolean): "pending" | "running" | "done" | "error"`

- [ ] **Step 1: Write the failing test**

Create `tests/assistant/tool-activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyToolContent, toolActivityStatus } from "@/lib/assistant/tool-activity";
import { SITE_URL } from "@/lib/site";

const emptyCatalog = JSON.stringify({
  type: "course",
  page: 1,
  hasMore: false,
  totalCount: 0,
  results: [],
});

const emptySections = JSON.stringify({
  courseCode: "APAC1000",
  instructor: "CHAN TAI MAN",
  courseUrl: `${SITE_URL}/course/APAC1000`,
  sections: [],
});

const emptyInstructor = JSON.stringify({
  name: "CHAN TAI MAN",
  page: 1,
  hasMore: false,
  totalCount: 0,
  courses: [],
});

const emptyReviews = JSON.stringify({
  courseCode: "ACCT1000",
  instructor: "CHAN TAI MAN",
  page: 1,
  hasMore: false,
  url: `${SITE_URL}/reviews/ACCT1000/CHAN%20TAI%20MAN`,
  reviews: [],
});

const appliedEmptyFilter = JSON.stringify({
  status: "applied",
  resultSetId: "call-1",
  filter: "offered",
  shownCount: 0,
  loadedCount: 4,
  totalCount: 4,
  hasMore: false,
  shownCourseCodes: [],
  scope: "loaded_results_only",
});

describe("classifyToolContent", () => {
  it.each([
    ["search_catalog", '{"error":"not_found"}'],
    ["get_course", '{"error":"not_found"}'],
    ["get_course_sections", '{"error":"not_found"}'],
    ["get_instructor", '{"error":"not_found"}'],
    ["get_course_reviews", '{"error":"not_found"}'],
    ["search_catalog", '{"error":"temporarily_unavailable"}'],
    ["get_course", '{"error":"invalid_request"}'],
    ["filter_catalog_results", '{"status":"unknown_result_set"}'],
    ["filter_catalog_results", '{"status":"invalid_request"}'],
    ["check_plan_conflicts", '{"found":false,"error":"request_failed"}'],
  ] as const)("classifies %s domain failure %s", (name, content) => {
    expect(classifyToolContent(name, content)).toBe("domain_error");
  });

  it.each([
    ["search_catalog", emptyCatalog],
    ["get_course_sections", emptySections],
    ["get_instructor", emptyInstructor],
    ["get_course_reviews", emptyReviews],
    ["filter_catalog_results", appliedEmptyFilter],
    ["check_plan_conflicts", '{"found":false}'],
    ["check_plan_conflicts", '{"found":true,"conflicts":[]}'],
    ["unknown_tool", '{"ok":true}'],
  ] as const)("classifies %s success %s", (name, content) => {
    expect(classifyToolContent(name, content)).toBe("success");
  });

  it.each([
    ["search_catalog", "{not json"],
    ["get_course", '{"unexpected":1}'],
    ["filter_catalog_results", "{}"],
    ["check_plan_conflicts", '{"found":false,"error":"request_failed","extra":1}'],
    ["get_instructor", ""],
  ] as const)("classifies %s malformed %s", (name, content) => {
    expect(classifyToolContent(name, content)).toBe("malformed");
  });
});

describe("toolActivityStatus", () => {
  it("is pending when the turn is idle and no result arrived", () => {
    expect(toolActivityStatus("search_catalog", undefined, false)).toBe("pending");
  });

  it("is running when this turn is active and no result arrived", () => {
    expect(toolActivityStatus("search_catalog", undefined, true)).toBe("running");
  });

  it("stays done for a finished call even if the agent is still running", () => {
    expect(
      toolActivityStatus("search_catalog", { content: emptyCatalog }, true),
    ).toBe("done");
  });

  it("is an error for a transport failure even when the body is a valid success", () => {
    expect(
      toolActivityStatus(
        "search_catalog",
        { content: emptyCatalog, error: "timeout" },
        false,
      ),
    ).toBe("error");
  });

  it("is an error for a domain failure and for malformed JSON", () => {
    expect(
      toolActivityStatus("get_course", { content: '{"error":"not_found"}' }, false),
    ).toBe("error");
    expect(
      toolActivityStatus("search_catalog", { content: "{not json" }, false),
    ).toBe("error");
  });

  it("is an error when the tool content is not a string", () => {
    expect(
      toolActivityStatus("search_catalog", { content: [] }, false),
    ).toBe("error");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/assistant/tool-activity.test.ts`

Expected: FAIL because `@/lib/assistant/tool-activity` does not exist.

- [ ] **Step 3: Write the implementation**

Append this export to `lib/assistant/tool-result.ts`, after `parseToolResult`:

```ts
/** Classifies only the shared `{ error }` envelope. Other JSON is `"none"`. */
export function readToolFailure(content: string): ToolResultFailure | "none" | "malformed" {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return "malformed";
  }
  const failure = toolFailureSchema.safeParse(parsed);
  if (failure.success) return failure.data.error;
  return "none";
}
```

Create `lib/assistant/tool-activity.ts`:

```ts
import type { ToolMessage } from "@copilotkit/react-core/v2";
import { z } from "zod/v4";

import {
  FILTER_CATALOG_RESULTS_TOOL_NAME,
  parseFilterCatalogResult,
} from "@/lib/assistant/catalog-result-sets";
import {
  GET_COURSE_TOOL_NAME,
  parseCourseDetailResult,
} from "@/lib/assistant/course-detail-ui";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";
import {
  parseSearchCatalogResult,
  SEARCH_CATALOG_TOOL_NAME,
} from "@/lib/assistant/search-catalog-ui";
import { parseToolResult, readToolFailure, type ToolResultFailure } from "@/lib/assistant/tool-result";
import { getCourseReviewsOutputSchema, getInstructorOutputSchema } from "@/lib/mcp/schemas";

export type ToolContentClass = "success" | "domain_error" | "malformed";
export type ToolActivityStatus = "pending" | "running" | "done" | "error";

const planConflictFailureSchema = z
  .object({
    found: z.literal(false),
    error: z.literal("request_failed"),
  })
  .strict();

const planConflictSuccessSchema = z.union([
  z.object({ found: z.literal(false) }).strict(),
  z
    .object({
      found: z.literal(true),
      conflicts: z.array(z.object({ with: z.string(), day: z.string() }).strict()),
    })
    .strict(),
]);

function fromParser(reason: ToolResultFailure): ToolContentClass {
  return reason === "malformed" ? "malformed" : "domain_error";
}

function classifyPlanConflict(content: string): ToolContentClass {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return "malformed";
  }
  if (planConflictFailureSchema.safeParse(parsed).success) return "domain_error";
  if (planConflictSuccessSchema.safeParse(parsed).success) return "success";
  const envelope = readToolFailure(content);
  if (envelope === "malformed") return "malformed";
  if (envelope === "none") return "malformed";
  return "domain_error";
}

function classifyUnknown(content: string): ToolContentClass {
  const envelope = readToolFailure(content);
  if (envelope === "malformed") return "malformed";
  if (envelope === "none") return "success";
  return "domain_error";
}

export function classifyToolContent(toolName: string, content: string): ToolContentClass {
  switch (toolName) {
    case SEARCH_CATALOG_TOOL_NAME: {
      const view = parseSearchCatalogResult(content);
      return view.kind === "failure" ? fromParser(view.reason) : "success";
    }
    case GET_COURSE_TOOL_NAME: {
      const view = parseCourseDetailResult(content);
      return view.kind === "failure" ? fromParser(view.reason) : "success";
    }
    case GET_COURSE_SECTIONS_TOOL_NAME: {
      const view = parseCourseSectionsResult(content);
      return view.kind === "failure" ? fromParser(view.reason) : "success";
    }
    case FILTER_CATALOG_RESULTS_TOOL_NAME: {
      const parsed = parseFilterCatalogResult(content);
      if (!parsed) return "malformed";
      return parsed.status === "applied" ? "success" : "domain_error";
    }
    case "get_instructor": {
      const result = parseToolResult(content, getInstructorOutputSchema);
      return result.ok ? "success" : fromParser(result.reason);
    }
    case "get_course_reviews": {
      const result = parseToolResult(content, getCourseReviewsOutputSchema);
      return result.ok ? "success" : fromParser(result.reason);
    }
    case "check_plan_conflicts":
      return classifyPlanConflict(content);
    default:
      return classifyUnknown(content);
  }
}

export function toolActivityStatus(
  toolName: string,
  result: Pick<ToolMessage, "content" | "error"> | undefined,
  turnActive: boolean,
): ToolActivityStatus {
  if (!result) return turnActive ? "running" : "pending";
  if (result.error) return "error";
  if (typeof result.content !== "string") return "error";
  return classifyToolContent(toolName, result.content) === "success" ? "done" : "error";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/assistant/tool-activity.test.ts`

Expected: PASS. Every `it` and `it.each` row in the file passes.

- [ ] **Step 5: Leave the work uncommitted**

Do not commit. `git status --short` may show this task's files plus the pre-existing verification doc. Do not stage the verification doc.

---

### Task 2: Make ToolRow report that status

**Files:**
- Modify: `components/ai-elements/tool.tsx`
- Test: `tests/ai-elements/tool-status.test.tsx`
- Test: `tests/ai-elements/tool-dedupe.test.ts` (must keep passing; do not change it)

**Interfaces:**
- Consumes: `toolActivityStatus` from Task 1.
- Produces: exported `ToolRow({ call, result, isRunning, announce })`. `isRunning` means "this turn is the active agent turn", not "every call in the turn is still running". `announce` adds `role="status"` for a row that is not already inside `ToolTrace`'s live region. The row always sets `data-status` to `pending`, `running`, `done`, or `error`.

- [ ] **Step 1: Write the failing test**

Create `tests/ai-elements/tool-status.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolRow, ToolTrace } from "@/components/ai-elements/tool";
import type { ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

function call(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: "call-1",
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function result(content: string, error?: string): ToolMessage {
  return { id: "t1", role: "tool", toolCallId: "call-1", content, ...(error ? { error } : {}) };
}

const emptyCatalog = JSON.stringify({
  type: "course",
  page: 1,
  hasMore: false,
  totalCount: 0,
  results: [],
});

afterEach(() => cleanup());

function row(props: {
  name?: string;
  args?: Record<string, unknown>;
  content?: string;
  error?: string;
  isRunning?: boolean;
  announce?: boolean;
  omitResult?: boolean;
}) {
  render(
    <div className="w-[240px]">
      <ToolRow
        call={call(props.name ?? "search_catalog", props.args ?? { query: "MATH" })}
        result={props.omitResult ? undefined : result(props.content ?? emptyCatalog, props.error)}
        isRunning={props.isRunning ?? false}
        announce={props.announce ?? true}
      />
    </div>,
  );
}

describe("ToolRow status", () => {
  it("shows a pending call as not completed", () => {
    row({ omitResult: true, isRunning: false });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("pending");
    expect(status.textContent).toContain("Not completed");
    expect(status.querySelector("svg")?.getAttribute("class") ?? "").not.toContain("motion-safe:animate-spin");
  });

  it("shows a running call with the action and query", () => {
    row({ omitResult: true, isRunning: true });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("running");
    expect(status.textContent).toContain("Searching courses…");
    expect(status.textContent).toContain("MATH");
    expect(status.querySelector("svg")?.getAttribute("class")).toContain("motion-safe:animate-spin");
  });

  it("shows a successful empty catalog search as completed", () => {
    row({ content: emptyCatalog });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("done");
    expect(status.textContent).toContain("Searched courses");
    expect(status.textContent).toContain("· MATH");
    expect(status.textContent).not.toContain("Couldn't search courses");
  });

  it("shows a transport failure instead of success", () => {
    row({ content: emptyCatalog, error: "timeout" });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Couldn't search courses");
    expect(status.textContent).not.toContain("Searched courses");
  });

  it("shows a domain not_found error instead of success", () => {
    row({ name: "get_course", args: { code: "APAC1000" }, content: '{"error":"not_found"}' });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Couldn't read course");
    expect(status.textContent).toContain("APAC1000");
    expect(status.className).toContain("overflow-hidden");
  });

  it("shows a temporary domain failure instead of success", () => {
    row({ content: '{"error":"temporarily_unavailable"}' });
    expect(screen.getByRole("status").getAttribute("data-status")).toBe("error");
    expect(screen.getByRole("status").textContent).toContain("Couldn't search courses");
  });

  it("shows malformed JSON as a failure", () => {
    row({ content: "{not json" });
    expect(screen.getByRole("status").getAttribute("data-status")).toBe("error");
  });

  it("shows an applied filter with zero rows as completed", () => {
    row({
      name: "filter_catalog_results",
      args: { resultSetId: "call-1", filter: "offered" },
      content: JSON.stringify({
        status: "applied",
        resultSetId: "call-1",
        filter: "offered",
        shownCount: 0,
        loadedCount: 4,
        totalCount: 4,
        hasMore: false,
        shownCourseCodes: [],
        scope: "loaded_results_only",
      }),
    });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("done");
    expect(status.textContent).toContain("Filtered results");
    expect(status.textContent).not.toContain("call-1");
  });

  it("shows an unknown filter target as a failure", () => {
    row({
      name: "filter_catalog_results",
      args: { resultSetId: "missing", filter: "offered" },
      content: '{"status":"unknown_result_set"}',
    });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Couldn't filter results");
    expect(status.textContent).not.toContain("Filtered results");
  });

  it("does not restart a completed row when isRunning is still true", () => {
    row({ content: emptyCatalog, isRunning: true });
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-status")).toBe("done");
    expect(status.querySelector("svg")?.getAttribute("class") ?? "").not.toContain("motion-safe:animate-spin");
  });

  it("truncates a long query inside the row", () => {
    const query = "M".repeat(180);
    row({ args: { query } });
    const status = screen.getByRole("status");
    const detail = status.querySelector(".truncate");
    expect(status.className).toContain("min-w-0");
    expect(status.className).toContain("overflow-hidden");
    expect(detail?.className).toContain("truncate");
    expect(detail?.textContent).toContain(query);
  });

  it("omits role=status when announce is false, and ToolTrace still announces the group", () => {
    const calls = [call("get_instructor", { name: "CHAN TAI MAN" })];
    const results = new Map<string, ToolMessage>([
      ["call-1", result(JSON.stringify({
        name: "CHAN TAI MAN",
        page: 1,
        hasMore: false,
        totalCount: 0,
        courses: [],
      }))],
    ]);
    render(<ToolTrace calls={calls} results={results} isRunning={false} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Read instructor")).toBeTruthy();
    expect(screen.getByText(/CHAN TAI MAN/)).toBeTruthy();
    expect(document.querySelector("[aria-live='polite']")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai-elements/tool-status.test.tsx`

Expected: FAIL because `ToolRow` is not exported, or because the status text and `data-status` do not exist yet.

- [ ] **Step 3: Update `components/ai-elements/tool.tsx`**

Add this import:

```ts
import { toolActivityStatus, type ToolActivityStatus } from "@/lib/assistant/tool-activity";
```

Replace `ToolStatus`, `statusOf`, and `STATUS_ICON`'s key type with `ToolActivityStatus`. Delete `statusOf`.

Extend `toolDetail`'s key list to:

```ts
for (const key of ["query", "code", "courseCode", "course", "name", "instructor"]) {
```

Add the failure labels next to `TOOL_LABELS`:

```ts
const TOOL_FAILED: Record<string, string> = {
  search_catalog: "Couldn't search courses",
  get_course: "Couldn't read course",
  get_instructor: "Couldn't read instructor",
  get_course_reviews: "Couldn't read reviews",
  get_course_sections: "Couldn't read class times",
  check_plan_conflicts: "Couldn't check timetable",
  filter_catalog_results: "Couldn't filter results",
};

function failedLabel(name: string) {
  return TOOL_FAILED[name] ?? "Lookup failed";
}
```

Replace `ToolRow` with an exported function of this shape:

```ts
export function ToolRow({
  call,
  result,
  isRunning,
  announce = false,
}: {
  call: ToolCall;
  result: ToolMessage | undefined;
  isRunning: boolean;
  announce?: boolean;
}) {
  const status = toolActivityStatus(call.function.name, result, isRunning);
  const Icon = STATUS_ICON[status];
  const label = toolLabel(call.function.name);
  const detail = toolDetail(call);
  const text =
    status === "running"
      ? `${label.running}…`
      : status === "error"
        ? failedLabel(call.function.name)
        : status === "pending"
          ? "Not completed"
          : label.done;

  return (
    <div
      role={announce ? "status" : undefined}
      data-status={status}
      className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden text-xs"
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center",
          status === "error"
            ? "text-destructive-strong"
            : status === "running"
              ? "text-brand"
              : "text-muted-foreground",
        )}
      >
        <Icon
          className={cn("h-3.5 w-3.5", status === "running" && "motion-safe:animate-spin")}
          aria-hidden
        />
      </span>
      <span
        className={cn(
          "shrink-0 font-medium",
          status === "error" ? "text-destructive-strong" : "text-foreground",
        )}
      >
        {text}
      </span>
      {detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">· {detail}</span>
      ) : null}
    </div>
  );
}
```

Keep `dedupeCalls` and `ToolTrace` behavior. `ToolTrace` continues to pass `isRunning` through and does not set `announce`, so its existing `aria-live="polite"` wrapper remains the live region.

`STATUS_ICON` must use `ToolActivityStatus`, whose `"pending"` member replaces the old local `"pending"` value. The icon map stays Clock / Loader2 / Check / AlertCircle.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ai-elements/tool-status.test.tsx tests/ai-elements/tool-dedupe.test.ts tests/components/assistant-chat-view.test.tsx`

Expected: `tool-status` and `tool-dedupe` PASS. `assistant-chat-view` may still fail the rich-tool assertions that expect activity labels to be absent. Those failures belong to Task 3. Do not "fix" them by hiding the row. If a non-rich trace test fails because the detail now includes `· `, update only the assertion that looked for the bare detail string, and keep the label assertion.

- [ ] **Step 5: Leave the work uncommitted**

Do not commit. Do not touch the verification doc.

---

### Task 3: Pair one activity row with each rich result

**Files:**
- Modify: `components/assistant/assistant-chat-view.tsx`
- Modify: `lib/assistant/rich-tools.ts` (comment only)
- Modify: `tests/components/assistant-chat-view.test.tsx`

**Interfaces:**
- Consumes: exported `ToolRow` from Task 2. `isRichCall` stays: a named rich tool is rich when it has a result or the current turn is active. An interrupted rich call with no result on an idle turn stays in `ToolTrace` and shows `Not completed`.
- Produces: for every deduped rich call, one `ToolRow` with `announce` immediately before `toolRenderer.render`, in call order. The same id is rendered once. The row uses the deduped call so a later copy with real arguments supplies the detail.

- [ ] **Step 1: Update the chat-view tests before changing the view**

In `tests/components/assistant-chat-view.test.tsx`, replace the obsolete "rich UI hides the trace" assertions. Do not delete the tests.

1. `"renders a rich search_catalog block instead of the trace row"` becomes a test named `"renders one search activity row and the rich block"`. Assertions:

```tsx
expect(screen.getByTestId("rich-call-1").textContent).toBe("catalog-json");
expect(screen.getAllByText("Searched courses")).toHaveLength(1);
expect(screen.getByRole("status").textContent).toContain("ACCT");
expect(screen.getAllByRole("status")).toHaveLength(1);
```

2. `"shows loading in the rich block while running without a result"` keeps the rich loading assertion and replaces the absent-label assertion with:

```tsx
expect(screen.getByTestId("rich-call-1").textContent).toBe("loading");
expect(screen.getAllByText("Searching courses…")).toHaveLength(1);
expect(screen.queryByText("Searched courses")).toBeNull();
expect(screen.getAllByRole("status").map((node) => node.textContent)).toEqual([
  expect.stringContaining("Searching courses…"),
]);
```

`ThinkingRow` also uses `role="status"`. This message's last assistant part has a tool call and no text, so `awaitingReply` is false and `Thinking…` must stay absent. Assert `screen.queryByText("Thinking…")` is null in this test.

3. `"renders two rich blocks for identical args with different ids and results"` replaces the absent-label assertion with:

```tsx
expect(screen.getAllByText("Searched courses")).toHaveLength(2);
expect(screen.getAllByRole("status")).toHaveLength(2);
```

4. `"dedupes a replayed empty-arg search_catalog call"` replaces the absent-label assertion with:

```tsx
expect(screen.getAllByTestId(/^rich-call-/)).toHaveLength(1);
expect(screen.getAllByText("Searched courses")).toHaveLength(1);
expect(screen.queryByText("Not completed")).toBeNull();
```

5. `"keeps completed rich results visible while a new turn runs"` adds:

```tsx
expect(screen.getAllByText("Searched courses")).toHaveLength(1);
expect(screen.queryByText("Searching courses…")).toBeNull();
expect(screen.getByText("Thinking…")).toBeTruthy();
```

6. Keep `"shows Not completed in trace when interrupted without a result"` and `"does not restart loading on an incomplete call from a previous turn"` as they are, except assert there is still exactly one `Not completed` and no `Searching courses…` on the old call.

7. Append this describe block inside `describe("toolRenderer")`:

```tsx
it("renders one activity row and a rich block for get_course", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "Tell me about APAC1000." },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-course",
            type: "function",
            function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "call-course", content: "course-json" },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getAllByText("Read course")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toContain("APAC1000");
  expect(screen.getByTestId("rich-call-course").textContent).toBe("course-json");
});

it("renders one activity row and a rich block for get_course_sections", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "When is APAC1000 taught?" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-sections",
            type: "function",
            function: {
              name: "get_course_sections",
              arguments: '{"code":"APAC1000","instructor":"CHAN TAI MAN"}',
            },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "call-sections", content: "sections-json" },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getAllByText("Read class times")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toContain("APAC1000");
  expect(screen.getByTestId("rich-call-sections").textContent).toBe("sections-json");
});

it("renders one activity row and the filter block", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "Show only those offered." },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-filter",
            type: "function",
            function: {
              name: "filter_catalog_results",
              arguments: '{"resultSetId":"call-1","filter":"offered"}',
            },
          },
        ],
      },
      {
        id: "t1",
        role: "tool",
        toolCallId: "call-filter",
        content: '{"status":"applied","resultSetId":"call-1","filter":"offered","shownCount":2,"loadedCount":10,"totalCount":10,"hasMore":false,"shownCourseCodes":["APAC1000","APAC2000"],"scope":"loaded_results_only"}',
      },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getAllByText("Filtered results")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).not.toContain("call-1");
  expect(screen.getByTestId("rich-call-filter").textContent).toContain("applied");
});

it("marks a rich domain error as failed and still renders the rich block once", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "APAC1000" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "call-1", content: '{"error":"not_found"}' },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  const status = screen.getByRole("status");
  expect(status.getAttribute("data-status")).toBe("error");
  expect(status.textContent).toContain("Couldn't read course");
  expect(screen.queryByText("Read course")).toBeNull();
  expect(screen.getAllByTestId("rich-call-1")).toHaveLength(1);
});

it("pairs get_course and get_course_sections in call order when results arrive reversed", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "details and times" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-course",
            type: "function",
            function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
          },
          {
            id: "call-sections",
            type: "function",
            function: {
              name: "get_course_sections",
              arguments: '{"code":"APAC1000","instructor":"CHAN TAI MAN"}',
            },
          },
        ],
      },
      { id: "t-sections", role: "tool", toolCallId: "call-sections", content: "sections-body" },
      { id: "t-course", role: "tool", toolCallId: "call-course", content: "course-body" },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  const statuses = screen.getAllByRole("status").map((node) => node.textContent ?? "");
  expect(statuses[0]).toContain("Read course");
  expect(statuses[1]).toContain("Read class times");
  expect(screen.getByTestId("rich-call-course").textContent).toBe("course-body");
  expect(screen.getByTestId("rich-call-sections").textContent).toBe("sections-body");
  expect(screen.getAllByRole("status")).toHaveLength(2);
});

it("updates each call in one turn independently", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "both" },
      { id: "t1", role: "tool", toolCallId: "call-done", content: "course-body" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-done",
            type: "function",
            function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
          },
          {
            id: "call-open",
            type: "function",
            function: { name: "get_course_sections", arguments: '{"code":"APAC2000","instructor":"CHAN TAI MAN"}' },
          },
        ],
      },
    ],
    isRunning: true,
    toolRenderer: fakeToolRenderer(),
  });

  const statuses = screen.getAllByRole("status");
  expect(statuses).toHaveLength(2);
  expect(statuses[0].getAttribute("data-status")).toBe("done");
  expect(statuses[0].textContent).toContain("Read course");
  expect(statuses[1].getAttribute("data-status")).toBe("running");
  expect(statuses[1].textContent).toContain("Reading class times…");
  expect(screen.queryByText("Thinking…")).toBeNull();
});

it("renders one row when the same call id is replayed", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "search" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "search_catalog", arguments: "{}" },
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        content: "Again.",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "search_catalog", arguments: '{"query":"MATH"}' },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "call-1", content: "once" },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getAllByTestId("rich-call-1")).toHaveLength(1);
  expect(screen.getAllByText("Searched courses")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toContain("MATH");
});

it("keeps a non-rich trace and a rich row as two different calls", () => {
  renderView({
    messages: [
      { id: "u1", role: "user", content: "both" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-rich",
            type: "function",
            function: { name: "search_catalog", arguments: '{"query":"MATH"}' },
          },
          {
            id: "call-plain",
            type: "function",
            function: { name: "get_instructor", arguments: '{"name":"CHAN TAI MAN"}' },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "call-rich", content: "cards" },
      { id: "t2", role: "tool", toolCallId: "call-plain", content: "{}" },
    ],
    toolRenderer: fakeToolRenderer(),
  });

  expect(screen.getAllByText("Searched courses")).toHaveLength(1);
  expect(screen.getAllByText("Read instructor")).toHaveLength(1);
  expect(screen.getAllByTestId(/^rich-call-/)).toHaveLength(1);
  expect(screen.getByTestId("rich-call-rich").textContent).toBe("cards");
});
```

The non-rich instructor result `"{}"` is malformed, so its trace label becomes `Couldn't read instructor`, not `Read instructor`. In `"keeps a non-rich trace and a rich row as two different calls"`, use a valid empty instructor body:

```ts
content: JSON.stringify({
  name: "CHAN TAI MAN",
  page: 1,
  hasMore: false,
  totalCount: 0,
  courses: [],
})
```

And expect `Read instructor`. The existing `"keeps non-rich tools in ToolTrace"` test uses `content: "{}"`, which will now be a failure. Update that test to the same valid empty instructor body and still expect `Read instructor` plus no rich block. Add a sibling assertion only if you also want the malformed case: a separate test with `content: "{}"` expects `Couldn't read instructor` and `data-status="error"`.

Keep the reasoning test unchanged: `PRIVATE-CHAIN-OF-THOUGHT` stays absent.

- [ ] **Step 2: Run the chat-view test to verify the new assertions fail**

Run: `npx vitest run tests/components/assistant-chat-view.test.tsx`

Expected: FAIL because rich calls still do not render `Searched courses` / `Read course` / `Read class times` / `Filtered results`.

- [ ] **Step 3: Pair the row in `AssistantTurn`**

In `components/assistant/assistant-chat-view.tsx`, change the tool import to:

```ts
import { dedupeCalls, ToolRow, ToolTrace } from "@/components/ai-elements/tool";
```

Inside `AssistantTurn`, after `dedupedCalls` is computed, derive:

```ts
const dedupedById = useMemo(
  () => new Map(dedupedCalls.map((call) => [call.id, call])),
  [dedupedCalls],
);
```

`useMemo` is already imported.

In the render path, create `const seenRichIds = new Set<string>()` immediately before the returned JSX, in the function body, so each render starts clean.

Replace the `richBlocks` construction with:

```tsx
const richBlocks =
  part.toolCalls?.flatMap((rawCall) => {
    const call = dedupedById.get(rawCall.id) ?? rawCall;
    if (!dedupedIds.has(call.id) || seenRichIds.has(call.id) || !isRichCall(call) || !toolRenderer) {
      return [];
    }
    seenRichIds.add(call.id);
    return [
      <div key={`rich-${call.id}`} className="space-y-1.5">
        <ToolRow
          call={call}
          result={results.get(call.id)}
          isRunning={turnActive}
          announce
        />
        {toolRenderer.render(call, results.get(call.id))}
      </div>,
    ];
  }) ?? [];
```

Leave `traceCalls` filtering `!isRichCall(call)`. Leave reasoning parts returning null. Leave `ThinkingRow` and `awaitingReply` unchanged.

Replace the comment in `lib/assistant/rich-tools.ts` with:

```ts
/** Tool names with dedicated inline renderers. The generic ToolTrace row is omitted; AssistantTurn pairs one ToolRow with the renderer. */
```

- [ ] **Step 4: Run the chat-view tests**

Run: `npx vitest run tests/components/assistant-chat-view.test.tsx tests/components/assistant-reasoning-hidden.test.tsx`

Expected: PASS. Reasoning text remains hidden.

- [ ] **Step 5: Leave the work uncommitted**

Do not commit. Do not touch the verification doc.

---

### Task 4: Update integration expectations

**Files:**
- Modify: `tests/components/assistant-chat.test.tsx`
- Modify: `tests/components/assistant-search-catalog.integration.test.tsx`
- Modify: `tests/components/assistant-v2-1.integration.test.tsx`

**Interfaces:**
- Consumes: the paired row from Task 3, rendered through the real `AssistantChat` / `AssistantPanel` tool renderer.
- Produces: no production code. Obsolete "label is absent" assertions become "exactly one matching activity row, and the rich UI is still present".

- [ ] **Step 1: Update the three assertions that forbid activity labels**

In `tests/components/assistant-chat.test.tsx`, the test `"renders search_catalog through useRenderToolCall"` currently expects `Searched courses` to be absent. Replace that expectation with:

```tsx
expect(screen.getByTestId("rich-call-sc").textContent).toBe("catalog-hit");
expect(screen.getAllByText("Searched courses")).toHaveLength(1);
expect(screen.getAllByRole("status")).toHaveLength(1);
```

In `tests/components/assistant-search-catalog.integration.test.tsx`, after the ACCT1000 card appears, replace `expect(screen.queryByText("Searched courses")).toBeNull()` with:

```tsx
expect(screen.getAllByText("Searched courses")).toHaveLength(1);
expect(screen.getByRole("article")).toBeTruthy();
expect(screen.getByRole("heading", { name: "ACCT1000" })).toBeTruthy();
```

Do not require the activity row to be the only `role="status"` if a loading line is still mounted. At this point the card is visible, so the loading line should be gone. If a transient status node is still present, wait until `getAllByText("Searched courses")` has length 1 and `queryByText("Searching courses…")` is null before asserting the article.

In `tests/components/assistant-v2-1.integration.test.tsx`:

After the follow-up filter succeeds, replace `expect(screen.queryByText("Filtered results")).toBeNull()` with:

```tsx
expect(screen.getAllByText("Filtered results")).toHaveLength(1);
expect(screen.queryByText("Filtering results…")).toBeNull();
expect(within(block).getAllByRole("article")).toHaveLength(2);
expect(screen.getByRole("button", { name: "Show results" })).toBeTruthy();
```

After `Tell me more about MATH1002` shows the course article, add:

```tsx
expect(screen.getAllByText("Read course")).toHaveLength(1);
```

After the section article appears, replace `expect(screen.queryByText("Read class times")).toBeNull()` with:

```tsx
expect(screen.getAllByText("Read class times")).toHaveLength(1);
expect(screen.getByRole("article", { name: "Section 001" })).toBeTruthy();
expect(screen.getByText("Mon 09:00–10:15")).toBeTruthy();
```

The scripted brain calls `get_course` again before `get_course_sections` for "When is MATH1002 taught?". After that step, `Read course` appears twice and `Read class times` appears once. Assert those counts. Do not assert `Read course` is still 1 after the sections question.

After close/reopen, add:

```tsx
expect(screen.getAllByText("Searched courses")).toHaveLength(1);
expect(screen.queryByText("Searching courses…")).toBeNull();
expect(screen.getByRole("article", { name: "Section 001" })).toBeTruthy();
```

After New chat clears the catalog block, add:

```tsx
expect(screen.queryByText("Searched courses")).toBeNull();
expect(screen.queryByText("Filtered results")).toBeNull();
expect(screen.queryByText("Read class times")).toBeNull();
```

After the stale-filter message appears, add:

```tsx
expect(screen.getByText("Couldn't filter results")).toBeTruthy();
expect(screen.queryByText("Filtered results")).toBeNull();
```

The stale turn is a new chat, so the earlier successful `Filtered results` row is gone. The new filter call returns `unknown_result_set` through the real frontend tool. Its activity row must be the failure label, and the existing sentence `Those earlier results are no longer available. Search again to filter them.` must still be present.

Do not change `agentBusy()` or the scripted brain.

- [ ] **Step 2: Run the integration tests**

Run:

```bash
npx vitest run tests/components/assistant-chat.test.tsx tests/components/assistant-search-catalog.integration.test.tsx tests/components/assistant-v2-1.integration.test.tsx tests/components/assistant-reasoning-hidden.test.tsx
```

Expected: PASS. The V2.1 file's first test allows 120 seconds.

- [ ] **Step 3: Leave the work uncommitted**

Do not commit. Do not touch the verification doc.

---

### Task 5: Verify the branch

**Files:**
- No planned source edits. Fix only failures caused by Tasks 1–4.

**Interfaces:**
- Consumes: the working tree from Tasks 1–4.
- Produces: a short note in the task report with command results. No commit.

- [ ] **Step 1: Run the focused suites, lint, types, and the full test suite**

Run, in this order:

```bash
npx vitest run tests/assistant/tool-activity.test.ts tests/ai-elements/tool-status.test.tsx tests/ai-elements/tool-dedupe.test.ts tests/components/assistant-chat-view.test.tsx tests/components/assistant-chat.test.tsx tests/components/assistant-reasoning-hidden.test.tsx tests/components/assistant-search-catalog.integration.test.tsx tests/components/assistant-v2-1.integration.test.tsx
npm run lint
npx tsc --noEmit
npm run test
```

Expected: each command exits 0.

If `npm run build` is practical in this environment, run it too. If it fails for an existing environment reason unrelated to these files, record the reason and do not treat it as an activity-UX failure.

- [ ] **Step 2: Confirm the scope**

`git status --short` and `git diff --stat` must show only:

- `lib/assistant/tool-result.ts`
- `lib/assistant/tool-activity.ts`
- `lib/assistant/rich-tools.ts`
- `components/ai-elements/tool.tsx`
- `components/assistant/assistant-chat-view.tsx`
- the test files from Tasks 1–4
- the pre-existing dirty `docs/superpowers/verification/2026-10-24-assistant-v2-1.md`, unchanged by this work

The controller checks browser behavior separately. Do not claim a signed-in browser pass from this task.

- [ ] **Step 3: Leave the work uncommitted**

Do not commit, push, merge, or deploy.
