// API keys and plan limits: the same keys people create in the account dashboard (Firestore users/{uid}/keys/{slot},
// stored as a SHA-256 hash), the same plans as cricapi. Lookups are cached per isolate and rate-limited, so made-up
// keys can neither run through Firestore's free read quota nor grow memory. Usage is counted per key per UTC day in
// a Durable Object (one per key), which also writes it to the dashboard's users/{uid}/usage/{day} about once a minute.
import { Firestore } from "./google.ts";

export const PLANS: Record<string, { daily_requests: number; max_simulations: number; watermark: boolean }> = {
  free: { daily_requests: 200, max_simulations: 2_000, watermark: true },
  pro: { daily_requests: 5_000, max_simulations: 20_000, watermark: false },
  business: { daily_requests: 50_000, max_simulations: 50_000, watermark: false },
};
// Keys we issue: "cs_live_" + 24–64 characters. Anything else is refused before any lookup.
export const KEY_FORMAT = /^cs_live_[A-Za-z0-9_-]{24,64}$/;
export const CATEGORY_SLUGS: Record<string, string> = { Analytics: "analytics", "Simulation & modelling": "simulation", Graphics: "graphics" };

export interface Env {
  DATA?: R2Bucket;
  ASSETS?: Fetcher;                   // prepared per-match answers (edge/assets/edge/<id>.json), private
  DATA_URL?: string;
  USAGE: DurableObjectNamespace;
  GOOGLE_SA?: string;                 // secret: service-account JSON key with Firestore access
  FIRESTORE_PROJECT?: string;
  STATIC_KEYS?: string;               // optional JSON {sha256: plan} for keys not in the dashboard (tests, partners)
  CORS?: string;
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
  const rec = doc && !doc.revoked && PLANS[doc.plan]
    ? { hash, plan: doc.plan, owner: doc.owner, slot: doc.slot, limits: PLANS[doc.plan] } : null;
  if (cache.size >= MAX_CACHE) for (const k of [...cache.keys()].slice(0, MAX_CACHE / 10)) cache.delete(k);
  cache.set(hash, { t: now, rec });
  return rec;
}

/** Count one request for this key; returns today's count (UTC). */
export async function hit(env: Env, acct: Account, category: string): Promise<number> {
  const stub = env.USAGE.get(env.USAGE.idFromName(acct.hash));
  const r = await stub.fetch("https://usage/hit", { method: "POST", body: JSON.stringify(
    { owner: acct.owner, slot: acct.slot, cat: CATEGORY_SLUGS[category] || "other" }) });
  return ((await r.json()) as { n: number }).n;
}

/** One per API key: today's count, plus what hasn't been written to the dashboard yet. */
export class Usage {
  state: DurableObjectState; env: Env;
  constructor(state: DurableObjectState, env: Env) { this.state = state; this.env = env; }

  async fetch(req: Request): Promise<Response> {
    const { owner, slot, cat } = await req.json() as { owner: string | null; slot: string | null; cat: string };
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const st = this.state.storage;
    let today = (await st.get<{ day: string; n: number }>("today")) || { day, n: 0 };
    if (today.day !== day) today = { day, n: 0 };
    today.n += 1;
    await st.put("today", today);
    if (owner && slot && this.env.GOOGLE_SA) {
      const p = (await st.get<any>("pending")) || { owner, slot, days: {} };
      const d = (p.days[day] ||= { total: 0, cats: {}, last: "" });
      d.total += 1;
      d.cats[cat] = (d.cats[cat] || 0) + 1;
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
      for (const [day, d] of Object.entries<any>(p.days)) await fs.addUsage(p.owner, day, p.slot, d.total, d.cats, d.last);
    } catch {
      // never lose counts over a failed write: put them back and retry in a minute
      const again = (await this.state.storage.get<any>("pending")) || { owner: p.owner, slot: p.slot, days: {} };
      for (const [day, d] of Object.entries<any>(p.days)) {
        const x = (again.days[day] ||= { total: 0, cats: {}, last: d.last });
        x.total += d.total;
        for (const [c, n] of Object.entries<number>(d.cats)) x.cats[c] = (x.cats[c] || 0) + n;
      }
      await this.state.storage.put("pending", again);
    }
    // requests that arrived while writing wait for the next round
    if ((await this.state.storage.get("pending")) && (await this.state.storage.getAlarm()) == null) {
      await this.state.storage.setAlarm(Date.now() + 60_000);
    }
  }
}
