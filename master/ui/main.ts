// CricSynthesis admin console: sign-in, hash routes and the read-only views.
import { initializeApp } from "@firebase/app";
import { browserPopupRedirectResolver, GoogleAuthProvider, inMemoryPersistence, initializeAuth, signInWithPopup, signOut } from "@firebase/auth";
import { bars, donut, ranked, spark, wireTips } from "./charts.ts";
import { type Col, table } from "./table.ts";
import { $, $$, ago, badge, csv, day, delta, download, esc, kpi, n, pct, provider, tile, when } from "./util.ts";

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
  ["Customers", [["users", "Users"], ["keys", "API keys"], ["usage", "Usage"], ["requests", "Upgrade requests"], ["messages", "Messages"], ["applications", "Applications"]]],
  ["Growth", [["product", "Product (GA4)"], ["ux", "UX (Clarity)"], ["search", "Search"], ["traffic", "Traffic"]]],
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
    const views: Record<string, (a: string) => Promise<void>> = { "": overview, users, user, keys, usage, requests, messages, applications, product, ux, search, traffic, health, accuracy, log };
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
  const s = await snapshot(), t = s.totals, ser = (s.series || []) as Row[];
  const last7 = ser.slice(-7), prev7 = ser.slice(-14, -7);
  const calls7 = sumKey(last7, "calls"), callsPrev = sumKey(prev7, "calls");
  const sign7 = sumKey(last7, "signups"), signPrev = sumKey(prev7, "signups");
  const act7 = sumKey(last7, "active") / 7, actPrev = sumKey(prev7, "active") / 7;
  const tiers = t.plans.tiers || {};
  const paidNote = t.plans.tiers ? `${n(t.plans.tags?.trial || 0)} on trial · ${n(t.plans.tags?.assigned || 0)} assigned` : "";
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
  <div class="grid-main">
    <section class="card">${bars(ser, [{ key: "api", label: "API keys", color: S1 }, { key: "mcp", label: "MCP connector", color: S2 }],
      { x: "day", title: "API and MCP calls", sub: "Last 30 days, all accounts", height: 260 })}</section>
    <section class="card"><div class="card-h"><h2>Plans</h2><a href="#/users">All users →</a></div>
      ${donut([{ label: "CricSynthesis Free", value: tiers.free != null ? Number(tiers.free) : Math.max(0, t.users - Number(tiers.pro || 0) - Number(tiers["api-plus"] || 0) - Number(tiers.business || 0)), color: S3 },
               { label: "CricSynthesis Pro", value: Number(tiers.pro || 0), color: S1 },
               { label: "API Plus", value: Number(tiers["api-plus"] || 0), color: S2 },
               { label: "Business API", value: Number(tiers.business || 0), color: S4 }], "accounts")}</section>
  </div>
  <div class="grid2">
    <section class="card">${bars(ser, [{ key: "signups", label: "Sign-ups", color: S1 }], { x: "day", title: "Sign-ups", sub: "New accounts per day, last 30 days", kind: "bars", height: 200 })}</section>
    <section class="card"><div class="card-h"><h2>Top endpoints and tools</h2><a href="#/usage">Usage →</a></div>
      ${ranked(((s.endpoints || []) as Row[]).slice(0, 7).map((e) => ({ name: epName(e.ep), value: e.calls })))}</section>
  </div>
  <div class="grid2"><section class="card"><div class="card-h"><h2>Newest accounts</h2><a href="#/users">All users →</a></div><div id="new"></div></section>
    <section class="card"><div class="card-h"><h2>Most active · 30 days</h2><a href="#/usage">Usage →</a></div><div id="top"></div></section></div>`;
  const who = (r: Row) => `<span class="who-cell">${r.photo ? `<img src="${esc(r.photo)}" alt="" width="30" height="30" referrerpolicy="no-referrer">` : `<span class="av">${esc((r.email || r.uid)[0].toUpperCase())}</span>`}
    <span>${userLink(r.uid, r.email)}${r.name ? `<small>${esc(r.name)}</small>` : ""}</span></span>`;
  const cols: Col<Row>[] = [{ key: "email", label: "Account", render: who },
                            { key: "created", label: "Joined", render: (r) => ago(r.created) }, { key: "calls30", label: "Calls 30d", num: true, render: (r) => n(r.calls30) }];
  table($("#new")!, cols, s.users.slice(0, 6), { rowHref: (r) => `/user/${r.uid}` });
  table($("#top")!, cols, s.users.filter((u: Row) => u.calls30).sort((a: Row, b: Row) => b.calls30 - a.calls30).slice(0, 6),
        { rowHref: (r) => `/user/${r.uid}`, empty: "No API or MCP calls in the last 30 days." });
  wireRefresh();
}

// ── users ──
async function users() {
  const s = await snapshot();
  main().innerHTML = head("Users", s) + `<div class="filters">
    <input id="q" type="search" placeholder="Search email, name, company or account ID" aria-label="Search">
    <select id="f-plan" aria-label="Subscription"><option value="">All subscriptions</option>${Object.entries(TIER_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}<option value="tag:paid">Paid</option><option value="tag:trial">Trial</option><option value="tag:assigned">Assigned</option></select>
    <select id="f-use" aria-label="Activity"><option value="">Any activity</option><option value="keys">Has API keys</option><option value="calls">Made calls (30d)</option><option value="mcp">Used MCP (30d)</option><option value="active7">Seen in 7 days</option><option value="req">Open request</option><option value="noauth">Not in Firebase Auth</option></select>
    <span id="count" class="muted"></span><button id="csv" class="btn ghost sm">Export CSV</button></div><div id="tbl"></div>`;
  const cols: Col<Row>[] = [
    { key: "email", label: "Account", render: (r) => `<span class="who-cell">${r.photo ? `<img src="${esc(r.photo)}" alt="" width="24" height="24" referrerpolicy="no-referrer">` : `<span class="av">${esc((r.email || r.uid)[0].toUpperCase())}</span>`}
        <span>${userLink(r.uid, r.email)}${r.name ? `<small>${esc(r.name)}${r.company ? ` · ${esc(r.company)}` : ""}</small>` : ""}</span></span>` },
    { key: "providers", label: "Sign-in", render: (r) => esc(provider(r.providers)), sort: (r) => r.providers.join() },
    { key: "created", label: "Joined", render: (r) => `<span title="${esc(when(r.created))}">${day(r.created)}</span>` },
    { key: "lastSeen", label: "Last seen", render: (r) => `<span title="${esc(when(r.lastSeen))}">${ago(r.lastSeen)}</span>` },
    { key: "tier", label: "Subscription", render: (r) => tierCell(r.tier || "free", r.tag, r.until), sort: (r) => ({ free: 0, pro: 1, "api-plus": 2, business: 3 } as Row)[r.tier || "free"] * 10 + (r.tag === "paid" ? 2 : r.tag ? 1 : 0) },
    { key: "activeKeys", label: "Keys", num: true, render: (r) => n(r.activeKeys) },
    { key: "mcpDays", label: "MCP", num: true, render: (r) => (r.mcpDays ? `${r.mcpDays} d` : "–") },
    { key: "calls7", label: "Calls 7d", num: true, render: (r) => n(r.calls7) },
    { key: "calls30", label: "Calls 30d", num: true, render: (r) => n(r.calls30) },
    { key: "open", label: "", render: (r) => `<a class="btn ghost sm" href="#/user/${encodeURIComponent(r.uid)}">Open profile</a>`, sort: () => null },
  ];
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const draw = () => {
    const q = ($<HTMLInputElement>("#q")!.value || "").toLowerCase().trim();
    const plan = $<HTMLSelectElement>("#f-plan")!.value, use = $<HTMLSelectElement>("#f-use")!.value;
    const rows = (s.users as Row[]).filter((u) =>
      (!q || [u.email, u.name, u.company, u.uid].some((x) => String(x || "").toLowerCase().includes(q)))
      && (!plan || (plan.startsWith("tag:") ? u.tag === plan.slice(4) : (u.tier || "free") === plan))
      && (!use || (use === "keys" ? u.activeKeys > 0 : use === "calls" ? u.calls30 > 0 : use === "mcp" ? u.mcpDays > 0
                  : use === "active7" ? String(u.lastSeen || "") >= since7 : use === "req" ? u.requestsOpen > 0 : !u.inAuth)));
    $("#count")!.textContent = `${n(rows.length)} of ${n(s.users.length)}`;
    table($("#tbl")!, cols, rows, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "created", desc: true }, empty: "No accounts match." });
    return rows;
  };
  let rows = draw();
  ["#q", "#f-plan", "#f-use"].forEach((id) => $(id)!.addEventListener("input", () => { rows = draw(); }));
  $("#csv")!.addEventListener("click", () => download(`cricsynthesis-users-${new Date().toISOString().slice(0, 10)}.csv`,
    csv(rows, ["uid", "email", "name", "company", "providers", "created", "lastSeen", "tierName", "tag", "until", "websitePlan", "apiPlan", "activeKeys", "mcpDays", "calls7", "calls30", "requestsOpen", "disabled"])));
  wireRefresh();
}

// ── one user ──
async function user(uid: string) {
  const p = await api(`/api/user?uid=${encodeURIComponent(uid)}`), u = p.user, id = p.identity, sv = p.services;
  const series = (p.usage.series as Row[]).map((d) => ({ day: d.day, api: d.total - Number(d.keys?.mcp || 0), mcp: Number(d.keys?.mcp || 0) }));
  const paidTag = (paid: boolean) => badge(paid ? "Paid" : "Free", paid ? "good" : "plain");
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
  <h2 class="sec">Services and plan</h2>
  <div class="tiles">
    ${tile("Subscription", esc(sv.subscription.name), `${tagBadge(sv.subscription.tag)} ${({ paid: "Paid", trial: "On the free day", assigned: "Assigned by our team" } as Record<string, string>)[sv.subscription.tag] || "No paid plan"}${sv.subscription.until ? ` · ends ${when(sv.subscription.until)}` : sv.subscription.tag === "assigned" || sv.subscription.setBy?.tier === sv.subscription.tier && sv.subscription.tier !== "free" ? " · no end date" : ""}${sv.subscription.setBy?.at ? ` · set in the console ${day(sv.subscription.setBy.at)}` : ""}`)}
    ${tile("Website (fan app)", esc(sv.website.plan), `${paidTag(sv.website.paid)} ${({ subscription: "Paid subscription", trial: "Free day", assigned: "Assigned by our team", default: "No subscription" } as Record<string, string>)[sv.website.source] || ""}${sv.website.billing?.status ? ` · ${esc(sv.website.billing.status)}${sv.website.billing.billing ? ` (${esc(sv.website.billing.billing)})` : ""}` : ""}`)}
    ${tile("API plan", planBadge(sv.api.plan), `${paidTag(sv.api.paid)} ${n(sv.api.activeKeys)} active key${sv.api.activeKeys === 1 ? "" : "s"} · ${n(sv.api.limit)} calls a day per key`)}
    ${tile("MCP connector", sv.mcp.used ? "In use" : "Not used", sv.mcp.used ? `${n(sv.mcp.days)} days in 90 · last ${day(sv.mcp.lastDay)} · today ${n(sv.mcp.today)} / ${n(sv.mcp.limit)}` : "No connector calls in 90 days")}
    ${tile("Usage", n(p.usage.today), `today · ${n(p.usage.calls7)} in 7 days · ${n(p.usage.calls30)} in 30`)}
  </div>
  <section class="card">${bars(series, [{ key: "api", label: "API keys", color: S1 }, { key: "mcp", label: "MCP connector", color: S2 }], { x: "day", title: "Calls per day (90 days)" })}</section>
  <section class="card"><h2>API keys</h2><div id="keys"></div></section>
  <div class="grid2"><section class="card"><h2>What they call (30 days)</h2>${ranked((p.usage.endpoints as Row[]).slice(0, 15).map((e) => ({ name: epName(e.ep), value: e.calls })))}
      ${Object.keys(p.usage.cats).length ? `<p class="muted">By category: ${Object.entries(p.usage.cats).map(([c, v]) => `${esc(c)} ${n(v)}`).join(" · ")}</p>` : ""}</section>
    <section class="card"><h2>Days at the daily limit</h2><div id="limits"></div></section></div>
  <div class="grid2"><section class="card"><h2>Upgrade requests</h2><div id="reqs"></div></section>
    <section class="card"><h2>Profile and email preferences</h2>${p.profile ? `<dl class="dl">
      <dt>Company</dt><dd>${esc(p.profile.company || "–")}</dd><dt>Use case</dt><dd>${esc(p.profile.useCase || "–")}</dd>
      <dt>Product news</dt><dd>${yn(p.profile.notifyProduct)}</dd><dt>Usage alerts</dt><dd>${yn(p.profile.notifyUsage)}</dd>
      <dt>Billing emails</dt><dd>${yn(p.profile.notifyBilling)}</dd><dt>Updated</dt><dd>${when(p.profile.updated)}</dd></dl>` : `<p class="empty">No profile details saved.</p>`}</section></div>
  <section class="card"><h2>Timeline</h2>${p.timeline.length ? `<ol class="timeline">${p.timeline.map((t: Row) => `<li><time>${t.at.length === 10 ? day(t.at) : when(t.at)}</time>${esc(t.what)}</li>`).join("")}</ol>` : `<p class="empty">Nothing yet.</p>`}</section>`;
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
  const s = await snapshot();
  main().innerHTML = head("API keys", s) + `<div class="filters"><input id="q" type="search" placeholder="Search owner, key name or prefix" aria-label="Search">
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
  const s = await snapshot();
  main().innerHTML = head("Usage", s) + `
    <section class="card">${bars(s.series, [{ key: "api", label: "API", color: S1 }, { key: "mcp", label: "MCP", color: S2 }], { x: "day", title: "Calls per day (30 days)" })}</section>
    <section class="card">${bars(s.series, [{ key: "active", label: "Accounts", color: S1 }], { x: "day", title: "Accounts making calls, per day", total: false })}</section>
    <div class="grid2"><section class="card"><h2>Top endpoints and tools (30 days)</h2>${ranked((s.endpoints as Row[]).slice(0, 20).map((e) => ({ name: epName(e.ep), value: e.calls })))}
      <p class="muted">Per-endpoint counts start from this release; earlier calls show by category only.</p></section>
      <section class="card"><h2>By category (30 days)</h2>${ranked(Object.entries(s.cats as Row).map(([k, v]) => ({ name: k, value: Number(v) })).sort((a, b) => b.value - a.value))}
      <h2>Top accounts (30 days)</h2>${ranked((s.users as Row[]).filter((u) => u.calls30).sort((a, b) => b.calls30 - a.calls30).slice(0, 10).map((u) => ({ name: u.email || u.uid, value: u.calls30, href: `#/user/${u.uid}` })))}</section></div>
    <section class="card"><h2>Hit the daily limit</h2><p class="muted">Accounts that reached their plan's limit: likely upgrade leads.</p><div id="lim"></div></section>`;
  table($("#lim")!, [{ key: "email", label: "Account", render: (r) => userLink(r.uid, r.email) }, { key: "day", label: "Day", render: (r) => day(r.day) },
    { key: "slot", label: "Key", render: (r) => slotName(r.slot) }, { key: "calls", label: "Calls", num: true, render: (r) => `${n(r.calls)} / ${n(r.limit)}` }], s.limitHits,
    { rowHref: (r) => `/user/${r.uid}`, initial: { key: "day", desc: true }, empty: "Nobody hit a limit in the last 30 days.", limit: 15 });
  wireRefresh();
}

