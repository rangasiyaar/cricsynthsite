// The Worker end to end in node: keys, limits, routes, errors and cards, over the MCP fixture kit.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../src/index.ts";
import { sha256 } from "../src/keys.ts";

const DATA = new URL("../../cricmcp/tests/fixtures/", import.meta.url);
const KEY = "cs_live_" + "a".repeat(32), PRO = "cs_live_" + "b".repeat(32);

const bucket = {
  async get(path: string) {
    try {
      const text = await readFile(new URL(path, DATA), "utf8");
      return { json: async () => JSON.parse(text) };
    } catch { return null; }
  },
};
const EDGE = new URL("./fixtures/", import.meta.url);
const assets = { fetch: async (r: Request) => {
  try { return new Response(await readFile(new URL(new URL(r.url).pathname.slice(1), EDGE), "utf8")); }
  catch { return new Response("not found", { status: 404 }); } } };
const counts = new Map<string, number>();
const usage = {
  idFromName: (n: string) => n,
  get: (id: string) => ({ fetch: async () => { counts.set(id, (counts.get(id) || 0) + 1); return Response.json({ n: counts.get(id) }); } }),
};
const env: any = { DATA: bucket, ASSETS: assets, USAGE: usage, CORS: "https://cricsynthesis.in",
                   STATIC_KEYS: JSON.stringify({ [await sha256(KEY)]: "free", [await sha256(PRO)]: "pro" }) };

const call = (path: string, init: RequestInit & { key?: string | null } = {}) => {
  const h = new Headers(init.headers);
  if (init.key !== null) h.set("X-API-Key", init.key || KEY);
  return worker.fetch(new Request(`https://api.test${path}`, { ...init, headers: h }), env);
};

test("catalog, health and keys", async () => {
  assert.equal((await call("/health", { key: null })).status, 200);
  const cat: any = await (await call("/v1", { key: null })).json();
  const n = Object.values<any[]>(cat.endpoints).reduce((s, x) => s + x.length, 0);
  assert.equal(n, 53);
  assert.equal(cat.not_hosted.length, 3);
  assert.equal((await call("/v1/players?q=P0", { key: null })).status, 401);
  assert.equal((await call("/v1/players?q=P0", { key: "cs_live_" + "z".repeat(32) })).status, 401);
  assert.equal((await call("/v1/players?q=P0", { key: "nonsense" })).status, 401);
  assert.equal((await call("/v1/simulate", { method: "POST", body: "{}" })).status, 501);
});

test("analytics answers", async () => {
  const s: any = await (await call("/v1/players?q=P0-1")).json();
  assert.equal(s.players[0].id, "P0-1");
  const ph: any = await (await call("/v1/players/P0-1/phases?format=T20")).json();
  assert.deepEqual(Object.keys(ph.batting), ["powerplay", "middle", "death"]);
  assert.equal((await call("/v1/players/Nobody")).status, 404);
  assert.equal((await call("/v1/players/P0-1?format=Test")).status, 422);
  const cmp: any = await (await call("/v1/players/compare?ids=P0-1,P1-1")).json();
  assert.equal(cmp.players.length, 2);
  const rk: any = await (await call("/v1/rankings/bowling?sort=economy&limit=5")).json();
  const eco = rk.players.map((x: any) => x.economy);
  assert.deepEqual(eco, [...eco].sort((a, b) => a - b));
  const grid: any = await (await call("/v1/matchups/grid?batters=P0-1,P0-2&bowlers=P1-9,P1-10")).json();
  assert.equal(grid.cells.length, 4);
  assert.equal((await call("/v1/venues/premier-oval")).status, 200);
  assert.equal((await call("/v1/venues/nowhere")).status, 404);
  assert.equal((await call("/v1/teams/premier-1")).status, 200);
  const xi = Array.from({ length: 11 }, (_, i) => `P0-${i}`);
  const tp = await call("/v1/teams/profile", { method: "POST", body: JSON.stringify({ players: xi }) });
  assert.equal(tp.status, 200);
  assert.equal((await call("/v1/teams/profile", { method: "POST", body: JSON.stringify({ players: xi.slice(0, 5) }) })).status, 422);
});

