"use client";
// MatchSynth Lab: the user's levers re-run the match in the browser, and every match-centre view (overview, scores,
// wickets, players, match-ups) is rebuilt from those simulations alone.
import { useEffect, useMemo, useRef, useState } from "react";
import { Num, Pct, WinBar } from "@/components/charts";
import { ForecastTabs } from "@/components/MatchCentre";
import Scoreboard from "@/components/Scoreboard";
import { loadPack } from "@/lib/data";
import type { Pack, Scenario } from "@/lib/engine/sim";
import { num, signed } from "@/lib/format";
import type { MatchDoc, PlayerRow, Summary } from "@/lib/types";

const N = 5000;
const COLORS = ["var(--team-a)", "var(--team-b)"];

type Levers = {
  battingFirst: "" | "0" | "1"; boundary: number; wickets: number; spin: number; pace: number; dew: number;
  form: Record<string, number>; exclude: string[];
  useSituation: boolean; innings: 1 | 2; runs: number; wkts: number; overs: number; firstTotal: number;
};
const DEFAULT: Levers = { battingFirst: "", boundary: 1, wickets: 1, spin: 1, pace: 1, dew: 0, form: {}, exclude: [],
                          useSituation: false, innings: 1, runs: 50, wkts: 2, overs: 8, firstTotal: 170 };

function toScenario(l: Levers, pack: Pack): Scenario {
  const sc: Scenario = { boundaryMult: l.boundary, wicketMult: l.wickets, spinWicketMult: l.spin, paceWicketMult: l.pace,
                         dew: l.dew, playerForm: l.form, excludeBowlers: l.exclude };
  if (l.battingFirst !== "") sc.battingFirst = Number(l.battingFirst) as 0 | 1;
  if (l.useSituation) {
    sc.battingFirst = (l.battingFirst === "" ? 0 : Number(l.battingFirst)) as 0 | 1;
    sc.start = { innings: l.innings, runs: l.runs, wickets: l.wkts, balls: Math.round(l.overs * pack.rules.bpo),
                 firstInningsTotal: l.innings === 2 ? l.firstTotal : undefined };
  }
  return sc;
}

/** Player profiles and engine details come from the published match; everything else is the user's simulations. */
function enrich(sum: Summary, doc: MatchDoc): Summary {
  const prof = new Map<string, PlayerRow["profile"]>();
  doc.summary.teams.forEach((t) => t.players.forEach((p) => prof.set(p.id, p.profile)));
  return {
    ...sum,
    meta: { ...sum.meta, engine: { ...doc.summary.meta.engine, ...sum.meta.engine } },
    teams: sum.teams.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p, profile: prof.get(p.id) ?? p.profile })) })) as Summary["teams"],
  };
}

const changed = (l: Levers) => JSON.stringify(l) !== JSON.stringify(DEFAULT);

// Settings are kept per match in this browser until the user changes them or resets. If the XIs change, settings
// for players who are no longer playing are dropped and everything else is kept.
const storeKey = (id: string) => `cs-lab:${id}`;
function loadLevers(id: string, pack: Pack): Levers | null {
  try {
    const raw = localStorage.getItem(storeKey(id));
    if (!raw) return null;
    const saved = { ...DEFAULT, ...(JSON.parse(raw) as Partial<Levers>) };
    const playing = new Set(pack.teams.flatMap((t) => t.players));
    saved.form = Object.fromEntries(Object.entries(saved.form ?? {}).filter(([p, f]) => playing.has(p) && typeof f === "number"));
    saved.exclude = (saved.exclude ?? []).filter((p) => playing.has(p));
    return saved;
  } catch { return null; }
}
function saveLevers(id: string, l: Levers) {
  try {
    if (changed(l)) localStorage.setItem(storeKey(id), JSON.stringify(l));
    else localStorage.removeItem(storeKey(id));
  } catch { /* private mode: settings just aren't kept */ }
}

