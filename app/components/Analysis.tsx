"use client";
// Forecast charts with their uncertainty shown: run fans, the first-innings win curve, per-player outcome ranges,
// the chase curve and checkpoints. Lines draw in and bands fade in on mount.
import { ChartFrame, type Column } from "@/components/charts";
import type { MatchDoc, PlayerRow, Summary } from "@/lib/types";

const COLORS = ["var(--team-a)", "var(--team-b)"];

/** Cumulative runs over by over: median line, 50% and 80% bands for each side. */
export function RunFan({ s }: { s: Summary }) {
  const fans = s.teams.map((t) => t.batting.fan ?? []);
  if (!fans[0].length) return null;
  const overs = s.meta.rules.overs;
  const top = Math.max(...fans.flatMap((f) => f.map((r) => r.q90)), 50);
  const W = 640, H = 260, pad = { l: 40, r: 12, t: 12, b: 26 };
  const sx = (o: number) => pad.l + (o / overs) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const band = (f: typeof fans[0], a: "q10" | "q25", b: "q90" | "q75") =>
    [`${sx(0)},${sy(0)}`, ...f.map((r) => `${sx(r.over)},${sy(r[b])}`), ...[...f].reverse().map((r) => `${sx(r.over)},${sy(r[a])}`)].join(" ");
  const step = top > 200 ? 50 : 25;
  return (
    <div className="card anim-rise">
      <h3>Projected run fan</h3>
      <p className="small muted">Cumulative runs by over. Line: median; dark band: middle 50% of simulations; light band: middle 80%.</p>
      <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name}</span>)}</div>
      <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} label="run fan" columns={fans[0].map((r, i): Column => ({
        x0: sx(r.over - 0.5), x1: sx(r.over + 0.5), title: `After ${r.over} overs`,
        rows: fans.map((f, k) => ({ color: COLORS[k], label: s.teams[k].name,
          value: f[i] ? `${f[i].q50} (${f[i].q10}–${f[i].q90}) · ${f[i].wickets.toFixed(1)} wkts` : "—" })),
      }))}>
        <g className="grid">{Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <line key={v} x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} />))}</g>
        {Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <text key={v} x={pad.l - 6} y={sy(v) + 4} textAnchor="end">{v}</text>))}
        {fans.map((f, k) => (
          <g key={k}>
            <polygon className="anim-fade" points={band(f, "q10", "q90")} fill={COLORS[k]} fillOpacity=".10" />
            <polygon className="anim-fade" points={band(f, "q25", "q75")} fill={COLORS[k]} fillOpacity=".18" />
            <polyline className="anim-draw" pathLength={1} fill="none" stroke={COLORS[k]} strokeWidth="2.5" vectorEffect="non-scaling-stroke"
                      points={[`${sx(0)},${sy(0)}`, ...f.map((r) => `${sx(r.over)},${sy(r.q50)}`)].join(" ")} />
            <text x={sx(overs) - 4} y={sy(f[f.length - 1].q50) + (k === (fans[0][fans[0].length - 1].q50 >= fans[1][fans[1].length - 1].q50 ? 0 : 1) ? -10 : 18)}
                  textAnchor="end" fill={COLORS[k]} style={{ fontWeight: 600 }}>
              {f[f.length - 1].q50}
            </text>
          </g>
        ))}
        {Array.from({ length: overs / (overs > 20 ? 10 : 5) + 1 }, (_, i) => i * (overs > 20 ? 10 : 5)).map((o) => (
          <text key={o} x={sx(o)} y={H - 8} textAnchor="middle">{o}</text>))}
      </ChartFrame>
    </div>
  );
}

