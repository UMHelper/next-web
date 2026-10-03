import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DATA_LAYER_OWNER = "lib/analytics/data-layer.ts";

/**
 * GTM 引导脚本自身必然会引用 dataLayer 这个字面量（`dl=l!='dataLayer'`、
 * `})(window,document,'script','dataLayer',…)`），属于既有代码，不在守卫范围内。
 */
const DATA_LAYER_ALLOWED = [DATA_LAYER_OWNER, "app/layout.tsx"];

const CARD_FILES = ["components/course-card.tsx", "components/prof-card.tsx"];

const LIST_CALLERS = [
  "components/course-filter.tsx",
  "components/course/course-instructors.tsx",
  "app/professor/[...name]/page.tsx",
  "app/search/instructor/[...name]/page.tsx",
];

function source(file: string): string {
  return readFileSync(file, "utf8");
}

/**
 * 扫描的扩展名必须覆盖埋点层实际使用的文件形态：设计引入的注册表就是 `.mjs`，
 * 只走 `.ts`/`.tsx` 的话，一个 `.mjs`/`.js` 的埋点辅助文件可以直接写
 * `window.dataLayer` 而守卫仍然全绿。
 */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return SOURCE_EXTENSIONS.some((extension) => fullPath.endsWith(extension)) ? [fullPath] : [];
  });
}

function allSourceFiles(): string[] {
  return [...collectSourceFiles("app"), ...collectSourceFiles("components"), ...collectSourceFiles("lib")];
}

describe("analytics wiring", () => {
  it("writes to the data layer from exactly one module", () => {
    const offenders = allSourceFiles()
      .filter((file) => !DATA_LAYER_ALLOWED.includes(file))
      .filter((file) => source(file).includes("dataLayer"));

    expect(offenders).toEqual([]);
  });

  it("never calls gtag directly", () => {
    const offenders = allSourceFiles().filter((file) => /\bgtag\s*\(/.test(source(file)));
    expect(offenders).toEqual([]);
  });

  it("routes every card link through the tracked link", () => {
    for (const file of CARD_FILES) {
      const text = source(file);
      expect(text, file).toContain("TrackedItemLink");
      expect(text, `${file} 不应再直接用 next/link`).not.toMatch(/from ["']next\/link["']/);
    }
  });

  it("passes a list name to every card list", () => {
    for (const file of LIST_CALLERS) {
      expect(source(file), file).toContain("listName");
    }
  });

  it("reports search results from both result surfaces", () => {
    expect(source("components/course-filter.tsx")).toContain("TrackSearchResults");
    expect(source("app/search/instructor/[...name]/page.tsx")).toContain("TrackSearchResults");
  });

  it("keeps the client tracking leaves free of callback props", () => {
    // server component 不能把函数当 prop 传给 client component，因此这两个叶子
    // 只能接收数据。出现 onClick 之类的回调 prop 说明设计被改坏了。
    for (const file of ["components/analytics/tracked-link.tsx", "components/analytics/track-search-results.tsx"]) {
      const text = source(file);
      expect(text, file).toContain('"use client"');
      expect(text, `${file} 不应声明回调 prop`).not.toMatch(/on[A-Z][A-Za-z]*\??:/);
    }
  });

  it("keeps the gtm manifest in sync with the registry", () => {
    // execFileSync 在子进程退出码非 0 时抛错，因此这一条同时钉住退出码与成功行；
    // 用 toContain("in sync") 会被 "is not in sync" 这类失败文案误命中。
    const output = execFileSync(process.execPath, ["scripts/print-analytics-manifest.mjs", "--check"], {
      encoding: "utf8",
    });
    expect(output.trim()).toBe("[analytics] gtm-setup.md is in sync with the registry");
  });
});
