"use client";
// MatchSynth Lab: the user's levers re-run the match in the browser, and every match-centre view (overview, scores,
// wickets, players, match-ups) is rebuilt from those simulations alone.
import { useEffect, useMemo, useRef, useState } from "react";
import { Num, Pct, WinBar } from "@/components/charts";
import { ForecastTabs } from "@/components/MatchCentre";
import Scoreboard from "@/components/Scoreboard";
import { track } from "@/lib/analytics";
import { loadPack } from "@/lib/data";
import type { Pack, Scenario } from "@/lib/engine/sim";
import { num, signed } from "@/lib/format";
import { DEFAULT, PRESET_GROUPS, applyPreset, buildPresets, decodeLevers, encodeLevers, partsOf, presetOn, type Levers, type PresetGroup } from "@/lib/lab";
import { SITE } from "@/lib/seo";
import type { FantasyPicks, MatchDoc, PlayerRow, Summary } from "@/lib/types";

const N = 5000;
const COLORS = ["var(--team-a)", "var(--team-b)"];

const N_PART = 1500;          // simulations per run for "what moved it" (one run per change)

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
// Named scenarios the user saved for this match, on this device only.
type Saved = { name: string; levers: Levers };
const savedKey = (id: string) => `cs-lab-saved:${id}`;
function loadSaved(id: string): Saved[] {
  try { const v = JSON.parse(localStorage.getItem(savedKey(id)) || "[]"); return Array.isArray(v) ? v.slice(0, 12) : []; } catch { return []; }
}
function storeSaved(id: string, list: Saved[]) { try { localStorage.setItem(savedKey(id), JSON.stringify(list)); } catch { /* not kept */ } }

/** The Lab's state for one match: the published baseline, the user's levers and the scenario re-simulated from them.
 *  The website lays it out on one page (ScenarioLab); the app spreads it over screens. */
