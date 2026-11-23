// Docs home: two tracks. The Guide (what each analysis shows and how to use it, for fans) and the API reference
// (for developers). Old /docs/#endpoint links forward to the same place in /docs/api/.
import type { Metadata } from "next";
import Link from "next/link";
import DocsForward from "@/components/DocsForward";
import { seo } from "@/lib/seo";
import { GUIDE, guidePath } from "@/lib/guide";

export const metadata: Metadata = seo("/docs/", "Docs | CricSynthesis",
  "The CricSynthesis guide to reading every forecast, and the API reference for developers.");

const POPULAR = ["how-our-forecasts-are-made", "win-chance-and-projected-scores", "fantasy-teams", "pick-your-fantasy-team-in-5-minutes"];

export default function Docs() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <DocsForward />
      <h1><span>Docs</span></h1>
      <p className="cs-lede">Find out what the numbers on a match page mean, or build on them with the API.</p>
      <div className="grid g2 docs-tracks">
        <Link href={guidePath()} className="card docs-track">
          <h2>Guide</h2>
          <p className="muted">What each forecast shows and how to use it, from the toss to your fantasy team.</p>
          <span className="docs-track-go">Read the guide</span>
        </Link>
        <Link href="/docs/api/" className="card docs-track">
          <h2>API reference</h2>
          <p className="muted">Endpoints, parameters and sample responses, with a playground for trying calls.</p>
          <span className="docs-track-go">Open the reference</span>
        </Link>
      </div>
      <div className="grid g2 docs-more">
        <div>
          <p className="cs-k">Start here</p>
          <ul className="docs-links">{POPULAR.map((s) => { const p = GUIDE.find((g) => g.slug === s)!; return <li key={s}><Link href={guidePath(s)}>{p.title}</Link></li>; })}</ul>
        </div>
        <div>
          <p className="cs-k">Developers</p>
          <ul className="docs-links">
            <li><Link href="/developers/">API plans</Link></li>
            <li><Link href="/playground/">Playground</Link></li>
            <li><Link href="/mcp/">Use CricSynthesis in an AI assistant</Link></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
