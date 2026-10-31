"use client";
import Link from "next/link";
import RequestAccess from "@/components/RequestAccess";
import Scoreboard from "@/components/Scoreboard";
import { useEffect, useState } from "react";
import { Spotlight } from "@/components/MatchCentre";
import { Tiles } from "@/components/Tiles";
import { loadIndex, loadMatch } from "@/lib/data";
import { useCountdown } from "@/lib/motion";
import { FixtureCard, kickoff, useNow } from "@/components/MatchCards";
import type { MatchCard, MatchDoc } from "@/lib/types";

function Countdown({ date, time }: { date?: string; time?: string }) {
  const left = useCountdown(date, time);
  return <span className="when">{left ? <><span className="cs-live-dot" />in {left}</> : date}</span>;
}

function Featured({ doc }: { doc: MatchDoc }) {
  const { match, summary: s } = doc;
  const [a] = s.teams.map((t) => t.name);
  const short = match.teams.map((t) => t.short) as [string, string];
  const ci = s.result.win_ci95?.[a];
  const href = `/match/?id=${encodeURIComponent(match.id)}`;
  return (
    <section className="featured">
      <Scoreboard doc={doc} mid={<Countdown date={match.date} time={match.start_time} />} foot={<>
        <Link className="cs-btn cs-btn--primary" href={href}>Open match centre</Link>
        <Link className="cs-btn cs-btn--secondary" href={`/lab/?id=${encodeURIComponent(match.id)}`}>Open in MatchSynth Lab</Link>
      </>} />
      <Tiles s={s} short={short} />
    </section>
  );
}


export default function Home() {
  const [matches, setMatches] = useState<MatchCard[] | null>(null);
  const [featured, setFeatured] = useState<MatchDoc | null>(null);
  const [error, setError] = useState(false);
  const now = useNow();
  useEffect(() => {
    loadIndex().then((i) => setMatches(i.matches.filter((m) => m.published))).catch(() => setError(true));
  }, []);
  // the next match yet to start is featured; when it starts, the one after takes its place
  const upcoming = (matches ?? []).filter((m) => kickoff(m) > now).sort((x, y) => kickoff(x) - kickoff(y));
  const nextId = upcoming[0]?.id;
  useEffect(() => {
    if (!nextId) { setFeatured(null); return; }
    loadMatch(nextId).then(setFeatured).catch(() => {});
  }, [nextId]);

  return (
    <>
      <section id="next" style={{ paddingTop: "clamp(32px, 5vw, 56px)" }}>
        <div className="section-head"><div><h2>Next match</h2></div>
          <Link href="/matches/" className="row-link">All matches</Link></div>
        {error && <p className="notice">Couldn&apos;t load matches right now.</p>}
        {!error && !matches && <div className="skeleton" style={{ minHeight: 320 }} />}
        {matches && !nextId && <p className="notice">No upcoming matches are published yet. See <Link href="/matches/">live matches and results</Link>.</p>}
        {nextId && featured?.match.id === nextId && <><Featured doc={featured} /><Spotlight doc={featured} /></>}
        {nextId && featured?.match.id !== nextId && <div className="skeleton" style={{ minHeight: 320 }} />}
      </section>

      {upcoming.length > 1 && (
        <section id="matches" style={{ paddingTop: 72, scrollMarginTop: 80 }}>
          <div className="section-head"><h2>Up next</h2><Link href="/matches/" className="row-link">All matches</Link></div>
          <div className="fixtures">{upcoming.slice(1, 4).map((m, i) => <FixtureCard key={m.id} m={m} status="upcoming" i={i} />)}</div>
        </section>
      )}

      <RequestAccess />
      <div style={{ height: "clamp(40px, 6vw, 72px)" }} />
    </>
  );
}
