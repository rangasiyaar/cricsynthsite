// CricSynthesis admin console: sign-in, hash routes and the read-only views.
import { initializeApp } from "@firebase/app";
import { browserPopupRedirectResolver, GoogleAuthProvider, inMemoryPersistence, initializeAuth, signInWithPopup, signOut } from "@firebase/auth";
import { bars, donut, ranked, spark, wireTips } from "./charts.ts";
import { type Col, table } from "./table.ts";
import { $, $$, ago, badge, csv, day, delta, download, esc, kpi, n, pct, provider, tile, when } from "./util.ts";
import { PRO } from "../../app/lib/pro.ts";
import { API_PLUS } from "../../app/lib/plans.ts";

type Row = Record<string, any>;
const CONFIG = {   // the site's public Firebase web config (app/lib/firebase.ts)
  apiKey: "AIzaSyCS3d9wd0kfNrQ5vZqXx1agjTqwCHKtLcU", authDomain: "cricsynthesis.firebaseapp.com", projectId: "cricsynthesis",
  appId: "1:738796128383:web:805a11670433963e73d74a",
};
const S1 = "var(--s1)", S2 = "var(--s2)", S3 = "var(--s3)", S4 = "var(--s4)";

// the brand lockup (brand kit: mark + CRIC SYNTHESIS, Barlow Condensed 600) with the console tag
const MARK = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><path d="M4 15L13 24L4 33" stroke-linecap="square"/><path d="M22 15V40M30 15V40M38 15V40M20 11H29M31 11H40"/></svg>`;
const LOCKUP = (href = "#/") => `<a href="${href}" class="lockup" aria-label="CricSynthesis Console">${MARK}<span class="word">Cric<b>Synthesis</b></span><span class="tag">Console</span></a>`;
// 24px line icons (stroke = currentColor)
const ic = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON: Record<string, string> = {
  "": ic('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>'),
  keys: ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'),
  usage: ic('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>'),
  requests: ic('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>'),
  app: ic('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  payments: ic('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>'),
  messages: ic('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  applications: ic('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  product: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  ux: ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  traffic: ic('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  health: ic('<path d="M12 21s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.4-8 11-8 11z"/>'),
  accuracy: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  log: ic('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
  calls: ic('<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>'),
  active: ic('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
  paid: ic('<path d="M6 4h12M6 9h12M10 4c4 0 6 2 6 5s-2 5-6 5H7l8 7"/>'),
  signups: ic('<circle cx="10" cy="8" r="4"/><path d="M3 20c.8-3.7 3.6-6 7-6 1.6 0 3 .5 4.2 1.3M18 14v6M15 17h6"/>'),
  mcp: ic('<path d="M8 3v4M16 3v4M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'),
  alert: ic('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>'),
  refresh: ic('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
};
const main = () => $("#main")!;

// a short line under a section heading: what it shows, and what to do about it
const note = (t: string) => `<p class="note">${t}</p>`;
const ch = (title: string, text: string, link = "") => `<div class="card-h"><h2>${title}</h2>${link}</div>${note(text)}`;
const ratio = (a: number, b: number) => (b ? a / b : null);
const DAY = 86400_000;
const weekOf = (iso: string) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
/** How many of `dates` fall in each of the last `count` weeks (Monday to Sunday). */
function perWeek(dates: (string | null | undefined)[], count = 8): Row[] {
  const start = Date.parse(weekOf(new Date().toISOString()) + "T00:00:00Z");
  const out = Array.from({ length: count }, (_, i) => ({ week: new Date(start - (count - 1 - i) * 7 * DAY).toISOString().slice(0, 10), v: 0 }));
  for (const x of dates) { const w = x && out.find((o) => o.week === weekOf(x)); if (w) w.v++; }
  return out;
}
const wkLabel = (v: string) => new Date(v + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const weekBars = (rows: Row[], title: string, sub: string, label: string) =>
  bars(rows, [{ key: "v", label, color: "var(--s1)" }], { x: "week", xLabel: wkLabel, kind: "bars", title, sub, height: 180 });
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const waitedDays = (iso: string | null | undefined) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY)) : null);
const daysText = (d: number | null) => (d == null ? "–" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`);
const rupee = (v: number) => `₹${n(v)}`;
let me: { email: string; exp: number } | null = null;
let snap: Row | null = null;

class ApiError extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s; } }
async function api<T = Row>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/api/session") { me = null; renderLogin("Your session ended. Sign in again."); }
  if (!r.ok) throw new ApiError(r.status, (j as Row).detail || r.statusText);
  return j as T;
}

// ── actions (phase 2): confirm, POST, show the result, re-render ──
async function act(body: Row, question: string, after: () => void, withNote = false) {
  let note: string | null | undefined;
  if (withNote) { note = prompt(`${question}\n\nOptional note for the log / the customer:`, ""); if (note === null) return; }
  else if (!confirm(question)) return;
  try {
    const r = await api<Row>("/api/action", { method: "POST", body: JSON.stringify({ ...body, ...(note ? { note } : {}) }) });
    snap = null;
    toast(r.done || "Done");
    after();
  } catch (e) { toast((e as Error).message, true); }
}
function toast(msg: string, bad = false) {
  const t = Object.assign(document.createElement("div"), { className: `toast${bad ? " bad" : ""}`, textContent: msg, role: "status" });
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}
function wireActions(root: ParentNode, after: () => void) {
  $$<HTMLButtonElement>("button[data-act]", root).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const d = b.dataset;
    act(JSON.parse(d.act!), d.q || "Are you sure?", after, d.note === "1");
  }));
  $$<HTMLSelectElement>("select[data-act]", root).forEach((s) => s.addEventListener("change", (e) => {
    e.stopPropagation();
    const base = JSON.parse(s.dataset.act!);
    const v = s.value;
    s.value = s.dataset.cur || "";
    if (v && v !== s.dataset.cur) act({ ...base, plan: v }, `${s.dataset.q || "Change plan"} → ${v}?`, after);
  }));
}
const actBtn = (label: string, body: Row, q: string, kind = "", note = false) =>
  `<button class="btn ghost xs ${kind}" data-act='${esc(JSON.stringify(body))}' data-q="${esc(q)}"${note ? ' data-note="1"' : ""}>${esc(label)}</button>`;

