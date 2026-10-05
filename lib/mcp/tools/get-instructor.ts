import type { McpServer } from "@modelcontextprotocol/server";

import { getInstructor } from "@/lib/mcp/data/get-instructor";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type McpToolContext,
  type McpToolResult,
  executeMcpTool,
} from "@/lib/mcp/execute";
import {
  type GetInstructorOutput,
  getInstructorInputSchema,
  getInstructorOutputSchema,
  mcpGetInstructorInputSchema,
  mcpGetInstructorOutputSchema,
  mcpReadOnlyAnnotations,
} from "@/lib/mcp/schemas";

export const GET_INSTRUCTOR_TOOL_NAME = "get_instructor";

export const GET_INSTRUCTOR_ANNOTATIONS = {
  ...mcpReadOnlyAnnotations,
  title: "Get UMHelper instructor courses (read-only)",
} as const;

export const GET_INSTRUCTOR_DESCRIPTION =
  "Read-only lookup of one What2Reg @ UM (UMHelper) instructor by name. Returns the instructor " +
  "name and up to 20 courses that instructor teaches (course code, comment count, and the " +
  "average result, attendance, grade, difficulty and reward scores), each with its UMHelper " +
  "course and review links. Data is provided by UMHelper and is not an official University of " +
  "Macau statement. Keep and cite the returned https://umeh.top reference URLs in factual " +
  "answers, and call search_catalog first when the exact instructor name is unknown.";

export const GET_INSTRUCTOR_TOOL_CONFIG = {
  title: "Get UMHelper instructor courses",
  description: GET_INSTRUCTOR_DESCRIPTION,
  inputSchema: mcpGetInstructorInputSchema,
  outputSchema: mcpGetInstructorOutputSchema,
  annotations: GET_INSTRUCTOR_ANNOTATIONS,
};

function summarizeGetInstructor(output: GetInstructorOutput): string {
  if (output.courses.length === 0) {
    return `No courses are recorded for ${output.name} in the UMHelper catalog.`;
  }

  return [
    `${output.name} — ${output.courses.length} course(s) from the UMHelper catalog ` +
      "(keep these reference links):",
    ...output.courses.map(
      (course) => `- ${course.courseCode} — ${course.commentCount} reviews — ${course.courseUrl}`,
    ),
  ].join("\n");
}

/**
 * Execute `get_instructor` through the shared MCP execution boundary:
 * authentication, both rate-limit tiers, the 10s budget, output validation and
 * the 64 KiB result cap all happen in `executeMcpTool`.
 *
 * Input is re-validated here (defense in depth) so a malformed argument set
 * becomes a stable `invalid_request` instead of reaching the data layer.
 */
export async function handleGetInstructor(
  input: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  return executeMcpTool<unknown, GetInstructorOutput>({
    toolName: GET_INSTRUCTOR_TOOL_NAME,
    input,
    outputSchema: getInstructorOutputSchema,
    ctx,
    run: async (rawInput, signal) => {
      const parsed = getInstructorInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new McpToolError("invalid_request");
      return getInstructor(parsed.data, signal);
    },
    summarize: summarizeGetInstructor,
    countResults: (output) => output.courses.length,
  });
}

export function registerGetInstructorTool(server: McpServer): void {
  server.registerTool(GET_INSTRUCTOR_TOOL_NAME, GET_INSTRUCTOR_TOOL_CONFIG, (args, ctx) =>
    handleGetInstructor(args, { http: ctx.http, signal: ctx.mcpReq.signal }),
  );
}
