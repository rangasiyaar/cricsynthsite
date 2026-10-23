"use client";
// App home: every published match with its status, a countdown to the start and a way into MatchSynth Lab;
// finished matches show how the forecast and the fantasy picks did.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountButton, AppBar, useNow } from "@/components/App";
import { Pct, WinBar } from "@/components/charts";
import { loadIndex, loadResults } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { countdown, kickoffMs, startLabel, status, type Status } from "@/lib/schedule";
import type { MatchCard, ResultSummary } from "@/lib/types";

type Item = { kind: "forecast"; m: MatchCard; st: Status } | { kind: "result"; r: ResultSummary };
type Filter = "all" | Status;
const FILTERS: [Filter, string][] = [["all", "All"], ["upcoming", "Upcoming"], ["live", "Live"], ["finished", "Finished"]];

const pctText = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);

function Forecast({ m, st, now }: { m: MatchCard; st: Status; now: number | null }) {
  const [a, b] = m.teams;
  const pa = m.win[a.name] ?? 0, pb = m.win[b.name] ?? 0;
  const left = now === null ? null : countdown(kickoffMs(m.date, m.start_time), now);
  const id = encodeURIComponent(m.id);
  return (
    <article className="card app-match anim-rise">
      <Link href={`/m/match/?id=${id}`} className="fixture">
        <div className="fixture-top">
          <span className="app-match-tagline">
            {st === "upcoming" && <span className="tag app-tag-up">Upcoming</span>}
            {st === "live" && <span className="tag"><span className="cs-live-dot" />Live</span>}
            {st === "finished" && <span className="tag app-tag-done">Finished</span>}
            {m.competition ?? FORMAT[m.format] ?? m.format}
          </span>
          {st === "upcoming" && left && <span className="app-countdown mono" aria-label={`Starts in ${left}`}>{left}</span>}
          {st === "live" && <span>Forecast frozen at the start</span>}
        </div>
        <div className="fixture-teams">
          <span><b>{a.short}</b><Pct p={pa} /></span>
          <span><Pct p={pb} /><b>{b.short}</b></span>
        </div>
        <WinBar a={a.name} b={b.name} pa={pa} pb={pb} />
        <div className="fixture-foot"><span>{m.venue ?? a.name + " v " + b.name}</span><span>{startLabel(m.date, m.start_time)}</span></div>
        {m.headline && <p className="app-match-note">{m.headline}</p>}
      </Link>
      <div className="app-match-act">
        <Link href={`/m/lab/?id=${id}`}>Open in MatchSynth Lab →</Link>
        <span className="tag pro">Pro</span>
      </div>
    </article>
  );
}

function Result({ r }: { r: ResultSummary }) {
  const short = r.teams.map((t) => t.short ?? t.name).join(" v ");
  return (
    <article className="card app-match anim-rise">
      <Link href={`/m/match/?id=${encodeURIComponent(r.id)}`} className="fixture">
        <div className="fixture-top">
          <span className="app-match-tagline"><span className="tag app-tag-done">Finished</span>{r.competition ?? ""}</span>
          <span>{startLabel(r.date)}</span>
        </div>
        <div className="app-result-teams">{short}</div>
        {r.result && <div className="app-result-line">{r.result}</div>}
        <div className="fixture-foot">
          <span>{r.favourite_won === true ? "Favourite won" : r.favourite_won === false ? "Upset" : `${r.hits}/${r.checks} checks hit`}</span>
          {r.fantasy && <span>Fantasy {pctText(r.fantasy.single)} · best of 5 {pctText(r.fantasy.best_of_teams)}</span>}
        </div>
      </Link>
    </article>
  );
}

export default function Matches() {
  const now = useNow(1000);
  const [cards, setCards] = useState<MatchCard[] | null>(null);
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = () => {
    setError(false);
    loadIndex().then((ix) => setCards(ix.matches.filter((m) => m.published))).catch(() => setError(true));
    loadResults().then((rs) => setResults(rs.matches)).catch(() => {});
  };
  useEffect(load, []);

  const items = useMemo<Item[]>(() => {
    if (!cards) return [];
    const t = now ?? Date.now();
    const done = new Set(results.map((r) => r.id));
    const fc: Item[] = cards.filter((m) => !done.has(m.id)).map((m) => ({ kind: "forecast", m, st: status(m, t) }));
    const order: Record<Status, number> = { live: 0, upcoming: 1, finished: 2 };
    fc.sort((x, y) => x.kind === "forecast" && y.kind === "forecast"
      ? order[x.st] - order[y.st] || (kickoffMs(x.m.date, x.m.start_time) ?? 0) - (kickoffMs(y.m.date, y.m.start_time) ?? 0) : 0);
    const rs: Item[] = [...results].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")).slice(0, 12)
      .map((r) => ({ kind: "result", r }));
    return [...fc, ...rs];
  }, [cards, results, now]);

  const shown = items.filter((it) => filter === "all" || (it.kind === "result" ? filter === "finished" : it.st === filter));
  const count = (s: Status) => items.filter((it) => it.kind === "forecast" && it.st === s).length;

  return (
    <>
      <AppBar right={<AccountButton />} />
      <div className="app-head">
        <p className="eyebrow">Matches</p>
        <h1>Match centre</h1>
        <p className="muted small">
          {cards ? `${count("upcoming")} upcoming${count("live") ? ` · ${count("live")} live` : ""} · forecasts from 20,000 simulations of each match`
                 : "Forecasts from 20,000 simulations of each match"}
        </p>
        <div className="seg app-filters" role="tablist" aria-label="Show matches">
          {FILTERS.map(([f, l]) => <button key={f} type="button" role="tab" aria-pressed={filter === f} aria-selected={filter === f} onClick={() => setFilter(f)}>{l}</button>)}
        </div>
      </div>
      {error && <div className="notice">Couldn&apos;t load matches. Check your connection. <button type="button" className="linkbtn" onClick={load}>Try again</button></div>}
      {!cards && !error && <div className="app-list">{[0, 1, 2].map((i) => <div key={i} className="skeleton card" style={{ minHeight: 170 }} />)}</div>}
      {cards && (
        <div className="app-list">
          {shown.map((it) => it.kind === "forecast"
            ? <Forecast key={it.m.id} m={it.m} st={it.st} now={now} />
            : <Result key={`r-${it.r.id}`} r={it.r} />)}
          {!shown.length && <p className="notice">{filter === "live" ? "No match is under way right now." : filter === "finished" ? "No finished matches yet." : "No matches are published yet. New fixtures appear here once their forecast is ready."}</p>}
        </div>
      )}
    </>
  );
}
