"use client";
// Small, dependency-free SVG charts, animated: bars grow, cells fill in over by over, lines draw,
// and everything glides to new values when the data changes (Scenario Lab). Colours are CSS variables.
import { useState } from "react";
import { pct } from "@/lib/format";
import { useCountUp, useMounted } from "@/lib/motion";

export function Num({ value, digits = 0, suffix = "" }: { value: number | null | undefined; digits?: number; suffix?: string }) {
  const v = useCountUp(value ?? 0);
  if (value === null || value === undefined || Number.isNaN(value)) return <>—</>;
  return <>{digits === 0 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(digits)}{suffix}</>;
}

export function Pct({ p, digits = 0 }: { p: number | null | undefined; digits?: number }) {
  const v = useCountUp(p ?? 0);
  if (p === null || p === undefined) return <>—</>;
  return <>{(100 * v).toFixed(digits)}%</>;
}

export function WinBar({ a, b, pa, pb, big = false }: { a: string; b: string; pa: number; pb: number; big?: boolean }) {
  const on = useMounted();
  const tie = Math.max(0, 1 - pa - pb);
  const wa = on ? pa : 0.5 - tie / 2, wb = on ? pb : 0.5 - tie / 2;
  return (
    <div className={`winbar${big ? " big" : ""}`} role="img" aria-label={`${a} ${pct(pa)}, ${b} ${pct(pb)}`}>
      <div style={{ width: `${100 * wa}%`, background: "var(--team-a)" }} />
      {tie > 0.001 && <div style={{ width: `${100 * tie}%`, background: "var(--cs-line)" }} />}
      <div style={{ width: `${100 * wb}%`, background: "var(--team-b)" }} />
    </div>
  );
}

type Series = { name: string; color: string; points: { x: number; p: number }[] };

// ── hover layer ────────────────────────────────────────────────────────────────────────────────────────────────
// Every chart is split into columns (a score bin, an over, a band); hovering, tapping or focusing a column shows a
// highlight and an HTML tooltip with the exact values. Hit areas are full-height, so they're bigger than the marks.

export type TipRow = { color?: string; label: React.ReactNode; value: React.ReactNode };
export type Column = { x0: number; x1: number; title: React.ReactNode; rows: TipRow[] };

