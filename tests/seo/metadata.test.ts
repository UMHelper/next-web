import { describe, expect, it } from "vitest";
import { rootMetadata } from "@/lib/seo";
import { IOS_APP_ID, IOS_APP_STORE_URL } from "@/lib/site";

describe("root SEO metadata", () => {
  it("uses metadataBase and title template", () => {
    expect(rootMetadata.metadataBase?.toString()).toBe("https://umeh.top/");
    expect(rootMetadata.title).toMatchObject({
      default: "What2Reg @ UM 澳大選咩課",
      template: "%s | What2Reg @ UM",
    });
  });

  // iOS Safari 只有拿到這個 meta 才會顯示頂部的系統 App 橫幅
  it("advertises the iOS app with the Smart App Banner", () => {
    expect(rootMetadata.itunes).toEqual({ appId: IOS_APP_ID });
    expect(IOS_APP_ID).toBe("6804686377");
    expect(IOS_APP_STORE_URL).toBe("https://apps.apple.com/app/id6804686377");
  });
});

import { buildProfessorMetadata, noIndexMetadata } from "@/lib/seo";

describe("page metadata helpers", () => {
  it("builds professor metadata with canonical", () => {
    const metadata = buildProfessorMetadata("CHAN TAI MAN");
    expect(metadata.title).toBe("CHAN TAI MAN 課程評價");
    expect(metadata.alternates?.canonical).toBe("/professor/CHAN%20TAI%20MAN");
  });

  it("marks noindex pages", () => {
    expect(noIndexMetadata.robots).toEqual({ index: false, follow: false });
  });
});
