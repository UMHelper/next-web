import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// lib/ 也在 tailwind.config.js 的 content 扫描范围里（`./lib/**/*.{ts,tsx}`），
// 并且 lib/utils.ts 的 get_bg() 会返回类名字符串；漏掉它等于给守卫留了盲区。
const ROOTS = ["app", "components", "lib"];

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

// 色系名单 = Tailwind 默认色板全部彩色系（外加 white / black）。少一个色系就是
// 一条静默的漏网通道：此前缺 rose / emerald / orange / pink / cyan / lime / yellow。
const COLOR_FAMILIES = [
  "white",
  "black",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
].join("|");

const TOKEN_PATTERN = new RegExp(
  `\\b(?:text|bg|border|from|via|to|ring|divide|placeholder|fill|stroke)-(?:${COLOR_FAMILIES})(?:-[0-9]+)?(?:\\/[0-9]+)?`,
  "g",
);

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

/** 守卫扫描的文件宇宙：ROOTS 去掉排除项，违规扫描就以这一份清单为输入 */
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
  it("has no raw color scales anywhere in app, components or lib", () => {
    expect(collectTokenViolations()).toEqual([]);
  });
});
