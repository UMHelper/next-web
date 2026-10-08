import {
  SITE_NAME,
  absoluteUrl,
  buildCatalogPath,
  buildCoursePath,
  buildProfessorPath,
  buildReviewPath,
} from "@/lib/site";

/**
 * `/llms.txt` 的正文（<https://llmstxt.org/>，spec v2）。
 *
 * 与 `robots.txt` / `sitemap.xml` 的分工：
 *  - `sitemap.xml` 是「所有可收录 URL」的完整清单，给搜索引擎，体积大；
 *  - `llms.txt` 是「人/模型可读的策展导读」，给按需取数的 agent，体积小。
 *
 * 正文刻意保持小而稳定，并且所有示例 URL 都**由 `lib/site.ts` 的路径构造器
 * 生成**：URL 结构一旦变化，这里不会留下过期链接（见 `tests/seo/llms-txt.test.ts`）。
 *
 * 不把 `/search/`、`/submit/`、`/timetable`、`/sign-in` 这些自带 `noindex`
 * 的用户操作页列为推荐入口——它们没有可引用内容。`/search/` 只在正文里作为
 * 「关键词查询」的兜底出现，并附上「引用请回到规范页」的提醒。
 * 背景见 `app/robots.ts` 的注释。
 *
 * 内容放在 `lib/` 而不是 `app/llms.txt/route.ts`：Next 只允许 `route.ts`
 * 导出 HTTP 方法与段配置，导出 `buildLlmsTxt` 会让生产构建报
 * 「"buildLlmsTxt" is not a valid Route export field」。
 */

const HOME_URL = absoluteUrl("/");
const SUPPORT_URL = absoluteUrl("/support");
const CATALOG_EXAMPLE_URL = absoluteUrl(buildCatalogPath(["FBA", "AIM"]));
const COURSE_EXAMPLE_URL = absoluteUrl(buildCoursePath("ACCT1000"));
const PROFESSOR_EXAMPLE_URL = absoluteUrl(buildProfessorPath("CHAN TAI MAN"));
const REVIEW_EXAMPLE_URL = absoluteUrl(buildReviewPath("ACCT1000", "CHAN TAI MAN"));

export function buildLlmsTxt(): string {
  return `# ${SITE_NAME}

> A student-run course catalog and anonymous course-review platform for the University of Macau (UM), published at https://umeh.top. It covers UM course offerings, class sections, instructor profiles and community reviews, and exposes a read-only MCP server for agents.

Notes for agents:

- Canonical base URL is \`https://umeh.top\`; every URL below is absolute.
- Most page copy and review text is Traditional Chinese (zh-Hant). Course codes, instructor names and URL slugs are ASCII and upper-case.
- Course codes look like \`ACCT1000\` (department prefix + number). Instructor names are upper-case and space-separated, e.g. \`CHAN TAI MAN\`, and are percent-encoded in URLs (\`%20\`).
- Reviews are anonymous personal opinions, **not** official statements of the University of Macau. Cite the \`https://umeh.top\` page URL behind any fact, and never present UMHelper data as UM's official position.
- Pages are server-rendered HTML and there is no per-page \`.md\` variant yet, so the HTML URLs below are the canonical agent-readable source. \`/sitemap.xml\` holds the full URL inventory.

## Key pages

- [Home](${HOME_URL}): course and instructor search plus site-wide statistics.
- [Course catalog](${CATALOG_EXAMPLE_URL}): courses grouped by faculty and department. Pattern: \`/catalog/{FACULTY}[/{DEPARTMENT}]\`; general education courses use the \`gecourse\` slug, e.g. \`https://umeh.top/catalog/gecourse/GEGA\`.
- [Plugin support](${SUPPORT_URL}): what the ChatGPT and Codex plugin does, what data is sent, and how to revoke access. Append \`?lang=zh\` for Traditional Chinese.

## Course, instructor and review pages

- Course detail: \`https://umeh.top/course/{CODE}\` — [ACCT1000 example](${COURSE_EXAMPLE_URL}): description, offering unit, sections and review summary.
- Instructor detail: \`https://umeh.top/professor/{NAME}\` — [CHAN TAI MAN example](${PROFESSOR_EXAMPLE_URL}): courses taught and aggregated ratings.
- Reviews for one course and instructor: \`https://umeh.top/reviews/{CODE}/{NAME}\`, paginated by appending \`/{PAGE}\` — [ACCT1000 / CHAN TAI MAN example](${REVIEW_EXAMPLE_URL}).
- Keyword lookup when the exact code or name is unknown: \`https://umeh.top/search/course/{TEXT}\` and \`https://umeh.top/search/instructor/{TEXT}\`. Those result pages are marked \`noindex\` for search engines, so use them only to find the canonical page above and cite that page instead.

## Read-only MCP server

- [MCP endpoint](https://umeh.top/mcp): Model Context Protocol server over streamable HTTP, protected by OAuth 2.1 with the \`umhelper:read\` scope. Five read-only tools: \`search_catalog\`, \`get_course\`, \`get_instructor\`, \`get_course_reviews\`, \`get_course_sections\`. Keep the \`https://umeh.top\` reference URLs returned with every result.
- [Protected resource metadata](https://umeh.top/.well-known/oauth-protected-resource/mcp): RFC 9728 metadata for discovering the resource and its scopes.
- [Authorization server metadata](https://umeh.top/.well-known/oauth-authorization-server): RFC 8414 metadata proxied from Clerk for older MCP clients.

## Policies

- [Terms of Service](https://umeh.top/terms-of-service) / [服務條款](https://umeh.top/terms-of-service/zh)
- [Privacy Policy](https://umeh.top/privacy-policy) / [隱私政策](https://umeh.top/privacy-policy/zh)

## Optional

- [Sitemap](https://umeh.top/sitemap.xml): complete list of indexable catalog, course and review URLs.
- [Source code](https://github.com/UMHelper/next-web): GPL-3.0 licensed Next.js 15 + Supabase implementation of this site.
`;
}
