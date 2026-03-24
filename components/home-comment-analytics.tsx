import { ReactNode } from 'react';
import { BarChart3, CalendarDays, GraduationCap, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getHomeCommentAnalytics } from '@/lib/database/get-home-comment-analytics';

const TrendBars = ({
  title,
  icon,
  points
}: {
  title: string;
  icon: ReactNode;
  points: { period: string; count: number }[];
}) => {
  const max = Math.max(...points.map((point) => point.count), 1);

  return (
    <Card className="rounded-2xl border-zinc-200/70 bg-white/90 p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900/90">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </div>
        <span className="text-xs text-zinc-500">最近 12 個區間 / Last 12 periods</span>
      </div>
      <div className="space-y-2">
        {points.map((point) => (
          <div key={point.period} className="grid grid-cols-[90px_1fr_42px] items-center gap-2 text-sm">
            <span className="text-zinc-500">{point.period}</span>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
                style={{ width: `${Math.max((point.count / max) * 100, 4)}%` }}
              />
            </div>
            <span className="text-right font-semibold">{point.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const RankBars = ({
  title,
  icon,
  points,
  emptyText
}: {
  title: string;
  icon: ReactNode;
  points: { name: string; count: number }[];
  emptyText: string;
}) => {
  const max = Math.max(...points.map((point) => point.count), 1);

  return (
    <Card className="rounded-2xl border-zinc-200/70 bg-white/90 p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900/90">
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </div>

      {points.length === 0 ? (
        <div className="rounded-lg bg-zinc-100 p-4 text-sm text-zinc-500 dark:bg-zinc-800">{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {points.map((point) => (
            <div key={point.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{point.name}</span>
                <span className="text-zinc-500">{point.count} 則 / items</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                  style={{ width: `${Math.max((point.count / max) * 100, 6)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

/**
 * Home page statistics section.
 *
 * This section renders:
 * - weekly/monthly new-comment trend
 * - top teachers and courses by recent new comments
 */
export default async function HomeCommentAnalytics() {
  const analytics = await getHomeCommentAnalytics();

  return (
    <section className="mx-auto mt-12 max-w-screen-xl px-4">
      <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-white via-sky-50/50 to-indigo-100/40 p-6 shadow-xl dark:border-zinc-700 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">評論增長統計看板 / Comment Growth Dashboard</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              按週 / 按月展示新增評論趨勢，並分別統計老師與課程的新增貢獻。 / Weekly & monthly new-comment trends with separate teacher/course contribution rankings.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
            <BarChart3 size={14} />
            資料更新時間 / Updated at: {new Date(analytics.generatedAt).toLocaleString('zh-CN', { hour12: false })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrendBars title="每週新增評論趨勢 / Weekly New Comments" icon={<CalendarDays size={18} />} points={analytics.weeklyTrend} />
          <TrendBars title="每月新增評論趨勢 / Monthly New Comments" icon={<CalendarDays size={18} />} points={analytics.monthlyTrend} />
          <RankBars
            title="最近 7 天：老師新增評論 Top / Last 7 Days Teacher Top"
            icon={<UserRound size={18} />}
            points={analytics.weeklyTeacherTop}
            emptyText="最近 7 天暫無老師新增評論資料 / No teacher data in last 7 days"
          />
          <RankBars
            title="最近 30 天：老師新增評論 Top / Last 30 Days Teacher Top"
            icon={<UserRound size={18} />}
            points={analytics.monthlyTeacherTop}
            emptyText="最近 30 天暫無老師新增評論資料 / No teacher data in last 30 days"
          />
          <RankBars
            title="最近 7 天：課程新增評論 Top / Last 7 Days Course Top"
            icon={<GraduationCap size={18} />}
            points={analytics.weeklyCourseTop}
            emptyText="最近 7 天暫無課程新增評論資料 / No course data in last 7 days"
          />
          <RankBars
            title="最近 30 天：課程新增評論 Top / Last 30 Days Course Top"
            icon={<GraduationCap size={18} />}
            points={analytics.monthlyCourseTop}
            emptyText="最近 30 天暫無課程新增評論資料 / No course data in last 30 days"
          />
        </div>

        
      </div>
    </section>
  );
}
