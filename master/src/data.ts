// What the console shows, built from Firebase Auth accounts and the Firestore users/* tree (profiles, keys,
// usage per day, upgrade requests). Pure functions over plain rows, so tests can feed them fixtures.
import { MCP_DAILY, PLANS } from "../../edge/src/keys.ts";
import type { AuthUser, Doc } from "./gcp.ts";

type Row = Record<string, any>;
export const BETA_PRO = true;                 // as app/lib/firebase.ts: every signed-in account has Pro during the beta
const RANK: Record<string, number> = { free: 0, pro: 1, business: 2 };

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number, now = new Date()) => dayKey(new Date(now.getTime() - n * 86400_000));
const uidOf = (path: string) => path.split("/")[1] || "";
const ts = (v: any): string | null => (typeof v === "string" && v ? v : null);

export type Inputs = {
  now: Date;
  auth: AuthUser[] | null;                    // null when Firebase Auth couldn't be read
  profiles: Doc[];                            // users/{uid} (including ids that only have subcollections)
  keys: Doc[];                                // every users/{uid}/keys/{slot}
  requests: Doc[];                            // every users/{uid}/requests/{plan}
  usage: Record<string, Doc[]>;               // uid → users/{uid}/usage/{day} docs (recent days)
};

export function limitFor(slot: string, plan: string): number {
  return slot === "mcp" ? MCP_DAILY : (PLANS[plan] || PLANS.free).daily_requests;
}

export function websitePlan(u: AuthUser | null): { plan: string; source: string } {
  const claim = u?.claims?.plan;
  if (claim && claim !== "free") return { plan: claim === "pro" ? "Pro" : String(claim), source: "assigned" };
  return BETA_PRO ? { plan: "Pro", source: "beta" } : { plan: "Free", source: "default" };
}

export function keyRow(k: Doc, usage: Doc[], today: string, from30: string) {
  const slot = k._id;
  let t = 0, d30 = 0;
  for (const u of usage) {
    const n = Number(u.keys?.[slot] || 0);
    if (u._id === today) t += n;
    if (u._id >= from30) d30 += n;
  }
  return { uid: uidOf(k._path), slot, name: k.name || "Untitled key", prefix: k.prefix || "", plan: k.plan || "free",
           created: ts(k.created), lastUsed: ts(k.lastUsed), revoked: Boolean(k.revoked), revokedAt: ts(k.revokedAt),
           today: t, calls30: d30, limit: limitFor(slot, k.plan || "free") };
}

/** The per-user summary row (users table) for one account. */
export function userRow(uid: string, a: AuthUser | null, profile: Doc | undefined, keys: Doc[], requests: Doc[], usage: Doc[], now: Date) {
  const today = dayKey(now), from7 = daysAgo(6, now), from30 = daysAgo(29, now);
  const live = keys.filter((k) => !k.revoked);
  const apiPlan = live.reduce((p, k) => ((RANK[k.plan] ?? 0) > (RANK[p] ?? 0) ? k.plan : p), "free");
  let calls7 = 0, calls30 = 0, callsToday = 0, mcp30 = 0, mcpDays = 0, lastCall: string | null = null;
  for (const u of usage) {
    const n = Number(u.total || 0);
    if (u._id >= from30) { calls30 += n; const m = Number(u.keys?.mcp || 0); mcp30 += m; if (m) mcpDays++; }
    if (u._id >= from7) calls7 += n;
    if (u._id === today) callsToday += n;
    if (n && (!lastCall || u._id > lastCall.slice(0, 10))) lastCall = ts(u.updated) || u._id;
  }
  const web = websitePlan(a);
  const lastSeen = [a?.lastActive, a?.lastLogin, lastCall].filter(Boolean).sort().pop() || null;
  return {
    uid, email: a?.email ?? null, name: a?.name ?? null, photo: a?.photo ?? null, verified: a?.verified ?? false,
    providers: a?.providers ?? [], created: a?.created ?? null, lastLogin: a?.lastLogin ?? null, lastSeen,
    disabled: a?.disabled ?? false, inAuth: Boolean(a),
    company: profile?.company || null,
    websitePlan: web.plan, websitePlanSource: web.source, apiPlan,
    paid: apiPlan !== "free" || web.source === "assigned",
    keys: keys.length, activeKeys: live.length, mcpDays, mcp30,
    today: callsToday, calls7, calls30, lastCall,
    requestsOpen: requests.filter((r) => r.status === "pending").length,
  };
}

const group = <T extends Doc>(docs: T[]) => {
  const m = new Map<string, T[]>();
  for (const d of docs) { const u = uidOf(d._path); m.set(u, [...(m.get(u) || []), d]); }
  return m;
};

