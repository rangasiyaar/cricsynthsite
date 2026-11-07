// The remote MCP endpoint end to end in node, over the MCP fixture kit and match.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../src/index.ts";
import { sha256 } from "../src/keys.ts";
import { sign } from "../src/oauth.ts";

const DATA = new URL("../../cricmcp/tests/fixtures/", import.meta.url);
const KEY = "cs_live_" + "d".repeat(32);
const bucket = { async get(p: string) { try { const t = await readFile(new URL(p, DATA), "utf8"); return { json: async () => JSON.parse(t) }; } catch { return null; } } };
const EDGE = new URL("./fixtures/", import.meta.url);
const assets = { fetch: async (r: Request) => {
  try { return new Response(await readFile(new URL(new URL(r.url).pathname.slice(1), EDGE), "utf8")); }
  catch { return new Response("not found", { status: 404 }); } } };
const counts = new Map<string, number>();
const usage = { idFromName: (n: string) => n, get: (id: string) => ({ fetch: async () => {
  counts.set(id, (counts.get(id) || 0) + 1); return Response.json({ n: counts.get(id) }); } }) };
const env: any = { DATA: bucket, ASSETS: assets, USAGE: usage, STATIC_KEYS: JSON.stringify({ [await sha256(KEY)]: "free" }),
                   OAUTH_SECRET: "test-secret", FIRESTORE_PROJECT: "cricsynthesis" };
const ORIGIN = "https://api.test";
const tokenFor = async (uid: string) => sign(env, { typ: "at", uid, cid: "c", aud: ORIGIN, exp: Math.floor(Date.now() / 1000) + 600 });
const USER = await tokenFor("user-1");

let id = 0;
async function rpc(method: string, params: any = {}, o: { key?: string; token?: string | null } = {}) {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const auth = o.key ?? (o.token === null ? null : o.token ?? USER);
  if (auth) h["Authorization"] = `Bearer ${auth}`;
  const r = await worker.fetch(new Request("https://api.test/mcp", { method: "POST", headers: h,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) }), env);
  return { status: r.status, body: r.status === 202 ? null : await r.json() as any };
}
const call = async (name: string, args: any = {}, o = {}) => (await rpc("tools/call", { name, arguments: args }, o)).body.result;

