"use client";
// Match cards shared by the home page and /matches/: upcoming and live fixtures (from index.json) and results
// (from results/index.json), each with a status tag. `useNow` ticks so a match moves to Live at its start time.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Pct, WinBar } from "@/components/charts";
import { FORMAT } from "@/lib/format";
import { useCountdown } from "@/lib/motion";
import type { MatchCard, ResultSummary } from "@/lib/types";

export type Status = "upcoming" | "live" | "result";

// Fixture start times are IST.
export const kickoff = (m: { date?: string; start_time?: string }) =>
  m.date ? Date.parse(`${m.date}T${m.start_time ?? "23:59"}:00+05:30`) : Infinity;

/** The current time, updated every 30 seconds. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const LABEL: Record<Status, string> = { upcoming: "Upcoming", live: "Live", result: "Result" };

export function StatusTag({ s }: { s: Status }) {
  return <span className={`tag status-${s}`}>{s === "live" && <span className="cs-live-dot" />}{LABEL[s]}</span>;
}

function When({ date, time }: { date?: string; time?: string }) {
  const left = useCountdown(date, time);
  return <span className="when">{left ? <>in {left}</> : date}</span>;
}

export function FixtureCard({ m, status, i = 0 }: { m: MatchCard; status: Status; i?: number }) {
  const [a, b] = m.teams;
  const pa = m.win[a.name] ?? 0, pb = m.win[b.name] ?? 0;
  return (
    <Link href={`/match/?id=${encodeURIComponent(m.id)}`} className="card fixture anim-rise" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="fixture-top"><StatusTag s={status} />{status === "upcoming" ? <When date={m.date} time={m.start_time} /> : <span>{m.start_time ? `${m.start_time} IST` : m.date}</span>}</div>
      <p className="fixture-comp">{m.competition ?? FORMAT[m.format]}</p>
      <div className="fixture-teams">
        <span><b>{a.short}</b><Pct p={pa} /></span>
        <span><Pct p={pb} /><b>{b.short}</b></span>
      </div>
      <WinBar a={a.name} b={b.name} pa={pa} pb={pb} />
      <div className="fixture-foot"><span>{a.name}</span><span className="mono">{m.projected.map((x) => (x === null ? "—" : Math.round(x))).join(" – ")}</span><span>{b.name}</span></div>
    </Link>
  );
}

const fmtDate = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export function ResultCard({ r, i = 0 }: { r: ResultSummary; i?: number }) {
  const score = (team: string) => r.scores.find((s) => s.team === team);
  return (
    <Link href={`/results/?id=${encodeURIComponent(r.id)}`} className="card fixture anim-rise" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="fixture-top"><StatusTag s="result" /><span>{fmtDate(r.date)}</span></div>
      <p className="fixture-comp">{r.competition}</p>
      <div className="result-teams">
        {r.teams.map((t) => {
          const s = score(t.name);
          return <div key={t.name} className={r.winner === t.name ? "won" : ""}><b>{t.short ?? t.name}</b>
            <span className="mono">{s ? `${s.runs}/${s.wickets} (${s.overs})` : "—"}</span></div>;
        })}
      </div>
      <div className="fixture-foot"><span>{r.result ?? r.note ?? ""}</span>
        {r.accuracy !== null && <span className="mono">{Math.round(100 * r.accuracy)}% called</span>}</div>
    </Link>
  );
}
