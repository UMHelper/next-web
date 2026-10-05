import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What2Reg @ UM 插件披露测试。
 *
 * OpenAI 插件目录要求 website/support/privacy/terms 四个 URL 匿名可达，并要求隐私政策
 * 明确说明：ChatGPT/Codex 会把用户主动输入的查询与 OAuth 标识送到 MCP 服务做鉴权与限流，
 * 服务只返回公开课程数据，不返回 email、private metadata、评论者身份或个人课表。
 *
 * 法律页正文集中在 `lib/`，页面按现有结构在各自 route 里追加插件段落，所以这里直接扫描
 * 页面源码——与 `tests/site-urls.test.ts` 的守护方式一致。
 */

const SUPPORT_PAGE = "app/support/page.tsx";
const PRIVACY_EN_PAGE = "app/privacy-policy/page.tsx";
const PRIVACY_ZH_PAGE = "app/privacy-policy/zh/page.tsx";
const TERMS_EN_PAGE = "app/terms-of-service/page.tsx";
const TERMS_ZH_PAGE = "app/terms-of-service/zh/page.tsx";
const MCP_RESOURCE_METADATA = "app/.well-known/oauth-protected-resource/mcp/route.ts";

const PLUGIN_UPDATED_DATE = "2026-10-05";
const PREVIOUS_UPDATED_DATE = "2025-08-22";

const PUBLIC_PAGES = [
  "app/page.tsx",
  SUPPORT_PAGE,
  PRIVACY_EN_PAGE,
  TERMS_EN_PAGE,
] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function expectAll(source: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    expect(source, `missing disclosure matching ${String(pattern)}`).toMatch(pattern);
  }
}

