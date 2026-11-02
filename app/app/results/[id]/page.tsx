// One result per page (static, built from the published result): our pre-match forecast against what happened.
import type { Metadata } from "next";
import Link from "next/link";
import ResultDetail from "@/components/ResultDetail";
import { readResult, resultParams } from "@/lib/build";
import { resultDescription, resultLd, resultPath, resultTitle } from "@/lib/matchText";
import { seo } from "@/lib/seo";

type P = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = resultParams;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const id = (await params).id, r = readResult(id);
  if (!r) return seo(resultPath(id), "Result | CricSynthesis", "Forecast result.", { noindex: true });
  return seo(resultPath(id), `${resultTitle(r)} | CricSynthesis`, resultDescription(r));
}

export default async function Page({ params }: P) {
  const r = readResult((await params).id);
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <nav className="small muted" aria-label="Breadcrumb"><Link href="/results/">Results</Link> / {r ? r.teams.map((t) => t.name).join(" vs ") : "Match"}</nav>
      {r ? <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(resultLd(r)) }} />
        <div style={{ marginTop: 16 }}><ResultDetail doc={r} heading="h1" /></div>
      </> : <p className="notice" style={{ marginTop: 16 }}>No result for this match yet. <Link href="/results/">All results</Link></p>}
    </div>
  );
}
