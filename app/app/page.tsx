"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WinBar } from "@/components/charts";
import { loadIndex } from "@/lib/data";
import { FORMAT, pct } from "@/lib/format";
import type { MatchCard } from "@/lib/types";

export default function Home() {
  const [matches, setMatches] = useState<MatchCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadIndex().then((i) => setMatches(i.matches.filter((m) => m.published))).catch((e) => setError(String(e)));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Cricket simulation</div>
        <h1>Every match, played 20,000 times before the first ball.</h1>
        <p className="lead">
          Win chances, likely scores, when wickets fall and who takes them, every player&apos;s chances: all from
          ball-by-ball simulation of the real XIs, built on two decades of Cricsheet data.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a className="btn" href="#matches">See upcoming matches</a>
          <Link className="btn ghost" href="/patterns/">What 6M balls say about cricket myths</Link>
        </div>
      </section>

      <section id="matches" style={{ paddingTop: 24 }}>
        <h2>Upcoming matches</h2>
        {error && <p className="notice">Couldn&apos;t load matches ({error}).</p>}
        {!matches && !error && <div className="grid g2"><div className="skeleton card" /><div className="skeleton card" /></div>}
        {matches && matches.length === 0 && <p className="notice">No matches published yet. Check back before the next fixture.</p>}
        <div className="grid g2">
          {matches?.map((m) => {
            const [a, b] = m.teams;
            const pa = m.win[a.name] ?? 0, pb = m.win[b.name] ?? 0;
            return (
              <Link key={m.id} href={`/match/?id=${encodeURIComponent(m.id)}`} className="card mcard">
                <div className="eyebrow">{[m.competition, FORMAT[m.format] ?? m.format, m.date].filter(Boolean).join(" · ")}</div>
                <div className="teams"><span>{a.name}</span><span className="muted">v</span><span style={{ textAlign: "right" }}>{b.name}</span></div>
                <WinBar a={a.name} b={b.name} pa={pa} pb={pb} />
                <div className="wins" style={{ marginTop: 6 }}>
                  <span style={{ color: "var(--team-a)" }}>{pct(pa)}</span>
                  <span className="muted small">projected {m.projected.map((x) => (x === null ? "—" : Math.round(x))).join(" v ")}</span>
                  <span style={{ color: "var(--team-b)" }}>{pct(pb)}</span>
                </div>
                {m.venue && <div className="small muted" style={{ marginTop: 8 }}>{m.venue}</div>}
              </Link>
            );
          })}
        </div>
      </section>

      <section style={{ paddingTop: 48 }}>
        <h2>How it works</h2>
        <div className="grid g3">
          <div className="card">
            <div className="eyebrow">1 · Ratings</div>
            <h3>Every ball, every league</h3>
            <p>Each player is rated from every ball they have faced or bowled, in internationals, IPL, domestic and A-team cricket alike, adjusted for how strong the opposition was. A debutant still gets a fair read.</p>
          </div>
          <div className="card">
            <div className="eyebrow">2 · Simulation</div>
            <h3>Ball by ball, 20,000 times</h3>
            <p>The match is played out delivery by delivery: real bowling plans, chase pressure, batters getting set, the jump in risk after a fifty. We only use effects that held up when tested on 6 million real balls.</p>
          </div>
          <div className="card">
            <div className="eyebrow">3 · Your scenarios <span className="tag pro">Pro</span></div>
            <h3>Change the match, watch it move</h3>
            <p>Flat pitch? Dew? A big name out of form? A collapse to 40/4? The Scenario Lab re-simulates in your browser and shows how every probability shifts.</p>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 48 }}>
        <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ maxWidth: 640 }}>
            <div className="eyebrow">For broadcasters, fantasy and media</div>
            <h3>The same engine, as an API</h3>
            <p style={{ marginBottom: 0 }}>One catalog: analytics, simulation and graphics. Player projections, matchups, full match simulations with your own scenarios, and share-ready cards.</p>
          </div>
          <Link className="btn" href="/developers/">Explore the API</Link>
        </div>
      </section>
    </>
  );
}