export function useLab(doc: MatchDoc) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [base, setBase] = useState<Summary | null>(null);
  const [res, setRes] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [levers, setLevers] = useState<Levers>(DEFAULT);
  const [restored, setRestored] = useState(false);
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);            // id of every request to the worker
  const mainId = useRef(0);           // the latest full scenario run
  const pending = useRef(new Map<number, (s: any) => void>()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [fantasy, setFantasy] = useState<FantasyPicks | null>(null);
  const [savedList, setSavedList] = useState<Saved[]>([]);
  const [why, setWhy] = useState<{ label: string; d: number }[] | null>(null);

  useEffect(() => {
    loadPack(doc.match.id).then(setPack).catch(() => setErr("Simulation data for this match isn't available."));
    const w = new Worker(new URL("../lib/engine/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const cb = pending.current.get(e.data.id);
      pending.current.delete(e.data.id);
      if (e.data.error) setErr(e.data.error);
      else {
        if (e.data.full && e.data.id === mainId.current) setFantasy(e.data.fantasy ?? null);      // only the latest scenario's picks
        cb?.(e.data.full ?? e.data.summary);
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, [doc.match.id]);

  const run = (scenario: Scenario) => new Promise<Summary>((resolve) => {
    const id = ++reqId.current;
    mainId.current = id;
    pending.current.set(id, resolve);
    worker.current!.postMessage({ id, pack, scenario, n: N, seed: 11, full: true });
  });
  /** A quick run for the breakdown: win chances only. */
  const quick = (scenario: Scenario) => new Promise<[number, number]>((resolve) => {
    const id = ++reqId.current;
    pending.current.set(id, (s: { win: [number, number] }) => resolve(s.win));
    worker.current!.postMessage({ id, pack, scenario, n: N_PART, seed: 11 });
  });

  useEffect(() => { if (pack) run({}).then((s) => setBase(enrich(s, doc))); }, [pack]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pack || restored) return;
    // a shared link (#s=…) wins over what this browser had saved
    const shared = typeof window !== "undefined" ? new URLSearchParams(window.location.hash.slice(1)).get("s") : null;
    const fromLink = shared ? decodeLevers(shared, pack) : null;
    const saved = fromLink ?? loadLevers(doc.match.id, pack);
    if (saved) setLevers(saved);
    if (fromLink) track("lab_shared_open", { match_id: doc.match.id });
    setSavedList(loadSaved(doc.match.id));
    setRestored(true);
  }, [pack, restored, doc.match.id]);
  useEffect(() => { if (restored) saveLevers(doc.match.id, levers); }, [levers, restored, doc.match.id]);

  const lastTrack = useRef(0);          // one lab_run event per 30 s of slider changes
  const scenario = useMemo(() => (pack ? toScenario(levers, pack) : null), [levers, pack]);
  useEffect(() => {
    if (!pack || !scenario || !restored) return;
    setBusy(true);
    const t = setTimeout(() => {
      const mine = reqId.current + 1;
      if (Date.now() - lastTrack.current > 30_000) { lastTrack.current = Date.now(); track("lab_run", { match_id: doc.match.id }); }
      run(scenario).then((s) => { if (mainId.current === mine) { setRes(enrich(s, doc)); setBusy(false); } });
    }, 250);
    return () => clearTimeout(t);
  }, [scenario, restored]); // eslint-disable-line react-hooks/exhaustive-deps

  // what moved it: once the result settles, switch each change off on its own and see how far team 1's chance moves
  const whyFor = useRef("");
  useEffect(() => {
    if (!pack || !restored || busy) return;
    const parts = partsOf(levers, pack).slice(0, 8);
    const key = JSON.stringify(levers);
    if (!parts.length) { setWhy(null); return; }
    whyFor.current = key;
    setWhy(null);
    const t = setTimeout(async () => {
      const all = await quick(toScenario(levers, pack));
      const out: { label: string; d: number }[] = [];
      for (const p of parts) {
        if (whyFor.current !== key) return;
        const w = await quick(toScenario(p.without(levers), pack));
        out.push({ label: p.label, d: all[0] - w[0] });
      }
      if (whyFor.current === key) setWhy(out.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)));
    }, 600);
    return () => clearTimeout(t);
  }, [busy, levers, pack, restored]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = res ?? base;
  const labDoc = useMemo<MatchDoc | null>(() => (cur ? { ...doc, summary: cur, insights: [], fantasy: fantasy ? { ...fantasy, scenario: true } : undefined,
                                                          generated_at: new Date().toISOString() } : null),
                                            [cur, doc, fantasy]);
  const set = <K extends keyof Levers>(k: K, v: Levers[K]) => setLevers((l) => ({ ...l, [k]: v }));
  const ready = !!(pack && base && cur && labDoc);
  const presets = useMemo(() => (pack ? buildPresets(pack, base) : []), [pack, base]);
  const shareUrl = () => `${SITE}/lab/?id=${encodeURIComponent(doc.match.id)}#s=${encodeLevers(levers)}`;
  const save = (name: string) => {
    const list = [{ name, levers }, ...savedList.filter((x) => x.name !== name)].slice(0, 12);
    setSavedList(list); storeSaved(doc.match.id, list);
  };
  const unsave = (name: string) => { const list = savedList.filter((x) => x.name !== name); setSavedList(list); storeSaved(doc.match.id, list); };
  return { err, ready, pack, base, cur, labDoc, busy, levers, set, setLevers, reset: () => setLevers(DEFAULT), changed: changed(levers),
           changes: countChanges(levers), teams: pack ? pack.teams.map((t) => t.name) : [], presets, why, shareUrl,
           saved: savedList, save, unsave, matchId: doc.match.id };
}
export type Lab = ReturnType<typeof useLab>;

/** How many levers differ from the published match (for "3 changes"). */
function countChanges(l: Levers): number {
  return (Object.keys(DEFAULT) as (keyof Levers)[]).filter((k) => k !== "innings" && k !== "runs" && k !== "wkts" && k !== "overs" && k !== "firstTotal"
    && JSON.stringify(l[k]) !== JSON.stringify(DEFAULT[k])).length;
}

const winOf = (lab: Lab, s: Summary, k: number) => s.result.win[lab.teams[k]] ?? 0;
const medianOf = (s: Summary, k: number) => s.teams[k].batting.score.q["50"] ?? 0;

/** The levers: conditions, form, availability and an optional match situation. */
export function LabLevers({ lab }: { lab: Lab }) {
  const { pack, levers, set, teams } = lab;
  if (!pack) return null;
  const allBowlers = pack.teams.flatMap((t, k) => t.players.map((p) => ({ id: p, team: k })))
    .filter((p) => (pack.batting.find((b) => b.team === 1 - p.team)!.bowlWeights[pack.batting.find((b) => b.team === 1 - p.team)!.bowlers.indexOf(p.id)] ?? []).reduce((x, y) => x + y, 0) > 0.5);
  return (
    <>
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
    </>
  );
}

/** Win chances and projected totals under the scenario, against the match as published. */
export function LabResult({ lab, movers = true }: { lab: Lab; movers?: boolean }) {
  const { cur, base, teams } = lab;
  if (!cur || !base) return null;
  return (
    <>
      <div className="lab-compare">
        {teams.map((t, k) => (
          <div key={t}>
            <div className="cs-k" style={{ color: COLORS[k] }}>{t}</div>
            <div className="lab-big"><Pct p={winOf(lab, cur, k)} /> <Delta d={winOf(lab, cur, k) - winOf(lab, base, k)} pctPts /></div>
            <div className="small muted">to win · projected <b>{num(medianOf(cur, k))}</b> <Delta d={medianOf(cur, k) - medianOf(base, k)} /></div>
          </div>
        ))}
      </div>
      <WinBar a={teams[0]} b={teams[1]} pa={winOf(lab, cur, 0)} pb={winOf(lab, cur, 1)} big />
      {movers && <Why lab={lab} />}
      {movers && <Movers now={cur} was={base} />}
    </>
  );
}

/** Ready-made scenarios, grouped. Each adds its levers to what's set; tap again to see it's on. */
export function LabPresets({ lab }: { lab: Lab }) {
  const [group, setGroup] = useState<PresetGroup>("Pitch");
  const [last, setLast] = useState<string | null>(null);
  const list = lab.presets.filter((p) => p.group === group);
  const onNow = lab.presets.filter((p) => presetOn(lab.levers, p) && lab.changed);
  return (
    <div className="lever lab-presets">
      <label>Quick scenarios</label>
      <p className="small muted" style={{ margin: 0 }}>Tap to add. They stack, so mix a pitch, a player and a situation. Fine-tune with the sliders below.</p>
      <div className="lab-preset-groups" role="tablist" aria-label="Scenario groups">
        {PRESET_GROUPS.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={g === group} className={g === group ? "on" : undefined} onClick={() => setGroup(g)}>{g}</button>
        ))}
      </div>
      <div className="lab-preset-list">
        {list.map((p) => {
          const on = presetOn(lab.levers, p) && lab.changed;
          return (
            <button key={p.id} type="button" className={`lab-preset${on ? " on" : ""}`} aria-pressed={on}
                    onClick={() => { lab.setLevers((l) => applyPreset(l, p)); setLast(p.id); track("lab_preset", { preset: p.id.replace(/\d+$/, "") }); }}>
              <b>{p.title}</b>{(on || last === p.id) && <span>{p.blurb}</span>}
            </button>
          );
        })}
      </div>
      {onNow.length > 0 && <p className="small" style={{ margin: 0 }}><span className="muted">On now:</span> {onNow.map((p) => p.title).join(" · ")}</p>}
    </div>
  );
}