/** The console's overview and tables (stored as the snapshot). */
export function snapshot(inp: Inputs) {
  const { now } = inp;
  const today = dayKey(now), from7 = daysAgo(6, now), from30 = daysAgo(29, now);
  const authBy = new Map((inp.auth || []).map((a) => [a.uid, a]));
  const profBy = new Map(inp.profiles.map((p) => [p._id, p]));
  const keysBy = group(inp.keys), reqBy = group(inp.requests);
  const uids = new Set<string>([...authBy.keys(), ...profBy.keys(), ...keysBy.keys(), ...reqBy.keys(), ...Object.keys(inp.usage)]);
  const users = [...uids].map((uid) => userRow(uid, authBy.get(uid) || null, profBy.get(uid), keysBy.get(uid) || [],
                                               reqBy.get(uid) || [], inp.usage[uid] || [], now));
  const emailOf = new Map(users.map((u) => [u.uid, u.email]));

  const keys = inp.keys.map((k) => ({ ...keyRow(k, inp.usage[uidOf(k._path)] || [], today, from30), email: emailOf.get(uidOf(k._path)) ?? null }));

  // daily series, categories, endpoints, limit hits
  const days: Row = {};
  for (let i = 29; i >= 0; i--) days[daysAgo(i, now)] = { day: daysAgo(i, now), signups: 0, calls: 0, api: 0, mcp: 0, active: 0 };
  const cats: Record<string, number> = {}, eps: Record<string, number> = {};
  const limitHits: Row[] = [];
  const planOf = new Map(inp.keys.map((k) => [`${uidOf(k._path)}/${k._id}`, k.plan || "free"]));
  for (const [uid, docs] of Object.entries(inp.usage)) {
    for (const u of docs) {
      if (u._id < from30) continue;
      const d = days[u._id];
      const total = Number(u.total || 0), mcp = Number(u.keys?.mcp || 0);
      if (d) { d.calls += total; d.mcp += mcp; d.api += total - mcp; if (total) d.active += 1; }
      for (const [c, n] of Object.entries<number>(u.cats || {})) cats[c] = (cats[c] || 0) + Number(n);
      for (const [e, n] of Object.entries<number>(u.eps || {})) eps[e] = (eps[e] || 0) + Number(n);
      for (const [slot, n] of Object.entries<number>(u.keys || {})) {
        const limit = limitFor(slot, planOf.get(`${uid}/${slot}`) || "free");
        if (Number(n) >= limit) limitHits.push({ uid, email: emailOf.get(uid) ?? null, day: u._id, slot, calls: Number(n), limit });
      }
    }
  }
  for (const u of users) if (u.created && days[u.created.slice(0, 10)]) days[u.created.slice(0, 10)].signups += 1;

  const since = (iso: string | null, from: string) => Boolean(iso && iso.slice(0, 10) >= from);
  const active = (from: string) => users.filter((u) => since(u.lastSeen, from)).length;
  const requests = inp.requests.map((r) => ({ uid: uidOf(r._path), email: emailOf.get(uidOf(r._path)) ?? null, plan: r.plan || r._id,
    volume: r.volume || null, note: r.note || "", status: r.status || "pending", created: ts(r.created) }))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const count = (f: (u: typeof users[number]) => boolean) => users.filter(f).length;
  const liveKeys = keys.filter((k) => !k.revoked);

  return {
    built: now.toISOString(),
    totals: {
      users: users.length, verified: count((u) => u.verified), disabled: count((u) => u.disabled),
      signups: { d1: count((u) => since(u.created, today)), d7: count((u) => since(u.created, from7)), d30: count((u) => since(u.created, from30)) },
      active: { d1: active(today), d7: active(from7), d30: active(from30) },
      keys: { total: keys.length, active: liveKeys.length, revoked: keys.length - liveKeys.length,
              used7: liveKeys.filter((k) => since(k.lastUsed, from7)).length },
      plans: { website: { pro_assigned: count((u) => u.websitePlanSource === "assigned"), beta: count((u) => u.websitePlanSource === "beta") },
               api: { free: count((u) => u.apiPlan === "free"), pro: count((u) => u.apiPlan === "pro"), business: count((u) => u.apiPlan === "business") },
               paid: count((u) => u.paid) },
      calls: { today: users.reduce((s, u) => s + u.today, 0), d7: users.reduce((s, u) => s + u.calls7, 0),
               d30: users.reduce((s, u) => s + u.calls30, 0), mcp30: users.reduce((s, u) => s + u.mcp30, 0) },
      mcpUsers30: count((u) => u.mcpDays > 0),
      nearLimit: keys.filter((k) => !k.revoked && k.today >= 0.8 * k.limit).length,
      requestsOpen: requests.filter((r) => r.status === "pending").length,
    },
    series: Object.values(days),
    cats,
    endpoints: Object.entries(eps).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([ep, calls]) => ({ ep, calls })),
    limitHits: limitHits.sort((a, b) => b.day.localeCompare(a.day)).slice(0, 200),
    users: users.sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 5000),
    keys: keys.sort((a, b) => b.calls30 - a.calls30 || String(b.created).localeCompare(String(a.created))),
    requests,
  };
}
export type Snapshot = ReturnType<typeof snapshot> & { errors?: string[] };

