import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components"];

// components/ui 已是 token 化的 shadcn 原语；timetable-calendar.tsx 是死代码
// （唯一使用 @aldabil/react-scheduler 的文件，全仓库无人 import，课表页用的是自研 WeekGrid）
const EXCLUDED = ["components/ui", "components/timetable-calendar.tsx"];

// §5.6：这些颜色是刻意的（白字在饱和底上、品牌渐变两模式同值、装饰渐变）
const ALLOWED_TOKENS = [
  "text-white",
  "text-white/80",
  "bg-white/20",
  "bg-white/25",
  "bg-white/30",
  "from-blue-600",
  "to-indigo-500",
  "from-teal-400",
  "via-violet-400",
  "to-blue-500",
  "from-neutral-700",
  "to-stone-900",
  "from-purple-600",
  "from-purple-500",
  "to-blue-600",
  "from-violet-500",
  "to-fuchsia-500",
  "from-blue-400",
  "to-indigo-400",
];

const TOKEN_PATTERN =
  /\b(?:text|bg|border|from|via|to|ring|divide|placeholder|fill|stroke)-(?:white|black|gray|slate|zinc|neutral|stone|sky|blue|indigo|green|red|amber|teal|violet|fuchsia|purple)(?:-[0-9]+)?(?:\/[0-9]+)?/g;

// 尚未迁移的文件（守卫口径实测：48 个文件 / 335 处）。每个迁移任务从这里移除自己的文件；Task 16 清空。
// 注意：spec §8 的原始清单是 54 个文件，其中 6 个在守卫口径下为 0 处
// （app/layout.tsx 命中全在注释里；navbar-avatar / search / search-form / comments /
//  professor 页面 的命中全部是 §5.6 放行项），因此不在本列表中。
const PENDING: string[] = [
  "app/admin/layout.tsx",
  "app/admin/page.tsx",
  "app/admin/update/update-client.tsx",
  "app/catalog/[...departments]/page.tsx",
  "app/catalog/page.tsx",
  "app/not-found.tsx",
  "app/page.tsx",
  "app/sign-up/[[...sign-up]]/page.tsx",
  "app/timetable/page.tsx",
  "components/admin-entry.tsx",
  "components/admin/admin-admins-client.tsx",
  "components/admin/admin-comments-client.tsx",
  "components/admin/admin-course-notes-client.tsx",
  "components/admin/admin-courses-client.tsx",
  "components/admin/admin-infinite-scroll.tsx",
  "components/admin/admin-nav.tsx",
  "components/admin/admin-reports-client.tsx",
  "components/ads/ad-slot.tsx",
  "components/banner.tsx",
  "components/catalog-navigation.tsx",
  "components/comment-content.tsx",
  "components/course-card.tsx",
  "components/course-filter.tsx",
  "components/course/course-header.tsx",
  "components/course/course-instructors.tsx",
  "components/course/rating-stats-card.tsx",
  "components/cs-banner.tsx",
  "components/faculty-statistics.tsx",
  "components/footer.tsx",
  "components/legal-content.tsx",
  "components/loading-skeletons.tsx",
  "components/mobile-sidebar.tsx",
  "components/navbar-list.tsx",
  "components/navbar.tsx",
  "components/popular-courses.tsx",
  "components/prof-card.tsx",
  "components/report-dialog.tsx",
  "components/review/comment-card.tsx",
  "components/review/review-header.tsx",
  "components/submit/submit-comment-form.tsx",
  "components/timetable-schedule-card.tsx",
  "components/timetable/compare-client.tsx",
  "components/timetable/floating-planner.tsx",
  "components/timetable/plan-header.tsx",
  "components/timetable/planner-sidebar.tsx",
  "components/timetable/section-list.tsx",
  "components/timetable/share-dialog.tsx",
  "components/timetable/week-grid.tsx",
];

// R3：多批迁移任务在各自 worktree 并行推进，每批只关心自己那几个文件——用 GUARD_SCOPE
// （逗号分隔的文件路径前缀）把守卫收窄到本批范围，这样每批都能拿到自己的红→绿证据，
// 而不会被其它批次尚未迁移的文件连坐。PENDING 是控制者的账本，等最后一个任务再删空。
const SCOPE = (process.env.GUARD_SCOPE ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

/** 剥离 JSX 注释、块注释与行注释：注释里的旧类名不该让守卫失败 */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function isExcluded(file: string): boolean {
  return EXCLUDED.some((excluded) => file === excluded || file.startsWith(`${excluded}/`));
}

export function collectTokenViolations(): string[] {
  const violations: string[] = [];

  for (const root of ROOTS) {
    for (const file of collectFiles(root)) {
      if (isExcluded(file)) continue;
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");

      lines.forEach((line, index) => {
        for (const match of line.matchAll(TOKEN_PATTERN)) {
          const token = match[0];
          if (ALLOWED_TOKENS.includes(token)) continue;
          violations.push(`${file}:${index + 1}  ${token}`);
        }
      });
    }
  }

  return violations;
}

describe("light-only color guard", () => {
  if (SCOPE.length > 0) {
    // 范围模式：只跑一个 case，不做 PENDING 断言（其它批次未必已迁移）。
    it("reports no violations inside GUARD_SCOPE", () => {
      const scoped = collectTokenViolations().filter((violation) =>
        SCOPE.some((scope) => violation.startsWith(`${scope}:`)),
      );

      expect(scoped).toEqual([]);
    });
  } else {
    it("reports no violations outside the pending migration list", () => {
      const unexpected = collectTokenViolations().filter(
        (violation) => !PENDING.some((pending) => violation.startsWith(`${pending}:`)),
      );

      expect(unexpected).toEqual([]);
    });

    it("keeps the pending list free of stale entries", () => {
      const violations = collectTokenViolations();
      const stale = PENDING.filter(
        (pending) => !violations.some((violation) => violation.startsWith(`${pending}:`)),
      );

      expect(stale).toEqual([]);
    });
  }
});
