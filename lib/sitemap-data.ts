import { getAppConfig } from "@/lib/config/app-config";
import { faculty, faculty_dept } from "@/lib/consant";
import { absoluteUrl, buildCatalogPath } from "@/lib/site";


function parseLastModified(value: string | null) {
  if (!value) return new Date("2026-08-15T00:00:00.000Z");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? new Date("2026-08-15T00:00:00.000Z") : parsed;
}

export async function getSitemapLastModified() {
  const { databaseLastUpdate } = await getAppConfig();
  return parseLastModified(databaseLastUpdate);
}

export async function buildCatalogSitemap() {
  const entries: Array<{
    url: string;
    lastModified: Date;
    changeFrequency: "monthly";
    priority: number;
  }> = [];
  const lastModified = await getSitemapLastModified();

  for (const fac of faculty) {
    entries.push({
      url: absoluteUrl(buildCatalogPath([fac])),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    });

    for (const dept of faculty_dept[fac] ?? []) {
      entries.push({
        url: absoluteUrl(buildCatalogPath([fac, dept])),
        lastModified,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return entries;
}
