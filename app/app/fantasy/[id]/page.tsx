import type { Metadata } from "next";
import Link from "next/link";
import PreviewArticle from "@/components/PreviewArticle";
import { isUpcoming, resultIds, fantasyParams, readMatch, readResults, readVenue } from "@/lib/build";
import { PREVIEWS_LIVE, buildFantasy, fantasyPath, previewLd } from "@/lib/preview";
import { seo } from "@/lib/seo";

type P = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = fantasyParams;
const HOME: [string, string] = ["Fantasy predictions", "/fantasy/"];

function article(id: string) {
  const d = readMatch(id);
  if (!d) return null;
  try {
    const a = buildFantasy(d, readVenue(id), readResults());
    return a && { ...a, played: !isUpcoming(d), result: resultIds().includes(id) };
  } catch { return null; }   // an odd document never breaks the build
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const id = (await params).id, a = article(id);
  if (!a) return seo(fantasyPath(id), "Fantasy prediction | CricSynthesis", "Fantasy prediction.", { noindex: true });
  const base = seo(a.path, `${a.title} | CricSynthesis`, a.description, { noindex: !PREVIEWS_LIVE || a.played });
  return { ...base, openGraph: { ...base.openGraph, type: "article", publishedTime: a.date, modifiedTime: a.updated } };
}

export default async function Page({ params }: P) {
  const a = article((await params).id);
  if (!a) return <div className="page-head"><p className="notice">No fantasy prediction for this match yet. <Link href="/fantasy/">All fantasy predictions</Link></p></div>;
  return <PreviewArticle a={a} ld={previewLd(a, HOME)} home={HOME} />;
}
