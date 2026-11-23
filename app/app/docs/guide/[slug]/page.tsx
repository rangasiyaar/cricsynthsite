// One guide page (content in lib/guide.ts), built for every slug at export time.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle, GuideNav, guideLd } from "@/components/Guide";
import { GUIDE, guidePage, guidePath } from "@/lib/guide";
import { ldJson } from "@/lib/ld";
import { SITE, seo } from "@/lib/seo";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => GUIDE.map((g) => ({ slug: g.slug }));

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const page = guidePage((await params).slug);
  return page ? seo(guidePath(page.slug), `${page.seoTitle} | CricSynthesis`, page.description) : {};
}

export default async function GuideSlug({ params }: P) {
  const page = guidePage((await params).slug);
  if (!page) notFound();
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}><div className="guide-layout">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(guideLd(page, SITE)) }} />
      <GuideNav current={page.slug} />
      <div className="guide-main"><GuideArticle page={page} /></div>
    </div></div>
  );
}
