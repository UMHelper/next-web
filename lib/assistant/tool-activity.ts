import type { ToolMessage } from "@copilotkit/react-core/v2";

import { checkPlanConflictsResultSchema } from "@/lib/assistant/check-plan-conflicts";
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
  const result = checkPlanConflictsResultSchema.safeParse(parsed);
  if (!result.success) return "malformed";
  return result.data.status === "checked" ? "success" : "domain_error";
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
