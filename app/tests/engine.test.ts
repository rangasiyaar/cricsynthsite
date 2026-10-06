// node --test: the browser engine produces sane, deterministic results on a tiny hand-made pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { simulateMatches, type Pack } from "../lib/engine/sim.ts";
import { summarizeLab } from "../lib/engine/summary.ts";

const dir = "public/data/matches/";
const packPath = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".pack.json")) : undefined;

test("simulations are deterministic and summaries add up", { skip: !packPath }, () => {
  const pack = JSON.parse(readFileSync(`${dir}${packPath}`, "utf8")) as Pack;
  const a = summarizeLab(pack, simulateMatches(pack, 600, {}, 5));
  const b = summarizeLab(pack, simulateMatches(pack, 600, {}, 5));
  assert.deepEqual(a.win, b.win);
  assert.ok(Math.abs(a.win[0] + a.win[1] - 1) < 1e-9);
  for (const t of a.teams) {
    assert.ok(t.score.q50 > 40 && t.score.q50 < 450);
    assert.equal(t.pWicketByOver.length, pack.rules.overs);
  }
  const flat = summarizeLab(pack, simulateMatches(pack, 600, { boundaryMult: 1.3 }, 5));
  assert.ok(flat.teams[0].score.mean > a.teams[0].score.mean);
});
