// Console charts, drawn as inline SVG at the plot's real width (crisp text, no stretching) and redrawn on resize:
// stacked bars and area trends with a hover crosshair and tooltip, sparklines for KPI cards, a donut, and ranked
// share bars. Every chart keeps a table view underneath. Colours are the brand's chart tokens (--s1 steel, --s2 clay).
import { esc, n } from "./util.ts";

export type Series = { key: string; label: string; color: string };
type Spec = { rows: Record<string, any>[]; series: Series[]; x: string; kind: "bars" | "area"; height: number;
              fmt: (v: number) => string; xLabel: (v: string) => string };
const specs = new Map<string, Spec>();
let seq = 0, tip: HTMLDivElement | null = null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-18" → "18 Nov"; "2026-05" → "May 26"; anything else as it is. */
export function xLabelOf(v: string): string {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${+m[3]} ${MONTHS[+m[2] - 1]}`;
  m = /^(\d{4})-(\d{2})$/.exec(v);
  if (m) return `${MONTHS[+m[2] - 1]} ${m[1].slice(2)}`;
  return v;
}
/** 1234 → "1.2k", 2500000 → "2.5M" (axis labels). */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(v * 10) / 10);
}
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}

/** A bar or area chart card body: title, period total, legend, the plot and a table view. Drawn by mountCharts(). */
export function bars(rows: Record<string, any>[], series: Series[], opt: { x: string; xLabel?: (v: string) => string;
  height?: number; fmt?: (v: number) => string; title?: string; kind?: "bars" | "area"; sub?: string; total?: boolean }) {
  const id = `ch${++seq}`, fmt = opt.fmt || ((v: number) => n(v));
  const kind = opt.kind || (series.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(String(rows[0]?.[opt.x] ?? "")) ? "area" : "bars");
  specs.set(id, { rows, series, x: opt.x, kind, height: opt.height || 220, fmt, xLabel: opt.xLabel || xLabelOf });
  const sum = rows.reduce((s, r) => s + series.reduce((t, x) => t + Number(r[x.key] || 0), 0), 0);
  const legend = `<div class="ch-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>`;
  const tableRows = rows.slice().reverse().map((r) => `<tr><td>${esc((opt.xLabel || xLabelOf)(String(r[opt.x])))}</td>${series.map((s) => `<td class="num">${fmt(Number(r[s.key] || 0))}</td>`).join("")}</tr>`).join("");
  return `<figure class="chart" data-chart="${id}">
    <div class="ch-head"><div><figcaption>${esc(opt.title || "")}</figcaption>${opt.sub ? `<div class="ch-sub">${opt.sub}</div>` : ""}</div>
      ${opt.total !== false && rows.length ? `<div class="ch-total"><b>${fmt(sum)}</b><span>total</span></div>` : ""}</div>
    ${series.length > 1 ? legend : ""}
    <div class="plot" style="height:${opt.height || 220}px" role="img" aria-label="${esc(opt.title || "chart")}"></div>
    <details><summary>Show as a table</summary><div class="tw"><table><thead><tr><th>${esc(opt.x)}</th>${series.map((s) => `<th class="num">${esc(s.label)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div></details></figure>`;
}

/** A monotone cubic path through the points (no overshoot below zero, as Fritsch–Carlson). */
function smooth(pts: [number, number][]): string {
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m.push(d[0]);
  for (let i = 1; i < pts.length - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[d.length - 1]);
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let path = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    path += `C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`;
  }
  return path;
}

function draw(fig: HTMLElement) {
  const spec = specs.get(fig.dataset.chart || ""), plot = fig.querySelector<HTMLElement>(".plot");
  if (!spec || !plot) return;
  const W = Math.max(240, plot.clientWidth), H = spec.height;
  const { rows, series, kind, fmt } = spec;
  const totals = rows.map((r) => (kind === "bars" ? series.reduce((s, x) => s + Number(r[x.key] || 0), 0) : Math.max(...series.map((x) => Number(r[x.key] || 0)))));
  const ticks = niceTicks(Math.max(0, ...totals)), top = ticks[ticks.length - 1] || 1;
  const padL = Math.max(28, 8 + 7 * Math.max(...ticks.map((t) => compact(t).length))), padR = 6, padT = 10, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB, band = iw / Math.max(1, rows.length);
  const y = (v: number) => padT + ih * (1 - v / top);
  const cx = (i: number) => padL + band * (i + 0.5);
  let g = "";
  for (const t of ticks) g += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="${t ? "grid" : "base"}"/><text x="${padL - 8}" y="${y(t) + 3.5}" text-anchor="end" class="ax">${compact(t)}</text>`;
  const every = Math.max(1, Math.ceil(64 / band));
  rows.forEach((r, i) => {                              // counted back from the newest day, so the latest is always labelled
    if ((rows.length - 1 - i) % every === 0)
      g += `<text x="${cx(i)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(spec.xLabel(String(r[spec.x])))}</text>`;
  });
  if (kind === "bars") {
    const bw = Math.max(2, Math.min(30, band * 0.62));
    rows.forEach((r, i) => {
      let base = 0;
      const x = cx(i) - bw / 2, last = series.map((s) => Number(r[s.key] || 0)).reduce((k, v, j) => (v ? j : k), -1);
      g += `<g class="col" data-i="${i}">`;
      series.forEach((s, k) => {
        const v = Number(r[s.key] || 0);
        if (!v) return;
        const y1 = y(base + v), y0 = y(base), h = Math.max(1, y0 - y1 - (base ? 1.5 : 0)), rad = Math.min(3, bw / 2, h);
        g += k === last && h > 3
          ? `<path d="M${x},${y1 + h}V${y1 + rad}q0,-${rad} ${rad},-${rad}h${bw - 2 * rad}q${rad},0 ${rad},${rad}V${y1 + h}Z" style="fill:${s.color}"/>`
          : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" style="fill:${s.color}"/>`;
        base += v;
      });
      g += `</g>`;
    });
  } else {
    series.forEach((s, k) => {
      const pts = rows.map((r, i) => [cx(i), y(Number(r[s.key] || 0))] as [number, number]);
      const line = smooth(pts), gid = `${fig.dataset.chart}-g${k}`;
      g += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.22"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient></defs>`;
      if (pts.length) g += `<path d="${line}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z" fill="url(#${gid})"/>`;
      g += `<path d="${line}" fill="none" style="stroke:${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
  }
  g += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" style="display:none"/><g class="dots"></g>`;
  plot.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}<rect class="hitarea" x="${padL}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg>`;

  const svg = plot.querySelector("svg")!, cross = svg.querySelector<SVGLineElement>(".cross")!, dots = svg.querySelector(".dots")!;
  tip ||= Object.assign(document.createElement("div"), { className: "tip", role: "tooltip" });
  if (!tip.isConnected) document.body.append(tip);
  const hide = () => { tip!.style.display = "none"; cross.style.display = "none"; dots.innerHTML = ""; svg.querySelectorAll(".col").forEach((c) => c.classList.remove("dim", "on")); };
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("pointermove", (e) => {
    const rect = svg.getBoundingClientRect(), px = e.clientX - rect.left;
    const i = Math.min(rows.length - 1, Math.max(0, Math.floor((px - padL) / band)));
    if (!rows.length || px < padL - 4) return hide();
    const r = rows[i];
    if (kind === "bars") svg.querySelectorAll<SVGGElement>(".col").forEach((c) => { const on = +c.dataset.i! === i; c.classList.toggle("dim", !on); c.classList.toggle("on", on); });
    else {
      cross.setAttribute("x1", String(cx(i))); cross.setAttribute("x2", String(cx(i))); cross.style.display = "";
      dots.innerHTML = series.map((s) => `<circle cx="${cx(i)}" cy="${y(Number(r[s.key] || 0))}" r="4" style="fill:${s.color}" class="dot"/>`).join("");
    }
    const sum = series.reduce((t, s) => t + Number(r[s.key] || 0), 0);
    tip!.innerHTML = `<div class="tip-h">${esc(spec.xLabel(String(r[spec.x])))}</div>` + series.map((s) =>
      `<div class="tip-r"><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${fmt(Number(r[s.key] || 0))}</b></div>`).join("")
      + (series.length > 1 && kind === "bars" ? `<div class="tip-r tot"><i></i><span>Total</span><b>${fmt(sum)}</b></div>` : "");
    tip!.style.display = "block";
    const tw = tip!.offsetWidth, th = tip!.offsetHeight;
    let left = rect.left + cx(i) + 14;
    if (left + tw > window.innerWidth - 8) left = rect.left + cx(i) - tw - 14;
    tip!.style.left = `${Math.max(8, left)}px`;
    tip!.style.top = `${Math.max(8, Math.min(window.innerHeight - th - 8, e.clientY - th / 2))}px`;
  });
}

let observer: ResizeObserver | null = null;
/** Draw every chart under `root` (call after rendering a view); redraws when a plot changes width. */
export function mountCharts(root: HTMLElement) {
  observer ||= new ResizeObserver((entries) => entries.forEach((en) => {
    const fig = (en.target as HTMLElement).closest<HTMLElement>("figure.chart");
    const w = Math.round(en.contentRect.width);
    if (fig && fig.dataset.w !== String(w)) { fig.dataset.w = String(w); draw(fig); }
  }));
  root.querySelectorAll<HTMLElement>("figure.chart[data-chart]").forEach((fig) => {
    const plot = fig.querySelector<HTMLElement>(".plot");
    if (!plot) return;
    fig.dataset.w = String(Math.round(plot.clientWidth));
    draw(fig);
    observer!.observe(plot);
  });
}
/** Kept for the views: mount the charts. */
export const wireTips = mountCharts;

/** A small trend line for a KPI card (no axes); the last point is marked. */
export function spark(values: number[], color = "var(--s1)"): string {
  if (values.length < 2) return "";
  const W = 120, H = 36, max = Math.max(1, ...values), min = 0;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, 3 + (H - 6) * (1 - (v - min) / (max - min))] as [number, number]);
  const line = smooth(pts), id = `sp${++seq}`, [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${color};stop-opacity:.25"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/></linearGradient></defs>
    <path d="${line}L${W},${H}L0,${H}Z" fill="url(#${id})"/><path d="${line}" fill="none" style="stroke:${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
    <circle cx="${lx}" cy="${ly}" r="2.4" style="fill:${color}" vector-effect="non-scaling-stroke"/></svg>`;
}

/** A donut with the total in the middle and a legend with counts and shares. */
export function donut(items: { label: string; value: number; color: string; href?: string }[], centre: string): string {
  const total = items.reduce((s, x) => s + x.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  let off = 0, arcs = "";
  const shown = items.filter((x) => x.value > 0);
  for (const it of shown) {
    const len = (it.value / Math.max(1, total)) * C, gap = shown.length > 1 ? Math.min(3, len / 3) : 0;
    arcs += `<circle r="${R}" cx="70" cy="70" fill="none" style="stroke:${it.color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(it.label)}: ${n(it.value)}</title></circle>`;
    off += len;
  }
  if (!total) arcs = `<circle r="${R}" cx="70" cy="70" fill="none" class="donut-empty" stroke-width="16"/>`;
  return `<div class="donut"><svg viewBox="0 0 140 140" role="img" aria-label="${esc(centre)}">${arcs}
      <text x="70" y="68" text-anchor="middle" class="donut-v">${n(total)}</text><text x="70" y="86" text-anchor="middle" class="donut-l">${esc(centre)}</text></svg>
    <ul class="donut-legend">${items.map((it) => `<li><i style="background:${it.color}"></i><span>${it.href ? `<a href="${esc(it.href)}">${esc(it.label)}</a>` : esc(it.label)}</span>
      <b>${n(it.value)}</b><em>${total ? Math.round((100 * it.value) / total) : 0}%</em></li>`).join("")}</ul></div>`;
}

/** Horizontal share bars for a ranked list (top endpoints, pages, countries). */
export function ranked(rows: { name: string; value: number; href?: string }[], fmt = (v: number) => n(v)): string {
  if (!rows.length) return `<p class="empty">Nothing yet.</p>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<ol class="ranked">${rows.map((r) => `<li><span class="rn" title="${esc(r.name)}">${r.href ? `<a href="${esc(r.href)}">${esc(r.name)}</a>` : esc(r.name)}</span>
    <span class="rb"><i style="width:${(100 * r.value / max).toFixed(1)}%"></i></span><span class="rv">${fmt(r.value)}</span></li>`).join("")}</ol>`;
}
