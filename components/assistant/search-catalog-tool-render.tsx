"use client";

import Link from "next/link";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { z } from "zod/v4";

import {
  catalogResultsElementId,
  useCatalogFilter,
} from "@/components/assistant/catalog-filter-store";
import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
import { ToolFailureAlert } from "@/components/assistant/tool-failure-alert";
import {
  applyCatalogFilter,
  describeLoadedResultSummary,
  type CatalogFilter,
} from "@/lib/assistant/catalog-result-sets";
import {
  SEARCH_CATALOG_TOOL_NAME,
  parseSearchCatalogResult,
  type SearchCatalogFailure,
} from "@/lib/assistant/search-catalog-ui";
import type { CatalogCourse, CatalogInstructor } from "@/lib/mcp/schemas";
import { buildProfessorPath } from "@/lib/site";

const FAILURE_COPY: Record<
  SearchCatalogFailure,
  { lead: string; tail: "Try rephrasing or ask again." | "Try again in a moment." }
> = {
  invalid_request: {
    lead: "Invalid catalog search.",
    tail: "Try rephrasing or ask again.",
  },
  not_found: {
    lead: "That catalog search could not be completed.",
    tail: "Try rephrasing or ask again.",
  },
  malformed: {
    lead: "Couldn't read the catalog search result.",
    tail: "Try rephrasing or ask again.",
  },
  temporarily_unavailable: {
    lead: "The catalog is temporarily unavailable.",
    tail: "Try again in a moment.",
  },
};

const FILTER_BUTTON_CLASS =
  "inline-flex min-h-8 items-center rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatCourseCount(count: number) {
  return count === 1 ? "1 course" : `${count} courses`;
}

function SearchCatalogLoading() {
  return (
    <div className="text-xs text-muted-foreground" role="status">
      Searching the catalog…
    </div>
  );
}

function CatalogCourseFilterControls({
  filter,
  onFilterChange,
}: {
  filter: CatalogFilter;
  onFilterChange: (next: CatalogFilter) => void;
}) {
  const base =
    "text-muted-foreground hover:bg-surface-subtle hover:text-foreground";
  const active = "bg-surface-subtle text-foreground";

  return (
    <div role="group" aria-label="Filter loaded courses" className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${FILTER_BUTTON_CLASS} ${filter === "all" ? active : base}`}
        aria-pressed={filter === "all"}
        onClick={() => onFilterChange("all")}
      >
        All loaded
      </button>
      <button
        type="button"
        className={`${FILTER_BUTTON_CLASS} ${filter === "offered" ? active : base}`}
        aria-pressed={filter === "offered"}
        onClick={() => onFilterChange("offered")}
      >
        Offered only
      </button>
    </div>
  );
}

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

function InstructorRow({ instructor }: { instructor: CatalogInstructor }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <Link
        href={buildProfessorPath(instructor.name)}
        className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {instructor.name}
      </Link>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatCourseCount(instructor.courseCount)}
      </span>
    </li>
  );
}

export function SearchCatalogToolResult({
  status,
  result,
  resultSetId,
}: {
  status: "inProgress" | "executing" | "complete";
  result?: string;
  resultSetId?: string;
}) {
  if (status === "inProgress" || status === "executing") {
    return <SearchCatalogLoading />;
  }

  const view = parseSearchCatalogResult(result ?? "");

  if (view.kind === "failure") {
    const copy = FAILURE_COPY[view.reason];
    return <ToolFailureAlert message={`${copy.lead} ${copy.tail}`} />;
  }

  if (view.kind === "empty") {
    const message =
      view.searchType === "course"
        ? "No matching courses on this site."
        : "No matching instructors on this site.";
    return <p className="text-sm text-muted-foreground">{message}</p>;
  }

  if (view.kind === "instructors") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{`${view.totalCount} instructors found`}</p>
        {view.instructors.length < view.totalCount ? (
          <p className="text-xs text-muted-foreground">{`Showing ${view.instructors.length} of ${view.totalCount}`}</p>
        ) : null}
        <ul className="space-y-2">
          {view.instructors.map((instructor) => (
            <InstructorRow key={instructor.name} instructor={instructor} />
          ))}
        </ul>
      </div>
    );
  }

  return <SearchCatalogCoursesResult view={view} resultSetId={resultSetId} />;
}

export function useSearchCatalogToolRender(): void {
  useRenderTool(
    {
      name: SEARCH_CATALOG_TOOL_NAME,
      parameters: z.object({}).passthrough(),
      render: ({ status, result, toolCallId }) => (
        <SearchCatalogToolResult
          status={status}
          result={result}
          resultSetId={toolCallId}
        />
      ),
    },
    [],
  );
}
