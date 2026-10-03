import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import type { Config } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * 主题改动的第五道门：**类名到底有没有编译出 CSS**。
 *
 * 背景（这是设计里缺失的那道闸）：Tailwind 对不存在的透明度档位是**静默的** ——
 * `bg-success/15` 的 `opacity` 刻度里没有 `15`，于是它一条规则都不生成，既不报错、
 * 也不被 `npm run lint` / `tsc` / `next build` 拦下；守卫测试（源码文本口径）同样
 * 只看"类名长得对不对"。迁移期间正是这样丢了两个 admin 状态徽章的底色。
 *
 * 本文件用项目自己的 Tailwind/PostCSS 编译真实的 app/globals.css（content 指向真实
 * 源码），再断言这些类名真的出现在产物里。
 */

const requireConfig = createRequire(import.meta.url);
const tailwindConfig = requireConfig(
  join(process.cwd(), "tailwind.config.js"),
) as Config;

/** 迁移引入的具体 utility：含透明度修饰符与渐变形（这些正是静默丢失的高发形态） */
const MIGRATION_UTILITIES = [
  "bg-success/20",
  "bg-warning/10",
  "bg-destructive/10",
  "bg-brand/10",
  "hover:bg-brand/20",
  "border-success/40",
  "border-destructive/30",
  "border-warning/30",
  "bg-surface-subtle/40",
  "from-wordmark-from",
  "to-wordmark-to",
  "from-brand-from",
  "to-brand-to",
  "text-brand-logo",
  "text-success-foreground",
  "text-brand-foreground",
  "text-destructive-strong",
  // get_bg() 的等级渐变（lib/ 返回值，曾在守卫盲区里）
  "from-grade-none-from",
  "to-grade-none-to",
  "from-grade-low-from",
  "to-grade-low-to",
  "from-grade-mid-from",
  "to-grade-mid-to",
  "from-grade-high-from",
  "to-grade-high-to",
  // Offered 徽章 / 实心品牌按钮的基线类
  "from-success",
  "to-success",
  "bg-brand",
  "text-brand",
  "hover:bg-brand-strong",
  "text-brand-strong",
];

// 与 tests/no-light-only-colors.test.ts 的扫描宇宙保持一致
const ROOTS = ["app", "components", "lib"];
const EXCLUDED = ["components/ui", "components/timetable-calendar.tsx"];

/**
 * 语义 token 形状的 utility（带任意变体前缀，如 `hover:` / `md:`）。
 * 漏掉一个 token 名就等于漏掉一整类静默失效；名单与 tailwind.config.js 的
 * `theme.extend.colors` 一一对应。
 */
const TOKEN_NAMES = [
  "background",
  "foreground",
  "foreground-subtle",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "destructive-strong",
  "border",
  "border-subtle",
  "border-strong",
  "input",
  "ring",
  "surface-subtle",
  "surface-strong",
  "brand",
  "brand-strong",
  "brand-logo",
  "brand-foreground",
  "wordmark-from",
  "wordmark-to",
  "success",
  "success-foreground",
  "warning",
  "grade-none-from",
  "grade-none-to",
  "grade-low-from",
  "grade-low-to",
  "grade-mid-from",
  "grade-mid-to",
  "grade-high-from",
  "grade-high-to",
];

const TOKEN_UTILITY_PATTERN = new RegExp(
  // 长 token 名排在前面 + 结尾用 (?![-\w]) 挡住前缀截断：
  // 否则 `text-destructive-strong` 会被切成 `text-destructive`（一个不存在的类）。
  `(?:[a-zA-Z-]+:)*(?:bg|text|border|from|via|to|ring|fill|stroke|divide|placeholder)-(?:${[...TOKEN_NAMES]
    .sort((a, b) => b.length - a.length)
    .join("|")})(?:\\/[0-9]+)?(?![\\w-])`,
  "g",
);

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

function migrationSources(): string[] {
  return ROOTS.flatMap((root) => collectFiles(join(process.cwd(), root))).filter(
    (file) =>
      !EXCLUDED.some(
        (excluded) =>
          file === join(process.cwd(), excluded) || file.startsWith(`${join(process.cwd(), excluded)}/`),
      ),
  );
}

function collectTokenUtilities(): string[] {
  const found = new Set<string>();
  for (const file of migrationSources()) {
    for (const match of readFileSync(file, "utf8").matchAll(TOKEN_UTILITY_PATTERN)) {
      found.add(match[0]);
    }
  }
  return [...found].sort();
}

async function compileStylesheet(): Promise<string> {
  const from = join(process.cwd(), "app/globals.css");
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      // 指向真实源码，而不是本文件的类名清单 —— 否则就是自己证明自己
      content: ROOTS.map((root) => join(process.cwd(), root, "**/*.{ts,tsx}")),
    }),
  ]).process(readFileSync(from, "utf8"), { from });
  return result.css;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tailwind 会转义 `:` `/` `.`，比对前先去掉产物里的反斜杠 */
function emitsUtility(css: string, utility: string): boolean {
  const unescaped = css.replace(/\\/g, "");
  return new RegExp(`\\.${escapeForRegExp(utility)}(?=[\\s,{:])`).test(unescaped);
}

describe("theme CSS generation", () => {
  let css: string;

  beforeAll(async () => {
    css = await compileStylesheet();
  }, 30_000);

  it("emits a rule for every token utility the migration introduced", () => {
    const missing = MIGRATION_UTILITIES.filter((utility) => !emitsUtility(css, utility));

    // 失败信息直接给出"哪个类名没有编译出任何 CSS"
    expect(missing).toEqual([]);
  });

  it("emits a rule for every token-shaped utility used across app, components and lib", () => {
    const missing = collectTokenUtilities().filter((utility) => !emitsUtility(css, utility));

    expect(missing).toEqual([]);
  });

  it("keeps lib in the Tailwind content scan, since get_bg() returns class strings", () => {
    expect(tailwindConfig.content).toContain("./lib/**/*.{ts,tsx}");
  });
});
