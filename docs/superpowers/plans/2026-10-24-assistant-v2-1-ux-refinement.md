# Assistant V2.1 UX Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show catalog discovery as a compact two-line result list inside the assistant sidebar, with truthful loaded-result counts, while course details, class sections, visible ordinals, and the existing prompt fallback stay intact.

**Architecture:** `search_catalog` course rows become one ordered list. Row order is `applyCatalogFilter` output, and the visible index is `position`. A new `describeLoadedResultSummary` formats the header. `describeFilterScope` stays the copy for the separate `filter_catalog_results` confirmation. Course-detail and section cards are not restyled. Rule 15 of `ASSISTANT_PROMPT` tells the model to interpret the list instead of reprinting it. Show-more is deferred: every loaded row stays visible, so DOM order and agent `position` stay the same list.

**Tech Stack:** Next.js 15.5.27, React 18.3, TypeScript, `@copilotkit/react-core` 1.79.1, Vitest 2.1.9, Testing Library, existing Tailwind tokens (`border-border`, `text-foreground`, `text-muted-foreground`, `bg-surface-subtle`, `ring-ring`).

## Global Constraints

- Discovery UI only. Do not compress `get_course` or `get_course_sections` cards. Do not change academic SQL, MCP schemas, server tools, CopilotKit runtime, DeepSeek config, auth, timetable code, or result-set storage.
- Default filter stays `"all"`. Do not make Offered the default.
- One ordering function: `applyCatalogFilter`. Displayed `1.` `2.` … is that array’s index plus 1. Do not sort in the component.
- `shownCount`, `loadedCount`, and `position` describe loaded rows. They are not `totalCount`. Header copy must say the offered filter applies to loaded rows.
- `isOffered` means the catalog marks the course offered this term. Do not say seats are open. Show the word `Offered` only when `isOffered` is true. Put `Not offered this term` in an `sr-only` span.
- Navigation uses `buildCoursePath` on the trimmed uppercased code. Do not use `course.url` as `href`. The row is a `next/link`. Do not call the model on click.
- Do not add Show more / Show less. The loaded page is at most 10 rows.
- Do not add a virtualized list, a new state library, or a second copy of result data.
- `ASSISTANT_PROMPT` stays free of course-code examples (`[A-Z]{4}\d{4}`) and Han characters. Prompt wording is guidance, not a guarantee of model text.
- Do not edit Agent Activity files: `components/ai-elements/tool.tsx`, `components/assistant/assistant-chat-view.tsx`, `lib/assistant/tool-activity.ts`, `lib/assistant/tool-result.ts`, `lib/assistant/rich-tools.ts`, `tests/ai-elements/tool-status.test.tsx`, `tests/assistant/tool-activity.test.ts`, `tests/components/assistant-chat-view.test.tsx`, `vitest.config.ts`, `docs/superpowers/verification/2026-10-24-assistant-v2-1.md`. Rich `search_catalog` calls are still omitted from `ToolTrace` on this HEAD. Do not invent a paired activity row.
- Do not change `summarizeCatalogResultSets`, `applyCatalogFilter`, `describeFilterScope`, or `course-referent.ts`.
- Keep the loading string `Searching the catalog…`.
- Do not commit, push, merge, or deploy. Leave unrelated working-tree files untouched.
- Gates for the controller after all tasks: `npm run lint`, `npx tsc --noEmit`, `npm run test`. Each task runs only its named tests.

## Verified current state

- `CatalogCourseCard` (`components/assistant/catalog-course-card.tsx`) is a bordered article with a separate `View` link. Only `SearchCatalogCoursesResult` renders it.
- `SearchCatalogCoursesResult` prints `N courses found`, sometimes `Showing X of Y`, and the long `describeFilterScope` sentence. Buttons are `All` and `Offered only`. Default filter in `useCatalogFilter` is `"all"`.
- `summarizeCatalogResultSets` already lists `applyCatalogFilter` courses with `position` starting at 1. `course-referent.ts` resolves ordinals from that summary. Do not redo that work.
- `describeFilterScope` is also the body of `CatalogFilterToolResult`. Leave those sentences alone.
- `assistant-chat-view.tsx` renders `ToolTrace` only for non-rich calls. `ToolRow` exists in the dirty `tool.tsx`, which belongs to parallel Agent Activity work.

