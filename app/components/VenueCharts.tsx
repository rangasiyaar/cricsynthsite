"use client";
// Charts for the Venue tab, drawn with the same frame, hover tooltips and bar animation as the other match-centre tabs.
import { ChartFrame, type Column } from "@/components/charts";
import { useEffect, useState } from "react";
import { useMounted } from "@/lib/motion";

const HERE = "var(--cs-steel)", ALL = "var(--cs-ink-3)";

/** Drawing width for a full-width chart: wide on desktop, narrower on phones so labels stay readable. */
export function useChartWidth(wide = 1100, narrow = 380) {
  const [w, setW] = useState(wide);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const on = () => setW(m.matches ? narrow : wide);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [wide, narrow]);
  return w;
}

function Bar({ x, y0, w, h, frac, color, delay, dim = false }: { x: number; y0: number; w: number; h: number; frac: number; color: string; delay: number; dim?: boolean }) {
  const on = useMounted();
  return (
    <rect className="anim-bar" x={x} y={y0 - h} width={Math.max(w, 1)} height={h} fill={color} rx={1.5} fillOpacity={dim ? 0.35 : 1}
          style={{ transform: `scaleY(${on ? Math.max(frac, 0.002) : 0})`, transitionDelay: `${delay}ms` }} />
  );
}

/** Grouped bars: one metric per phase, this ground against every ground. */
export function PhaseChart({ rows, unit, digits = 2, W: given, height = 230 }: {
  rows: { label: string; here: number; all?: number }[]; unit: string; digits?: number; W?: number; height?: number;
}) {
  const auto = useChartWidth(), W = given ?? auto;
  const vmax = Math.max(...rows.flatMap((r) => [r.here, r.all ?? 0]), 0.01) * 1.12;
  const pad = { l: 36, r: 8, t: 10, b: 26 }, H = height, full = H - pad.t - pad.b;
  const cw = (W - pad.l - pad.r) / rows.length, bw = Math.min(cw / 3, 90);
  const sy = (v: number) => H - pad.b - (v / vmax) * full;
  const fmt = (v: number) => v.toFixed(digits);
  const columns: Column[] = rows.map((r, i) => ({
    x0: pad.l + i * cw, x1: pad.l + (i + 1) * cw, title: r.label,
    rows: [{ color: HERE, label: "This ground", value: `${fmt(r.here)} ${unit}` },
           ...(r.all != null ? [{ color: ALL, label: "All grounds", value: `${fmt(r.all)} ${unit}` }] : [])],
  }));
  return (
    <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} columns={columns} label={`${unit} by phase`}>
      <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(vmax * f)} y2={sy(vmax * f)} />)}</g>
      {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(vmax * f) + 4} textAnchor="end">{(vmax * f).toFixed(digits > 1 ? 1 : 0)}</text>)}
      {rows.map((r, i) => {
        const x = pad.l + i * cw + cw / 2;
        return (
          <g key={r.label}>
            <Bar x={x - bw - 2} y0={H - pad.b} w={bw} h={full} frac={r.here / vmax} color={HERE} delay={i * 80} />
            {r.all != null && <Bar x={x + 2} y0={H - pad.b} w={bw} h={full} frac={r.all / vmax} color={ALL} delay={i * 80 + 40} dim />}
            <text x={x - bw / 2 - 2} y={sy(r.here) - 6} textAnchor="middle" className="chart-strong">{fmt(r.here)}</text>
            <text x={x} y={H - 8} textAnchor="middle">{r.label}</text>
          </g>
        );
      })}
    </ChartFrame>
  );
}

/** The last few first-innings totals here, oldest first: dark when the total was defended, light when it was chased. */
export function RecentChart({ rows, median, W: given, height = 230 }: {
  rows: { label: string; runs: number; team: string; defended: boolean | null }[]; median?: number | null; W?: number; height?: number;
}) {
  const auto = useChartWidth(), W = given ?? auto;
  if (!rows.length) return null;
  const vmax = Math.max(...rows.map((r) => r.runs), median ?? 0, 1) * 1.12;
  const pad = { l: 36, r: 96, t: 22, b: 26 }, H = height, full = H - pad.t - pad.b;    // right margin holds the median label
  const cw = (W - pad.l - pad.r) / rows.length, bw = Math.min(cw * 0.6, 56);
  const sy = (v: number) => H - pad.b - (v / vmax) * full;
  const columns: Column[] = rows.map((r, i) => ({
    x0: pad.l + i * cw, x1: pad.l + (i + 1) * cw, title: r.label,
    rows: [{ color: r.defended ? HERE : ALL, label: r.team, value: `${r.runs}` },
           { label: "Result", value: r.defended == null ? "No result" : r.defended ? "Defended" : "Chased down" }],
  }));
  return (
    <>
      <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} columns={columns} label="recent first-innings totals">
        <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(vmax * f)} y2={sy(vmax * f)} />)}</g>
        {[0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(vmax * f) + 4} textAnchor="end">{Math.round(vmax * f)}</text>)}
        {rows.map((r, i) => {
          const x = pad.l + i * cw + (cw - bw) / 2;
          return (
            <g key={i}>
              <Bar x={x} y0={H - pad.b} w={bw} h={full} frac={r.runs / vmax} color={r.defended ? HERE : ALL} delay={i * 60} dim={!r.defended} />
              <text x={x + bw / 2} y={sy(r.runs) - 6} textAnchor="middle" className="chart-strong">{r.runs}</text>
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{r.label}</text>
            </g>
          );
        })}
        {median != null && (
          <g>
            <line x1={pad.l} x2={W - pad.r + 8} y1={sy(median)} y2={sy(median)} stroke="var(--cs-ink-2)" strokeDasharray="6 4" />
            <text x={W - pad.r + 12} y={sy(median) + 4} textAnchor="start" className="chart-strong">median {Math.round(median)}</text>
          </g>
        )}
      </ChartFrame>
      <div className="chart-caption"><span><i style={{ background: HERE }} />Total defended</span>
        <span><i style={{ background: ALL, opacity: 0.35 }} />Total chased down</span></div>
    </>
  );
}

/** A two-part bar with labels on each end (batting first v chasing, pace v spin). */
export function SplitBar({ left, right, p, colors = [HERE, ALL] }: { left: string; right: string; p: number; colors?: [string, string] }) {
  const on = useMounted();
  const w = on ? p : 0.5;
  return (
    <div className="vi-split">
      <div className="vi-split-labels"><span><b>{Math.round(100 * p)}%</b> {left}</span><span>{right} <b>{Math.round(100 * (1 - p))}%</b></span></div>
      <div className="winbar" role="img" aria-label={`${left} ${Math.round(100 * p)}%, ${right} ${Math.round(100 * (1 - p))}%`}>
        <div style={{ width: `${100 * w}%`, background: colors[0] }} />
        <div style={{ width: `${100 * (1 - w)}%`, background: colors[1], opacity: 0.45 }} />
      </div>
    </div>
  );
}
