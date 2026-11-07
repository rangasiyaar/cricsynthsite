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
const counts = new Map<string, number>();
const usage = {
  idFromName: (n: string) => n,
  get: (id: string) => ({ fetch: async () => { counts.set(id, (counts.get(id) || 0) + 1); return Response.json({ n: counts.get(id) }); } }),
};
const env: any = { DATA: bucket, USAGE: usage, CORS: "https://cricsynthesis.in",
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
  assert.equal(n, 40);
  assert.equal(cat.not_hosted.length, 16);
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
