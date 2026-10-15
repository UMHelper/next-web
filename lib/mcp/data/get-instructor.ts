import { McpToolError } from "@/lib/mcp/errors";
import type {
  GetInstructorInput,
  GetInstructorOutput,
  InstructorCourseSummary,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import supabaseServer from "@/lib/supabase/server";

const PROF_COURSE_TABLE = "prof_with_course";

/**
 * Explicit projection columns. `prof_with_course` also carries the internal
 * `id`, `admin_note` and `admin_note_en`; they are never selected and every
 * returned object is rebuilt field by field anyway.
 */
const PROF_COURSE_COLUMNS =
  "course_id, prof_id, result, grade, hard, reward, attendance, comments, is_offered";

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
  return value.map((entry) =>
    entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {},
  );
}

/** Build a brand-new public course DTO field by field (never spread the row). */
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
 * Public instructor profile for the MCP tool boundary.
 *
 * `limit` and the page offset are pushed all the way into SQL (`.range(...)`)
 * instead of slicing a full result set in memory, per §8, and `count: "exact"`
 * supplies the total so the tool can tell the model whether another page exists.
 * Rows are then projected onto the public DTO, so mapping ids and admin notes
 * cannot reach `structuredContent`.
 *
 * `not_found` is reserved for an instructor with no courses at all — an empty
 * page beyond the end of a real list is a valid, empty answer, not an error.
 */
export async function getInstructor(
  input: GetInstructorInput,
  signal: AbortSignal,
): Promise<GetInstructorOutput> {
  const offset = (input.page - 1) * input.limit;
  const { data, error, count } = await supabaseServer
    .from(PROF_COURSE_TABLE)
    .select(PROF_COURSE_COLUMNS, { count: "exact" })
    .eq("prof_id", input.name)
    .order("is_offered", { ascending: false })
    .order("course_id", { ascending: true })
    .range(offset, offset + input.limit - 1)
    .abortSignal(signal);

  if (error) throw new McpToolError("temporarily_unavailable");

  const totalCount = typeof count === "number" && count >= 0 ? count : 0;
  if (totalCount === 0) throw new McpToolError("not_found");

  const rows = toRows(data);

  const courses = rows
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
