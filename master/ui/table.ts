// Sortable, searchable tables. Columns render HTML (escape inside render); sort uses `sort` or the raw value.
import { $, $$, esc } from "./util.ts";

export type Col<T> = { key: string; label: string; render?: (r: T) => string; sort?: (r: T) => string | number | null;
                       num?: boolean; cls?: string };

export function table<T extends Record<string, any>>(host: HTMLElement, cols: Col<T>[], rows: T[], opt: {
  rowHref?: (r: T) => string; empty?: string; initial?: { key: string; desc: boolean }; limit?: number } = {}) {
  let sortKey = opt.initial?.key || "", desc = opt.initial?.desc ?? true, shown = opt.limit || 200;
  const step = opt.limit || 200;
  const draw = () => {
    const c = cols.find((x) => x.key === sortKey);
    const val = (r: T) => (c?.sort ? c.sort(r) : r[sortKey]);
    const sorted = c ? rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return desc ? -d : d;
    }) : rows;
    const head = cols.map((k) => `<th class="${k.num ? "num" : ""} ${k.cls || ""}" data-k="${k.key}" tabindex="0" aria-sort="${k.key === sortKey ? (desc ? "descending" : "ascending") : "none"}">${esc(k.label)}${k.key === sortKey ? (desc ? " ↓" : " ↑") : ""}</th>`).join("");
    const body = sorted.slice(0, shown).map((r) => `<tr${opt.rowHref ? ` class="link" data-href="${esc(opt.rowHref(r))}"` : ""}>${cols.map((k) =>
      `<td class="${k.num ? "num" : ""} ${k.cls || ""}">${k.render ? k.render(r) : esc(r[k.key])}</td>`).join("")}</tr>`).join("");
    host.innerHTML = rows.length
      ? `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
        + (sorted.length > shown ? `<button class="more">Show more (${sorted.length - shown} left)</button>` : "")
      : `<p class="empty">${esc(opt.empty || "Nothing yet.")}</p>`;
    $$("th", host).forEach((th) => {
      const go = () => { const k = th.dataset.k!; desc = k === sortKey ? !desc : true; sortKey = k; draw(); };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") go(); });
    });
    $$("tr.link", host).forEach((tr) => tr.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a,button")) return;
      location.hash = tr.dataset.href!;
    }));
    $("button.more", host)?.addEventListener("click", () => { shown += step; draw(); });
  };
  draw();
}
