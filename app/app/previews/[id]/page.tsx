import type { Metadata } from "next";
import Link from "next/link";
import PreviewArticle from "@/components/PreviewArticle";
import { isUpcoming, resultIds, previewParams, readMatch, readResults, readVenue } from "@/lib/build";
import { PREVIEWS_LIVE, buildPreview, previewLd, previewPath } from "@/lib/preview";
import { seo } from "@/lib/seo";

type P = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = previewParams;

function article(id: string) {
  const d = readMatch(id);
  if (!d) return null;
  try {
    const a = buildPreview(d, readVenue(id), readResults());
    return a && { ...a, played: !isUpcoming(d), result: resultIds().includes(id) };
  } catch { return null; }   // an odd document never breaks the build
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const id = (await params).id, a = article(id);
  if (!a) return seo(previewPath(id), "Match preview | CricSynthesis", "Match preview.", { noindex: true });
  const base = seo(a.path, `${a.title} | CricSynthesis`, a.description, { noindex: !PREVIEWS_LIVE || a.played });
  return { ...base, openGraph: { ...base.openGraph, type: "article", publishedTime: a.date, modifiedTime: a.updated } };
}

export default async function Page({ params }: P) {
  const a = article((await params).id);
  if (!a) return <div className="page-head"><p className="notice">No preview for this match yet. <Link href="/matches/">All matches</Link></p></div>;
  return <PreviewArticle a={a} ld={previewLd(a)} />;
}
