import { getCourseOutputSchema, type GetCourseOutput } from "@/lib/mcp/schemas";

import { parseToolResult, type ToolResultFailure } from "@/lib/assistant/tool-result";

export const GET_COURSE_TOOL_NAME = "get_course";

export type CourseDetailView =
  | { kind: "course"; data: GetCourseOutput }
  | { kind: "failure"; reason: ToolResultFailure };

export function parseCourseDetailResult(content: string): CourseDetailView {
  const result = parseToolResult(content, getCourseOutputSchema);
  if (result.ok) {
    return { kind: "course", data: result.data };
  }
  return { kind: "failure", reason: result.reason };
}
