import { faculty, faculty_dept } from "@/lib/consant";
import { absoluteUrl, buildCatalogPath } from "@/lib/site";


function parseLastModified(value: string | undefined) {
  if (!value) return new Date("2026-08-15T00:00:00.000Z");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? new Date("2026-08-15T00:00:00.000Z") : parsed;
}

export function getSitemapLastModified() {
  return parseLastModified(process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE);
}

export function buildCatalogSitemap() {
  const entries: Array<{
    url: string;
    lastModified: Date;
    changeFrequency: "monthly";
    priority: number;
  }> = [];
  const lastModified = getSitemapLastModified();

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
