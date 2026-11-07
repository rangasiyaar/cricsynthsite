import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import RequestAccess from "@/components/RequestAccess";
import { CATEGORIES, ENDPOINTS } from "@/lib/apiref";

export const metadata: Metadata = seo("/developers/", "Cricket analytics API | CricSynthesis", "One API for cricket analytics, match simulation and broadcast graphics: win probability, score projections, player and venue insight.");

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

const PLANS = [
  { name: "Free", price: "₹0", lines: ["200 requests a day", "Every hosted endpoint", "Graphics carry a watermark"] },
  { name: "Pro", price: "Contact us", lines: ["5,000 requests a day", "Every hosted endpoint", "Clean graphics"] },
  { name: "Business", price: "Contact us", lines: ["50,000 requests a day", "Every hosted endpoint", "Priority support"] },
];

const EXAMPLE = `# Batter v bowler, ball by ball
curl "${API}/v1/matchups?batter=ba607b88&bowler=462411b3&phase=death" \\
  -H "X-API-Key: cs_live_…"

# Win chances from the current score of a covered match
curl -X POST ${API}/v1/win-probability \\
  -H "X-API-Key: cs_live_…" -H "Content-Type: application/json" \\
  -d '{"match_id": "<from /v1/matches>",
       "state": {"innings": 2, "batting": 1, "runs": 92, "wickets": 3, "overs": 11.2, "target": 181}}'`;

const HOSTED = ENDPOINTS.filter((e) => e.hosted !== "local").length;
const COVERED = ENDPOINTS.filter((e) => e.hosted === "covered").length;

const PER_CARD = 8;

export default function Developers() {
  return (
    <div className="page-head">
      <h1><span>CricSynthesis API</span></h1>
      <p className="cs-lede">{ENDPOINTS.length} endpoints for player and venue analytics, match simulation and broadcast graphics.</p>
      <p className="muted" style={{ maxWidth: "68ch", marginTop: 12 }}>
        {HOSTED} are on the hosted API at <span className="mono">{API}</span>, {COVERED} of them for the matches we cover
        (answers ready from 3 days before the start). The other {ENDPOINTS.length - HOSTED}, simulations with your own XIs
        and conditions, run in the <Link href="/mcp/">MCP server</Link>&apos;s engine on your machine.</p>
      <div className="cs-hero-ctas" style={{ marginTop: 24 }}>
        <Link className="cs-btn cs-btn--primary" href="/docs/">Read the docs</Link>
        <Link className="cs-btn cs-btn--secondary" href="/playground/">Open the playground</Link>
      </div>
      <div className="grid g3" style={{ marginTop: 20 }}>
        {CATEGORIES.map((c) => {
          const eps = ENDPOINTS.filter((e) => e.category === c);
          return (
            <div key={c} className="card">
              <h3>{c} <span className="muted small">{eps.length}</span></h3>
              {eps.slice(0, PER_CARD).map((e) => (
                <a key={e.id} href={`/docs/#${e.id}`} style={{ display: "block", padding: "7px 0", borderTop: "1px solid var(--tick)", color: "inherit" }}>
                  <div className="small">{e.summary}</div>
                  <div className="mono muted" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{e.method} {e.path}</div>
                </a>
              ))}
              <Link className="card-foot small" href="/docs/" style={{ paddingTop: 12, borderTop: "1px solid var(--tick)" }}>
                All {eps.length} {c.toLowerCase()} endpoints</Link>
            </div>
          );
        })}
      </div>
      <h2 style={{ marginTop: 56 }}>Example</h2>
      <div className="cs-api" style={{ padding: 0 }}><div className="cs-api-panel"><div className="cs-api-panel-head"><span>Request</span><span>curl</span></div>
        <pre className="req">{EXAMPLE}</pre></div></div>
      <h2 id="plans" style={{ marginTop: 56, scrollMarginTop: 88 }}>Plans</h2>
      <div className="grid g3">
        {PLANS.map((p) => (
          <div key={p.name} className="card">
            <p className="cs-eyebrow">{p.name}</p>
            <div className="stat" style={{ fontSize: 30 }}>{p.price}</div>
            <ul className="small" style={{ paddingLeft: 18, color: "var(--ink-2)" }}>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 20 }}>
        <Link href="/docs/">API reference</Link> · <Link href="/playground/">Playground</Link>
      </p>
      <RequestAccess />
      <div style={{ paddingBottom: 40 }} />
    </div>
  );
}
