import { describe, expect, it } from "vitest";
import { buildCatalogSitemap } from "@/lib/sitemap-data";

describe("buildCatalogSitemap", () => {
  it("builds canonical GE catalog URLs without querying the database", () => {
    const urls = buildCatalogSitemap().map((entry) => entry.url);
    expect(urls).toContain("https://umeh.top/catalog/gecourse");
    expect(urls).toContain("https://umeh.top/catalog/gecourse/GEGA");
  });

  it("uses one stable lastModified value", () => {
    const entries = buildCatalogSitemap();
    expect(new Set(entries.map((entry) => entry.lastModified.getTime())).size).toBe(1);
  });
});
