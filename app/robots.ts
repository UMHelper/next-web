import type { MetadataRoute } from "next"

/**
 * robots.txt 的 Disallow 只阻止抓取，不能阻止收录：Google 读不到被屏蔽页面里的
 * `noindex`，反而会让你得到「仅 URL 索引」——这些 URL 仍然出现在搜索结果里。
 *
 * 所以这里只屏蔽「没有可收录页面、也不需要被抓取」的端点：
 *  - /api/    接口，不是页面
 *  - /admin/  鉴权后台（不在站内公开链接中，且自身也带 noindex）
 *
 * 而 /submit/、/search/、/sign-in、/sign-up、/timetable/ 这些**公开且自带
 * noindex** 的路径必须允许抓取，noindex 才会生效。曾经把 /submit/ 写进
 * Disallow：线上单条 /submit/… URL 因此拿到 826 次搜索展现。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: "https://umeh.top/sitemap.xml",
    host: "https://umeh.top",
  }
}