test("handshake and tool list", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.equal(init.body.result.protocolVersion, "2025-06-18");
  assert.ok(init.body.result.capabilities.tools);
  const note = await worker.fetch(new Request("https://api.test/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${USER}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }), env);
  assert.equal(note.status, 202);
  const tools = (await rpc("tools/list")).body.result.tools;
  assert.equal(tools.length, 41);
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

test("keys, sign-in and the account allowance", async () => {
  const anon = await rpc("tools/list", {}, { token: null });
  assert.equal(anon.status, 401);
  assert.equal((await rpc("tools/list", {}, { key: "cs_live_" + "x".repeat(32) })).status, 401);
  assert.equal((await rpc("tools/list", {}, { token: "forged.token" })).status, 401);
  assert.equal((await call("venues", {}, { key: KEY })).isError, undefined);
  const other = await tokenFor("user-2");
  let last: any;
  for (let i = 0; i < 201; i++) last = await call("venues", {}, { token: other });
  assert.equal(last.isError, true);
  assert.match(last.content[0].text, /200 tool calls/);
  assert.equal((await call("venues", {}, { token: await tokenFor("user-3") })).isError, undefined);
});

test("prepared tools", async () => {
  const lw = await call("live_win_probability", { batting_team: "Premier 1", runs: 100, wickets: 3, overs: 15.0, target: 150 });
  assert.equal(lw.isError, undefined, lw.content?.[0]?.text);
  assert.match(Object.values<string>(lw.structuredContent.win)[0], /%$/);
  assert.equal((await call("par_score")).structuredContent.teams.length, 2);
  assert.ok((await call("chase_curve", { chasing_team: "Premier 0" })).structuredContent.curve.length > 3);
  assert.equal((await call("player_impact", { player: "P0-1" })).isError, undefined);
  assert.equal((await call("batting_order", { team: "Premier 1" })).isError, undefined);
  assert.equal((await call("bowling_plan", { bowling_team: "Premier 0" })).isError, undefined);
  assert.equal((await call("fantasy_projections")).structuredContent.players.length, 22);
  assert.equal((await call("fantasy_team", { captain_rule: "upside" })).structuredContent.xi.length, 11);
  assert.equal((await call("fantasy_portfolio", { teams_count: 4 })).structuredContent.teams.length, 4);
  const ip = await call("innings_projection", { batting_team: "Premier 0", runs: 40, wickets: 1, overs: 5.0, thresholds: [150, 180] });
  assert.deepEqual(Object.keys(ip.structuredContent.chance_at_least), ["150", "180"]);
  assert.equal((await call("live_win_probability", { batting_team: "Nobody", runs: 1, wickets: 0, overs: 1.0 })).isError, true);
  assert.doesNotMatch(JSON.stringify(await call("fantasy_projections")), /simulations/);
});

test("OAuth: discovery, registration, sign-in on the site, PKCE, refresh", async () => {
  const get = (path: string, init: RequestInit = {}) => worker.fetch(new Request(ORIGIN + path, init), env);
  // a 401 tells the client where the sign-in is
  const r401 = await worker.fetch(new Request(ORIGIN + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env);
  assert.match(r401.headers.get("WWW-Authenticate")!, /resource_metadata="https:\/\/api\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
  const prm: any = await (await get("/.well-known/oauth-protected-resource/mcp")).json();
  assert.deepEqual(prm.authorization_servers, [ORIGIN]);
  const asm: any = await (await get("/.well-known/oauth-authorization-server")).json();
  assert.equal(asm.token_endpoint, ORIGIN + "/token");
  assert.deepEqual(asm.code_challenge_methods_supported, ["S256"]);
  // register
  const redirect = "https://claude.ai/api/mcp/auth_callback";
  assert.equal((await get("/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) })).status, 400);
  const reg: any = await (await get("/register", { method: "POST", body: JSON.stringify({ redirect_uris: [redirect], client_name: "Claude" }) })).json();
  // authorize → the site's connect page
  const verifier = "v".repeat(50);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge,
                                  code_challenge_method: "S256", state: "xyz", scope: "mcp" });
  const az = await get("/authorize?" + q);
  assert.equal(az.status, 302);
  const connect = new URL(az.headers.get("Location")!);
  assert.equal(connect.origin + connect.pathname, "https://cricsynthesis.in/connect/");
  const req = connect.searchParams.get("req")!;
  const bad = new URLSearchParams(q); bad.set("redirect_uri", "https://evil.example/cb");
  assert.equal((await get("/authorize?" + bad)).status, 400);
  // the connect page: a Firebase ID token (signed here by a stand-in for Google's keys)
  const kp = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: any, init?: any) => String(u).includes("securetoken@system") ? Response.json({ keys: [jwk] }) : realFetch(u, init)) as typeof fetch;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const t = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = b64({ aud: "cricsynthesis", iss: "https://securetoken.google.com/cricsynthesis", sub: "uid-42", iat: t, exp: t + 3600, email: "a@b.c" });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(`${head}.${body}`))).toString("base64url");
  const idToken = `${head}.${body}.${sig}`;
  const done: any = await (await get("/oauth/complete", { method: "POST", body: JSON.stringify({ req, id_token: idToken, allow: true }) })).json();
  const back = new URL(done.redirect);
  assert.equal(back.origin + back.pathname, redirect);
  assert.equal(back.searchParams.get("state"), "xyz");
  const code = back.searchParams.get("code")!;
  const denied: any = await (await get("/oauth/complete", { method: "POST", body: JSON.stringify({ req, allow: false }) })).json();
  assert.equal(new URL(denied.redirect).searchParams.get("error"), "access_denied");
  const forged = `${head}.${b64({ aud: "cricsynthesis", iss: "https://securetoken.google.com/cricsynthesis", sub: "someone-else", iat: t, exp: t + 3600 })}.${sig}`;
  assert.equal((await get("/oauth/complete", { method: "POST", body: JSON.stringify({ req, id_token: forged, allow: true }) })).status, 400);
  globalThis.fetch = realFetch;
  // token exchange: a wrong verifier fails, the right one gets tokens
  const form = (o: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
  const wrong = await get("/token", form({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: "w".repeat(50) }));
  assert.equal(wrong.status, 400);
  const tok: any = await (await get("/token", form({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }))).json();
  assert.equal(tok.token_type, "Bearer");
  const listed = await rpc("tools/list", {}, { token: tok.access_token });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.result.tools.length, 41);
  const again: any = await (await get("/token", form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: reg.client_id }))).json();
  assert.ok(again.access_token && again.access_token !== tok.refresh_token);
  // a token for another server isn't accepted here
  const elsewhere = await sign(env, { typ: "at", uid: "u", cid: "c", aud: "https://other.example", exp: t + 600 });
  assert.equal((await rpc("tools/list", {}, { token: elsewhere })).status, 401);
});
