// Web Worker: runs Scenario Lab simulations off the main thread.
// raw: true returns compact per-match results (for the live engine view) instead of a summary.
import { simulateMatches, type Pack, type Scenario } from "./sim.ts";
import { summarizeLab } from "./summary.ts";

type Req = { id: number; pack: Pack; scenario: Scenario; n: number; seed: number; raw?: boolean };

export type RawBatch = {
  n: number; wins: [number, number]; balls: number;
  scores: [number[], number[]];          // each team's total in every simulated match
  samples: { first: number; totals: [number, number]; wkts: [number, number]; winner: number; top: [string, number] }[];
};

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, pack, scenario, n, seed, raw } = e.data;
  try {
    const t0 = performance.now();
    const sims = simulateMatches(pack, n, scenario, seed);
    if (!raw) {
      (self as unknown as Worker).postMessage({ id, summary: summarizeLab(pack, sims), ms: performance.now() - t0 });
      return;
    }
    const out: RawBatch = { n: sims.length, wins: [0, 0], balls: 0, scores: [[], []], samples: [] };
    sims.forEach((m, k) => {
      out.wins[m.winner] += 1;
      const tot: [number, number] = [0, 0], wk: [number, number] = [0, 0];
      m.innings.forEach((inn, i) => {
        const team = i === 0 ? m.battingFirst : 1 - m.battingFirst;
        tot[team] = inn.runs; wk[team] = inn.wkts; out.balls += inn.legal;
        out.scores[team].push(inn.runs);
      });
      if (k < 6) {
        let best = -1, who = "";
        m.innings.forEach((inn, i) => {
          const order = pack.batting.find((b) => b.team === (i === 0 ? m.battingFirst : 1 - m.battingFirst))!.order;
          inn.batRuns.forEach((r, s) => { if (r > best) { best = r; who = order[s]; } });
        });
        out.samples.push({ first: m.battingFirst, totals: tot, wkts: wk, winner: m.winner,
                           top: [pack.players[who]?.name ?? who, best] });
      }
    });
    (self as unknown as Worker).postMessage({ id, raw: out, ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
