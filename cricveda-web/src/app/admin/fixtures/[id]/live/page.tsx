"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { userFetch } from "@/lib/platform";
import { Button, Notice, PageHeader, card } from "../../../ui";
import type { Fixture } from "../../../types";

interface Snapshot {
  innings: 1 | 2;
  batting: "home" | "away";
  runs: number;
  wickets: number;
  legal_balls: number;
  first_innings_total: number | null;
  win_prob_home: number;
  proj_p10: number;
  proj_p50: number;
  proj_p90: number;
}

interface State {
  innings: 1 | 2;
  batting: "home" | "away";
  runs: number;
  wickets: number;
  balls: number;
  firstTotal: number | null;
}

const START: State = { innings: 1, batting: "home", runs: 0, wickets: 0, balls: 0, firstTotal: null };
const overs = (b: number) => `${Math.floor(b / 6)}${b % 6 ? `.${b % 6}` : ""}`;

export default function LiveScoring() {
  const { id } = useParams<{ id: string }>();
  const [fx, setFx] = useState<Fixture | null>(null);
  const [state, setState] = useState<State>(START);
  const [history, setHistory] = useState<State[]>([]);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxBalls = (fx?.format === "ODI" ? 50 : 20) * 6;

  // Resume from the last public snapshot, if scoring already started.
  const load = useCallback(async () => {
    try {
      const f = await userFetch<Fixture>(`/v1/admin/fixtures/${id}`);
      setFx(f);
      const snaps = await userFetch<Snapshot[]>(`/v1/admin/fixtures/${id}/live`);
      const last = snaps[snaps.length - 1];
      if (last) {
        setLatest(last);
        setState({ innings: last.innings, batting: last.batting, runs: last.runs, wickets: last.wickets,
          balls: last.legal_balls, firstTotal: last.first_innings_total });
      } else if (f.toss_winner && f.toss_decision) {
        const tossHome = f.toss_winner === f.team1;
        const homeBats = f.toss_decision === "bat" ? tossHome : !tossHome;
        setState({ ...START, batting: homeBats ? "home" : "away" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function send(next: State, remember = true) {
    setBusy(true); setError(null);
    try {
      const snap = await userFetch<Snapshot>(`/v1/admin/fixtures/${id}/live`, {
        method: "POST",
        body: JSON.stringify({ innings: next.innings, batting: next.batting, runs: next.runs, wickets: next.wickets,
          overs: overs(next.balls), first_innings_total: next.firstTotal }),
      });
      if (remember) setHistory(h => [...h, state]);
      setState(next);
      setLatest(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record");
    } finally { setBusy(false); }
  }

  const inningsOver = state.wickets >= 10 || state.balls >= maxBalls ||
    (state.innings === 2 && state.firstTotal !== null && state.runs > state.firstTotal);

  function ball(runs: number, opts: { legal?: boolean; wicket?: boolean } = {}) {
    const legal = opts.legal ?? true;
    send({ ...state, runs: state.runs + runs, wickets: state.wickets + (opts.wicket ? 1 : 0),
      balls: state.balls + (legal ? 1 : 0) });
  }

  function endInnings() {
    if (!confirm(`End the 1st innings at ${state.runs}/${state.wickets}?`)) return;
    send({ innings: 2, batting: state.batting === "home" ? "away" : "home", runs: 0, wickets: 0, balls: 0,
      firstTotal: state.runs });
  }

  // Re-sends the previous state; a later ball's snapshot is overwritten when that ball is scored again.
  async function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    await send(prev, false);
    setHistory(h => h.slice(0, -1));
  }

  async function reset() {
    if (!confirm("Delete all live scoring for this match?")) return;
    await userFetch(`/v1/admin/fixtures/${id}/live`, { method: "DELETE" });
    setHistory([]); setLatest(null); setState(START); load();
  }

  if (!fx) return <div className="p-8">{error ? <Notice kind="error">{error}</Notice> : <p style={{ color: "#6b7280" }}>Loading…</p>}</div>;

  const batting = state.batting === "home" ? fx.team1 : fx.team2;
  const homeWin = latest ? Math.round(latest.win_prob_home * 100) : null;
  const btn = (label: string, onClick: () => void, tone: "run" | "boundary" | "wicket" | "extra" = "run") => (
    <button key={label} type="button" disabled={busy || inningsOver} onClick={onClick}
      className="h-16 rounded-lg text-xl font-bold disabled:opacity-40"
      style={{
        background: tone === "wicket" ? "rgba(239,68,68,0.15)" : tone === "boundary" ? "rgba(89,128,166,0.3)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${tone === "wicket" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"}`,
        color: tone === "wicket" ? "#fca5a5" : "#f0f0f5",
      }}>{label}</button>
  );

  return (
    <div className="p-8 max-w-3xl">
      <Link href={`/admin/fixtures/${id}`} className="text-sm" style={{ color: "#818cf8" }}>← Fixture & squads</Link>
      <PageHeader title={`Live scoring · ${fx.team1} v ${fx.team2}`}
        sub="Public live data for GraphSynth. Customers with their own feed see theirs instead.">
        <Button variant="danger" onClick={reset} disabled={busy}>Reset</Button>
      </PageHeader>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="p-6 mb-4 flex flex-wrap items-end justify-between gap-6" style={card}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "#9ca3b0" }}>
            Innings {state.innings} · {batting} batting{state.firstTotal !== null ? ` · target ${state.firstTotal + 1}` : ""}
          </p>
          <p className="text-5xl font-bold text-white mt-1">{state.runs}/{state.wickets}</p>
          <p className="text-sm mt-1" style={{ color: "#9ca3b0" }}>{overs(state.balls)} overs</p>
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide" style={{ color: "#9ca3b0" }}>Win probability</p>
            <p className="text-2xl font-bold text-white">{fx.team1} {homeWin}% · {fx.team2} {100 - (homeWin ?? 0)}%</p>
            <p className="text-sm" style={{ color: "#9ca3b0" }}>Projected {latest.proj_p50} ({latest.proj_p10}–{latest.proj_p90})</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        {btn("0", () => ball(0))}{btn("1", () => ball(1))}{btn("2", () => ball(2))}{btn("3", () => ball(3))}
        {btn("4", () => ball(4), "boundary")}{btn("6", () => ball(6), "boundary")}
        {btn("W", () => ball(0, { wicket: true }), "wicket")}
        {btn("Wd / Nb", () => ball(1, { legal: false }), "extra")}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={undo} disabled={busy || history.length === 0}>Undo last</Button>
        {state.innings === 1 && <Button variant="ghost" onClick={endInnings} disabled={busy}>End 1st innings</Button>}
      </div>
      {inningsOver && (
        <p className="mt-4 text-sm" style={{ color: "#f59e0b" }}>
          {state.innings === 1 ? "Innings complete — press “End 1st innings” to start the chase." : "Match complete."}
        </p>
      )}
      <p className="mt-6 text-xs" style={{ color: "#6b7280" }}>
        Run-outs and byes: score the runs, then tap W for a run-out. Each tap re-simulates the rest of the match
        (about a second), so wait for the numbers to update before the next ball.
      </p>
    </div>
  );
}