// ── sign-in ──
async function signIn() {
  const btn = $<HTMLButtonElement>("#signin");
  if (btn) btn.disabled = true;
  try {
    const auth = initializeAuth(initializeApp(CONFIG), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
    const cred = await signInWithPopup(auth, new GoogleAuthProvider().setCustomParameters({ prompt: "select_account" }));
    const idToken = await cred.user.getIdToken();
    await signOut(auth);                    // the console keeps its own session cookie, nothing in this browser
    me = await api("/api/session", { method: "POST", body: JSON.stringify({ idToken }) });
    start();
  } catch (e) {
    const m = (e as Error).message || String(e);
    renderLogin(/unauthorized-domain/.test(m) ? "This address isn't an authorised sign-in domain in Firebase yet." : m.replace(/^Firebase: /, ""));
  }
}
function renderLogin(msg = "") {
  document.body.classList.add("out");
  $("#app")!.innerHTML = `<div class="login">${LOCKUP("#/")}<h1>Admin sign-in</h1>
    <p>For the CricSynthesis team only. Sign in with your Google account.</p><button id="signin" class="btn">Sign in with Google</button>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ""}</div>`;
  $("#signin")!.addEventListener("click", signIn);
}

// ── shell ──
const NAV: [string, [string, string][]][] = [
  ["", [["", "Overview"]]],
  ["Customers", [["users", "Users"], ["keys", "API keys"], ["usage", "Usage"], ["requests", "Upgrade requests"], ["payments", "Payments"], ["messages", "Messages"], ["applications", "Applications"]]],
  ["Growth", [["product", "Product (GA4)"], ["app", "App"], ["ux", "UX (Clarity)"], ["search", "Search"], ["traffic", "Traffic"]]],
  ["Operations", [["health", "Pipeline health"], ["accuracy", "Model accuracy"], ["log", "Audit log"]]],
];
const GROUP_OF: Record<string, string> = Object.fromEntries(NAV.flatMap(([g, items]) => items.map(([k]) => [k, g || "Dashboard"])));
function shell() {
  document.body.classList.remove("out");
  $("#app")!.innerHTML = `<header class="topbar"><button class="menu" aria-label="Menu">☰</button>${LOCKUP()}</header>
    <nav class="side" aria-label="Console">${LOCKUP()}
      ${NAV.map(([g, items]) => `<div class="nav-g">${g ? `<span>${g}</span>` : ""}${items.map(([k, l]) =>
        `<a href="#/${k}" data-k="${k}" class="nv">${ICON[k] || ""}<span>${l}</span>${k === "requests" ? `<em class="cnt" id="cnt-req" hidden></em>` : ""}</a>`).join("")}</div>`).join("")}
      <div class="side-foot"><span class="me">${esc(me!.email[0].toUpperCase())}</span><span class="who">${esc(me!.email)}<small>Admin · actions are logged</small></span>
        <button id="out" type="button">Sign out</button></div></nav>
    <main id="main"></main>`;
  $("#out")!.addEventListener("click", async () => { await api("/api/session", { method: "DELETE" }).catch(() => {}); me = null; renderLogin(); });
  $(".menu")!.addEventListener("click", () => document.body.classList.toggle("nav-open"));
}
function navCounts(s: Row) {
  const el = $("#cnt-req"), v = Number(s?.totals?.requestsOpen || 0);
  if (el) { el.textContent = String(v); el.hidden = !v; }
}
async function start() {
  shell();
  window.addEventListener("hashchange", route);
  route();
}
async function route() {
  document.body.classList.remove("nav-open");
  const [, view = "", arg = ""] = location.hash.replace(/^#/, "").split("/");
  $$(".side a.nv").forEach((a) => a.classList.toggle("on", a.dataset.k === (view === "user" ? "users" : view)));
  main().innerHTML = `<p class="loading">Loading…</p>`;
  window.scrollTo(0, 0);
  try {
    const views: Record<string, (a: string) => Promise<void>> = { "": overview, users, user, keys, usage, requests, payments, messages, app: appPage, applications, product, ux, search, traffic, health, accuracy, log };
    await (views[view] || overview)(decodeURIComponent(arg));
    wireTips(main());
  } catch (e) {
    if ((e as ApiError).status !== 401) main().innerHTML = `<p class="err">${esc((e as Error).message)}</p>`;
  }
}
async function snapshot(force = false): Promise<Row> {
  if (force) snap = await api("/api/refresh", { method: "POST" });
  else if (!snap) snap = await api("/api/snapshot");
  navCounts(snap!);
  return snap!;
}
const head = (title: string, s?: Row, extra = "") => {
  const view = location.hash.replace(/^#\/?/, "").split("/")[0];
  const stale = s ? Date.now() - Date.parse(s.built) > 7 * 3600_000 : false;
  return `<div class="head"><div><div class="crumb">${esc(GROUP_OF[view === "user" ? "users" : view] || "Dashboard")}</div><h1>${esc(title)}</h1></div>
    ${s ? `<span class="built"><i class="dot${stale ? " stale" : ""}"></i>Data as of ${ago(s.built)}
      <button class="btn ghost sm" id="refresh">${ICON.refresh.replace("<svg", '<svg width="14" height="14"')}Refresh</button></span>` : ""}${extra}</div>
  ${s?.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${s.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}`;
};
function wireRefresh() {
  $("#refresh")?.addEventListener("click", async (e) => {
    (e.target as HTMLButtonElement).disabled = true;
    (e.target as HTMLButtonElement).textContent = "Refreshing…";
    await snapshot(true).catch((x) => alert(x.message));
    route();
  });
}
const userLink = (uid: string, email: string | null) => `<a href="#/user/${encodeURIComponent(uid)}">${esc(email || uid)}</a>`;
const TIER_NAMES: Record<string, string> = { free: "CricSynthesis Free", pro: "CricSynthesis Pro", "api-plus": "API Plus", business: "Business API" };
const TAGS: Record<string, [string, "good" | "warn" | "info"]> = { paid: ["Paid", "good"], trial: ["Trial", "warn"], assigned: ["Assigned", "info"] };
const tagBadge = (t: string | null) => (t && TAGS[t] ? badge(TAGS[t][0], TAGS[t][1]) : "");
const untilText = (u: string | null) => (u ? `until ${day(u)}` : "");
const tierCell = (tier: string, tag: string | null, until: string | null = null) =>
  `${esc(TIER_NAMES[tier] || tier)} ${tagBadge(tag)}${until ? ` <small class="muted">${esc(untilText(until))}</small>` : ""}`;
const planBadge = (p: string) => badge(p === "free" ? "Free" : p[0].toUpperCase() + p.slice(1), p === "free" ? "plain" : "good");

// ── overview ──
const sumKey = (rows: Row[], k: string) => rows.reduce((t, r) => t + Number(r[k] || 0), 0);
async function overview() {
  const [s, msgs, apps, hl] = await Promise.all([snapshot(), api("/api/messages").catch(() => null), api("/api/applications").catch(() => null),
    api("/api/health").catch(() => null)]);
  const t = s.totals, ser = (s.series || []) as Row[], U = s.users as Row[];
  const last7 = ser.slice(-7), prev7 = ser.slice(-14, -7);
  const calls7 = sumKey(last7, "calls"), callsPrev = sumKey(prev7, "calls");
  const sign7 = sumKey(last7, "signups"), signPrev = sumKey(prev7, "signups");
  const act7 = sumKey(last7, "active") / 7, actPrev = sumKey(prev7, "active") / 7;
  const tiers = t.plans.tiers || {};
  const paidNote = t.plans.tiers ? `${n(t.plans.tags?.trial || 0)} on trial · ${n(t.plans.tags?.assigned || 0)} assigned` : "";
  // what needs a person today
  const newMsgs = msgs ? ((msgs.messages || []) as Row[]).filter((m) => m.status === "new").length : null;
  const openApps = apps ? ((apps.applications || []) as Row[]).filter((a) => ["new", "reviewing"].includes(a.status)).length : null;
  const failing = hl ? ((hl.runs || []) as Row[]).filter((r) => r.last?.status === "completed" && r.last?.conclusion === "failure") : null;
  const stale = Date.now() - Date.parse(s.built) > 7 * 3600_000;
  const todo: [string, number | null, string, string][] = [
    ["Upgrade requests waiting", t.requestsOpen, "#/requests", "Approve once they've paid or agreed terms."],
    ["New messages", newMsgs, "#/messages/new", "From the contact form, not yet answered."],
    ["Job applications to review", openApps, "#/applications/open", "New or in review."],
    ["Failing workflows", failing?.length ?? null, "#/health", failing?.length ? failing.map((r) => esc(r.label)).join(", ") : "Last run of each passed."],
    ["Accounts near today's limit", t.nearLimit, "#/usage", "At 80% or more of their daily calls."],
  ];
  const todoHtml = `<ul class="todo">${todo.map(([label, v, href, sub]) => `<li class="${v ? "on" : ""}"><a href="${href}"><b>${v == null ? "–" : n(v)}</b>
      <span>${label}<small>${sub}</small></span></a></li>`).join("")}
    ${stale ? `<li class="on"><a href="#/health"><b>!</b><span>Data is more than 7 hours old<small>The 6-hourly refresh may have failed. Press Refresh.</small></span></a></li>` : ""}</ul>`;
  // revenue at list price, monthly
  const paidOf = (tier: string) => U.filter((u) => u.tier === tier && u.tag === "paid").length;
  const pPro = paidOf("pro"), pPlus = paidOf("api-plus"), pBiz = paidOf("business");
  const mrr = pPro * PRO.monthly + pPlus * API_PLUS.monthly;
  // from sign-up to use
  const steps: [string, number][] = [["Signed up", U.length], ["Created an API key", U.filter((u) => u.keys > 0).length],
    ["Made calls in the last 30 days", U.filter((u) => u.calls30 > 0).length], ["Used the AI connector (30 days)", U.filter((u) => u.mcpDays > 0).length],
    ["Paying", t.plans.paid]];
  const top = Math.max(1, U.length);
  // this week against last week
  const wk = (k: string, from: number, to: number) => sumKey(ser.slice(from, to), k);
  const wow: [string, number, number][] = [["Sign-ups", sign7, signPrev], ["Accounts active (daily average)", Math.round(act7), Math.round(actPrev)],
    ["API calls", wk("api", -7, ser.length), wk("api", -14, -7)], ["AI connector calls", wk("mcp", -7, ser.length), wk("mcp", -14, -7)]];
  const stat = (k: string, label: string, v: number, sub: string, href: string, alert = false) =>
    `<a class="stat${alert && v ? " alert" : ""}" href="${href}"><span class="k-ico">${ICON[k]}</span><span><b>${n(v)}</b><span>${label}${sub ? ` · ${sub}` : ""}</span></span></a>`;
  main().innerHTML = head("Overview", s) + `
  <div class="kpis">
    ${kpi({ label: "Users", icon: ICON.users, value: n(t.users), delta: delta(t.users, t.users - sign7), note: `+${n(t.signups.d7)} this week`, spark: spark(ser.map((r, i) => sumKey(ser.slice(0, i + 1), "signups")), S1), href: "#/users" })}
    ${kpi({ label: "Active accounts", icon: ICON.active, value: n(t.active.d7), delta: delta(act7, actPrev), note: "in the last 7 days", spark: spark(ser.map((r) => Number(r.active || 0)), S1) })}
    ${kpi({ label: "API calls · 7 days", icon: ICON.calls, value: n(calls7), delta: delta(calls7, callsPrev), note: `${n(t.calls.today)} today`, spark: spark(ser.map((r) => Number(r.calls || 0)), S2), href: "#/usage" })}
    ${kpi({ label: "Paid plans", icon: ICON.paid, value: n(t.plans.paid), note: paidNote || "CricSynthesis Pro and API", href: "#/users" })}
  </div>
  <div class="stats">
    ${stat("signups", "sign-ups today", t.signups.d1, `${n(t.signups.d30)} in 30 days`, "#/users")}
    ${stat("keys", "active API keys", t.keys.active, `${n(t.keys.used7)} used this week`, "#/keys")}
    ${stat("mcp", "MCP connector accounts", t.mcpUsers30, `${n(t.calls.mcp30)} tool calls`, "#/usage")}
    ${stat("requests", "open upgrade requests", t.requestsOpen, `${n(t.nearLimit)} near today's limit`, "#/requests", true)}
  </div>
  <div class="grid2">
    <section class="card">${ch("Needs attention", "Anything here is waiting on one of us.")}${todoHtml}</section>
    <section class="card">${ch("Monthly revenue (estimate)", "Paid subscriptions at list price. Trials, assigned plans and Business contracts aren't counted.")}
      <div class="big">${rupee(mrr)}<span>a month</span></div>
      <dl class="dl rev"><dt>CricSynthesis Pro</dt><dd>${n(pPro)} × ${rupee(PRO.monthly)} = ${rupee(pPro * PRO.monthly)}</dd>
        <dt>API Plus</dt><dd>${n(pPlus)} × ${rupee(API_PLUS.monthly)} = ${rupee(pPlus * API_PLUS.monthly)}</dd>
        <dt>Business API</dt><dd>${n(pBiz)} paid · priced per contract</dd>
        <dt>On the free day</dt><dd>${n(t.plans.tags?.trial || 0)} · turn paid when the day ends unless they cancel</dd>
        <dt>Assigned by us</dt><dd>${n(t.plans.tags?.assigned || 0)} · no charge</dd></dl></section>
  </div>
  <div class="grid2">
    <section class="card">${ch("From sign-up to use", "How far accounts get. The biggest drop is where to help people next.")}
      <ol class="funnel">${steps.map(([label, v], i) => `<li><span class="fl">${label}</span><span class="rb"><i style="width:${(100 * v / top).toFixed(1)}%"></i></span>
        <span class="rv">${n(v)}</span><span class="muted">${i ? pct(v / top) : ""}</span></li>`).join("")}</ol></section>
    <section class="card">${ch("This week against last week", "Last 7 days compared with the 7 days before.")}<div id="wow"></div></section>
  </div>
  <div class="grid-main">
    <section class="card">${bars(ser, [{ key: "api", label: "API keys", color: S1 }, { key: "mcp", label: "MCP connector", color: S2 }],
      { x: "day", title: "API and MCP calls", sub: "Every call from API keys and the AI connector, last 30 days.", height: 260 })}</section>
    <section class="card">${ch("Plans", "Every account by its current subscription, paid or not.", `<a href="#/users">All users →</a>`)}
      ${donut([{ label: "CricSynthesis Free", value: tiers.free != null ? Number(tiers.free) : Math.max(0, t.users - Number(tiers.pro || 0) - Number(tiers["api-plus"] || 0) - Number(tiers.business || 0)), color: S3 },
               { label: "CricSynthesis Pro", value: Number(tiers.pro || 0), color: S1 },
               { label: "API Plus", value: Number(tiers["api-plus"] || 0), color: S2 },
               { label: "Business API", value: Number(tiers.business || 0), color: S4 }], "accounts")}</section>
  </div>
  <div class="grid2">
    <section class="card">${bars(ser, [{ key: "signups", label: "Sign-ups", color: S1 }], { x: "day", title: "Sign-ups", sub: "New accounts per day, last 30 days.", kind: "bars", height: 200 })}</section>
    <section class="card">${ch("Top endpoints and tools", "What people call most, API and AI connector together, last 30 days.", `<a href="#/usage">Usage →</a>`)}
      ${ranked(((s.endpoints || []) as Row[]).slice(0, 7).map((e) => ({ name: epName(e.ep), value: e.calls })))}</section>
  </div>
  <div class="grid2"><section class="card">${ch("Newest accounts", "The latest sign-ups. A quick hello helps them get started.", `<a href="#/users">All users →</a>`)}<div id="new"></div></section>
    <section class="card">${ch("Most active · 30 days", "The accounts that call the most. Good people to ask for feedback.", `<a href="#/usage">Usage →</a>`)}<div id="top"></div></section></div>`;
  const who = (r: Row) => `<span class="who-cell">${r.photo ? `<img src="${esc(r.photo)}" alt="" width="30" height="30" referrerpolicy="no-referrer">` : `<span class="av">${esc((r.email || r.uid)[0].toUpperCase())}</span>`}
    <span>${userLink(r.uid, r.email)}${r.name ? `<small>${esc(r.name)}</small>` : ""}</span></span>`;
  const cols: Col<Row>[] = [{ key: "email", label: "Account", render: who },
                            { key: "created", label: "Joined", render: (r) => ago(r.created) }, { key: "calls30", label: "Calls 30d", num: true, render: (r) => n(r.calls30) }];
  table($("#wow")!, [{ key: "m", label: "" }, { key: "a", label: "This week", num: true, render: (r) => n(r.a) },
    { key: "b", label: "Last week", num: true, render: (r) => n(r.b) }, { key: "d", label: "Change", num: true, sort: () => null, render: (r) => delta(r.a, r.b) }],
    wow.map(([m, a, b]) => ({ m, a, b })));
  table($("#new")!, cols, s.users.slice(0, 6), { rowHref: (r) => `/user/${r.uid}` });
  table($("#top")!, cols, s.users.filter((u: Row) => u.calls30).sort((a: Row, b: Row) => b.calls30 - a.calls30).slice(0, 6),
        { rowHref: (r) => `/user/${r.uid}`, empty: "No API or MCP calls in the last 30 days." });
  wireRefresh();
}

// ── users ──
// where an account is active (users/{uid}/activity/recent): website, app, device, city
const REGION = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const countryName = (c: string | null | undefined) => (c ? (c === "T1" ? "Tor network" : REGION?.of(c) || c) : "");
const placeText = (p: Row | null | undefined, full = false) => !p ? "–" : [p.city, full ? p.region : null, countryName(p.country)].filter(Boolean).join(", ") || "–";
const ON: Record<string, [string, "info" | "good" | "plain"]> = { web: ["Website", "plain"], app: ["App", "info"], both: ["Website + app", "good"] };
const onBadge = (k: string | null) => (k ? badge(ON[k][0], ON[k][1]) : `<span class="muted">–</span>`);
const DEVICE: Record<string, string> = { android: "Android phone", ios: "iPhone", tablet: "Tablet", desktop: "Computer", unknown: "Unknown device" };
const agentText = (a: Row | null | undefined) => !a ? "–" : [a.os || DEVICE[a.device] || "", a.where === "app" || a.browser === "App" ? "" : a.browser].filter(Boolean).join(" · ") || "–";

async function users() {
  const s = await snapshot(), t = s.totals, U = s.users as Row[];
  const by = (f: (u: Row) => boolean) => U.filter(f).length;
  const subs: Record<string, number> = {};
  for (const u of U) { const k = `${TIER_NAMES[u.tier || "free"]}${u.tag ? ` · ${TAGS[u.tag]?.[0] || u.tag}` : ""}`; subs[k] = (subs[k] || 0) + 1; }
  main().innerHTML = head("Users", s) + `
  <div class="tiles">
    ${tile("Accounts", n(U.length), `${n(t.verified)} with a verified email (${pct(ratio(t.verified, U.length))})`)}
    ${tile("Sign-in method", `${n(by((u) => u.providers.includes("google.com")))} Google`, `${n(by((u) => u.providers.includes("password")))} email and password`)}
    ${tile("Seen in 7 days", n(t.active.d7), `${n(t.active.d30)} in 30 days · ${n(t.active.d1)} today`)}
    ${tile("With API keys", n(by((u) => u.activeKeys > 0)), `${n(by((u) => u.calls30 > 0))} made calls in 30 days`)}
    ${tile("Paying", n(t.plans.paid), `${n(t.plans.tags?.trial || 0)} on the free day · ${n(t.plans.tags?.assigned || 0)} assigned`)}
    ${tile("Disabled", n(t.disabled), t.disabled ? "can't sign in" : "none")}
    ${tile("Active on the app", n(by((u) => u.activeOn === "app" || u.activeOn === "both")), `${n(by((u) => u.activeOn === "both"))} also on the website · 30 days`)}
    ${tile("Active on the website", n(by((u) => u.activeOn === "web" || u.activeOn === "both")), `${n(by((u) => u.activeOn === "web"))} on the website only · 30 days`)}
  </div>
  <div class="grid2">
    <section class="card">${ch("Where accounts are active", "Signed-in opens in the last 30 days. Recorded from 26 Nov 2026, so accounts not seen since show as –.")}${ranked([["web", "Website only"], ["app", "App only"], ["both", "Website and app"]].map(([k, name]) => ({ name, value: by((u) => u.activeOn === k) })).concat([{ name: "Not seen yet", value: by((u) => !u.activeOn) }]))}</section>
    <section class="card">${ch("Cities", "Each account's latest city, from the network it last opened from. Approximate.")}${ranked(Object.entries(U.reduce((m: Record<string, number>, u) => { if (u.place) { const k = placeText(u.place); m[k] = (m[k] || 0) + 1; } return m; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10))}</section>
  </div>
  <div class="grid2">
    <section class="card">${ch("Subscriptions", "Every account by plan and how they got it.")}${ranked(Object.entries(subs).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value))}</section>
    <section class="card">${weekBars(perWeek(U.map((u) => u.created)), "Sign-ups per week", "New accounts each week, Monday to Sunday, last 8 weeks.", "Sign-ups")}</section>
  </div>
  <h2 class="sec">All accounts</h2>${note("Search, filter and sort. Click a row to open the profile. Export gives what's on screen.")}
  <div class="filters">
    <input id="q" type="search" placeholder="Search email, name, company or account ID" aria-label="Search">
    <select id="f-plan" aria-label="Subscription"><option value="">All subscriptions</option>${Object.entries(TIER_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}<option value="tag:paid">Paid</option><option value="tag:trial">Trial</option><option value="tag:assigned">Assigned</option></select>
    <select id="f-use" aria-label="Activity"><option value="">Any activity</option><option value="keys">Has API keys</option><option value="calls">Made calls (30d)</option><option value="mcp">Used MCP (30d)</option><option value="active7">Seen in 7 days</option><option value="on:app">Active on the app</option><option value="on:web">Website only</option><option value="on:both">Website and app</option><option value="req">Open request</option><option value="noauth">Not in Firebase Auth</option></select>
    <span id="count" class="muted"></span><button id="csv" class="btn ghost sm">Export CSV</button></div><div id="tbl"></div>`;
  const cols: Col<Row>[] = [
    { key: "email", label: "Account", render: (r) => `<span class="who-cell">${r.photo ? `<img src="${esc(r.photo)}" alt="" width="24" height="24" referrerpolicy="no-referrer">` : `<span class="av">${esc((r.email || r.uid)[0].toUpperCase())}</span>`}
        <span>${userLink(r.uid, r.email)}${r.name ? `<small>${esc(r.name)}${r.company ? ` · ${esc(r.company)}` : ""}</small>` : ""}</span></span>` },
    { key: "providers", label: "Sign-in", render: (r) => esc(provider(r.providers)), sort: (r) => r.providers.join() },
    { key: "created", label: "Joined", render: (r) => `<span title="${esc(when(r.created))}">${day(r.created)}</span>` },
    { key: "lastSeen", label: "Last seen", render: (r) => `<span title="${esc(when(r.lastSeen))}">${ago(r.lastSeen)}</span>` },
    { key: "activeOn", label: "Active on", render: (r) => onBadge(r.activeOn), sort: (r) => ({ both: 3, app: 2, web: 1 } as Row)[r.activeOn] || 0 },
    { key: "place", label: "Location", render: (r) => esc(placeText(r.place)), sort: (r) => placeText(r.place) },
    { key: "agent", label: "Device", render: (r) => `${esc(agentText(r.agent))}${r.appVersion ? ` <small class="muted">app ${esc(r.appVersion)}</small>` : ""}`, sort: (r) => agentText(r.agent) },
    { key: "tier", label: "Subscription", render: (r) => tierCell(r.tier || "free", r.tag, r.until), sort: (r) => ({ free: 0, pro: 1, "api-plus": 2, business: 3 } as Row)[r.tier || "free"] * 10 + (r.tag === "paid" ? 2 : r.tag ? 1 : 0) },
    { key: "activeKeys", label: "Keys", num: true, render: (r) => n(r.activeKeys) },
    { key: "mcpDays", label: "MCP", num: true, render: (r) => (r.mcpDays ? `${r.mcpDays} d` : "–") },
    { key: "calls30", label: "Calls 30d", num: true, render: (r) => n(r.calls30) },
  ];
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const draw = () => {
    const q = ($<HTMLInputElement>("#q")!.value || "").toLowerCase().trim();
    const plan = $<HTMLSelectElement>("#f-plan")!.value, use = $<HTMLSelectElement>("#f-use")!.value;
    const rows = (s.users as Row[]).filter((u) =>
      (!q || [u.email, u.name, u.company, u.uid].some((x) => String(x || "").toLowerCase().includes(q)))
      && (!plan || (plan.startsWith("tag:") ? u.tag === plan.slice(4) : (u.tier || "free") === plan))
      && (!use || (use === "keys" ? u.activeKeys > 0 : use === "calls" ? u.calls30 > 0 : use === "mcp" ? u.mcpDays > 0
                  : use.startsWith("on:") ? (use === "on:app" ? u.activeOn === "app" || u.activeOn === "both" : u.activeOn === use.slice(3))
                  : use === "active7" ? String(u.lastSeen || "") >= since7 : use === "req" ? u.requestsOpen > 0 : !u.inAuth)));
    $("#count")!.textContent = `${n(rows.length)} of ${n(s.users.length)}`;
    table($("#tbl")!, cols, rows, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "created", desc: true }, empty: "No accounts match." });
    return rows;
  };
  let rows = draw();
  ["#q", "#f-plan", "#f-use"].forEach((id) => $(id)!.addEventListener("input", () => { rows = draw(); }));
  $("#csv")!.addEventListener("click", () => download(`cricsynthesis-users-${new Date().toISOString().slice(0, 10)}.csv`,
    csv(rows, ["uid", "email", "name", "company", "providers", "created", "lastSeen", "tierName", "tag", "until", "activeOn", "lastWeb", "lastApp", "appVersion", "websitePlan", "apiPlan", "activeKeys", "mcpDays", "calls7", "calls30", "requestsOpen", "disabled"])));
  wireRefresh();
}

// ── one user ──
async function user(uid: string) {
  const p = await api(`/api/user?uid=${encodeURIComponent(uid)}`), u = p.user, id = p.identity, sv = p.services;
  const series = (p.usage.series as Row[]).map((d) => ({ day: d.day, api: d.total - Number(d.keys?.mcp || 0), mcp: Number(d.keys?.mcp || 0) }));
  const paidTag = (paid: boolean) => badge(paid ? "Paid" : "Free", paid ? "good" : "plain");
  const days90 = p.usage.series as Row[];
  const total90 = days90.reduce((t, d) => t + Number(d.total || 0), 0), activeDays = days90.filter((d) => d.total > 0).length;
  const busiest = days90.reduce<Row | null>((b, d) => (d.total > (b?.total || 0) ? d : b), null);
  const lastCallDay = [...days90].reverse().find((d) => d.total > 0)?.day as string | undefined;
  const topEp = (p.usage.endpoints as Row[])[0];
  const status: [string, string] = u.disabled ? ["Disabled", "Can't sign in"]
    : sv.subscription.tag === "paid" ? ["Paying customer", sv.subscription.name]
    : sv.subscription.tag === "trial" ? ["On the free day", "Pro trial, charged when it ends"]
    : p.usage.calls30 ? ["Active", `${n(p.usage.calls30)} calls in 30 days`]
    : (p.keys as Row[]).some((k) => !k.revoked) ? ["Has a key, not calling", "No calls in 30 days"]
    : ["Signed up only", "No API key or calls yet"];
  main().innerHTML = `<p><a href="#/users" class="back">← All users</a></p>
  <div class="profile-head">${id?.photo ? `<img src="${esc(id.photo)}" alt="" width="64" height="64" referrerpolicy="no-referrer">` : `<span class="av big">${esc((u.email || uid)[0].toUpperCase())}</span>`}
    <div><h1>${esc(u.name || u.email || uid)}</h1><p>${esc(u.email || "No email")} ${u.verified ? badge("Verified", "good") : badge("Not verified", "warn")}
      ${u.disabled ? badge("Disabled", "bad") : ""} ${!u.inAuth ? badge("Not in Firebase Auth", "warn") : ""}</p>
      <p class="muted">Account ID <code>${esc(uid)}</code> <button class="btn ghost xs" id="copy">Copy</button> · Signs in with ${esc(provider(u.providers))}
      · Joined ${day(u.created)} · Last sign-in ${ago(id?.lastLogin)} · Last seen ${ago(u.lastSeen)}</p>
      <p class="acts">${u.inAuth ? (u.disabled ? actBtn("Enable account", { type: "user.enable", uid }, `Enable ${u.email || uid}? They can sign in again.`)
        : actBtn("Disable account", { type: "user.disable", uid }, `Disable ${u.email || uid}? They are signed out and can't sign in; their API keys keep working until revoked.`, "danger")) : ""}
        <button class="btn ghost xs danger" id="del-acct">Delete account</button>
        ${u.inAuth ? `<span class="sub-set"><label class="muted">Subscription <select id="tier" aria-label="Subscription tier">
          ${Object.entries(TIER_NAMES).map(([v, l]) => `<option value="${v}"${sv.subscription.tier === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <select id="tag" aria-label="How they got it"><option value="assigned"${sv.subscription.tag !== "paid" ? " selected" : ""}>Assigned (free, by our team)</option>
          <option value="paid"${sv.subscription.tag === "paid" ? " selected" : ""}>Paid (outside Razorpay, e.g. invoice)</option></select>
          <select id="days" aria-label="For how long">${[["0", "No end date"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["90", "90 days"],
            ["180", "180 days"], ["365", "1 year"], ["custom", "Custom days…"]].map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <input id="days-n" type="number" min="1" max="3650" step="1" placeholder="Days" aria-label="Number of days" hidden style="width:80px">
          <button class="btn sm" id="tier-set">Set subscription</button></span>` : ""}</p></div></div>
  <h2 class="sec">At a glance</h2>
  <div class="tiles">
    ${tile("Status", esc(status[0]), esc(status[1]))}
    ${tile("Calls in 90 days", n(total90), `on ${n(activeDays)} of 90 days`)}
    ${tile("Busiest day", busiest ? n(busiest.total) : "–", busiest ? `calls on ${day(busiest.day)}` : "no calls yet")}
    ${tile("Last call", lastCallDay ? daysText(waitedDays(lastCallDay)) : "never", lastCallDay ? `${day(lastCallDay)}${waitedDays(lastCallDay) ? " ago" : ""}` : "no calls in 90 days")}
    ${tile("Most used", topEp ? esc(epName(topEp.ep)) : "–", topEp ? `${n(topEp.calls)} calls in 30 days` : "nothing yet")}
  </div>
  <h2 class="sec">Activity, last 3 days</h2>${note("Each time they opened the website or the app while signed in. Opens within 30 minutes on the same device count as one visit. Location is the city of the network they used, so it's approximate (mobile data often shows a nearby big city). We don't store IP addresses.")}
  <div class="tiles">
    ${tile("Active on", u.activeOn ? esc(ON[u.activeOn][0]) : "Not seen yet", u.activeOn ? "in the last 30 days" : "nothing recorded since 26 Nov 2026")}
    ${tile("Last on the website", p.activity.lastWeb ? ago(p.activity.lastWeb) : "–", p.activity.lastWeb ? when(p.activity.lastWeb) : "not recorded")}
    ${tile("Last in the app", p.activity.lastApp ? ago(p.activity.lastApp) : "–", p.activity.lastApp ? `version ${esc(p.activity.appVersion || "?")} · ${esc(p.activity.appOs || "")}` : "not recorded")}
    ${tile("Latest location", esc(placeText(p.activity.place)), p.activity.place?.region ? esc(p.activity.place.region) : "")}
    ${tile("Visits in 3 days", n(p.activity.visits.length), `${n(new Set((p.activity.visits as Row[]).map((v) => `${v.device}|${v.os}|${v.browser}`)).size)} devices · ${n(new Set((p.activity.visits as Row[]).map((v) => v.city).filter(Boolean)).size)} cities`)}
  </div>
  <section class="card"><div id="visits"></div></section>
  <h2 class="sec">Services and plan</h2>${note("What they have now on the website, the API and the AI connector.")}
  <div class="tiles">
    ${tile("Subscription", esc(sv.subscription.name), `${tagBadge(sv.subscription.tag)} ${({ paid: "Paid", trial: "On the free day", assigned: "Assigned by our team" } as Record<string, string>)[sv.subscription.tag] || "No paid plan"}${sv.subscription.until ? ` · ends ${when(sv.subscription.until)}` : sv.subscription.tag === "assigned" || sv.subscription.setBy?.tier === sv.subscription.tier && sv.subscription.tier !== "free" ? " · no end date" : ""}${sv.subscription.setBy?.at ? ` · set in the console ${day(sv.subscription.setBy.at)}` : ""}`)}
    ${tile("Website (fan app)", esc(sv.website.plan), `${paidTag(sv.website.paid)} ${({ subscription: "Paid subscription", trial: "Free day", assigned: "Assigned by our team", default: "No subscription" } as Record<string, string>)[sv.website.source] || ""}${sv.website.billing?.status ? ` · ${esc(sv.website.billing.status)}${sv.website.billing.billing ? ` (${esc(sv.website.billing.billing)})` : ""}` : ""}`)}
    ${tile("API plan", planBadge(sv.api.plan), `${paidTag(sv.api.paid)} ${n(sv.api.activeKeys)} active key${sv.api.activeKeys === 1 ? "" : "s"} · ${n(sv.api.limit)} calls a day per key`)}
    ${tile("MCP connector", sv.mcp.used ? "In use" : "Not used", sv.mcp.used ? `${n(sv.mcp.days)} days in 90 · last ${day(sv.mcp.lastDay)} · today ${n(sv.mcp.today)} / ${n(sv.mcp.limit)}` : "No connector calls in 90 days")}
    ${tile("Usage", n(p.usage.today), `today · ${n(p.usage.calls7)} in 7 days · ${n(p.usage.calls30)} in 30`)}
  </div>
  <section class="card">${bars(series, [{ key: "api", label: "API keys", color: S1 }, { key: "mcp", label: "MCP connector", color: S2 }], { x: "day", title: "Calls per day (90 days)", sub: "API keys and the AI connector share one daily limit." })}</section>
  <section class="card"><h2>API keys</h2>${note("Change a key's plan or revoke it here. Revoking stops it within a minute and can't be undone.")}<div id="keys"></div></section>
  <div class="grid2"><section class="card"><h2>What they call (30 days)</h2>${note("Endpoints and AI tools, most used first.")}${ranked((p.usage.endpoints as Row[]).slice(0, 15).map((e) => ({ name: epName(e.ep), value: e.calls })))}
      ${Object.keys(p.usage.cats).length ? `<p class="muted">By category: ${Object.entries(p.usage.cats).map(([c, v]) => `${esc(c)} ${n(v)}`).join(" · ")}</p>` : ""}</section>
    <section class="card"><h2>Days at the daily limit</h2>${note("Days they ran out of calls. Two or more is a reason to offer Plus.")}<div id="limits"></div></section></div>
  <div class="grid2"><section class="card"><h2>Upgrade requests</h2>${note("Filed from their dashboard. Approve once they've paid or agreed terms.")}<div id="reqs"></div></section>
    <section class="card"><h2>Profile and email preferences</h2>${note("What they told us, and which emails they want.")}${p.profile ? `<dl class="dl">
      <dt>Company</dt><dd>${esc(p.profile.company || "–")}</dd><dt>Use case</dt><dd>${esc(p.profile.useCase || "–")}</dd>
      <dt>Product news</dt><dd>${yn(p.profile.notifyProduct)}</dd><dt>Usage alerts</dt><dd>${yn(p.profile.notifyUsage)}</dd>
      <dt>Billing emails</dt><dd>${yn(p.profile.notifyBilling)}</dd><dt>Updated</dt><dd>${when(p.profile.updated)}</dd></dl>` : `<p class="empty">No profile details saved.</p>`}</section></div>
  <section class="card"><h2>Timeline</h2>${note("Sign-up, keys, requests, plan changes and our actions, newest first.")}${p.timeline.length ? `<ol class="timeline">${p.timeline.map((t: Row) => `<li><time>${t.at.length === 10 ? day(t.at) : when(t.at)}</time>${esc(t.what)}</li>`).join("")}</ol>` : `<p class="empty">Nothing yet.</p>`}</section>`;
  $("#copy")!.addEventListener("click", () => navigator.clipboard.writeText(uid));
  $("#del-acct")?.addEventListener("click", () => {
    const typed = prompt(`Delete ${u.email || uid} for good?\n\nThis removes their profile, API keys, usage, requests and billing records, deletes the sign-in account and emails them a confirmation. It can't be undone.\n\nType DELETE to continue.`);
    if (typed !== "DELETE") return;
    act({ type: "user.delete", uid }, `Last check: delete ${u.email || uid} now?`, () => { location.hash = "#/users"; });
  });
  $("#days")?.addEventListener("change", () => { $<HTMLInputElement>("#days-n")!.hidden = $<HTMLSelectElement>("#days")!.value !== "custom"; });
  $("#tier-set")?.addEventListener("click", () => {
    const tier = $<HTMLSelectElement>("#tier")!.value, tag = $<HTMLSelectElement>("#tag")!.value;
    const dsel = $<HTMLSelectElement>("#days")!.value;
    const days = dsel === "custom" ? Number($<HTMLInputElement>("#days-n")!.value) : Number(dsel);
    if (tier !== "free" && (!Number.isInteger(days) || days < 0 || days > 3650 || (dsel === "custom" && days < 1))) { toast("Enter a whole number of days from 1 to 3650", true); return; }
    const end = tier === "free" ? "" : days ? ` for ${days} day${days === 1 ? "" : "s"} (until ${new Date(Date.now() + days * 86400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}), then back to CricSynthesis Free` : ", no end date";
    const what = tier === "free" ? "CricSynthesis Free: website Pro off, API keys on Free (a Razorpay subscription is not cancelled)"
      : `${TIER_NAMES[tier]} (${tag === "paid" ? "Paid" : "Assigned"}): website Pro on${tier === "pro" ? ", API keys on Free" : `, API keys on ${tier === "business" ? "Business" : "API Plus"}`}`;
    act({ type: "user.tier", uid, tier, tag, days: tier === "free" ? 0 : days }, `Set ${u.email || uid} to ${what}${end}?`, () => user(uid).then(() => wireTips(main())), true);
  });
  table($("#keys")!, [
    { key: "name", label: "Key", render: (r) => `${esc(r.name)} <small class="muted">${esc(r.slot)}</small>` },
    { key: "prefix", label: "Prefix", render: (r) => `<code>${esc(r.prefix)}…</code>` },
    { key: "plan", label: "Plan", render: (r) => planBadge(r.plan) },
    { key: "revoked", label: "Status", render: (r) => (r.revoked ? badge("Revoked", "bad") : badge("Active", "good")) },
    { key: "created", label: "Created", render: (r) => day(r.created) },
    { key: "lastUsed", label: "Last used", render: (r) => ago(r.lastUsed) },
    { key: "today", label: "Today", num: true, render: (r) => `${n(r.today)} <small class="muted">/ ${n(r.limit)}</small>` },
    { key: "calls30", label: "30 days", num: true, render: (r) => n(r.calls30) },
    { key: "act", label: "", sort: () => null, render: (r) => r.revoked ? "" : `<select data-act='${esc(JSON.stringify({ type: "key.plan", uid, slot: r.slot }))}' data-cur="${esc(r.plan)}" data-q="Set ${esc(r.name)} (${esc(r.slot)}) plan" aria-label="Key plan">
        ${["free", "pro", "business"].map((pl) => `<option${pl === r.plan ? " selected" : ""}>${pl}</option>`).join("")}</select>
        ${actBtn("Revoke", { type: "key.revoke", uid, slot: r.slot }, `Revoke "${r.name}" (${r.prefix}…)? Requests with it stop within a minute. This can't be undone.`, "danger")}` },
  ], p.keys, { empty: "No API keys created." });
  table($("#visits")!, [
    { key: "at", label: "When", render: (r) => `<span title="${esc(when(r.at))}">${when(r.at)}</span>${r.last && r.last !== r.at ? ` <small class="muted">to ${esc(new Date(r.last).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))}</small>` : ""}` },
    { key: "where", label: "Where", render: (r) => onBadge(r.where) },
    { key: "device", label: "Device", render: (r) => esc(DEVICE[r.device] || r.device || "–") },
    { key: "os", label: "System", render: (r) => esc(r.os || "–") },
    { key: "browser", label: "Browser / app", render: (r) => esc(r.where === "app" ? `App ${r.version || ""}` : r.browser || "–") },
    { key: "city", label: "Location", render: (r) => esc(placeText(r, true)), sort: (r) => placeText(r, true) },
    { key: "pings", label: "Opens", num: true, render: (r) => n(r.pings || 1) }],
    p.activity.visits, { initial: { key: "at", desc: true }, limit: 50, empty: "No visits recorded in the last 3 days." });
  table($("#limits")!, [{ key: "day", label: "Day", render: (r) => day(r.day) }, { key: "slot", label: "Key", render: (r) => slotName(r.slot) },
    { key: "calls", label: "Calls", num: true, render: (r) => `${n(r.calls)} / ${n(r.limit)}` }], p.usage.limitDays, { initial: { key: "day", desc: true }, limit: 10, empty: "Never hit a limit." });
  table($("#reqs")!, [{ key: "plan", label: "Plan" }, { key: "volume", label: "Volume" }, { key: "status", label: "Status", render: (r) => reqBadge(r.status) },
    { key: "created", label: "Filed", render: (r) => day(r.created) }, { key: "note", label: "Note", render: (r) => esc(r.note) },
    { key: "act", label: "", sort: () => null, render: (r) => reqActs(uid, r.plan, r.status, u.email) }], p.requests, { empty: "No upgrade requests." });
  wireActions(main(), () => user(uid).then(() => wireTips(main())));
}
const slotName = (s: string) => (s === "mcp" ? "MCP connector" : s === "all" ? "All keys" : esc(s));
const reqActs = (uid: string, plan: string, status: string, email: string | null) => status !== "pending" ? "" :
  actBtn("Approve", { type: "request.approve", uid, plan }, `Approve ${plan} for ${email || uid}? All their live keys move to ${plan === "api-business" ? "business" : "pro"}.`, "", true)
  + " " + actBtn("Decline", { type: "request.decline", uid, plan }, `Decline ${plan} for ${email || uid}?`, "danger", true);
const yn = (v: boolean | null) => (v == null ? "–" : v ? "On" : "Off");
const reqBadge = (s: string) => badge(s, s === "pending" ? "warn" : s === "approved" ? "good" : s === "declined" ? "bad" : "plain");
const epName = (ep: string) => (ep.startsWith("mcp_") ? `MCP · ${ep.slice(4)}` : ep.replace(/^post_/, "POST ").replace(/_/g, " / "));

// ── keys ──
async function keys() {
  const s = await snapshot(), K = s.keys as Row[], live = K.filter((k) => !k.revoked);
  const from7 = new Date(Date.now() - 7 * DAY).toISOString();
  const owners = new Set(live.map((k) => k.uid)).size;
  const used7 = live.filter((k) => String(k.lastUsed || "") >= from7).length;
  const plans: Record<string, number> = {};
  for (const k of live) plans[k.plan] = (plans[k.plan] || 0) + 1;
  main().innerHTML = head("API keys", s) + `
  <div class="tiles">
    ${tile("Active keys", n(live.length), `${n(K.length - live.length)} revoked`)}
    ${tile("Used this week", n(used7), `${pct(ratio(used7, live.length))} of active keys`)}
    ${tile("Never used", n(live.filter((k) => !k.lastUsed).length), "created, no calls yet")}
    ${tile("At the limit today", n(live.filter((k) => k.today >= k.limit).length), "candidates for Plus")}
    ${tile("Owners", n(owners), owners ? `${(live.length / owners).toFixed(1)} keys each on average` : "")}
  </div>
  <div class="grid2">
    <section class="card">${ch("Active keys by plan", "Free keys get 200 calls a day, Plus 20,000, Business 50,000.")}${ranked(Object.entries(plans).map(([name, value]) => ({ name: name === "pro" ? "Plus" : name[0].toUpperCase() + name.slice(1), value })).sort((a, b) => b.value - a.value))}</section>
    <section class="card">${weekBars(perWeek(K.map((k) => k.created)), "Keys created per week", "Including keys revoked since, last 8 weeks.", "Keys")}</section>
  </div>
  <h2 class="sec">All keys</h2>${note("Busiest first. Click a row to open the owner's profile.")}
  <div class="filters"><input id="q" type="search" placeholder="Search owner, key name or prefix" aria-label="Search">
    <select id="f" aria-label="Status"><option value="active">Active</option><option value="revoked">Revoked</option><option value="">All</option></select><span id="count" class="muted"></span></div><div id="tbl"></div>`;
  const cols: Col<Row>[] = [
    { key: "email", label: "Owner", render: (r) => userLink(r.uid, r.email) },
    { key: "name", label: "Key", render: (r) => `${esc(r.name)} <code>${esc(r.prefix)}…</code>` },
    { key: "plan", label: "Plan", render: (r) => planBadge(r.plan) },
    { key: "created", label: "Created", render: (r) => day(r.created) },
    { key: "lastUsed", label: "Last used", render: (r) => ago(r.lastUsed) },
    { key: "today", label: "Today", num: true, render: (r) => `${n(r.today)} <small class="muted">/ ${n(r.limit)}</small>${r.today >= r.limit ? " " + badge("At limit", "warn") : ""}` },
    { key: "calls30", label: "30 days", num: true, render: (r) => n(r.calls30) },
  ];
  const draw = () => {
    const q = $<HTMLInputElement>("#q")!.value.toLowerCase().trim(), f = $<HTMLSelectElement>("#f")!.value;
    const rows = (s.keys as Row[]).filter((k) => (!f || (f === "revoked") === k.revoked) && (!q || [k.email, k.name, k.prefix, k.uid].some((x) => String(x || "").toLowerCase().includes(q))));
    $("#count")!.textContent = `${n(rows.length)} keys`;
    table($("#tbl")!, cols, rows, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "calls30", desc: true }, empty: "No keys match." });
  };
  draw();
  ["#q", "#f"].forEach((id) => $(id)!.addEventListener("input", draw));
  wireRefresh();
}

// ── usage ──
async function usage() {
  const s = await snapshot(), t = s.totals, ser = s.series as Row[], U = s.users as Row[];
  const c7 = sumKey(ser.slice(-7), "calls"), cPrev = sumKey(ser.slice(-14, -7), "calls");
  const peak = ser.reduce<Row | null>((b, d) => (d.calls > (b?.calls || 0) ? d : b), null);
  const callers = U.filter((u) => u.calls30 > 0).sort((a, b) => b.calls30 - a.calls30);
  const top5 = ratio(callers.slice(0, 5).reduce((x, u) => x + u.calls30, 0), callers.reduce((x, u) => x + u.calls30, 0));
  const dow = DOW.map((d) => ({ dow: d, calls: 0 }));
  for (const r of ser) dow[(new Date(r.day + "T00:00:00Z").getUTCDay() + 6) % 7].calls += Number(r.calls || 0);
  main().innerHTML = head("Usage", s) + `
    <div class="tiles">
      ${tile("Calls today", n(t.calls.today), "API and AI connector")}
      ${tile("Calls (7 days)", `${n(c7)} ${delta(c7, cPrev)}`, `${n(cPrev)} the week before`)}
      ${tile("Calls (30 days)", n(t.calls.d30), `${n(Math.round(t.calls.d30 / 30))} a day on average`)}
      ${tile("Busiest day", peak ? n(peak.calls) : "–", peak ? day(peak.day) : "no calls yet")}
      ${tile("AI connector share", pct(ratio(t.calls.mcp30, t.calls.d30)), `${n(t.calls.mcp30)} connector calls in 30 days`)}
      ${tile("Accounts calling", n(callers.length), top5 != null ? `the top 5 make ${pct(top5)} of calls` : "in the last 30 days")}
    </div>
    <section class="card">${bars(ser, [{ key: "api", label: "API", color: S1 }, { key: "mcp", label: "MCP", color: S2 }], { x: "day", title: "Calls per day (30 days)", sub: "API keys and the AI connector, all accounts." })}</section>
    <div class="grid2">
      <section class="card">${bars(ser, [{ key: "active", label: "Accounts", color: S1 }], { x: "day", title: "Accounts making calls, per day", sub: "How many different accounts called each day.", total: false })}</section>
      <section class="card">${bars(dow, [{ key: "calls", label: "Calls", color: S1 }], { x: "dow", xLabel: (v) => v, kind: "bars", title: "Calls by weekday", sub: "Last 30 days added up by day of the week. Match days drive the peaks." })}</section>
    </div>
    <div class="grid2"><section class="card"><h2>Top endpoints and tools (30 days)</h2>${note("Older calls were counted by category only, so totals here can be lower than the category list.")}${ranked((s.endpoints as Row[]).slice(0, 20).map((e) => ({ name: epName(e.ep), value: e.calls })))}</section>
      <section class="card"><h2>By category (30 days)</h2>${note("Analytics, simulation and modelling, graphics and the AI connector.")}${ranked(Object.entries(s.cats as Row).map(([k, v]) => ({ name: k, value: Number(v) })).sort((a, b) => b.value - a.value))}
      <h2 style="margin-top:20px">Top accounts (30 days)</h2>${note("Who makes the most calls.")}${ranked((s.users as Row[]).filter((u) => u.calls30).sort((a, b) => b.calls30 - a.calls30).slice(0, 10).map((u) => ({ name: u.email || u.uid, value: u.calls30, href: `#/user/${u.uid}` })))}</section></div>
    <section class="card"><h2>Hit the daily limit</h2>${note("Accounts that ran out of calls in the last 30 days. Good leads for Plus.")}<div id="lim"></div></section>`;
  table($("#lim")!, [{ key: "email", label: "Account", render: (r) => userLink(r.uid, r.email) }, { key: "day", label: "Day", render: (r) => day(r.day) },
    { key: "slot", label: "Key", render: (r) => slotName(r.slot) }, { key: "calls", label: "Calls", num: true, render: (r) => `${n(r.calls)} / ${n(r.limit)}` }], s.limitHits,
    { rowHref: (r) => `/user/${r.uid}`, initial: { key: "day", desc: true }, empty: "Nobody hit a limit in the last 30 days.", limit: 15 });
  wireRefresh();
}

// ── requests ──
async function requests() {
  const s = await snapshot(), Q = s.requests as Row[];
  const st = (x: string) => Q.filter((r) => r.status === x);
  const oldest = st("pending").reduce<string | null>((o, r) => (!o || (r.created && r.created < o) ? r.created : o), null);
  main().innerHTML = head("Upgrade requests", s) + `
    <div class="tiles">
      ${tile("Waiting", n(st("pending").length), oldest ? `oldest filed ${daysText(waitedDays(oldest))}${waitedDays(oldest) ? " ago" : ""}` : "nothing waiting")}
      ${tile("Approved", n(st("approved").length), "all time")}
      ${tile("Declined", n(st("declined").length), "all time")}
      ${tile("API Plus asked", n(Q.filter((r) => r.plan === "api-pro").length), `${n(Q.filter((r) => r.plan === "api-business").length)} asked for Business`)}
    </div>
    ${note("Approving moves all of the account's live keys to the plan within a minute. Payment isn't automatic: approve once they've paid or agreed terms.")}
    <div class="filters"><select id="f" aria-label="Status"><option value="">All requests</option><option value="pending">Waiting</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select><span id="count" class="muted"></span></div>
    <div id="tbl"></div>`;
  const draw = () => { const f = $<HTMLSelectElement>("#f")!.value, rows = Q.filter((r) => !f || r.status === f);
  $("#count")!.textContent = `${n(rows.length)} requests`;
  table($("#tbl")!, [{ key: "email", label: "Account", render: (r) => userLink(r.uid, r.email) }, { key: "plan", label: "Plan" },
    { key: "volume", label: "Volume" }, { key: "status", label: "Status", render: (r) => reqBadge(r.status), sort: (r) => (r.status === "pending" ? "0" : r.status) },
    { key: "created", label: "Filed", render: (r) => when(r.created) }, { key: "note", label: "Note", render: (r) => esc(r.note) },
    { key: "act", label: "", sort: () => null, render: (r) => reqActs(r.uid, r.plan, r.status, r.email) }],
    rows, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "status", desc: false }, empty: "No requests match." });
  wireActions($("#tbl")!, () => route()); };
  draw();
  $("#f")!.addEventListener("input", draw);
  wireRefresh();
}

// ── the Android app: downloads, installs, active users, versions, and the accounts using it ──
async function appPage() {
  const [d, s] = await Promise.all([api("/api/app"), snapshot()]);
  const R = (d.releases || []) as Row[], ga = d.ga as Row | null, U = s.users as Row[];
  const latest = d.app?.version ? String(d.app.version) : R[0]?.version;
  const total = sumOf(R, "downloads"), latestRel = R.find((r) => r.version === latest) || R[0];
  const sinceIso = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const onApp = (days: number) => U.filter((u) => u.lastApp && String(u.lastApp) >= sinceIso(days));
  const app30 = onApp(30), app7 = onApp(7), app1 = onApp(1);
  const onLatest = app30.filter((u) => u.appVersion === latest).length;
  const daily = (ga?.daily || []) as Row[];
  const installs30 = sumOf(daily, "installs"), removes30 = sumOf(daily, "removes"), updates30 = sumOf(daily, "updates");
  const count = (rows: Row[], f: (u: Row) => string | null | undefined) => {
    const m: Record<string, number> = {};
    for (const u of rows) { const k = f(u); if (k) m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const recentRel = R.slice(0, 12).reverse();
  main().innerHTML = head("App") + `
    <div class="tiles">
      ${tile("APK downloads", n(total), `all ${n(R.length)} releases · updates included`)}
      ${tile("Latest version", esc(latest || "–"), latestRel ? `${n(latestRel.downloads)} downloads since ${day(latestRel.at)}` : "")}
      ${tile("Active installs (28 days)", ga ? n(ga.d28) : "–", ga ? `${n(ga.d7)} in 7 days · ${n(ga.today)} today` : "Google Analytics not connected")}
      ${tile("Installs, 30 days", ga ? n(installs30) : "–", ga ? `${n(removes30)} uninstalled · net ${installs30 - removes30 >= 0 ? "+" : ""}${n(installs30 - removes30)}` : "")}
      ${tile("Signed-in accounts on the app", n(app30.length), `${n(app7.length)} in 7 days · ${n(app1.length)} today`)}
      ${tile("On the latest version", pct(ratio(onLatest, app30.length)), `${n(onLatest)} of ${n(app30.length)} accounts on ${esc(latest || "–")}`)}
    </div>
    ${note("Three sources, each counting differently. Downloads: every APK fetched from our releases, including updates and repeat downloads, so it's higher than the number of phones. Active installs, installs and uninstalls: Google Analytics, only from phones that allowed usage analytics in the app, so it's a lower bound. Signed-in accounts: every account that opened the app while signed in, recorded by our API from 26 Nov 2026 (the app needs sign-in, so this is close to the real number of active app users once 0.3.32 is out).")}
    <div class="grid2">
      <section class="card">${bars(recentRel.map((r) => ({ v: r.version, downloads: r.downloads })), [{ key: "downloads", label: "Downloads", color: S1 }],
        { x: "v", title: "Downloads by release", sub: "Last 12 releases, oldest first. Older releases stop growing once phones update." })}</section>
      <section class="card">${bars(daily.map((r) => ({ day: r.day, users: r.users })), [{ key: "users", label: "Active users", color: S2 }],
        { x: "day", title: "Daily active app users", sub: "Google Analytics, app only, last 30 days." })}</section>
    </div>
    <section class="card">${bars(daily.map((r) => ({ day: r.day, installs: r.installs, removes: r.removes, updates: r.updates })),
      [{ key: "installs", label: "Installed and opened", color: S1 }, { key: "removes", label: "Uninstalled", color: S3 }, { key: "updates", label: "Updated", color: S2 }],
      { x: "day", title: "Installs, uninstalls and updates per day", sub: `Google Analytics, last 30 days: ${n(installs30)} installs, ${n(removes30)} uninstalls, ${n(updates30)} updates.` })}</section>
    <div class="grid2">
      <section class="card">${ch("App versions", "Signed-in accounts active in 30 days, by the version they last opened.")}${ranked(count(app30, (u) => u.appVersion ? `${u.appVersion}${u.appVersion === latest ? " (latest)" : ""}` : "Unknown"))}</section>
      <section class="card">${ch("Android versions", "Signed-in accounts active in 30 days.")}${ranked(count(app30, (u) => u.appOs || "Unknown"))}</section>
    </div>
    <div class="grid2">
      <section class="card">${ch("Cities", "Where app accounts last opened it, from their network. Approximate.")}${ranked(count(app30, (u) => (u.place ? placeText(u.place) : null)).slice(0, 12))}</section>
      <section class="card">${ch("Website, app or both", "Accounts active in 30 days and where they use CricSynthesis.")}${ranked([["app", "App only"], ["both", "Website and app"], ["web", "Website only"]].map(([k, name]) => ({ name, value: U.filter((u) => u.activeOn === k).length })))}</section>
    </div>
    ${ga ? `<div class="grid2">
      <section class="card">${ch("Phones", "Google Analytics, active users in 28 days.")}${ranked(ga.models)}</section>
      <section class="card">${ch("Engagement", "Google Analytics, app only, 28 days.")}<dl class="dl">
        <dt>Sessions</dt><dd>${n(ga.sessions28)} (${n(ga.sessions7)} in 7 days)</dd>
        <dt>Sessions per user</dt><dd>${ga.d28 ? (ga.sessions28 / ga.d28).toFixed(1) : "–"}</dd>
        <dt>Average session</dt><dd>${dur(ga.avgSession)}</dd>
        <dt>Screens per user</dt><dd>${Number(ga.screensPerUser || 0).toFixed(1)}</dd>
        <dt>Stickiness (today ÷ 28 days)</dt><dd>${pct(ratio(ga.today, ga.d28))}</dd></dl>
        ${ga.countries?.length ? `<p class="muted">Countries: ${(ga.countries as Row[]).slice(0, 6).map((c) => `${esc(c.name)} ${n(c.value)}`).join(" · ")}</p>` : ""}</section>
    </div>` : ""}
    <h2 class="sec">Accounts using the app</h2>${note("Signed-in accounts that opened the app in the last 30 days, most recent first. Click a row for their 3-day history.")}
    <div id="appusers"></div>
    <section class="card" style="margin-top:16px"><h2>Releases</h2>${note("Every Android release and its APK downloads.")}<div id="rels"></div></section>`;
  table($("#appusers")!, [{ key: "email", label: "Account", render: (r) => userLink(r.uid, r.email) },
    { key: "lastApp", label: "Last opened", render: (r) => `<span title="${esc(when(r.lastApp))}">${ago(r.lastApp)}</span>` },
    { key: "appVersion", label: "Version", render: (r) => `${esc(r.appVersion || "–")}${r.appVersion && r.appVersion !== latest ? ` ${badge("Old", "warn")}` : ""}` },
    { key: "appOs", label: "Android", render: (r) => esc(r.appOs || "–") },
    { key: "place", label: "Location", render: (r) => esc(placeText(r.place)), sort: (r) => placeText(r.place) },
    { key: "activeOn", label: "Also on", render: (r) => (r.activeOn === "both" ? "Website" : "–") },
    { key: "firstApp", label: "First opened", render: (r) => day(r.firstApp) },
    { key: "tier", label: "Subscription", render: (r) => tierCell(r.tier || "free", r.tag, r.until), sort: (r) => r.tier || "free" }],
    app30, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "lastApp", desc: true }, limit: 100, empty: "No signed-in app opens recorded yet. They appear once app 0.3.32 is installed." });
  table($("#rels")!, [{ key: "version", label: "Version", render: (r) => `${esc(r.version)}${r.version === latest ? ` ${badge("Latest", "good")}` : ""}` },
    { key: "at", label: "Released", render: (r) => day(r.at) }, { key: "downloads", label: "Downloads", num: true, render: (r) => n(r.downloads) },
    { key: "tag", label: "Tag", render: (r) => `<code>${esc(r.tag)}</code>` }], R, { initial: { key: "at", desc: true }, limit: 30, empty: "No releases found." });
  wireRefresh();
}

// ── payments (CricSynthesis Pro: what didn't go through, and where: website or app) ──
const WHERE: Record<string, string> = { web: "Website", app: "App", unknown: "Not recorded" };
const KIND: Record<string, [string, "bad" | "warn" | "plain" | "info"]> = {
  failed: ["Payment failed", "bad"], error: ["Checkout error", "warn"], closed: ["Closed without paying", "plain"],
  "renewal failed": ["Renewal failed", "bad"], halted: ["Renewals stopped", "bad"] };
const WHY: Record<string, string> = { price: "It costs too much", "not-using": "Don't use it enough", "season-over": "Their cricket is over for now",
  "not-useful": "Forecasts weren't useful", technical: "Something didn't work", other: "Something else" };
const STATUS_NAME: Record<string, string> = { created: "Checkout started", trial: "On the free day", active: "Paying", past_due: "Payment overdue",
  halted: "Halted", cancelled: "Cancelled", paused: "Paused", ended: "Ended" };
const statusName = (r: Row) => (r.status === "paused" ? (r.pausedByUs ? "Paused for a month" : "Autopay paused") : STATUS_NAME[r.status] || r.status || "–");
async function payments(filter = "") {
  const [p, s] = await Promise.all([api("/api/payments"), snapshot()]);
  const email = new Map((s.users as Row[]).map((u) => [u.uid, u.email]));
  const from30 = new Date(Date.now() - 30 * DAY).toISOString();
  const E = ((p.events || []) as Row[]).filter((e) => String(e.at || "") >= from30).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const S = (p.subs || []) as Row[];
  const srcs = ["web", "app", "unknown"];
  const count = (f: (e: Row) => boolean) => E.filter(f).length;
  const bad = (e: Row) => e.kind === "failed" || e.kind === "renewal failed" || e.kind === "halted";
  const failedBy = (w: string) => count((e) => bad(e) && (e.where || "unknown") === w);
  const failTotal = count(bad);
  // per day, failures split by where
  const days: Row[] = [];
  for (let i = 29; i >= 0; i--) days.push({ day: new Date(Date.now() - i * DAY).toISOString().slice(0, 10), web: 0, app: 0, unknown: 0 });
  for (const e of E) if (bad(e) || e.kind === "error") { const d = days.find((x) => x.day === String(e.at).slice(0, 10)); if (d) d[(e.where as string) in d ? (e.where as string) : "unknown"]++; }
  const by = (f: (e: Row) => string, rows = E.filter((e) => bad(e) || e.kind === "error")) => {
    const m: Record<string, number> = {};
    for (const e of rows) { const k = f(e) || "Not given"; m[k] = (m[k] || 0) + 1; }
    return ranked(Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10));
  };
  const show = filter ? E.filter((e) => (filter === "failures" ? bad(e) : (e.where || "unknown") === filter)) : E;
  const tab = (k: string, label: string) => `<a class="btn ${k === filter ? "" : "ghost"} sm" href="#/payments/${k}">${label}</a>`;
  main().innerHTML = head("Payments") + `
    <div class="tiles">
      ${tile("Failed payments (30 days)", n(failTotal), `${n(count((e) => e.kind === "failed"))} at checkout · ${n(count((e) => e.kind === "renewal failed" || e.kind === "halted"))} renewals`)}
      ${tile("Failures on the website", n(failedBy("web")), pct(ratio(failedBy("web"), failTotal)) + " of failures")}
      ${tile("Failures in the app", n(failedBy("app")), pct(ratio(failedBy("app"), failTotal)) + " of failures")}
      ${tile("Checkout errors", n(count((e) => e.kind === "error")), "the payment window didn't open, or confirming the payment failed")}
      ${tile("Closed without paying", n(count((e) => e.kind === "closed")), `${n(count((e) => e.kind === "closed" && e.where === "web"))} website · ${n(count((e) => e.kind === "closed" && e.where === "app"))} app`)}
      ${tile("Paying now", n(S.filter((x) => x.status === "active").length), `${n(S.filter((x) => x.status === "trial").length)} on the free day · ${n(S.filter((x) => x.status === "past_due").length)} overdue`)}
    </div>
    ${note("Website or app is recorded from 26 Nov 2026. Earlier subscriptions show as Not recorded. Razorpay never sends card or UPI details, only the reason a payment failed.")}
    <section class="card"><h2>Website against app</h2>${note("Every outcome by where the customer was. A high failure count on one side points to a problem with that checkout.")}<div id="src"></div></section>
    <section class="card">${bars(days, [{ key: "web", label: "Website", color: S1 }, { key: "app", label: "App", color: S2 }, { key: "unknown", label: "Not recorded", color: S3 }],
      { x: "day", title: "Failures and errors per day", sub: "Failed payments, failed renewals and checkout errors, split by website or app." })}</section>
    <div class="grid2">
      <section class="card"><h2>Why payments failed</h2>${note("Razorpay's reason, most common first. Bank declines and cancelled UPI requests are usually on the customer's side.")}${by((e) => (e.description as string) || (e.reason as string))}</section>
      <section class="card"><h2>Where in the payment it failed</h2>${note("The step, and who Razorpay says caused it (customer, bank or gateway).")}${by((e) => [e.step, e.source].filter(Boolean).join(" · "))}</section>
    </div>
    <div class="grid2">
      <section class="card"><h2>By device</h2>${note("Android, iPhone or desktop browser, from the device that reported it.")}${by((e) => ({ android: "Android", ios: "iPhone or iPad", desktop: "Desktop", unknown: "Unknown" } as Row)[(e.device as string) || "unknown"])}</section>
      <section class="card"><h2>By plan</h2>${note("Monthly or yearly, at the time of the attempt.")}${by((e) => (e.billing === "yearly" ? "Yearly" : e.billing === "monthly" ? "Monthly" : ""))}</section>
    </div>
    <h2 class="sec">Every attempt (30 days)</h2>${note("Newest first. Click a row to open the account.")}
    <p class="msg-tabs">${tab("", `All (${E.length})`)} ${tab("failures", `Failures (${failTotal})`)} ${tab("web", "Website")} ${tab("app", "App")}</p>
    <div id="ev"></div>
    <div class="grid2">
      <section class="card"><h2>Why people cancel</h2>${note("The exit survey's answer when cancelling (optional for the customer).")}${ranked(Object.entries(S.filter((x) => x.cancelReason)
        .reduce((m: Record<string, number>, x) => { const k = WHY[x.cancelReason] || x.cancelReason; m[k] = (m[k] || 0) + 1; return m; }, {}))
        .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value))}
        ${S.filter((x) => x.cancelNote).slice(0, 8).map((x) => `<p class="muted">“${esc(x.cancelNote)}” <small>${userLink(x.uid, email.get(x.uid) || null)}</small></p>`).join("")}</section>
      <section class="card"><h2>Paused for a month</h2>${note("Paying customers who chose to pause instead of cancelling, and when they restart.")}
        <div id="paused"></div></section>
    </div>
    <section class="card" style="margin-top:16px"><h2>Subscriptions</h2>${note("Every Pro subscription by status, with where it started.")}<div id="subs"></div></section>`;
  table($("#src")!, [{ key: "w", label: "", render: (r) => esc(WHERE[r.w]) },
    { key: "paying", label: "Paying", num: true }, { key: "trial", label: "Free day", num: true }, { key: "overdue", label: "Overdue", num: true },
    { key: "failed", label: "Failed payments", num: true }, { key: "renewal", label: "Failed renewals", num: true },
    { key: "errors", label: "Checkout errors", num: true }, { key: "closed", label: "Closed", num: true }],
    srcs.map((w) => {
      const mine = (e: Row) => (e.where || "unknown") === w;
      return { w, paying: S.filter((x) => x.source === w && x.status === "active").length, trial: S.filter((x) => x.source === w && x.status === "trial").length,
        overdue: S.filter((x) => x.source === w && x.status === "past_due").length, failed: count((e) => mine(e) && e.kind === "failed"),
        renewal: count((e) => mine(e) && (e.kind === "renewal failed" || e.kind === "halted")), errors: count((e) => mine(e) && e.kind === "error"),
        closed: count((e) => mine(e) && e.kind === "closed") };
    }));
  table($("#ev")!, [{ key: "at", label: "When", render: (r) => `<span title="${esc(r.at)}">${when(r.at)}</span>` },
    { key: "uid", label: "Account", render: (r) => userLink(r.uid, email.get(r.uid) || null) },
    { key: "kind", label: "What happened", render: (r) => badge(KIND[r.kind]?.[0] || r.kind, KIND[r.kind]?.[1] || "plain") },
    { key: "where", label: "Where", render: (r) => `${esc(WHERE[r.where || "unknown"])}${r.device && r.device !== "unknown" ? ` <small class="muted">${esc(r.device)}</small>` : ""}` },
    { key: "billing", label: "Plan", render: (r) => esc(r.billing || "–") },
    { key: "reason", label: "Reason", render: (r) => `${esc(r.description || r.reason || "–")}${r.code ? ` <small class="muted">${esc(r.code)}</small>` : ""}` },
    { key: "paymentId", label: "Payment", render: (r) => (r.paymentId ? `<code>${esc(r.paymentId)}</code>` : "–") }],
    show, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "at", desc: true }, limit: 100, empty: "Nothing recorded in the last 30 days." });
  table($("#subs")!, [{ key: "uid", label: "Account", render: (r) => userLink(r.uid, email.get(r.uid) || null) },
    { key: "status", label: "Status", render: (r) => esc(statusName(r)) },
    { key: "source", label: "Started on", render: (r) => esc(WHERE[r.source || "unknown"]) },
    { key: "billing", label: "Plan", render: (r) => esc(r.billing || "–") },
    { key: "proUntil", label: "Pro until", render: (r) => day(r.proUntil) },
    { key: "cancelReason", label: "Why cancelled", render: (r) => esc(r.cancelReason ? WHY[r.cancelReason] || r.cancelReason : "–") },
    { key: "updated", label: "Last change", render: (r) => ago(r.updated) }],
    S, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "updated", desc: true }, empty: "No subscriptions yet." });
  table($("#paused")!, [{ key: "uid", label: "Account", render: (r) => userLink(r.uid, email.get(r.uid) || null) },
    { key: "proUntil", label: "Pro until", render: (r) => day(r.proUntil) }, { key: "resumeOn", label: "Restarts", render: (r) => day(r.resumeOn) }],
    S.filter((x) => x.status === "paused" && x.pausedByUs), { empty: "Nobody has paused." });
  wireRefresh();
}

// ── messages (the website's contact form, contactMessages/{id}) ──
const MSG_STATUS: Record<string, [string, "warn" | "good" | "plain"]> = { new: ["New", "warn"], replied: ["Replied", "good"], closed: ["Closed", "plain"] };
async function messages(filter = "") {
  const all = ((await api("/api/messages")).messages || []) as Row[];
  const show = filter === "all" ? all : filter === "unread" ? all.filter((m) => !m.read) : all.filter((m) => m.status === (filter || "new"));
  const count = (st: string) => all.filter((m) => m.status === st).length;
  const unread = all.filter((m) => !m.read).length;
  const tab = (k: string, label: string) => `<a class="btn ${k === (filter || "new") ? "" : "ghost"} sm" href="#/messages/${k}">${label}</a>`;
  const reply = (m: Row) => `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: your message to CricSynthesis (${m.topic})`)}` +
    `&body=${encodeURIComponent(`Hi ${String(m.name || "").split(/\s+/)[0]},\n\n\n\n---\nYou wrote on ${day(m.at)}:\n${m.message}`)}`;
  const acts = (m: Row) => [
    `<a class="btn xs" href="${esc(reply(m))}">Reply by email</a>`,
    m.status !== "replied" ? actBtn("Mark replied", { type: "contact.status", id: m.id, status: "replied" }, `Mark the message from ${m.email} as replied?`) : "",
    m.status !== "closed" ? actBtn("Close", { type: "contact.status", id: m.id, status: "closed" }, `Close the message from ${m.email} (no reply needed)?`) : "",
    m.status !== "new" ? actBtn("Reopen", { type: "contact.status", id: m.id, status: "new" }, `Move the message from ${m.email} back to New?`) : "",
    `<button class="btn ghost xs" data-read='${esc(JSON.stringify({ type: "contact.read", id: m.id, read: !m.read }))}'>${m.read ? "Mark unread" : "Mark read"}</button>`,
    actBtn("Delete", { type: "contact.delete", id: m.id }, `Delete the message from ${m.email} for good? It can't be recovered.`, "danger"),
  ].join(" ");
  const oldestNew = all.filter((m) => m.status === "new").reduce<string | null>((o, m) => (!o || m.at < o ? m.at : o), null);
  const topics: Record<string, number> = {};
  for (const m of all) topics[m.topic || "Other"] = (topics[m.topic || "Other"] || 0) + 1;
  const topTopic = Object.entries(topics).sort((a, b) => b[1] - a[1])[0];
  const last30 = all.filter((m) => Date.now() - Date.parse(m.at) < 30 * DAY).length;
  main().innerHTML = head("Messages") + `
    <div class="tiles">
      ${tile("Waiting for a reply", n(count("new")), oldestNew ? `oldest sent ${daysText(waitedDays(oldestNew))}${waitedDays(oldestNew) ? " ago" : ""}` : "inbox clear")}
      ${tile("Replied", n(count("replied")), `${n(count("closed"))} closed without a reply`)}
      ${tile("Unread", n(unread), "not opened by anyone yet")}
      ${tile("Last 30 days", n(last30), `${n(all.length)} in total`)}
      ${tile("Most common topic", topTopic ? esc(topTopic[0]) : "–", topTopic ? `${n(topTopic[1])} messages` : "")}
    </div>
    ${note("From the contact form at cricsynthesis.in/contact. Each sender got an automatic thank-you email. Reply from your own inbox, then mark it replied.")}
    <p class="msg-tabs">${tab("new", `New (${count("new")})`)} ${tab("replied", `Replied (${count("replied")})`)} ${tab("closed", `Closed (${count("closed")})`)} ${tab("unread", `Unread (${unread})`)} ${tab("all", `All (${all.length})`)}</p>
    ${show.length ? show.map((m) => `<article class="card msg${m.read ? "" : " unread"}">
      <div class="msg-head"><div><b>${esc(m.name)}</b> · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.company ? ` · ${esc(m.company)}` : ""}
        ${m.uid ? ` · ${userLink(m.uid, "account")}` : ""}</div>
        <div class="muted">${m.read ? "" : `${badge("Unread", "info")} `}${badge(MSG_STATUS[m.status]?.[0] || m.status, MSG_STATUS[m.status]?.[1] || "plain")} ${esc(m.topic)} · <span title="${esc(m.at)}">${when(m.at)}</span>${m.country ? ` · ${esc(m.country)}` : ""}</div></div>
      <p class="msg-body">${esc(m.message)}</p>
      <div class="msg-foot">${acts(m)}${m.statusBy ? `<span class="muted">${esc(MSG_STATUS[m.status]?.[0] || m.status)} by ${esc(m.statusBy)} ${when(m.statusAt)}</span>` : ""}</div>
    </article>`).join("") : `<p class="empty">${filter === "all" ? "No messages yet." : "Nothing here."}</p>`}`;
  wireActions(main(), () => route());
  // read / unread: no confirmation, it's harmless and easy to undo
  $$<HTMLButtonElement>("button[data-read]", main()).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await api("/api/action", { method: "POST", body: JSON.stringify(JSON.parse(b.dataset.read!)) }); route(); }
    catch (e) { b.disabled = false; toast((e as Error).message, true); }
  }));
}

// ── applications (the careers page's form, applications/{id}; resume chunks in resume/{n}) ──
const APP_ST: Record<string, [string, "warn" | "good" | "bad" | "info" | "plain"]> = { new: ["New", "warn"], reviewing: ["Reviewing", "info"],
  shortlisted: ["Shortlisted", "good"], declined: ["Declined", "plain"], hired: ["Hired", "good"] };
async function applications(filter = "") {
  const all = ((await api("/api/applications")).applications || []) as Row[];
  const f = filter || "open";
  const show = f === "all" ? all : f === "open" ? all.filter((a) => ["new", "reviewing"].includes(a.status)) : all.filter((a) => a.status === f);
  const count = (st: string) => all.filter((a) => a.status === st).length;
  const tab = (k: string, label: string) => `<a class="btn ${k === f ? "" : "ghost"} sm" href="#/applications/${k}">${label}</a>`;
  const kb = (b: number) => !b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  const link = (u: string) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, "").slice(0, 48))}</a>`;
  const row = (k: string, v: string | null) => v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : "";
  const acts = (a: Row) => [
    a.resume && a.stored ? `<a class="btn xs" href="/api/application-resume?id=${encodeURIComponent(a.id)}">Download resume${a.resume.bytes ? ` (${kb(a.resume.bytes)})` : ""}</a>` : "",
    `<a class="btn ghost xs" href="mailto:${esc(encodeURIComponent(a.email))}?subject=${esc(encodeURIComponent(`Your application: ${a.jobTitle}`))}">Email</a>`,
    a.status === "new" ? actBtn("Reviewing", { type: "application.status", id: a.id, status: "reviewing" }, `Mark ${a.name}'s application as being reviewed?`) : "",
    a.status !== "shortlisted" ? actBtn("Shortlist", { type: "application.status", id: a.id, status: "shortlisted" },
      `Shortlist ${a.name}? They get a "next steps" email; add an optional note for them.`, "", true) : "",
    a.status !== "declined" ? actBtn("Decline", { type: "application.status", id: a.id, status: "declined" },
      `Decline ${a.name}? They get a polite "not this time" email; add an optional note for them.`, "", true) : "",
    a.status === "shortlisted" ? actBtn("Hired", { type: "application.status", id: a.id, status: "hired" }, `Mark ${a.name} as hired (no email)?`) : "",
    actBtn("Delete", { type: "application.delete", id: a.id }, `Delete ${a.name}'s application and resume for good? It can't be recovered.`, "danger"),
  ].join(" ");
  const oldestOpen = all.filter((a) => ["new", "reviewing"].includes(a.status)).reduce<string | null>((o, a) => (!o || a.at < o ? a.at : o), null);
  const roles: Record<string, number> = {};
  for (const a of all) roles[a.jobTitle || "Other"] = (roles[a.jobTitle || "Other"] || 0) + 1;
  const topRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0];
  main().innerHTML = head("Applications") + `
    <div class="tiles">
      ${tile("To review", n(count("new") + count("reviewing")), oldestOpen ? `oldest sent ${daysText(waitedDays(oldestOpen))}${waitedDays(oldestOpen) ? " ago" : ""}` : "nothing waiting")}
      ${tile("Shortlisted", n(count("shortlisted")), `${n(count("hired"))} hired`)}
      ${tile("Declined", n(count("declined")), "told by email")}
      ${tile("Most applied for", topRole ? esc(topRole[0]) : "–", topRole ? `${n(topRole[1])} applications` : "")}
    </div>
    ${note("From the careers page. Each applicant got a confirmation, and the team inbox got the details with the resume. Shortlist or decline here to send the outcome email.")}
    <p class="msg-tabs">${tab("open", `Open (${count("new") + count("reviewing")})`)} ${tab("shortlisted", `Shortlisted (${count("shortlisted")})`)} ${tab("declined", `Declined (${count("declined")})`)} ${tab("hired", `Hired (${count("hired")})`)} ${tab("all", `All (${all.length})`)}</p>
    ${show.length ? show.map((a) => `<article class="card msg${a.status === "new" ? " unread" : ""}">
      <div class="msg-head"><div><b>${esc(a.name)}</b> · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a> · ${esc(a.phone || "")}</div>
        <div class="muted">${badge(APP_ST[a.status]?.[0] || a.status, APP_ST[a.status]?.[1] || "plain")} ${esc(a.jobTitle)} · <span title="${esc(a.at)}">${when(a.at)}</span>${a.country ? ` · ${esc(a.country)}` : ""}</div></div>
      <dl class="dl app-dl">${row("City", esc(a.city || ""))}${row("Experience", esc(a.experience || ""))}${row("Notice", esc(a.notice || ""))}
        ${row("Employer", a.employer ? esc(a.employer) : null)}${row("Designation", a.designation ? esc(a.designation) : null)}${row("Qualification", esc(a.qualification || ""))}
        ${row("Portfolio", a.portfolio ? link(a.portfolio) : null)}${row("LinkedIn", a.linkedin ? link(a.linkedin) : null)}${row("Tools", a.tools ? esc(a.tools) : null)}
        ${row("Heard via", a.heard ? esc(a.heard) : null)}${row("Gender", a.gender ? esc(a.gender) : null)}</dl>
      ${a.notes ? `<p class="msg-body">${esc(a.notes)}</p>` : ""}
      ${a.note ? `<p class="muted small">Note sent: ${esc(a.note)}</p>` : ""}
      ${!a.stored ? `<p class="err">The resume didn't finish saving: ask them to email it.</p>` : ""}
      <div class="msg-foot">${acts(a)}${a.statusBy ? `<span class="muted">${esc(APP_ST[a.status]?.[0] || a.status)} by ${esc(a.statusBy)} ${when(a.statusAt)}</span>` : ""}</div>
    </article>`).join("") : `<p class="empty">${f === "all" ? "No applications yet." : "Nothing here."}</p>`}`;
  wireActions(main(), () => route());
}