/** One account in full: identity, plans and services, keys, usage by day / key / endpoint, requests, timeline. */
export function profile(uid: string, a: AuthUser | null, prof: Doc | null, keys: Doc[], requests: Doc[], usage: Doc[], now: Date) {
  const today = dayKey(now), from30 = daysAgo(29, now);
  const row = userRow(uid, a, prof || undefined, keys, requests, usage, now);
  const series: Row[] = [];
  const byDay = new Map(usage.map((u) => [u._id, u]));
  for (let i = 89; i >= 0; i--) {
    const d = daysAgo(i, now), u = byDay.get(d);
    series.push({ day: d, total: Number(u?.total || 0), keys: u?.keys || {}, cats: u?.cats || {} });
  }
  const eps: Record<string, number> = {}, cats: Record<string, number> = {};
  const limitDays: Row[] = [];
  const planOf = new Map(keys.map((k) => [k._id, k.plan || "free"]));
  for (const u of usage) {
    if (u._id < from30) continue;
    for (const [e, n] of Object.entries<number>(u.eps || {})) eps[e] = (eps[e] || 0) + Number(n);
    for (const [c, n] of Object.entries<number>(u.cats || {})) cats[c] = (cats[c] || 0) + Number(n);
  }
  for (const u of usage) for (const [slot, n] of Object.entries<number>(u.keys || {})) {
    const limit = limitFor(slot, planOf.get(slot) || "free");
    if (Number(n) >= limit) limitDays.push({ day: u._id, slot, calls: Number(n), limit });
  }
  const keyRows = keys.map((k) => keyRow(k, usage, today, from30));
  const mcpRows = usage.filter((u) => Number(u.keys?.mcp || 0) > 0).map((u) => u._id).sort();
  const reqs = requests.map((r) => ({ plan: r.plan || r._id, volume: r.volume || null, note: r.note || "", status: r.status || "pending",
                                      created: ts(r.created), updated: r._updated || null }));
  const firstCall = usage.filter((u) => Number(u.total || 0) > 0).map((u) => u._id).sort()[0] || null;

  const timeline: { at: string; what: string }[] = [];
  if (a?.created) timeline.push({ at: a.created, what: "Joined" });
  for (const k of keyRows) {
    if (k.created) timeline.push({ at: k.created, what: `Created API key "${k.name}" (${k.prefix}…)` });
    if (k.revokedAt) timeline.push({ at: k.revokedAt, what: `Revoked API key "${k.name}"` });
  }
  if (firstCall) timeline.push({ at: firstCall, what: "First API / MCP call (in the last 90 days)" });
  if (mcpRows.length) timeline.push({ at: mcpRows[0], what: "First MCP connector use (in the last 90 days)" });
  for (const r of reqs) if (r.created) timeline.push({ at: r.created, what: `Requested ${r.plan} (${r.status})` });
  if (a?.lastLogin) timeline.push({ at: a.lastLogin, what: "Last sign-in" });
  timeline.sort((x, y) => y.at.localeCompare(x.at));

  return {
    user: row,
    identity: a ? { ...a } : null,
    profile: prof ? { company: prof.company || null, useCase: prof.useCase || null, notifyProduct: prof.notifyProduct ?? null,
                      notifyUsage: prof.notifyUsage ?? null, notifyBilling: prof.notifyBilling ?? null, updated: ts(prof.updated) } : null,
    services: {
      website: { plan: row.websitePlan, source: row.websitePlanSource, paid: row.websitePlanSource === "assigned" },
      api: { plan: row.apiPlan, paid: row.apiPlan !== "free", activeKeys: row.activeKeys, limit: (PLANS[row.apiPlan] || PLANS.free).daily_requests },
      mcp: { used: mcpRows.length > 0, days: mcpRows.length, lastDay: mcpRows[mcpRows.length - 1] || null,
             today: Number(byDay.get(today)?.keys?.mcp || 0), limit: MCP_DAILY },
    },
    keys: keyRows,
    usage: { series, endpoints: Object.entries(eps).sort((x, y) => y[1] - x[1]).map(([ep, calls]) => ({ ep, calls })), cats, limitDays,
             today: row.today, calls7: row.calls7, calls30: row.calls30 },
    requests: reqs,
    timeline,
  };
}
