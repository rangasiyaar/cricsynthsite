"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { OverBars, WinBar } from "@/components/charts";
import { loadPack } from "@/lib/data";
import type { Pack, Scenario } from "@/lib/engine/sim";
import type { LabSummary } from "@/lib/engine/summary";
import { num, pct, signed } from "@/lib/format";
import type { MatchDoc } from "@/lib/types";

const N = 5000;
const COLORS = ["var(--team-a)", "var(--team-b)"];

// Pro is enforced with Firebase Auth once accounts go live; until then a local "preview" switch unlocks it.
function usePro(): [boolean, () => void] {
  const [pro, setPro] = useState(false);
  useEffect(() => {
    try { setPro(process.env.NEXT_PUBLIC_PRO_PREVIEW === "1" || localStorage.getItem("cs-pro-preview") === "1"); } catch {}
  }, []);
  return [pro, () => { try { localStorage.setItem("cs-pro-preview", "1"); } catch {} setPro(true); }];
}

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

export default function ScenarioLab({ doc }: { doc: MatchDoc }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [base, setBase] = useState<LabSummary | null>(null);
  const [res, setRes] = useState<LabSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [levers, setLevers] = useState<Levers>(DEFAULT);
  const [pro, unlock] = usePro();
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef(new Map<number, (s: LabSummary) => void>());

  useEffect(() => {
    loadPack(doc.match.id).then(setPack).catch(() => setErr("Scenario data for this match isn't available."));
    const w = new Worker(new URL("../lib/engine/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const cb = pending.current.get(e.data.id);
      pending.current.delete(e.data.id);
      if (e.data.error) setErr(e.data.error); else cb?.(e.data.summary);
    };
    worker.current = w;
    return () => w.terminate();
  }, [doc.match.id]);

  const run = (scenario: Scenario) => new Promise<LabSummary>((resolve) => {
    const id = ++reqId.current;
    pending.current.set(id, resolve);
    worker.current!.postMessage({ id, pack, scenario, n: N, seed: 11 });
  });

  useEffect(() => { if (pack) run({}).then(setBase); }, [pack]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenario = useMemo(() => (pack ? toScenario(levers, pack) : null), [levers, pack]);
  useEffect(() => {
    if (!pack || !scenario) return;
    setBusy(true);
    const t = setTimeout(() => {
      const mine = reqId.current + 1;
      run(scenario).then((s) => { if (reqId.current === mine) { setRes(s); setBusy(false); } });
    }, 250);
    return () => clearTimeout(t);
  }, [scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="notice">{err}</p>;
  if (!pack || !base) return <div className="skeleton card" style={{ minHeight: 280 }} />;
  const set = <K extends keyof Levers>(k: K, v: Levers[K]) => setLevers((l) => ({ ...l, [k]: v }));
  const teams = pack.teams.map((t) => t.name);
  const allBowlers = pack.teams.flatMap((t, k) => t.players.map((p) => ({ id: p, team: k })))
    .filter((p) => (pack.batting.find((b) => b.team === 1 - p.team)!.bowlWeights[pack.batting.find((b) => b.team === 1 - p.team)!.bowlers.indexOf(p.id)] ?? []).reduce((x, y) => x + y, 0) > 0.5);
  const cur = res ?? base;

  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card grid" style={{ gap: 18 }}>
        <div>
          <h3>Set the scene</h3>
          <p className="small muted">Every change re-runs {N.toLocaleString()} simulations in your browser.</p>
        </div>
        <div className="lever">
          <label>Who bats first</label>
          <select value={levers.battingFirst} onChange={(e) => set("battingFirst", e.target.value as Levers["battingFirst"])}>
            <option value="">Unknown (toss)</option>{teams.map((t, i) => <option key={t} value={String(i)}>{t}</option>)}
          </select>
        </div>
        <Slider label="Pitch: runs" lo="Slow, big ground" hi="Flat, short boundaries" value={levers.boundary} min={0.75} max={1.35} onChange={(v) => set("boundary", v)} />
        <Locked pro={pro} unlock={unlock}>
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
        </Locked>
        <button className="btn ghost" onClick={() => setLevers(DEFAULT)}>Reset</button>
      </div>

      <div className="grid">
        <div className="card" style={{ opacity: busy ? 0.6 : 1, transition: "opacity .2s" }}>
          <div className="eyebrow">Win chance{busy ? " · simulating…" : ""}</div>
          <div className="wins" style={{ fontSize: 30 }}>
            <span style={{ color: COLORS[0] }}>{pct(cur.win[0])}</span><span style={{ color: COLORS[1] }}>{pct(cur.win[1])}</span>
          </div>
          <WinBar a={teams[0]} b={teams[1]} pa={cur.win[0]} pb={cur.win[1]} big />
          <div className="wins small" style={{ marginTop: 6 }}>
            <Delta d={cur.win[0] - base.win[0]} pctPts /> <span className="muted">change v the published match</span> <Delta d={cur.win[1] - base.win[1]} pctPts />
          </div>
        </div>
        {cur.teams.map((t, k) => (
          <div key={t.name} className="card">
            <h3 style={{ color: COLORS[k] }}>{t.name}</h3>
            <div className="table-wrap"><table>
              <thead><tr><th></th><th className="num">Now</th><th className="num">Change</th></tr></thead>
              <tbody>
                <tr><td>Projected score</td><td className="num">{num(t.score.q50)}</td><td className="num"><Delta d={t.score.q50 - base.teams[k].score.q50} /></td></tr>
                {t.phases.map((ph, i) => (
                  <tr key={ph.phase}><td>{ph.phase} runs / wickets</td><td className="num">{num(ph.runs)} / {num(ph.wickets, 1)}</td>
                    <td className="num"><Delta d={ph.runs - base.teams[k].phases[i].runs} /></td></tr>
                ))}
                <tr><td>First wicket (typical over)</td><td className="num">{num(t.firstWicketOver)}</td>
                  <td className="num">{t.firstWicketOver !== null && base.teams[k].firstWicketOver !== null ? <Delta d={t.firstWicketOver - base.teams[k].firstWicketOver!} /> : "—"}</td></tr>
              </tbody>
            </table></div>
            <OverBars height={120} series={[{ name: t.name, color: COLORS[k], values: t.pWicketByOver }]} />
            <Movers now={t.players} was={base.teams[k].players} />
          </div>
        ))}
      </div>
    </div>
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

function Locked({ pro, unlock, children }: { pro: boolean; unlock: () => void; children: React.ReactNode }) {
  if (pro) return <>{children}</>;
  return (
    <div className="notice">
      <b>More levers with Pro</b>: pitch wickets, spin and seam help, dew, player form, ruling bowlers out, and jumping to any
      match situation.
      <div style={{ marginTop: 10 }}><button className="btn" onClick={unlock}>Try the Pro preview</button></div>
    </div>
  );
}

function Delta({ d, pctPts = false }: { d: number; pctPts?: boolean }) {
  const v = pctPts ? d * 100 : d;
  if (Math.abs(v) < 0.5) return <span className="muted">±0</span>;
  return <span className={v > 0 ? "delta-up" : "delta-down"}>{signed(v, 0, pctPts ? " pts" : "")}</span>;
}

function Movers({ now, was }: { now: LabSummary["teams"][0]["players"]; was: LabSummary["teams"][0]["players"] }) {
  const rows = now.map((p) => {
    const w = was.find((x) => x.id === p.id)!;
    return { p, dRuns: p.runs - w.runs, dW: (p.wkts ?? 0) - (w.wkts ?? 0) };
  }).sort((a, b) => Math.abs(b.dRuns) + 10 * Math.abs(b.dW) - (Math.abs(a.dRuns) + 10 * Math.abs(a.dW))).slice(0, 4);
  if (!rows.some((r) => Math.abs(r.dRuns) >= 0.5 || Math.abs(r.dW) >= 0.05)) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="eyebrow">Biggest movers</div>
      {rows.map(({ p, dRuns, dW }) => (
        <div key={p.id} className="small" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{p.name}</span>
          <span>{num(p.runs, 1)} runs <Delta d={dRuns} />{p.wkts !== null && <> · {num(p.wkts, 2)} wkts {Math.abs(dW) >= 0.05 ? <span className={dW > 0 ? "delta-up" : "delta-down"}>{signed(dW, 2)}</span> : null}</>}</span>
        </div>
      ))}
    </div>
  );
}
