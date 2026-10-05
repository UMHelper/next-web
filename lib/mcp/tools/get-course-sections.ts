import type { McpServer } from "@modelcontextprotocol/server";

import { getCourseSections } from "@/lib/mcp/data/get-course-sections";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type McpToolContext,
  type McpToolResult,
  executeMcpTool,
} from "@/lib/mcp/execute";
import {
  type GetCourseSectionsOutput,
  getCourseSectionsInputSchema,
  getCourseSectionsOutputSchema,
  mcpGetCourseSectionsInputSchema,
  mcpGetCourseSectionsOutputSchema,
  mcpReadOnlyAnnotations,
} from "@/lib/mcp/schemas";

export const GET_COURSE_SECTIONS_TOOL_NAME = "get_course_sections";

export const GET_COURSE_SECTIONS_ANNOTATIONS = {
  ...mcpReadOnlyAnnotations,
  title: "Get UMHelper course sections (read-only)",
} as const;

export const GET_COURSE_SECTIONS_DESCRIPTION =
  "Read-only lookup of the current-term class sections for one What2Reg @ UM (UMHelper) course " +
  "and instructor. Returns up to 20 sections with up to 20 meeting times each (weekday, start " +
  "and end time, classroom location) plus the UMHelper course link. Only the public course " +
  "catalog is read; no personal or saved timetable is ever accessed. Data is provided by " +
  "UMHelper and is not an official University of Macau statement. Keep and cite the returned " +
  "https://umeh.top course URL in factual answers.";

export const GET_COURSE_SECTIONS_TOOL_CONFIG = {
  title: "Get UMHelper course sections",
  description: GET_COURSE_SECTIONS_DESCRIPTION,
  inputSchema: mcpGetCourseSectionsInputSchema,
  outputSchema: mcpGetCourseSectionsOutputSchema,
  annotations: GET_COURSE_SECTIONS_ANNOTATIONS,
};

function summarizeGetCourseSections(output: GetCourseSectionsOutput): string {
  if (output.sections.length === 0) {
    return (
      `No class sections are recorded for ${output.courseCode} by ${output.instructor} in the ` +
      `current UMHelper catalog. Course page (keep this reference link): ${output.courseUrl}`
    );
  }

  const lines = [
    `${output.courseCode} — ${output.instructor} — ${output.sections.length} section(s). ` +
      `Course page (keep this reference link): ${output.courseUrl}`,
  ];

  for (const section of output.sections) {
    if (section.schedules.length === 0) {
      lines.push(`- Section ${section.section}: no usable meeting time recorded.`);
      continue;
    }
    const slots = section.schedules
      .map(
        (schedule) =>
          `${schedule.weekday} ${schedule.startTime}-${schedule.endTime}` +
          (schedule.location === null ? "" : ` @ ${schedule.location}`),
      )
      .join("; ");
    lines.push(`- Section ${section.section}: ${slots}`);
  }

  return lines.join("\n");
}

/**
 * Execute `get_course_sections` through the shared MCP execution boundary:
 * authentication, both rate-limit tiers, the 10s budget, output validation and
 * the 64 KiB result cap all happen in `executeMcpTool`.
 *
 * Input is re-validated here (defense in depth) so a malformed argument set
 * becomes a stable `invalid_request` instead of reaching the data layer.
 */
export async function handleGetCourseSections(
  input: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  return executeMcpTool<unknown, GetCourseSectionsOutput>({
    toolName: GET_COURSE_SECTIONS_TOOL_NAME,
    input,
    outputSchema: getCourseSectionsOutputSchema,
    ctx,
    run: async (rawInput) => {
      const parsed = getCourseSectionsInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new McpToolError("invalid_request");
      return getCourseSections(parsed.data);
    },
    summarize: summarizeGetCourseSections,
    countResults: (output) => output.sections.length,
  });
}

export function registerGetCourseSectionsTool(server: McpServer): void {
  server.registerTool(GET_COURSE_SECTIONS_TOOL_NAME, GET_COURSE_SECTIONS_TOOL_CONFIG, (args, ctx) =>
    handleGetCourseSections(args, { http: ctx.http, signal: ctx.mcpReq.signal }),
  );
}
