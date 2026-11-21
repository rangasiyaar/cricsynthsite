// CricSynthesis hosted API on Cloudflare Workers (free plan). Reads the files GitHub Actions publishes (R2, or the
// website's /data), does light arithmetic, never simulates. See infra/EDGE_PLAN.md.
import { Analytics, BadRequest, NotFound } from "./analytics.ts";
import { catalog, HttpError, match, Query } from "./api.ts";
import { type Account, accountPlan, endpointSlug, type Env, hit, keyFrom, lookup, MCP_DAILY, PLANS, sha256, toolSlug, Usage } from "./keys.ts";
import { handle, toolCategory } from "./mcp.ts";
import * as B from "./billing.ts";
import * as E from "./emails.ts";
import { mail } from "./notify.ts";
import * as C from "./contact.ts";
import { Firestore } from "./google.ts";
import * as OA from "./oauth.ts";
import { AssetSource, EdgeSource } from "./source.ts";

export { Usage };

const MAX_BODY = 256 * 1024;

const DEFAULT_CORS = "https://cricsynthesis.in,https://cricsynthesis.web.app,http://localhost:3000";
const ABOUT = {
  name: "CricSynthesis API", version: "1",
  about: "Analytics and projections from ball-by-ball simulation. We don't sell live scores or raw data.",
  auth: "Send your key as X-API-Key (or Authorization: Bearer).",
  plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { daily_requests: v.daily_requests, watermark: v.watermark }])),
  data_credits: "https://cricsynthesis.in/credits/",
};

let analytics: Analytics | null = null;
const getAnalytics = (env: Env) => (analytics ??= new Analytics(new EdgeSource(env.DATA, env.DATA_URL || "https://cricsynthesis.in/data"),
                                                                  env.ASSETS ? new AssetSource(env.ASSETS) : null));

function headers(req: Request, env: Env, extra: Record<string, string> = {}): Headers {
  const h = new Headers({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
                          "Strict-Transport-Security": "max-age=31536000; includeSubDomains", ...extra });
  const origin = req.headers.get("Origin");
  const allowed = (env.CORS || DEFAULT_CORS).split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "X-API-Key, Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

const json = (req: Request, env: Env, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(req, env, { "Content-Type": "application/json" }) });
const fail = (req: Request, env: Env, status: number, detail: string) => json(req, env, { detail }, status);

// discovery, registration and token endpoints are called by MCP clients (some run in a browser): open CORS, no cookies
function open(extra: Record<string, string> = {}): Headers {
  return new Headers({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                       "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version",
                       "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
}
const openJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: open({ "Content-Type": "application/json" }) });
const oauthFail = (e: unknown) => {
  if (e instanceof OA.OAuthError) return openJson({ error: e.code, error_description: e.message }, e.status);
  console.error(e);
  return openJson({ error: "server_error", error_description: "Something went wrong" }, 500);
};

/** OAuth for the MCP server (oauth.ts); null when the path isn't one of its endpoints. */
async function oauth(req: Request, env: Env, url: URL, path: string): Promise<Response | null> {
  const origin = url.origin;
  try {
    if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
      return openJson(OA.resourceMetadata(origin, path.endsWith("/mcp") ? "/mcp" : "/"));
    }
    if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") {
      return openJson(OA.serverMetadata(origin));
    }
    if (path === "/register" && req.method === "POST") {
      let body: unknown;
      try { body = JSON.parse(await req.text()); } catch { throw new OA.OAuthError("invalid_client_metadata", "Body must be JSON"); }
      return openJson(await OA.register(env, body as Record<string, unknown>), 201);
    }
    if (path === "/authorize" && req.method === "GET") {
      return new Response(null, { status: 302, headers: open({ Location: await OA.authorize(env, origin, url.searchParams) }) });
    }
    if (path === "/token" && req.method === "POST") {
      const text = await req.text();
      const form = (req.headers.get("Content-Type") || "").includes("json")
        ? new URLSearchParams(Object.entries(JSON.parse(text || "{}")).map(([k, v]) => [k, String(v)] as [string, string])) : new URLSearchParams(text);
      return openJson(await OA.token(env, origin, form));
    }
    if (path === "/oauth/complete" && req.method === "POST") {      // from cricsynthesis.in/connect (site CORS)
      let body: Record<string, unknown>;
      try { body = JSON.parse(await req.text()); } catch { return fail(req, env, 422, "Body must be JSON"); }
      return json(req, env, { redirect: await OA.complete(env, body) });
    }
  } catch (e) {
    if (path === "/oauth/complete" && e instanceof OA.OAuthError) return fail(req, env, e.status, e.message);
    return oauthFail(e);
  }
  return null;
}

