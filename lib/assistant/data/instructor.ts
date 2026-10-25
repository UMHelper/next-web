import { McpToolError } from "@/lib/mcp/errors";
import type { GetInstructorOutput, InstructorCourseSummary } from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import supabaseServer from "@/lib/supabase/server";

import type { GetInstructorToolInput } from "../tool-schemas";

const PROF_COURSE_TABLE = "prof_with_course";
const PROF_COURSE_COLUMNS =
  "course_id, prof_id, result, grade, hard, reward, attendance, comments, is_offered";

const SORT_COLUMNS = {
  code: "course_id",
  result: "result",
  difficulty: "hard",
  commentCount: "comments",
} as const;

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

function toRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

function projectCourse(
  row: Record<string, unknown>,
  instructor: string,
): InstructorCourseSummary | null {
  const code = readText(row.course_id);
  if (!code) return null;

  const courseCode = code.toUpperCase();

  return {
    courseCode,
    commentCount: readCount(row.comments),
    result: readNumber(row.result),
    attendance: readNumber(row.attendance),
    grade: readNumber(row.grade),
    difficulty: readNumber(row.hard),
    reward: readNumber(row.reward),
    isOffered: readFlag(row.is_offered),
    courseUrl: absoluteUrl(buildCoursePath(courseCode)),
    reviewUrl: absoluteUrl(buildReviewPath(courseCode, instructor)),
  };
}

/**
 * Instructor course list with the assistant-only rating/difficulty/review
 * filters and sorting. The public MCP tool keeps its simpler fixed ordering.
 */
export async function getInstructorForAssistant(
  input: GetInstructorToolInput,
  signal: AbortSignal,
): Promise<GetInstructorOutput> {
  const offset = (input.page - 1) * input.limit;

  let builder = supabaseServer
    .from(PROF_COURSE_TABLE)
    .select(PROF_COURSE_COLUMNS, { count: "exact" })
    .eq("prof_id", input.name);

  if (input.minResult !== undefined) builder = builder.gte("result", input.minResult);
  if (input.maxDifficulty !== undefined) builder = builder.lte("hard", input.maxDifficulty);
  if (input.minCommentCount !== undefined) builder = builder.gte("comments", input.minCommentCount);
  if (input.offeredOnly === true) builder = builder.eq("is_offered", 1);

  builder = builder
    .order("is_offered", { ascending: false })
    .order(SORT_COLUMNS[input.sortBy], { ascending: input.sortOrder === "asc" })
    .order("course_id", { ascending: true })
    .range(offset, offset + input.limit - 1)
    .abortSignal(signal);

  const { data, error, count } = await builder;
  if (error) throw new McpToolError("temporarily_unavailable");

  const totalCount = typeof count === "number" && count >= 0 ? count : 0;
  if (totalCount === 0) throw new McpToolError("not_found");

  const courses = toRows(data)
    .map((row) => projectCourse(row, input.name))
    .filter((course): course is InstructorCourseSummary => course !== null);

  return {
    name: input.name,
    page: input.page,
    totalCount,
    hasMore: input.page * input.limit < totalCount,
    courses,
  };
}
