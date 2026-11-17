// CricSynthesis admin console (master.cricsynthesis.in), read-only. Static pages from ./public; JSON under /api/*,
// all behind the admin session (src/session.ts). The overview and tables come from a snapshot rebuilt every 6 hours
// by the cron (and on demand with POST /api/refresh), stored in Firestore adminSnapshot/latest so page views cost one
// read; a user's profile is read live. Never writes anything about users.
import { daysAgo, profile, snapshot, type Snapshot } from "./data.ts";
import { type Env, project } from "./env.ts";
import { accuracy, analytics, CLARITY_TTL_MS, clarityFetch, clarityShape, health, search, traffic } from "./external.ts";
import { type AuthUser, Google } from "./gcp.ts";
import { current, seal, setCookie, signIn } from "./session.ts";

const SECURITY: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'", "script-src 'self' https://apis.google.com https://www.gstatic.com",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
    "frame-src https://cricsynthesis.firebaseapp.com https://accounts.google.com https://apis.google.com",
    "img-src 'self' data: https://*.googleusercontent.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join("; "),
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...SECURITY, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const fail = (status: number, detail: string) => json({ detail }, status);

const google = (env: Env) => {
  if (!env.GOOGLE_SA) throw new Error("GOOGLE_SA isn't set");
  return new Google(env.GOOGLE_SA, project(env));
};

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await f(items[k]); }
  }));
  return out;
}

/** Read everything and build the snapshot (about one read per document, plus one query per account for usage). */
export async function build(env: Env, now = new Date()): Promise<Snapshot> {
  const g = google(env), errors: string[] = [];
  let auth: AuthUser[] | null = null;
  try { auth = await g.users(); } catch (e) {
    errors.push(`Firebase Auth: ${(e as Error).message} — grant the service account the Firebase Authentication Viewer role`);
  }
  const [profiles, keys, requests] = await Promise.all([g.list("users", true), g.group("keys"), g.group("requests")]);
  const uids = new Set<string>([...(auth || []).map((a) => a.uid), ...profiles.map((p) => p._id),
                                ...keys.map((k) => k._path.split("/")[1]), ...requests.map((r) => r._path.split("/")[1])]);
  const from = daysAgo(29, now), usage: Record<string, any[]> = {};
  await pool([...uids], 8, async (uid) => {
    try { const u = await g.usage(uid, from); if (u.length) usage[uid] = u; }
    catch (e) { if (errors.length < 20) errors.push(`usage ${uid}: ${(e as Error).message}`); }
  });
  return { ...snapshot({ now, auth, profiles, keys, requests, usage }), errors };
}

async function refresh(env: Env): Promise<Snapshot> {
  const s = await build(env);
  const text = JSON.stringify(s);
  if (text.length < 900_000) await google(env).put("adminSnapshot/latest", { json: text, built: s.built });
  return s;
}

async function latest(env: Env): Promise<Snapshot> {
  const d = await google(env).get("adminSnapshot/latest").catch(() => null);
  if (d?.json) {
    const s = JSON.parse(d.json) as Snapshot;
    if (Date.now() - Date.parse(s.built) < 7 * 3600_000) return s;      // the cron runs every 6 hours
  }
  return refresh(env);
}

async function cached<T>(key: string, ttl: number, f: () => Promise<T>): Promise<T> {
  const c = (globalThis as any).caches?.default as Cache | undefined;
  const req = new Request(`https://master.internal/${key}`);
  const hit = c ? await c.match(req) : undefined;
  if (hit) return hit.json() as Promise<T>;
  const v = await f();
  if (c) await c.put(req, new Response(JSON.stringify(v), { headers: { "Cache-Control": `max-age=${ttl}` } }));
  return v;
}