export default function ScenarioLab({ doc }: { doc: MatchDoc }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [base, setBase] = useState<Summary | null>(null);
  const [res, setRes] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [levers, setLevers] = useState<Levers>(DEFAULT);
  const [restored, setRestored] = useState(false);
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef(new Map<number, (s: Summary) => void>());

  useEffect(() => {
    loadPack(doc.match.id).then(setPack).catch(() => setErr("Simulation data for this match isn't available."));
    const w = new Worker(new URL("../lib/engine/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const cb = pending.current.get(e.data.id);
      pending.current.delete(e.data.id);
      if (e.data.error) setErr(e.data.error); else cb?.(e.data.full);
    };
    worker.current = w;
    return () => w.terminate();
  }, [doc.match.id]);

  const run = (scenario: Scenario) => new Promise<Summary>((resolve) => {
    const id = ++reqId.current;
    pending.current.set(id, resolve);
    worker.current!.postMessage({ id, pack, scenario, n: N, seed: 11, full: true });
  });

  useEffect(() => { if (pack) run({}).then((s) => setBase(enrich(s, doc))); }, [pack]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pack || restored) return;
    const saved = loadLevers(doc.match.id, pack);
    if (saved) setLevers(saved);
    setRestored(true);
  }, [pack, restored, doc.match.id]);
  useEffect(() => { if (restored) saveLevers(doc.match.id, levers); }, [levers, restored, doc.match.id]);

  const scenario = useMemo(() => (pack ? toScenario(levers, pack) : null), [levers, pack]);
  useEffect(() => {
    if (!pack || !scenario || !restored) return;
    setBusy(true);
    const t = setTimeout(() => {
      const mine = reqId.current + 1;
      run(scenario).then((s) => { if (reqId.current === mine) { setRes(enrich(s, doc)); setBusy(false); } });
    }, 250);
    return () => clearTimeout(t);
  }, [scenario, restored]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = res ?? base;
  const labDoc = useMemo<MatchDoc | null>(() => (cur ? { ...doc, summary: cur, insights: [], fantasy: undefined, generated_at: new Date().toISOString() } : null),
                                            [cur, doc]);

  if (err) return <p className="notice">{err}</p>;
  if (!pack || !base || !cur || !labDoc) return <div className="skeleton card" style={{ minHeight: 320 }} aria-busy="true" />;
  const set = <K extends keyof Levers>(k: K, v: Levers[K]) => setLevers((l) => ({ ...l, [k]: v }));
  const teams = pack.teams.map((t) => t.name);
  const allBowlers = pack.teams.flatMap((t, k) => t.players.map((p) => ({ id: p, team: k })))
    .filter((p) => (pack.batting.find((b) => b.team === 1 - p.team)!.bowlWeights[pack.batting.find((b) => b.team === 1 - p.team)!.bowlers.indexOf(p.id)] ?? []).reduce((x, y) => x + y, 0) > 0.5);
  const win = (s: Summary, k: number) => s.result.win[teams[k]] ?? 0;
  const median = (s: Summary, k: number) => s.teams[k].batting.score.q["50"] ?? 0;

  return (
    <>
      <Scoreboard doc={labDoc} foot={<span className="sb-note">Your scenario{busy ? " · updating…" : ""}</span>} />
      <div className="lab-layout">
        <aside className="card grid lab-levers" style={{ gap: 18 }}>
          <div>
            <h3>Set the scene</h3>
          </div>
          <div className="lever">
            <label>Who bats first</label>
            <select value={levers.battingFirst} onChange={(e) => set("battingFirst", e.target.value as Levers["battingFirst"])}>
              <option value="">Unknown (toss)</option>{teams.map((t, i) => <option key={t} value={String(i)}>{t}</option>)}
            </select>
          </div>
          <Slider label="Pitch: runs" lo="Slow, big ground" hi="Flat, short boundaries" value={levers.boundary} min={0.75} max={1.35} onChange={(v) => set("boundary", v)} />
          <Slider label="Pitch: wickets" lo="Batting paradise" hi="Green top" value={levers.wickets} min={0.75} max={1.35} onChange={(v) => set("wickets", v)} />
          <Slider label="Help for spinners" lo="None" hi="Raging turner" value={levers.spin} min={0.8} max={1.6} onChange={(v) => set("spin", v)} />
          <Slider label="Help for seamers" lo="None" hi="Swing and seam" value={levers.pace} min={0.8} max={1.6} onChange={(v) => set("pace", v)} />
          <Slider label="Dew in the 2nd innings" lo="None" hi="Heavy" value={levers.dew} min={0} max={1} onChange={(v) => set("dew", v)} />
          <FormEditor pack={pack} form={levers.form} onChange={(f) => set("form", f)} />
          <div className="lever">
            <label>Rule a bowler out</label>
            <select value="" onChange={(e) => e.target.value && set("exclude", [...levers.exclude, e.target.value])}>
              <option value="">Choose a bowler…</option>
              {allBowlers.filter((b) => !levers.exclude.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{pack.players[b.id]?.name} ({teams[b.team]})</option>)}
            </select>
            {levers.exclude.length > 0 && <div className="small">{levers.exclude.map((p) => (
              <button key={p} className="tag" style={{ marginRight: 6, cursor: "pointer", background: "none" }} onClick={() => set("exclude", levers.exclude.filter((x) => x !== p))}>{pack.players[p]?.name} ✕</button>
            ))}</div>}
          </div>
          <Situation levers={levers} set={set} teams={teams} pack={pack} />
          <button className="btn ghost" onClick={() => setLevers(DEFAULT)} disabled={!changed(levers)}>Reset</button>
        </aside>

        <div className="grid lab-main" style={{ opacity: busy ? 0.6 : 1, transition: "opacity .2s" }}>
          <div className="card">
            <div className="card-head"><h3>Your scenario</h3>
              <span className="small muted">{changed(levers) ? "Change v the match as published · your settings are saved for this match" : "No changes yet: this is the match as published"}</span></div>
            <div className="lab-compare">
              {teams.map((t, k) => (
                <div key={t}>
                  <div className="cs-k" style={{ color: COLORS[k] }}>{t}</div>
                  <div className="lab-big"><Pct p={win(cur, k)} /> <Delta d={win(cur, k) - win(base, k)} pctPts /></div>
                  <div className="small muted">to win · projected <b>{num(median(cur, k))}</b> <Delta d={median(cur, k) - median(base, k)} /></div>
                </div>
              ))}
            </div>
            <WinBar a={teams[0]} b={teams[1]} pa={win(cur, 0)} pb={win(cur, 1)} big />
            <Movers now={cur} was={base} />
          </div>
          <ForecastTabs doc={labDoc} live={false} />
        </div>
      </div>
    </>
  );
}

