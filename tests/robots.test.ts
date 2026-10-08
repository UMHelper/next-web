import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

/**
 * robots.txt 的 Disallow 只能阻止「抓取」，不能阻止「收录」。
 *
 * 收录开关是页面自己的 `<meta name="robots" content="noindex">`，而 Google
 * 必须先能抓取，才读得到那句 noindex。两者同时配置的结果是：页面既抓不到、
 * 又因为站内链接被「仅 URL 索引」，仍然出现在搜索结果里（GSC 里显示为
 * 「已编入索引，但被 robots.txt 屏蔽」）。线上曾经如此：单条 /submit/… URL
 * 拿到 826 次搜索展现。
 *
 * 因此规则是：**自身带 noindex 的公开路径一律不得写进 Disallow**；Disallow
 * 只留给「没有可收录页面、也不需要被抓取」的端点（/api/）与鉴权后台（/admin/）。
 */
const NOINDEX_SERVED_PATHS = ["/submit/", "/search/", "/sign-in", "/sign-up", "/timetable/"];

function rule() {
  const config = robots().rules;
  const rules = Array.isArray(config) ? config : [config];
  return rules[0] as { userAgent: string; allow?: string; disallow?: string[] };
}

describe("robots", () => {
  it("only disallows endpoints that have no page to index", () => {
    expect(rule()).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/cdn-cgi/"],
    });
  });

  /**
   * `/cdn-cgi/` 是 Cloudflare 托管的保留前缀（RUM 上报 `/cdn-cgi/rum`、排障
   * `/cdn-cgi/trace`、Bot 挑战 `/cdn-cgi/challenge-platform/` 等），由边缘直接
   * 处理，不是站内内容。爬虫会把它当站点内容去抓，失败不影响排名但会污染
   * Search Console 的抓取报告，所以官方建议整个前缀 disallow。
   *
   * 前提：目前没有使用 Cloudflare 图片转换。若将来启用（URL 形如
   * `/cdn-cgi/image/…`），必须补一条更具体的 `Allow: /cdn-cgi/image/`，否则
   * 转换后的图片会被这条 Disallow 一起挡掉。
   */
  it("disallows the Cloudflare-managed /cdn-cgi/ prefix", () => {
    expect(rule().disallow).toContain("/cdn-cgi/");
    expect(NOINDEX_SERVED_PATHS).not.toContain("/cdn-cgi/");
  });

  it("never disallows a path that relies on a noindex meta tag", () => {
    const disallow = rule().disallow ?? [];
    for (const path of NOINDEX_SERVED_PATHS) {
      expect(
        disallow,
        `${path} 自带 noindex：屏蔽抓取会让 Google 永远读不到它，只能退化成「仅 URL 索引」`,
      ).not.toContain(path);
    }
  });
});
