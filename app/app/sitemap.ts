import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { POSTS, postPath } from "@/lib/blog";

export const dynamic = "force-static";

// Rebuilt with every deploy (nightly at least), so lastModified tells crawlers the pages are fresh.
const PAGES: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1, "daily"], ["/match/", 0.9, "daily"], ["/results/", 0.8, "daily"], ["/lab/", 0.7, "weekly"], ["/app/", 0.7, "monthly"],
  ["/pricing/", 0.6, "monthly"], ["/developers/", 0.7, "monthly"], ["/docs/", 0.6, "weekly"], ["/playground/", 0.5, "monthly"],
  ["/mcp/", 0.5, "monthly"], ["/blog/", 0.7, "weekly"], ["/contact/", 0.4, "yearly"], ["/careers/", 0.3, "monthly"], ["/credits/", 0.2, "yearly"],
  ["/privacy/", 0.2, "yearly"], ["/terms/", 0.2, "yearly"],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...PAGES.map(([path, priority, changeFrequency]) => ({ url: `${SITE}${path}`, lastModified: now, changeFrequency, priority })),
    ...POSTS.map((p) => ({ url: `${SITE}${postPath(p.slug)}`, lastModified: new Date(p.date), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
