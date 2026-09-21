import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/submit/", "/search/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: "https://umeh.top/sitemap.xml",
    host: "https://umeh.top",
  }
}
