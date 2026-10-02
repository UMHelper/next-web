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
  it("has no raw color scales anywhere in app or components", () => {
    expect(collectTokenViolations()).toEqual([]);
  });
});
