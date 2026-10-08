import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildLlmsTxt, GET } from "@/app/llms.txt/route";
import {
  SITE_NAME,
  absoluteUrl,
  buildCatalogPath,
  buildCoursePath,
  buildProfessorPath,
  buildReviewPath,
} from "@/lib/site";

/**
 * `/llms.txt` 是给按需取数的 agent 读的策展导读（<https://llmstxt.org/>，spec v2）。
 *
 * 这个文件最容易悄悄腐烂的方式不是 404，而是**留下过期或不该推荐的链接**：
 *  - 路径写死字符串 → `lib/site.ts` 改了 URL 结构后这里仍指向旧地址；
 *  - 顺手列出 `/search/`、`/submit/` 等自带 `noindex` 的操作页 → agent 把
 *    无法引用的结果页当成事实来源。
 *
 * 所以断言分三类：spec 结构、链接卫生、内容锚点。
 */
const LLMS_TXT = buildLlmsTxt();
const LINES = LLMS_TXT.split("\n");

const HEADINGS: Array<{ level: number; title: string }> = [];
for (const line of LINES) {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  if (match) {
    HEADINGS.push({ level: match[1].length, title: match[2] });
  }
}

function allLinks(markdown: string = LLMS_TXT) {
  return [...markdown.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((match) => ({
    label: match[1],
    href: match[2],
  }));
}

/** 按 H2 切段，返回每个 section 的标题与正文。 */
function h2Sections(markdown: string = LLMS_TXT) {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const [title, ...rest] = part.split("\n");
      return { title: title.trim(), body: rest.join("\n") };
    });
}

describe("llms.txt spec shape", () => {
  it("starts with the single required H1 naming the site", () => {
    expect(LINES[0]).toBe(`# ${SITE_NAME}`);
    expect(HEADINGS.filter((heading) => heading.level === 1)).toHaveLength(1);
  });

  it("puts the blockquote summary directly after the H1", () => {
    expect(LINES[1]).toBe("");
    expect(LINES[2].startsWith("> ")).toBe(true);
    expect(LINES[2].length).toBeGreaterThan(60);
  });

  it("only uses H2 for the file-list sections, and ends with Optional", () => {
    for (const heading of HEADINGS) {
      expect(heading.level).toBeLessThanOrEqual(2);
    }
    const sections = h2Sections();
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.at(-1)?.title).toBe("Optional");
  });

  it("gives every file-list section at least one markdown link", () => {
    for (const section of h2Sections()) {
      expect(
        allLinks(section.body).length,
        `section「${section.title}」没有任何链接，agent 无处可去`,
      ).toBeGreaterThan(0);
    }
  });

  it("stays small enough to fit a context budget", () => {
    expect(LLMS_TXT.length).toBeLessThan(6000);
  });
});

describe("llms.txt link hygiene", () => {
  it("uses only absolute URLs", () => {
    for (const { href } of allLinks()) {
      expect(href, `${href} 不是绝对 URL`).toMatch(/^https:\/\//);
    }
  });

  it("keeps content links on the canonical origin", () => {
    const allowedOrigins = [new URL(absoluteUrl("/")).origin, "https://github.com"];
    for (const { href } of allLinks()) {
      expect(allowedOrigins, `${href} 指向了非本站、非源码仓库的域名`).toContain(
        new URL(href).origin,
      );
    }
  });

  it("does not recommend pages that serve a noindex meta tag", () => {
    const noIndexPrefixes = ["/submit/", "/timetable", "/sign-in", "/sign-up", "/search/"];
    for (const { href } of allLinks()) {
      const { pathname } = new URL(href);
      for (const prefix of noIndexPrefixes) {
        expect(
          pathname.startsWith(prefix),
          `${href} 指向 noindex 页面，不能作为推荐入口`,
        ).toBe(false);
      }
    }
  });

  it("warns that keyword-result pages are noindex when it mentions them", () => {
    expect(LLMS_TXT).toContain("/search/course/{TEXT}");
    expect(LLMS_TXT).toContain("/search/instructor/{TEXT}");
    expect(LLMS_TXT).toContain("noindex");
  });
});

describe("llms.txt content anchors", () => {
  it("derives example URLs from the shared path builders", () => {
    expect(LLMS_TXT).toContain(absoluteUrl(buildCoursePath("ACCT1000")));
    expect(LLMS_TXT).toContain(absoluteUrl(buildCatalogPath(["FBA", "AIM"])));
    expect(LLMS_TXT).toContain(absoluteUrl(buildProfessorPath("CHAN TAI MAN")));
    expect(LLMS_TXT).toContain(absoluteUrl(buildReviewPath("ACCT1000", "CHAN TAI MAN")));

    // 用的是构造器，而不是「字面量恰好相等」：写死路径后，lib/site.ts 改结构
    // 就会让这个文件指向 404，而下面的生成结果断言仍会通过。
    const source = readFileSync("app/llms.txt/route.ts", "utf8");
    for (const builder of [
      "buildCoursePath(",
      "buildCatalogPath(",
      "buildProfessorPath(",
      "buildReviewPath(",
      "absoluteUrl(",
    ]) {
      expect(source).toContain(builder);
    }
    for (const hardcoded of ["/course/ACCT1000", "/catalog/FBA/AIM", "/reviews/ACCT1000/"]) {
      expect(source).not.toContain(`"${hardcoded}"`);
      expect(source).not.toContain(`'${hardcoded}'`);
    }
  });

  it("documents the read-only MCP server as the programmatic path", () => {
    expect(LLMS_TXT).toContain(absoluteUrl("/mcp"));
    expect(LLMS_TXT).toContain("/.well-known/oauth-protected-resource/mcp");
    expect(LLMS_TXT).toContain("/.well-known/oauth-authorization-server");
    expect(LLMS_TXT).toContain("umhelper:read");
    for (const tool of [
      "search_catalog",
      "get_course",
      "get_instructor",
      "get_course_reviews",
      "get_course_sections",
    ]) {
      expect(LLMS_TXT).toContain(`\`${tool}\``);
    }
  });

  it("warns agents that reviews are community opinions, not UM's official position", () => {
    expect(LLMS_TXT).toContain("not** official statements of the University of Macau");
  });
});

describe("llms.txt response", () => {
  it("is served as UTF-8 text with a 200", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(LLMS_TXT);
  });
});
