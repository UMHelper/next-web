import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §5.2 的 12 个新 token：两个作用域都必须有值
const NEW_TOKENS = [
  "--surface-subtle",
  "--surface-strong",
  "--subtle-foreground",
  "--border-subtle",
  "--border-strong",
  "--brand",
  "--brand-strong",
  "--brand-logo",
  "--wordmark-from",
  "--wordmark-to",
  "--success",
  "--warning",
  // fix wave 新增：--destructive 是"面"token，正文/描边用它只有 2.00:1（深色）
  "--destructive-strong",
  // 饱和底上的前景色（Offered 徽章 / 实心品牌按钮），深色下必须翻成近黑
  "--success-foreground",
  "--brand-foreground",
  // get_bg() 的四档等级渐变（lib/utils.ts 返回类名，此前在守卫盲区）
  "--grade-none-from",
  "--grade-none-to",
  "--grade-low-from",
  "--grade-low-to",
  "--grade-mid-from",
  "--grade-mid-to",
  "--grade-high-from",
  "--grade-high-to",
];

// 只在 :root 定义的非颜色 token：纳入比较会误报
const NON_COLOR_EXCEPTIONS = ["--radius"];

const IOS_IMAGESET_RELATIVE = join(
  "next-ios",
  "What2REG@UM",
  "Assets.xcassets",
  "CatLogo.imageset",
);

/**
 * 向上探测 1/2/3 层父目录，取第一个真实存在 cat-blue.svg 的 imageset。
 * 工作树里 process.cwd() 是 .worktrees/dark-mode，硬编码 `../next-ios`
 * 会静默跳过跨仓库断言；主检出下 next-ios 位于向上 3 层（/Users/box/UMHelper）。
 * 探测不到时返回 null（例如没有 iOS 仓库的 CI），由调用方决定跳过什么。
 */
function findIosImageset(): string | null {
  for (const levels of ["..", join("..", ".."), join("..", "..", "..")]) {
    const candidate = join(process.cwd(), levels, IOS_IMAGESET_RELATIVE);
    if (existsSync(join(candidate, "cat-blue.svg"))) return candidate;
  }
  return null;
}

/** SVG 的 stroke 颜色值；缺失时显式报错，不静默通过 */
function strokeValueOf(svgPath: string): string {
  const match = readFileSync(svgPath, "utf8").match(/stroke="([^"]+)"/);
  if (!match) throw new Error(`no stroke attribute in ${svgPath}`);
  return match[1];
}

function css(): string {
  return readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
}

function blockOf(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing ${selector} block`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function tokensOf(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*(--[a-z-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (match) out.set(match[1], match[2]);
  }
  return out;
}

/** HSL 三元组（shadcn 约定，不带 hsl() 包裹）→ #RRGGBB；用于零容差比对 */
function hslToHex(value: string): string {
  const [h, s, l] = value.split(/\s+/).map((part) => Number.parseFloat(part));
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return (
    "#" +
    rgb
      .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

describe("theme tokens", () => {
  it("defines the same color tokens in :root and .dark", () => {
    const source = css();
    const rootKeys = [...tokensOf(blockOf(source, ":root")).keys()]
      .filter((key) => !NON_COLOR_EXCEPTIONS.includes(key))
      .sort();
    const darkKeys = [...tokensOf(blockOf(source, ".dark")).keys()]
      .filter((key) => !NON_COLOR_EXCEPTIONS.includes(key))
      .sort();

    expect(darkKeys).toEqual(rootKeys);
  });

  it("defines every new token in both scopes", () => {
    const source = css();
    const root = tokensOf(blockOf(source, ":root"));
    const dark = tokensOf(blockOf(source, ".dark"));

    const missing = NEW_TOKENS.filter((token) => !root.has(token) || !dark.has(token));
    expect(missing).toEqual([]);
  });

  it("keeps --brand-logo byte-identical to the iOS cat assets", () => {
    const source = css();
    const root = tokensOf(blockOf(source, ":root"));
    const dark = tokensOf(blockOf(source, ".dark"));

    const lightHex = hslToHex(root.get("--brand-logo") ?? "");
    const darkHex = hslToHex(dark.get("--brand-logo") ?? "");
    expect(lightHex).toBe("#003DB8");
    expect(darkHex).toBe("#FFFFFF");

    // 没有 iOS 仓库时只跳过下面两个文件断言，上面的 token 断言照常执行
    const iosImageset = findIosImageset();
    if (!iosImageset) return;

    const blue = join(iosImageset, "cat-blue.svg");
    const white = join(iosImageset, "cat-white.svg");
    expect(strokeValueOf(blue)).toBe(lightHex);
    expect(strokeValueOf(white)).toBe(darkHex);
  });
});
