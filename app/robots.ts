import type { MetadataRoute } from "next"

/**
 * robots.txt 的 Disallow 只阻止抓取，不能阻止收录：Google 读不到被屏蔽页面里的
 * `noindex`，反而会让你得到「仅 URL 索引」——这些 URL 仍然出现在搜索结果里。
 *
 * 所以这里只屏蔽「没有可收录页面、也不需要被抓取」的端点：
 *  - /api/     接口，不是页面
 *  - /admin/   鉴权后台（不在站内公开链接中，且自身也带 noindex）
 *  - /cdn-cgi/ Cloudflare 托管的保留前缀，不是站内内容，且由边缘直接处理
 *
 * 而 /submit/、/search/、/sign-in、/sign-up、/timetable/ 这些**公开且自带
 * noindex** 的路径必须允许抓取，noindex 才会生效。曾经把 /submit/ 写进
 * Disallow：线上单条 /submit/… URL 因此拿到 826 次搜索展现。
 *
 * `/cdn-cgi/` 那条的来由：Cloudflare Web Analytics 的 RUM 端点就是
 * `/cdn-cgi/rum`（beacon 上报，恒定返回 204），同族还有 `/cdn-cgi/trace`、
 * `/cdn-cgi/challenge-platform/` 等。官方建议把整个前缀 disallow：爬虫会把它们
 * 误当成站点内容去抓，抓取失败不影响排名，但会在 Search Console 里留下无意义的
 * 抓取错误。见 https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/
 *
 * 注意一个前提：**若将来启用 Cloudflare 图片转换**（URL 形如 /cdn-cgi/image/…），
 * 必须补一条更具体的 `Allow: /cdn-cgi/image/`（Next 会把它排在 Disallow 之前，
 * 具体规则优先），否则转换后的图片会被这条 Disallow 一起挡掉。目前仓库没有使用
 * 图片转换，所以这条 Disallow 是安全的。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/cdn-cgi/"],
      },
    ],
    sitemap: "https://umeh.top/sitemap.xml",
    host: "https://umeh.top",
  }
}
