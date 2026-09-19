# next-web Homepage Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 next-web 首页加入统一的统计栏目：学院统计 + 最近 30 天评论数 Top 5 热门课程。

**Architecture:** 新增 `get_popular_courses` SQL RPC 在数据库侧聚合；应用层用 `unstable_cache` 缓存并映射为 `PopularCourseRow[]`；首页改为 `HomeStatistics` Server Component，组合学院统计和热门课程。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase/Postgres、Vitest、Tailwind、lucide-react。

**Spec:** `docs/superpowers/specs/2026-09-19-next-web-homepage-statistics-design.md`

## Global Constraints

- 统计窗口固定 30 天，Top 5。
- 只统计 `replyto is null`、`hidden <> 1` 的顶层评论。
- 排序：`comment_count desc`，`latest_comment_at desc`，`course_code asc`。
- 点赞、表情、平均分不参与排序。
- 生产走 RPC；本地 RPC 不存在时允许应用层降级查询。
- RPC 只允许 `service_role` 执行。
- 首页 UI 文案继续使用英文。
- 不修改 iOS `/api/statistics` 返回结构。
- 每个 task 结束前必须运行相关测试；最后运行 `npm run test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。

---

## File Structure

- Create: `supabase/migrations/20260919_homepage_statistics.sql`
- Modify: `lib/database/types.ts`
- Modify: `lib/database/get-statistics.ts`
- Create: `lib/database/get-popular-courses.ts`
- Create: `components/faculty-statistics.tsx`
- Create: `components/popular-courses.tsx`
- Create: `components/home-statistics.tsx`
- Modify: `app/page.tsx`
- Delete: `components/comment-bank.tsx`
- Create: `tests/database/popular-courses-sql.test.ts`
- Create: `tests/database/popular-courses.test.ts`
- Create: `tests/components/home-statistics-components.test.tsx`
- Create: `tests/components/homepage-statistics-integration.test.ts`

---

### Task 1: Database RPC 与索引

**Files:**
- Create: `tests/database/popular-courses-sql.test.ts`
- Create: `supabase/migrations/20260919_homepage_statistics.sql`

**Interfaces:**
- Produces: `public.get_popular_courses(integer, integer)`，返回字段
  `course_code, course_title_eng, course_title_chi, offering_unit, comment_count, avg_result, latest_comment_at`
- Produces: `comment_recent_visible_idx`

- [ ] **Step 1: Write the failing test**

`tests/database/popular-courses-sql.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("homepage statistics migration", () => {
  it("defines the popular courses RPC and index", () => {
    const sql = readFileSync("supabase/migrations/20260919_homepage_statistics.sql", "utf8");

    expect(sql).toContain("create index if not exists comment_recent_visible_idx");
    expect(sql).toContain("create or replace function public.get_popular_courses");
    expect(sql).toContain("order by");
    expect(sql).toContain("grant execute on function public.get_popular_courses(integer, integer)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/database/popular-courses-sql.test.ts
```

Expected: FAIL because `supabase/migrations/20260919_homepage_statistics.sql` does not exist.

- [ ] **Step 3: Create the migration**

`supabase/migrations/20260919_homepage_statistics.sql`：

```sql
create index if not exists comment_recent_visible_idx
on public.comment (pub_time desc)
where replyto is null and hidden <> 1;

create or replace function public.get_popular_courses(
  target_days integer default 30,
  result_limit integer default 5
)
returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  comment_count bigint,
  avg_result real,
  latest_comment_at timestamp without time zone
)
language sql
stable
security invoker
set search_path = public
as $function$
  with recent_comments as (
    select
      comment.course_id,
      comment.result,
      comment.pub_time
    from public.comment
    where comment.replyto is null
      and comment.hidden <> 1
      and comment.pub_time >= (now() at time zone 'UTC')
        - make_interval(days => greatest(least(coalesce(target_days, 30), 365), 1))
  )
  select
    course."New_code"::text as course_code,
    course."courseTitleEng"::text as course_title_eng,
    course."courseTitleChi"::text as course_title_chi,
    course."Offering_Unit"::text as offering_unit,
    stats.comment_count,
    stats.avg_result,
    stats.latest_comment_at
  from (
    select
      prof_with_course.course_id,
      count(*)::bigint as comment_count,
      avg(recent_comments.result)::real as avg_result,
      max(recent_comments.pub_time) as latest_comment_at
    from recent_comments
    join public.prof_with_course
      on prof_with_course.id = recent_comments.course_id
    group by prof_with_course.course_id
  ) as stats
  join public.course_noporf as course
    on course."New_code" = stats.course_id
  order by
    stats.comment_count desc,
    stats.latest_comment_at desc,
    course."New_code" asc
  limit greatest(least(coalesce(result_limit, 5), 50), 1);
$function$;

revoke all on function public.get_popular_courses(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_popular_courses(integer, integer)
  to postgres, service_role;
notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run tests/database/popular-courses-sql.test.ts
```

Expected: PASS.

- [ ] **Step 5: Dry-run SQL against the target database**

Run this inline script from `next-web/`:

```bash
node --env-file=.env.local - <<'NODE'
const { readFileSync } = require("node:fs");
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await client.connect();
    await client.query("begin");
    await client.query(readFileSync("supabase/migrations/20260919_homepage_statistics.sql", "utf8"));
    const result = await client.query("select * from public.get_popular_courses(30, 5)");
    console.log(JSON.stringify(result.rows, null, 2));
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
})();
NODE
```

Expected: prints up to 5 rows with `course_code`, `comment_count`, `latest_comment_at`; transaction rolled back.

- [ ] **Step 6: Commit**

```bash
git add tests/database/popular-courses-sql.test.ts supabase/migrations/20260919_homepage_statistics.sql
git commit -m "feat: add popular courses sql rpc"
```

---

### Task 2: 类型与热门课程读取层

**Files:**
- Modify: `lib/database/types.ts`
- Modify: `lib/database/get-statistics.ts`
- Create: `lib/database/get-popular-courses.ts`
- Create: `tests/database/popular-courses.test.ts`

**Interfaces:**
- Consumes: `public.get_popular_courses(integer, integer)`
- Produces:
  - `FacultyStatisticRow`
  - `PopularCourseRow`
  - `fetchPopularCourses(): Promise<PopularCourseRow[]>`
  - `getPopularCourses` cached function
  - `aggregatePopularCourses(comments, links, courses, limit)`

- [ ] **Step 1: Write the failing test**

`tests/database/popular-courses.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc, from },
}));

