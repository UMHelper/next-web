import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import type { PopularCourseRow } from "@/lib/database/types";
import supabaseServer from "@/lib/supabase/server";

export const POPULAR_COURSE_DAYS = 30;
export const POPULAR_COURSE_LIMIT = 5;

const FALLBACK_COMMENT_LIMIT = 1000;
const QUERY_CHUNK_SIZE = 200;

type PopularCourseRpcRow = {
  course_code: string;
  course_title_eng: string;
  course_title_chi: string | null;
  offering_unit: string;
  comment_count: number | string;
  avg_result: number | string | null;
  latest_comment_at: string;
};

export type RecentCommentRow = {
  course_id: number;
  result: number | null;
  pub_time: string;
};

export type CourseLinkRow = {
  id: number;
  course_id: string;
};

export type CourseMetaRow = {
  New_code: string;
  courseTitleEng: string;
  courseTitleChi: string | null;
  Offering_Unit: string;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapPopularCourseRpcRow(row: PopularCourseRpcRow): PopularCourseRow {
  return {
    courseCode: row.course_code,
    courseTitleEng: row.course_title_eng,
    courseTitleChi: row.course_title_chi ?? null,
    offeringUnit: row.offering_unit,
    commentCount: toNumber(row.comment_count),
    avgResult: toNumber(row.avg_result),
    latestCommentAt: row.latest_comment_at,
  };
}

function comparePopularCourses(a: PopularCourseRow, b: PopularCourseRow) {
  if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;

  const bTime = Date.parse(b.latestCommentAt) || 0;
  const aTime = Date.parse(a.latestCommentAt) || 0;
  if (bTime !== aTime) return bTime - aTime;

  return a.courseCode.localeCompare(b.courseCode);
}

export function aggregatePopularCourses(
  comments: RecentCommentRow[],
  links: CourseLinkRow[],
  courses: CourseMetaRow[],
  limit = POPULAR_COURSE_LIMIT,
): PopularCourseRow[] {
  const courseByRelationId = new Map(links.map((link) => [link.id, link.course_id]));
  const courseByCode = new Map(courses.map((course) => [course.New_code, course]));
  const stats = new Map<
    string,
    {
      commentCount: number;
      resultTotal: number;
      resultCount: number;
      latestCommentAt: string;
    }
  >();

  for (const comment of comments) {
    const courseCode = courseByRelationId.get(comment.course_id);
    if (!courseCode) continue;

    const current = stats.get(courseCode) ?? {
      commentCount: 0,
      resultTotal: 0,
      resultCount: 0,
      latestCommentAt: comment.pub_time,
    };

    current.commentCount += 1;
    if (comment.result !== null) {
      current.resultTotal += comment.result;
      current.resultCount += 1;
    }
    if (comment.pub_time > current.latestCommentAt) {
      current.latestCommentAt = comment.pub_time;
    }

    stats.set(courseCode, current);
  }

  return [...stats.entries()]
    .map(([courseCode, stat]) => {
      const course = courseByCode.get(courseCode);
      if (!course) return null;

      return {
        courseCode,
        courseTitleEng: course.courseTitleEng,
        courseTitleChi: course.courseTitleChi ?? null,
        offeringUnit: course.Offering_Unit,
        commentCount: stat.commentCount,
        avgResult: stat.resultCount > 0 ? stat.resultTotal / stat.resultCount : 0,
        latestCommentAt: stat.latestCommentAt,
      } satisfies PopularCourseRow;
    })
    .filter((row): row is PopularCourseRow => row !== null)
    .sort(comparePopularCourses)
    .slice(0, Math.max(0, limit));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function fallbackSince() {
  return new Date(Date.now() - POPULAR_COURSE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

async function loadFallbackSources(since: string) {
  const { data: commentData, error: commentError } = await supabaseServer
    .from("comment")
    .select("course_id,result,pub_time")
    .is("replyto", null)
    .neq("hidden", 1)
    .gte("pub_time", since)
    .order("pub_time", { ascending: false })
    .limit(FALLBACK_COMMENT_LIMIT);

  if (commentError) throw commentError;

  const recentComments = (commentData ?? []) as RecentCommentRow[];
  const relationIds = [...new Set(recentComments.map((comment) => comment.course_id))];
  if (relationIds.length === 0) {
    return { comments: recentComments, links: [], courses: [] };
  }

  const links: CourseLinkRow[] = [];
  for (const idChunk of chunk(relationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabaseServer
      .from("prof_with_course")
      .select("id,course_id")
      .in("id", idChunk);

    if (error) throw error;
    links.push(...((data ?? []) as CourseLinkRow[]));
  }

  const courseCodes = [...new Set(links.map((link) => link.course_id))];
  const courses: CourseMetaRow[] = [];
  for (const codeChunk of chunk(courseCodes, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabaseServer
      .from("course_noporf")
      .select("*")
      .in("New_code", codeChunk);

    if (error) throw error;
    courses.push(...((data ?? []) as CourseMetaRow[]));
  }

  return { comments: recentComments, links, courses };
}

export async function fetchPopularCourses(): Promise<PopularCourseRow[]> {
  const { data, error } = await supabaseServer.rpc("get_popular_courses", {
    target_days: POPULAR_COURSE_DAYS,
    result_limit: POPULAR_COURSE_LIMIT,
  });

  if (!error) {
    return ((data ?? []) as PopularCourseRpcRow[]).map(mapPopularCourseRpcRow);
  }

  console.error("[getPopularCourses] rpc failed, falling back:", error.message);

  try {
    const sources = await loadFallbackSources(fallbackSince());
    return aggregatePopularCourses(sources.comments, sources.links, sources.courses);
  } catch (fallbackError) {
    console.error(
      "[getPopularCourses] fallback failed:",
      fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
    );
    return [];
  }
}

export const getPopularCourses = unstable_cache(
  fetchPopularCourses,
  ["popular-courses"],
  { revalidate: 3600, tags: [CACHE_TAGS.statistics] },
);