// ── growth helpers ──
const dur = (secs: number | null | undefined) => (secs == null ? "–" : secs < 60 ? `${Math.round(secs)} s` : `${Math.floor(secs / 60)} m ${String(Math.round(secs % 60)).padStart(2, "0")} s`);
const bytes = (b: number | null | undefined) => (b == null ? "–" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.round(b / 1e3)} KB`);
const warnBox = (errs?: string[]) => (errs?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "");
const sumOf = (rows: Row[] | undefined, k: string, from = 0, to?: number) => (rows || []).slice(from, to).reduce((s, r) => s + Number(r[k] || 0), 0);
const path0 = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

// ── product (Google Analytics 4: visitors who accepted analytics cookies) ──
const EVENT_NAMES: Record<string, string> = { page_view: "Page views", match_view: "Match opened", match_tab: "Match tab opened",
  lab_run: "Lab scenario run", sign_up: "Sign-up", login: "Sign-in", api_key_created: "API key created",
  upgrade_request: "Upgrade request", app_download: "App download", session_start: "Session started", first_visit: "First visit",
  user_engagement: "Engaged", scroll: "Scrolled to bottom", click: "Outbound click", file_download: "File download", info_open: "ⓘ explanation opened" };
async function product() {
  const [g, t] = await Promise.all([api("/api/product"), api("/api/traffic").catch(() => null)]);
  const D = (g.daily || []) as Row[];
  const cur = g.week?.cur as Row | null, prev = g.week?.prev as Row | null;
  const visits7 = t?.rum ? sumOf(t.rum.days, "visits", -7) : null;
  const rate = visits7 && cur?.users ? Math.min(1, cur.users / visits7) : null;
  const top = (g.funnel?.[0]?.users as number) || 0;
  const nvr = Object.fromEntries((g.newVsReturning || []).map((r: Row) => [r.name, r.value]));
  const returning = (nvr.returning || 0) / Math.max(1, (nvr.returning || 0) + (nvr.new || 0));
  const wk = (label: string, k: string, fmt: (v: number) => string, sub: string, lowerBetter = false) =>
    tile(label, cur?.[k] != null ? `${fmt(cur[k])} ${prev?.[k] != null ? delta(cur[k], prev[k], lowerBetter) : ""}` : "–", prev?.[k] != null ? `${fmt(prev[k])} the week before · ${sub}` : sub);
  const perSess = (r: Row | null) => (r?.sessions ? r.views / r.sessions : null);
  main().innerHTML = head("Product (Google Analytics)") + `<p class="muted">Only visitors who accepted analytics cookies. Property ${esc(g.property || "–")} ·
      updated ${ago(g.built)} · <a href="https://analytics.google.com/analytics/web/#/p${esc(g.property || "")}/reports/intelligenthome" target="_blank" rel="noopener">Open GA4</a></p>`
    + warnBox(g.errors) + `
    <h2 class="sec">This week</h2>${note("Last 7 days, each against the 7 days before.")}
    <div class="tiles">
      ${wk("Users", "users", n, "people who visited")}
      ${wk("New users", "newUsers", n, "first visit ever")}
      ${wk("Sessions", "sessions", n, "visits, one person can make several")}
      ${wk("Engagement rate", "engagementRate", (v) => pct(v), "sessions over 10 s, 2+ pages or a key action")}
      ${wk("Time per session", "avgSession", dur, "average, all sessions")}
      ${tile("Pages per session", perSess(cur) != null ? `${perSess(cur)!.toFixed(1)} ${perSess(prev) != null ? delta(perSess(cur)!, perSess(prev)!) : ""}` : "–", "page views ÷ sessions")}
      ${tile("Active right now", n(g.realtime), "last 30 minutes")}
      ${tile("Returning users", pct(returning), "of users in 30 days came back")}
      ${tile("Consent rate (est.)", pct(rate), visits7 ? `GA users ÷ ${n(visits7)} Cloudflare visits` : "needs Web Analytics data")}
    </div>
    ${D.length ? `<div class="grid2">
      <section class="card">${bars(D.map((r) => ({ day: r.day, fresh: r.newUsers, back: Math.max(0, r.users - r.newUsers) })),
        [{ key: "back", label: "Returning", color: S1 }, { key: "fresh", label: "New", color: S2 }], { x: "day", title: "Users per day", sub: "New against returning, last 30 days. Returning users are the ones who found it useful." })}</section>
      <section class="card">${bars(D.map((r) => ({ day: r.day, eng: r.engaged, not: Math.max(0, r.sessions - r.engaged) })),
        [{ key: "eng", label: "Engaged", color: S1 }, { key: "not", label: "Left quickly", color: S3 }], { x: "day", title: "Sessions per day", sub: "Engaged sessions against ones that left within 10 seconds on one page." })}</section>
    </div>` : ""}
    <section class="card"><h2>Funnel (30 days)</h2>${note("Users who did each step at least once, and the share of the step before: the lowest is the biggest drop. Hover for the share of all visitors. People who rejected cookies show up only on Users and API keys.")}
      ${g.funnel ? `<ol class="funnel">${(g.funnel as Row[]).map((f, i, all) => `<li>
        <span class="fl">${esc(f.label)}</span><span class="rb"><i style="width:${top ? (100 * f.users / top).toFixed(1) : 0}%"></i></span>
        <span class="rv">${n(f.users)}</span><span class="muted" title="${pct(top ? f.users / top : null, 1)} of all visitors">${i ? `${pct(all[i - 1].users ? f.users / all[i - 1].users : null)} of previous` : ""}</span></li>`).join("")}</ol>` : `<p class="empty">No funnel data.</p>`}</section>
    <div class="grid2">
      <section class="card"><h2>Landing pages (7 days)</h2>${note("The first page of each visit. A low engagement rate means the page doesn't lead people on.")}<div id="land"></div></section>
      <section class="card"><h2>Time on page (7 days)</h2>${note("Average engaged time per user on each page. Short times on long pages mean people skim or leave.")}<div id="time"></div></section>
    </div>
    <div class="grid2">
      <section class="card"><h2>Channels (7 days)</h2>${note("How visits arrive: search, social, other sites, or typed in.")}${ranked(((g.channels || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}</section>
      <section class="card"><h2>Sources (7 days)</h2>${note("The exact site or campaign behind each visit.")}${ranked(((g.sources || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}</section>
    </div>
    <div class="grid2">
      <section class="card"><h2>Countries (7 days)</h2>${note("Users by country.")}${ranked(((g.countries || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}
        <h2 style="margin-top:20px">Cities (7 days)</h2>${ranked(((g.cities || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}</section>
      <section class="card"><h2>Devices (7 days)</h2>${note("Phone, desktop or tablet.")}${ranked(((g.devices || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}
        <h2 style="margin-top:20px">Operating systems (7 days)</h2>${ranked(((g.os || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}</section>
    </div>
    <div class="grid2">
      <section class="card"><h2>Events (30 days)</h2>${note("Everything we track, with how many people did it.")}<div id="ev"></div></section>
      <section class="card"><h2>Top pages (7 days)</h2>${note("Most viewed pages.")}${ranked(((g.pages || []) as Row[]).map((r) => ({ name: r.name, value: r.value })))}</section>
    </div>`;
  table($("#land")!, [{ key: "name", label: "Page", render: (r) => esc(r.name) }, { key: "sessions", label: "Sessions", num: true, render: (r) => n(r.sessions) },
    { key: "engagement", label: "Engaged", num: true, render: (r) => `${pct(r.engagement)} ${r.engagement < 0.4 ? badge("Low", "warn") : ""}` }],
    g.landing || [], { initial: { key: "sessions", desc: true }, empty: "No landing pages yet." });
  table($("#time")!, [{ key: "name", label: "Page", render: (r) => esc(r.name) }, { key: "views", label: "Views", num: true, render: (r) => n(r.views) },
    { key: "users", label: "Users", num: true, render: (r) => n(r.users) }, { key: "secs", label: "Time per user", num: true, render: (r) => dur(r.secs) }],
    g.pageTime || [], { initial: { key: "views", desc: true }, empty: "No pages yet." });
  table($("#ev")!, [{ key: "name", label: "Event", render: (r) => `${esc(EVENT_NAMES[r.name] || r.name)} <small class="muted">${esc(r.name)}</small>` },
    { key: "count", label: "Count", num: true, render: (r) => n(r.count) }, { key: "users", label: "Users", num: true, render: (r) => n(r.users) },
    { key: "per", label: "Per user", num: true, sort: (r) => (r.users ? r.count / r.users : 0), render: (r) => (r.users ? (r.count / r.users).toFixed(1) : "–") }],
    g.events || [], { initial: { key: "count", desc: true }, empty: "No events yet." });
}

// ── UX (Microsoft Clarity: visitors who allowed session recordings) ──
const CLARITY_NAMES: Record<string, [string, string]> = {
  RageClickCount: ["Rage clicks", "Clicking the same spot again and again"], DeadClickCount: ["Dead clicks", "Clicks on things that don't respond"],
  QuickbackClick: ["Quick backs", "Opened a page and went straight back"], ScriptErrorCount: ["Script errors", "A JavaScript error during the visit"],
  ExcessiveScroll: ["Excessive scrolling", "Scrolling up and down looking for something"], ErrorClickCount: ["Error clicks", "A click that caused an error"],
  ScrollDepth: ["Scroll depth", "How far down pages people read"], EngagementTime: ["Engagement time", "Time actively using the page"],
  Traffic: ["Traffic", "Sessions, users and pages"], Browser: ["Browser", ""], Device: ["Device", ""], OS: ["Operating system", ""], Country: ["Country", ""], PageTitle: ["Page title", ""],
  ReferrerUrl: ["Referrer", ""], PopularPages: ["Popular pages", ""],
};
async function ux() {
  const c = await api("/api/ux");
  const link = `https://clarity.microsoft.com/projects/view/${esc(c.project || "zeyhpmwp0b")}/dashboard`;
  const list = (rows: Row[] | undefined, fmt = (v: number) => n(v)) => ranked((rows || []).map((r) => ({ name: path0(r.url), value: Number(r.value) })), fmt);
  const s = c.summary || {};
  const shareOf = (m: string) => { const r = s[m] || {}; return r.sessionsWithMetricPercentage != null ? Number(r.sessionsWithMetricPercentage) : null; };
  const share = (m: string) => { const v = shareOf(m), r = s[m] || {}; return v != null ? `${n(v)}%` : r.subTotal != null ? n(r.subTotal) : "–"; };
  const flag = (m: string, warnAt: number) => { const v = shareOf(m); return v == null ? "" : v >= warnAt ? ` ${badge("High", "bad")}` : ` ${badge("OK", "good")}`; };
  // one table of the pages with the most problems, all issues side by side
  const issues: [string, string][] = [["rage", "Rage"], ["dead", "Dead"], ["quickback", "Quick backs"], ["scriptErrors", "Errors"]];
  const byPage: Record<string, Row> = {};
  for (const [k] of issues) for (const r of (c[k] || []) as Row[]) { const p = path0(r.url); (byPage[p] ||= { page: p, total: 0 })[k] = r.value; byPage[p].total += Number(r.value || 0); }
  const scrollOf = Object.fromEntries(((c.scroll || []) as Row[]).map((r) => [path0(r.url), r.value]));
  main().innerHTML = head("UX (Microsoft Clarity)") + `<p class="muted">Last 3 days, visitors who allowed session recordings · updated ${ago(c.built)} · refreshed at most every 6 hours (Clarity allows 10 exports a day) ·
      <a href="${link}" target="_blank" rel="noopener">Open Clarity (heatmaps and recordings)</a></p>` + warnBox(c.errors) + `
    <div class="tiles">
      ${tile("Sessions (3 days)", n(c.sessions), c.bots != null ? `${n(c.bots)} bot sessions filtered` : "")}
      ${tile("Users (3 days)", n(c.users), c.sessions && c.users ? `${(c.sessions / c.users).toFixed(1)} sessions each` : "")}
      ${tile("Pages per session", c.pagesPerSession != null ? n(c.pagesPerSession) : "–", "how far people go")}
      ${tile("Rage clicks", share("RageClickCount") + flag("RageClickCount", 5), "of sessions · worry above 5%")}
      ${tile("Dead clicks", share("DeadClickCount") + flag("DeadClickCount", 10), "of sessions · worry above 10%")}
      ${tile("Quick backs", share("QuickbackClick") + flag("QuickbackClick", 15), "of sessions · worry above 15%")}
      ${tile("Script errors", share("ScriptErrorCount") + flag("ScriptErrorCount", 3), "of sessions · worry above 3%")}
      ${tile("Excessive scrolling", share("ExcessiveScroll") + flag("ExcessiveScroll", 10), "of sessions · people hunting for something")}
    </div>
    <section class="card"><h2>Pages with the most problems</h2>${note("Every issue for each page, side by side, worst first. Open the page in Clarity and watch a few replays before changing anything.")}<div id="worst"></div></section>
    <div class="grid2"><section class="card"><h2>Rage clicks by page</h2>${note("Clicking the same spot again and again, usually because something is slow or broken.")}${list(c.rage)}</section>
      <section class="card"><h2>Dead clicks by page</h2>${note("Clicks on things that don't respond. Often text or an image that looks clickable.")}${list(c.dead)}</section></div>
    <div class="grid2"><section class="card"><h2>Quick backs by page</h2>${note("Opened a page and went straight back. The page wasn't what they expected.")}${list(c.quickback)}</section>
      <section class="card"><h2>Script errors by page</h2>${note("A JavaScript error during the visit. Watch a replay in Clarity to see what broke.")}${list(c.scriptErrors)}</section></div>
    <div class="grid2"><section class="card"><h2>Average scroll depth by page</h2>${note("How far down people read. Below 40% means most never see the bottom half.")}${list(c.scroll, (v) => `${n(v)}%`)}</section>
      <section class="card"><h2>Most visited pages</h2>${note("Pages with the most recorded sessions.")}${list(c.traffic)}</section></div>
    <section class="card"><h2>Everything Clarity reports</h2>${note("The full summary for the last 3 days, for anything not shown above.")}<div id="all"></div></section>`;
  table($("#worst")!, [{ key: "page", label: "Page", render: (r) => esc(r.page) },
    ...issues.map(([k, label]) => ({ key: k, label, num: true, render: (r: Row) => (r[k] ? n(r[k]) : "–") })),
    { key: "scroll", label: "Scroll", num: true, sort: (r: Row) => scrollOf[r.page] ?? -1, render: (r: Row) => (scrollOf[r.page] != null ? `${n(scrollOf[r.page])}%` : "–") },
    { key: "total", label: "Total", num: true, render: (r) => n(r.total) }],
    Object.values(byPage), { initial: { key: "total", desc: true }, limit: 12, empty: "No problems recorded." });
  table($("#all")!, [{ key: "name", label: "Metric", render: (r) => `${esc(CLARITY_NAMES[r.name]?.[0] || r.name)}${CLARITY_NAMES[r.name]?.[1] ? `<small>${esc(CLARITY_NAMES[r.name][1])}</small>` : ""}` },
    { key: "share", label: "Sessions affected", num: true, render: (r) => (r.share != null ? `${n(r.share)}%` : "–") },
    { key: "count", label: "Count", num: true, render: (r) => n(r.count) }],
    Object.entries(s).map(([name, r]: [string, any]) => ({ name, share: r.sessionsWithMetricPercentage ?? null, count: r.subTotal ?? r.sessionsCount ?? r.totalSessionCount ?? null })),
    { initial: { key: "share", desc: true }, empty: "No summary yet." });
}

// ── audit log ──
const ACT_NAMES: Record<string, string> = { signin: "Signed in", "request.approve": "Approved request", "request.decline": "Declined request",
  "key.revoke": "Revoked key", "key.plan": "Changed key plan", "user.disable": "Disabled account", "user.enable": "Enabled account",
  "user.website-plan": "Changed website plan", "user.tier": "Set subscription", "user.delete": "Deleted account",
  "contact.status": "Updated message", "contact.read": "Marked message read / unread", "contact.delete": "Deleted message",
  "application.status": "Updated application", "application.delete": "Deleted application" };
async function log() {
  const l = await api("/api/log"), E = (l.entries || []) as Row[];
  const admins = [...new Set(E.map((e) => e.email).filter(Boolean))].sort();
  const kinds: Record<string, number> = {};
  for (const e of E) kinds[e.what] = (kinds[e.what] || 0) + 1;
  main().innerHTML = head("Audit log") + `
    <div class="tiles">
      ${tile("Entries", n(E.length), "the last 200 are kept here")}
      ${tile("Admins", n(admins.length), admins.map(esc).join(", ") || "–")}
      ${tile("Actions (not sign-ins)", n(E.filter((e) => e.what !== "signin").length), `${n(kinds.signin || 0)} sign-ins`)}
    </div>
    <section class="card"><h2>By action</h2>${note("Every sign-in and change made from this console. Entries can't be edited or removed.")}${ranked(Object.entries(kinds).map(([k, v]) => ({ name: ACT_NAMES[k] || k, value: v })).sort((a, b) => b.value - a.value))}</section>
    <div class="filters"><select id="fa" aria-label="Admin"><option value="">All admins</option>${admins.map((a) => `<option>${esc(a)}</option>`).join("")}</select>
      <select id="fw" aria-label="Action"><option value="">All actions</option>${Object.keys(kinds).map((k) => `<option value="${esc(k)}">${esc(ACT_NAMES[k] || k)}</option>`).join("")}</select><span id="count" class="muted"></span></div>
    <div id="tbl"></div>`;
  const draw = () => { const fa = $<HTMLSelectElement>("#fa")!.value, fw = $<HTMLSelectElement>("#fw")!.value;
  const rows = E.filter((e) => (!fa || e.email === fa) && (!fw || e.what === fw));
  $("#count")!.textContent = `${n(rows.length)} entries`;
  table($("#tbl")!, [{ key: "at", label: "When", render: (r) => `<span title="${esc(r.at)}">${when(r.at)}</span>` },
    { key: "email", label: "Admin" }, { key: "what", label: "Action", render: (r) => esc(ACT_NAMES[r.what] || r.what) },
    { key: "uid", label: "Account", render: (r) => (r.uid ? `<a href="#/user/${encodeURIComponent(r.uid)}">${esc(r.uid)}</a>` : "–") },
    { key: "done", label: "Details", render: (r) => esc(r.done || [r.ip, r.country].filter(Boolean).join(" · ")) }],
    rows, { initial: { key: "at", desc: true }, empty: "Nothing matches." }); };
  draw();
  ["#fa", "#fw"].forEach((id) => $(id)!.addEventListener("input", draw));
}

// ── search (Google Search Console and Bing) ──
const A3: Record<string, string> = { ind: "India", usa: "United States", gbr: "United Kingdom", aus: "Australia", pak: "Pakistan", bgd: "Bangladesh",
  lka: "Sri Lanka", nzl: "New Zealand", zaf: "South Africa", are: "UAE", can: "Canada", sgp: "Singapore", npl: "Nepal", afg: "Afghanistan",
  irl: "Ireland", nld: "Netherlands", deu: "Germany", sau: "Saudi Arabia", qat: "Qatar", omn: "Oman", kwt: "Kuwait", mys: "Malaysia", zwe: "Zimbabwe" };
async function search() {
  const [s, b] = await Promise.all([api("/api/search"), api("/api/bing").catch((e): Row => ({ errors: [String(e.message)] }))]);
  const pos = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(1));
  const l7 = s.last7 || {}, p7 = s.prev7 || {};
  const Q = (s.queries || []) as Row[], P = (s.pages || []) as Row[];
  const prevQ = new Map(((s.queriesPrev || []) as Row[]).map((r) => [r.key, r])), prevP = new Map(((s.pagesPrev || []) as Row[]).map((r) => [r.key, r]));
  const hasPrev = prevQ.size > 0 || prevP.size > 0;
  const withChange = (rows: Row[], prev: Map<string, Row>): Row[] => rows.map((r) => ({ ...r, was: prev.get(r.key) ?? null,
    dClicks: r.clicks - (prev.get(r.key)?.clicks ?? 0), dPos: prev.get(r.key) ? prev.get(r.key)!.position - r.position : null }));
  const QC = withChange(Q, prevQ), PC = withChange(P, prevP);
  const fresh = QC.filter((r) => !r.was && r.impressions >= 5);
  const pageOne = QC.filter((r) => r.position > 7.5 && r.position <= 15 && r.impressions >= 20);
  const change = (v: number | null, digits = 0) => (v == null ? "–" : Math.abs(v) < (digits ? 0.05 : 0.5) ? `<span class="dl0">same</span>`
    : `<span class="dlt ${v > 0 ? "up" : "down"}">${v > 0 ? "▲" : "▼"} ${digits ? Math.abs(v).toFixed(digits) : n(Math.abs(v))}</span>`);
  const cols: Col<Row>[] = [{ key: "key", label: "", render: (r) => esc(path0(r.key)) },
    { key: "clicks", label: "Clicks", num: true, render: (r) => n(r.clicks) }, { key: "impressions", label: "Impressions", num: true, render: (r) => n(r.impressions) },
    { key: "ctr", label: "CTR", num: true, render: (r) => pct(r.ctr, 1) }, { key: "position", label: "Position", num: true, render: (r) => pos(r.position) }];
  const colsChange: Col<Row>[] = [...cols,
    { key: "dClicks", label: "Clicks vs before", num: true, render: (r) => (r.was ? change(r.dClicks) : badge("New", "info")) },
    { key: "dPos", label: "Position vs before", num: true, sort: (r) => r.dPos ?? -99, render: (r) => change(r.dPos, 1) }];
  const colsMove: Col<Row>[] = [cols[0], { key: "clicks", label: "Clicks", num: true, render: (r) => n(r.clicks) }, colsChange[5], colsChange[6]];
  const sdelta = (a: number | null, b2: number | null, lowerBetter = false) => (a == null || b2 == null ? "" : ` ${delta(a, b2, lowerBetter)}`);
  main().innerHTML = head("Search (Google and Bing)") + `<p class="muted">${esc(s.site || "")} · last 28 days · Google's data lags 2–3 days · updated ${ago(s.built)} ·
      <a href="https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(s.site || "")}" target="_blank" rel="noopener">Open Search Console</a></p>`
    + warnBox(s.errors) + `
    <div class="tiles">
      ${tile("Clicks (7 days)", n(l7.clicks) + sdelta(l7.clicks, p7.clicks), `${n(p7.clicks)} the week before · ${n(s.total?.clicks)} in 28 days`)}
      ${tile("Impressions (7 days)", n(l7.impressions) + sdelta(l7.impressions, p7.impressions), `times we appeared in results · ${n(s.total?.impressions)} in 28 days`)}
      ${tile("Click-through rate", pct(l7.ctr, 1) + sdelta(l7.ctr, p7.ctr), "clicks ÷ impressions, last 7 days")}
      ${tile("Average position", pos(l7.position) + sdelta(l7.position, p7.position, true), "last 7 days · 1 is the top result, 10 is the end of page one")}
      ${tile("Queries with clicks", n(Q.filter((r) => r.clicks > 0).length), `of ${n(Q.length)} queries we show for`)}
      ${tile("Pages in results", n(P.length), `${n(P.filter((r) => r.position <= 10).length)} on page one`)}
      ${tile("New queries", hasPrev ? n(fresh.length) : "–", hasPrev ? "not seen in the 28 days before" : "needs the previous period")}
    </div>
    ${s.daily?.length ? `<div class="grid2">
      <section class="card">${bars(s.daily, [{ key: "clicks", label: "Clicks", color: S1 }], { x: "day", title: "Clicks per day", sub: "Visits from Google search." })}</section>
      <section class="card">${bars(s.daily, [{ key: "impressions", label: "Impressions", color: S1 }], { x: "day", title: "Impressions per day", sub: "How often we appeared. Rising impressions come before rising clicks." })}</section>
    </div>
    <div class="grid2">
      <section class="card">${bars(s.daily.map((d: Row) => ({ day: d.day, p: Math.round(d.position * 10) / 10 })), [{ key: "p", label: "Position", color: S2 }],
        { x: "day", title: "Average position per day", sub: "Lower is better. A drop in the line is good news.", fmt: (v) => v.toFixed(1), total: false })}</section>
      <section class="card">${bars(s.daily.map((d: Row) => ({ day: d.day, c: Math.round(d.ctr * 1000) / 10 })), [{ key: "c", label: "CTR", color: S2 }],
        { x: "day", title: "Click-through rate per day", sub: "Share of impressions that became clicks.", fmt: (v) => `${v}%`, total: false })}</section>
    </div>` : ""}
    <div class="grid2">
      <section class="card"><h2>Quick wins</h2>${note("Pages Google shows often (50+ impressions, top 20) but few click (under 2%). A clearer title and description can lift clicks without new content.")}<div id="wins"></div></section>
      <section class="card"><h2>Close to page one</h2>${note("Queries where we sit just past the top results (position 8 to 15). A little more content or a few links can move them up.")}<div id="near"></div></section>
    </div>
    <section class="card"><h2>Top search queries</h2>${note(hasPrev ? "What people typed before they saw us, against the 28 days before." : "What people typed before they saw us.")}<div id="q"></div></section>
    ${hasPrev ? `<div class="grid2"><section class="card"><h2>Rising queries</h2>${note("Most extra clicks against the 28 days before.")}<div id="up"></div></section>
      <section class="card"><h2>Falling queries</h2>${note("Most clicks lost. Check the page still answers the search.")}<div id="down"></div></section></div>` : ""}
    <section class="card"><h2>Top pages</h2>${note("Pages that appear in Google results.")}<div id="p"></div></section>
    <div class="grid2"><section class="card"><h2>Countries</h2>${note("Where searchers are.")}<div id="c"></div></section>
      <section class="card"><h2>Devices</h2>${note("Phone, desktop or tablet.")}<div id="d"></div><h2 style="margin-top:16px">Sitemaps</h2>${note("When Google last read each sitemap and how many URLs it found.")}<div id="sm"></div></section></div>`;
  main().insertAdjacentHTML("beforeend", `<h2 class="sec">Bing</h2>${note("Bing results also power DuckDuckGo and Yahoo.")}${b.errors?.length ? `<div class="warn"><ul>${b.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    ${b.daily ? `<div class="tiles">${tile("Bing clicks (7 days)", n(b.last7?.clicks), `${n(b.total?.clicks)} in the period`)}${tile("Bing impressions (7 days)", n(b.last7?.impressions), `${n(b.total?.impressions)} in the period`)}</div>
      ${b.daily.length ? `<section class="card">${bars(b.daily.slice(-30), [{ key: "clicks", label: "Clicks", color: S1 }], { x: "day", title: "Bing clicks per day" })}</section>` : ""}
      <div class="grid2"><section class="card"><h2>Bing queries</h2><div id="bq"></div></section><section class="card"><h2>Bing pages</h2><div id="bp"></div></section></div>` : ""}`);
  if (b.daily) {
    table($("#bq")!, cols, b.queries || [], { initial: { key: "clicks", desc: true }, limit: 15, empty: "No Bing queries yet." });
    table($("#bp")!, cols, b.pages || [], { initial: { key: "clicks", desc: true }, limit: 15, empty: "No Bing pages yet." });
  }
  table($("#wins")!, cols, P.filter((r) => r.impressions >= 50 && r.ctr < 0.02 && r.position <= 20), { initial: { key: "impressions", desc: true }, limit: 10, empty: "None right now." });
  table($("#near")!, cols, pageOne, { initial: { key: "impressions", desc: true }, limit: 10, empty: "None right now." });
  table($("#q")!, hasPrev ? colsChange : cols, QC, { initial: { key: "clicks", desc: true }, limit: 25, empty: "No search queries yet." });
  if (hasPrev) {
    table($("#up")!, colsMove, QC.filter((r) => r.dClicks > 0), { initial: { key: "dClicks", desc: true }, limit: 10, empty: "Nothing rising yet." });
    table($("#down")!, colsMove, QC.filter((r) => r.dClicks < 0), { initial: { key: "dClicks", desc: false }, limit: 10, empty: "Nothing falling." });
  }
  table($("#p")!, hasPrev ? colsChange : cols, PC, { initial: { key: "clicks", desc: true }, limit: 25, empty: "No pages with impressions yet." });
  table($("#c")!, [{ ...cols[0], render: (r) => esc(A3[r.key] || r.key.toUpperCase()) }, ...cols.slice(1)], s.countries || [], { initial: { key: "clicks", desc: true } });
  table($("#d")!, [{ ...cols[0], render: (r) => esc(r.key[0] + r.key.slice(1).toLowerCase()) }, ...cols.slice(1)], s.devices || [], { initial: { key: "clicks", desc: true } });
  table($("#sm")!, [{ key: "path", label: "Sitemap", render: (r) => esc(path0(r.path)) },
    { key: "lastDownloaded", label: "Last read", render: (r) => ago(r.lastDownloaded) },
    { key: "submitted", label: "URLs", num: true, render: (r) => n(r.submitted) },
    { key: "errors", label: "Issues", render: (r) => (r.errors ? badge(`${r.errors} errors`, "bad") : r.warnings ? badge(`${r.warnings} warnings`, "warn") : r.pending ? badge("Pending", "info") : badge("OK", "good")) }],
    s.sitemaps || [], { empty: "No sitemaps submitted." });
}

// ── traffic (Cloudflare: every visitor, no cookies) ──
async function traffic() {
  const t = await api("/api/traffic");
  const rum = t.rum, zone = t.zone as Row[] | null, wk = t.workers as Row[] | null, ag = t.agents;
  const scripts: Record<string, { today: number; d7: number; d30: number; errors: number }> = {};
  const today = new Date().toISOString().slice(0, 10), from7 = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const perDay: Record<string, number> = {};
  for (const r of wk || []) {
    const s = (scripts[r.script] ||= { today: 0, d7: 0, d30: 0, errors: 0 });
    s.d30 += r.requests; s.errors += r.errors;
    if (r.day === today) s.today += r.requests;
    if (r.day >= from7) s.d7 += r.requests;
    perDay[r.day] = (perDay[r.day] || 0) + r.requests;
  }
  const R = (rum?.days || []) as Row[];
  const v7 = sumOf(R, "views", -7), vP = sumOf(R, "views", -14, -7), s7 = sumOf(R, "visits", -7), sP = sumOf(R, "visits", -14, -7);
  const req30 = sumOf(zone || [], "requests"), cached30 = sumOf(zone || [], "cached"), threats30 = sumOf(zone || [], "threats"), bytes30 = sumOf(zone || [], "bytes");
  const wToday = Object.values(scripts).reduce((s, x) => s + x.today, 0);
  const top = (rows: Row[] | undefined) => ranked((rows || []).map((r) => ({ name: r.name, value: r.views })));
  main().innerHTML = head("Traffic") + warnBox(t.errors) + `<p class="muted">Counted by Cloudflare for every visitor, with no cookies, so these numbers run higher than Google Analytics.</p>
    <div class="tiles">
      ${tile("Page views (7 days)", rum ? `${n(v7)} ${delta(v7, vP)}` : "–", rum ? `${n(vP)} the week before · ${n(sumOf(R, "views"))} in 30 days` : "Web Analytics not connected")}
      ${tile("Visits (7 days)", rum ? `${n(s7)} ${delta(s7, sP)}` : "–", rum ? `${n(sP)} the week before` : "")}
      ${tile("Pages per visit", s7 ? (v7 / s7).toFixed(1) : "–", "page views ÷ visits, 7 days")}
      ${tile("Unique visitors (yesterday)", n(zone?.at(-2)?.uniques), "all requests to the domain, bots included")}
      ${tile("Requests (30 days)", zone ? n(req30) : "–", zone ? `${pct(ratio(cached30, req30))} served from cache` : "")}
      ${tile("Data served (30 days)", zone ? bytes(bytes30) : "–", "everything sent to browsers and the app")}
      ${tile("Threats blocked (30 days)", zone ? n(threats30) : "–", "bad bots and attacks Cloudflare stopped")}
      ${tile("Worker requests today", n(wToday), `${pct(wToday / 100000)} of 100,000 a day on the free plan`)}
    </div>
    ${rum ? `<div class="grid2">
      <section class="card">${bars(R, [{ key: "views", label: "Page views", color: S1 }], { x: "day", title: "Page views per day", sub: "Every visitor, last 30 days." })}</section>
      <section class="card">${bars(R, [{ key: "visits", label: "Visits", color: S1 }], { x: "day", title: "Visits per day", sub: "A visit is one arrival from outside the site." })}</section>
    </div>
    <div class="grid2"><section class="card"><h2>Top pages (7 days)</h2>${note("Most viewed pages.")}${top(rum.pages)}</section>
      <section class="card"><h2>Referrers (7 days)</h2>${note("Sites that sent visitors. Direct visits aren't listed.")}${top(rum.referrers)}</section></div>
    <div class="grid2"><section class="card"><h2>Countries (7 days)</h2>${note("Page views by country.")}${top(rum.countries)}</section>
      <section class="card"><h2>Devices (7 days)</h2>${note("Phone, desktop or tablet.")}${top(rum.devices)}</section></div>` : ""}
    ${ag ? `<div class="grid2"><section class="card"><h2>Browsers (7 days)</h2>${note("Test new pages in the top two.")}${top(ag.browsers)}</section>
      <section class="card"><h2>Operating systems (7 days)</h2>${note("Android against iPhone tells us where the app matters most.")}${top(ag.os)}</section></div>` : ""}
    ${t.vitals ? vitalsHtml(t.vitals) : ""}
    ${zone ? `<div class="grid2">
      <section class="card">${bars(zone.map((r) => ({ day: r.day, c: r.cached, o: Math.max(0, r.requests - r.cached) })), [{ key: "c", label: "From cache", color: S1 }, { key: "o", label: "From the server", color: S2 }],
        { x: "day", title: "Requests per day", sub: "Pages, data files and the app. Cached requests cost nothing and load fastest." })}</section>
      <section class="card">${bars(zone, [{ key: "uniques", label: "Unique visitors", color: S1 }], { x: "day", title: "Unique visitors per day", sub: "Includes bots and the app's data requests, so it runs higher than visits.", total: false })}</section>
    </div>` : ""}
    ${wk ? `<section class="card">${bars(Object.entries(perDay).sort().map(([d, v]) => ({ day: d, requests: v })), [{ key: "requests", label: "Requests", color: S1 }],
        { x: "day", title: "Worker requests per day (all scripts)", sub: "The API, the AI connector and this console. The free plan allows 100,000 a day across all of them." })}
      <div id="scripts"></div></section>` : ""}`;
  if (t.vitals) {
    const vcols: Col<Row>[] = [{ key: "name", label: "" }, { key: "samples", label: "Samples", num: true, render: (r) => n(r.samples) },
      { key: "lcp", label: "LCP", num: true, render: (r) => vital("lcp", r.lcp) }, { key: "inp", label: "INP", num: true, render: (r) => vital("inp", r.inp) },
      { key: "cls", label: "CLS", num: true, render: (r) => vital("cls", r.cls) }, { key: "ttfb", label: "TTFB", num: true, render: (r) => fmtVital("ttfb", r.ttfb) }];
    table($("#cwv-pages")!, vcols, t.vitals.pages || [], { initial: { key: "samples", desc: true }, empty: "No samples yet." });
    table($("#cwv-dev")!, vcols, t.vitals.devices || [], { initial: { key: "samples", desc: true }, empty: "No samples yet." });
  }
  if (wk) table($("#scripts")!, [{ key: "script", label: "Worker" }, { key: "today", label: "Today", num: true, render: (r) => n(r.today) },
    { key: "d7", label: "7 days", num: true, render: (r) => n(r.d7) }, { key: "d30", label: "30 days", num: true, render: (r) => n(r.d30) },
    { key: "errors", label: "Errors (30d)", num: true, render: (r) => `${n(r.errors)}${r.d30 ? ` <small class="muted">${pct(r.errors / r.d30, 2)}</small>` : ""}` }],
    Object.entries(scripts).map(([script, v]) => ({ script, ...v })), { initial: { key: "d30", desc: true } });
}

// Core Web Vitals: Google's thresholds (good / needs improvement / poor) at the 75th percentile
const LIMITS: Record<string, [number, number]> = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], ttfb: [800, 1800], fcp: [1800, 3000] };
const fmtVital = (k: string, v: number | null) => (v == null ? "–" : k === "cls" ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
function vital(k: string, v: number | null) {
  if (v == null) return "–";
  const [g, p] = LIMITS[k];
  return `${fmtVital(k, v)} ${badge(v <= g ? "Good" : v <= p ? "Needs work" : "Poor", v <= g ? "good" : v <= p ? "warn" : "bad")}`;
}
function vitalsHtml(v: Row) {
  const o = v.overall, s = o?.sum || {};
  const share = (m: string) => { const tot = (s[`${m}Good`] || 0) + (s[`${m}NeedsImprovement`] || 0) + (s[`${m}Poor`] || 0); return tot ? `${pct(s[`${m}Good`] / tot)} of visits good` : ""; };
  return `<h2 class="sec">Core Web Vitals (real visitors, 7 days, 75th percentile)</h2>
    ${note("How fast and steady pages feel to real visitors. Google uses these in ranking. Fix anything marked Poor first.")}
    <div class="tiles">
      ${tile("Largest Contentful Paint", o ? vital("lcp", o.lcp) : "–", `loading · good ≤ 2.5 s · ${share("lcp")}`)}
      ${tile("Interaction to Next Paint", o ? vital("inp", o.inp) : "–", `responsiveness · good ≤ 200 ms · ${share("inp")}`)}
      ${tile("Cumulative Layout Shift", o ? vital("cls", o.cls) : "–", `visual stability · good ≤ 0.1 · ${share("cls")}`)}
      ${tile("Time to First Byte", o ? fmtVital("ttfb", o.ttfb) : "–", o ? `first paint ${fmtVital("fcp", o.fcp)} · ${n(o.samples)} samples` : "")}
    </div>
    <div class="grid2"><section class="card"><h2>By page</h2><div id="cwv-pages"></div></section>
      <section class="card"><h2>By device</h2><div id="cwv-dev"></div></section></div>`;
}

// ── health ──
async function health() {
  const [h, up, m] = await Promise.all([api("/api/health"), api("/api/uptime").catch((e): Row => ({ error: String(e.message) })), api("/api/meters").catch((e): Row => ({ errors: [String(e.message)] }))]);
  const files = h.build?.files as number | undefined;
  const WF_DESC: Record<string, string> = {
  "publish-site.yml": "Rebuilds forecasts and deploys the website, nightly and on demand.",
  "live.yml": "Every 30 minutes, follows live matches for the live projection.",
  "auto.yml": "Every 3 hours: new fixtures, playing XIs, the toss and scorecards.",
  "edge-data.yml": "Prepares the API's answers for each upcoming match, then redeploys the API.",
  "deploy-worker.yml": "Deploys the API and AI connector.",
  "deploy-master.yml": "Deploys this console.",
  "android.yml": "Builds the Android app. Releases only when started by hand.",
  "data-freshness.yml": "Checks how up to date the ball-by-ball archive is.",
  "site-check.yml": "Checks the live site: pages, data, redirects and headers.",
};
const runBadge = (r: Row) => !r.last ? badge(r.error ? "Unknown" : "No runs", "plain")
    : r.last.status !== "completed" ? badge("Running", "info") : r.last.conclusion === "success" ? badge("Passed", "good")
    : r.last.conclusion === "failure" ? badge("Failed", "bad") : badge(r.last.conclusion || "–", "plain");
  const failing = ((h.runs || []) as Row[]).filter((r) => r.last?.status === "completed" && r.last?.conclusion === "failure");
  main().innerHTML = head("Pipeline health") + (h.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${h.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") + `
    <div class="tiles">
      ${tile("Forecasts published", h.data ? ago(h.data.generated) : "–", h.data ? `${n(h.data.upcoming)} upcoming · ${n(h.data.live)} live` : "")}
      ${tile("Upcoming without XIs", h.data ? n(h.data.missingXi.length) : "–", "simulated on probable XIs")}
      ${tile("Site files", files != null ? n(files) : "–", files != null ? `${pct(files / h.limits.pagesFiles)} of the 20,000 Pages limit` : "build.json appears after the next publish")}
      ${tile("Android app", esc(h.app?.version || "–"), h.app ? `build ${esc(h.app.build ?? h.app.versionCode ?? "–")}` : "")}
      ${tile("Failing workflows", n(failing.length), failing.length ? failing.map((r) => esc(r.label)).join(", ") : "every last run passed")}
    </div>
    ${files != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="20000" aria-valuenow="${files}"><i style="width:${Math.min(100, 100 * files / 20000).toFixed(1)}%" class="${files > 18000 ? "bad" : files > 15000 ? "warn" : ""}"></i></div>` : ""}
    ${uptimeHtml(up)}
    ${metersHtml(m, files, h.limits?.pagesFiles)}
    <section class="card"><h2>Workflows</h2>${note("The jobs that keep the site, API and app running. A failure here usually means stale data on the site.")}<div id="runs"></div></section>
    <div class="grid2"><section class="card"><h2>Upcoming matches without XIs</h2>${note("Forecast on the XIs we expect. They update once the teams are named.")}<div id="xi"></div></section>
      <section class="card"><h2>App releases</h2>${note("Android builds on GitHub, with APK downloads.")}<div id="rel"></div></section></div>`;
  table($("#runs")!, [{ key: "label", label: "Workflow", render: (r) => `${esc(r.label)} <small class="muted">${esc(WF_DESC[r.file] || r.file)}</small>` },
    { key: "status", label: "Last run", render: (r) => `${runBadge(r)} ${r.last ? `<a href="${esc(r.last.url)}" target="_blank" rel="noopener">${ago(r.last.at)}</a>` : esc(r.error || "")}`, sort: (r) => r.last?.at || "" },
    { key: "lastSuccess", label: "Last success", render: (r) => ago(r.lastSuccess) },
    { key: "failures", label: "Failed (last 10)", num: true, render: (r) => `${n(r.failures)} / ${n(r.of)}` }], h.runs || [], { empty: "GitHub isn't connected." });
  table($("#xi")!, [{ key: "title", label: "Match" }, { key: "date", label: "Date", render: (r) => `${day(r.date)} ${esc(r.start || "")}` }],
    h.data?.missingXi || [], { initial: { key: "date", desc: false }, empty: "Every upcoming match has its XIs." });
  table($("#rel")!, [{ key: "tag", label: "Release", render: (r) => esc(r.name || r.tag) }, { key: "at", label: "Published", render: (r) => day(r.at) },
    { key: "apk", label: "APK downloads", num: true, render: (r) => n(r.apk) }], h.releases || [], { initial: { key: "at", desc: true }, empty: "No releases found." });
}

function uptimeHtml(u: Row) {
  if (u.error) return `<div class="warn">Uptime: ${esc(u.error)}</div>`;
  if (!u.checks) return `<section class="card"><h2>Uptime</h2><p class="empty">The first checks run within 5 minutes of this deploy.</p></section>`;
  return `<section class="card"><h2>Uptime <small class="muted" style="display:inline">checked every 5 minutes · last ${ago(u.last)}</small></h2>
    ${note("Each bar is one check in the last 24 hours. Red means the page didn't answer or showed the wrong content.")}
    <div class="uptime">${(u.targets as Row[]).map((t) => `<div class="ut">
      <div class="ut-h"><b>${esc(t.label)}</b> ${t.now ? (t.now.up ? badge("Up", "good") : badge(t.now.code ? `Down (${t.now.code === 299 ? "wrong content" : t.now.code})` : "Down (no answer)", "bad")) : badge("–", "plain")}
        <span class="muted">${pct(t.uptime24, 2)} 24 h · ${pct(t.uptime7, 2)} 7 d · ${t.p50 == null ? "–" : `${t.p50} ms`} median, ${t.p95 == null ? "–" : `${t.p95} ms`} p95</span></div>
      <div class="strip" role="img" aria-label="${esc(t.label)}: last 24 hours">${(t.strip as number[]).map((x) => `<i class="${x ? "ok" : "bad"}"></i>`).join("")}</div>
      ${t.incidents.length ? `<p class="muted">Recent outages: ${(t.incidents as Row[]).slice(0, 3).map((i) => `${when(i.from)} for ${i.checks * 5} min${i.to ? "" : " (ongoing)"}`).join(" · ")}</p>` : ""}
    </div>`).join("")}</div></section>`;
}

function metersHtml(m: Row, files: number | undefined, pagesLimit = 20000) {
  const rows: Row[] = [...(m.meters || []), ...(files != null ? [{ label: "Pages files per deployment", today: files, limit: pagesLimit, share: files / pagesLimit, note: "move /data to R2 or retire old pages before 20,000" }] : [])];
  return `<section class="card"><h2>Free-tier meters (today)</h2>
    ${note("Our zero-spend limits. Amber at half, red at 80%: act before red, because past the limit things stop or start costing money.")}
    ${m.errors?.length ? `<div class="warn"><ul>${m.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    <div class="meters">${rows.map((r) => `<div class="mt"><div class="mt-h"><b>${esc(r.label)}</b>
      <span>${r.today == null ? "–" : n(r.today)} / ${n(r.limit)} ${r.share == null ? "" : badge(pct(r.share), r.share >= 0.8 ? "bad" : r.share >= 0.5 ? "warn" : "good")}</span></div>
      <div class="meter"><i style="width:${Math.min(100, 100 * (r.share || 0)).toFixed(1)}%" class="${(r.share || 0) >= 0.8 ? "bad" : (r.share || 0) >= 0.5 ? "warn" : ""}"></i></div>
      <small class="muted">${esc(r.note || "")}${r.peak14 != null ? ` · busiest of 14 days ${n(r.peak14)}` : ""}</small></div>`).join("")}</div></section>`;
}

// ── accuracy ──
async function accuracy() {
  const a = await api("/api/accuracy"), o = a.overall;
  const solid = ((a.competitions || []) as Row[]).filter((c) => c.matches >= 3 && c.accuracy != null).sort((x, y) => y.accuracy - x.accuracy);
  const best = solid[0], worst = solid.length > 1 ? solid[solid.length - 1] : null;
  const months = ((a.months || []) as Row[]).filter((m) => m.accuracy != null), thisM = months.at(-1), lastM = months.at(-2);
  main().innerHTML = head("Model accuracy") + `<p class="muted">From the published results, scored after each match. Updated ${ago(a.generated)}.</p>
    <div class="tiles">
      ${tile("Projections that came true", pct(o.accuracy), `${n(o.hits)} of ${n(o.checks)} checks · ${n(o.matches)} matches`)}
      ${tile("Favourite won", pct(o.favourite), `${n(o.favouriteOf)} matches`)}
      ${tile("Result Brier score", o.brier == null ? "–" : o.brier.toFixed(3), "0 is perfect, 0.25 is a coin flip")}
      ${tile("Fantasy XI", pct(o.fantasy), "of the ultimate team's points")}
      ${tile("This month", thisM ? pct(thisM.accuracy) : "–", thisM && lastM ? `${pct(lastM.accuracy)} last month ${delta(thisM.accuracy, lastM.accuracy)}` : "came true")}
      ${tile("Strongest competition", best ? pct(best.accuracy) : "–", best ? `${esc(best.key)} · ${n(best.matches)} matches` : "needs 3+ matches")}
      ${tile("Weakest competition", worst ? pct(worst.accuracy) : "–", worst ? `${esc(worst.key)} · ${n(worst.matches)} matches` : "needs 3+ matches")}
    </div>
    ${note("Came true: the share of pre-match calls the scorecard proved right. Favourite won: how often the side we made favourite won. Brier: how close our win chances were to what happened.")}
    <section class="card">${bars(a.months.map((m: Row) => ({ month: m.key, acc: m.accuracy == null ? 0 : Math.round(m.accuracy * 1000) / 10 })),
      [{ key: "acc", label: "Projections that came true (%)", color: S1 }], { x: "month", xLabel: (v) => v, fmt: (v) => `${v}%`, title: "By month", sub: "Share of calls that came true, per month.", total: false })}</section>
    <section class="card"><h2>By format</h2>${note("T20, ODI, The Hundred and the rest.")}<div id="fmt"></div></section>
    <section class="card"><h2>By competition</h2>${note("Small samples swing a lot. Trust rows with 10 or more matches.")}<div id="comp"></div></section>
    <div class="grid2"><section class="card"><h2>By match-centre tab</h2>${note("Which parts of the match page are most often right.")}<div id="tabs"></div></section>
      <section class="card"><h2>Latest matches</h2>${note("The most recent finished matches.")}<div id="recent"></div></section></div>`;
  const cols: Col<Row>[] = [{ key: "key", label: "" }, { key: "matches", label: "Matches", num: true },
    { key: "accuracy", label: "Came true", num: true, render: (r) => pct(r.accuracy) }, { key: "favourite", label: "Favourite won", num: true, render: (r) => pct(r.favourite) },
    { key: "brier", label: "Brier", num: true, render: (r) => (r.brier == null ? "–" : r.brier.toFixed(3)) }, { key: "fantasy", label: "Fantasy", num: true, render: (r) => pct(r.fantasy) }];
  table($("#fmt")!, cols, a.formats, { initial: { key: "matches", desc: true } });
  table($("#comp")!, cols, a.competitions, { initial: { key: "matches", desc: true } });
  table($("#tabs")!, [{ key: "tab", label: "Tab" }, { key: "checks", label: "Checks", num: true }, { key: "accuracy", label: "Came true", num: true, render: (r) => pct(r.accuracy) }], a.tabs, { initial: { key: "checks", desc: true } });
  table($("#recent")!, [{ key: "title", label: "Match", render: (r) => `${esc(r.title || r.id)}<small>${esc(r.result || "")}</small>` },
    { key: "date", label: "Date", render: (r) => day(r.date) }, { key: "accuracy", label: "Came true", num: true, render: (r) => pct(r.accuracy) }], a.recent, { initial: { key: "date", desc: true }, limit: 10 });
}

// ── boot ──
api<{ email: string; exp: number }>("/api/session").then((s) => { me = s; start(); }).catch(() => renderLogin());
