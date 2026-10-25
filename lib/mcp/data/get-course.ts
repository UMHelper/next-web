import { resolveCourseAlias } from "@/lib/database/course-alias";
import { fetchCourseInfo } from "@/lib/database/get-course-info";
import { McpToolError } from "@/lib/mcp/errors";
import type {
  CourseDetail,
  CourseInstructorSummary,
  GetCourseInput,
  GetCourseOutput,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";

const MAX_INSTRUCTORS = 20;
const MAX_DESCRIPTION_CODE_POINTS = 1200;

/**
 * `normalizeLocalCourseInfo` substitutes this literal whenever the catalog row
 * is absent, so it is the only "course does not exist" signal the cached helper
 * exposes. A row that still lists instructors is treated as present even when
 * its title is missing.
 */
const MISSING_COURSE_TITLE = "Unknown Course";
const NORMALIZER_PLACEHOLDER = "Unknown";

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readCatalogText(value: unknown): string | null {
  const text = readText(value);
  if (text === NORMALIZER_PLACEHOLDER) return null;
  return text;
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
 * Truncate by Unicode code points, never UTF-16 units: `.slice()` on a string
 * can split an astral character into two lone surrogates.
 */
function truncateDescription(value: string | null): string | null {
  if (value === null) return null;
  const codePoints = Array.from(value);
  if (codePoints.length <= MAX_DESCRIPTION_CODE_POINTS) return value;
  return codePoints.slice(0, MAX_DESCRIPTION_CODE_POINTS).join("");
}

type CourseInfo = Awaited<ReturnType<typeof fetchCourseInfo>>;

/** Build a brand-new public course DTO field by field (never spread the row). */
function projectCourse(
  course: CourseInfo["course"],
  code: string,
  isOffered: boolean,
  aka: string[],
): CourseDetail {
  return {
    courseCode: code,
    titleEn: readText(course.courseTitle),
    titleZh: readText(course.courseTitleChi),
    credits: readCatalogText(course.credits),
    faculty: readCatalogText(course.offeringUnit),
    department: readCatalogText(course.offeringDept),
    programLevel: readCatalogText(course.offeringProgLevel),
    suggestedYear: readCatalogText(course.suggestedYearOfStudy),
    medium: readCatalogText(course.mediumOfInstruction),
    gradingSystem: readCatalogText(course.gradingSystem),
    courseType: readCatalogText(course.courseType),
    duration: readCatalogText(course.duration),
    description: truncateDescription(readText(course.courseDescription)),
    aka,
    isOffered,
    url: absoluteUrl(buildCoursePath(code)),
  };
}

/**
 * Project one `prof_with_course` row onto the public instructor summary.
 * `id`, `admin_note`, `admin_note_en` and unknown future columns are dropped by
 * construction; `hard` is the site's "difficulty" score.
 */
function projectInstructor(
  row: Record<string, unknown>,
  code: string,
): CourseInstructorSummary | null {
  const name = readText(row.prof_id);
  if (!name) return null;

  return {
    name,
    commentCount: readCount(row.comments),
    result: readNumber(row.result),
    attendance: readNumber(row.attendance),
    grade: readNumber(row.grade),
    difficulty: readNumber(row.hard),
    reward: readNumber(row.reward),
    isOffered: readFlag(row.is_offered),
    reviewUrl: absoluteUrl(buildReviewPath(code, name)),
  };
}

/**
 * Public course detail for the MCP tool boundary.
 *
 * The cached data helper returns the normalized course plus its instructor rows;
 * this adapter only reads those values and immediately maps them onto the public
 * DTO, so no raw row or internal mapping id can reach `structuredContent`.
 */
export async function getCourse(input: GetCourseInput): Promise<GetCourseOutput> {
  const alias = await resolveCourseAlias(input.code);
  const { course, profList, isOffer } = await fetchCourseInfo(alias.primaryCode);

  if (course.courseTitle === MISSING_COURSE_TITLE && profList.length === 0) {
    throw new McpToolError("not_found");
  }

  // The cached course helper already returns every instructor row for the course,
  // so the page is sliced from that list — exact totalCount with no extra query.
  // Historical codes resolve to the new primary code; links use that primary.
  const primaryCode = course.courseCode;
  const allInstructors = profList
    .map((row) => projectInstructor(row, primaryCode))
    .filter((row): row is CourseInstructorSummary => row !== null);

  const offset = (input.page - 1) * MAX_INSTRUCTORS;

  return {
    course: projectCourse(course, primaryCode, isOffer, alias.aka),
    page: input.page,
    totalCount: allInstructors.length,
    hasMore: input.page * MAX_INSTRUCTORS < allInstructors.length,
    instructors: allInstructors.slice(offset, offset + MAX_INSTRUCTORS),
  };
}