/** Share the scenario as a link, and keep named scenarios on this device. */
export function LabShare({ lab, reset = true }: { lab: Lab; reset?: boolean }) {
  const [msg, setMsg] = useState("");
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const share = async () => {
    const url = lab.shareUrl(), text = `My MatchSynth Lab scenario: ${lab.teams.join(" v ")}`;
    track("lab_share", { match_id: lab.matchId });
    try {
      if (navigator.share) { await navigator.share({ title: "MatchSynth Lab", text, url }); return; }
      await navigator.clipboard.writeText(url); flash("Link copied");
    } catch { /* closed the share sheet */ }
  };
  const save = () => {
    const name = window.prompt("Name this scenario", `Scenario ${lab.saved.length + 1}`)?.trim();
    if (name) { lab.save(name.slice(0, 40)); flash("Saved on this device"); }
  };
  return (
    <div className="lever lab-share">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={share} disabled={!lab.changed}>Share scenario</button>
        <button type="button" className="btn ghost" onClick={save} disabled={!lab.changed}>Save</button>
        {reset && <button type="button" className="btn ghost" onClick={lab.reset} disabled={!lab.changed}>Reset</button>}
      </div>
      {msg && <span className="small" role="status">{msg}</span>}
      {lab.saved.length > 0 && (
        <div className="lab-saved">
          <span className="small muted">Saved scenarios</span>
          {lab.saved.map((x) => (
            <span key={x.name} className="lab-saved-item">
              <button type="button" className="linkish" onClick={() => lab.setLevers(x.levers)}>{x.name}</button>
              <button type="button" className="iconbtn" aria-label={`Delete ${x.name}`} onClick={() => lab.unsave(x.name)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** How much each change moved the result, each switched off on its own. */
function Why({ lab }: { lab: Lab }) {
  const { why, teams, changed } = lab;
  if (!changed) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="cs-k">What moved it</div>
      {!why ? <p className="small muted" style={{ margin: "6px 0 0" }}>Working it out…</p> : (
        <>
          <div className="lab-why">
            {why.map((w) => {
              const k = w.d >= 0 ? 0 : 1, v = Math.abs(w.d) * 100;
              return (
                <div key={w.label} className="small">
                  <span>{w.label}</span>
                  <span className="lab-why-bar"><i style={{ width: `${Math.min(100, v * 4)}%`, background: COLORS[k] }} /></span>
                  <span>{v < 0.5 ? <span className="muted">no real change</span> : <><b>+{num(v)} pts</b> {teams[k]}</>}</span>
                </div>
              );
            })}
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>Each change switched off on its own, so they don&apos;t add up exactly.</p>
        </>
      )}
    </div>
  );
}

export default function ScenarioLab({ doc }: { doc: MatchDoc }) {
  const lab = useLab(doc);
  if (lab.err) return <p className="notice">{lab.err}</p>;
  if (!lab.ready || !lab.labDoc) return <div className="skeleton card" style={{ minHeight: 320 }} aria-busy="true" />;
  return (
    <>
      <Scoreboard doc={lab.labDoc} foot={<span className="sb-note">Your scenario{lab.busy ? " · updating…" : ""}</span>} />
      <div className="lab-layout">
        <aside className="card grid lab-levers" style={{ gap: 18 }}>
          <div>
            <h3>Set the scene</h3>
          </div>
          <LabPresets lab={lab} />
          <LabLevers lab={lab} />
          <LabShare lab={lab} />
        </aside>

        <div className="grid lab-main" style={{ opacity: lab.busy ? 0.6 : 1, transition: "opacity .2s" }}>
          <div className="card">
            <div className="card-head"><h3>Your scenario</h3></div>
            <LabResult lab={lab} />
          </div>
          <ForecastTabs doc={lab.labDoc} live={false} />
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