/** Clarity's export allows 10 calls a day, so the last answer is kept in Firestore (adminCache/clarity) for 6 hours. */
async function clarity(env: Env) {
  if (!env.CLARITY_TOKEN) return { errors: ["Clarity isn't connected yet (add the CLARITY_TOKEN secret and redeploy)"] };
  const g = google(env);
  const doc = await g.get("adminCache/clarity").catch(() => null);
  if (doc?.json && Date.now() - Date.parse(doc.built) < CLARITY_TTL_MS) return JSON.parse(doc.json);
  const errors: string[] = [];
  const [overall, byUrl] = await Promise.all([
    clarityFetch(env).catch((e) => { errors.push(String(e.message)); return null; }),
    clarityFetch(env, "&dimension1=URL").catch((e) => { errors.push(String(e.message)); return null; })]);
  if (!overall && doc?.json) return { ...JSON.parse(doc.json), errors: [...errors, "Showing the last saved copy"] };
  const out = { built: new Date().toISOString(), project: "zeyhpmwp0b", ...clarityShape(overall, byUrl), errors };
  if (overall) await g.put("adminCache/clarity", { json: JSON.stringify(out), built: out.built }).catch(() => {});
  return out;
}

async function api(req: Request, env: Env, path: string, url: URL): Promise<Response> {
  if (path === "/api/session") {
    if (req.method === "POST") {
      if (req.headers.get("Origin") !== url.origin) return fail(403, "Bad origin");
      const body: any = await req.json().catch(() => ({}));
      try {
        const s = await signIn(env, String(body.idToken || ""));
        await google(env).put(`adminLog/${Date.now()}-signin`, { at: new Date().toISOString(), email: s.email, what: "signin",
          ip: req.headers.get("CF-Connecting-IP") || "", country: req.headers.get("CF-IPCountry") || "" }).catch(() => {});
        return json({ email: s.email, exp: s.exp }, 200, { "Set-Cookie": setCookie(await seal(env, s)) });
      } catch (e) { return fail(403, (e as Error).message); }
    }
    if (req.method === "DELETE") return json({ ok: true }, 200, { "Set-Cookie": setCookie("", 0) });
  }
  const s = await current(env, req);
  if (!s) return fail(401, "Sign in");
  if (path === "/api/session") return json({ email: s.email, exp: s.exp });
  if (req.method === "POST" && path === "/api/refresh") {
    if (req.headers.get("Origin") !== url.origin) return fail(403, "Bad origin");
    return json(await refresh(env));
  }
  if (req.method !== "GET") return fail(405, "Read-only");
  switch (path) {
    case "/api/snapshot": return json(await latest(env));
    case "/api/user": {
      const uid = url.searchParams.get("uid") || "";
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return fail(422, "Bad uid");
      const g = google(env), now = new Date();
      const [a, prof, keys, requests, usage] = await Promise.all([
        g.user(uid).catch(() => null), g.get(`users/${uid}`), g.list(`users/${uid}/keys`), g.list(`users/${uid}/requests`), g.usage(uid, daysAgo(89, now))]);
      if (!a && !prof && !keys.length && !usage.length) return fail(404, "No such account");
      return json(profile(uid, a, prof, keys, requests, usage, now));
    }
    case "/api/traffic": return json(await cached("traffic", 600, () => traffic(env)));
    case "/api/health": return json(await cached("health", 300, () => health(env)));
    case "/api/product": return json(await cached("product", 900, () => analytics(env, google(env))));
    case "/api/search": return json(await cached("search", 3 * 3600, () => search(env, google(env))));
    case "/api/ux": return json(await clarity(env));
    case "/api/accuracy": return json(await cached("accuracy", 1800, () => accuracy(env)));
  }
  return fail(404, "Not found");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path.startsWith("/api/") || path === "/api") {
      try { return await api(req, env, path, url); }
      catch (e) { console.error(e); return fail(500, String((e as Error).message || e).slice(0, 300)); }
    }
    if (req.method !== "GET" && req.method !== "HEAD") return fail(405, "Method not allowed");
    const r = await env.ASSETS.fetch(req);
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(SECURITY)) h.set(k, v);
    if ((h.get("Content-Type") || "").includes("text/html")) h.set("Cache-Control", "no-store");
    return new Response(r.body, { status: r.status, headers: h });
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refresh(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
