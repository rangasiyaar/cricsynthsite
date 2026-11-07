// CricSynthesis hosted API on Cloudflare Workers (free plan). Reads the files GitHub Actions publishes (R2, or the
// website's /data), does light arithmetic, never simulates. See infra/EDGE_PLAN.md.
import { Analytics, BadRequest, NotFound } from "./analytics.ts";
import { catalog, HttpError, match, Query } from "./api.ts";
import { type Env, hit, keyFrom, lookup, PLANS, Usage } from "./keys.ts";
import { EdgeSource } from "./source.ts";

export { Usage };

const MAX_BODY = 256 * 1024;
const DEFAULT_CORS = "https://cricsynthesis.in,https://cricsynthesis.web.app,http://localhost:3000";
const ABOUT = {
  name: "CricSynthesis API", version: "1",
  about: "Analytics and projections from ball-by-ball simulation. We don't sell live scores or raw data.",
  auth: "Send your key as X-API-Key (or Authorization: Bearer).",
  plans: PLANS, data_credits: "https://cricsynthesis.in/credits/",
};

let analytics: Analytics | null = null;
const getAnalytics = (env: Env) => (analytics ??= new Analytics(new EdgeSource(env.DATA, env.DATA_URL || "https://cricsynthesis.in/data")));

function headers(req: Request, env: Env, extra: Record<string, string> = {}): Headers {
  const h = new Headers({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
                          "Strict-Transport-Security": "max-age=31536000; includeSubDomains", ...extra });
  const origin = req.headers.get("Origin");
  const allowed = (env.CORS || DEFAULT_CORS).split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "X-API-Key, Authorization, Content-Type");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

const json = (req: Request, env: Env, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(req, env, { "Content-Type": "application/json" }) });
const fail = (req: Request, env: Env, status: number, detail: string) => json(req, env, { detail }, status);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req, env) });
    if (path === "/health") return json(req, env, { ok: true });
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
    const n = await hit(env, acct, m.route.tag);
    if (n > acct.limits.daily_requests) {
      return fail(req, env, 429, `Daily limit of ${acct.limits.daily_requests} requests reached for the ${acct.plan} plan`);
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