## File structure

- Create `components/assistant/catalog-course-row.tsx`. One compact row. No fetching.
- Create `tests/components/catalog-course-row.test.tsx`.
- Modify `lib/assistant/catalog-result-sets.ts`. Add `describeLoadedResultSummary`. Leave existing exports unchanged.
- Modify `tests/assistant/catalog-result-sets.test.ts`. Add cases for the new function only.
- Modify `components/assistant/search-catalog-tool-render.tsx`. Course results use the row and the new summary. Instructor, empty, and failure branches stay.
- Modify `tests/components/search-catalog-tool-render.test.tsx`.
- Modify `tests/components/assistant-v2-1.integration.test.tsx` and `tests/components/assistant-search-catalog.integration.test.tsx`. Selectors only.
- Delete `components/assistant/catalog-course-card.tsx` and `tests/components/catalog-course-card.test.tsx` once nothing imports them.
- Modify `lib/assistant/prompt.ts` rule 15 and `tests/assistant/agent.test.ts`.

## Decisions locked in

- Visible labels: `All loaded` and `Offered only`. Group label stays `Filter loaded courses`.
- Header, filter `"all"`, loaded less than total: `` `${totalCount} matches · ${loaded} loaded` ``.
- Header, filter `"all"`, loaded equals total: `` `${totalCount} match` `` or `` `${totalCount} matches` ``.
- Header, filter `"offered"`, shown > 0: `` `${shown} offered among ${loaded} loaded · ${totalCount} total matches` ``, with `1 offered` when shown is 1.
- Header, filter `"offered"`, shown is 0: `` `None offered among ${loaded} loaded · ${totalCount} total matches` ``. No list.
- Secondary line joins English title, Chinese title, credits, then department or else faculty, with ` · `. Numeric credits render as `` `${credits} cr` ``. Other credit strings render unchanged.
- No separate View button. The link’s accessible name is its text, including the code and both titles.
- Agent Activity pairing stays a dependency. This plan does not render `Searched courses`.

---

### Task 1: Compact row and loaded-result summary

**Files:**
- Create: `components/assistant/catalog-course-row.tsx`
- Create: `tests/components/catalog-course-row.test.tsx`
- Modify: `lib/assistant/catalog-result-sets.ts` (append `describeLoadedResultSummary` after `describeFilterScope`)
- Modify: `tests/assistant/catalog-result-sets.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `CatalogCourse` from `@/lib/mcp/schemas`; `buildCoursePath` from `@/lib/site`; `CatalogFilter` in `lib/assistant/catalog-result-sets.ts`.
- Produces:
  - `CatalogCourseRow({ course, position }: { course: CatalogCourse; position: number })`
  - `describeLoadedResultSummary(input: { filter: CatalogFilter; shown: number; loaded: number; totalCount: number }): string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/assistant/catalog-result-sets.test.ts`:

```ts
describe("describeLoadedResultSummary", () => {
  it("counts a full loaded page without calling it the whole catalog", () => {
    expect(
      describeLoadedResultSummary({
        filter: "all",
        shown: 10,
        loaded: 10,
        totalCount: 127,
      }),
    ).toBe("127 matches · 10 loaded");
  });

  it("uses a singular match when every result is loaded", () => {
    expect(
      describeLoadedResultSummary({
        filter: "all",
        shown: 1,
        loaded: 1,
        totalCount: 1,
      }),
    ).toBe("1 match");
    expect(
      describeLoadedResultSummary({
        filter: "all",
        shown: 10,
        loaded: 10,
        totalCount: 10,
      }),
    ).toBe("10 matches");
  });

  it("says offered counts are among the loaded rows", () => {
    expect(
      describeLoadedResultSummary({
        filter: "offered",
        shown: 2,
        loaded: 10,
        totalCount: 127,
      }),
    ).toBe("2 offered among 10 loaded · 127 total matches");
    expect(
      describeLoadedResultSummary({
        filter: "offered",
        shown: 1,
        loaded: 3,
        totalCount: 3,
      }),
    ).toBe("1 offered among 3 loaded · 3 total matches");
  });

  it("does not claim the catalog has no offered courses when the loaded page has none", () => {
    expect(
      describeLoadedResultSummary({
        filter: "offered",
        shown: 0,
        loaded: 10,
        totalCount: 127,
      }),
    ).toBe("None offered among 10 loaded · 127 total matches");
  });
});
```

Add `describeLoadedResultSummary` to the existing import in `tests/assistant/catalog-result-sets.test.ts`:

```ts
import {
  applyCatalogFilter,
  collectCatalogResultSets,
  describeFilterScope,
  describeLoadedResultSummary,
  findCatalogResultSet,
  runFilterCatalogResults,
  summarizeCatalogResultSets,
  type CatalogResultSet,
} from "@/lib/assistant/catalog-result-sets";
```

Create `tests/components/catalog-course-row.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
import type { CatalogCourse } from "@/lib/mcp/schemas";
import { SITE_URL } from "@/lib/site";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fullCourse: CatalogCourse = {
  courseCode: "ACCT1000",
  titleEn: "Principles of Accounting I",
  titleZh: "會計學原理 I",
  faculty: "FBA",
  department: "AIM",
  credits: "3",
  isOffered: true,
  url: `${SITE_URL}/course/ACCT1000`,
};

