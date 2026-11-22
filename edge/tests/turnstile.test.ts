// The public forms' bot check: off without the secret; with it, only a token Cloudflare confirms gets through.
import assert from "node:assert/strict";
import { test } from "node:test";
import { human, tokenOf } from "../src/turnstile.ts";

test("bot check: off without a secret, then needs a confirmed token", async () => {
  const seen: string[] = [];
  const cf = (ok: boolean) => (async (_u: any, init: any) => { seen.push(String((init.body as FormData).get("response"))); return new Response(JSON.stringify({ success: ok })); }) as typeof fetch;
  assert.equal(await human(undefined, "", null), true);
  assert.equal(await human("s", "", null, cf(true)), false);                 // no token: no call, refused
  assert.equal(seen.length, 0);
  assert.equal(await human("s", "tok", "1.2.3.4", cf(true)), true);
  assert.equal(await human("s", "tok", null, cf(false)), false);
  assert.equal(await human("s", "tok", null, (async () => { throw new Error("down"); }) as typeof fetch), false);
  assert.equal(tokenOf({ "cf-turnstile-response": "a" }), "a");
});
