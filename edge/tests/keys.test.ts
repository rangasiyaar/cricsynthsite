// The daily limit is per account: every key of an account and its MCP sign-in share one counter.
import assert from "node:assert/strict";
import { test } from "node:test";
import { counterId, higher, hit, Usage, type Account } from "../src/keys.ts";

function env() {
  const objs = new Map<string, Usage>();
  const storage = () => { const m = new Map<string, unknown>(); let alarm: number | null = null;
    return { get: async (k: string) => m.get(k), put: async (k: string, v: unknown) => { m.set(k, structuredClone(v)); }, delete: async (k: string) => m.delete(k),
             getAlarm: async () => alarm, setAlarm: async (t: number) => { alarm = t; } }; };
  const e: any = {
    USAGE: {
      idFromName: (n: string) => n,
      get: (id: string) => {
        if (!objs.has(id)) objs.set(id, new Usage({ storage: storage() } as any, e));
        const o = objs.get(id)!;
        return { fetch: (url: string, init: RequestInit) => o.fetch(new Request(url, init)) };
      },
    },
  };
  return { e, objs };
}
const key = (owner: string | null, slot: string, hash: string): Account =>
  ({ hash, plan: "free", owner, slot, limits: { daily_requests: 200, max_simulations: 2000, watermark: true } });

test("one counter per account: all keys, a re-created key and the MCP sign-in share it", async () => {
  const { e, objs } = env();
  const k1 = key("u1", "k1", "h1"), k2 = key("u1", "k2", "h2");
  for (let i = 0; i < 150; i++) await hit(e, k1, "Analytics");
  assert.equal(await hit(e, k2, "Analytics"), 151);                     // a second key adds to the same total
  const remade = key("u1", "k1", "h-new");                              // revoke + delete + create again: no fresh start
  assert.equal(await hit(e, remade, "Analytics"), 152);
  const mcp = key("u1", "mcp", "uid:u1");                               // signed in to the connector, no key
  assert.equal(await hit(e, mcp, "Analytics"), 153);
  assert.equal(await hit(e, key("u2", "k1", "h3"), "Analytics"), 1);    // another account counts on its own
  assert.equal(await hit(e, key(null, "", "static-hash"), "Analytics"), 1);   // keys without an owner: their own counter
  assert.deepEqual([...objs.keys()].sort(), ["acct:u1", "acct:u2", "static-hash"]);
});

test("the account's plan is the higher of the key's and the account's", () => {
  assert.equal(counterId({ hash: "h", owner: "u9" }), "acct:u9");
  assert.equal(counterId({ hash: "h", owner: null }), "h");
  assert.equal(higher("free", "pro"), "pro");
  assert.equal(higher("business", "pro"), "business");
  assert.equal(higher("pro", "free"), "pro");
});
