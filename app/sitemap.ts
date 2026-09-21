import type { MetadataRoute } from "next";

import supabaseServer from "@/lib/supabase/server";
import { buildCatalogSitemap, getSitemapLastModified } from "@/lib/sitemap-data";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";

export const revalidate = 86400;


const fetchCourseSitemap = async () => {
  const { data, error } = await supabaseServer.from("course_noporf").select("New_code");
  if (error) {
    console.error("[sitemap] course query failed:", error.message);
    return [];
  }

  const lastModified = await getSitemapLastModified();
  return (data ?? []).map((course: any) => ({
    url: absoluteUrl(buildCoursePath(course.New_code)),
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.9,
  }));
};

const fetchReviewSitemap = async () => {
  const { data, error } = await supabaseServer
    .from("prof_with_course")
    .select("course_id,prof_id");
  if (error) {
    console.error("[sitemap] review query failed:", error.message);
    return [];
  }

  const lastModified = await getSitemapLastModified();
  return (data ?? []).map((review: any) => ({
    url: absoluteUrl(buildReviewPath(review.course_id, review.prof_id)),
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = await getSitemapLastModified();
  const indexSitemap: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: absoluteUrl("/privacy-policy"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/privacy-policy/zh"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/terms-of-service"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/terms-of-service/zh"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const [courseSitemap, reviewSitemap] = await Promise.all([
    fetchCourseSitemap(),
    fetchReviewSitemap(),
  ]);
  const catalogSitemap = await buildCatalogSitemap();

  return [...indexSitemap, ...courseSitemap, ...catalogSitemap, ...reviewSitemap];
}
