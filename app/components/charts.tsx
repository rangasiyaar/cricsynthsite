// Small, dependency-free SVG charts. Colours come from CSS variables so both themes work.
import { pct } from "@/lib/format";

export function WinBar({ a, b, pa, pb, big = false }: { a: string; b: string; pa: number; pb: number; big?: boolean }) {
  const tie = Math.max(0, 1 - pa - pb);
  return (
    <div>
      <div className={`winbar${big ? " big" : ""}`} role="img" aria-label={`${a} ${pct(pa)}, ${b} ${pct(pb)}`}>
        <div style={{ width: `${100 * pa}%`, background: "var(--team-a)" }} />
        {tie > 0.001 && <div style={{ width: `${100 * tie}%`, background: "var(--line)" }} />}
        <div style={{ width: `${100 * pb}%`, background: "var(--team-b)" }} />
      </div>
    </div>
  );
}

type Series = { name: string; color: string; points: { x: number; p: number }[] };

/** Overlaid histograms (score distributions). */
export function Histogram({ series, width = 10, height = 220, xLabel }: { series: Series[]; width?: number; height?: number; xLabel?: string }) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  if (!xs.length) return null;
  const lo = Math.min(...xs), hi = Math.max(...xs) + width;
  const pmax = Math.max(...series.flatMap((s) => s.points.map((p) => p.p)), 0.01);
  const W = 640, H = height, pad = { l: 36, r: 8, t: 8, b: 28 };
  const sx = (x: number) => pad.l + ((x - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const sy = (p: number) => H - pad.b - (p / pmax) * (H - pad.t - pad.b);
  const bw = (sx(lo + width) - sx(lo)) / series.length;
  const ticks = Array.from({ length: Math.floor((hi - lo) / width) + 1 }, (_, i) => lo + i * width).filter((_, i) => i % 2 === 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={xLabel || "distribution"}>
      <g className="grid">{[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(pmax * f)} y2={sy(pmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(pmax * f) + 4} textAnchor="end">{pct(pmax * f)}</text>)}
      {series.map((s, k) => s.points.map((p) => (
        <rect key={`${k}-${p.x}`} x={sx(p.x) + k * bw + 1} y={sy(p.p)} width={Math.max(bw - 2, 1)} height={H - pad.b - sy(p.p)} fill={s.color} opacity={0.9}>
          <title>{`${s.name}: ${p.x}–${p.x + width - 1} · ${pct(p.p, 1)}`}</title>
        </rect>
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
  const sy = (v: number) => H - pad.b - (v / vmax) * (H - pad.t - pad.b);
  const step = n > 25 ? 5 : n > 12 ? 2 : 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="per over">
      <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(vmax * f)} y2={sy(vmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(vmax * f) + 4} textAnchor="end">{format(vmax * f)}</text>)}
      {series.map((s, k) => s.values.map((v, o) => (
        <rect key={`${k}-${o}`} x={pad.l + o * cw + k * bw + 1} y={sy(v)} width={Math.max(bw - 2, 1)} height={H - pad.b - sy(v)} fill={s.color}>
          <title>{`${s.name} · over ${o + 1}: ${format(v)}`}</title>
        </rect>
      )))}
      {Array.from({ length: n }, (_, o) => o).filter((o) => o % step === 0).map((o) => (
        <text key={o} x={pad.l + o * cw + cw / 2} y={H - 6} textAnchor="middle">{o + 1}</text>
      ))}
    </svg>
  );
}

/** Wicket number × over heatmap: when does each wicket fall? */
export function WicketHeatmap({ rows, color, overs }: { rows: { label: string; values: number[] }[]; color: string; overs: number }) {
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
            <rect key={o} x={pad.l + o * cw} y={pad.t + i * ch} width={Math.max(cw - 1.5, 1)} height={ch - 2} fill={color}
                  fillOpacity={0.05 + 0.95 * (v / vmax)}>
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

/** Pattern Lab hazard curve: O/E by value, 1.0 = normal. */
export function Curve({ points, label }: { points: { value: number; o_e: number | null; balls: number }[]; label: string }) {
  const pts = points.filter((p) => p.o_e !== null && p.balls >= 2000) as { value: number; o_e: number; balls: number }[];
  if (pts.length < 2) return null;
  const W = 320, H = 120, pad = { l: 30, r: 6, t: 6, b: 20 };
  const xs = pts.map((p) => p.value), lo = Math.min(...xs), hi = Math.max(...xs);
  const ys = pts.map((p) => p.o_e), ymin = Math.min(0.8, ...ys), ymax = Math.max(1.2, ...ys);
  const sx = (x: number) => pad.l + ((x - lo) / Math.max(hi - lo, 1)) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - ((y - ymin) / (ymax - ymin)) * (H - pad.t - pad.b);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      <line x1={pad.l} x2={W - pad.r} y1={sy(1)} y2={sy(1)} stroke="var(--line)" strokeDasharray="4 3" />
      <text x={pad.l - 4} y={sy(1) + 4} textAnchor="end">1.0</text>
      <polyline fill="none" stroke="var(--steel-700)" strokeWidth={2} points={pts.map((p) => `${sx(p.value)},${sy(p.o_e)}`).join(" ")} />
      {pts.map((p) => <circle key={p.value} cx={sx(p.value)} cy={sy(p.o_e)} r={2.5} fill="var(--steel-700)"><title>{`${p.value}: ${p.o_e.toFixed(2)}×`}</title></circle>)}
      <text x={sx(lo)} y={H - 4}>{lo}</text>
      <text x={sx(hi)} y={H - 4} textAnchor="end">{hi}</text>
    </svg>
  );
}

export function P({ p, width = 60 }: { p: number | null | undefined; width?: number }) {
  return (
    <span><span className="pbar" style={{ width: Math.max(1, (p ?? 0) * width) }} />{pct(p)}</span>
  );
}
