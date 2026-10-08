import { buildLlmsTxt } from "@/lib/llms-txt";

/**
 * `/llms.txt` —— 给 AI agent 看的站点导读（<https://llmstxt.org/>，spec v2）。
 *
 * 正文与示例 URL 都在 `lib/llms-txt.ts`。这个文件**只能**导出 HTTP 方法与段
 * 配置：Next 会对 `route.ts` 做导出面校验，多导出一个数据函数就会让生产构建
 * 报 `"…" is not a valid Route export field`（`tsc` 与 `next dev` 都不会报，
 * 只有 `next build` 会）。`tests/seo/llms-txt.test.ts` 里有一条守卫断言盯着
 * 这个导出面。
 */
export const dynamic = "force-static";

export const revalidate = 86400;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      // Markdown served as text/plain, matching how OpenAI serves its own
      // llms.txt; clients that only accept text/* still parse it fine.
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
