import { unstable_cache } from 'next/cache';
import supabase from '@/lib/database/database';

type CommentRow = {
  course_id: number;
  pub_time: string;
};

type CourseRefRow = {
  id: number;
  course_id: string;
  prof_id: string;
};

type TimePoint = {
  period: string;
  count: number;
};

type RankPoint = {
  name: string;
  count: number;
};

export type HomeCommentAnalytics = {
  weeklyTrend: TimePoint[];
  monthlyTrend: TimePoint[];
  weeklyTeacherTop: RankPoint[];
  monthlyTeacherTop: RankPoint[];
  weeklyCourseTop: RankPoint[];
  monthlyCourseTop: RankPoint[];
  generatedAt: string;
};

/**
 * Build a UTC week bucket key in `YYYY-Www` format.
 */
const toWeekKey = (isoDate: string): string => {
  const date = new Date(isoDate);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayIndex = Math.floor((date.getTime() - startOfYear) / 86400000);
  const week = Math.floor(dayIndex / 7) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/**
 * Build a UTC month bucket key in `YYYY-MM` format.
 */
const toMonthKey = (isoDate: string): string => {
  const date = new Date(isoDate);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const summarizeTop = (counter: Map<string, number>, size: number): RankPoint[] => {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([name, count]) => ({ name, count }));
};

/**
 * Query and aggregate homepage comment analytics.

 *
 * Performance notes:
 * - bounded time window (last 365 days)
 * - select only required columns
 * - deduplicated id lookup for relation table
 * - wrapped by `unstable_cache` (30 min) to reduce repeated DB workload
 */
const getHomeCommentAnalyticsUncached = async (): Promise<HomeCommentAnalytics> => {
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: commentsData, error: commentsError } = await supabase
    .from('comment')
    .select('course_id,pub_time')
    .gte('pub_time', oneYearAgo)
    .neq('hidden', 1)
    .is('replyto', null)
    .order('pub_time', { ascending: true });

  if (commentsError || !commentsData) {
    throw new Error(`Failed to fetch comments analytics: ${commentsError?.message ?? 'unknown error'}`);
  }

  const comments = commentsData as CommentRow[];
  const courseRefIds = [...new Set(comments.map((row) => row.course_id))];

  const { data: courseRefData, error: courseRefError } = await supabase
    .from('prof_with_course')
    .select('id,course_id,prof_id')
    .in('id', courseRefIds);

  if (courseRefError || !courseRefData) {
    throw new Error(`Failed to fetch course mapping: ${courseRefError?.message ?? 'unknown error'}`);
  }

  const courseRefMap = new Map<number, CourseRefRow>();
  for (const row of courseRefData as CourseRefRow[]) {
    courseRefMap.set(row.id, row);
  }

  const weeklyCounter = new Map<string, number>();
  const monthlyCounter = new Map<string, number>();
  const weeklyTeacherCounter = new Map<string, number>();
  const monthlyTeacherCounter = new Map<string, number>();
  const weeklyCourseCounter = new Map<string, number>();
  const monthlyCourseCounter = new Map<string, number>();

  for (const row of comments) {
    const weekKey = toWeekKey(row.pub_time);
    const monthKey = toMonthKey(row.pub_time);

    weeklyCounter.set(weekKey, (weeklyCounter.get(weekKey) ?? 0) + 1);
    monthlyCounter.set(monthKey, (monthlyCounter.get(monthKey) ?? 0) + 1);

    const courseRef = courseRefMap.get(row.course_id);
    if (!courseRef) continue;

    if (row.pub_time >= oneWeekAgo) {
      weeklyTeacherCounter.set(courseRef.prof_id, (weeklyTeacherCounter.get(courseRef.prof_id) ?? 0) + 1);
      weeklyCourseCounter.set(courseRef.course_id, (weeklyCourseCounter.get(courseRef.course_id) ?? 0) + 1);
    }

    if (row.pub_time >= oneMonthAgo) {
      monthlyTeacherCounter.set(courseRef.prof_id, (monthlyTeacherCounter.get(courseRef.prof_id) ?? 0) + 1);
      monthlyCourseCounter.set(courseRef.course_id, (monthlyCourseCounter.get(courseRef.course_id) ?? 0) + 1);
    }
  }

  const weeklyTrend = [...weeklyCounter.entries()]
    .slice(-12)
    .map(([period, count]) => ({ period, count }));

  const monthlyTrend = [...monthlyCounter.entries()]
    .slice(-12)
    .map(([period, count]) => ({ period, count }));

  return {
    weeklyTrend,
    monthlyTrend,
    weeklyTeacherTop: summarizeTop(weeklyTeacherCounter, 8),
    monthlyTeacherTop: summarizeTop(monthlyTeacherCounter, 8),
    weeklyCourseTop: summarizeTop(weeklyCourseCounter, 8),
    monthlyCourseTop: summarizeTop(monthlyCourseCounter, 8),
    generatedAt: now.toISOString()
  };
};

export const getHomeCommentAnalytics = unstable_cache(getHomeCommentAnalyticsUncached, ['home-comment-analytics-v1'], {
  revalidate: 1800,
  tags: ['home-comment-analytics']
});
