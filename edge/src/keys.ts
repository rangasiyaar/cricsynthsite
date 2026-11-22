// API keys and plan limits: the same keys people create in the account dashboard (Firestore users/{uid}/keys/{slot},
// stored as a SHA-256 hash), the same plans as cricapi. Lookups are cached per isolate and rate-limited, so made-up
// keys can neither run through Firestore's free read quota nor grow memory. Usage is counted per key per UTC day in
// a Durable Object (one per key), which also writes it to the dashboard's users/{uid}/usage/{day} about once a minute.
import { Firestore } from "./google.ts";

export const PLANS: Record<string, { daily_requests: number; max_simulations: number; watermark: boolean }> = {
  free: { daily_requests: 200, max_simulations: 2_000, watermark: true },
  pro: { daily_requests: 20_000, max_simulations: 20_000, watermark: false },   // shown as "API Plus"
  business: { daily_requests: 50_000, max_simulations: 50_000, watermark: false },
};
export const MCP_DAILY = 200;             // MCP tool calls a day for a signed-in account (an API key uses its plan instead)
// Keys we issue: "cs_live_" + 24–64 characters. Anything else is refused before any lookup.
export const KEY_FORMAT = /^cs_live_[A-Za-z0-9_-]{24,64}$/;
export const CATEGORY_SLUGS: Record<string, string> = { Analytics: "analytics", "Simulation & modelling": "simulation", Graphics: "graphics" };

export interface Env {
  DATA?: R2Bucket;
  ASSETS?: Fetcher;                   // prepared per-match answers (edge/assets/edge/<id>.json), private
  DATA_URL?: string;
  USAGE: DurableObjectNamespace;
  GOOGLE_SA?: string;                 // secret: service-account JSON key with Firestore access
  OAUTH_SECRET?: string;              // optional: signs the MCP connector's client ids, codes and tokens (else derived from GOOGLE_SA)
  CONNECT_URL?: string;               // optional: the website's connect page (default cricsynthesis.in/connect/)
  FIRESTORE_PROJECT?: string;
  STATIC_KEYS?: string;               // optional JSON {sha256: plan} for keys not in the dashboard (tests, partners)
  CORS?: string;
  RAZORPAY_KEY_ID?: string;           // secrets: CricSynthesis Pro checkout (billing.ts); test keys start rzp_test_
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  TEAM_EMAIL?: string;
  TURNSTILE_SECRET?: string;            // secret: the public forms' bot check (turnstile.ts); off without it                  // optional: where form notices go (default hello@cricsynthesis.in)              // account emails (emails.ts, notify.ts); without it nothing is sent
}

export type Account = { hash: string; plan: string; owner: string | null; slot: string | null; limits: typeof PLANS[string] };

const TTL_MS = 60_000, MAX_CACHE = 5000, READS_PER_MIN = 120;
const cache = new Map<string, { t: number; rec: Account | null }>();
const reads: number[] = [];

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function keyFrom(req: Request): string | null {
  const x = req.headers.get("X-API-Key");
  if (x) return x.trim();
  const a = req.headers.get("Authorization");
  return a && a.toLowerCase().startsWith("bearer ") ? a.slice(7).trim() : null;
}

export async function lookup(env: Env, key: string): Promise<Account | null> {
  if (!KEY_FORMAT.test(key)) return null;
  const hash = await sha256(key);
  const statics = env.STATIC_KEYS ? JSON.parse(env.STATIC_KEYS) as Record<string, string> : {};
  if (statics[hash] && PLANS[statics[hash]]) return { hash, plan: statics[hash], owner: null, slot: null, limits: PLANS[statics[hash]] };
  const now = Date.now();
  const hit = cache.get(hash);
  if (hit && now - hit.t < TTL_MS) return hit.rec;
  if (!env.GOOGLE_SA) return null;
  while (reads.length && now - reads[0] > 60_000) reads.shift();
  if (reads.length >= READS_PER_MIN) return null;            // over budget: refuse rather than read
  reads.push(now);
  const doc = await new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT).findKey(hash);
  let rec: Account | null = null;
  if (doc && !doc.revoked && PLANS[doc.plan]) {
    // the account's plan counts too: a key made after an upgrade gets the account's plan, not Free
    const plan = higher(doc.plan, doc.owner ? await accountPlan(env, doc.owner) : "free");
    rec = { hash, plan, owner: doc.owner, slot: doc.slot, limits: PLANS[plan] };
  }
  if (cache.size >= MAX_CACHE) for (const k of [...cache.keys()].slice(0, MAX_CACHE / 10)) cache.delete(k);
  cache.set(hash, { t: now, rec });
  return rec;
}

const RANK: Record<string, number> = { free: 0, pro: 1, business: 2 };
export const higher = (a: string, b: string) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);
const TIER_PLAN: Record<string, string> = { "api-plus": "pro", business: "business" };   // billing/admin tier → API plan
const plans = new Map<string, { t: number; plan: string }>();

/** The account's API plan set by our team (users/{uid}/billing/admin: console subscriptions and approved upgrades),
 *  cached like keys; "free" when there is none or it can't be read. */
