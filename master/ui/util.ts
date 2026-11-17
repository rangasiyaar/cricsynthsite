// Small DOM and formatting helpers for the console (no framework).
export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const n = (v: unknown): string => (v == null || v === "" || Number.isNaN(Number(v)) ? "–" : Number(v).toLocaleString("en-IN"));
export const pct = (v: number | null | undefined, d = 0): string => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
export const day = (iso: string | null | undefined): string =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";
export const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - Date.parse(iso.length === 10 ? iso + "T12:00:00Z" : iso)) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`;
  return day(iso);
}
export const provider = (p: string[]): string =>
  p.map((x) => ({ "google.com": "Google", password: "Email", "apple.com": "Apple", "github.com": "GitHub" }[x] || x)).join(", ") || "–";

export function badge(text: string, kind: "good" | "warn" | "bad" | "info" | "plain" = "plain"): string {
  return `<span class="b b-${kind}">${esc(text)}</span>`;
}
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export function tile(label: string, value: string, sub = "", href = ""): string {
  const inner = `<div class="t-l">${esc(label)}</div><div class="t-v">${value}</div>${sub ? `<div class="t-s">${sub}</div>` : ""}`;
  return href ? `<a class="tile" href="${esc(href)}">${inner}</a>` : `<div class="tile">${inner}</div>`;
}

export function csv(rows: Record<string, unknown>[], cols: string[]): string {
  const q = (v: unknown) => { const s = Array.isArray(v) ? v.join(" ") : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n");
}
export function download(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
