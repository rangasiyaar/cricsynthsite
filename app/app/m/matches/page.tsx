"use client";
// App home: every published match with its status and a countdown to the start;
// finished matches show how the forecast and the fantasy picks did.
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Empty, Loading, OfflineBar, PullToRefresh, TEAM, Title, TopBar, WinPill, XiTag, pct0, useFresh, useNow } from "@/components/App";
import { loadIndex, loadResults, peekIndex, peekResults } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { ALL_ALERTS, alertChoice, hasAlerts, setAlerts } from "@/lib/native";
import { countdown, kickoffMs, startLabel, status, type Status } from "@/lib/schedule";
import type { MatchCard, ResultSummary } from "@/lib/types";

type Item = { kind: "forecast"; m: MatchCard; st: Status } | { kind: "result"; r: ResultSummary };
type Filter = Status;
const FILTERS: [Filter, string][] = [["upcoming", "Upcoming"], ["live", "Live"], ["finished", "Finished"]];

function StatusPill({ st }: { st: Status }) {
  if (st === "live") return <span className="a-status live"><span className="dot" />Live</span>;
  if (st === "finished") return <span className="a-status done">Finished</span>;
  return <span className="a-status up">Upcoming</span>;
}

function Forecast({ m, st, now }: { m: MatchCard; st: Status; now: number | null }) {
  const p = m.teams.map((t) => m.win[t.name] ?? 0);
  const left = st === "upcoming" && now !== null ? countdown(kickoffMs(m.date, m.start_time), now) : null;
  const team = (k: number) => {
    const t = m.teams[k];
    return (
      <div className="a-mteam">
        <Badge short={t.short} k={k} />
        <span className="a-mteam-name">{t.name}</span>
        <span className="a-mteam-pct" style={{ color: TEAM[k] }}>{pct0(p[k])}</span>
      </div>
    );
  };
  return (
    <article className="a-mcard">
      <Link href={`/m/match/?id=${encodeURIComponent(m.id)}`} className="a-mcard-main">
        <div className="a-mcard-head">
          <span className="a-mcard-comp">{m.competition ?? FORMAT[m.format] ?? m.format}</span>
          {st !== "finished" && <XiTag xis={m.xis} />}
        </div>
        <div className="a-mteams">
          {team(0)}
          <div className="a-mvs">{left ? <span className="a-countdown" aria-label={`Starts in ${left}`}>{left}</span> : <span className="a-vs">v</span>}</div>
          {team(1)}
        </div>
        <WinPill pa={p[0]} pb={p[1]} />
        <div className="a-mcard-where">
          <span className="a-mcard-ground">{m.venue ?? "Venue to be confirmed"}</span>
          <span className="a-mcard-when">{startLabel(m.date, m.start_time)}</span>
        </div>
        <div className="a-mcard-status"><StatusPill st={st} /></div>
      </Link>
    </article>
  );
}

function Result({ r }: { r: ResultSummary }) {
  return (
    <article className="a-mcard">
      <Link href={`/m/match/?id=${encodeURIComponent(r.id)}`} className="a-mcard-main">
        <div className="a-mcard-head">
          <span className="a-mcard-comp">{r.competition ?? ""}</span>
        </div>
        <div className="a-mteams">
          {r.teams.map((t, k) => {
            const sc = r.scores.find((x) => x.team === t.name);
            return (
              <div key={t.name} className="a-mteam">
                <Badge short={t.short ?? t.name.slice(0, 3).toUpperCase()} k={k} />
                <span className="a-mteam-name">{t.name}</span>
                <span className="a-mteam-pct" style={{ fontSize: 20, color: "var(--cs-ink)" }}>{sc ? `${sc.runs}/${sc.wickets}` : ""}</span>
              </div>
            );
          })}
        </div>
        {r.result && <div className="a-result-line">{r.result}</div>}
        <div className="a-mcard-where">
          <span className="a-mcard-ground">{r.favourite_won === true ? "Our favourite won" : r.favourite_won === false ? "An upset" : `${r.hits}/${r.checks} checks hit`}
            {r.fantasy ? ` · Fantasy ${pct0(r.fantasy.single)}` : ""}</span>
          <span className="a-mcard-when">{startLabel(r.date)}</span>
        </div>
        <div className="a-mcard-status"><StatusPill st="finished" /></div>
      </Link>
    </article>
  );
}

