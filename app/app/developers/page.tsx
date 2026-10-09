import Link from "next/link";
import RequestAccess from "@/components/RequestAccess";
import { CATEGORIES, ENDPOINTS } from "@/lib/apiref";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

const PLANS = [
  { name: "Free", price: "₹0", lines: ["200 requests a day", "Up to 2,000 simulations per request", "Graphics carry a watermark"] },
  { name: "Pro", price: "Contact us", lines: ["5,000 requests a day", "Up to 20,000 simulations per request", "Clean graphics"] },
  { name: "Business", price: "Contact us", lines: ["50,000 requests a day", "Up to 50,000 simulations per request", "Priority support"] },
];

const EXAMPLE = `curl -X POST ${API}/v1/simulate \\
  -H "X-API-Key: cs_live_…" -H "Content-Type: application/json" \\
  -d '{
    "format": "T20",
    "teams": [{"name": "Team A", "players": ["<11 player ids, batting order>"]},
              {"name": "Team B", "players": ["…"]}],
    "venue_id": "wankhede-stadium",
    "scenario": {"dew": 0.7, "boundary_mult": 1.1},
    "conditions": [{"type": "team_score", "team": 0, "at_least": 180}],
    "n": 10000
  }'`;

export default function Developers() {
  return (
    <div className="page-head">
      <p className="cs-eyebrow">CricSynthesis API</p>
      <h1><span>Cricket intelligence.</span><span>One API.</span></h1>
      <p className="cs-lede">{ENDPOINTS.length} endpoints for player and venue analytics, match simulation and decision modelling, and
        broadcast-ready graphics, for fantasy platforms, broadcasters, media and franchise analysts.</p>
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
              {eps.map((e) => (
                <a key={e.id} href={`/docs/#${e.id}`} style={{ display: "block", padding: "7px 0", borderTop: "1px solid var(--tick)", color: "inherit" }}>
                  <div className="small">{e.summary}</div>
                  <div className="mono muted" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{e.method} {e.path}</div>
                </a>
              ))}
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