export function ChartFrame({ W, H, top = 0, bottom, columns, label, children, minWidth }: {
  W: number; H: number; top?: number; bottom: number; columns: Column[]; label: string; children: React.ReactNode; minWidth?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const c = hover === null ? null : columns[hover];
  const mid = c ? (100 * (c.x0 + c.x1)) / 2 / W : 0;
  return (
    <div className={`chart-wrap${minWidth ? " chart-scroll" : ""}`} onMouseLeave={() => setHover(null)}>
      <div style={{ position: "relative", minWidth }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
          {c && <rect className="hover-band" x={c.x0} y={top} width={Math.max(c.x1 - c.x0, 1)} height={bottom - top} />}
          {children}
          {columns.map((col, i) => (
            <rect key={i} x={col.x0} y={0} width={Math.max(col.x1 - col.x0, 1)} height={H} fill="transparent" tabIndex={-1}
                  onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} onFocus={() => setHover(i)} />
          ))}
        </svg>
        {c && (
          <div className="chart-tip" role="status" style={{ left: `${Math.min(Math.max(mid, 14), 86)}%` }}>
            <div className="chart-tip-title">{c.title}</div>
            {c.rows.map((r, i) => (
              <div key={i} className="chart-tip-row">
                {r.color && <i style={{ background: r.color }} />}<span>{r.label}</span><b>{r.value}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A bar that grows from the baseline and glides between values. */
function Bar({ x, y0, w, h, frac, color, delay, dim = false }: { x: number; y0: number; w: number; h: number; frac: number; color: string; delay: number; dim?: boolean }) {
  const on = useMounted();
  return (
    <rect className="anim-bar" x={x} y={y0 - h} width={Math.max(w, 1)} height={h} fill={color} rx={1.5} fillOpacity={dim ? 0.35 : 1}
          style={{ transform: `scaleY(${on ? Math.max(frac, 0.002) : 0})`, transitionDelay: `${delay}ms` }} />
  );
}

export type Marker = { color: string; name: string; q10: number; q50: number; q90: number; mean?: number };

/** Score distributions: bars by bin, or the chance of reaching each total; markers show each side's median, mean and
 *  80% range so the point estimate is visible inside the spread. */
export function Histogram({ series, width = 10, height = 220, xLabel, markers, mode = "dist", W = 640, compact = false }: {
  series: Series[]; width?: number; height?: number; xLabel?: string; markers?: Marker[]; mode?: "dist" | "cdf"; W?: number; compact?: boolean;
}) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  if (!xs.length) return null;
  const lo = Math.min(...xs), hi = Math.max(...xs) + width;
  const nb = Math.round((hi - lo) / width);
  const bins = Array.from({ length: nb }, (_, i) => lo + i * width);
  const at = (s: Series, x: number) => s.points.find((p) => p.x === x)?.p ?? 0;
  const reach = series.map((s) => bins.map((b) => s.points.filter((p) => p.x >= b).reduce((a, p) => a + p.p, 0)));
  const pmax = mode === "cdf" ? 1 : Math.max(...series.flatMap((s) => s.points.map((p) => p.p)), 0.01);
  const mk = markers ?? [];
  const H = height + mk.length * 14, pad = { l: 36, r: 8, t: 8 + mk.length * 14, b: 28 };
  const sx = (x: number) => pad.l + ((x - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const sy = (p: number) => H - pad.b - (p / pmax) * (H - pad.t - pad.b);
  const full = H - pad.t - pad.b;
  const bw = (sx(lo + width) - sx(lo)) / series.length;
  const ticks = bins.concat(hi).filter((_, i) => i % 2 === 0);
  const columns: Column[] = bins.map((b, i) => ({
    x0: sx(b), x1: sx(b + width), title: `${b}–${b + width - 1} runs`,
    rows: series.map((s, k) => ({ color: s.color, label: s.name,
      value: mode === "cdf" ? `${pct(reach[k][i], 0)} reach ${b}+` : pct(at(s, b), 1) })),
  }));
  return (
    <>
    <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} columns={columns} label={xLabel || "distribution"}>
      <g className="grid">{[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(pmax * f)} y2={sy(pmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(pmax * f) + 4} textAnchor="end">{pct(pmax * f)}</text>)}
      {mk.map((m, k) => (                                      // 80% range bands behind the bars
        <rect key={`band-${k}`} x={sx(m.q10)} y={pad.t} width={Math.max(sx(m.q90) - sx(m.q10), 1)} height={full}
              fill={m.color} fillOpacity={0.07} />
      ))}
      {mode === "dist" ? series.map((s, k) => s.points.map((p, i) => (
        <Bar key={`${k}-${p.x}`} x={sx(p.x) + k * bw + 1} y0={H - pad.b} w={bw - 2} h={full} frac={p.p / pmax}
             color={s.color} delay={i * 25 + k * 60} />
      ))) : series.map((s, k) => (
        <polyline key={k} className="anim-draw" pathLength={1} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke"
                  points={bins.map((b, i) => `${sx(b)},${sy(reach[k][i])}`).join(" ")} />
      ))}
      {mk.map((m, k) => {                                      // median line + mean tick + range whiskers on top
        const y = 6 + k * 14;
        return (
          <g key={`m-${k}`}>
            <line x1={sx(m.q10)} x2={sx(m.q90)} y1={y + 5} y2={y + 5} stroke={m.color} strokeWidth={2} />
            <line x1={sx(m.q10)} x2={sx(m.q10)} y1={y + 1} y2={y + 9} stroke={m.color} strokeWidth={2} />
            <line x1={sx(m.q90)} x2={sx(m.q90)} y1={y + 1} y2={y + 9} stroke={m.color} strokeWidth={2} />
            <line x1={sx(m.q50)} x2={sx(m.q50)} y1={y} y2={H - pad.b} stroke={m.color} strokeWidth={2} strokeDasharray="5 3" />
            {m.mean != null && <circle cx={sx(m.mean)} cy={y + 5} r={4} fill="var(--cs-bg)" stroke={m.color} strokeWidth={2} />}
          </g>
        );
      })}
      {ticks.map((t) => <text key={t} x={sx(t)} y={H - 8} textAnchor="middle">{t}</text>)}
    </ChartFrame>
    {mk.length > 0 && (
      <div className="chart-caption">{mk.map((m) => (
        <span key={m.name}><i style={{ background: m.color }} />{compact ? "" : `${m.name}: `}median <b>{Math.round(m.q50)}</b>
          {!compact && m.mean != null && <>, mean <b>{Math.round(m.mean)}</b></>}, 80% <b>{Math.round(m.q10)}–{Math.round(m.q90)}</b></span>
      ))}</div>
    )}
    </>
  );
}

/** Bars per over (runs or wicket chance), with phase separators, an optional 3-over rolling average per side and an
 *  optional match-average reference line. */
export function OverBars({ series, max, format = (v: number) => pct(v), height = 180, phases, rolling = false, average = false, unit, W = 640 }: {
  series: { name: string; color: string; values: number[] }[]; max?: number; format?: (v: number) => string; height?: number;
  phases?: { pp: number; overs: number }; rolling?: boolean; average?: boolean; unit?: string; W?: number;
}) {
  const n = Math.max(...series.map((s) => s.values.length));
  const vmax = max ?? Math.max(...series.flatMap((s) => s.values), 0.01) * 1.08;
  const H = height, pad = { l: 36, r: 8, t: phases ? 20 : 8, b: 24 };
  const cw = (W - pad.l - pad.r) / n, bw = cw / series.length;
  const full = H - pad.t - pad.b;
  const sy = (v: number) => H - pad.b - (v / vmax) * full;
  const step = n > 25 ? 5 : n > 12 ? 2 : 1;
  const avg = series.flatMap((s) => s.values).reduce((a, b) => a + b, 0) / Math.max(series.reduce((a, s) => a + s.values.length, 0), 1);
  const roll = series.map((s) => s.values.map((_, i) => {
    const w = s.values.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((a, b) => a + b, 0) / w.length;
  }));
  const death = phases ? Math.max(phases.pp, Math.round(phases.overs * 0.8)) : 0;
  const cuts = phases ? [[0, phases.pp, "Powerplay"], [phases.pp, death, "Middle"], [death, n, "Death"]] as [number, number, string][] : [];
  const columns: Column[] = Array.from({ length: n }, (_, o) => ({
    x0: pad.l + o * cw, x1: pad.l + (o + 1) * cw, title: `Over ${o + 1}`,
    rows: series.map((s) => ({ color: s.color, label: s.name, value: `${format(s.values[o] ?? 0)}${unit ? ` ${unit}` : ""}` })),
  }));
  return (
    <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} columns={columns} label="per over">
      <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(vmax * f)} y2={sy(vmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(vmax * f) + 4} textAnchor="end">{format(vmax * f)}</text>)}
      {cuts.map(([a, b, name], i) => (
        <g key={name}>
          {i > 0 && <line x1={pad.l + a * cw} x2={pad.l + a * cw} y1={4} y2={H - pad.b} stroke="var(--cs-ink-3)" strokeDasharray="3 3" />}
          <text x={pad.l + ((a + b) / 2) * cw} y={13} textAnchor="middle" className="chart-strong">{name}</text>
        </g>
      ))}
      {series.map((s, k) => s.values.map((v, o) => (
        <Bar key={`${k}-${o}`} x={pad.l + o * cw + k * bw + 1} y0={H - pad.b} w={bw - 2} h={full} frac={v / vmax}
             color={s.color} delay={o * 22} dim={rolling} />
      )))}
      {rolling && roll.map((r, k) => (
        <polyline key={`r-${k}`} className="anim-draw" pathLength={1} fill="none" stroke={series[k].color} strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke" points={r.map((v, o) => `${pad.l + o * cw + cw / 2},${sy(v)}`).join(" ")} />
      ))}
      {average && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={sy(avg)} y2={sy(avg)} stroke="var(--cs-ink-2)" strokeDasharray="6 4" />
          <text x={W - pad.r} y={sy(avg) - 5} textAnchor="end" className="chart-strong">average {format(avg)}</text>
        </g>
      )}
      {Array.from({ length: n }, (_, o) => o).filter((o) => o % step === 0).map((o) => (
        <text key={o} x={pad.l + o * cw + cw / 2} y={H - 6} textAnchor="middle">{o + 1}</text>
      ))}
    </ChartFrame>
  );
}

/** Wicket number × over heatmap, filling in over by over. The likeliest over for each wicket is outlined and numbered;
 *  on narrow screens the grid scrolls sideways instead of squeezing the cells. */
export function WicketHeatmap({ rows, color, overs, cell = 22 }: { rows: { label: string; values: number[] }[]; color: string; overs: number; cell?: number }) {
  const on = useMounted();
  const vmax = Math.max(...rows.flatMap((r) => r.values), 1e-6);
  const W = 640, pad = { l: 54, r: 6, t: 4, b: 22 }, ch = cell;
  const H = pad.t + rows.length * ch + pad.b;
  const cw = (W - pad.l - pad.r) / overs;
  const step = overs > 25 ? 5 : overs > 12 ? 2 : 1;
  const peak = rows.map((r) => r.values.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0));
  const columns: Column[] = Array.from({ length: overs }, (_, o) => ({
    x0: pad.l + o * cw, x1: pad.l + (o + 1) * cw, title: `Over ${o + 1}`,
    rows: rows.map((r, i) => ({ label: r.label, value: <>{pct(r.values[o] ?? 0, 1)}{peak[i] === o ? " · likeliest" : ""}</> })),
  }));
  return (
    <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} columns={columns} label="wicket timing heatmap" minWidth={overs > 20 ? 640 : 520}>
      {rows.map((r, i) => (
        <g key={r.label}>
          <text x={pad.l - 8} y={pad.t + i * ch + ch * 0.68} textAnchor="end">{r.label}</text>
          {r.values.map((v, o) => (
            <rect key={o} className="anim-cell" x={pad.l + o * cw} y={pad.t + i * ch} width={Math.max(cw - 1.5, 1)} height={ch - 2} fill={color} rx={1.5}
                  style={{ opacity: on ? 0.05 + 0.95 * (v / vmax) : 0, transitionDelay: `${o * 35 + i * 15}ms` }} />
          ))}
          <rect x={pad.l + peak[i] * cw - 0.5} y={pad.t + i * ch - 0.5} width={Math.max(cw - 0.5, 1)} height={ch - 1} fill="none"
                stroke="var(--cs-ink)" strokeWidth={1.5} rx={2} />
          {ch >= 18 && cw >= 14 && (
            <text x={pad.l + peak[i] * cw + cw / 2 - 0.75} y={pad.t + i * ch + ch * 0.66} textAnchor="middle" className="heat-peak"
                  style={{ fill: 0.05 + 0.95 * (r.values[peak[i]] / vmax) > 0.55 ? "var(--cs-bg)" : "var(--cs-ink)" }}>{peak[i] + 1}</text>
          )}
        </g>
      ))}
      {Array.from({ length: overs }, (_, o) => o).filter((o) => o % step === 0).map((o) => (
        <text key={o} x={pad.l + o * cw + cw / 2} y={H - 6} textAnchor="middle">{o + 1}</text>
      ))}
    </ChartFrame>
  );
}

/** p10 · median · p90 on a small track, for stat tiles. */
export function RangeStrip({ q10, q50, q90, color, lo, hi }: { q10: number; q50: number; q90: number; color: string; lo: number; hi: number }) {
  const W = 120, H = 16, x = (v: number) => 4 + ((v - lo) / Math.max(hi - lo, 1)) * (W - 8);
  return (
    <svg className="range-strip" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`10th ${q10}, median ${q50}, 90th ${q90}`}>
      <line x1={4} x2={W - 4} y1={8} y2={8} stroke="var(--cs-line)" strokeWidth={2} strokeLinecap="round" />
      <line x1={x(q10)} x2={x(q90)} y1={8} y2={8} stroke={color} strokeWidth={4} strokeLinecap="round" strokeOpacity={0.45} />
      <circle cx={x(q50)} cy={8} r={4.5} fill={color} stroke="var(--cs-bg)" strokeWidth={1.5} />
    </svg>
  );
}

export function P({ p, width = 60 }: { p: number | null | undefined; width?: number }) {
  const on = useMounted();
  return (
    <span><span className="pbar" style={{ width: Math.max(1, on ? (p ?? 0) * width : 0) }} /><Pct p={p} /></span>
  );
}
