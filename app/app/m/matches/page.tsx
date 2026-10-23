"use client";
// App home: every published match with its status, a countdown to the start and a way into MatchSynth Lab;
// finished matches show how the forecast and the fantasy picks did.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountButton, Badge, Empty, Icon, Loading, OfflineBar, PullToRefresh, TEAM, Title, TopBar, WinPill, pct0, useFresh, useNow } from "@/components/App";
import { loadIndex, loadResults, peekIndex, peekResults } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { alertChoice, hasAlerts, setAlerts } from "@/lib/native";
import { countdown, kickoffMs, startLabel, status, type Status } from "@/lib/schedule";
import type { MatchCard, ResultSummary } from "@/lib/types";

type Item = { kind: "forecast"; m: MatchCard; st: Status } | { kind: "result"; r: ResultSummary };
type Filter = "all" | Status;
const FILTERS: [Filter, string][] = [["all", "All"], ["upcoming", "Upcoming"], ["live", "Live"], ["finished", "Finished"]];

function StatusPill({ st }: { st: Status }) {
  if (st === "live") return <span className="a-status live"><span className="dot" />Live</span>;
  if (st === "finished") return <span className="a-status done">Finished</span>;
  return <span className="a-status up">Upcoming</span>;
}

function Forecast({ m, st, now }: { m: MatchCard; st: Status; now: number | null }) {
  const p = m.teams.map((t) => m.win[t.name] ?? 0);
  const left = now === null ? null : countdown(kickoffMs(m.date, m.start_time), now);
  const id = encodeURIComponent(m.id);
  return (
    <article className="a-mcard">
      <Link href={`/m/match/?id=${id}`} className="a-mcard-main">
        <div className="a-mcard-head">
          <StatusPill st={st} />
          <span className="a-mcard-comp">{m.competition ?? FORMAT[m.format] ?? m.format}</span>
          <span style={{ flex: 1 }} />
          {st === "upcoming" && left && <span className="a-countdown" aria-label={`Starts in ${left}`}>{left}</span>}
        </div>
        <div className="a-mteams">
          {m.teams.map((t, k) => (
            <div key={t.name} className="a-mteam">
              <Badge short={t.short} k={k} />
              <span className="a-mteam-name">{t.name}</span>
              <span className="a-mteam-pct" style={{ color: TEAM[k] }}>{pct0(p[k])}</span>
            </div>
          ))}
        </div>
        <WinPill pa={p[0]} pb={p[1]} />
        <div className="a-mcard-foot"><span>{m.venue ?? "Venue to be confirmed"}</span><span>{startLabel(m.date, m.start_time)}</span></div>
        {m.headline && <div className="a-mcard-note">{m.headline}</div>}
      </Link>
      <div className="a-mcard-act">
        <span className="a-row-sub">{st === "live" ? "Forecast locked at the start" : "Change the toss, pitch or form"}</span>
        <Link href={`/m/lab/?id=${id}`} className="a-pill">{Icon.lab}MatchSynth Lab</Link>
      </div>
    </article>
  );
}

function Result({ r }: { r: ResultSummary }) {
  return (
    <article className="a-mcard">
      <Link href={`/m/match/?id=${encodeURIComponent(r.id)}`} className="a-mcard-main">
        <div className="a-mcard-head">
          <StatusPill st="finished" />
          <span className="a-mcard-comp">{r.competition ?? ""}</span>
          <span style={{ flex: 1 }} />
          <span>{startLabel(r.date)}</span>
        </div>
        <div className="a-mteams" style={{ marginBottom: 4 }}>
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
        <div className="a-mcard-foot">
          <span>{r.favourite_won === true ? "Our favourite won" : r.favourite_won === false ? "An upset" : `${r.hits}/${r.checks} checks hit`}</span>
          {r.fantasy && <span>Fantasy {pct0(r.fantasy.single)} · best of 5 {pct0(r.fantasy.best_of_teams)}</span>}
        </div>
      </Link>
    </article>
  );
}

/** Asked once: turn on alerts for new forecasts and named XIs. */
function AlertsPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(hasAlerts() && alertChoice() === null); }, []);
  if (!show) return null;
  const answer = async (yes: boolean) => { await setAlerts(yes ? ["forecasts", "xis"] : []); setShow(false); };
  return (
    <section className="a-prompt" aria-label="Match alerts">
      <h2>Get match alerts</h2>
      <p>We&apos;ll tell you when a new forecast is out and when it&apos;s re-run with the playing XIs. Change it any time in Account.</p>
      <div className="a-prompt-actions">
        <button type="button" className="a-btn" onClick={() => answer(true)}>Turn on</button>
        <button type="button" className="a-btn soft" onClick={() => answer(false)}>Not now</button>
      </div>
    </section>
  );
}

export default function Matches() {
  const now = useNow(1000);
  const [filter, setFilter] = useState<Filter>("all");
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

  const count = (f: Filter) => f === "all" ? items.length
    : items.filter((it) => (it.kind === "result" ? f === "finished" : it.st === f)).length;
  const shown = items.filter((it) => filter === "all" || (it.kind === "result" ? filter === "finished" : it.st === filter));

  return (
    <>
      <TopBar title="Matches" right={<AccountButton />} />
      <PullToRefresh onRefresh={load} refreshing={ix.refreshing && !!cards} />
      <Title eyebrow="Match centre" sub="Every forecast comes from 20,000 simulations of the match.">Matches</Title>
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
            <Empty title={filter === "live" ? "Nothing live" : filter === "finished" ? "No results yet" : "No matches yet"}>
              {filter === "live" ? "No match is under way right now." : "New fixtures appear here once their forecast is ready."}
            </Empty>
          )}
        </div>
      )}
    </>
  );
}
