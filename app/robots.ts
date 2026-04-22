import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/auth/", "/settings/"],
      },
    ],
    sitemap: "https://vector-goroda.ru/sitemap.xml",
  }
}