function Slider({ label, lo, hi, value, min, max, onChange }: { label: string; lo: string; hi: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="lever">
      <label>{label}<span className="mono">{value === 1 || (min === 0 && value === 0) ? "normal" : `${value.toFixed(2)}×`}</span></label>
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <div className="small muted" style={{ display: "flex", justifyContent: "space-between" }}><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

function FormEditor({ pack, form, onChange }: { pack: Pack; form: Record<string, number>; onChange: (f: Record<string, number>) => void }) {
  const ids = pack.teams.flatMap((t) => t.players);
  return (
    <div className="lever">
      <label>Player form</label>
      <select value="" onChange={(e) => e.target.value && onChange({ ...form, [e.target.value]: 1.25 })}>
        <option value="">Choose a player…</option>
        {ids.filter((p) => !(p in form)).map((p) => <option key={p} value={p}>{pack.players[p]?.name}</option>)}
      </select>
      {Object.entries(form).map(([p, f]) => (
        <div key={p} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 8, alignItems: "center" }}>
          <span className="small">{pack.players[p]?.name}</span>
          <input type="range" min={0.6} max={1.5} step={0.05} value={f} onChange={(e) => onChange({ ...form, [p]: Number(e.target.value) })} aria-label={`${pack.players[p]?.name} form`} />
          <button className="iconbtn" onClick={() => { const { [p]: _, ...rest } = form; onChange(rest); }} aria-label="remove">✕</button>
          <span className="small muted" style={{ gridColumn: "2" }}>{f < 1 ? "out of form" : f > 1 ? "in form" : "normal"} ({f.toFixed(2)}×)</span>
        </div>
      ))}
    </div>
  );
}

