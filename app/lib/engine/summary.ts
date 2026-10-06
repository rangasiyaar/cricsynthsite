// Scenario Lab summaries (a compact version of cricsim/engine/summary.py).
import type { MatchSim, Pack } from "./sim.ts";

export type Dist = { mean: number; q10: number; q50: number; q90: number };
export type LabSummary = {
  n: number;
  win: [number, number];
  tie: number;
  teams: {
    name: string;
    score: Dist;
    hist: { from: number; p: number }[];
    phases: { phase: string; runs: number; wickets: number }[];
    pWicketByOver: number[];
    firstWicketOver: number | null;
    players: { id: string; name: string; runs: number; p30: number; p50: number; pTop: number;
               wkts: number | null; p2w: number | null }[];
  }[];
};

const quant = (a: number[], q: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const dist = (a: number[]): Dist => ({
  mean: a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1), q10: quant(a, 0.1), q50: quant(a, 0.5), q90: quant(a, 0.9),
});

export function phaseBounds(overs: number, pp: number): [string, number, number][] {
  const death = Math.max(pp, Math.round(overs * 0.8));
  return [["Powerplay", 0, pp], ["Middle", pp, death], ["Death", death, overs]];
}

export function summarizeLab(pack: Pack, sims: MatchSim[], filter?: (m: MatchSim) => boolean): LabSummary {
  const rows = filter ? sims.filter(filter) : sims;
  const n = rows.length;
  const win: [number, number] = [0, 0];
  let tie = 0;
  for (const m of rows) { win[m.winner] += 1; if (m.tie) tie += 1; }
  const { overs, pp } = pack.rules;
  const width = overs <= 20 ? 10 : 20;
  const teams = [0, 1].map((t) => {
    const inns = rows.map((m) => (m.battingFirst === t ? m.innings[0] : m.innings[1]));
    const opp = rows.map((m) => (m.battingFirst === t ? m.innings[1] : m.innings[0]));
    const scores = inns.map((x) => x.runs);
    const lo = Math.floor(quant(scores, 0.005) / width) * width, hi = Math.ceil(quant(scores, 0.995) / width) * width;
    const hist = [];
    for (let b = lo; b < hi; b += width) hist.push({ from: b, p: scores.filter((s) => s >= b && s < b + width).length / Math.max(n, 1) });
    const phases = phaseBounds(overs, pp).map(([phase, a, b]) => {
      let runs = 0, wk = 0;
      for (const x of inns) for (let o = a; o < b; o++) { runs += x.overRuns[o]; wk += x.overWkts[o]; }
      return { phase, runs: runs / Math.max(n, 1), wickets: wk / Math.max(n, 1) };
    });
    const pWicketByOver = Array.from({ length: overs }, (_, o) => inns.filter((x) => x.overWkts[o] > 0).length / Math.max(n, 1));
    const fw = inns.filter((x) => x.fowBall[0] > 0).map((x) => Math.floor((x.fowBall[0] - 1) / pack.rules.bpo) + 1);
    const b = pack.batting.find((x) => x.team === t)!;
    const ob = pack.batting.find((x) => x.team === 1 - t)!;
    const players = pack.teams[t].players.map((pid) => {
      const s = b.order.indexOf(pid), j = ob.bowlers.indexOf(pid);
      const runs = inns.map((x) => (s >= 0 ? x.batRuns[s] : 0));
      const top = inns.map((x) => {
        const best = Math.max(...x.batRuns);
        if (best <= 0 || s < 0 || x.batRuns[s] !== best) return 0;
        return 1 / x.batRuns.filter((v) => v === best).length;
      });
      const wk = j >= 0 ? opp.map((x) => x.bowlWkts[j]) : null;
      const bowled = j >= 0 ? opp.filter((x) => x.bowlBalls[j] > 0).length / Math.max(n, 1) : 0;
      return {
        id: pid, name: pack.players[pid]?.name ?? pid,
        runs: dist(runs).mean, p30: runs.filter((v) => v >= 30).length / Math.max(n, 1),
        p50: runs.filter((v) => v >= 50).length / Math.max(n, 1), pTop: top.reduce((x, y) => x + y, 0) / Math.max(n, 1),
        wkts: wk && bowled > 0.5 ? dist(wk).mean : null,
        p2w: wk && bowled > 0.5 ? wk.filter((v) => v >= 2).length / Math.max(n, 1) : null,
      };
    });
    return { name: pack.teams[t].name, score: dist(scores), hist, phases, pWicketByOver,
             firstWicketOver: fw.length ? quant(fw, 0.5) : null, players };
  });
  return { n, win: [win[0] / Math.max(n, 1), win[1] / Math.max(n, 1)], tie: tie / Math.max(n, 1), teams };
}