test("matches and cards", async () => {
  const idx: any = await (await call("/v1/matches")).json();
  assert.ok(idx.matches.length >= 1);
  assert.equal((await call("/v1/matches/m1")).status, 200);
  assert.equal((await call("/v1/matches/nope")).status, 404);
  const svg = await call("/v1/graphics/matches/m1/win.svg?theme=light");
  assert.equal(svg.headers.get("Content-Type"), "image/svg+xml");
  const free = await svg.text();
  assert.match(free, /free plan/);
  const pro = await (await call("/v1/graphics/matches/m1/win.svg?theme=light", { key: PRO })).text();
  assert.doesNotMatch(pro, /free plan/);
  assert.doesNotMatch(pro, /· [\d,]+ simulations/);            // no simulation counts on cards
  assert.equal((await call("/v1/graphics/matches/m1/wickets/2.svg")).status, 404);
  assert.equal((await call("/v1/graphics/players/P0-1/profile.svg")).status, 200);
});

test("daily limit and CORS", async () => {
  const k = "cs_live_" + "c".repeat(32);
  env.STATIC_KEYS = JSON.stringify({ ...JSON.parse(env.STATIC_KEYS), [await sha256(k)]: "free" });
  let last = 0;
  for (let i = 0; i < 201; i++) last = (await call("/v1/venues", { key: k })).status;
  assert.equal(last, 429);
  const r = await call("/v1/venues", { headers: { Origin: "https://cricsynthesis.in" } });
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://cricsynthesis.in");
  const x = await call("/v1/venues", { headers: { Origin: "https://evil.example" } });
  assert.equal(x.headers.get("Access-Control-Allow-Origin"), null);
});

test("prepared answers for covered matches", async () => {
  const post = (path: string, body: any) => call(path, { method: "POST", body: JSON.stringify(body) });
  const par: any = await (await post("/v1/par-score", { match_id: "m1" })).json();
  assert.equal(par.teams.length, 2);
  assert.doesNotMatch(JSON.stringify(par), /simulations/);
  assert.equal((await post("/v1/par-score", {})).status, 422);                      // needs a covered match
  assert.equal((await post("/v1/par-score", { match_id: "nope" })).status, 404);
  const cc: any = await (await post("/v1/chase-curve", { match_id: "m1", chasing: 1, target_from: 120, target_to: 180, step: 20 })).json();
  assert.deepEqual(cc.curve.map((r: any) => r.target), [120, 140, 160, 180]);
  assert.ok((await (await post("/v1/toss", { match_id: "m1" })).json() as any).teams);
  assert.equal((await post("/v1/players/P0-1/impact", { match_id: "m1" })).status, 200);
  assert.equal((await post("/v1/players/Nobody/impact", { match_id: "m1" })).status, 404);
  const bo: any = await (await post("/v1/lineups/batting-order", { match_id: "m1", team: 0 })).json();
  assert.ok(bo.best && bo.candidates.length > 3);
  assert.equal((await post("/v1/lineups/bowling-plan", { match_id: "m1", bowling_team: 1 })).status, 200);
  assert.equal((await post("/v1/lineups/bowling-plan", { match_id: "m1", bowlers: ["P1-9", "P1-10"] })).status, 501);
  assert.equal((await post("/v1/fantasy/team", { match_id: "m1", captain_rule: "upside" })).status, 200);
  const pf: any = await (await post("/v1/fantasy/portfolio", { match_id: "m1", teams_count: 3 })).json();
  assert.equal(pf.teams.length, 3);
  const wp: any = await (await post("/v1/win-probability", { match_id: "m1", state: { innings: 1, batting: 0, runs: 80, wickets: 2, overs: 10.0 } })).json();
  const s = Object.values<number>(wp.win).reduce((a, b) => a + b, 0);
  assert.ok(s > 0.9 && s <= 1.0001 && wp.final_total.q["50"] > 80);
  const worse: any = await (await post("/v1/win-probability", { match_id: "m1", state: { innings: 1, batting: 0, runs: 80, wickets: 7, overs: 10.0 } })).json();
  assert.ok(worse.final_total.q["50"] < wp.final_total.q["50"]);              // more wickets down, lower total
  const ch: any = await (await call("/v1/matches/m1/win-probability?innings=2&batting=1&runs=100&wickets=3&overs=15.0&target=150")).json();
  assert.equal(ch.required.runs, 50);
  assert.equal((await post("/v1/win-probability", { match_id: "m1", state: { innings: 1, overs: 10.7 } })).status, 404);  // 7 balls
  const ip: any = await (await post("/v1/innings/projection", { match_id: "m1", state: { runs: 50, wickets: 1, overs: 6.0 }, thresholds: [120, 160, 200] })).json();
  const pa = Object.values<number>(ip.p_at_least);
  assert.ok(pa[0] >= pa[1] && pa[1] >= pa[2]);
  assert.equal((await post("/v1/simulate", {})).status, 501);
});