// ── requests ──
async function requests() {
  const s = await snapshot();
  main().innerHTML = head("Upgrade requests", s) + `<p class="muted">Approving moves all of the account's live keys to the plan (the API picks it up within a minute). Payments aren't automated yet: approve once the customer has paid or agreed terms.</p><div id="tbl"></div>`;
  table($("#tbl")!, [{ key: "email", label: "Account", render: (r) => userLink(r.uid, r.email) }, { key: "plan", label: "Plan" },
    { key: "volume", label: "Volume" }, { key: "status", label: "Status", render: (r) => reqBadge(r.status), sort: (r) => (r.status === "pending" ? "0" : r.status) },
    { key: "created", label: "Filed", render: (r) => when(r.created) }, { key: "note", label: "Note", render: (r) => esc(r.note) },
    { key: "act", label: "", sort: () => null, render: (r) => reqActs(r.uid, r.plan, r.status, r.email) }],
    s.requests, { rowHref: (r) => `/user/${r.uid}`, initial: { key: "status", desc: false }, empty: "No upgrade requests yet." });
  wireActions(main(), () => route());
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
  main().innerHTML = head("Messages") + `<p class="muted">Sent through the contact form on cricsynthesis.in/contact. Each sender got a "thanks, we'll get back to you" email. Reply from your own inbox, then mark it replied.</p>
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
  main().innerHTML = head("Applications") + `<p class="muted">Sent through the careers page. Each applicant got a confirmation email, and the team inbox got the details with the resume attached. Shortlist or decline here to send the outcome email.</p>
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

// ── product (Google Analytics 4: visitors who accepted analytics cookies) ──
const EVENT_NAMES: Record<string, string> = { page_view: "Page views", match_view: "Match opened", match_tab: "Match tab opened",
  lab_run: "Lab scenario run", sign_up: "Sign-up", login: "Sign-in", api_key_created: "API key created",
  upgrade_request: "Upgrade request", app_download: "App download", session_start: "Session started", first_visit: "First visit",
  user_engagement: "Engaged", scroll: "Scrolled to bottom", click: "Outbound click", file_download: "File download" };
async function product() {
  const [g, t] = await Promise.all([api("/api/product"), api("/api/traffic").catch(() => null)]);
  const sum = (rows: Row[] | undefined, k: string, from = 0) => (rows || []).slice(from).reduce((s, r) => s + Number(r[k] || 0), 0);
  const users7 = sum(g.daily, "users", -7), visits7 = t?.rum ? sum(t.rum.days, "visits", -7) : null;
  const rate = visits7 ? Math.min(1, users7 / visits7) : null;
  const top = (g.funnel?.[0]?.users as number) || 0;
  const nvr = Object.fromEntries((g.newVsReturning || []).map((r: Row) => [r.name, r.value]));
  const returning = (nvr.returning || 0) / Math.max(1, (nvr.returning || 0) + (nvr.new || 0));
  main().innerHTML = head("Product (Google Analytics)") + `<p class="muted">Website visitors who accepted analytics cookies. Property ${esc(g.property || "–")} ·
      updated ${ago(g.built)} · <a href="https://analytics.google.com/analytics/web/#/p${esc(g.property || "")}/reports/intelligenthome" target="_blank" rel="noopener">Open GA4</a></p>`
    + (g.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${g.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") + `
    <div class="tiles">
      ${tile("Active right now", n(g.realtime), "last 30 minutes")}
      ${tile("Users (7 days)", n(users7), `${n(sum(g.daily, "users"))} in 30 days`)}
      ${tile("Returning users", pct(returning), "of users in 30 days came back")}
      ${tile("Consent rate (est.)", pct(rate), visits7 ? `GA users ÷ ${n(visits7)} Cloudflare visits, 7 days` : "needs Web Analytics data")}
    </div>
    ${g.daily ? `<section class="card">${bars(g.daily, [{ key: "users", label: "Users", color: S1 }], { x: "day", title: "Users per day (30 days)", total: false })}</section>` : ""}
    <section class="card"><h2>Funnel (30 days)</h2>${g.funnel ? `<ol class="funnel">${(g.funnel as Row[]).map((f, i) => `<li>
        <span class="fl">${esc(f.label)}</span><span class="rb"><i style="width:${top ? (100 * f.users / top).toFixed(1) : 0}%"></i></span>
        <span class="rv">${n(f.users)}</span><span class="muted">${i ? pct(top ? f.users / top : null, 1) : ""}</span></li>`).join("")}</ol>
      <p class="muted">Users who did each step at least once. Sign-ups and keys from people who rejected cookies appear only in Users / API keys.</p>` : ""}</section>
    <div class="grid2"><section class="card"><h2>Events (30 days)</h2><div id="ev"></div></section>
      <section class="card"><h2>Top pages (7 days)</h2>${ranked((g.pages || []).map((r: Row) => ({ name: r.name, value: r.value })))}</section></div>
    <div class="grid2"><section class="card"><h2>Where visitors come from (7 days)</h2>${ranked((g.sources || []).map((r: Row) => ({ name: r.name, value: r.value })))}</section>
      <section class="card"><h2>Countries (7 days)</h2>${ranked((g.countries || []).map((r: Row) => ({ name: r.name, value: r.value })))}
      <h2>Devices</h2>${ranked((g.devices || []).map((r: Row) => ({ name: r.name, value: r.value })))}</section></div>`;
  table($("#ev")!, [{ key: "name", label: "Event", render: (r) => `${esc(EVENT_NAMES[r.name] || r.name)} <small class="muted">${esc(r.name)}</small>` },
    { key: "count", label: "Count", num: true, render: (r) => n(r.count) }, { key: "users", label: "Users", num: true, render: (r) => n(r.users) }],
    g.events || [], { initial: { key: "count", desc: true }, empty: "No events yet." });
}

// ── UX (Microsoft Clarity: visitors who allowed session recordings) ──
async function ux() {
  const c = await api("/api/ux");
  const link = `https://clarity.microsoft.com/projects/view/${esc(c.project || "zeyhpmwp0b")}/dashboard`;
  const list = (rows: Row[] | undefined, fmt = (v: number) => n(v)) => ranked((rows || []).map((r) => ({ name: r.url.replace(/^https?:\/\/[^/]+/, "") || "/", value: Number(r.value) })), fmt);
  const s = c.summary || {};
  const share = (m: string) => { const r = s[m] || {}; const v = r.sessionsWithMetricPercentage ?? r.subTotal; return v == null ? "–" : `${n(v)}${r.sessionsWithMetricPercentage != null ? "%" : ""}`; };
  main().innerHTML = head("UX (Microsoft Clarity)") + `<p class="muted">Last 3 days, visitors who allowed session recordings · updated ${ago(c.built)} · refreshed at most every 6 hours (Clarity allows 10 exports a day) ·
      <a href="${link}" target="_blank" rel="noopener">Open Clarity (heatmaps and recordings)</a></p>`
    + (c.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${c.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") + `
    <div class="tiles">
      ${tile("Sessions (3 days)", n(c.sessions), c.bots != null ? `${n(c.bots)} bot sessions filtered` : "")}
      ${tile("Users (3 days)", n(c.users), c.pagesPerSession != null ? `${n(c.pagesPerSession)} pages per session` : "")}
      ${tile("Rage clicks", share("RageClickCount"), "sessions with repeated angry clicks")}
      ${tile("Dead clicks", share("DeadClickCount"), "sessions clicking things that do nothing")}
      ${tile("Quick backs", share("QuickbackClick"), "sessions leaving a page straight away")}
      ${tile("Script errors", share("ScriptErrorCount"), "sessions with a JavaScript error")}
    </div>
    <div class="grid2"><section class="card"><h2>Rage clicks by page</h2>${list(c.rage)}</section>
      <section class="card"><h2>Dead clicks by page</h2>${list(c.dead)}</section></div>
    <div class="grid2"><section class="card"><h2>Quick backs by page</h2>${list(c.quickback)}</section>
      <section class="card"><h2>Script errors by page</h2>${list(c.scriptErrors)}</section></div>
    <div class="grid2"><section class="card"><h2>Average scroll depth by page</h2>${list(c.scroll, (v) => `${n(v)}%`)}</section>
      <section class="card"><h2>Most visited pages</h2>${list(c.traffic)}</section></div>`;
}

// ── audit log ──
const ACT_NAMES: Record<string, string> = { signin: "Signed in", "request.approve": "Approved request", "request.decline": "Declined request",
  "key.revoke": "Revoked key", "key.plan": "Changed key plan", "user.disable": "Disabled account", "user.enable": "Enabled account",
  "user.website-plan": "Changed website plan", "user.tier": "Set subscription", "user.delete": "Deleted account",
  "contact.status": "Updated message", "contact.read": "Marked message read / unread", "contact.delete": "Deleted message" };
async function log() {
  const l = await api("/api/log");
  main().innerHTML = head("Audit log") + `<p class="muted">Every admin sign-in and action, newest first (last 200).</p><div id="tbl"></div>`;
  table($("#tbl")!, [{ key: "at", label: "When", render: (r) => `<span title="${esc(r.at)}">${when(r.at)}</span>` },
    { key: "email", label: "Admin" }, { key: "what", label: "Action", render: (r) => esc(ACT_NAMES[r.what] || r.what) },
    { key: "uid", label: "Account", render: (r) => (r.uid ? `<a href="#/user/${encodeURIComponent(r.uid)}">${esc(r.uid)}</a>` : "–") },
    { key: "done", label: "Details", render: (r) => esc(r.done || [r.ip, r.country].filter(Boolean).join(" · ")) }],
    l.entries || [], { initial: { key: "at", desc: true }, empty: "Nothing logged yet." });
}

// ── search (Google Search Console) ──
async function search() {
  const [s, b] = await Promise.all([api("/api/search"), api("/api/bing").catch((e): Row => ({ errors: [String(e.message)] }))]);
  const delta = (a: number | null, b: number | null, lowerBetter = false) => {
    if (a == null || b == null || !b) return "";
    const d = (a - b) / b, good = lowerBetter ? d < 0 : d > 0;
    return ` ${badge(`${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}%`, Math.abs(d) < 0.02 ? "plain" : good ? "good" : "bad")}`;
  };
  const pos = (v: number | null) => (v == null ? "–" : v.toFixed(1));
  const l7 = s.last7 || {}, p7 = s.prev7 || {};
  const cols: Col<Row>[] = [{ key: "key", label: "", render: (r) => esc(r.key.replace(/^https?:\/\/[^/]+/, "") || r.key) },
    { key: "clicks", label: "Clicks", num: true, render: (r) => n(r.clicks) }, { key: "impressions", label: "Impressions", num: true, render: (r) => n(r.impressions) },
    { key: "ctr", label: "CTR", num: true, render: (r) => pct(r.ctr, 1) }, { key: "position", label: "Position", num: true, render: (r) => pos(r.position) }];
  main().innerHTML = head("Search (Google and Bing)") + `<p class="muted">${esc(s.site || "")} · last 28 days · Google's data lags 2–3 days · updated ${ago(s.built)} ·
      <a href="https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(s.site || "")}" target="_blank" rel="noopener">Open Search Console</a></p>`
    + (s.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${s.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") + `
    <div class="tiles">
      ${tile("Clicks (7 days)", n(l7.clicks) + delta(l7.clicks, p7.clicks), `${n(s.total?.clicks)} in 28 days`)}
      ${tile("Impressions (7 days)", n(l7.impressions) + delta(l7.impressions, p7.impressions), `${n(s.total?.impressions)} in 28 days`)}
      ${tile("Click-through rate", pct(l7.ctr, 1), "last 7 days")}
      ${tile("Average position", pos(l7.position) + delta(l7.position, p7.position, true), "last 7 days · lower is better")}
    </div>
    ${s.daily?.length ? `<section class="card">${bars(s.daily, [{ key: "clicks", label: "Clicks", color: S1 }], { x: "day", title: "Clicks per day" })}</section>
      <section class="card">${bars(s.daily, [{ key: "impressions", label: "Impressions", color: S1 }], { x: "day", title: "Impressions per day" })}</section>` : ""}
    <section class="card"><h2>Top search queries</h2><div id="q"></div></section>
    <section class="card"><h2>Top pages</h2><div id="p"></div></section>
    <div class="grid2"><section class="card"><h2>Countries</h2><div id="c"></div></section>
      <section class="card"><h2>Devices</h2><div id="d"></div><h2 style="margin-top:16px">Sitemaps</h2><div id="sm"></div></section></div>`;
  main().insertAdjacentHTML("beforeend", `<h2 class="sec">Bing</h2>${b.errors?.length ? `<div class="warn"><ul>${b.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    ${b.daily ? `<div class="tiles">${tile("Bing clicks (7 days)", n(b.last7?.clicks), `${n(b.total?.clicks)} in the period`)}${tile("Bing impressions (7 days)", n(b.last7?.impressions), `${n(b.total?.impressions)} in the period`)}</div>
      ${b.daily.length ? `<section class="card">${bars(b.daily.slice(-30), [{ key: "clicks", label: "Clicks", color: S1 }], { x: "day", title: "Bing clicks per day" })}</section>` : ""}
      <div class="grid2"><section class="card"><h2>Bing queries</h2><div id="bq"></div></section><section class="card"><h2>Bing pages</h2><div id="bp"></div></section></div>` : ""}`);
  if (b.daily) {
    table($("#bq")!, cols, b.queries || [], { initial: { key: "clicks", desc: true }, limit: 15, empty: "No Bing queries yet." });
    table($("#bp")!, cols, b.pages || [], { initial: { key: "clicks", desc: true }, limit: 15, empty: "No Bing pages yet." });
  }
  table($("#q")!, cols, s.queries || [], { initial: { key: "clicks", desc: true }, limit: 25, empty: "No search queries yet." });
  table($("#p")!, cols, s.pages || [], { initial: { key: "clicks", desc: true }, limit: 25, empty: "No pages with impressions yet." });
  table($("#c")!, cols, s.countries || [], { initial: { key: "clicks", desc: true } });
  table($("#d")!, cols, s.devices || [], { initial: { key: "clicks", desc: true } });
  table($("#sm")!, [{ key: "path", label: "Sitemap", render: (r) => esc(r.path.replace(/^https?:\/\/[^/]+/, "")) },
    { key: "lastDownloaded", label: "Last read", render: (r) => ago(r.lastDownloaded) },
    { key: "submitted", label: "URLs", num: true, render: (r) => n(r.submitted) },
    { key: "errors", label: "Issues", render: (r) => (r.errors ? badge(`${r.errors} errors`, "bad") : r.warnings ? badge(`${r.warnings} warnings`, "warn") : r.pending ? badge("Pending", "info") : badge("OK", "good")) }],
    s.sitemaps || [], { empty: "No sitemaps submitted." });
}

// ── traffic ──
async function traffic() {
  const t = await api("/api/traffic");
  const rum = t.rum, zone = t.zone as Row[] | null, wk = t.workers as Row[] | null;
  const scripts: Record<string, { today: number; d30: number; errors: number }> = {};
  const today = new Date().toISOString().slice(0, 10);
  const perDay: Record<string, number> = {};
  for (const r of wk || []) {
    const s = (scripts[r.script] ||= { today: 0, d30: 0, errors: 0 });
    s.d30 += r.requests; s.errors += r.errors;
    if (r.day === today) s.today += r.requests;
    perDay[r.day] = (perDay[r.day] || 0) + r.requests;
  }
  const sum = (rows: Row[] | undefined, k: string, from = 0) => (rows || []).slice(from).reduce((s, r) => s + Number(r[k] || 0), 0);
  main().innerHTML = head("Traffic") + (t.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${t.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") + `
    <div class="tiles">
      ${tile("Page views (7 days)", rum ? n(sum(rum.days, "views", -7)) : "–", rum ? `${n(sum(rum.days, "visits", -7))} visits · Web Analytics` : "Web Analytics not connected")}
      ${tile("Page views (30 days)", rum ? n(sum(rum.days, "views")) : "–", rum ? `${n(sum(rum.days, "visits"))} visits` : "")}
      ${tile("Unique visitors (yesterday)", n(zone?.at(-2)?.uniques), "all requests to the domain")}
      ${tile("Worker requests today", n(Object.values(scripts).reduce((s, x) => s + x.today, 0)), "of 100,000 a day on the free plan")}
    </div>
    ${rum ? `<section class="card">${bars(rum.days, [{ key: "views", label: "Page views", color: S1 }], { x: "day", title: "Page views per day (Web Analytics, 30 days)" })}</section>
    <div class="grid2"><section class="card"><h2>Top pages (7 days)</h2>${ranked(rum.pages.map((r: Row) => ({ name: r.name, value: r.views })))}</section>
      <section class="card"><h2>Countries (7 days)</h2>${ranked(rum.countries.map((r: Row) => ({ name: r.name, value: r.views })))}</section></div>
    <div class="grid2"><section class="card"><h2>Referrers (7 days)</h2>${ranked(rum.referrers.map((r: Row) => ({ name: r.name, value: r.views })))}</section>
      <section class="card"><h2>Devices (7 days)</h2>${ranked(rum.devices.map((r: Row) => ({ name: r.name, value: r.views })))}</section></div>` : ""}
    ${t.vitals ? vitalsHtml(t.vitals) : ""}
    ${zone ? `<section class="card">${bars(zone, [{ key: "uniques", label: "Unique visitors", color: S1 }], { x: "day", title: "Unique visitors per day (all requests to the domain)", total: false })}</section>` : ""}
    ${wk ? `<section class="card">${bars(Object.entries(perDay).sort().map(([d, v]) => ({ day: d, requests: v })), [{ key: "requests", label: "Requests", color: S1 }], { x: "day", title: "Worker requests per day (all scripts)" })}
      <div id="scripts"></div></section>` : ""}`;
  if (t.vitals) {
    const vcols: Col<Row>[] = [{ key: "name", label: "" }, { key: "samples", label: "Samples", num: true, render: (r) => n(r.samples) },
      { key: "lcp", label: "LCP", num: true, render: (r) => vital("lcp", r.lcp) }, { key: "inp", label: "INP", num: true, render: (r) => vital("inp", r.inp) },
      { key: "cls", label: "CLS", num: true, render: (r) => vital("cls", r.cls) }, { key: "ttfb", label: "TTFB", num: true, render: (r) => fmtVital("ttfb", r.ttfb) }];
    table($("#cwv-pages")!, vcols, t.vitals.pages || [], { initial: { key: "samples", desc: true }, empty: "No samples yet." });
    table($("#cwv-dev")!, vcols, t.vitals.devices || [], { initial: { key: "samples", desc: true }, empty: "No samples yet." });
  }
  if (wk) table($("#scripts")!, [{ key: "script", label: "Worker" }, { key: "today", label: "Today", num: true, render: (r) => n(r.today) },
    { key: "d30", label: "30 days", num: true, render: (r) => n(r.d30) }, { key: "errors", label: "Errors (30d)", num: true, render: (r) => n(r.errors) }],
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
  const runBadge = (r: Row) => !r.last ? badge(r.error ? "Unknown" : "No runs", "plain")
    : r.last.status !== "completed" ? badge("Running", "info") : r.last.conclusion === "success" ? badge("Passed", "good")
    : r.last.conclusion === "failure" ? badge("Failed", "bad") : badge(r.last.conclusion || "–", "plain");
  main().innerHTML = head("Pipeline health") + (h.errors?.length ? `<div class="warn"><b>Some data is missing:</b><ul>${h.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") + `
    <div class="tiles">
      ${tile("Forecasts published", h.data ? ago(h.data.generated) : "–", h.data ? `${n(h.data.upcoming)} upcoming · ${n(h.data.live)} live` : "")}
      ${tile("Upcoming without XIs", h.data ? n(h.data.missingXi.length) : "–", "simulated on probable XIs")}
      ${tile("Site files", files != null ? n(files) : "–", files != null ? `${pct(files / h.limits.pagesFiles)} of the 20,000 Pages limit` : "build.json appears after the next publish")}
      ${tile("Android app", esc(h.app?.version || "–"), h.app ? `build ${esc(h.app.build ?? h.app.versionCode ?? "–")}` : "")}
    </div>
    ${files != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="20000" aria-valuenow="${files}"><i style="width:${Math.min(100, 100 * files / 20000).toFixed(1)}%" class="${files > 18000 ? "bad" : files > 15000 ? "warn" : ""}"></i></div>` : ""}
    ${uptimeHtml(up)}
    ${metersHtml(m, files, h.limits?.pagesFiles)}
    <section class="card"><h2>Workflows</h2><div id="runs"></div></section>
    <div class="grid2"><section class="card"><h2>Upcoming matches without XIs</h2><div id="xi"></div></section>
      <section class="card"><h2>App releases</h2><div id="rel"></div></section></div>`;
  table($("#runs")!, [{ key: "label", label: "Workflow", render: (r) => `${esc(r.label)} <small class="muted">${esc(r.file)}</small>` },
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
    ${m.errors?.length ? `<div class="warn"><ul>${m.errors.map((e: string) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    <div class="meters">${rows.map((r) => `<div class="mt"><div class="mt-h"><b>${esc(r.label)}</b>
      <span>${r.today == null ? "–" : n(r.today)} / ${n(r.limit)} ${r.share == null ? "" : badge(pct(r.share), r.share >= 0.8 ? "bad" : r.share >= 0.5 ? "warn" : "good")}</span></div>
      <div class="meter"><i style="width:${Math.min(100, 100 * (r.share || 0)).toFixed(1)}%" class="${(r.share || 0) >= 0.8 ? "bad" : (r.share || 0) >= 0.5 ? "warn" : ""}"></i></div>
      <small class="muted">${esc(r.note || "")}${r.peak14 != null ? ` · busiest of 14 days ${n(r.peak14)}` : ""}</small></div>`).join("")}</div></section>`;
}

// ── accuracy ──
async function accuracy() {
  const a = await api("/api/accuracy"), o = a.overall;
  main().innerHTML = head("Model accuracy") + `<p class="muted">From the published results (scored after each match). Updated ${ago(a.generated)}.</p>
    <div class="tiles">
      ${tile("Projections that came true", pct(o.accuracy), `${n(o.hits)} of ${n(o.checks)} checks · ${n(o.matches)} matches`)}
      ${tile("Favourite won", pct(o.favourite), `${n(o.favouriteOf)} matches`)}
      ${tile("Result Brier score", o.brier == null ? "–" : o.brier.toFixed(3), "lower is better; 0.25 = coin flip")}
      ${tile("Fantasy XI", pct(o.fantasy), "of the best possible XI's points")}
    </div>
    <section class="card">${bars(a.months.map((m: Row) => ({ month: m.key, acc: m.accuracy == null ? 0 : Math.round(m.accuracy * 1000) / 10 })),
      [{ key: "acc", label: "Projections that came true (%)", color: S1 }], { x: "month", xLabel: (v) => v, fmt: (v) => `${v}%`, title: "By month" })}</section>
    <section class="card"><h2>By format</h2><div id="fmt"></div></section>
    <section class="card"><h2>By competition</h2><div id="comp"></div></section>
    <div class="grid2"><section class="card"><h2>By match-centre tab</h2><div id="tabs"></div></section>
      <section class="card"><h2>Latest matches</h2><div id="recent"></div></section></div>`;
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