function Situation({ levers, set, teams, pack }: { levers: Levers; set: <K extends keyof Levers>(k: K, v: Levers[K]) => void; teams: string[]; pack: Pack }) {
  const bf = levers.battingFirst === "" ? 0 : Number(levers.battingFirst);
  const batting = levers.innings === 1 ? teams[bf] : teams[1 - bf];
  return (
    <div className="lever">
      <label><span><input type="checkbox" checked={levers.useSituation} onChange={(e) => set("useSituation", e.target.checked)} /> Jump to a match situation</span></label>
      {levers.useSituation && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <span className="small">Innings<select value={levers.innings} onChange={(e) => set("innings", Number(e.target.value) as 1 | 2)}><option value={1}>1st</option><option value={2}>2nd (chase)</option></select></span>
          {levers.innings === 2 && <span className="small">1st-innings total<input type="number" min={0} max={500} value={levers.firstTotal} onChange={(e) => set("firstTotal", Number(e.target.value))} /></span>}
          <span className="small">{batting} runs<input type="number" min={0} max={500} value={levers.runs} onChange={(e) => set("runs", Number(e.target.value))} /></span>
          <span className="small">Wickets down<input type="number" min={0} max={9} value={levers.wkts} onChange={(e) => set("wkts", Math.min(9, Number(e.target.value)))} /></span>
          <span className="small">Overs bowled<input type="number" min={0} max={pack.rules.overs - 1} step={1} value={levers.overs} onChange={(e) => set("overs", Math.min(pack.rules.overs - 1, Number(e.target.value)))} /></span>
        </div>
      )}
    </div>
  );
}

function Delta({ d, pctPts = false }: { d: number; pctPts?: boolean }) {
  const v = pctPts ? d * 100 : d;
  if (Math.abs(v) < 0.5) return <span className="muted">±0</span>;
  return <span className={v > 0 ? "delta-up" : "delta-down"}>{signed(v, 0, pctPts ? " pts" : "")}</span>;
}

function Movers({ now, was }: { now: Summary; was: Summary }) {
  const before = new Map<string, PlayerRow>();
  was.teams.forEach((t) => t.players.forEach((p) => before.set(p.id, p)));
  const rows = now.teams.flatMap((t) => t.players).map((p) => {
    const w = before.get(p.id);
    const runs = p.batting?.runs.mean ?? 0, wk = p.bowling && p.bowling.p_bowls > 0.25 ? p.bowling.wickets.mean ?? 0 : null;
    return { p, runs, wk, dRuns: runs - (w?.batting?.runs.mean ?? 0), dW: (wk ?? 0) - (w?.bowling?.wickets.mean ?? 0) };
  }).sort((a, b) => Math.abs(b.dRuns) + 10 * Math.abs(b.dW) - (Math.abs(a.dRuns) + 10 * Math.abs(a.dW))).slice(0, 6);
  if (!rows.some((r) => Math.abs(r.dRuns) >= 0.5 || Math.abs(r.dW) >= 0.05)) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="cs-k">Biggest movers</div>
      <div className="lab-movers">
        {rows.map(({ p, runs, wk, dRuns, dW }) => (
          <div key={p.id} className="small">
            <span>{p.name}</span>
            <span>{num(runs, 1)} runs <Delta d={dRuns} />{wk !== null && <> · {num(wk, 2)} wkts {Math.abs(dW) >= 0.05 ? <span className={dW > 0 ? "delta-up" : "delta-down"}>{signed(dW, 2)}</span> : null}</>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
