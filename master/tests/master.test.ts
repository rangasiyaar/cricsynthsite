// The console Worker in node: the session gate, the snapshot / profile maths on fixtures, accuracy grouping.
import assert from "node:assert/strict";
import { test } from "node:test";
import { profile, snapshot } from "../src/data.ts";
import { accuracyFrom, formatOf } from "../src/external.ts";
import type { AuthUser, Doc } from "../src/gcp.ts";
import worker from "../src/index.ts";
import { COOKIE, seal, unseal } from "../src/session.ts";

const env: any = {
  ADMIN_EMAILS: "boss@example.com, second@example.com", SESSION_SECRET: "test-secret",
  ASSETS: { fetch: async () => new Response("<!doctype html><title>x</title>", { headers: { "Content-Type": "text/html" } }) },
};
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://master.test${path}`, init), env);
const exp = () => Math.floor(Date.now() / 1000) + 600;

test("every /api route needs the session cookie", async () => {
  for (const p of ["/api/snapshot", "/api/user?uid=u1", "/api/traffic", "/api/health", "/api/accuracy", "/api/session"]) {
    const r = await call(p);
    assert.equal(r.status, 401, p);
    assert.equal(r.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  }
  assert.equal((await call("/api/refresh", { method: "POST" })).status, 401);
});

test("sessions: signed, expiring, admins only, tamper-proof", async () => {
  const good = await seal(env, { email: "boss@example.com", uid: "u", exp: exp() });
  assert.ok(await unseal(env, good));
  assert.equal(await unseal(env, await seal(env, { email: "boss@example.com", uid: "u", exp: 1 })), null);          // expired
  assert.equal(await unseal(env, await seal(env, { email: "someone@example.com", uid: "u", exp: exp() })), null);   // not an admin
  assert.equal(await unseal({ ...env, SESSION_SECRET: "other" }, good), null);                                      // other key
  const [body, sig] = good.split(".");
  const forged = Buffer.from(JSON.stringify({ email: "boss@example.com", uid: "x", exp: exp() + 9999 })).toString("base64url");
  assert.equal(await unseal(env, `${forged}.${sig}`), null);
  assert.ok(body);
  // removing an admin ends their session straight away
  assert.equal(await unseal({ ...env, ADMIN_EMAILS: "second@example.com" }, good), null);
  const r = await call("/api/session", { headers: { Cookie: `${COOKIE}=${good}` } });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).email, "boss@example.com");
  // read-only: no other methods
  assert.equal((await call("/api/snapshot", { method: "DELETE", headers: { Cookie: `${COOKIE}=${good}` } })).status, 405);
  assert.equal((await call("/api/refresh", { method: "POST", headers: { Cookie: `${COOKIE}=${good}`, Origin: "https://evil.test" } })).status, 403);
});

test("signing in: wrong origin and bad tokens are refused; sign-out clears the cookie", async () => {
  assert.equal((await call("/api/session", { method: "POST", headers: { Origin: "https://evil.test" }, body: "{}" })).status, 403);
  const r = await call("/api/session", { method: "POST", headers: { Origin: "https://master.test" }, body: JSON.stringify({ idToken: "a.b.c" }) });
  assert.equal(r.status, 403);
  const out = await call("/api/session", { method: "DELETE" });
  assert.match(out.headers.get("Set-Cookie") || "", /Max-Age=0; HttpOnly; Secure; SameSite=Strict/);
});

