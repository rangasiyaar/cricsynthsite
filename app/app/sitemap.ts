import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { POSTS, postPath } from "@/lib/blog";
import { JOBS, jobPath } from "@/lib/jobs";
import { isUpcoming, matchIds, readMatch, readResult, resultIds } from "@/lib/build";
import { matchPath, resultPath } from "@/lib/matchText";
import { fantasyPath, previewPath } from "@/lib/preview";

export const dynamic = "force-static";

// Rebuilt with every deploy (nightly at least), so lastModified tells crawlers the pages are fresh.
const PAGES: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1, "daily"], ["/matches/", 0.9, "daily"], ["/results/", 0.8, "daily"], ["/previews/", 0.9, "hourly"], ["/fantasy/", 0.9, "hourly"], ["/lab/", 0.7, "weekly"], ["/app/", 0.7, "monthly"],
  ["/pricing/", 0.6, "monthly"], ["/developers/", 0.7, "monthly"], ["/docs/", 0.6, "weekly"], ["/playground/", 0.5, "monthly"],
  ["/mcp/", 0.5, "monthly"], ["/blog/", 0.7, "weekly"], ["/contact/", 0.4, "yearly"], ["/careers/", 0.3, "monthly"], ["/credits/", 0.2, "yearly"],
  ["/privacy/", 0.2, "yearly"], ["/terms/", 0.2, "yearly"],
];

/** Every published match (prediction, playing XI, fantasy once picked) and every result, dated by its last publish. */
function matches(now: Date): MetadataRoute.Sitemap {
  const results = new Set(resultIds());
  return matchIds().flatMap((id) => {
    const d = readMatch(id);
    if (!d) return [];
    const done = results.has(id);
    const lastModified = d.generated_at ? new Date(d.generated_at) : now;
    const freq = done ? "monthly" as const : "hourly" as const;
    return [
      { url: `${SITE}${matchPath(id)}`, lastModified, changeFrequency: freq, priority: done ? 0.5 : 0.9 },
      ...(!isUpcoming(d) ? [] : [{ url: `${SITE}${previewPath(id)}`, lastModified, changeFrequency: freq, priority: 0.9 },
        ...(d.fantasy ? [{ url: `${SITE}${fantasyPath(id)}`, lastModified, changeFrequency: freq, priority: 0.9 }] : [])]),
    ];
  }).concat([...results].map((id) => {
    const r = readResult(id);
    return { url: `${SITE}${resultPath(id)}`, lastModified: r?.date ? new Date(`${r.date}T00:00:00Z`) : now,
             changeFrequency: "monthly" as const, priority: 0.5 };
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...PAGES.map(([path, priority, changeFrequency]) => ({ url: `${SITE}${path}`, lastModified: now, changeFrequency, priority })),
    ...POSTS.map((p) => ({ url: `${SITE}${postPath(p.slug)}`, lastModified: new Date(p.updated ?? p.date), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...matches(now),
    ...JOBS.map((j) => ({ url: `${SITE}${jobPath(j.slug)}`, lastModified: new Date(j.posted), changeFrequency: "weekly" as const, priority: 0.4 })),
  ];
}
