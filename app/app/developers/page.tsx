import Link from "next/link";
import RequestAccess from "@/components/RequestAccess";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

const GROUPS: { title: string; blurb: string; rows: [string, string][] }[] = [
  { title: "Analytics", blurb: "Ratings and per-ball probabilities straight from the model.", rows: [
    ["GET /v1/players?q=", "Search players and get their IDs"],
    ["GET /v1/players/{id}", "Cross-league, cross-format rating and playing style"],
    ["POST /v1/players/{id}/projection", "Runs and wickets distribution: typical match or against an XI"],
    ["GET /v1/matchups?batter=&bowler=", "Per-ball outcome odds for a batter against a bowler, compared with an average pairing"],
    ["GET /v1/patterns", "Pattern Lab: which cricket beliefs hold up"],
  ] },
  { title: "Simulation", blurb: "Full ball-by-ball simulations with your scenario and conditions.", rows: [
    ["POST /v1/simulate", "Any limited-overs match: XIs, venue, pitch, dew, form, match situation"],
    ["GET /v1/matches", "Upcoming matches we cover"],
    ["GET /v1/matches/{id}", "The full pre-computed match centre"],
    ["GET /v1/matches/{id}/pack", "Engine pack for client-side what-ifs"],
  ] },
  { title: "Graphics", blurb: "Share-ready SVG cards, light or dark.", rows: [
    ["GET /v1/graphics/matches/{id}/win.svg", "Win-probability card"],
    ["GET /v1/graphics/matches/{id}/scores.svg", "Score distribution card"],
    ["GET /v1/graphics/matches/{id}/wickets/{team}.svg", "Wicket-timing heatmap"],
    ["GET /v1/graphics/matches/{id}/players/{id}.svg", "Player probability card"],
  ] },
];

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
      <p className="cs-eyebrow">API</p>
      <h1><span>One catalog.</span><span>Three kinds of answer.</span></h1>
      <p className="cs-lede">
        The engine behind the match centre, for broadcasters, fantasy platforms, media and analysts. We sell projections
        and analytics built on simulation, not live scores or raw data.
      </p>
      <div className="grid g3" style={{ marginTop: 20 }}>
        {GROUPS.map((g) => (
          <div key={g.title} className="card">
            <h3>{g.title}</h3>
            <p className="small">{g.blurb}</p>
            {g.rows.map(([path, what]) => (
              <div key={path} style={{ padding: "8px 0", borderTop: "1px solid var(--tick)" }}>
                <div className="mono" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{path}</div>
                <div className="small muted">{what}</div>
              </div>
            ))}
          </div>
        ))}
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
        Every endpoint and field: <Link href="/docs/">API reference</Link>. Try simulations now in the <Link href="/playground/">playground</Link>.
      </p>
      <RequestAccess />
      <div style={{ paddingBottom: 40 }} />
    </div>
  );
}
