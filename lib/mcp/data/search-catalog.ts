import { McpToolError } from "@/lib/mcp/errors";
import type {
  CatalogCourse,
  CatalogInstructor,
  SearchCatalogInput,
  SearchCatalogOutput,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath, buildProfessorPath } from "@/lib/site";
import supabaseServer from "@/lib/supabase/server";

/**
 * Controlled catalog RPCs. These are the same read-only functions the signed-in
 * timetable workbench uses; they apply `limit`/`offset` in SQL, so the MCP layer
 * never slices a full table in memory.
 */
const COURSE_RPC = "search_planner_courses";
const INSTRUCTOR_RPC = "search_planner_instructors";

/**
 * The RPCs return `total_count` (a window count over the whole filtered set) on
 * every row, which is what makes real pagination possible: the tool reports the
 * total and whether another page exists so the model can page deliberately.
 */
function readTotalCount(rows: Record<string, unknown>[], fallback: number): number {
  const raw = rows[0]?.total_count;
  const total = Number(raw);
  return Number.isFinite(total) && total >= 0 ? Math.trunc(total) : fallback;
}

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toRowList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) =>
    entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {},
  );
}

/**
 * Build a brand-new public course DTO field by field. The raw RPC row is never
 * spread or forwarded, so `total_count`, internal ids and future columns cannot
 * reach the model.
 */
function projectCourse(row: Record<string, unknown>): CatalogCourse | null {
  const code = readText(row.course_code);
  if (!code) return null;

  return {
    courseCode: code.toUpperCase(),
    titleEn: readText(row.course_title_eng),
    titleZh: readText(row.course_title_chi),
    faculty: readText(row.offering_unit),
    department: readText(row.offering_department),
    credits: readText(row.credits),
    isOffered: Number(row.is_offered) === 1,
    url: absoluteUrl(buildCoursePath(code)),
  };
}

/**
 * Instructor projection. `prof_id` is the public display name used by the site's
 * professor pages — not an internal mapping id. The row-level `total_count` is
 * read separately (see `readTotalCount`) and never spread onto the DTO.
 */
function projectInstructor(row: Record<string, unknown>): CatalogInstructor | null {
  const name = readText(row.prof_id);
  if (!name) return null;

  const count = Number(row.course_count);

  return {
    name,
    courseCount: Number.isFinite(count) ? count : 0,
    url: absoluteUrl(buildProfessorPath(name)),
  };
}

/**
 * Read-only catalog search for the MCP tool boundary.
 *
 * Both branches use the whitelisted RPCs and project each row onto the public
 * contract. Supabase failures collapse to a generic `temporarily_unavailable`
 * (never the RPC message) and the caller's signal is forwarded so a cancelled or
 * timed-out tool call stops the downstream request.
 */
export async function searchCatalog(
  query: SearchCatalogInput,
  signal: AbortSignal,
): Promise<SearchCatalogOutput> {
  const isInstructor = query.type === "instructor";
  const { data, error } = await supabaseServer
    .rpc(isInstructor ? INSTRUCTOR_RPC : COURSE_RPC, {
      keyword: query.query ?? null,
      faculty: query.faculty ?? null,
      department: query.department ?? null,
      page_limit: query.limit,
      page_offset: (query.page - 1) * query.limit,
    })
    .abortSignal(signal);

  if (error) throw new McpToolError("temporarily_unavailable");

  const rows = toRowList(data);

  if (isInstructor) {
    const results = rows
      .map(projectInstructor)
      .filter((row): row is CatalogInstructor => row !== null);
    const totalCount = readTotalCount(rows, results.length);
    return {
      type: "instructor",
      page: query.page,
      totalCount,
      hasMore: query.page * query.limit < totalCount,
      results,
    };
  }

  const results = rows.map(projectCourse).filter((row): row is CatalogCourse => row !== null);
  const totalCount = readTotalCount(rows, results.length);
  return {
    type: "course",
    page: query.page,
    totalCount,
    hasMore: query.page * query.limit < totalCount,
    results,
  };
}
