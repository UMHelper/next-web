import { collectCatalogSearchSnapshots } from "@/lib/assistant/catalog-research";
import { courseCallIdentity, lookupOk, type ToolCallLike, toolMessageContent } from "@/lib/assistant/presentation";
import { GET_COURSE_TOOL_NAME, parseCourseDetailResult } from "@/lib/assistant/course-detail-ui";
import type { CatalogCourse } from "@/lib/mcp/schemas";

function courseDetailToCatalogCourse(course: {
  courseCode: string;
  titleEn: string | null;
  titleZh: string | null;
  faculty: string | null;
  department: string | null;
  credits: string | null;
  isOffered: boolean;
  aka: string[];
  url: string;
}): CatalogCourse {
  return {
    courseCode: course.courseCode.trim().toUpperCase(),
    titleEn: course.titleEn,
    titleZh: course.titleZh,
    faculty: course.faculty,
    department: course.department,
    credits: course.credits,
    isOffered: course.isOffered,
    aka: course.aka,
    url: course.url,
  };
}

export function hydrateRecommendationCourse(
  code: string,
  calls: readonly ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): CatalogCourse | null {
  const normalized = code.trim().toUpperCase();

  for (const call of calls) {
    if (call.function.name !== GET_COURSE_TOOL_NAME) continue;
    const content = toolMessageContent(results.get(call.id)?.content);
    if (!lookupOk(GET_COURSE_TOOL_NAME, content) || typeof content !== "string") continue;
    const identity = courseCallIdentity(call, content);
    const match =
      identity.canonical === normalized ||
      identity.argument === normalized ||
      identity.canonical === code ||
      identity.argument === code;
    if (!match) continue;
    const parsed = parseCourseDetailResult(content);
    if (parsed.kind !== "course") continue;
    return courseDetailToCatalogCourse(parsed.data.course);
  }

  for (const snapshot of collectCatalogSearchSnapshots(calls, results)) {
    for (const course of snapshot.courses) {
      if (course.courseCode.trim().toUpperCase() === normalized) {
        return course;
      }
    }
  }

  return null;
}

export function hydrateRecommendationCourses(
  courses: readonly string[],
  calls: readonly ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): CatalogCourse[] {
  const hydrated: CatalogCourse[] = [];
  for (const code of courses) {
    const course = hydrateRecommendationCourse(code, calls, results);
    if (course) hydrated.push(course);
  }
  return hydrated;
}
