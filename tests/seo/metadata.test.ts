import { describe, expect, it } from "vitest";
import { rootMetadata } from "@/lib/seo";

describe("root SEO metadata", () => {
  it("uses metadataBase and title template", () => {
    expect(rootMetadata.metadataBase?.toString()).toBe("https://umeh.top/");
    expect(rootMetadata.title).toMatchObject({
      default: "What2Reg @ UM 澳大選咩課",
      template: "%s | What2Reg @ UM",
    });
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
