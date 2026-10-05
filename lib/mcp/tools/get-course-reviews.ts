import type { McpServer } from "@modelcontextprotocol/server";

import { getCourseReviews } from "@/lib/mcp/data/get-course-reviews";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type McpToolContext,
  type McpToolResult,
  executeMcpTool,
} from "@/lib/mcp/execute";
import {
  type CourseReview,
  type GetCourseReviewsOutput,
  getCourseReviewsInputSchema,
  getCourseReviewsOutputSchema,
  mcpGetCourseReviewsInputSchema,
  mcpGetCourseReviewsOutputSchema,
  mcpReadOnlyAnnotations,
} from "@/lib/mcp/schemas";

export const GET_COURSE_REVIEWS_TOOL_NAME = "get_course_reviews";

export const GET_COURSE_REVIEWS_ANNOTATIONS = {
  ...mcpReadOnlyAnnotations,
  title: "Get UMHelper course reviews (read-only)",
} as const;

export const GET_COURSE_REVIEWS_DESCRIPTION =
  "Read-only page of public top-level What2Reg @ UM (UMHelper) reviews for one course and " +
  "instructor. Each review carries its publication time, the original and English body (each " +
  "truncated to 600 characters), the average result, upvote/downvote counts and the public " +
  "verification badge; hidden entries and replies are never returned. Data is provided by " +
  "UMHelper and is not an official University of Macau statement. Keep and cite the returned " +
  "https://umeh.top review page URLs in factual answers, and use page/limit to walk older " +
  "reviews when more detail is needed.";

export const GET_COURSE_REVIEWS_TOOL_CONFIG = {
  title: "Get UMHelper course reviews",
  description: GET_COURSE_REVIEWS_DESCRIPTION,
  inputSchema: mcpGetCourseReviewsInputSchema,
  outputSchema: mcpGetCourseReviewsOutputSchema,
  annotations: GET_COURSE_REVIEWS_ANNOTATIONS,
};

/** Short fallback text preview; bounded by code points, not UTF-16 units. */
const SUMMARY_BODY_CODE_POINTS = 160;

function previewBody(review: CourseReview): string {
  const body = review.content ?? review.contentEn;
  if (body === null) return "(no body)";
  const codePoints = Array.from(body);
  if (codePoints.length <= SUMMARY_BODY_CODE_POINTS) return body;
  return `${codePoints.slice(0, SUMMARY_BODY_CODE_POINTS).join("")}…`;
}

function summarizeGetCourseReviews(output: GetCourseReviewsOutput): string {
  if (output.reviews.length === 0) {
    return (
      `No public top-level reviews are recorded for ${output.courseCode} by ${output.instructor} ` +
      `on page ${output.page}. Review page (keep this reference link): ${output.url}`
    );
  }

  return [
    `${output.courseCode} — ${output.instructor} — ${output.reviews.length} public review(s) on ` +
      `page ${output.page}. Review page (keep this reference link): ${output.url}`,
    ...output.reviews.map(
      (review) =>
        `- ${review.publishedAt ?? "unknown date"} — result ${review.result ?? "n/a"} — ` +
        `${review.upvotes} up / ${review.downvotes} down — ${previewBody(review)} — ${review.url}`,
    ),
  ].join("\n");
}

/**
 * Execute `get_course_reviews` through the shared MCP execution boundary:
 * authentication, both rate-limit tiers, the 10s budget, output validation and
 * the 64 KiB result cap all happen in `executeMcpTool`.
 *
 * Input is re-validated here (defense in depth) so a malformed argument set
 * becomes a stable `invalid_request` instead of reaching the data layer.
 */
export async function handleGetCourseReviews(
  input: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  return executeMcpTool<unknown, GetCourseReviewsOutput>({
    toolName: GET_COURSE_REVIEWS_TOOL_NAME,
    input,
    outputSchema: getCourseReviewsOutputSchema,
    ctx,
    run: async (rawInput, signal) => {
      const parsed = getCourseReviewsInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new McpToolError("invalid_request");
      return getCourseReviews(parsed.data, signal);
    },
    summarize: summarizeGetCourseReviews,
    countResults: (output) => output.reviews.length,
  });
}

export function registerGetCourseReviewsTool(server: McpServer): void {
  server.registerTool(GET_COURSE_REVIEWS_TOOL_NAME, GET_COURSE_REVIEWS_TOOL_CONFIG, (args, ctx) =>
    handleGetCourseReviews(args, { http: ctx.http, signal: ctx.mcpReq.signal }),
  );
}