/** P(side batting first wins | first-innings total): what a total is worth. */
export function WinCurve({ s }: { s: Summary }) {
  const c = s.result.win_by_first_innings ?? [];
  if (c.length < 3) return null;
  const W = 640, H = 240, pad = { l: 40, r: 12, t: 12, b: 26 };
  const lo = c[0].from, hi = c[c.length - 1].to;
  const sx = (x: number) => pad.l + ((x - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const sy = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const nmax = Math.max(...c.map((r) => r.n));
  const even = c.find((r) => r.p_win >= 0.5);
  const medians = s.teams.map((t) => t.batting.by_innings?.find((b) => b.innings === 1)?.score.q["50"] ?? null);
  return (
    <div className="card anim-rise">
      <h3>What a first-innings total is worth</h3>
      <p className="small muted">Chance the side batting first wins, by its total.{even ? <> Break-even around <b>{even.from}</b>.</> : null}
        {" "}Dots are sized by how many simulations land in each band.</p>
      <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} label="win probability by first-innings total" columns={c.map((r): Column => ({
        x0: sx(r.from), x1: sx(r.to), title: `First innings ${r.from}–${r.to - 1}`,
        rows: [{ label: "Batting side wins", value: `${(100 * r.p_win).toFixed(0)}%` },
               { label: "Chasing side wins", value: `${(100 * (1 - r.p_win)).toFixed(0)}%` },
               { label: "Simulations", value: r.n.toLocaleString("en-IN") }],
      }))}>
        <g className="grid">{[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(f)} y2={sy(f)} />)}</g>
        {[0, 0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(f) + 4} textAnchor="end">{100 * f}%</text>)}
        <line x1={pad.l} x2={W - pad.r} y1={sy(0.5)} y2={sy(0.5)} stroke="var(--cs-ink-3)" strokeDasharray="4 4" />
        {medians.map((m, k) => m != null && (
          <g key={k}>
            <line x1={sx(m)} x2={sx(m)} y1={pad.t} y2={H - pad.b} stroke={COLORS[k]} strokeDasharray="2 4" />
            <text x={sx(m) + 4} y={pad.t + 12 + k * 14} fill={COLORS[k]}>{s.teams[k].name} median {m}</text>
          </g>
        ))}
        <polyline className="anim-draw" pathLength={1} fill="none" stroke="var(--cs-steel)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"
                  points={c.map((r) => `${sx((r.from + r.to) / 2)},${sy(r.p_win)}`).join(" ")} />
        {c.map((r) => (
          <circle key={r.from} className="anim-pop" cx={sx((r.from + r.to) / 2)} cy={sy(r.p_win)} r={2 + 5 * Math.sqrt(r.n / nmax)}
                  fill="var(--cs-steel)" fillOpacity=".8" />
        ))}
        {c.filter((_, i) => i % 2 === 0).map((r) => <text key={r.from} x={sx(r.from)} y={H - 8} textAnchor="middle">{r.from}</text>)}
      </ChartFrame>
    </div>
  );
}

