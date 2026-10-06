// node --experimental-strip-types tests/parity_cli.ts <pack.json> [scenario.json]
// Prints mean outcomes of the browser engine, for the Python parity test.
import { readFileSync } from "node:fs";
import { simulateMatches, type Pack, type Scenario } from "../lib/engine/sim.ts";
import { summarizeLab } from "../lib/engine/summary.ts";

const pack = JSON.parse(readFileSync(process.argv[2], "utf8")) as Pack;
const sc = (process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : {}) as Scenario;
const t0 = Date.now();
const sims = simulateMatches(pack, 20000, sc, 7);
const s = summarizeLab(pack, sims);
const first = sims.map((m) => m.innings[0]);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(JSON.stringify({
  ms: Date.now() - t0,
  first_runs: mean(first.map((x) => x.runs)), first_wkts: mean(first.map((x) => x.wkts)),
  first_legal: mean(first.map((x) => x.legal)), first_wides: mean(first.map((x) => x.extras[0])),
  win0: s.win[0], pp_runs0: s.teams[0].phases[0].runs,
}));