import {
  aggregatePopularCourses,
  fetchPopularCourses,
} from "@/lib/database/get-popular-courses";

beforeEach(() => {
  vi.clearAllMocks();
});

const courseRows = [
  {
    New_code: "COMP1001",
    courseTitleEng: "Intro",
    courseTitleChi: null,
    Offering_Unit: "FST",
  },
  {
    New_code: "COMP2002",
    courseTitleEng: "Data",
    courseTitleChi: null,
    Offering_Unit: "FST",
  },
];

const linkRows = [
  { id: 1, course_id: "COMP1001" },
  { id: 2, course_id: "COMP2002" },
];

describe("aggregatePopularCourses", () => {
  it("sorts by comment count and applies the limit", () => {
    const result = aggregatePopularCourses(
      [
        { course_id: 1, result: 4, pub_time: "2026-09-01 10:00:00" },
        { course_id: 2, result: 3, pub_time: "2026-09-02 10:00:00" },
        { course_id: 2, result: 5, pub_time: "2026-09-03 10:00:00" },
      ],
      linkRows,
      courseRows,
      2,
    );

    expect(result.map((row) => row.courseCode)).toEqual(["COMP2002", "COMP1001"]);
    expect(result[0].commentCount).toBe(2);
    expect(result[0].avgResult).toBe(4);
  });
});

