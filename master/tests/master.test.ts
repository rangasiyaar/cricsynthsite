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
  assert.deepEqual(s.limitHits.map((h) => `${h.uid}/${h.slot}`), ["u1/all"]);  // per account: u1 (free) over 200; u2 (API Plus) under 20,000
  assert.equal(s.endpoints[0].ep, "cards_match");
  const u2 = s.users.find((u) => u.uid === "u2")!;
  assert.equal(u2.company, "Acme");
  assert.equal(u2.apiPlan, "pro");
  assert.equal(u2.tier, "api-plus");                                  // API Plus key set by our team, no approved request
  assert.equal(u2.tag, "assigned");
  assert.equal(u2.paid, false);
  assert.equal(s.totals.plans.tiers["api-plus"], 1);
  assert.equal(u2.calls30, 1000);
  assert.equal(s.users.find((u) => u.uid === "u9")!.inAuth, false);
  assert.equal(s.keys.find((k) => k.prefix === "cs_live_ab")!.today, 210);
  assert.equal(s.totals.nearLimit, 1);
});

test("profile: services, keys, usage by endpoint, timeline", () => {
  const p = profile("u1", auth[0], null, keys.slice(0, 1), requests, usage.u1, now);
  assert.equal(p.services.api.plan, "free");
  assert.equal(p.services.api.paid, false);
  assert.equal(p.services.website.plan, "Free");                              // no subscription, no assigned plan
  assert.equal(p.services.website.source, "default");
  const paid = profile("u1", auth[0], null, [], [], [], now, { status: "active", billing: "monthly", proUntil: new Date(now.getTime() + 86400_000).toISOString() } as any);
  assert.equal(paid.services.website.plan, "Pro");
  assert.equal(paid.services.website.source, "subscription");
  assert.equal(paid.services.website.paid, true);
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

test("Search Console shaping (weighted position, week over week) and the route is gated", async () => {
  const { scShape } = await import("../src/external.ts");
  const days = Array.from({ length: 14 }, (_, i) => ({ keys: [`2026-11-${String(i + 1).padStart(2, "0")}`], clicks: i < 7 ? 1 : 2, impressions: 10, ctr: 0, position: i < 7 ? 20 : 10 }));
  const s = scShape({ rows: days }, { rows: [{ keys: ["cricket predictions"], clicks: 5, impressions: 50, ctr: 0.1, position: 8.2 }] }, null, null, null,
    { sitemap: [{ path: "https://cricsynthesis.in/sitemap.xml", errors: "0", warnings: "1", contents: [{ submitted: "1200" }] }] });
  assert.equal(s.last7.clicks, 14);
  assert.equal(s.prev7.clicks, 7);
  assert.equal(s.last7.position, 10);
  assert.equal(s.queries[0].key, "cricket predictions");
  assert.equal(s.sitemaps[0].submitted, 1200);
  assert.equal((await call("/api/search")).status, 401);
});

test("uptime: probe codes, line format, summary (uptime %, incidents, strip)", async () => {
  const { probe, check, summarize, TARGETS } = await import("../src/uptime.ts");
  const ok = (ct: string) => (async () => new Response("{}", { status: 200, headers: { "Content-Type": ct } })) as unknown as typeof fetch;
  assert.equal((await probe("https://x", "json", ok("application/json"))).code, 200);
  assert.equal((await probe("https://x", "json", ok("text/html"))).code, 299);                 // answered with the wrong thing
  assert.equal((await probe("https://x", "json", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).code, 0);
  const line = await check(new Date("2026-11-17T10:05:00Z"), ok("application/json; text/html"));
  assert.match(line, new RegExp(`^10:05(\\|200:\\d+){${TARGETS.length}}$`));
  const up = (t: string) => `${t}|200:100|200:50|200:80|200:90`, down = (t: string) => `${t}|0:10000|200:50|200:80|200:90`;
  const s = summarize([{ day: "2026-11-17", checks: [up("09:00"), down("09:05"), down("09:10"), up("09:15"), up("09:20")] }], new Date("2026-11-17T09:21:00Z"));
  const site = s.targets[0];
  assert.equal(site.uptime24, 0.6);
  assert.equal(site.incidents.length, 1);
  assert.equal(site.incidents[0].checks, 2);
  assert.equal(site.incidents[0].to, "2026-11-17T09:15:00Z");
  assert.deepEqual(site.strip, [1, 0, 0, 1, 1]);
  assert.equal(s.targets[1].uptime24, 1);
  assert.equal(site.now!.up, true);
  assert.equal((await call("/api/uptime")).status, 401);
  assert.equal((await call("/api/meters")).status, 401);
});

test("meters: Monitoring permission missing is explained, Worker requests summed per day", async () => {
  const { meters } = await import("../src/external.ts");
  const g = { dailySum: async () => { throw new Error("monitoring 403: denied"); } };
  const m = await meters({} as any, g, new Date("2026-11-17T10:00:00Z"));
  assert.match(m.errors[0], /Monitoring Viewer/);
  assert.equal(m.meters[0].today, null);
  const g2 = { dailySum: async () => [{ day: "2026-11-17", value: 40_000 }] };
  const m2 = await meters({} as any, g2, new Date("2026-11-17T10:00:00Z"));
  assert.equal(m2.meters[0].share, 0.8);
});

test("Bing Webmaster shaping and the route is gated", async () => {
  const { bingShape } = await import("../src/external.ts");
  const b = bingShape({ d: [{ Date: "/Date(1763337600000-0800)/", Clicks: 3, Impressions: 40 }, { Date: "/Date(1763251200000-0800)/", Clicks: 1, Impressions: 10 }] },
    { d: [{ Query: "cricket prediction", Clicks: 2, Impressions: 30, AvgImpressionPosition: 7.5 }] }, null);
  assert.equal(b.daily.length, 2);
  assert.ok(b.daily[0].day < b.daily[1].day);
  assert.equal(b.last7.clicks, 4);
  assert.equal(b.queries[0].ctr, 2 / 30);
  assert.equal((await call("/api/bing")).status, 401);
});

test("actions: validation, approve moves live keys, wrong state refused, everything logged", async () => {
  const { validate, apply, ActionError } = await import("../src/actions.ts");
  assert.throws(() => validate({ type: "key.revoke", uid: "u1", slot: "k9" }), ActionError);
  assert.throws(() => validate({ type: "request.approve", uid: "u1", plan: "gold" }), ActionError);
  assert.throws(() => validate({ type: "nope", uid: "u1" }), ActionError);
  assert.throws(() => validate({ type: "key.plan", uid: "../x", slot: "k1", plan: "pro" }), ActionError);
  const docs: Record<string, any> = {
    "users/u1/requests/api-pro": { status: "pending", _id: "api-pro" },
    "users/u1/keys/k1": { _id: "k1", plan: "free", revoked: false }, "users/u1/keys/k2": { _id: "k2", plan: "free", revoked: true },
  };
  const writes: [string, any][] = [];
  const g: any = {
    get: async (p: string) => docs[p] ?? null,
    list: async (p: string) => Object.entries(docs).filter(([k]) => k.startsWith(p + "/")).map(([, v]) => v),
    patch: async (p: string, d: any) => { writes.push([p, d]); docs[p] = { ...docs[p], ...d }; },
    put: async (p: string, d: any) => { writes.push([p, d]); },
    user: async () => ({ claims: { plan: "pro", other: 1 } }),
    updateUser: async (_: string, c: any) => { writes.push(["auth", c]); },
  };
  const r = await apply(g, "boss@example.com", validate({ type: "request.approve", uid: "u1", plan: "api-pro", note: "paid" }), new Date(1000));
  assert.match(r.done, /1 key moved to pro; CricSynthesis Pro turned on/);
  assert.equal(docs["users/u1/billing/pro"].status, "comp");                 // API Plus includes Pro (billing record, no Auth role)
  assert.equal(writes.find(([p]) => p === "users/u1/billing/admin")![1].tier, "api-plus");
  assert.equal(docs["users/u1/keys/k1"].plan, "pro");
  assert.equal(docs["users/u1/keys/k2"].plan, "free");                       // revoked key untouched
  assert.equal(docs["users/u1/requests/api-pro"].status, "approved");
  assert.ok(writes.some(([p, d]) => p === "adminLog/1000-request.approve" && d.email === "boss@example.com" && d.uid === "u1"));
  await assert.rejects(apply(g, "boss@example.com", validate({ type: "request.decline", uid: "u1", plan: "api-pro" })), /approved, not pending/);
  await apply(g, "boss@example.com", validate({ type: "user.website-plan", uid: "u1", plan: "beta" }));
  assert.deepEqual(writes.filter(([p]) => p === "auth").at(-1)![1], { claims: { other: 1 } });
  g.updateUser = async () => { throw new Error("identitytoolkit 403: denied"); };
  await assert.rejects(apply(g, "boss@example.com", validate({ type: "user.disable", uid: "u1" })), /Firebase Authentication Admin/);
  // the route needs a session and the same origin
  assert.equal((await call("/api/action", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await call("/api/log")).status, 401);
});


test("subscription tiers and tags: Paid, Trial, Assigned", async () => {
  const { subscription } = await import("../src/data.ts");
  const free = { plan: "Free", source: "default" };
  assert.deepEqual(subscription("free", free), { tier: "free", tierName: "CricSynthesis Free", tag: null, until: null });
  assert.equal(subscription("free", { plan: "Pro", source: "trial", status: "trial" }).tag, "trial");
  assert.deepEqual(subscription("free", { plan: "Pro", source: "subscription", status: "active" }), { tier: "pro", tierName: "CricSynthesis Pro", tag: "paid", until: null });
  assert.equal(subscription("free", { plan: "Pro", source: "subscription", status: "comp" }).tag, "assigned");   // Grant Pro workflow
  assert.equal(subscription("free", { plan: "Pro", source: "assigned" }).tag, "assigned");
  assert.equal(subscription("free", { plan: "Pro", source: "assigned" }, [], { tier: "pro", tag: "paid" } as any).tag, "paid");
  assert.equal(subscription("pro", free, [{ _id: "api-pro", status: "approved" } as any]).tag, "paid");
  assert.deepEqual(subscription("pro", free), { tier: "api-plus", tierName: "API Plus", tag: "assigned", until: null });
  assert.equal(subscription("business", free, [], { tier: "business", tag: "paid" } as any).tierName, "Business API");
  assert.equal(subscription("business", free, [], { tier: "pro", tag: "paid" } as any).tag, "assigned");          // stale record
});

test("set subscription: claim, keys, assigned Pro ended, recorded and logged", async () => {
  const { validate, apply, ActionError } = await import("../src/actions.ts");
  assert.throws(() => validate({ type: "user.tier", uid: "u1", tier: "gold", tag: "paid" }), ActionError);
  assert.throws(() => validate({ type: "user.tier", uid: "u1", tier: "pro", tag: "trial" }), ActionError);
  const docs: Record<string, any> = {
    "users/u1/keys/k1": { _id: "k1", plan: "free", revoked: false }, "users/u1/keys/k2": { _id: "k2", plan: "free", revoked: true },
    "users/u1/billing/pro": { status: "comp", proUntil: "2099-01-01T00:00:00Z" },
  };
  const writes: [string, any][] = [];
  let claims: any = { other: 1 };
  const g: any = {
    get: async (p: string) => docs[p] ?? null,
    list: async (p: string) => Object.entries(docs).filter(([k]) => k.startsWith(p + "/")).map(([, v]) => v),
    patch: async (p: string, d: any) => { writes.push([p, d]); docs[p] = { ...docs[p], ...d }; },
    put: async (p: string, d: any) => { writes.push([p, d]); docs[p] = d; },
    user: async () => ({ claims }),
    updateUser: async (_: string, c: any) => { claims = c.claims; },
  };
  let r = await apply(g, "boss@example.com", validate({ type: "user.tier", uid: "u1", tier: "business", tag: "paid" }), new Date(5000));
  assert.match(r.done, /Business API \(Paid\), no end date; 1 key on business; website Pro on/);
  assert.equal(docs["users/u1/billing/pro"].status, "comp");
  assert.ok(docs["users/u1/billing/pro"].proUntil.getTime() > Date.UTC(2099, 0, 1));
  assert.deepEqual(claims, { other: 1 });                                     // no Auth admin role needed
  assert.equal(docs["users/u1/keys/k1"].plan, "business");
  assert.equal(docs["users/u1/keys/k2"].plan, "free");                       // revoked key untouched
  assert.deepEqual(docs["users/u1/billing/admin"], { tier: "business", tag: "paid", at: new Date(5000).toISOString(), until: "" });
  assert.ok(writes.some(([p, d]) => p === "adminLog/5000-user.tier" && d.email === "boss@example.com"));
  claims = { other: 1, plan: "pro" };                                          // an older claim-based assignment
  r = await apply(g, "boss@example.com", validate({ type: "user.tier", uid: "u1", tier: "free", tag: "assigned" }), new Date(6000));
  assert.match(r.done, /CricSynthesis Free; 1 key on free; assigned Pro ended; old Pro claim removed/);
  assert.deepEqual(claims, { other: 1 });
  assert.equal(docs["users/u1/billing/pro"].status, "ended");
  // a Razorpay subscription is left alone and the admin is told
  docs["users/u1/billing/pro"] = { status: "active", subscriptionId: "sub_1", proUntil: "2099-01-01T00:00:00Z" };
  r = await apply(g, "boss@example.com", validate({ type: "user.tier", uid: "u1", tier: "free", tag: "assigned" }), new Date(7000));
  assert.match(r.done, /Razorpay subscription keeps Pro until 2099-01-01/);
  assert.equal(docs["users/u1/billing/pro"].status, "active");
});

test("subscription for N days: end date on Pro and the record, then back to Free when it passes", async () => {
  const { validate, apply, expire, ActionError } = await import("../src/actions.ts");
  const { subscription } = await import("../src/data.ts");
  assert.throws(() => validate({ type: "user.tier", uid: "u1", tier: "pro", tag: "assigned", days: 2.5 }), ActionError);
  assert.throws(() => validate({ type: "user.tier", uid: "u1", tier: "pro", tag: "assigned", days: 5000 }), ActionError);
  assert.equal((validate({ type: "user.tier", uid: "u1", tier: "free", tag: "assigned", days: 30 }) as any).days, 0);
  const docs: Record<string, any> = { "users/u1/keys/k1": { _id: "k1", plan: "free", revoked: false } };
  const g: any = {
    get: async (p: string) => docs[p] ?? null,
    list: async (p: string) => Object.entries(docs).filter(([k]) => k.startsWith(p + "/")).map(([, v]) => v),
    patch: async (p: string, d: any) => { docs[p] = { ...docs[p], ...d }; },
    put: async (p: string, d: any) => { docs[p] = d; },
    user: async () => ({ claims: {} }), updateUser: async () => {},
  };
  const t0 = Date.UTC(2026, 10, 19);
  const r = await apply(g, "boss@example.com", validate({ type: "user.tier", uid: "u1", tier: "api-plus", tag: "assigned", days: 30 }), new Date(t0));
  assert.match(r.done, /API Plus \(Assigned\) for 30 days \(until 2026-12-19\)/);
  assert.equal(docs["users/u1/billing/pro"].proUntil.getTime(), t0 + 30 * 86400_000);         // website Pro stops on time
  assert.equal(docs["users/u1/billing/admin"].until, new Date(t0 + 30 * 86400_000).toISOString());
  assert.equal(docs["users/u1/keys/k1"].plan, "pro");
  assert.equal(subscription("pro", { plan: "Pro", source: "subscription", status: "comp" }, [], docs["users/u1/billing/admin"]).until,
               new Date(t0 + 30 * 86400_000).toISOString());
  const billing = () => Object.entries(docs).filter(([k]) => k.includes("/billing/")).map(([k, v]) => ({ ...v, _id: k.split("/").pop(), _path: k }));
  assert.deepEqual(await expire(g, billing(), new Date(t0 + 29 * 86400_000)), []);           // not yet
  assert.deepEqual(await expire(g, billing(), new Date(t0 + 31 * 86400_000)), ["u1"]);
  assert.equal(docs["users/u1/keys/k1"].plan, "free");
  assert.equal(docs["users/u1/billing/admin"].tier, "free");
  assert.equal(docs["users/u1/billing/pro"].status, "ended");
  assert.deepEqual(await expire(g, billing(), new Date(t0 + 32 * 86400_000)), []);           // done once
  // no end date: runs to 2099 and is never expired
  await apply(g, "boss@example.com", validate({ type: "user.tier", uid: "u1", tier: "pro", tag: "assigned" }), new Date(t0));
  assert.equal(docs["users/u1/billing/admin"].until, "");
  assert.ok(docs["users/u1/billing/pro"].proUntil.getTime() > Date.UTC(2099, 0, 1));
});

test("contact messages: mark replied / closed / new, logged; bad ids refused", async () => {
  const { validate, apply, ActionError } = await import("../src/actions.ts");
  assert.throws(() => validate({ type: "contact.status", id: "../x", status: "replied" }), ActionError);
  assert.throws(() => validate({ type: "contact.status", id: "m1", status: "spam" }), ActionError);
  const docs: Record<string, any> = { "contactMessages/m1": { _id: "m1", email: "asha@example.com", status: "new" } };
  const writes: [string, any][] = [];
  const g: any = {
    get: async (p: string) => docs[p] ?? null,
    patch: async (p: string, d: any) => { writes.push([p, d]); docs[p] = { ...docs[p], ...d }; },
    put: async (p: string, d: any) => { writes.push([p, d]); },
  };
  const r = await apply(g, "boss@example.com", validate({ type: "contact.status", id: "m1", status: "replied" }), new Date(2000));
  assert.match(r.done, /asha@example.com marked replied/);
  assert.equal(docs["contactMessages/m1"].status, "replied");
  assert.equal(docs["contactMessages/m1"].statusBy, "boss@example.com");
  assert.ok(writes.some(([p, d]) => p.startsWith("adminLog/") && d.what === "contact.status"));
  await assert.rejects(apply(g, "boss@example.com", validate({ type: "contact.status", id: "m9", status: "closed" })), /No such message/);
});

test("contact messages: read / unread and delete (removed, logged without the text)", async () => {
  const { validate, apply, ActionError } = await import("../src/actions.ts");
  assert.throws(() => validate({ type: "contact.read", id: "m1", read: "yes" }), ActionError);
  assert.throws(() => validate({ type: "contact.zap", id: "m1" }), ActionError);
  const docs: Record<string, any> = { "contactMessages/m1": { _id: "m1", email: "asha@example.com", message: "secret text", status: "new" } };
  const writes: [string, any][] = [], removed: string[] = [];
  const g: any = {
    get: async (p: string) => docs[p] ?? null,
    patch: async (p: string, d: any) => { docs[p] = { ...docs[p], ...d }; },
    put: async (p: string, d: any) => { writes.push([p, d]); },
    remove: async (p: string) => { removed.push(p); delete docs[p]; },
  };
  await apply(g, "boss@example.com", validate({ type: "contact.read", id: "m1", read: true }));
  assert.equal(docs["contactMessages/m1"].read, true);
  await apply(g, "boss@example.com", validate({ type: "contact.read", id: "m1", read: false }));
  assert.equal(docs["contactMessages/m1"].read, false);
  const r = await apply(g, "boss@example.com", validate({ type: "contact.delete", id: "m1" }));
  assert.deepEqual(removed, ["contactMessages/m1"]);
  assert.match(r.done, /deleted/);
  const log = writes.find(([p]) => p.endsWith("-contact.delete"))!;
  assert.ok(log && !JSON.stringify(log).includes("secret text"));
  await assert.rejects(apply(g, "boss@example.com", validate({ type: "contact.delete", id: "m1" })), /No such message/);
});

test("job applications: shortlist / decline email the applicant once, delete removes the resume", async () => {
  const { validate, apply, ActionError } = await import("../src/actions.ts");
  assert.throws(() => validate({ type: "application.status", id: "a1", status: "maybe" }), ActionError);
  assert.throws(() => validate({ type: "application.status", id: "../x", status: "declined" }), ActionError);
  const docs: Record<string, any> = { "applications/a1": { _id: "a1", name: "Ravi K", email: "ravi@example.com", jobTitle: "Graphics Designer",
    status: "new", resume: { name: "cv.pdf", chunks: 2 } } };
  const removed: string[] = [], mails: [string, string, string | undefined][] = [];
  const g: any = {
    get: async (p: string) => docs[p] ?? null,
    patch: async (p: string, d: any) => { docs[p] = { ...docs[p], ...d }; },
    put: async () => {},
    remove: async (p: string) => { removed.push(p); delete docs[p]; },
  };
  const mail = async (_uid: string, build: any, to: any, opts: any) => { const m = build(to.name); mails.push([to.email, m.text, opts?.from]); return true; };
  let r = await apply(g, "boss@example.com", validate({ type: "application.status", id: "a1", status: "shortlisted", note: "Portfolio task next week" }), new Date(), mail);
  assert.match(r.done, /shortlisted; applicant emailed/);
  assert.equal(mails.length, 1);
  assert.match(mails[0][1], /Hi Ravi[\s\S]*Portfolio task next week/);
  assert.match(String(mails[0][2]), /careers@/);
  r = await apply(g, "boss@example.com", validate({ type: "application.status", id: "a1", status: "shortlisted" }), new Date(), mail);
  assert.match(r.done, /already emailed/);
  await apply(g, "boss@example.com", validate({ type: "application.status", id: "a1", status: "reviewing" }), new Date(), mail);
  assert.equal(mails.length, 1);
  await apply(g, "boss@example.com", validate({ type: "application.delete", id: "a1" }), new Date(), mail);
  assert.deepEqual(removed, ["applications/a1/resume/0", "applications/a1/resume/1", "applications/a1"]);
});

test("plan-ending reminder follows the account's Plan reminders switch", async () => {
  const { notices } = await import("../src/actions.ts");
  const now = new Date("2026-11-22T00:00:00Z"), until = "2026-11-24T00:00:00Z";
  const docs: Record<string, any> = { "users/on": {}, "users/off": { notifyBilling: false } };
  const g: any = { get: async (p: string) => docs[p] ?? null, patch: async (p: string, d: any) => { docs[p] = { ...docs[p], ...d }; } };
  const mails: string[] = [];
  const mail = async (uid: string) => { mails.push(uid); return true; };
  const row = (uid: string) => ({ _id: "admin", _path: `users/${uid}/billing/admin`, tier: "pro", until });
  const sent = await notices(g, [row("on"), row("off")], mail as any, now);
  assert.deepEqual(mails, ["on"]);
  assert.deepEqual(sent, ["on: ending", "off: ending (reminders off)"]);
  assert.equal(docs["users/off/billing/admin"].endingMailed, until);           // not asked again
});
