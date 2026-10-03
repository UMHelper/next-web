import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DATA_LAYER_OWNER = "lib/analytics/data-layer.ts";

/**
 * 守卫对象是 dataLayer 的**写入**，不是这个字面量本身：GTM 引导脚本
 * （app/layout.tsx 的 `dl=l!='dataLayer'`、`})(window,document,'script','dataLayer',…)`）
 * 必然要提到这个名字，那属于既有代码。旧版直接豁免整个 app/layout.tsx，
 * 等于在容器脚本所在的文件里给"任何写入"开了后门；改成按写入形态匹配后，
 * 只有 lib/analytics/data-layer.ts 可以写，且无需文件级豁免。
 */
const DATA_LAYER_WRITE_PATTERNS = [
  // dataLayer.push(…) / window.dataLayer?.push(…) / dl = window.dataLayer; dl.push(…)
  /\bdataLayer\b[^\n]*\.\s*push\s*\(/,
  // dataLayer["ecommerce"] = … / dataLayer[0] = …
  /\bdataLayer\b[^\n]*\[[^\]\n]*\][ \t]*=(?!=)/,
  // dataLayer = … / window.dataLayer ??= … / dataLayer ||= …
  /\bdataLayer\b[ \t]*(?:\?\?|\|\||&&)?=(?!=)/,
];

function writesToDataLayer(text: string): boolean {
  return DATA_LAYER_WRITE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 写入形态的正则有一个已知缺口——别名转发：`const dl = window.dataLayer; dl.push(…)`
 * 里没有一处匹配上面的模式。所以再补一道更钝的检查：剥掉字符串与注释之后，
 * 除写入口以外的文件里不应出现 dataLayer 这个标识符。GTM 引导脚本里的 dataLayer
 * 全部在字符串里（`'dataLayer'`、`l!='dataLayer'`），剥掉之后 layout 自然干净，
 * 不需要再对它做文件级豁免。
 */
function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, '""');
}

function mentionsDataLayer(text: string): boolean {
  return /\bdataLayer\b/.test(stripStringsAndComments(text));
}

/**
 * gtag 直调有两种写法会绕过 `\bgtag\s*\(`：可选调用 `window.gtag?.(…)`
 * 和下标访问 `window["gtag"](…)`。守卫必须两种都拦。
 */
const GTAG_CALL_PATTERNS = [
  /(?:^|[^\w$])gtag[ \t]*(?:\?\.)?[ \t]*\(/,
  /\[[ \t]*["'`]gtag["'`][ \t]*\][ \t]*(?:\?\.)?[ \t]*\(/,
];

function callsGtag(text: string): boolean {
  return GTAG_CALL_PATTERNS.some((pattern) => pattern.test(text));
}

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
    const others = allSourceFiles().filter((file) => file !== DATA_LAYER_OWNER);

    expect(others.filter((file) => writesToDataLayer(source(file)))).toEqual([]);
    expect(others.filter((file) => mentionsDataLayer(source(file)))).toEqual([]);

    // 自检：三种写入形态、owner 本身、以及"字符串里的 dataLayer 不算"都要成立，
    // 否则上两条断言可能是在空转（例如正则写错、或扫描目录被改空）。
    expect(writesToDataLayer(source(DATA_LAYER_OWNER))).toBe(true);
    expect(mentionsDataLayer(source(DATA_LAYER_OWNER))).toBe(true);
    for (const sample of [
      'window.dataLayer.push({ event: "um_event" });',
      'window.dataLayer["ecommerce"] = {};',
      "window.dataLayer ??= [];",
    ]) {
      expect(writesToDataLayer(sample), sample).toBe(true);
    }
    expect(mentionsDataLayer("const dl = window.dataLayer;")).toBe(true);
    expect(mentionsDataLayer("})(window,document,'script','dataLayer','GTM-X');")).toBe(false);
  });

  it("never calls gtag directly", () => {
    const offenders = allSourceFiles().filter((file) => callsGtag(source(file)));
    expect(offenders).toEqual([]);
    // 自检：三种直调写法（含 ?. 与下标访问）都必须在守卫的射程内。
    for (const sample of ["gtag('event','x')", "window.gtag?.('event','x')", 'window["gtag"]("event","x")']) {
      expect(callsGtag(sample), sample).toBe(true);
    }
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