/** Asked once: turn on alerts for new forecasts and named XIs. */
function AlertsPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(hasAlerts() && alertChoice() === null); }, []);
  if (!show) return null;
  const answer = async (yes: boolean) => { await setAlerts(yes ? ALL_ALERTS : []); setShow(false); };
  return (
    <section className="a-prompt" aria-label="Match alerts">
      <h2>Get match alerts</h2>
      <p>Forecasts and playing XIs, as they land.</p>
      <div className="a-prompt-actions">
        <button type="button" className="a-btn" onClick={() => answer(true)}>Turn on</button>
        <button type="button" className="a-btn soft" onClick={() => answer(false)}>Not now</button>
      </div>
    </section>
  );
}

export default function MatchesPage() {
  return <Suspense fallback={<Loading rows={3} />}><Matches /></Suspense>;
}

function Matches() {
  const params = useSearchParams();
  const now = useNow(1000);
  const [picked, setPicked] = useState<Filter | null>(null);      // null: Live when a match is live, else Upcoming
  useEffect(() => {                                                  // ?f=finished (older links) opens on that filter
    const f = params.get("f") as Filter | null;
    if (f && FILTERS.some(([x]) => x === f)) setPicked(f);
  }, [params]);
  const ix = useFresh("index", peekIndex, loadIndex);
  const rs = useFresh("results", peekResults, loadResults);
  const cards = useMemo(() => ix.data?.matches.filter((m) => m.published) ?? null, [ix.data]);
  const results = useMemo<ResultSummary[]>(() => rs.data?.matches ?? [], [rs.data]);
  const error = ix.error;
  const load = () => { ix.refresh(); rs.refresh(); };

  const items = useMemo<Item[]>(() => {
    if (!cards) return [];
    const t = now ?? Date.now();
    const done = new Set(results.map((r) => r.id));
    const order: Record<Status, number> = { live: 0, upcoming: 1, finished: 2 };
    const fc = cards.filter((m) => !done.has(m.id)).map((m) => ({ kind: "forecast" as const, m, st: status(m, t) }))
      .sort((x, y) => order[x.st] - order[y.st] || (kickoffMs(x.m.date, x.m.start_time) ?? 0) - (kickoffMs(y.m.date, y.m.start_time) ?? 0));
    const rs = [...results].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")).slice(0, 12).map((r) => ({ kind: "result" as const, r }));
    return [...fc, ...rs];
  }, [cards, results, now]);

  const count = (f: Filter) => items.filter((it) => (it.kind === "result" ? f === "finished" : it.st === f)).length;
  const filter: Filter = picked ?? (count("live") ? "live" : "upcoming");
  const setFilter = setPicked;
  const shown = items.filter((it) => (it.kind === "result" ? filter === "finished" : it.st === filter));

  return (
    <>
      <TopBar />
      <PullToRefresh onRefresh={load} refreshing={ix.refreshing && !!cards} />
      <Title>Matches</Title>
      <div className="a-chips" role="tablist" aria-label="Show matches">
        {FILTERS.map(([f, l]) => (
          <button key={f} type="button" className="a-chip" role="tab" aria-selected={filter === f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {l}{cards && <span className="n">{count(f)}</span>}
          </button>
        ))}
      </div>
      <OfflineBar show={ix.offline} onRetry={load} />
      <AlertsPrompt />
      {error && <Empty title="Couldn't load matches" action={<button type="button" className="a-pill" onClick={load}>Try again</button>}>Check your connection.</Empty>}
      {!cards && !error && <Loading />}
      {cards && (
        <div className="a-list">
          {shown.map((it) => it.kind === "forecast"
            ? <Forecast key={it.m.id} m={it.m} st={it.st} now={now} />
            : <Result key={`r-${it.r.id}`} r={it.r} />)}
          {!shown.length && (
            <Empty title={filter === "live" ? "Nothing live" : filter === "finished" ? "No results yet" : "No upcoming matches"}>
              {filter === "live" ? "No match is under way right now." : "New fixtures appear here once their forecast is ready."}
            </Empty>
          )}
        </div>
      )}
    </>
  );
}
