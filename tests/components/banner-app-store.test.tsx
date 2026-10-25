import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
  });

  it("keeps the Apple mark inline and decorative", () => {
    // inline-block 讓標誌跟著文字斷行；aria-hidden 讓它不進無障礙樹
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*class="[^"]*inline-block/);
    expect(html).toMatch(/<path d="M12\.152 6\.896/);
  });
});
