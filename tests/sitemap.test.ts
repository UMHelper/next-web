import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppConfig } = vi.hoisted(() => ({ getAppConfig: vi.fn() }));
vi.mock("@/lib/config/app-config", () => ({ getAppConfig }));

import { buildCatalogSitemap } from "@/lib/sitemap-data";

describe("sitemap data", () => {
  beforeEach(() => {
    getAppConfig.mockResolvedValue({
      currentYear: 2026,
      currentSem: 1,
      isPreenrollmentOpen: true,
      databaseLastUpdate: "2026-09-01",
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("uses absolute URLs without trailing subpaths", async () => {
    const entries = await buildCatalogSitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url.startsWith("https://umeh.top/catalog/")).toBe(true);
      expect(entry.url.endsWith("/")).toBe(false);
    }
  });
});