afterEach(() => {
  cleanup();
});

describe("CatalogCourseRow", () => {
  it("shows the visible position, code, both titles, credits, and department", () => {
    render(<CatalogCourseRow course={fullCourse} position={2} />);

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).toContain("2.");
    expect(link.textContent).toContain("Principles of Accounting I");
    expect(link.textContent).toContain("會計學原理 I");
    expect(link.textContent).toContain("3 cr");
    expect(link.textContent).toContain("AIM");
    expect(link.textContent).not.toContain("FBA");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("falls back to faculty and keeps a non-numeric credit string", () => {
    render(
      <CatalogCourseRow
        course={{ ...fullCourse, department: null, credits: "3 credits" }}
        position={1}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).toContain("FBA");
    expect(link.textContent).toContain("3 credits");
    expect(link.textContent).not.toContain("3 credits cr");
  });

  it("omits empty titles, credits, and department", () => {
    render(
      <CatalogCourseRow
        course={{
          ...fullCourse,
          titleEn: null,
          titleZh: null,
          credits: null,
          faculty: null,
          department: null,
        }}
        position={1}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).not.toContain("Principles");
    expect(link.textContent).not.toContain("會計");
    expect(link.textContent).not.toContain("cr");
  });

  it("marks offered courses and keeps non-offered status for assistive tech", () => {
    const { rerender } = render(<CatalogCourseRow course={fullCourse} position={1} />);
    expect(screen.getByText("Offered")).toBeTruthy();
    expect(screen.queryByText("Not offered this term")).toBeNull();

    rerender(<CatalogCourseRow course={{ ...fullCourse, isOffered: false }} position={1} />);
    expect(screen.queryByText("Offered")).toBeNull();
    expect(screen.getByText("Not offered this term").className).toContain("sr-only");
  });

  it("links with buildCoursePath and ignores the result url", () => {
    render(
      <CatalogCourseRow
        course={{
          ...fullCourse,
          courseCode: "acct1000",
          url: "https://evil.example/course/acct1000",
        }}
        position={4}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.getAttribute("href")).toBe("/course/ACCT1000");
    expect(link.className).toContain("focus-visible:ring-2");
  });

  it("encodes an unusual course code", () => {
    render(
      <CatalogCourseRow
        course={{ ...fullCourse, courseCode: "A/B 1", url: `${SITE_URL}/course/nope` }}
        position={1}
      />,
    );

    expect(screen.getByRole("link", { name: /A\/B 1/ }).getAttribute("href")).toBe(
      "/course/A%2FB%201",
    );
  });

  it("keeps a long bilingual title in the link without a nested card", () => {
    const titleEn = `Advanced ${"Methods ".repeat(30)}`;
    const titleZh = "計算方法導論".repeat(12);
    const { container } = render(
      <CatalogCourseRow
        course={{ ...fullCourse, titleEn, titleZh }}
        position={1}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).toContain(titleEn.trim());
    expect(link.textContent).toContain(titleZh);
    expect(link.className).toContain("min-w-0");
    expect(link.className).toContain("overflow-hidden");
    expect(container.querySelector("article")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/catalog-course-row.test.tsx tests/assistant/catalog-result-sets.test.ts`

Expected: FAIL because `CatalogCourseRow` and `describeLoadedResultSummary` are not exported.

- [ ] **Step 3: Write the implementation**

Append this function to `lib/assistant/catalog-result-sets.ts` immediately after `describeFilterScope`:

```ts
export function describeLoadedResultSummary(input: {
  filter: CatalogFilter;
  shown: number;
  loaded: number;
  totalCount: number;
}): string {
  const { filter, shown, loaded, totalCount } = input;

  if (filter === "offered") {
    if (shown === 0) {
      return `None offered among ${loaded} loaded · ${totalCount} total matches`;
    }
    const offered = shown === 1 ? "1 offered" : `${shown} offered`;
    return `${offered} among ${loaded} loaded · ${totalCount} total matches`;
  }

  if (loaded < totalCount) {
    return `${totalCount} matches · ${loaded} loaded`;
  }

  return totalCount === 1 ? "1 match" : `${totalCount} matches`;
}
```

Create `components/assistant/catalog-course-row.tsx`:

```tsx
import Link from "next/link";

import type { CatalogCourse } from "@/lib/mcp/schemas";
import { buildCoursePath } from "@/lib/site";

function formatCredits(credits: string | null): string | null {
  if (!credits) return null;
  if (/^\d+(\.\d+)?$/.test(credits)) return `${credits} cr`;
  return credits;
}

function secondaryLine(course: CatalogCourse): string | null {
  const titles = [course.titleEn, course.titleZh].filter(
    (part): part is string => Boolean(part),
  );
  const facts = [formatCredits(course.credits), course.department ?? course.faculty].filter(
    (part): part is string => Boolean(part),
  );
  const line = [...titles, ...facts].join(" · ");
  return line.length > 0 ? line : null;
}

export function CatalogCourseRow({
  course,
  position,
}: {
  course: CatalogCourse;
  position: number;
}) {
  const code = course.courseCode.trim().toUpperCase();
  const details = secondaryLine(course);

  return (
    <li className="min-w-0 border-b border-border last:border-b-0">
      <Link
        href={buildCoursePath(code)}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 overflow-hidden px-1 py-1.5 text-sm text-foreground outline-none hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="col-start-1 row-start-1 text-xs tabular-nums text-muted-foreground">
          {position}.
        </span>
        <span className="col-start-2 row-start-1 min-w-0 truncate font-semibold tracking-tight">{code}</span>
        {course.isOffered ? (
          <span className="col-start-3 row-start-1 shrink-0 text-xs text-muted-foreground">
            Offered
          </span>
        ) : (
          <span className="sr-only">Not offered this term</span>
        )}
        {details ? (
          <span className="col-span-2 col-start-2 row-start-2 line-clamp-2 break-words text-xs leading-snug text-muted-foreground">
            {details}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/catalog-course-row.test.tsx tests/assistant/catalog-result-sets.test.ts`

Expected: PASS.

- [ ] **Step 5: Do not commit**

Leave the new files unstaged. Do not `git add` unrelated dirty files.

---

### Task 2: Wire the compact list into catalog search

**Files:**
- Modify: `components/assistant/search-catalog-tool-render.tsx`
- Modify: `tests/components/search-catalog-tool-render.test.tsx`
- Modify: `tests/components/assistant-v2-1.integration.test.tsx`
- Modify: `tests/components/assistant-search-catalog.integration.test.tsx`
- Delete: `components/assistant/catalog-course-card.tsx`
- Delete: `tests/components/catalog-course-card.test.tsx`

**Interfaces:**
- Consumes: `CatalogCourseRow`, `describeLoadedResultSummary`, `applyCatalogFilter`, `useCatalogFilter`, `catalogResultsElementId`.
- Produces: course search results render an `ol` labelled `Loaded courses`. Each row’s `position` is its index in `applyCatalogFilter` plus 1. The header is one `describeLoadedResultSummary` line. Filter buttons read `All loaded` and `Offered only`.

- [ ] **Step 1: Write the failing component assertions**

In `tests/components/search-catalog-tool-render.test.tsx`:

Replace the test named `renders course cards with found and showing summaries` with:

```tsx
  it("renders a compact loaded list and one truthful count", () => {
    render(<SearchCatalogToolResult status="complete" result={coursesResult(10, 58)} />);

    expect(screen.getByRole("list", { name: "Loaded courses" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("1.");
    expect(screen.getAllByRole("listitem")[9].textContent).toContain("10.");
    expect(screen.getByText("58 matches · 10 loaded")).toBeTruthy();
    expect(screen.queryByText("58 courses found")).toBeNull();
    expect(screen.queryByText("Showing 10 of 58")).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("link", { name: /COURSE1/ }).getAttribute("href")).toBe(
      "/course/COURSE1",
    );
  });
```

In `filters loaded courses to offered only and back without leaving the component`, replace the article-count and long-sentence assertions with:

```tsx
    expect(within(group).getByRole("button", { name: "All loaded" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(offered);
    expect(offered.getAttribute("aria-pressed")).toBe("true");
    const offeredRows = screen.getAllByRole("listitem");
    expect(offeredRows).toHaveLength(2);
    expect(offeredRows[0].textContent).toContain("1.");
    expect(offeredRows[0].textContent).toContain("COURSE2");
    expect(offeredRows[1].textContent).toContain("2.");
    expect(offeredRows[1].textContent).toContain("COURSE5");
    expect(screen.getByText("2 offered among 10 loaded · 127 total matches")).toBeTruthy();
    expect(screen.queryByText(/Other pages may include more offered courses/)).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "All loaded" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByRole("listitem")[1].textContent).toContain("COURSE2");
    expect(screen.getByText("127 matches · 10 loaded")).toBeTruthy();
```

Keep the existing `const offered = within(group).getByRole("button", { name: "Offered only" });` line.

In `shows an empty filtered message when no loaded course is offered`, replace the article and sentence assertions with:

```tsx
    fireEvent.click(within(group).getByRole("button", { name: "Offered only" }));
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText("None offered among 10 loaded · 10 total matches")).toBeTruthy();
```

In the loading test, replace `expect(screen.queryByRole("article")).toBeNull();` with:

```tsx
      expect(screen.queryByRole("article")).toBeNull();
      expect(screen.queryByRole("listitem")).toBeNull();
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npx vitest run tests/components/search-catalog-tool-render.test.tsx`

Expected: FAIL because the UI still renders articles, `All`, and `courses found`.

- [ ] **Step 3: Wire the list**

In `components/assistant/search-catalog-tool-render.tsx`:

Replace the `CatalogCourseCard` import with:

```tsx
import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
```

Replace the `describeFilterScope` import with `describeLoadedResultSummary`. Add `import type { CatalogCourse } from "@/lib/mcp/schemas";`.

Change the `All` button text to `All loaded`.

Replace `SearchCatalogCoursesResult` with:

```tsx
function SearchCatalogCoursesResult({
  view,
  resultSetId,
}: {
  view: {
    totalCount: number;
    hasMore: boolean;
    courses: CatalogCourse[];
  };
  resultSetId?: string;
}) {
  const [filter, setFilter] = useCatalogFilter(resultSetId);
  const displayedCourses = applyCatalogFilter(view.courses, filter);
  const summary = describeLoadedResultSummary({
    filter,
    shown: displayedCourses.length,
    loaded: view.courses.length,
    totalCount: view.totalCount,
  });

  return (
    <div
      id={resultSetId ? catalogResultsElementId(resultSetId) : undefined}
      className="min-w-0 space-y-1.5 overflow-x-hidden"
    >
      <CatalogCourseFilterControls filter={filter} onFilterChange={setFilter} />
      <p className="text-xs text-muted-foreground">{summary}</p>
      {displayedCourses.length > 0 ? (
        <ol aria-label="Loaded courses" className="m-0 list-none overflow-x-hidden p-0">
          {displayedCourses.map((course, index) => (
            <CatalogCourseRow
              key={course.courseCode}
              course={course}
              position={index + 1}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}
```

`view.hasMore` stays on the type because callers still pass the parsed view. Do not read it for copy. Do not call `describeFilterScope` from this file.

Delete `components/assistant/catalog-course-card.tsx` and `tests/components/catalog-course-card.test.tsx`.

- [ ] **Step 4: Update integration selectors**

In `tests/components/assistant-v2-1.integration.test.tsx`, replace every `within(block).getAllByRole("article")`, `within(mathBlock).getAllByRole("article")`, and `within(reopened).getAllByRole("article")` with the same call using `"listitem"`.

Replace both `getByRole("button", { name: "All" })` calls in that file with `getByRole("button", { name: "All loaded" })`.

Leave `getByRole("article", { name: "MATH1002" })`, `getByRole("article", { name: "Section 001" })`, and `queryByRole("article", { name: "MATH1002" })` unchanged. Those are detail and section cards.

Inside `resolves the second visible course after manual and agent filters`, after the offered click’s length assertion, add:

```tsx
    const offeredRows = within(block).getAllByRole("listitem");
    expect(offeredRows[0].textContent).toContain("MATH1002");
    expect(offeredRows[0].textContent).toContain("1.");
    expect(offeredRows[1].textContent).toContain("MATH1005");
    expect(offeredRows[1].textContent).toContain("2.");
    expect(within(block).getByText("2 offered among 10 loaded · 127 total matches")).toBeTruthy();
```

In `tests/components/assistant-search-catalog.integration.test.tsx`:

Replace `expect(screen.getByRole("article")).toBeTruthy();` and `expect(screen.getByRole("heading", { name: "ACCT1000" })).toBeTruthy();` in the first test with:

```tsx
        expect(screen.getByRole("list", { name: "Loaded courses" })).toBeTruthy();
        expect(screen.getByRole("link", { name: /ACCT1000/ })).toBeTruthy();
```

Replace `fireEvent.click(screen.getByRole("link", { name: "View course ACCT1000" }));` with:

```tsx
    fireEvent.click(screen.getByRole("link", { name: /ACCT1000/ }));
```

Replace `await waitFor(() => expect(screen.getByRole("article")).toBeTruthy(), { timeout: 10000 });` in the remount test with:

```tsx
    await waitFor(() => expect(screen.getByRole("link", { name: /ACCT1000/ })).toBeTruthy(), { timeout: 10000 });
```

Replace `expect(screen.queryByRole("article")).toBeNull();` in that remount test with:

```tsx
    expect(screen.queryByRole("link", { name: /ACCT1000/ })).toBeNull();
```

In the new-chat assertion, replace `expect(screen.queryByRole("article")).toBeNull();` with `expect(screen.queryByRole("list", { name: "Loaded courses" })).toBeNull();`.

Keep `expect(screen.queryByText("Searched courses")).toBeNull();`.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npx vitest run tests/components/search-catalog-tool-render.test.tsx tests/components/catalog-course-row.test.tsx tests/components/assistant-v2-1.integration.test.tsx tests/components/assistant-search-catalog.integration.test.tsx tests/components/catalog-filter-tool-render.test.tsx
```

Expected: PASS. `catalog-filter-tool-render` still shows the long `describeFilterScope` sentence.

- [ ] **Step 6: Do not commit**

Do not stage or commit.

---

### Task 3: Complementary reply instructions

**Files:**
- Modify: `lib/assistant/prompt.ts` (the rule 15 string only)
- Modify: `tests/assistant/agent.test.ts` (the test `tells the model not to repeat search_catalog rows when clients show cards`)

**Interfaces:**
- Consumes: `ASSISTANT_PROMPT`.
- Produces: rule 15 tells the model that course rows are an interactive list, forbids a repeated Markdown list or table of those codes and titles, keeps an explicit textual-list exception, and keeps one-or-two-sentence course and section replies.

- [ ] **Step 1: Update the failing prompt assertion**

Replace the body of `tells the model not to repeat search_catalog rows when clients show cards` with:

```ts
    expect(ASSISTANT_PROMPT).toContain("interactive list in the chat");
    expect(ASSISTANT_PROMPT).toContain(
      "Do not repeat every course code and title in a Markdown list or table",
    );
    expect(ASSISTANT_PROMPT).toContain("Do not assume every client renders cards");
    expect(ASSISTANT_PROMPT).toContain("explicitly asks for a full textual list");
    expect(ASSISTANT_PROMPT).toContain(
      "answer in one or two sentences and add caveats instead of restating every field, section or meeting time",
    );
    expect(ASSISTANT_PROMPT).toContain(
      "do not repeat every instructor name unless the student asks for the list",
    );
    expect(ASSISTANT_PROMPT).not.toMatch(/\b[A-Z]{4}\d{4}\b/);
    expect(ASSISTANT_PROMPT).not.toMatch(/[\p{Script=Han}]/u);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/assistant/agent.test.ts`

Expected: FAIL on `interactive list in the chat`.

- [ ] **Step 3: Replace rule 15**

Replace only the rule 15 array element in `lib/assistant/prompt.ts` with:

```ts
  "15. When search_catalog returns course rows, many clients show them as an interactive list in the chat. Do not repeat every course code and title in a Markdown list or table; give a short interpretation instead: use totalCount, say that only the loaded page is shown when hasMore applies, and distinguish a course-code prefix search from a title or keyword search (see rules 13–14). Add one caveat when it changes how the student should read the list. If the student explicitly asks for a full textual list, provide it from the tool rows only. get_course and get_course_sections results are also shown as cards: answer in one or two sentences and add caveats instead of restating every field, section or meeting time. Instructor search rows, get_instructor, reviews and timetable checks still need a short explanation; do not repeat every instructor name unless the student asks for the list. Do not assume every client renders cards.",
```

Do not edit rules 1–14 or 16–17.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/assistant/agent.test.ts`

Expected: PASS.

- [ ] **Step 5: Do not commit**

Do not stage or commit.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Compact discovery list, codes, titles, credits, offering, no nested cards | 1, 2 |
| Rich course and section cards unchanged | no task edits those files |
| All loaded default, Offered only, truthful counts | 2 |
| Visible positions match `applyCatalogFilter` and existing context | 2 assertions; context function untouched |
| Direct trusted navigation, no model call | 1 href; existing integration run-count assertion kept |
| No Show more | decision above |
| Prompt discourages repeated lists, keeps explicit lists and non-rich caveat | 3 |
| Agent Activity not redesigned | global constraint |
| Lifecycle, new chat, account remount | existing integration tests, selectors updated in task 2 |
| No extra fetch on filter click | existing `runs().length` assertions kept |

## Deferred

- Show more / show less. A collapsed row would disagree with agent `position` unless context also changed.
- Full-catalog offered search. Filtering stays on the loaded page.
- Pairing `ToolRow` with rich results. That belongs to the uncommitted Agent Activity work. `assistant-chat-view.tsx` on HEAD still hides rich calls from `ToolTrace`.
- Live browser scenarios. Report them unverified unless a signed-in local session is actually exercised.
