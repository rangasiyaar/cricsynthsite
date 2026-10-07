"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WinBar } from "@/components/charts";
import { loadIndex } from "@/lib/data";
import { FORMAT, pct } from "@/lib/format";
import type { MatchCard } from "@/lib/types";

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
);
const Ticks = () => <><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></>;

function FeaturedPlate({ m }: { m: MatchCard }) {
  const [a, b] = m.teams;
  const pa = m.win[a.name] ?? 0, pb = m.win[b.name] ?? 0;
  const fav = pa >= pb ? a : b;
  return (
    <Link href={`/match/?id=${encodeURIComponent(m.id)}`} className="cs-frame" style={{ display: "block", color: "inherit", textDecoration: "none" }} aria-label={`Open ${a.name} v ${b.name}`}>
      <Ticks />
      <div className="cs-plate-bar">
        <span>Pre-match · {m.competition ?? FORMAT[m.format] ?? m.format}</span>
        <span className="cs-mono" style={{ letterSpacing: 0, textTransform: "none", fontWeight: 400, color: "var(--cs-ink-3)" }}>{m.date}</span>
        <span className="ok">20,000 sims</span>
      </div>
      <div className="cs-plate-player">
        <div className="cs-plate-head">
          <div>
            <div className="cs-k">{m.venue ?? "Upcoming"}</div>
            <div className="cs-plate-name">{a.short} v {b.short}</div>
          </div>
          <div className="cs-plate-stats">
            <div><div className="cs-k">{a.short}</div><div className="cs-v">{pct(pa)}</div></div>
            <div><div className="cs-k">{b.short}</div><div className="cs-v">{pct(pb)}</div></div>
            <div><div className="cs-k">Favourite</div><div className="cs-v cs-v--accent">{fav.short}</div></div>
          </div>
        </div>
        <div className="cs-range">
          <div className="cs-range-row cs-k"><span>Win chance</span><span className="cs-mono" style={{ letterSpacing: 0 }}>{a.short} {pct(pa)} · {b.short} {pct(pb)}</span></div>
          <WinBar a={a.name} b={b.name} pa={pa} pb={pb} big />
        </div>
      </div>
      <div className="cs-plate-chart">
        <div className="cs-range-row cs-k"><span>Projected first-innings score</span><span style={{ color: "var(--cs-steel-700)", fontWeight: 600 }}>median</span></div>
        <div className="wins" style={{ fontSize: 40 }}>
          <span>{m.projected[0] === null ? "—" : Math.round(m.projected[0]!)}<span className="cs-k" style={{ marginLeft: 8 }}>{a.short}</span></span>
          <span><span className="cs-k" style={{ marginRight: 8 }}>{b.short}</span>{m.projected[1] === null ? "—" : Math.round(m.projected[1]!)}</span>
        </div>
        {m.headline && <p className="small" style={{ margin: "12px 0 0" }}>{m.headline}</p>}
      </div>
    </Link>
  );
}