describe("plugin support page", () => {
  it("exists as an anonymously reachable page with its own metadata", () => {
    expect(existsSync(SUPPORT_PAGE)).toBe(true);
    const source = read(SUPPORT_PAGE);

    expect(source).toMatch(/export const metadata: Metadata/);
    expect(source).toContain("canonical: '/support'");
    expect(source).toMatch(/title: ['"][^'"]*Support/i);
    expect(source).not.toMatch(/@clerk\/nextjs\/server/);
    expect(source).not.toMatch(/redirectToSignIn|\bauth\(\)|requireAuth/);
  });

  it("offers a support channel for questions and plugin problems", () => {
    const source = read(SUPPORT_PAGE);

    // 现有站点的正式反馈渠道：共享的 Google 表单常量与 GitHub issues。
    expect(source).toContain("@/lib/legal");
    expect(source).toContain("FEEDBACK_FORM_URL");
    expect(source).toContain("https://github.com/UMHelper/next-web/issues");
    expect(source).toMatch(/support/i);
    expect(source).toMatch(/report/i);
  });

  it("explains OAuth revocation and account deletion", () => {
    const source = read(SUPPORT_PAGE);

    expect(source).toMatch(/revoke/i);
    expect(source).toMatch(/OAuth/i);
    expect(source).toMatch(/Clerk/);
    expect(source).toMatch(/delete your account|account deletion/i);
  });

  it("documents what the plugin sends, what it returns and what it never returns", () => {
    const source = read(SUPPORT_PAGE);

    expectAll(source, [
      /ChatGPT/,
      /Codex/,
      /OAuth/,
      /rate limit/i,
      /course/i,
      /instructor/i,
      /review/i,
      /class section/i,
      /email/i,
      /private metadata/i,
      /commenter/i,
      /timetable/i,
    ]);
  });

  it("serves both English and Traditional Chinese copy", () => {
    const source = read(SUPPORT_PAGE);

    expectAll(source, [/技術支援|支援/, /撤銷/, /刪除帳戶/, /個人課表/]);
    expect(source).toContain("/support?lang=zh");
  });

  it("never leaks secrets, test accounts or debugging output", () => {
    const source = read(SUPPORT_PAGE);

    expect(source).not.toMatch(/sk_(test|live)_|CLERK_SECRET|SUPABASE_SERVICE_ROLE|test account|測試帳號/i);
    expect(source).not.toMatch(/console\.(log|debug)\(/);
  });
});

describe("privacy policy plugin disclosure", () => {
  it("keeps the existing bilingual structure and refreshes the date", () => {
    for (const [path, switchHref] of [
      [PRIVACY_EN_PAGE, "/privacy-policy/zh"],
      [PRIVACY_ZH_PAGE, "/privacy-policy"],
    ] as const) {
      const source = read(path);
      expect(source).toContain("@/components/legal-content");
      expect(source).toContain("@/lib/privacy-policy");
      expect(source).toContain(`switchHref='${switchHref}'`);
      // 頁面必須以明確的 updatedDate 覆寫更新日期，而不是沿用法律正文裡的舊日期。
      expect(source).toContain("updatedDate: PLUGIN_UPDATED_DATE");
      expect(source).toContain(PLUGIN_UPDATED_DATE);
      expect(source).not.toContain(PREVIOUS_UPDATED_DATE);
    }
  });

  it("discloses that ChatGPT/Codex send queries and an OAuth identifier for authentication and rate limiting", () => {
    for (const path of [PRIVACY_EN_PAGE, PRIVACY_ZH_PAGE]) {
      expectAll(read(path), [
        /ChatGPT/,
        /Codex/,
        /OAuth/,
        /authenticat|鉴权|鑑權|身份驗證/i,
        /rate limit/i,
      ]);
    }
  });

  it("discloses that only public course, instructor, review and class-section data is returned", () => {
    expectAll(read(PRIVACY_EN_PAGE), [
      /course/i,
      /instructor/i,
      /review/i,
      /class section/i,
    ]);
    expectAll(read(PRIVACY_ZH_PAGE), [/課程/, /教師/, /評價/, /班次/]);
  });

  it("discloses that email, private metadata, commenter identities and personal timetables are never returned", () => {
    expectAll(read(PRIVACY_EN_PAGE), [
      /email/i,
      /private metadata/i,
      /commenter/i,
      /timetable/i,
    ]);
    expectAll(read(PRIVACY_ZH_PAGE), [
      /電郵|電子郵件/,
      /private metadata|私人中繼資料|私密中繼資料/i,
      /評論者/,
      /課表/,
    ]);
  });

  it("documents retention, logging purpose, revocation and third-party policies", () => {
    for (const path of [PRIVACY_EN_PAGE, PRIVACY_ZH_PAGE]) {
      const source = read(path);
      expectAll(source, [/retain|保留/i, /log|日誌|記錄/i, /revoke|撤銷/i]);
      expect(source).toContain("https://openai.com/policies/privacy-policy");
      expect(source).toContain("https://openai.com/policies/terms-of-use");
      expect(source).toMatch(/clerk\.com/i);
    }
  });
});

describe("terms of service plugin disclosure", () => {
  it("keeps the existing bilingual structure and refreshes the date", () => {
    for (const [path, switchHref] of [
      [TERMS_EN_PAGE, "/terms-of-service/zh"],
      [TERMS_ZH_PAGE, "/terms-of-service"],
    ] as const) {
      const source = read(path);
      expect(source).toContain("@/components/legal-content");
      expect(source).toContain("@/lib/terms-of-service");
      expect(source).toContain(`switchHref='${switchHref}'`);
      expect(source).toContain("updatedDate: PLUGIN_UPDATED_DATE");
      expect(source).toContain(PLUGIN_UPDATED_DATE);
      expect(source).not.toContain(PREVIOUS_UPDATED_DATE);
    }
  });

  it("covers plugin use, authentication, rate limits and third-party platform terms", () => {
    for (const path of [TERMS_EN_PAGE, TERMS_ZH_PAGE]) {
      const source = read(path);
      expectAll(source, [
        /ChatGPT/,
        /Codex/,
        /MCP|Model Context Protocol/i,
        /rate limit/i,
        /revoke|撤銷/i,
        /delete|刪除/i,
        /report|回報/i,
        /openai\.com\/policies/i,
      ]);
    }
  });
});

describe("listing URL reachability", () => {
  it("ships a page module for the website, support, privacy and terms URLs", () => {
    for (const path of PUBLIC_PAGES) {
      expect(existsSync(path), `${path} must exist`).toBe(true);
    }
  });

  it("does not gate any listing URL behind Clerk authentication", () => {
    for (const path of PUBLIC_PAGES) {
      const source = read(path);
      expect(source).not.toMatch(/redirectToSignIn|\bauth\(\)|requireAuth|auth\.protect/);
    }
    // 全站只挂 clerkMiddleware()，没有 createRouteMatcher/auth.protect 的路径级保护，
    // 公开页因此保持匿名可达。
    const middleware = read("middleware.ts");
    expect(middleware).toContain("clerkMiddleware");
    expect(middleware).not.toMatch(/auth\.protect|createRouteMatcher/);
  });

  it("points the MCP resource documentation at the live support page", () => {
    expect(read(MCP_RESOURCE_METADATA)).toContain("https://umeh.top/support");
    expect(read(SUPPORT_PAGE)).toContain("canonical: '/support'");
  });

  it("links the website, support, privacy and terms URLs from the support page", () => {
    const source = read(SUPPORT_PAGE);
    expect(source).toContain("https://umeh.top");
    expect(source).toContain("/privacy-policy");
    expect(source).toContain("/terms-of-service");
  });
});