test("pages carry the security headers and are never indexed", async () => {
  const r = await call("/");
  assert.equal(r.headers.get("X-Frame-Options"), "DENY");
  assert.match(r.headers.get("Content-Security-Policy") || "", /frame-ancestors 'none'/);
  assert.equal(r.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal((await call("/", { method: "POST" })).status, 405);
});

// ── data ──
const now = new Date("2026-11-17T12:00:00Z");
const doc = (path: string, f: Record<string, any> = {}): Doc => ({ ...f, _path: path, _id: path.split("/").pop()! }) as Doc;
const au = (uid: string, email: string, created: string, extra: Partial<AuthUser> = {}): AuthUser => ({
  uid, email, name: uid.toUpperCase(), photo: null, verified: true, providers: ["google.com"], created, lastLogin: created,
  lastActive: created, disabled: false, claims: {}, ...extra });
const auth = [au("u1", "a@x.com", "2026-11-17T08:00:00Z"), au("u2", "b@x.com", "2026-10-01T08:00:00Z", { lastActive: "2026-11-16T10:00:00Z" }),
              au("u3", "c@x.com", "2026-08-01T08:00:00Z", { claims: { plan: "pro" } })];
const keys = [doc("users/u1/keys/k1", { name: "App", prefix: "cs_live_ab", plan: "free", created: "2026-11-17T09:00:00Z", revoked: false }),
              doc("users/u2/keys/k1", { name: "Prod", prefix: "cs_live_cd", plan: "pro", created: "2026-10-02T09:00:00Z", revoked: false, lastUsed: "2026-11-17T11:00:00Z" }),
              doc("users/u2/keys/k2", { name: "Old", prefix: "cs_live_ef", plan: "free", created: "2026-10-02T09:00:00Z", revoked: true, revokedAt: "2026-10-05T09:00:00Z" })];
const requests = [doc("users/u1/requests/api-pro", { plan: "api-pro", volume: "1k-10k", note: "hi", status: "pending", created: "2026-11-17T10:00:00Z" })];
const usage = {
  u1: [doc("users/u1/usage/2026-11-17", { total: 250, keys: { k1: 210, mcp: 40 }, cats: { analytics: 250 }, eps: { players_rating: 200, mcp_par_score: 40, venues: 10 } })],
  u2: [doc("users/u2/usage/2026-11-10", { total: 1000, keys: { k1: 1000 }, cats: { graphics: 1000 }, eps: { cards_match: 1000 } }),
       doc("users/u2/usage/2026-09-01", { total: 77, keys: { k1: 77 } })],               // older than 30 days: ignored
};

test("snapshot totals, series, limit hits and plans", () => {
  const s = snapshot({ now, auth, profiles: [doc("users/u2", { company: "Acme" }), doc("users/u9")], keys, requests, usage });
  assert.equal(s.totals.users, 4);                                     // u9 has only a profile
  assert.deepEqual(s.totals.signups, { d1: 1, d7: 1, d30: 1 });
  assert.equal(s.totals.keys.active, 2);
  assert.equal(s.totals.keys.revoked, 1);
  assert.equal(s.totals.calls.d30, 1250);
  assert.equal(s.totals.calls.today, 250);
  assert.equal(s.totals.calls.mcp30, 40);
  assert.equal(s.totals.mcpUsers30, 1);
  assert.equal(s.totals.requestsOpen, 1);
  assert.deepEqual(s.totals.plans.api, { free: 3, pro: 1, business: 0 });
  assert.equal(s.totals.plans.website.pro_assigned, 1);
  assert.equal(s.series.length, 30);
  assert.equal(s.series.at(-1)!.calls, 250);
  assert.equal(s.series.at(-1)!.signups, 1);
  assert.deepEqual(s.limitHits.map((h) => `${h.uid}/${h.slot}`), ["u1/k1"]);    // free key over 200; pro key under 5,000
  assert.equal(s.endpoints[0].ep, "cards_match");
  const u2 = s.users.find((u) => u.uid === "u2")!;
  assert.equal(u2.company, "Acme");
  assert.equal(u2.apiPlan, "pro");
  assert.equal(u2.paid, true);
  assert.equal(u2.calls30, 1000);
  assert.equal(s.users.find((u) => u.uid === "u9")!.inAuth, false);
  assert.equal(s.keys.find((k) => k.prefix === "cs_live_ab")!.today, 210);
  assert.equal(s.totals.nearLimit, 1);
});

test("profile: services, keys, usage by endpoint, timeline", () => {
  const p = profile("u1", auth[0], null, keys.slice(0, 1), requests, usage.u1, now);
  assert.equal(p.services.api.plan, "free");
  assert.equal(p.services.api.paid, false);
  assert.equal(p.services.website.plan, "Pro");
  assert.equal(p.services.website.source, "beta");
  assert.equal(p.services.mcp.used, true);
  assert.equal(p.services.mcp.today, 40);
  assert.equal(p.keys[0].today, 210);
  assert.equal(p.usage.series.length, 90);
  assert.deepEqual(p.usage.endpoints.map((e) => e.ep), ["players_rating", "mcp_par_score", "venues"]);
  assert.equal(p.usage.limitDays.length, 1);
  assert.ok(p.timeline.some((t) => t.what.startsWith("Created API key")));
  assert.ok(p.timeline.some((t) => t.what.startsWith("Requested api-pro")));
  assert.equal(profile("u3", auth[2], null, [], [], [], now).services.website.source, "assigned");
});

test("accuracy by format and competition", () => {
  assert.equal(formatOf("estorm-v-dol-t20-benoni-2026-11-06"), "T20");
  assert.equal(formatOf("ind-v-aus-odi-perth-2026-10-01"), "OD");
  const a = accuracyFrom({ tabs: { forecast: { hits: 3, checks: 4 } }, matches: [
    { id: "a-v-b-t20-x-2026-11-01", date: "2026-11-01", competition: "C1", hits: 3, checks: 4, brier: 0.2, favourite_won: true, fantasy: { single: 0.7 } },
    { id: "a-v-b-od-x-2026-11-02", date: "2026-11-02", competition: "C1", hits: 1, checks: 4, brier: 0.3, favourite_won: false },
    { id: "a-v-b-od-x-2026-11-03", date: "2026-11-03", hits: 0, checks: 0 }] });
  assert.equal(a.overall.matches, 2);
  assert.equal(a.overall.accuracy, 0.5);
  assert.equal(a.overall.favourite, 0.5);
  assert.ok(Math.abs(a.overall.brier! - 0.25) < 1e-9);
  assert.deepEqual(a.formats.map((f) => f.key).sort(), ["OD", "T20"]);
  assert.equal(a.tabs[0].accuracy, 0.75);
});

test("Google client calls fetch unbound (Workers throw 'Illegal invocation' for a stored fetch)", async () => {
  const { Google } = await import("../src/gcp.ts");
  const real = globalThis.fetch;
  let self: unknown = "unset";
  (globalThis as any).fetch = function (this: unknown) { self = this; return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }))); };
  try {
    const { generateKeyPairSync } = await import("node:crypto");
    const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    const g = new Google(JSON.stringify({ client_email: "t@x", private_key: pem, project_id: "p" }));
    await g.get("users/u1").catch(() => null);
    assert.notEqual(self, g);                      // never called as a method of the client
  } finally { globalThis.fetch = real; }
});

