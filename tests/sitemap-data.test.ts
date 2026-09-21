import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppConfig } = vi.hoisted(() => ({ getAppConfig: vi.fn() }));
vi.mock("@/lib/config/app-config", () => ({ getAppConfig }));

import { buildCatalogSitemap, getSitemapLastModified } from "@/lib/sitemap-data";

describe("sitemap data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfig.mockResolvedValue({
      currentYear: 2026,
      currentSem: 1,
      isPreenrollmentOpen: true,
      databaseLastUpdate: "2026-09-01",
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("builds canonical GE catalog URLs without querying the database", async () => {
    const urls = (await buildCatalogSitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://umeh.top/catalog/gecourse");
    expect(urls).toContain("https://umeh.top/catalog/gecourse/GEGA");
  });

  it("uses one stable lastModified value", async () => {
    const entries = await buildCatalogSitemap();
    expect(new Set(entries.map((entry) => entry.lastModified.getTime())).size).toBe(1);
  });

  it("returns the configured last-updated date", async () => {
    await expect(getSitemapLastModified()).resolves.toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });
});