/** The first request over the account's daily limit (the counter passes it once a day) emails the owner, if their
 *  "Usage alerts" switch is on. */
async function limitMail(env: Env, acct: Account, n: number) {
  if (!acct.owner || n !== acct.limits.daily_requests + 1) return;
  const plan = (["free", "pro", "business"].includes(acct.plan) ? acct.plan : "free") as "free" | "pro" | "business";
  await mail(env, acct.owner, (name) => E.limitReached({ name, limit: acct.limits.daily_requests, plan }), null, "notifyUsage");
}

/** The account page tells us right after it creates an API key: the owner gets a security email, once per key, and
 *  only for a key that really exists, isn't revoked and was created in the last 15 minutes. */
async function keyCreated(req: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_SA) return fail(req, env, 503, "Not available");
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await OA.firebaseUser(env, token).catch(() => null) : null;
  if (!user) return fail(req, env, 401, "Sign in first");
  let slot = "";
  try { slot = String(((await req.json()) as any)?.slot || ""); } catch { /* checked below */ }
  if (!/^k[1-5]$/.test(slot)) return fail(req, env, 422, "Bad key");
  const fs = new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT);
  const path = `users/${user.uid}/keys/${slot}`;
  const k = await fs.getDoc(path);
  const created = Date.parse(String(k?.created ?? ""));
  if (!k || k.revoked === true || k.mailed === true || !(Date.now() - created < 15 * 60_000)) return json(req, env, { sent: false });
  await fs.setFields(path, { mailed: true });
  const sent = await mail(env, user.uid, (name) => E.keyCreated({ name, keyName: String(k.name || "Untitled key"),
    prefix: String(k.prefix || ""), at: new Date(created) }), { email: user.email });
  return json(req, env, { sent });
}

/** The account page's "Delete account": all of the account's Firestore data (profile, API keys, usage, requests,
 *  billing records, preferences), the confirmation email, then the sign-in when the service account may delete it
 *  (otherwise the page deletes it). Needs a sign-in from the last 15 minutes, and no live Pro subscription. */
export async function deleteAccount(req: Request, env: Env, fs?: Firestore): Promise<Response> {
  if (!env.GOOGLE_SA) return fail(req, env, 503, "Not available");
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await OA.firebaseUser(env, token).catch(() => null) : null;
  if (!user) return fail(req, env, 401, "Sign in first");
  if (Date.now() / 1000 - user.authTime > 15 * 60) return fail(req, env, 401, "For your safety, sign out and sign in again, then delete your account");
  fs ||= new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT);
  const pro = await fs.getDoc(`users/${user.uid}/billing/pro`);
  if (pro?.subscriptionId && ["trial", "active", "past_due"].includes(String(pro.status)) && pro.cancelAtEnd !== true) {
    return fail(req, env, 409, "Cancel your CricSynthesis Pro subscription first (under Subscription), then delete your account");
  }
  const who = await fs.authUser(user.uid).catch(() => null);
  const documents = await fs.deleteAccountData(user.uid);
  const emailed = await mail(env, user.uid, (name) => E.accountDeleted({ name }), { email: who?.email || user.email, name: who?.name ?? null });
  const signIn = await fs.deleteAuthUser(user.uid).catch(() => false);
  return json(req, env, { deleted: true, documents, emailed, signIn });
}

