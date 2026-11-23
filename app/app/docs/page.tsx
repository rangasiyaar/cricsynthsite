// Docs home: two tracks. The Guide (what each analysis shows and how to use it, for fans) and the API reference
// (for developers). Old /docs/#endpoint links forward to the same place in /docs/api/.
import type { Metadata } from "next";
import Link from "next/link";
import DocsForward from "@/components/DocsForward";
import { seo } from "@/lib/seo";
import { GUIDE, guidePath } from "@/lib/guide";

export const metadata: Metadata = seo("/docs/", "Docs | CricSynthesis",
  "CricSynthesis docs: a plain-words guide to every forecast and analysis, and the API reference for developers.");

const POPULAR = ["win-chance-and-projected-scores", "fantasy-teams", "players", "pick-your-fantasy-team-in-5-minutes"];

export default function Docs() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <DocsForward />
      <p className="cs-eyebrow">Docs</p>
      <h1><span>How CricSynthesis works</span></h1>
      <p className="cs-lede">Two ways in: understand what every number on a match page means, or build with our API.</p>
      <div className="grid g2 docs-tracks">
        <Link href={guidePath()} className="card docs-track">
          <h2>Understand the forecasts</h2>
          <p className="muted">What each analysis shows, how to read it and how it helps you decide: win chances, scores, wickets,
            players, grounds, fantasy teams and MatchSynth Lab, in plain words.</p>
          <span className="docs-track-go">Open the guide</span>
        </Link>
        <Link href="/docs/api/" className="card docs-track">
          <h2>Build with the API</h2>
          <p className="muted">Endpoints, parameters and sample responses for player and venue analytics, decision models and
            graphics. Try calls in the playground or connect an AI assistant.</p>
          <span className="docs-track-go">API reference</span>
        </Link>
      </div>
      <div className="grid g2 docs-more">
        <div>
          <p className="cs-k">Popular in the guide</p>
          <ul className="docs-links">{POPULAR.map((s) => { const p = GUIDE.find((g) => g.slug === s)!; return <li key={s}><Link href={guidePath(s)}>{p.title}</Link></li>; })}</ul>
        </div>
        <div>
          <p className="cs-k">For developers</p>
          <ul className="docs-links">
            <li><Link href="/developers/">About the API and plans</Link></li>
            <li><Link href="/playground/">Playground</Link></li>
            <li><Link href="/mcp/">Connect an AI assistant (MCP)</Link></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
