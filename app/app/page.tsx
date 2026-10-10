"use client";
import Link from "next/link";
import RequestAccess from "@/components/RequestAccess";
import Scoreboard from "@/components/Scoreboard";
import { useEffect, useState } from "react";
import { Num, Pct, WinBar } from "@/components/charts";
import { Spotlight } from "@/components/MatchCentre";
import { Tiles } from "@/components/Tiles";
import { loadIndex, loadMatch, loadPatterns } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { useCountdown } from "@/lib/motion";
import type { MatchCard, MatchDoc, PatternReport } from "@/lib/types";

function When({ date, time }: { date?: string; time?: string }) {
  const left = useCountdown(date, time);
  return <span className="when">{left ? <><span className="cs-live-dot" />in {left}</> : date}</span>;
}

function Fixture({ m, i }: { m: MatchCard; i: number }) {
  const [a, b] = m.teams;
  const pa = m.win[a.name] ?? 0, pb = m.win[b.name] ?? 0;
  return (
    <Link href={`/match/?id=${encodeURIComponent(m.id)}`} className="card fixture anim-rise" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="fixture-top"><span>{m.competition ?? FORMAT[m.format]}</span><When date={m.date} time={m.start_time} /></div>
      <div className="fixture-teams">
        <span><b>{a.short}</b><Pct p={pa} /></span>
        <span><Pct p={pb} /><b>{b.short}</b></span>
      </div>
      <WinBar a={a.name} b={b.name} pa={pa} pb={pb} />
      <div className="fixture-foot"><span>{a.name}</span><span className="mono">{m.projected.map((x) => (x === null ? "—" : Math.round(x))).join(" – ")}</span><span>{b.name}</span></div>
    </Link>
  );
}

function Featured({ doc }: { doc: MatchDoc }) {
  const { match, summary: s } = doc;
  const [a] = s.teams.map((t) => t.name);
  const short = match.teams.map((t) => t.short) as [string, string];
  const ci = s.result.win_ci95?.[a];
  const href = `/match/?id=${encodeURIComponent(match.id)}`;
  return (
    <section className="featured">
      <Scoreboard doc={doc} mid={<When date={match.date} time={match.start_time} />} foot={<>
        <Link className="cs-btn cs-btn--primary" href={href}>Open match centre</Link>
        <Link className="cs-btn cs-btn--secondary" href={`${href}&tab=lab`}>Try a scenario</Link>
        <span className="sb-note">From <Num value={s.meta.simulations} /> simulated matches{ci ? <>, accurate to ±{(100 * ci).toFixed(1)} points</> : null}.</span>
      </>} />
      <Tiles s={s} short={short} />
    </section>
  );
}

const TEASE = ["after_six_batter", "steep_chase", "new_batter_first5", "after_fifty", "wickets_in_pairs"];
const VERDICT: Record<string, string> = { real: "v-real", myth: "v-myth", reversed: "v-reversed" };

function PatternTeaser({ rep }: { rep: PatternReport }) {
  // prefer clear verdicts (myth / real / reversed) — they make the point
  const ranked = TEASE.map((id) => rep.patterns.find((p) => p.id === id)).filter((p) => p && p.full?.rr != null);
  const picks = [...ranked.filter((p) => p!.verdict in VERDICT), ...ranked.filter((p) => !(p!.verdict in VERDICT))].slice(0, 3);
  if (!picks.length) return null;
  return (
    <section className="cs-section" style={{ paddingTop: 72 }}>
      <div className="section-head"><div><h2>Pattern Lab</h2><p>Common cricket beliefs, tested against ball-by-ball data.</p></div>
        <Link href="/patterns/" className="row-link">See all {rep.patterns.length}</Link></div>
      <div className="grid g3">
        {picks.map((p, i) => (
          <Link key={p!.id} href="/patterns/" className="card myth anim-rise" style={{ animationDelay: `${i * 80}ms` }}>
            <span className={`verdict ${VERDICT[p!.verdict] ?? ""}`}>{p!.verdict}</span>
            <div className="myth-title">{p!.title}</div>
            <div className="myth-rr"><Num value={p!.full!.rr} digits={2} />×</div>
            <div className="cs-k">wicket rate v comparable balls</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [matches, setMatches] = useState<MatchCard[] | null>(null);
  const [featured, setFeatured] = useState<MatchDoc | null>(null);
  const [patterns, setPatterns] = useState<PatternReport | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadIndex().then((i) => {
      const ms = i.matches.filter((m) => m.published);
      setMatches(ms);
      if (ms[0]) loadMatch(ms[0].id).then(setFeatured).catch(() => {});
    }).catch(() => setError(true));
    loadPatterns().then(setPatterns).catch(() => {});
  }, []);

  return (
    <>
      <section id="next" style={{ paddingTop: "clamp(32px, 5vw, 56px)" }}>
        <div className="section-head"><div><h2>Next match</h2><p>Forecast from ball-by-ball simulation of the likely playing XIs.</p></div>
          {matches && matches.length > 1 && <a href="#matches" className="row-link">All upcoming matches</a>}</div>
        {error && <p className="notice">Couldn&apos;t load matches right now.</p>}
        {!featured && !error && matches?.length !== 0 && <div className="skeleton" style={{ minHeight: 320 }} />}
        {matches && matches.length === 0 && <p className="notice">No upcoming matches are published yet.</p>}
        {featured && <><Featured doc={featured} /><Spotlight doc={featured} /></>}
      </section>

      {matches && matches.length > 1 && (
        <section id="matches" style={{ paddingTop: 72, scrollMarginTop: 80 }}>
          <div className="section-head"><h2>Upcoming matches</h2></div>
          <div className="fixtures">{matches.map((m, i) => <Fixture key={m.id} m={m} i={i} />)}</div>
        </section>
      )}

      {patterns && <PatternTeaser rep={patterns} />}


      <RequestAccess />
      <div style={{ height: "clamp(40px, 6vw, 72px)" }} />
    </>
  );
}
