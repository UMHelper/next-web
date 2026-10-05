import type { McpServer } from "@modelcontextprotocol/server";

import { getCourse } from "@/lib/mcp/data/get-course";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type McpToolContext,
  type McpToolResult,
  executeMcpTool,
} from "@/lib/mcp/execute";
import {
  type GetCourseOutput,
  getCourseInputSchema,
  getCourseOutputSchema,
  mcpGetCourseInputSchema,
  mcpGetCourseOutputSchema,
  mcpReadOnlyAnnotations,
} from "@/lib/mcp/schemas";

export const GET_COURSE_TOOL_NAME = "get_course";

export const GET_COURSE_ANNOTATIONS = {
  ...mcpReadOnlyAnnotations,
  title: "Get UMHelper course details (read-only)",
} as const;

export const GET_COURSE_DESCRIPTION =
  "Read-only lookup of one What2Reg @ UM (UMHelper) course by code. Returns the public catalog " +
  "fields (English and Chinese titles, credits, faculty, department, programme level, suggested " +
  "year, medium of instruction, grading system, course type, duration, a truncated description " +
  "and the offering flag) plus up to 20 instructor review summaries (name, comment count, and " +
  "the average result, attendance, grade, difficulty and reward scores). Data is provided by " +
  "UMHelper and is not an official University of Macau statement. Keep and cite the returned " +
  "https://umeh.top course and review URLs in factual answers, and call search_catalog first " +
  "when the exact course code is unknown.";

export const GET_COURSE_TOOL_CONFIG = {
  title: "Get UMHelper course details",
  description: GET_COURSE_DESCRIPTION,
  inputSchema: mcpGetCourseInputSchema,
  outputSchema: mcpGetCourseOutputSchema,
  annotations: GET_COURSE_ANNOTATIONS,
};

function summarizeGetCourse(output: GetCourseOutput): string {
  const title = output.course.titleEn ?? output.course.titleZh ?? "Untitled course";
  const lines = [`${output.course.courseCode} — ${title} — ${output.course.url}`];

  if (output.instructors.length === 0) {
    lines.push("No instructor review summaries are recorded for this course.");
  } else {
    lines.push("Instructors (keep these reference links):");
    for (const instructor of output.instructors) {
      lines.push(
        `- ${instructor.name} — ${instructor.commentCount} reviews — ${instructor.reviewUrl}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Execute `get_course` through the shared MCP execution boundary:
 * authentication, both rate-limit tiers, the 10s budget, output validation and
 * the 64 KiB result cap all happen in `executeMcpTool`.
 *
 * Input is re-validated here (defense in depth) so a malformed argument set
 * becomes a stable `invalid_request` instead of reaching the data layer.
 */
export async function handleGetCourse(
  input: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  return executeMcpTool<unknown, GetCourseOutput>({
    toolName: GET_COURSE_TOOL_NAME,
    input,
    outputSchema: getCourseOutputSchema,
    ctx,
    run: async (rawInput) => {
      const parsed = getCourseInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new McpToolError("invalid_request");
      return getCourse(parsed.data);
    },
    summarize: summarizeGetCourse,
    countResults: (output) => output.instructors.length,
  });
}

export function registerGetCourseTool(server: McpServer): void {
  server.registerTool(GET_COURSE_TOOL_NAME, GET_COURSE_TOOL_CONFIG, (args, ctx) =>
    handleGetCourse(args, { http: ctx.http, signal: ctx.mcpReq.signal }),
  );
}
