"use client";
// Matches: every match we forecast, by status. Upcoming and live come from index.json (a match moves to Live at its
// start time, without a reload); results from results/index.json.
import { useEffect, useState } from "react";
import { FixtureCard, ResultCard, StatusTag, kickoff, useNow, type Status } from "@/components/MatchCards";
import { loadIndex, loadResults } from "@/lib/data";
import type { MatchCard, ResultSummary } from "@/lib/types";

const FILTERS = ["all", "live", "upcoming", "result"] as const;
type Filter = (typeof FILTERS)[number];
const NAMES: Record<Filter, string> = { all: "All", live: "Live", upcoming: "Upcoming", result: "Results" };
const RESULTS_PAGE = 12;

export default function MatchesPage() {
  const [index, setIndex] = useState<MatchCard[] | null>(null);
  const [results, setResults] = useState<ResultSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(RESULTS_PAGE);
  const now = useNow();

  useEffect(() => {
    loadIndex().then((i) => setIndex(i.matches.filter((m) => m.published))).catch(() => setError(true));
    loadResults().then((r) => setResults(r.matches)).catch(() => setResults([]));
  }, []);

  const done = new Set((results ?? []).map((r) => r.id));
  const fixtures = (index ?? []).filter((m) => !done.has(m.id));
  const upcoming = fixtures.filter((m) => kickoff(m) > now).sort((a, b) => kickoff(a) - kickoff(b));
  const live = fixtures.filter((m) => kickoff(m) <= now).sort((a, b) => kickoff(b) - kickoff(a));
  const past = [...(results ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const count: Record<Filter, number> = { all: upcoming.length + live.length + past.length, live: live.length, upcoming: upcoming.length, result: past.length };
  const show = (s: Status) => filter === "all" || filter === s;

  const group = (s: Status, title: string, cards: React.ReactNode[], empty: string) => show(s) && (
    <section className="match-group">
      <div className="section-head"><h2>{title}</h2><StatusTag s={s} /></div>
      {cards.length ? <div className="fixtures">{cards}</div> : <p className="notice">{empty}</p>}
    </section>
  );

  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <p className="cs-eyebrow">Matches</p>
      <h1><span>Every match we forecast.</span><span>Upcoming, live and finished.</span></h1>
      <div className="tabs" role="tablist" aria-label="Filter matches">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
            {NAMES[f]} <span className="tab-count">{index ? count[f] : ""}</span>
          </button>
        ))}
      </div>
      {error && <p className="notice">Couldn&apos;t load matches right now.</p>}
      {!error && (!index || !results) && <div className="skeleton card" style={{ minHeight: 280 }} />}
      {index && results && <>
        {group("live", "Live", live.map((m, i) => <FixtureCard key={m.id} m={m} status="live" i={i} />),
          "No match is under way right now.")}
        {group("upcoming", "Upcoming", upcoming.map((m, i) => <FixtureCard key={m.id} m={m} status="upcoming" i={i} />),
          "No upcoming matches are published yet.")}
        {group("result", "Results", past.slice(0, shown).map((r, i) => <ResultCard key={r.id} r={r} i={i % RESULTS_PAGE} />),
          "No results yet.")}
        {show("result") && past.length > shown && (
          <p style={{ marginTop: 24 }}><button className="cs-btn cs-btn--secondary" onClick={() => setShown((n) => n + RESULTS_PAGE)}>
            <span>Show more results</span></button></p>
        )}
      </>}
    </div>
  );
}
