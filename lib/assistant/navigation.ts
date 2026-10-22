import { z } from "zod";

import { COURSE_CODE, NAME, type PageContext } from "@/lib/assistant/page-context";
import { faculty as FACULTIES, faculty_dept as FACULTY_DEPARTMENTS, normalizeFacultySlug } from "@/lib/consant";
import { buildCatalogPath, buildCoursePath } from "@/lib/site";
import { getCourseDetail, getInstructorCourses } from "@/lib/timetable/catalog-client";

export const NAVIGATION_TIMEOUT_MS = 10_000;
export const MAX_NAVIGATIONS_PER_MESSAGE = 1;

// The course API substitutes this title when the catalog has no row, the same signal lib/mcp/data/get-course.ts uses.
const MISSING_COURSE_TITLE = "Unknown Course";

export type Existence = "exists" | "missing" | "unavailable";
type CatalogLookups = {
  getCourseDetail: (code: string) => Promise<{ course: any; profList: any[] }>;
  getInstructorCourses: (prof: string) => Promise<{ courses: any[] }>;
};

export const NAVIGATE_DESCRIPTION =
  "Open a page on this site for the student: a course, an instructor, an instructor's reviews for a course, the catalog, or their timetable. Call it when the student's latest message asks to be taken to, open, see or look at one of these pages, in any language. Do not call it to answer a question about a course or instructor. It cannot open other sites and never changes the timetable.";

export const navigateParameters = z.object({
  destination: z
    .enum(["course", "professor", "reviews", "catalog", "timetable"])
    .describe("Which page to open"),
  code: z.string().max(20).optional().describe("Course code, for course and reviews, e.g. ACCT1000"),
  instructor: z
    .string()
    .max(80)
    .optional()
    .describe("Instructor name in English exactly as the tools returned it, for professor and reviews"),
  faculty: z.string().max(20).optional().describe("Faculty code for catalog, e.g. FST, or GECOURSE for general education"),
  department: z.string().max(10).optional().describe("Department code for catalog, only together with faculty, e.g. CIS"),
});

export type NavigationDestination =
  | { destination: "course"; code: string }
  | { destination: "professor"; instructor: string }
  | { destination: "reviews"; code: string; instructor: string }
  | { destination: "catalog"; faculty?: string; department?: string }
  | { destination: "timetable" };

export type NavigateResult =
  | { status: "navigated" | "already_here" | "landed_elsewhere"; page: PageContext }
  | {
      status:
        | "invalid_destination"
        | "not_found"
        | "unavailable"
        | "timeout"
        | "cancelled"
        | "busy"
        | "limit_reached";
    };

const FIELDS: Record<NavigationDestination["destination"], readonly string[]> = {
  course: ["code"],
  professor: ["instructor"],
  reviews: ["code", "instructor"],
  catalog: ["faculty", "department"],
  timetable: [],
};

function present(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== ""));
}

function matching(value: string | undefined, pattern: RegExp): string | null {
  if (value === undefined) return null;
  const normalized = value.trim().replace(/ +/g, " ").toUpperCase();
  return pattern.test(normalized) ? normalized : null;
}

function parseCatalog(faculty?: string, department?: string): NavigationDestination | null {
  if (faculty === undefined) return department === undefined ? { destination: "catalog" } : null;
  const slug = normalizeFacultySlug(faculty.trim());
  if (!FACULTIES.includes(slug)) return null;
  if (department === undefined) return { destination: "catalog", faculty: slug };
  const departments: string[] = FACULTY_DEPARTMENTS[slug] ?? [];
  const code = department.trim().toUpperCase();
  return departments.includes(code) ? { destination: "catalog", faculty: slug, department: code } : null;
}

export function parseDestination(input: unknown): NavigationDestination | null {
  const parsed = navigateParameters.strict().safeParse(present(input));
  if (!parsed.success) return null;
  const { destination, ...fields } = parsed.data;
  if (Object.keys(fields).some((key) => !FIELDS[destination].includes(key))) return null;

  switch (destination) {
    case "course": {
      const code = matching(fields.code, COURSE_CODE);
      return code ? { destination, code } : null;
    }
    case "professor": {
      const instructor = matching(fields.instructor, NAME);
      return instructor ? { destination, instructor } : null;
    }
    case "reviews": {
      const code = matching(fields.code, COURSE_CODE);
      const instructor = matching(fields.instructor, NAME);
      return code && instructor ? { destination, code, instructor } : null;
    }
    case "catalog":
      return parseCatalog(fields.faculty, fields.department);
    case "timetable":
      return { destination };
  }
}

// `/` inside a name must become `$`: the reviews and professor routes do not resolve a `%2F` segment.
const instructorSegment = (name: string) => encodeURIComponent(name).replaceAll("%2F", "$");

export function buildNavigationPath(destination: NavigationDestination): string {
  switch (destination.destination) {
    case "course":
      return buildCoursePath(destination.code);
    case "professor":
      return `/professor/${instructorSegment(destination.instructor)}`;
    case "reviews":
      return `/reviews/${encodeURIComponent(destination.code)}/${instructorSegment(destination.instructor)}`;
    case "catalog":
      if (!destination.faculty) return "/catalog";
      return buildCatalogPath(
        destination.department ? [destination.faculty, destination.department] : [destination.faculty],
      );
    case "timetable":
      return "/timetable";
  }
}

export async function verifyDestination(
  destination: NavigationDestination,
  lookups: CatalogLookups = { getCourseDetail, getInstructorCourses },
): Promise<Existence> {
  try {
    switch (destination.destination) {
      case "course": {
        const { course, profList } = await lookups.getCourseDetail(destination.code);
        return profList.length > 0 || course?.courseTitle !== MISSING_COURSE_TITLE ? "exists" : "missing";
      }
      case "professor": {
        const { courses } = await lookups.getInstructorCourses(destination.instructor);
        return courses.length > 0 ? "exists" : "missing";
      }
      case "reviews": {
        const { courses } = await lookups.getInstructorCourses(destination.instructor);
        return courses.some((row) => String(row.course_id).toUpperCase() === destination.code) ? "exists" : "missing";
      }
      default:
        return "exists";
    }
  } catch {
    return "unavailable";
  }
}

export type MessageLike = {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolCalls?: ReadonlyArray<{ id: string; function: { name: string } }>;
};

// The router was pushed for these, so the page changed or may still be changing.
const OPENED_STATUSES: ReadonlySet<string> = new Set(["navigated", "landed_elsewhere", "timeout"]);

function resultStatus(content: unknown): string | undefined {
  if (typeof content !== "string") return undefined;
  try {
    const status = JSON.parse(content)?.status;
    return typeof status === "string" ? status : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pages opened since the student's latest message. CopilotKit's follow-up runs after a frontend
 * tool add no user message, so the count carries across every continuation of the same turn.
 */
export function navigationsSinceLastUserMessage(messages: ReadonlyArray<MessageLike>): number {
  let start = messages.length;
  while (start > 0 && messages[start - 1].role !== "user") start--;
  const turn = messages.slice(start);

  const navigateCalls = new Set(
    turn.flatMap((message) => message.toolCalls?.filter((call) => call.function.name === "navigate").map((call) => call.id) ?? []),
  );
  return turn.filter(
    (message) =>
      message.role === "tool" &&
      message.toolCallId !== undefined &&
      navigateCalls.has(message.toolCallId) &&
      OPENED_STATUSES.has(resultStatus(message.content) ?? ""),
  ).length;
}

export const samePage = (a: PageContext, b: PageContext) => JSON.stringify(a) === JSON.stringify(b);