describe("fetchPopularCourses", () => {
  it("calls the RPC and maps rows", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          course_code: "COMP1001",
          course_title_eng: "Intro",
          course_title_chi: null,
          offering_unit: "FST",
          comment_count: 2,
          avg_result: 4.5,
          latest_comment_at: "2026-09-01 10:00:00",
        },
      ],
      error: null,
    });

    const result = await fetchPopularCourses();

    expect(rpc).toHaveBeenCalledWith("get_popular_courses", {
      target_days: 30,
      result_limit: 5,
    });
    expect(result).toEqual([
      {
        courseCode: "COMP1001",
        courseTitleEng: "Intro",
        courseTitleChi: null,
        offeringUnit: "FST",
        commentCount: 2,
        avgResult: 4.5,
        latestCommentAt: "2026-09-01 10:00:00",
      },
    ]);
  });

  it("falls back to local aggregation when the RPC is missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    from.mockImplementation((table: string) => {
      if (table === "comment") {
        return {
          select: () => ({
            is: () => ({
              neq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            course_id: 1,
                            result: 4,
                            pub_time: "2026-09-01 10:00:00",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "prof_with_course") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: 1, course_id: "COMP1001" }],
                error: null,
              }),
          }),
        };
      }

      if (table === "course_noporf") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [courseRows[0]],
                error: null,
              }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchPopularCourses();

    expect(result[0]).toMatchObject({
      courseCode: "COMP1001",
      commentCount: 1,
      avgResult: 4,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/database/popular-courses.test.ts
```

Expected: FAIL because `lib/database/get-popular-courses.ts` does not exist.

- [ ] **Step 3: Add types**

在 `lib/database/types.ts` 末尾追加：

```ts
export type FacultyStatisticRow = {
  id: number;
  name: string;
  course_num: number;
  comment_num: number;
};

export type PopularCourseRow = {
  courseCode: string;
  courseTitleEng: string;
  courseTitleChi: string | null;
  offeringUnit: string;
  commentCount: number;
  avgResult: number;
  latestCommentAt: string;
};
```

- [ ] **Step 4: Tighten getStatistics return type**

修改 `lib/database/get-statistics.ts`：

```ts
import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import supabaseServer from "@/lib/supabase/server";
import type { FacultyStatisticRow } from "@/lib/database/types";

export const getStatistics = unstable_cache(
  async (): Promise<FacultyStatisticRow[]> => {
    const { data, error } = await supabaseServer.from("statistics").select("*");

    if (error) {
      console.error("[getStatistics] query failed:", error.message);
      return [];
    }

    return (data ?? []) as FacultyStatisticRow[];
  },
  ["statistics"],
  { revalidate: 3600, tags: [CACHE_TAGS.statistics] },
);
```

- [ ] **Step 5: Implement the popular courses data loader**

创建 `lib/database/get-popular-courses.ts`：

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npx vitest run tests/database/popular-courses.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 7: Type-check touched files**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/database/types.ts lib/database/get-statistics.ts lib/database/get-popular-courses.ts tests/database/popular-courses.test.ts
git commit -m "feat: add popular courses data loader"
```

---

### Task 3: 统计 UI 组件

**Files:**
- Create: `components/faculty-statistics.tsx`
- Create: `components/popular-courses.tsx`
- Create: `components/home-statistics.tsx`
- Create: `tests/components/home-statistics-components.test.tsx`

**Interfaces:**
- Consumes: `FacultyStatisticRow[]`, `PopularCourseRow[]`
- Produces:
  - `FacultyStatistics`
  - `PopularCourses`
  - `HomeStatistics`

- [ ] **Step 1: Write the failing test**

`tests/components/home-statistics-components.test.tsx`：

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: { children?: React.ReactNode }) => props.children,
}));

import { FacultyStatistics } from "@/components/faculty-statistics";
import { PopularCourses } from "@/components/popular-courses";

