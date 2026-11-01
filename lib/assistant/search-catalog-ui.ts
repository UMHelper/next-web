import {
  searchCatalogOutputSchema,
  type CatalogCourse,
  type CatalogInstructor,
} from "@/lib/mcp/schemas";

import { parseToolResult, type ToolResultFailure } from "@/lib/assistant/tool-result";

export const SEARCH_CATALOG_TOOL_NAME = "search_catalog";

export type SearchCatalogFailure = ToolResultFailure;

export type SearchCatalogView =
  | { kind: "courses"; totalCount: number; hasMore: boolean; courses: CatalogCourse[] }
  | { kind: "instructors"; totalCount: number; hasMore: boolean; instructors: CatalogInstructor[] }
  | { kind: "empty"; searchType: "course" | "instructor" }
  | { kind: "failure"; reason: SearchCatalogFailure };

export function parseSearchCatalogResult(content: string): SearchCatalogView {
  const result = parseToolResult(content, searchCatalogOutputSchema);
  if (!result.ok) {
    return { kind: "failure", reason: result.reason };
  }

  const data = result.data;
  if (data.results.length === 0) {
    return { kind: "empty", searchType: data.type };
  }
  if (data.type === "course") {
    return {
      kind: "courses",
      totalCount: data.totalCount,
      hasMore: data.hasMore,
      courses: data.results,
    };
  }
  return {
    kind: "instructors",
    totalCount: data.totalCount,
    hasMore: data.hasMore,
    instructors: data.results,
  };
}