export default function Home() {
  const [matches, setMatches] = useState<MatchCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadIndex().then((i) => setMatches(i.matches.filter((m) => m.published))).catch((e) => setError(String(e)));
  }, []);
  const featured = matches?.[0];

  return (
    <>
      <section className="cs-hero" style={{ paddingTop: "clamp(56px, 9vw, 112px)" }}>
        <div>
          <h1><span>Every match.</span><span>Simulated first.</span></h1>
          <p className="cs-lede">Win chances, likely scores, when wickets fall and who takes them, every player&apos;s chances: from 20,000 ball-by-ball simulations of the real XIs, before the first ball is bowled.</p>
          <div className="cs-hero-ctas">
            <a className="cs-btn cs-btn--primary" href="#matches">Upcoming matches <Arrow /></a>
            <Link className="cs-btn cs-btn--secondary" href="/patterns/">Cricket myths, tested</Link>
          </div>
        </div>
        {featured ? <FeaturedPlate m={featured} /> : <div className="skeleton" style={{ minHeight: 380 }} />}
      </section>

      <section className="cs-metrics" aria-label="What's behind it">
        <div className="cs-metric"><p className="cs-eyebrow">01 · Simulations</p><span className="metric-value">20,000</span><p>Full matches per fixture</p></div>
        <div className="cs-metric"><p className="cs-eyebrow">02 · History</p><span className="metric-value">6M+</span><p>Limited-overs balls modelled</p></div>
        <div className="cs-metric"><p className="cs-eyebrow">03 · Players</p><span className="metric-value">13,000</span><p>Rated across every league</p></div>
        <div className="cs-metric"><p className="cs-eyebrow">04 · Formats</p><span className="metric-value">4</span><p>T20, T10, The Hundred, 50-over</p></div>
      </section>

      <section id="matches" className="cs-section">
        <div className="cs-section-head">
          <div>
            <p className="cs-eyebrow">Match centre</p>
            <h2 className="cs-h2">Upcoming<br />matches.</h2>
          </div>
          <p className="cs-lede">Every covered fixture is simulated ball by ball with both XIs. Open one for scores, wicket timing, player chances and your own scenarios.</p>
        </div>
        {error && <p className="notice">Couldn&apos;t load matches right now.</p>}
        {!matches && !error && <div className="grid g2"><div className="skeleton" /><div className="skeleton" /></div>}
        {matches && matches.length === 0 && <p className="notice">No matches published yet. Check back before the next fixture.</p>}
        <div className="grid g2">
          {matches?.map((m) => {
            const [a, b] = m.teams;
            const pa = m.win[a.name] ?? 0, pb = m.win[b.name] ?? 0;
            return (
              <Link key={m.id} href={`/match/?id=${encodeURIComponent(m.id)}`} className="card mcard">
                <div className="plate-bar"><span>{[m.competition, FORMAT[m.format] ?? m.format].filter(Boolean).join(" · ")}</span><span className="ok">{m.date}</span></div>
                <div className="teams"><span>{a.name}</span><span className="v">v</span><span style={{ textAlign: "right" }}>{b.name}</span></div>
                <WinBar a={a.name} b={b.name} pa={pa} pb={pb} />
                <div className="wins" style={{ marginTop: 10, fontSize: 24 }}>
                  <span style={{ color: "var(--team-a)" }}>{pct(pa)}</span>
                  <span className="cs-k" style={{ fontFamily: "var(--cs-body)" }}>projected {m.projected.map((x) => (x === null ? "—" : Math.round(x))).join(" v ")}</span>
                  <span style={{ color: "var(--team-b)" }}>{pct(pb)}</span>
                </div>
                {m.venue && <div className="cs-k" style={{ marginTop: 10 }}>{m.venue}</div>}
              </Link>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="cs-section">
        <div className="cs-section-head">
          <div>
            <p className="cs-eyebrow">How it works</p>
            <h2 className="cs-h2">Rated. Simulated.<br />Yours to change.</h2>
          </div>
          <p className="cs-lede">No guesswork and no folklore: only effects that held up when tested on millions of real deliveries go into the simulation.</p>
        </div>
        <ol className="cs-steps">
          <li><div className="cs-step-n">01</div><h3>Every ball, every league</h3><p>Each player is rated from every ball they have faced or bowled, in internationals, franchise, domestic and A-team cricket, adjusted for the strength of the opposition. A debutant still gets a fair read.</p></li>
          <li><div className="cs-step-n">02</div><h3>Ball by ball, 20,000 times</h3><p>The match is played out delivery by delivery: real bowling plans, chase pressure, batters getting set, the jump in risk just after a fifty, pitch and weather variation.</p></li>
          <li><div className="cs-step-n">03</div><h3>Your scenarios <span className="tag pro" style={{ verticalAlign: "middle" }}>Pro</span></h3><p>Flat pitch? Dew? A star out of form? 40 for 4 after eight overs? The Scenario Lab re-runs the match in your browser and shows how every probability moves.</p></li>
        </ol>
      </section>

      <section className="cs-section" style={{ paddingBottom: "clamp(72px, 10vw, 128px)" }}>
        <div className="cs-api">
          <div className="cs-api-head">
            <div>
              <p className="cs-eyebrow">For broadcasters, fantasy and media</p>
              <h2 className="cs-h2">The same engine.<br />As an API.</h2>
            </div>
          </div>
          <div className="cs-api-panels">
            <div className="cs-api-panel">
              <div className="cs-api-panel-head"><span>Request</span><span>POST /v1/simulate</span></div>
              <pre className="req">{`{
  "format": "T20",
  "teams": [{ "name": "India", "players": [...] },
            { "name": "Australia", "players": [...] }],
  "scenario": { "dew": 0.7, "boundary_mult": 1.1 },
  "n": 10000
}`}</pre>
            </div>
            <div className="cs-api-panel">
              <div className="cs-api-panel-head"><span>Response</span><span className="cs-mono" style={{ letterSpacing: 0, textTransform: "none" }}>200 OK · illustrative</span></div>
              <pre>{`{
  "result": { "win": { "India": 0.56, "Australia": 0.44 } },
  "teams": [{ "batting": { "score": { "q": { "10": 109, "50": 163, "90": 218 } },
              "fall_of_wickets": [{ "wicket": 1, "over": { "q": { "50": 3 } } }] } }],
  "matchups": [{ "bowler": "...", "batter": "...", "p": 0.22 }]
}`}</pre>
            </div>
          </div>
          <div className="cs-api-ctas">
            <Link className="cs-btn cs-btn--light" href="/developers/">Explore the API</Link>
            <Link className="cs-btn cs-btn--ghost-light" href="/developers/#plans">See plans</Link>
          </div>
        </div>
      </section>
    </>
  );
}
