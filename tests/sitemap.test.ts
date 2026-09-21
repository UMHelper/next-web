import { describe, expect, it } from "vitest";
import { buildCatalogSitemap } from "@/lib/sitemap-data";

describe("sitemap data", () => {
  it("uses absolute URLs without trailing subpaths", () => {
    const entries = buildCatalogSitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url.startsWith("https://umeh.top/catalog/")).toBe(true);
      expect(entry.url.endsWith("/")).toBe(false);
    }
  });
});
