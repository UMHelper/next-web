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

];

// R3：多批迁移任务在各自 worktree 并行推进，每批只关心自己那几个文件——用 GUARD_SCOPE
// （逗号分隔的路径）把守卫收窄到本批范围，这样每批都能拿到自己的红→绿证据，而不会被其它
// 批次尚未迁移的文件连坐。PENDING 是控制者的账本，等最后一个任务再删空。
//
// 条目语义与 EXCLUDED 一致（file === entry || file.startsWith(`${entry}/`)），所以既可以写
// 文件（components/footer.tsx）也可以写目录（components/timetable 或 components/timetable/）。
// R8：每个条目必须先匹配到至少一个被扫描文件，否则前缀对不上时会退化成"空列表通过"——
// 一个拼错的路径就能让整批迁移拿到假绿。因此非空跑前置条件和零违规断言在同一个 case 里，
// 拼错的路径、写错的目录、不存在的文件都会指名报错，而不是静默变绿。
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

/** 用空格抹掉注释内容，但逐个保留换行，保证剥离后的行号与源文件一致 */
function blankOutComment(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

/** 剥离 JSX 注释、块注释与行注释：注释里的旧类名不该让守卫失败，行号也不该漂移 */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blankOutComment)
    .replace(/\/\*[\s\S]*?\*\//g, blankOutComment)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_match, prefix: string, comment: string) =>
      `${prefix}${blankOutComment(comment)}`,
    );
}

function isExcluded(file: string): boolean {
  return EXCLUDED.some((excluded) => file === excluded || file.startsWith(`${excluded}/`));
}

/** 守卫扫描的文件宇宙：范围匹配与违规扫描共用，保证两者不会有口径差 */
function collectScannedFiles(): string[] {
  return ROOTS.flatMap((root) => collectFiles(root)).filter((file) => !isExcluded(file));
}

/** 去掉尾随斜杠：`components/timetable/` 与 `components/timetable` 等价 */
function normalizeScopeEntry(entry: string): string {
  return entry.replace(/\/+$/, "");
}

/** 与 isExcluded 同语义：条目可以是一个文件，也可以是一个目录 */
function isInScope(file: string, entry: string): boolean {
  return file === entry || file.startsWith(`${entry}/`);
}

export function collectTokenViolations(): string[] {
  const violations: string[] = [];

  for (const file of collectScannedFiles()) {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");

    lines.forEach((line, index) => {
      for (const match of line.matchAll(TOKEN_PATTERN)) {
        const token = match[0];
        if (ALLOWED_TOKENS.includes(token)) continue;
        violations.push(`${file}:${index + 1}  ${token}`);
      }
    });
  }

  return violations;
}

describe("light-only color guard", () => {
  if (SCOPE.length > 0) {
    // 范围模式：只跑一个 case，不做 PENDING 断言（其它批次未必已迁移）。
    it("reports no violations inside GUARD_SCOPE", () => {
      const entries = SCOPE.map(normalizeScopeEntry);
      const scannedFiles = collectScannedFiles();

      // 非空跑前置条件：每个条目都得匹配到被扫描的文件，否则拼错的路径会伪装成"零违规"。
      const unmatched = entries.filter(
        (entry) => !scannedFiles.some((file) => isInScope(file, entry)),
      );
      expect(
        unmatched,
        `GUARD_SCOPE entry matched no scanned file under app/ or components/: ${unmatched.join(", ")}`,
      ).toEqual([]);

      const scoped = collectTokenViolations().filter((violation) =>
        entries.some((entry) =>
          isInScope(violation.slice(0, violation.indexOf(":")), entry),
        ),
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
