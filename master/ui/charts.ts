// Inline-SVG bar charts: one series, or two stacked (API / MCP), with a hover tooltip, a legend for two series
// and a table view underneath. Colours come from CSS variables (--s1, --s2) validated for light and dark surfaces.
import { esc, n } from "./util.ts";

export type Series = { key: string; label: string; color: string };
let tip: HTMLDivElement | null = null;

export function bars(rows: Record<string, any>[], series: Series[], opt: { x: string; xLabel?: (v: string) => string;
  height?: number; fmt?: (v: number) => string; title?: string } ) {
  const fmt = opt.fmt || ((v: number) => n(v));
  const H = opt.height || 160, W = 800, padB = 20, padT = 16, gap = 2;
  const totals = rows.map((r) => series.reduce((s, x) => s + Number(r[x.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const nice = niceMax(max);
  const bw = W / Math.max(1, rows.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const lab = opt.xLabel || ((v: string) => v.slice(5));
  const step = Math.ceil(rows.length / 8);
  let g = "";
  for (const t of [0, nice / 2, nice]) g += `<line x1="0" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="2" y="${y(t) - 3}" class="ax">${fmt(t)}</text>`;
  rows.forEach((r, i) => {
    let base = 0;
    const w = Math.max(2, Math.min(56, bw - gap)), x = i * bw + (bw - w) / 2;
    const tipText = `${esc(lab(String(r[opt.x])))}${series.map((s) => `<br>${esc(s.label)}: <b>${fmt(Number(r[s.key] || 0))}</b>`).join("")}`;
    series.forEach((s, k) => {
      const v = Number(r[s.key] || 0);
      if (!v) return;
      const y1 = y(base + v), y0 = y(base);
      const top = k === series.length - 1 || series.slice(k + 1).every((z) => !Number(r[z.key] || 0));
      const h = Math.max(1, y0 - y1 - (k ? gap : 0));
      g += top && h > 4 ? `<path d="M${x},${y0 - (k ? gap : 0)}V${y1 + 4}q0,-4 4,-4h${w - 8}q4,0 4,4V${y0 - (k ? gap : 0)}Z" fill="${s.color}"/>`
                        : `<rect x="${x}" y="${y1}" width="${w}" height="${h}" fill="${s.color}"/>`;
      base += v;
    });
    g += `<rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="transparent" class="hit" data-tip="${esc(tipText)}"/>`;
    if (i % step === 0) g += `<text x="${x + w / 2}" y="${H - 5}" text-anchor="middle" class="ax">${esc(lab(String(r[opt.x])))}</text>`;
  });
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>` : "";
  const tableRows = rows.slice().reverse().map((r) => `<tr><td>${esc(r[opt.x])}</td>${series.map((s) => `<td class="num">${fmt(Number(r[s.key] || 0))}</td>`).join("")}</tr>`).join("");
  return `<figure class="chart">${opt.title ? `<figcaption>${esc(opt.title)}</figcaption>` : ""}${legend}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(opt.title || "chart")}">${g}</svg>
    <details><summary>Table</summary><div class="tw"><table><thead><tr><th>${esc(opt.x)}</th>${series.map((s) => `<th class="num">${esc(s.label)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div></details></figure>`;
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Horizontal share bars for a ranked list (top endpoints, pages, countries). */
export function ranked(rows: { name: string; value: number; href?: string }[], fmt = (v: number) => n(v)): string {
  if (!rows.length) return `<p class="empty">Nothing yet.</p>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<ol class="ranked">${rows.map((r) => `<li><span class="rn">${r.href ? `<a href="${esc(r.href)}">${esc(r.name)}</a>` : esc(r.name)}</span>
    <span class="rb"><i style="width:${(100 * r.value / max).toFixed(1)}%"></i></span><span class="rv">${fmt(r.value)}</span></li>`).join("")}</ol>`;
}

/** One tooltip for every chart on the page. */
export function wireTips(root: HTMLElement) {
  tip ||= Object.assign(document.createElement("div"), { className: "tip", role: "tooltip" });
  if (!tip.isConnected) document.body.append(tip);
  root.querySelectorAll<SVGRectElement>("rect.hit").forEach((r) => {
    r.addEventListener("mouseenter", () => { tip!.innerHTML = r.dataset.tip || ""; tip!.style.display = "block"; r.classList.add("on"); });
    r.addEventListener("mousemove", (e) => {
      const w = tip!.offsetWidth;
      tip!.style.left = `${Math.min(window.innerWidth - w - 8, e.clientX + 12)}px`;
      tip!.style.top = `${e.clientY + 14}px`;
    });
    r.addEventListener("mouseleave", () => { tip!.style.display = "none"; r.classList.remove("on"); });
  });
}
