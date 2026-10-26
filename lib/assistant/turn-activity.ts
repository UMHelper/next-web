import { SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";
import { GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { GET_COURSE_SECTIONS_TOOL_NAME } from "@/lib/assistant/course-sections-ui";
import {
  callsForActivity,
  PRESENT_RESPONSE_TOOL_NAME,
  type RichBlock,
  type ToolCallLike,
  toolMessageContent,
} from "@/lib/assistant/presentation";

const REVIEW_TOOLS = new Set(["get_course_reviews", "count_reviews"]);
const COURSE_READ_TOOLS = new Set([
  GET_COURSE_TOOL_NAME,
  "get_course_description",
  "get_course_ilo",
  "get_instructor",
  "count_courses",
]);

export type TurnActivityCounts = {
  catalogSearches: number;
  catalogSearchesPending: number;
  courseLookups: number;
  reviewLookups: number;
  sectionLookups: number;
};

export function summarizeTurnActivityCounts(
  calls: readonly ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): TurnActivityCounts {
  const counts: TurnActivityCounts = {
    catalogSearches: 0,
    catalogSearchesPending: 0,
    courseLookups: 0,
    reviewLookups: 0,
    sectionLookups: 0,
  };

  for (const call of calls) {
    const name = call.function.name;
    const hasResult = toolMessageContent(results.get(call.id)?.content) !== undefined;

    if (name === SEARCH_CATALOG_TOOL_NAME) {
      counts.catalogSearches += 1;
      if (!hasResult) counts.catalogSearchesPending += 1;
      continue;
    }
    if (REVIEW_TOOLS.has(name)) {
      counts.reviewLookups += 1;
      continue;
    }
    if (name === GET_COURSE_SECTIONS_TOOL_NAME) {
      counts.sectionLookups += 1;
      continue;
    }
    if (COURSE_READ_TOOLS.has(name)) {
      counts.courseLookups += 1;
    }
  }

  return counts;
}

export function formatTurnActivityDetail(counts: TurnActivityCounts): string | null {
  const parts: string[] = [];
  if (counts.catalogSearches > 0) {
    parts.push(
      `${counts.catalogSearches} ${counts.catalogSearches === 1 ? "search" : "searches"}`,
    );
  }
  if (counts.courseLookups > 0) {
    parts.push(
      `${counts.courseLookups} course ${counts.courseLookups === 1 ? "lookup" : "lookups"}`,
    );
  }
  if (counts.reviewLookups > 0) {
    parts.push(
      `${counts.reviewLookups} review ${counts.reviewLookups === 1 ? "lookup" : "lookups"}`,
    );
  }
  if (counts.sectionLookups > 0) {
    parts.push(
      `${counts.sectionLookups} section ${counts.sectionLookups === 1 ? "lookup" : "lookups"}`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function turnHasActivity(calls: readonly ToolCallLike[]): boolean {
  return calls.some(
    (call) =>
      call.function.name !== PRESENT_RESPONSE_TOOL_NAME &&
      call.function.name !== "navigate",
  );
}

export function callsForExpandedActivity<T extends ToolCallLike>(
  calls: readonly T[],
  richPlan: readonly RichBlock[],
): T[] {
  const mountedRichIds = new Set(
    richPlan.filter((block): block is { kind: "tool"; callId: string } => block.kind === "tool").map(
      (block) => block.callId,
    ),
  );
  return callsForActivity(calls).filter((call) => !mountedRichIds.has(call.id));
}
