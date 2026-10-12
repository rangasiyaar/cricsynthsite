// Search and link-preview metadata: one title, description and canonical URL per page.
import type { Metadata } from "next";

export const SITE = "https://cricsynthesis.in";
export const SITE_NAME = "CricSynthesis";

export function seo(path: string, title: string, description: string, opts: { noindex?: boolean } = {}): Metadata {
  const url = `${SITE}${path}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_IN", url, title, description,
      images: [{ url: "/og.png?v=3", width: 1200, height: 630, alt: "CricSynthesis cricket match forecasts" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png?v=3"] },
    ...(opts.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
