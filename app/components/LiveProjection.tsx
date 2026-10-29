"use client";
// Live projection: while the match is on, the live job (cricsim/live.py) keeps Firestore live/{id} at the latest
// over or wicket, and the browser re-simulates the rest of the match from there with the published engine pack.
// We show what the projection is built from (score, overs, who is in), never a running score feed.
import { doc as fsDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { WinBar } from "@/components/charts";
import { loadPack } from "@/lib/data";
import type { Pack, Scenario } from "@/lib/engine/sim";
import type { RawBatch } from "@/lib/engine/worker";
import { db } from "@/lib/firebase";
import { pct } from "@/lib/format";
import { kickoffMs, status } from "@/lib/schedule";
import type { MatchDoc } from "@/lib/types";

const N = 3000;
const EARLY = 20 * 60_000;               // the live job starts 20 minutes before the start (toss)

type Live = {
  state: string; status?: string; innings?: 1 | 2; batting?: 0 | 1; battingFirst?: 0 | 1;
  runs?: number; wickets?: number; balls?: number; overs?: string; target?: number; firstInningsTotal?: number;
  striker?: string; nonStriker?: string; out?: string[]; updated?: number;
};
type Projection = { win: [number, number]; total: [number, number, number]; chasing?: [number, number, number] };

const quantiles = (xs: number[]): [number, number, number] => {
  const s = [...xs].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return [q(0.25), q(0.5), q(0.75)];
};

function scenario(l: Live): Scenario | null {
  if (!l.innings || l.batting === undefined || l.runs === undefined || l.balls === undefined) return null;
  const battingFirst = (l.innings === 1 ? l.batting : (l.battingFirst ?? 1 - l.batting)) as 0 | 1;
  return { battingFirst, ...(l.target ? { target: l.target } : {}),
           start: { innings: l.innings, runs: l.runs, wickets: l.wickets ?? 0, balls: l.balls,
                    firstInningsTotal: l.firstInningsTotal, striker: l.striker, nonStriker: l.nonStriker, out: l.out ?? [] } };
}

const watching = (d: MatchDoc, now: number) => {
  const k = kickoffMs(d.match.date, d.match.start_time);
  return k !== null && now >= k - EARLY && status(d.match, now) !== "finished";
};

export default function LiveProjection({ doc }: { doc: MatchDoc }) {
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<Live | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [proj, setProj] = useState<Projection | null>(null);
  const worker = useRef<Worker | null>(null);
  const on = watching(doc, now);
  const id = doc.match.id;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {                                     // read live/{id} only while the match can be on
    if (!on) return;
    return onSnapshot(fsDoc(db(), "live", id), (s) => setLive(s.exists() ? (s.data() as Live) : null), () => setLive(null));
  }, [on, id]);

  useEffect(() => {
    if (!live?.innings || pack) return;
    loadPack(id).then(setPack).catch(() => setPack(null));
  }, [live?.innings, pack, id]);

  useEffect(() => {
    const sc = live && scenario(live);
    if (!pack || !sc) return;
    const w = (worker.current ??= new Worker(new URL("../lib/engine/worker.ts", import.meta.url), { type: "module" }));
    w.onmessage = (e) => {
      if (e.data.error) return;
      const r = e.data.raw as RawBatch, bat = live!.batting!;
      setProj({ win: [r.wins[0] / r.n, r.wins[1] / r.n], total: quantiles(r.scores[bat]),
                ...(live!.innings === 1 ? { chasing: quantiles(r.scores[1 - bat]) } : {}) });
    };
    w.postMessage({ id: live!.updated ?? 0, pack, scenario: sc, n: N, seed: 7, raw: true });
  }, [pack, live]);

  useEffect(() => () => worker.current?.terminate(), []);

  if (!on || !live) return null;
  const names = doc.summary.teams.map((t) => t.name), short = doc.match.teams.map((t) => t.short ?? t.name);
  const finished = /complete|abandon|no result/i.test(live.state);
  const head = live.innings && live.batting !== undefined
    ? `${short[live.batting]} ${live.runs}/${live.wickets} (${live.overs} ov)` : live.status || live.state;
  const need = live.innings === 2 && live.target && live.runs !== undefined && live.balls !== undefined
    ? `needs ${Math.max(0, live.target - live.runs)} from ${Math.max(0, doc.summary.meta.rules.overs * doc.summary.meta.rules.bpo - live.balls)} balls`
    : null;
  const when = live.updated ? new Date(live.updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="card" aria-live="polite">
      <h3>Live projection <span className="tag">{finished ? "Final" : "Live"}</span></h3>
      <p className="small" style={{ margin: "0 0 10px" }}>
        <b>{head}</b>{need && <> · {need}</>}{when && <span className="muted"> · updated {when}</span>}
      </p>
      {proj && !finished ? (
        <>
          <WinBar a={names[0]} b={names[1]} pa={proj.win[0]} pb={proj.win[1]} big />
          <p className="small" style={{ margin: "8px 0 0" }}>
            {names[0]} <b>{pct(proj.win[0])}</b> · {names[1]} <b>{pct(proj.win[1])}</b>
          </p>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {names[live.batting!]} projected <b>{proj.total[1]}</b> <span className="muted">(likely {proj.total[0]}–{proj.total[2]})</span>
            {proj.chasing && <> · {names[1 - live.batting!]} reply <b>{proj.chasing[1]}</b> <span className="muted">(likely {proj.chasing[0]}–{proj.chasing[2]})</span></>}
          </p>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            {N.toLocaleString()} simulations of the rest of the match in your browser, from the state above.
          </p>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {finished ? "The match is over; the pre-match forecast is below." : "The projection starts with the first ball."}
        </p>
      )}
    </div>
  );
}
