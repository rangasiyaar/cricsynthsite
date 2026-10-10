"use client";
// Small, dependency-free SVG charts, animated: bars grow, cells fill in over by over, lines draw,
// and everything glides to new values when the data changes (Scenario Lab). Colours are CSS variables.
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

/** A bar that grows from the baseline and glides between values. */
function Bar({ x, y0, w, h, frac, color, delay, title }: { x: number; y0: number; w: number; h: number; frac: number; color: string; delay: number; title: string }) {
  const on = useMounted();
  return (
    <rect className="anim-bar" x={x} y={y0 - h} width={Math.max(w, 1)} height={h} fill={color}
          style={{ transform: `scaleY(${on ? Math.max(frac, 0.002) : 0})`, transitionDelay: `${delay}ms` }}>
      <title>{title}</title>
    </rect>
  );
}

/** Overlaid histograms (score distributions). */
export function Histogram({ series, width = 10, height = 220, xLabel }: { series: Series[]; width?: number; height?: number; xLabel?: string }) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  if (!xs.length) return null;
  const lo = Math.min(...xs), hi = Math.max(...xs) + width;
  const pmax = Math.max(...series.flatMap((s) => s.points.map((p) => p.p)), 0.01);
  const W = 640, H = height, pad = { l: 36, r: 8, t: 8, b: 28 };
  const sx = (x: number) => pad.l + ((x - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const sy = (p: number) => H - pad.b - (p / pmax) * (H - pad.t - pad.b);
  const full = H - pad.t - pad.b;
  const bw = (sx(lo + width) - sx(lo)) / series.length;
  const ticks = Array.from({ length: Math.floor((hi - lo) / width) + 1 }, (_, i) => lo + i * width).filter((_, i) => i % 2 === 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={xLabel || "distribution"}>
      <g className="grid">{[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(pmax * f)} y2={sy(pmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(pmax * f) + 4} textAnchor="end">{pct(pmax * f)}</text>)}
      {series.map((s, k) => s.points.map((p, i) => (
        <Bar key={`${k}-${p.x}`} x={sx(p.x) + k * bw + 1} y0={H - pad.b} w={bw - 2} h={full} frac={p.p / pmax}
             color={s.color} delay={i * 25 + k * 60} title={`${s.name}: ${p.x}–${p.x + width - 1} · ${pct(p.p, 1)}`} />
      )))}
      {ticks.map((t) => <text key={t} x={sx(t)} y={H - 8} textAnchor="middle">{t}</text>)}
    </svg>
  );
}

/** Bars per over (P(wicket) or runs), one or two series. */
export function OverBars({ series, max, format = (v: number) => pct(v), height = 180 }: {
  series: { name: string; color: string; values: number[] }[]; max?: number; format?: (v: number) => string; height?: number;
}) {
  const n = Math.max(...series.map((s) => s.values.length));
  const vmax = max ?? Math.max(...series.flatMap((s) => s.values), 0.01);
  const W = 640, H = height, pad = { l: 36, r: 8, t: 8, b: 24 };
  const cw = (W - pad.l - pad.r) / n, bw = cw / series.length;
  const full = H - pad.t - pad.b;
  const sy = (v: number) => H - pad.b - (v / vmax) * full;
  const step = n > 25 ? 5 : n > 12 ? 2 : 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="per over">
      <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(vmax * f)} y2={sy(vmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(vmax * f) + 4} textAnchor="end">{format(vmax * f)}</text>)}
      {series.map((s, k) => s.values.map((v, o) => (
        <Bar key={`${k}-${o}`} x={pad.l + o * cw + k * bw + 1} y0={H - pad.b} w={bw - 2} h={full} frac={v / vmax}
             color={s.color} delay={o * 22} title={`${s.name} · over ${o + 1}: ${format(v)}`} />
      )))}
      {Array.from({ length: n }, (_, o) => o).filter((o) => o % step === 0).map((o) => (
        <text key={o} x={pad.l + o * cw + cw / 2} y={H - 6} textAnchor="middle">{o + 1}</text>
      ))}
    </svg>
  );
}

/** Wicket number × over heatmap, filling in over by over. */
export function WicketHeatmap({ rows, color, overs }: { rows: { label: string; values: number[] }[]; color: string; overs: number }) {
  const on = useMounted();
  const vmax = Math.max(...rows.flatMap((r) => r.values), 1e-6);
  const W = 640, pad = { l: 54, r: 6, t: 4, b: 22 }, ch = 22;
  const H = pad.t + rows.length * ch + pad.b;
  const cw = (W - pad.l - pad.r) / overs;
  const step = overs > 25 ? 5 : overs > 12 ? 2 : 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="wicket timing heatmap">
      {rows.map((r, i) => (
        <g key={r.label}>
          <text x={pad.l - 8} y={pad.t + i * ch + ch * 0.68} textAnchor="end">{r.label}</text>
          {r.values.map((v, o) => (
            <rect key={o} className="anim-cell" x={pad.l + o * cw} y={pad.t + i * ch} width={Math.max(cw - 1.5, 1)} height={ch - 2} fill={color}
                  style={{ opacity: on ? 0.05 + 0.95 * (v / vmax) : 0, transitionDelay: `${o * 35 + i * 15}ms` }}>
              <title>{`${r.label} in over ${o + 1}: ${pct(v, 1)}`}</title>
            </rect>
          ))}
        </g>
      ))}
      {Array.from({ length: overs }, (_, o) => o).filter((o) => o % step === 0).map((o) => (
        <text key={o} x={pad.l + o * cw + cw / 2} y={H - 6} textAnchor="middle">{o + 1}</text>
      ))}
    </svg>
  );
}

export function P({ p, width = 60 }: { p: number | null | undefined; width?: number }) {
  const on = useMounted();
  return (
    <span><span className="pbar" style={{ width: Math.max(1, on ? (p ?? 0) * width : 0) }} /><Pct p={p} /></span>
  );
}
