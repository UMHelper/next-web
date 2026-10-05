import { getReviewInfo } from "@/lib/database/get-prof-info";
import { McpToolError } from "@/lib/mcp/errors";
import type {
  CourseReview,
  GetCourseReviewsInput,
  GetCourseReviewsOutput,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildReviewPath } from "@/lib/site";
import supabaseServer from "@/lib/supabase/server";

/** Controlled review-page RPC. The site's fixed-20 helper is deliberately unused. */
const COMMENT_PAGE_RPC = "get_comment_page_v2";

/** §6.4: each body is capped at 600 Unicode code points, not UTF-16 units. */
const MAX_BODY_CODE_POINTS = 600;

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readCount(value: unknown): number {
  const num = readNumber(value);
  return num === null ? 0 : Math.max(0, Math.trunc(num));
}

function readFlag(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

/**
 * Truncate a review body by Unicode code points, never UTF-16 units: `.slice()`
 * can split an astral character into two lone surrogates.
 */
export function truncateReviewBody(value: unknown): string | null {
  const text = readText(value);
  if (text === null) return null;
  const codePoints = Array.from(text);
  if (codePoints.length <= MAX_BODY_CODE_POINTS) return text;
  return codePoints.slice(0, MAX_BODY_CODE_POINTS).join("");
}

/**
 * §6.4 visibility rule: only top-level reviews that are not hidden. A hidden or
 * reply row is dropped before its body is even read into a DTO.
 */
export function isPublicTopLevelReview(row: Record<string, unknown>): boolean {
  if (row.replyto !== null && row.replyto !== undefined) return false;
  return Number(row.hidden) !== 1;
}

/** Keep only object rows so a malformed RPC payload cannot become a fake review. */
function toRowList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

/**
 * Build a brand-new public review DTO field by field (never spread the row).
 * `upvote_count`/`downvote_count` are the aggregate counters; the legacy
 * `upvote`/`downvote`, the vote history and the emoji breakdown are dropped.
 */
function projectReview(row: Record<string, unknown>, url: string): CourseReview {
  return {
    publishedAt: readText(row.pub_time),
    content: truncateReviewBody(row.content),
    contentEn: truncateReviewBody(row.content_en),
    result: readNumber(row.result),
    upvotes: readCount(row.upvote_count),
    downvotes: readCount(row.downvote_count),
    verified: readFlag(row.verify),
    url,
  };
}

/**
 * Public top-level review page for the MCP tool boundary.
 *
 * The internal `prof_with_course` mapping is resolved first (the RPC keys off
 * that relation id), then the controlled RPC is called with the caller's page
 * size and a zero-based page. `target_viewer_id` is always null, so no
 * viewer-specific vote history can be produced. The output is projected onto the
 * public DTO, which is why no internal id or author field can reach
 * `structuredContent`.
 */
export async function getCourseReviews(
  input: GetCourseReviewsInput,
  signal: AbortSignal,
): Promise<GetCourseReviewsOutput> {
  const mapping = await getReviewInfo(input.code, input.instructor);
  if (!mapping) throw new McpToolError("not_found");

  const { data, error } = await supabaseServer
    .rpc(COMMENT_PAGE_RPC, {
      target_course_id: Number(mapping.id),
      target_page: input.page - 1,
      target_page_size: input.limit,
      target_viewer_id: null,
    })
    .abortSignal(signal);

  if (error) throw new McpToolError("temporarily_unavailable");

  const url = absoluteUrl(buildReviewPath(input.code, input.instructor, input.page));
  const reviews = toRowList(data)
    .filter(isPublicTopLevelReview)
    .map((row) => projectReview(row, url));

  return {
    courseCode: input.code,
    instructor: input.instructor,
    page: input.page,
    url,
    reviews,
  };
}