/** The website's contact form (contact.ts): stored for the admin console, acknowledged by email. */
async function contact(req: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_SA) return fail(req, env, 503, "The form isn't available right now. Email hello@cricsynthesis.in.");
  const fs = new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await OA.firebaseUser(env, token).catch(() => null) : null;
  try {
    const body = await req.json().catch(() => null);
    const r = await C.submit({
      add: (f) => fs.addDoc("contactMessages", f),
      count: (field, value) => fs.countWhere("contactMessages", field, value),
      mail: (to, build) => mail(env, user?.uid || "", build, to),
      sha256, now: () => new Date(),
    }, body, { ip: req.headers.get("CF-Connecting-IP"), country: (req as any).cf?.country ?? null, uid: user?.uid ?? null,
               page: req.headers.get("Referer") });
    return json(req, env, { sent: r.sent });
  } catch (e) {
    if (e instanceof C.ContactError) return fail(req, env, e.status, e.message);
    console.error("contact", (e as Error).message);
    return fail(req, env, 500, "Couldn't send your message. Try again, or email hello@cricsynthesis.in.");
  }
}

/** CricSynthesis Pro billing (billing.ts): the website's checkout with a Firebase ID token, and Razorpay's webhook. */
async function billing(req: Request, env: Env, path: string): Promise<Response> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.GOOGLE_SA) return fail(req, env, 503, "Payments aren't available yet");
  const fs = new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT);
  const deps: B.Deps = {
    keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    store: { get: (p) => fs.getDoc(p), set: (p, f) => fs.setFields(p, f) },
    rzp: B.razorpay(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET), now: () => Date.now(),
    notify: (uid, n) => mail(env, uid, (name) => n.kind === "started" ? E.proStarted({ name, ...n })
      : n.kind === "cancelled" ? E.proCancelled({ name, ...n }) : E.paymentFailed({ name, ...n })),
  };
  try {
    if (path === "/billing/webhook" && req.method === "POST") {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return fail(req, env, 413, "Request body too large");
      return json(req, env, await B.webhook(deps, raw, req.headers.get("X-Razorpay-Signature")));
    }
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return fail(req, env, 401, "Sign in first");
    const user = await OA.firebaseUser(env, token).catch(() => null);
    if (!user) return fail(req, env, 401, "Sign in again");
    let body: unknown = {};
    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > 16_384) return fail(req, env, 413, "Request body too large");
      try { body = text ? JSON.parse(text) : {}; } catch { return fail(req, env, 422, "Body must be JSON"); }
    }
    if (path === "/billing/status" && req.method === "GET") return json(req, env, await B.status(deps, user.uid));
    if (path === "/billing/checkout" && req.method === "POST") {
      if (!(await fs.isAdult(user.uid))) return fail(req, env, 403, "Please confirm you're 18 or over first");
      return json(req, env, await B.checkout(deps, user, body));
    }
    if (path === "/billing/verify" && req.method === "POST") return json(req, env, await B.verify(deps, user.uid, body));
    if (path === "/billing/cancel" && req.method === "POST") return json(req, env, await B.cancel(deps, user.uid));
    return fail(req, env, 404, "Not found");
  } catch (e) {
    if (e instanceof B.BillingError) return fail(req, env, e.status, e.message);
    console.error(e);
    return fail(req, env, 500, "Something went wrong");
  }
}

/** Remote MCP (Streamable HTTP, JSON responses, no sessions). Needs a signed-in account (OAuth, oauth.ts) or an API
 * key (X-API-Key, Bearer cs_live_…, or ?key= in the URL). Only tools/call is counted. */
