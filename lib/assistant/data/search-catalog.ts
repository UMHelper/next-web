import { McpToolError } from "@/lib/mcp/errors";
import type { CatalogCourse, SearchCatalogInput, SearchCatalogOutput } from "@/lib/mcp/schemas";
import { searchCatalog as searchCatalogBase } from "@/lib/mcp/data/search-catalog";
import { absoluteUrl, buildCoursePath } from "@/lib/site";
import supabaseServer from "@/lib/supabase/server";

import type { CountCoursesInput, SearchCatalogToolInput } from "../tool-schemas";

const COURSE_COLUMNS =
  "New_code,courseTitleEng,courseTitleChi,Offering_Unit,Offering_Department,Credits,Is_Offered";

type CourseQuery = SearchCatalogToolInput | CountCoursesInput;

const SEARCH_FIELDS = {
  code_title: ["New_code", "courseTitleEng", "courseTitleChi"],
  content: ["courseTitleEng", "courseTitleChi", "courseDescription", "ilo"],
  all: ["New_code", "courseTitleEng", "courseTitleChi", "courseDescription", "ilo"],
} as const;

const SORT_COLUMNS = {
  code: "New_code",
  title: "courseTitleEng",
  credits: "Credits",
  suggestedYear: "suggestedYearOfStudy",
  isOffered: "Is_Offered",
} as const;

/**
 * PostgREST `or=` values are comma/parenthesis delimited, so a model-supplied
 * term must never be able to inject another filter. Only letters, numbers,
 * spaces and hyphens survive; PostgreSQL still receives the value as a bind
 * parameter through PostgREST.
 */
export function sanitizeSearchTerm(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

function projectCourse(row: Record<string, unknown>): CatalogCourse | null {
  const code = readText(row.New_code);
  if (!code) return null;

  return {
    courseCode: code.toUpperCase(),
    titleEn: readText(row.courseTitleEng),
    titleZh: readText(row.courseTitleChi),
    faculty: readText(row.Offering_Unit),
    department: readText(row.Offering_Department),
    credits: readText(row.Credits),
    isOffered: Number(row.Is_Offered) === 1,
    url: absoluteUrl(buildCoursePath(code)),
  };
}

function hasAdvancedFilters(input: CourseQuery): boolean {
  return Boolean(
    input.credits ||
      input.courseType ||
      input.programLevel ||
      input.suggestedYear !== undefined ||
      input.offeredOnly === true ||
      input.searchIn !== "code_title",
  );
}

function applyFilters(builder: any, input: CourseQuery): any {
  let next = builder;
  if (input.faculty) next = next.eq("Offering_Unit", input.faculty);
  if (input.department) next = next.eq("Offering_Department", input.department);
  if (input.credits) next = next.eq("Credits", input.credits);
  if (input.courseType) next = next.eq("courseType", input.courseType);
  if (input.programLevel) next = next.eq("offeringProgLevel", input.programLevel);
  if (input.suggestedYear !== undefined) {
    next = next.eq("suggestedYearOfStudy", input.suggestedYear);
  }
  if (input.offeredOnly === true) next = next.eq("Is_Offered", 1);
  return next;
}

function applyTerm(builder: any, input: CourseQuery): any {
  const term = sanitizeSearchTerm(input.query);
  if (!term) return builder;

  const filters = SEARCH_FIELDS[input.searchIn].map((field) => `${field}.ilike.%${term}%`).join(",");
  return builder.or(filters);
}

async function searchCoursesDirect(
  input: SearchCatalogToolInput,
  signal: AbortSignal,
): Promise<SearchCatalogOutput> {
  const offset = (input.page - 1) * input.limit;
  const sortColumn = SORT_COLUMNS[input.sortBy];

  const builder = await applyTerm(applyFilters(supabaseServer.from("course_catalog").select(COURSE_COLUMNS, { count: "exact" }), input), input)
    .order(sortColumn, { ascending: input.sortOrder === "asc" })
    .range(offset, offset + input.limit - 1)
    .abortSignal(signal);

  if (builder.error) throw new McpToolError("temporarily_unavailable");

  const totalCount = typeof builder.count === "number" && builder.count >= 0 ? builder.count : 0;
  const results = toRows(builder.data)
    .map(projectCourse)
    .filter((course): course is CatalogCourse => course !== null);

  return {
    type: "course",
    page: input.page,
    totalCount,
    hasMore: input.page * input.limit < totalCount,
    results,
  };
}

/**
 * Course search for the in-site assistant.
 *
 * Plain code/title/faculty/department searches still go through the controlled
 * `search_planner_courses` RPC, which also matches equivalent (renamed) course
 * codes. Anything the RPC cannot express — content search, exact filters and
 * sorting — is read directly from the `course_catalog` view under the service
 * role, with projected fields and an exact count.
 */
export async function searchCatalogForAssistant(
  input: SearchCatalogToolInput,
  signal: AbortSignal,
): Promise<SearchCatalogOutput> {
  if (input.type === "instructor") {
    return searchCatalogBase(
      {
        type: "instructor",
        query: input.query,
        faculty: input.faculty,
        department: input.department,
        limit: input.limit,
        page: input.page,
      } as SearchCatalogInput,
      signal,
    );
  }

  if (hasAdvancedFilters(input) || input.sortBy !== "code" || input.sortOrder !== "asc") {
    return searchCoursesDirect(input, signal);
  }

  return searchCatalogBase(
    {
      type: "course",
      query: input.query,
      faculty: input.faculty,
      department: input.department,
      limit: input.limit,
      page: input.page,
    } as SearchCatalogInput,
    signal,
  );
}

async function countCoursesDirect(input: CountCoursesInput, signal: AbortSignal): Promise<number> {
  const builder = await applyTerm(applyFilters(supabaseServer.from("course_catalog").select("*", { count: "exact", head: true }), input), input).abortSignal(signal);

  if (builder.error) throw new McpToolError("temporarily_unavailable");
  return typeof builder.count === "number" && builder.count >= 0 ? builder.count : 0;
}

/** Count-only path used before the model states how many courses match. */
export async function countCoursesForAssistant(
  input: CountCoursesInput,
  signal: AbortSignal,
): Promise<{ totalCount: number }> {
  if (!hasAdvancedFilters(input)) {
    const result = await searchCatalogBase(
      {
        type: "course",
        query: input.query,
        faculty: input.faculty,
        department: input.department,
        limit: 1,
        page: 1,
      } as SearchCatalogInput,
      signal,
    );

    return { totalCount: result.type === "course" ? result.totalCount : 0 };
  }

  return { totalCount: await countCoursesDirect(input, signal) };
}
