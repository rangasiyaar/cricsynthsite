"use client";
// Figures for the venue-analysis post. Every number is from the venue diagnostic and backtest runs
// (model fitted before 1 Jan 2025, T20 balls after it). Dependency-free SVG; colours are CSS roles in globals.css.
import { useState } from "react";
import { ChartFrame, type Column } from "@/components/charts";

const signed = (v: number, d = 0) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;

function Figure({ n, title, caption, children, table }: {
  n: number; title: string; caption: React.ReactNode; children: React.ReactNode; table: [string[], (string | number)[][]];
}) {
  return (
    <figure className="viz">
      <figcaption className="viz-title"><span>Figure {n}</span>{title}</figcaption>
      {children}
      <p className="viz-caption">{caption}</p>
      <details className="viz-table">
        <summary>Show the numbers</summary>
        <div className="post-table"><table>
          <thead><tr>{table[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{table[1].map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </figure>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return <div className="viz-legend">{items.map(([c, l]) => <span key={l}><i style={{ background: `var(${c})` }} />{l}</span>)}</div>;
}

// ── Figure 1: ground level, observed ÷ expected runs since 2025 ──────────────────────────────────────────────────

const GROUNDS: [string, number, number][] = [   // ground, runs v expectation %, balls since 2025
  ["Edgbaston, Birmingham", 14, 9175], ["Kennington Oval, London", 13, 8146], ["Gahanga B Ground, Kigali", 8, 9714],
  ["County Ground", 7, 21174], ["Singapore National Cricket Ground", 7, 9556], ["Wankhede Stadium, Mumbai", 6, 5453],
  ["Gaddafi Stadium, Lahore", 4, 10043], ["Terdthai Cricket Ground, Bangkok", 3, 14515], ["Tribhuvan University Ground, Kirtipur", 3, 13541],
  ["Moara Vlasiei, Romania", 1, 15096], ["Sylhet International Stadium", 0, 9510], ["Bayuemas Oval, Kuala Lumpur", 0, 15809], ["Dubai International Stadium", -1, 13643],
  ["Udayana Cricket Ground, Bali", -2, 12619], ["Al Amerat, Muscat", -5, 8635], ["Gahanga International Stadium, Kigali", -8, 12115],
  ["Botswana Cricket Association Oval 1", -12, 9923],
];

export function GroundLevel() {
  const max = 15;
  const pos = (v: number) => `${(50 * Math.abs(v)) / max}%`;
  return (
    <Figure n={1} title="Runs v what the model expected, since January 2025"
      caption={<>Observed ÷ expected runs at the 15 T20 grounds with the most balls since 1 Jan 2025, plus the Oval and the Wankhede.
        &ldquo;Expected&rdquo; is the pre-2025 model&rsquo;s prediction for the same batters, bowlers and match situations. Right of
        the centre line: more runs than expected.</>}
      table={[["Ground", "Runs v expected", "Balls"], GROUNDS.map(([g, v, b]) => [g, `${signed(v)}%`, b.toLocaleString("en-IN")])]}>
      <div className="hbars" role="img" aria-label="Runs scored versus model expectation by ground">
        {GROUNDS.map(([g, v, b]) => (
          <div key={g} className="hbar" title={`${g}: ${signed(v)}% runs v expected · ${b.toLocaleString("en-IN")} balls`}>
            <span className="hbar-name">{g}</span>
            <span className="hbar-track">
              <i style={v >= 0 ? { left: "50%", width: pos(v), background: "var(--viz-pos)" }
                              : { right: "50%", width: pos(v), background: "var(--viz-neg)" }} />
            </span>
            <b className="hbar-val">{signed(v)}%</b>
          </div>
        ))}
        <div className="hbar hbar-axis"><span className="hbar-name" /><span className="hbar-track">
          {[-10, -5, 0, 5, 10].map((t) => <em key={t} style={{ left: `${50 + (50 * t) / max}%` }}>{signed(t)}%</em>)}
        </span><b className="hbar-val" /></div>
      </div>
    </Figure>
  );
}

// ── Figure 2: the shape of an innings at each ground ─────────────────────────────────────────────────────────────

const PHASES = ["Overs 1-6", "7-12", "13-16", "17-20"];
const SHAPE: [string, number[]][] = [
  ["Edgbaston", [1.21, 1.13, 1.10, 1.09]], ["Gahanga B", [1.12, 1.10, 1.01, 1.03]], ["County Ground", [1.07, 1.08, 1.03, 1.08]],
  ["Singapore National", [1.06, 1.09, 1.07, 1.02]], ["Gaddafi Stadium", [1.08, 1.02, 1.01, 1.02]], ["Tribhuvan University", [1.05, 1.01, 1.01, 1.08]],
  ["Terdthai", [1.07, 0.98, 0.99, 1.07]], ["Moara Vlasiei", [1.05, 1.02, 0.98, 0.96]], ["Sylhet International", [1.02, 0.99, 1.01, 0.99]],
  ["Bayuemas Oval", [1.07, 0.97, 0.99, 0.95]], ["Dubai International", [1.04, 0.95, 0.95, 1.02]], ["Udayana", [1.00, 1.00, 0.97, 0.95]],
  ["Al Amerat", [0.99, 0.92, 0.92, 0.95]], ["Gahanga International", [0.96, 0.91, 0.87, 0.94]], ["Botswana Oval 1", [0.93, 0.86, 0.86, 0.86]],
];

export function InningsShape() {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const W = 720, row = 28, top = 34, x0 = 210, cw = (W - x0 - 10) / 4, H = top + SHAPE.length * row + 6;
  const fill = (v: number) => {
    const t = Math.min(Math.abs(v - 1) / 0.15, 1);
    return `color-mix(in oklab, var(${v >= 1 ? "--viz-pos" : "--viz-neg"}) ${Math.round(t * 85)}%, var(--viz-mid))`;
  };
  return (
    <Figure n={2} title="Where in the innings each ground gives or takes runs"
      caption={<>Observed ÷ expected runs by stage of the innings, since 1 Jan 2025 (1.00 = exactly as expected). Blue: more runs than
        expected; orange: fewer. Read across a row for a ground&rsquo;s shape: Dubai and Bayuemas start fast and then squeeze.</>}
      table={[["Ground", ...PHASES], SHAPE.map(([g, v]) => [g, ...v.map((x) => x.toFixed(2))])]}>
      <div className="chart-wrap chart-scroll" onMouseLeave={() => setHover(null)}><div style={{ position: "relative", minWidth: 600 }}>
        <svg className="chart viz-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Runs versus expectation by ground and stage of innings">
          {PHASES.map((p, j) => <text key={p} x={x0 + j * cw + cw / 2} y={20} className="viz-axis" textAnchor="middle">{p}</text>)}
          {SHAPE.map(([g, vals], i) => (
            <g key={g}>
              <text x={x0 - 12} y={top + i * row + row / 2 + 4} className="viz-label" textAnchor="end">{g}</text>
              {vals.map((v, j) => (
                <g key={j} onMouseEnter={() => setHover([i, j])} onTouchStart={() => setHover([i, j])}>
                  <rect x={x0 + j * cw + 1} y={top + i * row + 1} width={cw - 2} height={row - 2} rx={3} fill={fill(v)}
                        className={hover && hover[0] === i && hover[1] === j ? "viz-cell on" : "viz-cell"} />
                  <text x={x0 + j * cw + cw / 2} y={top + i * row + row / 2 + 4} className="viz-cellv" textAnchor="middle">{v.toFixed(2)}</text>
                </g>
              ))}
            </g>
          ))}
        </svg>
        {hover && (
          <div className="chart-tip" role="status" style={{ left: `${(100 * (x0 + hover[1] * cw + cw / 2)) / W}%`, top: `${(100 * (top + hover[0] * row + row)) / H}%` }}>
            <div className="chart-tip-title">{SHAPE[hover[0]][0]} · {PHASES[hover[1]]}</div>
            <div className="chart-tip-row"><span>Runs v expected</span><b>{signed(100 * (SHAPE[hover[0]][1][hover[1]] - 1))}%</b></div>
          </div>
        )}
      </div></div>
    </Figure>
  );
}

// ── Figures 3 and 4: what repeats from before 2025 to after it ───────────────────────────────────────────────────

const METRICS: [string, string][] = [["--viz-1", "Runs"], ["--viz-2", "Boundaries"], ["--viz-3", "Wickets"]];
const SPLITS: [string, number[], number[]][] = [   // split, correlation (runs, boundaries, wickets), error removed % (same order)
  ["Men's v women's", [0.42, 0.73, -0.04], [18.0, 22.5, -3.5]],
  ["Pace v spin", [0.34, 0.18, 0.10], [9.4, 0.4, -0.5]],
  ["Stage of innings", [0.28, 0.16, 0.04], [9.3, 4.8, -1.0]],
  ["Batting first v chasing", [0.24, 0.16, 0.07], [3.2, 3.4, -1.0]],
];

function Grouped({ values, min, max, ticks, fmt, label }: { values: number[][]; min: number; max: number; ticks: number[]; fmt: (v: number) => string; label: string }) {
  const W = 720, H = 300, left = 44, right = 10, top = 16, bottom = 250;
  const gw = (W - left - right) / SPLITS.length, bw = Math.min(34, (gw - 40) / 3);
  const sy = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const columns: Column[] = SPLITS.map(([s], i) => ({
    x0: left + i * gw, x1: left + (i + 1) * gw, title: s,
    rows: METRICS.map(([c, m], k) => ({ color: `var(${c})`, label: m, value: fmt(values[i][k]) })),
  }));
  return (
    <ChartFrame W={W} H={H} top={top} bottom={bottom} columns={columns} label={label} minWidth={600}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={sy(t)} y2={sy(t)} className={t === 0 ? "viz-zero" : "viz-grid"} />
          <text x={left - 8} y={sy(t) + 4} className="viz-axis" textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {SPLITS.map(([s], i) => {
        const cx = left + i * gw + gw / 2;
        return (
          <g key={s}>
            {METRICS.map(([c], k) => {
              const v = values[i][k], x = cx + (k - 1) * (bw + 4) - bw / 2, y = Math.min(sy(v), sy(0)), h = Math.max(Math.abs(sy(v) - sy(0)), 2);
              return (
                <g key={k}>
                  <rect x={x} y={y} width={bw} height={h} rx={3} fill={`var(${c})`} />
                  <text x={x + bw / 2} y={v >= 0 ? y - 5 : y + h + 13} className="viz-value" textAnchor="middle">{fmt(v)}</text>
                </g>
              );
            })}
            <text x={cx} y={bottom + 24} className="viz-label" textAnchor="middle">{s}</text>
          </g>
        );
      })}
    </ChartFrame>
  );
}

export function Persistence() {
  return (
    <Figure n={3} title="Does a ground's pattern before 2025 predict its pattern after?"
      caption={<>Weighted correlation between each ground&rsquo;s split measured on 2022-24 balls and the same split on balls since 2025.
        0 means the old pattern tells you nothing; 1 means it repeats exactly. Wickets sit at zero for every split.</>}
      table={[["Split", "Runs", "Boundaries", "Wickets"], SPLITS.map(([s, c]) => [s, ...c.map((v) => v.toFixed(2))])]}>
      <Legend items={METRICS} />
      <Grouped values={SPLITS.map((s) => s[1])} min={-0.1} max={0.8} ticks={[0, 0.2, 0.4, 0.6, 0.8]} fmt={(v) => v.toFixed(2)}
               label="Correlation between pre-2025 and post-2025 ground patterns" />
    </Figure>
  );
}

export function ErrorRemoved() {
  return (
    <Figure n={4} title="How much error each venue split removes"
      caption={<>Share of the ground-by-ground error since 2025 that disappears when the pre-2025 split is used (shrunk towards
        no effect). Negative means it made predictions worse. Same-city prior for thin grounds, not shown: 14.7% of runs error.</>}
      table={[["Split", "Runs", "Boundaries", "Wickets"], SPLITS.map(([s, , g]) => [s, ...g.map((v) => `${signed(v, 1)}%`)])]}>
      <Legend items={METRICS} />
      <Grouped values={SPLITS.map((s) => s[2])} min={-5} max={25} ticks={[0, 5, 10, 15, 20, 25]} fmt={(v) => `${signed(v, 0)}%`}
               label="Share of venue error removed by each split" />
    </Figure>
  );
}

// ── Figure 5: calibration of first-innings totals, old v new venue model ────────────────────────────────────────

const PIT_OLD = [10, 9, 8, 10, 8, 10, 10, 9, 13, 14], PIT_NEW = [10, 8, 8, 10, 10, 9, 8, 12, 13, 12];

export function Calibration() {
  const W = 720, H = 260, left = 40, right = 10, top = 14, bottom = 220, max = 16;
  const gw = (W - left - right) / 10, bw = Math.min(22, (gw - 10) / 2);
  const sy = (v: number) => bottom - (v / max) * (bottom - top);
  const columns: Column[] = PIT_OLD.map((v, i) => ({
    x0: left + i * gw, x1: left + (i + 1) * gw, title: `Decile ${i + 1} of the forecast range`,
    rows: [{ color: "var(--viz-old)", label: "Old venue model", value: `${v}%` }, { color: "var(--viz-1)", label: "New venue model", value: `${PIT_NEW[i]}%` }],
  }));
  return (
    <Figure n={5} title="Where real first-innings totals landed in our forecast range"
      caption={<>750 matches after 1 Jan 2025. Each forecast range is split into ten equal-probability slices; a perfectly calibrated
        forecast puts 10% of real scores in each (dashed line). Too many in the top two slices means real scores beat our forecasts.</>}
      table={[["Slice", "Old", "New"], PIT_OLD.map((v, i) => [`${i + 1}`, `${v}%`, `${PIT_NEW[i]}%`])]}>
      <Legend items={[["--viz-old", "Old venue model"], ["--viz-1", "New venue model"]]} />
      <ChartFrame W={W} H={H} top={top} bottom={bottom} columns={columns} label="Calibration of first-innings totals by decile" minWidth={600}>
        {[0, 5, 10, 15].map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={sy(t)} y2={sy(t)} className={t === 0 ? "viz-zero" : "viz-grid"} />
            <text x={left - 8} y={sy(t) + 4} className="viz-axis" textAnchor="end">{t}%</text>
          </g>
        ))}
        <line x1={left} x2={W - right} y1={sy(10)} y2={sy(10)} className="viz-ref" />
        {PIT_OLD.map((v, i) => {
          const cx = left + i * gw + gw / 2;
          return (
            <g key={i}>
              <rect x={cx - bw - 1} y={sy(v)} width={bw} height={bottom - sy(v)} rx={3} fill="var(--viz-old)" />
              <rect x={cx + 1} y={sy(PIT_NEW[i])} width={bw} height={bottom - sy(PIT_NEW[i])} rx={3} fill="var(--viz-1)" />
              <text x={cx} y={bottom + 18} className="viz-axis" textAnchor="middle">{i === 0 ? "Low" : i === 9 ? "High" : i + 1}</text>
            </g>
          );
        })}
      </ChartFrame>
    </Figure>
  );
}

// ── Figure 6: the scoring trend we still miss ────────────────────────────────────────────────────────────────────

const DRIFT: [string, number, number, number][] = [   // months after cutoff, matches, predicted, actual
  ["0-5 months", 188, 160.9, 164.9], ["6-11 months", 221, 161.7, 165.2], ["12+ months", 341, 160.9, 170.8],
];

export function Drift() {
  const W = 720, H = 240, left = 150, right = 70, top = 10, row = 62, min = 150, max = 175;
  const sx = (v: number) => left + ((v - min) / (max - min)) * (W - left - right);
  return (
    <Figure n={6} title="First-innings runs: forecast v reality as time passes"
      caption={<>Average first-innings total in the 750 backtest matches, by how long after the model&rsquo;s cutoff they were played.
        The forecast stays flat; real scores keep climbing. That gap is our next piece of work.</>}
      table={[["Played", "Matches", "Forecast", "Actual"], DRIFT.map(([p, n, f, a]) => [p, n, f.toFixed(1), a.toFixed(1)])]}>
      <Legend items={[["--viz-old", "Our forecast (average)"], ["--viz-2", "Actual (average)"]]} />
      <div className="chart-wrap chart-scroll"><div style={{ minWidth: 600 }}>
        <svg className="chart viz-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Forecast versus actual first-innings totals by months after cutoff">
          {[150, 155, 160, 165, 170, 175].map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={top} y2={top + DRIFT.length * row} className="viz-grid" />
              <text x={sx(t)} y={top + DRIFT.length * row + 18} className="viz-axis" textAnchor="middle">{t}</text>
            </g>
          ))}
          {DRIFT.map(([p, n, f, a], i) => {
            const y = top + i * row + row / 2;
            return (
              <g key={p}>
                <text x={left - 14} y={y - 2} className="viz-label" textAnchor="end">{p}</text>
                <text x={left - 14} y={y + 14} className="viz-axis" textAnchor="end">{n} matches</text>
                <line x1={sx(f)} x2={sx(a)} y1={y} y2={y} className="viz-link" />
                <circle cx={sx(f)} cy={y} r={7} fill="var(--viz-old)" className="viz-dot" />
                <circle cx={sx(a)} cy={y} r={7} fill="var(--viz-2)" className="viz-dot" />
                <text x={sx(a) + 14} y={y + 4} className="viz-value">+{(a - f).toFixed(1)} runs</text>
              </g>
            );
          })}
        </svg>
      </div></div>
    </Figure>
  );
}
