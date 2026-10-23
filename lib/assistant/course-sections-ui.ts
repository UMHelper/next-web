import { getCourseSectionsOutputSchema, type GetCourseSectionsOutput } from "@/lib/mcp/schemas";

import { parseToolResult, type ToolResultFailure } from "@/lib/assistant/tool-result";

export const GET_COURSE_SECTIONS_TOOL_NAME = "get_course_sections";

export type CourseSectionsView =
  | { kind: "sections"; data: GetCourseSectionsOutput }
  | { kind: "empty"; courseCode: string; instructor: string }
  | { kind: "failure"; reason: ToolResultFailure };

const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export function formatWeekday(value: string): string {
  return WEEKDAY_LABELS[value] ?? value;
}

export function parseCourseSectionsResult(content: string): CourseSectionsView {
  const result = parseToolResult(content, getCourseSectionsOutputSchema);
  if (!result.ok) {
    return { kind: "failure", reason: result.reason };
  }

  if (result.data.sections.length === 0) {
    return {
      kind: "empty",
      courseCode: result.data.courseCode,
      instructor: result.data.instructor,
    };
  }

  return { kind: "sections", data: result.data };
}