test("GA4 report shaping and the product route is gated", async () => {
  const { gaShape } = await import("../src/external.ts");
  const r = (rows: [string[], number[]][]) => ({ rows: rows.map(([d, m]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((v) => ({ value: String(v) })) })) });
  const g = gaShape(r([[["20261116"], [5, 3, 6, 20, 4]], [["20261115"], [2, 2, 2, 5, 1]]]),
    r([[["page_view"], [100, 40]], [["match_view"], [30, 20]], [["sign_up"], [3, 3]]]), null, null, null, null,
    r([[["new"], [30]], [["returning"], [10]]]), r([[[], [4]]]));
  assert.deepEqual(g.daily.map((d) => d.day), ["2026-11-15", "2026-11-16"]);
  assert.deepEqual(g.funnel.map((f) => f.users), [40, 20, 3, 0]);
  assert.equal(g.realtime, 4);
  assert.equal(g.newVsReturning.find((x) => x.name === "returning")!.value, 10);
  assert.equal((await call("/api/product")).status, 401);
});

test("Clarity export shaping and the UX route is gated", async () => {
  const { clarityShape } = await import("../src/external.ts");
  const s = clarityShape(
    [{ metricName: "Traffic", information: [{ totalSessionCount: "120", totalBotSessionCount: "8", distinctUserCount: "90", pagesPerSessionPercentage: 1.8 }] },
     { metricName: "RageClickCount", information: [{ sessionsWithMetricPercentage: 2.5, subTotal: "3" }] }],
    [{ metricName: "RageClickCount", information: [{ Url: "https://cricsynthesis.in/lab/", subTotal: "3" }, { Url: "https://cricsynthesis.in/", subTotal: "0" }] },
     { metricName: "ScrollDepth", information: [{ Url: "https://cricsynthesis.in/", averageScrollDepth: 61.2 }] }]);
  assert.equal(s.sessions, 120);
  assert.equal(s.users, 90);
  assert.deepEqual(s.rage, [{ url: "https://cricsynthesis.in/lab/", value: 3 }]);
  assert.equal(s.scroll[0].value, 61.2);
  assert.equal(s.summary.RageClickCount.sessionsWithMetricPercentage, 2.5);
  assert.equal((await call("/api/ux")).status, 401);
});
