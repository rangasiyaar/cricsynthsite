// Pro data keys (src/prokey.ts): a file locked by cricsim/lock.py unlocks here with the same secret; the key rule.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as PK from "../src/prokey.ts";

const fx = JSON.parse(readFileSync(new URL("./fixtures/locked-match.json", import.meta.url), "utf8"));

test("a match locked in Python unlocks in the Worker", async () => {
  const full = await PK.unlockMatch(fx.public, fx.secret);
  assert.deepEqual(full.summary, fx.summary);
  assert.deepEqual(full.fantasy, fx.fantasy);
  assert.equal(full.locked, undefined);
  assert.equal(full.teaser, undefined);
  await assert.rejects(PK.unlockMatch(fx.public, "wrong"));
  assert.equal(await PK.unlockMatch(fx.public, undefined), fx.public);       // no secret: as published
  const { key } = await PK.keyResponse(fx.secret, fx.public.match.id);
  assert.equal(atob(key).length, 32);
});

test("who gets the key: a pro claim, or Pro still running", () => {
  const now = Date.UTC(2026, 10, 27);
  assert.equal(PK.isPro("pro", null, now), true);
  assert.equal(PK.isPro(null, { proUntil: new Date(now + 3600_000).toISOString() }, now), true);
  assert.equal(PK.isPro(null, { proUntil: new Date(now - 1).toISOString() }, now), false);
  assert.equal(PK.isPro("free", null, now), false);
  assert.ok(PK.MATCH_ID.test("nz-v-ind-odi-wellington-2026-11-07") && !PK.MATCH_ID.test("../x"));
});