describe("home statistics components", () => {
  it("renders the faculty empty state", () => {
    const html = renderToStaticMarkup(
      React.createElement(FacultyStatistics, { statistics: [] }),
    );

    expect(html).toContain("Statistics are not available yet.");
  });

  it("renders popular course rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(PopularCourses, {
        courses: [
          {
            courseCode: "COMP1001",
            courseTitleEng: "Intro",
            courseTitleChi: null,
            offeringUnit: "FST",
            commentCount: 3,
            avgResult: 4.5,
            latestCommentAt: "2026-09-01 10:00:00",
          },
        ],
      }),
    );

    expect(html).toContain("COMP1001");
    expect(html).toContain("3 comments in 30 days");
    expect(html).toContain("4.5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/components/home-statistics-components.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement FacultyStatistics**

创建 `components/faculty-statistics.tsx`：

```tsx
import {
  BookMarked,
  Bot,
  CircleDollarSign,
  Microscope,
  Newspaper,
  School,
  Scale,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { FacultyStatisticRow } from "@/lib/database/types";

const FACULTY_ICONS = {
  FAH: Newspaper,
  FBA: CircleDollarSign,
  FED: School,
  FHS: Microscope,
  FLL: Scale,
  FSS: BookMarked,
  FST: Bot,
} as const;

type FacultyStatisticsProps = {
  statistics: FacultyStatisticRow[];
};

export function FacultyStatistics({ statistics }: FacultyStatisticsProps) {
  if (statistics.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Statistics are not available yet.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {statistics.map((row) => {
        const Icon = FACULTY_ICONS[row.name as keyof typeof FACULTY_ICONS] ?? School;

        return (
          <Card
            key={row.id}
            className="flex flex-col items-center p-4 text-center dark:bg-gray-800"
          >
            <Icon size={56} strokeWidth={1.25} className="pb-3" />
            <Link
              href={`/catalog/${encodeURIComponent(row.name)}`}
              className="text-lg font-medium hover:underline"
            >
              {row.name}
            </Link>
            <div className="text-sm text-muted-foreground">
              {row.course_num} courses
            </div>
            <div className="text-sm text-muted-foreground">
              {row.comment_num} comments
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement PopularCourses**

创建 `components/popular-courses.tsx`：

```tsx
import { MessageSquare, Star } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { PopularCourseRow } from "@/lib/database/types";

type PopularCoursesProps = {
  courses: PopularCourseRow[];
};

export function PopularCourses({ courses }: PopularCoursesProps) {
  if (courses.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No recent activity yet.
      </Card>
    );
  }

  return (
    <ol className="space-y-3">
      {courses.map((course, index) => (
        <li key={course.courseCode}>
          <Link href={`/course/${course.courseCode}`} className="block">
            <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md dark:bg-gray-800">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {course.courseCode}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {course.courseTitleEng}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{course.offeringUnit}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {course.commentCount} comments in 30 days
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" />
                    {course.avgResult > 0 ? course.avgResult.toFixed(1) : "N/A"}
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: Implement HomeStatistics**

创建 `components/home-statistics.tsx`：

```tsx
import { FacultyStatistics } from "@/components/faculty-statistics";
import { PopularCourses } from "@/components/popular-courses";
import { getPopularCourses } from "@/lib/database/get-popular-courses";
import { getStatistics } from "@/lib/database/get-statistics";

export default async function HomeStatistics() {
  const [statistics, popularCourses] = await Promise.all([
    getStatistics(),
    getPopularCourses(),
  ]);

  return (
    <section className="mx-auto max-w-screen-xl p-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Course Statistics</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Faculty coverage and the most discussed courses in the last 30 days.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="order-2 lg:order-1">
          <h3 className="mb-4 text-lg font-semibold">By Faculty</h3>
          <FacultyStatistics statistics={statistics} />
        </div>

        <div className="order-1 lg:order-2">
          <h3 className="mb-4 text-lg font-semibold">Trending in 30 Days</h3>
          <PopularCourses courses={popularCourses} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npx vitest run tests/components/home-statistics-components.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Type-check touched files**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/faculty-statistics.tsx components/popular-courses.tsx components/home-statistics.tsx tests/components/home-statistics-components.test.tsx
git commit -m "feat: add homepage statistics components"
```

---

### Task 4: 首页接入与替换旧 CommentBank

**Files:**
- Modify: `app/page.tsx`
- Delete: `components/comment-bank.tsx`
- Create: `tests/components/homepage-statistics-integration.test.ts`

**Interfaces:**
- Consumes: `HomeStatistics`
- Produces: 首页不再引用 `CommentBank`

- [ ] **Step 1: Write the failing test**

`tests/components/homepage-statistics-integration.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("homepage statistics integration", () => {
  it("uses HomeStatistics instead of CommentBank", () => {
    const source = readFileSync("app/page.tsx", "utf8");

    expect(source).toContain('import HomeStatistics from "@/components/home-statistics";');
    expect(source).not.toContain("CommentBank");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/components/homepage-statistics-integration.test.ts
```

Expected: FAIL because `app/page.tsx` still imports `CommentBank`.

- [ ] **Step 3: Replace the import**

修改 `app/page.tsx`：

```diff
-import CommentBank from "@/components/comment-bank";
+import HomeStatistics from "@/components/home-statistics";
```

- [ ] **Step 4: Replace the old stats block**

把：

```tsx
<div className='max-w-screen-xl mx-auto p-4'>
    <div className="py-8">
        <div className="text-center text-2xl font-bold pb-8">
            Our Comment Bank
        </div>
        <CommentBank />
    </div>
</div>
```

替换为：

```tsx
<HomeStatistics />
```

- [ ] **Step 5: Delete the old component**

Run:

```bash
rm components/comment-bank.tsx
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npx vitest run tests/components/homepage-statistics-integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx tests/components/homepage-statistics-integration.test.ts
git rm components/comment-bank.tsx
git commit -m "feat: use unified homepage statistics section"
```

---

### Task 5: 全量验证与 SQL 应用检查

**Files:**
- No new files; fix any issues discovered.

- [ ] **Step 1: Run unit/component tests**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no warnings or errors.

- [ ] **Step 3: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Re-run SQL dry-run**

Run the same transaction script from Task 1, Step 5.

Expected: `get_popular_courses(30, 5)` returns rows, then rollback.

- [ ] **Step 6: Inspect git status**

```bash
git status --short
git log --oneline -5
```

Expected: working tree clean; commits contain spec, migration, data loader, components, homepage integration.

- [ ] **Step 7: Commit any final fixes only if needed**

```bash
git add app lib components tests supabase
git commit -m "fix: polish homepage statistics"
```

If no fixes are needed, do not create an empty commit.

---

## Self-Review

- **Spec coverage:** 目标中的统一栏目、30 天、评论数排序、RPC、缓存、空态、本地降级、测试均有对应 task。
- **Placeholder scan:** 无 TBD/TODO，每个代码步骤包含可执行内容。
- **Type consistency:** `FacultyStatisticRow`、`PopularCourseRow`、`fetchPopularCourses`、`getPopularCourses`、`aggregatePopularCourses` 命名在 task 间保持一致。
- **Scope check:** 未包含 iOS API、投票排序、全局总览或无关重构。
