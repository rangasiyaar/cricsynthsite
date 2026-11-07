// The remote MCP endpoint end to end in node, over the MCP fixture kit and match.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../src/index.ts";
import { sha256 } from "../src/keys.ts";

const DATA = new URL("../../cricmcp/tests/fixtures/", import.meta.url);
const KEY = "cs_live_" + "d".repeat(32);
const bucket = { async get(p: string) { try { const t = await readFile(new URL(p, DATA), "utf8"); return { json: async () => JSON.parse(t) }; } catch { return null; } } };
const counts = new Map<string, number>();
const usage = { idFromName: (n: string) => n, get: (id: string) => ({ fetch: async () => {
  counts.set(id, (counts.get(id) || 0) + 1); return Response.json({ n: counts.get(id) }); } }) };
const env: any = { DATA: bucket, USAGE: usage, STATIC_KEYS: JSON.stringify({ [await sha256(KEY)]: "free" }) };

let id = 0;
async function rpc(method: string, params: any = {}, o: { key?: string; ip?: string } = {}) {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
                                      "CF-Connecting-IP": o.ip || "1.2.3.4" };
  if (o.key) h["Authorization"] = `Bearer ${o.key}`;
  const r = await worker.fetch(new Request("https://api.test/mcp", { method: "POST", headers: h,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) }), env);
  return { status: r.status, body: r.status === 202 ? null : await r.json() as any };
}
const call = async (name: string, args: any = {}, o = {}) => (await rpc("tools/call", { name, arguments: args }, o)).body.result;

test("handshake and tool list", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.equal(init.body.result.protocolVersion, "2025-06-18");
  assert.ok(init.body.result.capabilities.tools);
  const note = await worker.fetch(new Request("https://api.test/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }), env);
  assert.equal(note.status, 202);
  const tools = (await rpc("tools/list")).body.result.tools;
  assert.equal(tools.length, 31);
  for (const t of tools) assert.equal(t.inputSchema.type, "object");
  assert.equal((await worker.fetch(new Request("https://api.test/mcp"), env)).status, 405);
  assert.equal((await rpc("no/such")).body.error.code, -32601);
});

test("tools answer", async () => {
  const lm = await call("list_matches");
  assert.ok(lm.structuredContent.matches.length >= 1);
  const fc = await call("match_forecast", { match: "Premier" });
  assert.ok(fc.structuredContent.win && !("simulations" in fc.structuredContent));
  assert.doesNotMatch(JSON.stringify(await call("about_the_model")), /simulations"|balls_trained/);
  assert.equal((await call("toss_decision")).structuredContent.teams.length, 2);
  const ph = await call("player_phases", { player: "P0-1" });
  assert.deepEqual(Object.keys(ph.structuredContent.batting), ["powerplay", "middle", "death"]);
  const card = await call("match_graphic", { card: "worm" });
  assert.match(card.structuredContent.svg, /^<svg/);
  const bad = await call("player_rating", { player: "Nobody At All" });
  assert.equal(bad.isError, true);
  assert.equal((await call("rankings", { limit: 1000 })).isError, true);
  assert.equal((await call("player_rating", {})).isError, true);
});

test("keys and the anonymous allowance", async () => {
  assert.equal((await rpc("tools/list", {}, { key: "cs_live_" + "x".repeat(32) })).status, 401);
  assert.equal((await call("venues", {}, { key: KEY })).isError, undefined);
  let last: any;
  for (let i = 0; i < 101; i++) last = await call("venues", {}, { ip: "9.9.9.9" });
  assert.equal(last.isError, true);
  assert.match(last.content[0].text, /100 tool calls a day/);
  assert.equal((await call("venues", {}, { ip: "8.8.8.8" })).isError, undefined);
});
