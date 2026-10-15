import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Banner 會透過 CsBanner 用到 usePathname（CSS 系的公告只在 CISC/ISOM 頁出現）
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { Banner } from "@/components/banner";
import { IOS_APP_STORE_URL } from "@/lib/site";

const html = renderToStaticMarkup(<Banner />);

describe("App Store announcement banner", () => {
  it("links to the store listing and keeps the brand-gradient CTA", () => {
    expect(html).toContain(`href="${IOS_APP_STORE_URL}"`);
    expect(html).toContain("現已在 App Store 上架");
    expect(html).toContain("立即下載");
    expect(html).toContain("from-wordmark-from");
    expect(html).toContain("to-wordmark-to");
    // 公告句只有一個連結：不再在句子中間多開 tab 停留點
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("keeps the Apple mark inline and decorative", () => {
    // inline-block 讓標誌跟著文字斷行；aria-hidden 讓它不進無障礙樹
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*class="[^"]*inline-block/);
    expect(html).toMatch(/<path d="M12\.152 6\.896/);
  });
});
