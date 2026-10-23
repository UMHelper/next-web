import { z } from "zod/v4";

import type { ToolFailure } from "@/lib/assistant/tools";
import {
  searchCatalogOutputSchema,
  type CatalogCourse,
  type CatalogInstructor,
} from "@/lib/mcp/schemas";

export const SEARCH_CATALOG_TOOL_NAME = "search_catalog";

export type SearchCatalogFailure =
  | "invalid_request"
  | "not_found"
  | "temporarily_unavailable"
  | "malformed";

export type SearchCatalogView =
  | { kind: "courses"; totalCount: number; hasMore: boolean; courses: CatalogCourse[] }
  | { kind: "instructors"; totalCount: number; hasMore: boolean; instructors: CatalogInstructor[] }
  | { kind: "empty"; searchType: "course" | "instructor" }
  | { kind: "failure"; reason: SearchCatalogFailure };

const FAILURE_CODES = [
  "invalid_request",
  "not_found",
  "temporarily_unavailable",
] as const satisfies readonly ToolFailure["error"][];

const toolFailureSchema = z.object({ error: z.enum(FAILURE_CODES) }).strict();

export function parseSearchCatalogResult(content: string): SearchCatalogView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "failure", reason: "malformed" };
  }

  const output = searchCatalogOutputSchema.safeParse(parsed);
  if (output.success) {
    const data = output.data;
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

  const failure = toolFailureSchema.safeParse(parsed);
  if (failure.success) {
    return { kind: "failure", reason: failure.data.error };
  }

  return { kind: "failure", reason: "malformed" };
}
