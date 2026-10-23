"use client";

import Link from "next/link";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { z } from "zod/v4";

import { CatalogCourseCard } from "@/components/assistant/catalog-course-card";
import { ToolFailureAlert } from "@/components/assistant/tool-failure-alert";
import {
  SEARCH_CATALOG_TOOL_NAME,
  parseSearchCatalogResult,
  type SearchCatalogFailure,
} from "@/lib/assistant/search-catalog-ui";
import type { CatalogInstructor } from "@/lib/mcp/schemas";
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
}: {
  status: "inProgress" | "executing" | "complete";
  result?: string;
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

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{`${view.totalCount} courses found`}</p>
      {view.courses.length < view.totalCount ? (
        <p className="text-xs text-muted-foreground">{`Showing ${view.courses.length} of ${view.totalCount}`}</p>
      ) : null}
      <div className="space-y-2">
        {view.courses.map((course) => (
          <CatalogCourseCard key={course.courseCode} course={course} />
        ))}
      </div>
    </div>
  );
}

export function useSearchCatalogToolRender(): void {
  useRenderTool(
    {
      name: SEARCH_CATALOG_TOOL_NAME,
      parameters: z.object({}).passthrough(),
      render: ({ status, result }) => (
        <SearchCatalogToolResult status={status} result={result} />
      ),
    },
    [],
  );
}