export async function accountPlan(env: Env, uid: string): Promise<string> {
  const now = Date.now();
  const c = plans.get(uid);
  if (c && now - c.t < TTL_MS) return c.plan;
  let plan = "free";
  if (env.GOOGLE_SA) {
    try {
      const d = await new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT).getDoc(`users/${uid}/billing/admin`);
      const until = d?.until ? Date.parse(String(d.until)) : NaN;
      if (d && TIER_PLAN[String(d.tier)] && !(Number.isFinite(until) && until <= now)) plan = TIER_PLAN[String(d.tier)];
    } catch { /* keep free */ }
  }
  if (plans.size >= MAX_CACHE) for (const k of [...plans.keys()].slice(0, MAX_CACHE / 10)) plans.delete(k);
  plans.set(uid, { t: now, plan });
  return plan;
}

/** The daily limit is per account: every key of an account and its MCP sign-in share one counter (deleting and
 *  re-creating keys starts nothing over). Keys without an owner (STATIC_KEYS) count on their own. */
export const counterId = (acct: Pick<Account, "hash" | "owner">) => (acct.owner ? `acct:${acct.owner}` : acct.hash);

/** A short field-safe name for an endpoint or tool, for the per-endpoint usage counts the admin console reads:
 *  "GET /v1/players/{id}/rating" → "players_rating", "POST /v1/simulate" → "post_simulate", MCP tool "par_score" → "mcp_par_score". */
export function endpointSlug(method: string, path: string): string {
  const parts = path.replace(/^\/v1\/?/, "").split("/").filter((p) => p && !p.startsWith("{"));
  const s = (method.toUpperCase() === "GET" ? "" : method.toLowerCase() + "_") + (parts.join("_") || "root");
  return s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "").slice(0, 64) || "other";
}
export const toolSlug = (tool: string) => ("mcp_" + tool.toLowerCase().replace(/[^a-z0-9_]+/g, "_")).slice(0, 64);

/** Count one request for this key's account; returns the account's count today (UTC). */
export async function hit(env: Env, acct: Account, category: string, endpoint = "other"): Promise<number> {
  const stub = env.USAGE.get(env.USAGE.idFromName(counterId(acct)));
  const r = await stub.fetch("https://usage/hit", { method: "POST", body: JSON.stringify(
    { owner: acct.owner, slot: acct.slot, cat: CATEGORY_SLUGS[category] || "other", ep: endpoint }) });
  return ((await r.json()) as { n: number }).n;
}

/** One per account (counterId): today's count across all its keys, plus what hasn't been written to the dashboard yet,
 *  kept per key so the dashboard still shows each key's share. */
export class Usage {
  state: DurableObjectState; env: Env;
  constructor(state: DurableObjectState, env: Env) { this.state = state; this.env = env; }

  async fetch(req: Request): Promise<Response> {
    const { owner, slot, cat, ep } = await req.json() as { owner: string | null; slot: string | null; cat: string; ep?: string };
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const st = this.state.storage;
    let today = (await st.get<{ day: string; n: number }>("today")) || { day, n: 0 };
    if (today.day !== day) today = { day, n: 0 };
    today.n += 1;
    await st.put("today", today);
    if (owner && slot && this.env.GOOGLE_SA) {
      const p = (await st.get<any>("pending")) || { owner, days: {} };
      const d = (p.days[`${day}|${slot}`] ||= { total: 0, cats: {}, eps: {}, last: "" });
      d.total += 1;
      d.cats[cat] = (d.cats[cat] || 0) + 1;
      d.eps ||= {};
      const e = ep && /^[a-z][a-z0-9_]{0,63}$/.test(ep) ? ep : "other";
      d.eps[e] = (d.eps[e] || 0) + 1;
      d.last = now.toISOString();
      await st.put("pending", p);
      if ((await st.getAlarm()) == null) await st.setAlarm(Date.now() + 60_000);
    }
    return Response.json({ n: today.n });
  }

  async alarm(): Promise<void> {
    const p = await this.state.storage.get<any>("pending");
    if (!p || !this.env.GOOGLE_SA) return;
    await this.state.storage.delete("pending");
    const fs = new Firestore(this.env.GOOGLE_SA, this.env.FIRESTORE_PROJECT);
    try {
      for (const [k, d] of Object.entries<any>(p.days)) {
        const [day, slot] = k.includes("|") ? k.split("|") : [k, p.slot];      // p.slot: a per-key counter from before
        await fs.addUsage(p.owner, day, slot, d.total, d.cats, d.last, d.eps || {});
      }
    } catch {
      // never lose counts over a failed write: put them back and retry in a minute
      const again = (await this.state.storage.get<any>("pending")) || { owner: p.owner, days: {} };
      for (const [k, d] of Object.entries<any>(p.days)) {
        const key = k.includes("|") ? k : `${k}|${p.slot}`;
        const x = (again.days[key] ||= { total: 0, cats: {}, eps: {}, last: d.last });
        x.total += d.total;
        for (const [c, n] of Object.entries<number>(d.cats)) x.cats[c] = (x.cats[c] || 0) + n;
        x.eps ||= {};
        for (const [e, n] of Object.entries<number>(d.eps || {})) x.eps[e] = (x.eps[e] || 0) + n;
      }
      await this.state.storage.put("pending", again);
    }
    // requests that arrived while writing wait for the next round
    if ((await this.state.storage.get("pending")) && (await this.state.storage.getAlarm()) == null) {
      await this.state.storage.setAlarm(Date.now() + 60_000);
    }
  }
}