/** Each batter's run range (10th–90th, quartiles, median) and each bowler's wicket chances. */
export function PlayerLadder({ s }: { s: Summary }) {
  const W = 300, rowH = 26;
  return (
    <div className="card anim-rise">
      <h3>Player outcome ranges</h3>
      <p className="small muted">Runs: whisker 10th–90th percentile, box the middle 50%, tick the median. Wickets: chance of 1, 2 and 3+.</p>
      <div className="grid g2">
        {s.teams.map((t, k) => {
          const bats = t.players.filter((p) => p.batting && (p.batting.p_bats ?? 1) > 0.5);
          const bowls = t.players.filter((p) => p.bowling && (p.bowling.p_bowls ?? 0) > 0.5)
            .sort((a, b) => (b.bowling!.wickets.mean ?? 0) - (a.bowling!.wickets.mean ?? 0));
          const max = Math.max(...bats.map((p) => p.batting!.runs.q["90"] ?? 0), 40);
          const sx = (v: number) => 4 + (v / max) * (W - 8);
          return (
            <div key={t.name}>
              <div className="cs-k" style={{ color: COLORS[k], marginBottom: 6 }}>{t.name}</div>
              {bats.map((p, i) => {
                const q = p.batting!.runs.q;
                return (
                  <div key={p.id} className="ladder-row">
                    <span className="ladder-name">{p.name}</span>
                    <svg viewBox={`0 0 ${W} ${rowH}`} width="100%" height={rowH} className="anim-fade" style={{ animationDelay: `${i * 40}ms` }}>
                      <line x1={sx(q["10"])} x2={sx(q["90"])} y1={rowH / 2} y2={rowH / 2} stroke={COLORS[k]} strokeOpacity=".5" />
                      <rect x={sx(q["25"])} y={6} width={Math.max(sx(q["75"]) - sx(q["25"]), 2)} height={rowH - 12} fill={COLORS[k]} fillOpacity=".3" stroke={COLORS[k]} />
                      <line x1={sx(q["50"])} x2={sx(q["50"])} y1={3} y2={rowH - 3} stroke={COLORS[k]} strokeWidth="2.5" />
                      <title>{`${p.name}: median ${q["50"]}, middle 50% ${q["25"]}–${q["75"]}, 80% ${q["10"]}–${q["90"]}`}</title>
                    </svg>
                    <span className="ladder-v">{Math.round(q["50"])}</span>
                  </div>
                );
              })}
              <div className="cs-k" style={{ margin: "14px 0 6px" }}>Wickets</div>
              {bowls.map((p) => <BowlRow key={p.id} p={p} color={COLORS[k]} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BowlRow({ p, color }: { p: PlayerRow; color: string }) {
  const pw = p.bowling!.p_wickets ?? {};
  const vals = ["1", "2", "3"].map((k) => pw[k] ?? 0);
  return (
    <div className="ladder-row">
      <span className="ladder-name">{p.name}</span>
      <span className="ladder-dots">
        {vals.map((v, i) => (
          <span key={i} title={`${i + 1}${i === 2 ? "+" : "+"} wickets: ${(100 * v).toFixed(0)}%`}>
            <i style={{ background: color, opacity: 0.25 + 0.75 * v, width: `${8 + 28 * v}px` }} />{(100 * v).toFixed(0)}%
          </span>
        ))}
      </span>
      <span className="ladder-v">{(p.bowling!.wickets.mean ?? 0).toFixed(1)}</span>
    </div>
  );
}

/** The chase, from the chasing side: chance of getting there for each target, with the required rate under it. */
export function ChaseCurve({ s }: { s: Summary }) {
  const c = s.result.win_by_first_innings ?? [];
  if (c.length < 3) return null;
  const overs = s.meta.rules.overs;
  const W = 640, H = 250, pad = { l: 40, r: 12, t: 12, b: 40 };
  const lo = c[0].from + 1, hi = c[c.length - 1].to + 1;
  const sx = (x: number) => pad.l + ((x - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const sy = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const pts = c.map((r) => ({ target: Math.round((r.from + r.to) / 2) + 1, p: 1 - r.p_win, n: r.n, from: r.from, to: r.to }));
  const even = pts.find((r) => r.p < 0.5);
  return (
    <div className="card anim-rise">
      <h3>Chase curve</h3>
      <p className="small muted">Chance the chasing side gets there, by target, with the required run rate underneath.
        {even ? <> Below about <b>{even.target}</b> the chase is favoured.</> : null}</p>
      <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} label="chase success by target" columns={pts.map((r): Column => ({
        x0: sx(r.from + 1), x1: sx(r.to + 1), title: `Target ${r.from + 1}–${r.to}`,
        rows: [{ label: "Chase succeeds", value: `${(100 * r.p).toFixed(0)}%` },
               { label: "Required rate", value: `${(r.target / overs).toFixed(2)} an over` }],
      }))}>
        <g className="grid">{[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(f)} y2={sy(f)} />)}</g>
        {[0, 0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(f) + 4} textAnchor="end">{100 * f}%</text>)}
        <line x1={pad.l} x2={W - pad.r} y1={sy(0.5)} y2={sy(0.5)} stroke="var(--cs-ink-3)" strokeDasharray="4 4" />
        <polygon className="anim-fade" fill="var(--team-b)" fillOpacity=".10"
                 points={[`${sx(pts[0].target)},${sy(0)}`, ...pts.map((r) => `${sx(r.target)},${sy(r.p)}`), `${sx(pts[pts.length - 1].target)},${sy(0)}`].join(" ")} />
        <polyline className="anim-draw" pathLength={1} fill="none" stroke="var(--team-b)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"
                  points={pts.map((r) => `${sx(r.target)},${sy(r.p)}`).join(" ")} />
        {pts.filter((_, i) => i % 2 === 0).map((r) => (
          <g key={r.target}>
            <text x={sx(r.target)} y={H - 22} textAnchor="middle">{r.target}</text>
            <text x={sx(r.target)} y={H - 8} textAnchor="middle" className="chart-strong">{(r.target / overs).toFixed(1)}</text>
          </g>
        ))}
      </ChartFrame>
      <p className="small muted" style={{ margin: "6px 0 0" }}>Top row: target. Bottom row: required runs an over.</p>
    </div>
  );
}

/** Side-by-side expected score at the usual checkpoints (after 6 / 10 / 15 overs in T20). */
export function Checkpoints({ s }: { s: Summary }) {
  const overs = s.meta.rules.overs;
  const marks = overs <= 20 ? [s.meta.rules.pp, Math.round(overs / 2), Math.round(overs * 0.75), overs] : [10, 25, 40, overs];
  const fans = s.teams.map((t) => t.batting.fan ?? []);
  if (!fans[0].length) return null;
  const row = (k: number, o: number) => fans[k].find((r) => r.over === o);
  return (
    <div className="card anim-rise">
      <h3>Score checkpoints</h3>
      <p className="small muted">Expected score and wickets after each stage: median, with the middle 80% of simulations.</p>
      <div className="table-wrap"><table className="checkpoints">
        <thead><tr><th>After</th>{s.teams.map((t, k) => <th key={t.name} className="num" style={{ color: COLORS[k] }}>{t.name}</th>)}</tr></thead>
        <tbody>{marks.map((o) => (
          <tr key={o}><td>{o === overs ? "Innings" : `${o} overs`}</td>
            {s.teams.map((t, k) => {
              const r = row(k, o);
              return <td key={t.name} className="num">{r ? <><b>{r.q50}/{Math.round(r.wickets)}</b> <span className="muted">({r.q10}–{r.q90})</span></> : "—"}</td>;
            })}</tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