async function mcp(req: Request, env: Env, url: URL, path: string): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ detail: "This MCP endpoint takes JSON-RPC over POST (Streamable HTTP)." }),
                        { status: 405, headers: headers(req, env, { Allow: "POST", "Content-Type": "application/json" }) });
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(req, env, 413, "Request body too large");
  let body: any;
  try { body = JSON.parse(text); } catch {
    return json(req, env, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const bearer = keyFrom(req);
  const key = (bearer && bearer.startsWith("cs_live_") ? bearer : null) || url.searchParams.get("key");
  let acct: Account | null = null;
  if (key) {
    acct = await lookup(env, key);
  } else if (bearer) {
    const uid = await OA.accessUser(env, url.origin, bearer).catch(() => null);
    if (uid) {                                  // signed in without a key: the account's plan (Free: MCP_DAILY a day)
      const plan = await accountPlan(env, uid);
      acct = { hash: "uid:" + uid, plan, owner: uid, slot: "mcp", limits: plan === "free" ? { ...PLANS.free, daily_requests: MCP_DAILY } : PLANS[plan] };
    }
  }
  if (!acct) {
    const h = headers(req, env, { "Content-Type": "application/json", "WWW-Authenticate": OA.challenge(url.origin, path) });
    h.set("Access-Control-Expose-Headers", "WWW-Authenticate");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body?.id ?? null,
      error: { code: -32001, message: "Sign in to CricSynthesis to use this connector (or use an API key)." } }), { status: 401, headers: h });
  }
  const allow = async (tool: string): Promise<string | null> => {
    const n = await hit(env, acct!, toolCategory(tool), toolSlug(tool));
    await limitMail(env, acct!, n);
    return n > acct!.limits.daily_requests
      ? `Daily limit of ${acct!.limits.daily_requests} calls reached for your account today (shared by all your keys and the connector).` : null;
  };
  const a = getAnalytics(env);
  const msgs = Array.isArray(body) ? body.slice(0, 20) : [body];
  const out = (await Promise.all(msgs.map((m) => handle(a, m, allow)))).filter((x) => x !== null);
  if (!out.length) return new Response(null, { status: 202, headers: headers(req, env) });
  return json(req, env, Array.isArray(body) ? out : out[0]);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const isMcpHost = url.hostname.startsWith("mcp.");
    if (req.method === "OPTIONS") {
      const site = req.headers.get("Origin") && (env.CORS || DEFAULT_CORS).split(",").map((x) => x.trim()).includes(req.headers.get("Origin")!);
      return new Response(null, { status: 204, headers: site || path.startsWith("/v1") ? headers(req, env) : open() });
    }
    if (path === "/health") return json(req, env, { ok: true });
    if (path.startsWith("/billing/")) return billing(req, env, path);
    if (path === "/account/key-created" && req.method === "POST") return keyCreated(req, env);
    if (path === "/account/delete" && req.method === "POST") return deleteAccount(req, env);
    if (path === "/contact" && req.method === "POST") return contact(req, env);
    const o = await oauth(req, env, url, path);
    if (o) return o;
    // the MCP server at /mcp, and also at the root of mcp.cricsynthesis.in
    if (path === "/mcp" || (path === "/" && isMcpHost && req.method === "POST")) return mcp(req, env, url, path);
    if (path === "/" || path === "/v1") return json(req, env, { ...ABOUT, ...catalog() });

    const m = match(req.method, path);
    if (!m) return fail(req, env, 404, "Not found");
    if ("notHosted" in m) {
      const n = m.notHosted;
      return fail(req, env, 501, n.local_only
        ? "Simulating with your own inputs isn't available on the hosted API. Use the CricSynthesis MCP server (uvx) or MatchSynth Lab on the website."
        : "This endpoint isn't on the hosted API yet.");
    }

    const key = keyFrom(req);
    const acct = key ? await lookup(env, key) : null;
    if (!acct) return fail(req, env, 401, "Missing or invalid API key");
    const n = await hit(env, acct, m.route.tag, endpointSlug(m.route.method, m.route.path));
    await limitMail(env, acct, n);
    if (n > acct.limits.daily_requests) {
      return fail(req, env, 429, `Daily limit of ${acct.limits.daily_requests} requests reached for your account today (shared by all your keys)`);
    }

    let body: unknown = null;
    if (req.method === "POST") {
      if (Number(req.headers.get("Content-Length") || 0) > MAX_BODY) return fail(req, env, 413, "Request body too large");
      const text = await req.text();
      if (text.length > MAX_BODY) return fail(req, env, 413, "Request body too large");
      try { body = text ? JSON.parse(text) : {}; } catch { return fail(req, env, 422, "Body must be JSON"); }
    }

    try {
      const out = await m.route.run({ params: m.params, q: new Query(url.searchParams), body, acct, a: getAnalytics(env) });
      if (m.route.svg) {
        if (out == null) return fail(req, env, 404, "Not found");
        return new Response(out as string, { headers: headers(req, env, {
          "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=600",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:" }) });
      }
      return json(req, env, out);
    } catch (e) {
      if (e instanceof HttpError) return fail(req, env, e.status, e.message);
      if (e instanceof NotFound) return fail(req, env, 404, e.message.replace(/^404 loading .*/, "Not found"));
      if (e instanceof BadRequest) return fail(req, env, 422, e.message);
      console.error(e);
      return fail(req, env, 500, "Something went wrong");
    }
  },
} satisfies ExportedHandler<Env>;
