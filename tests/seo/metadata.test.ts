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
