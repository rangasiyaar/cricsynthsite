// Browser port of cricsim/fantasy.py (points tables, sim_points, decisive_mean, pick_xi, portfolio): fantasy picks
// rebuilt from the MatchSynth Lab simulations. Keep the tables in step with the Python ones.
import type { FantasyPicks, FantasyTeam } from "../types.ts";
import type { MatchSim, Pack } from "./sim.ts";

const FIELD_POINTS = [8, 12, 12];          // catch, stumping, run-out
const DECISIVE = 1.2;
const ROLES = ["WK", "BAT", "AR", "BOWL"];

const pick = <T>(conds: boolean[], vals: T[], dflt: T) => { const i = conds.indexOf(true); return i < 0 ? dflt : vals[i]; };

export function battingPoints(r: number, b: number, f4: number, f6: number, out: boolean, bowler: boolean, od: boolean) {
  let p = r + 4 * f4 + 6 * f6;
  p += od ? pick([r >= 150, r >= 125, r >= 100, r >= 75, r >= 50, r >= 25], [24, 20, 16, 12, 8, 4], 0)
          : pick([r >= 100, r >= 75, r >= 50, r >= 25], [16, 12, 8, 4], 0);
  if (!bowler) {
    if (r === 0 && out) p -= od ? 3 : 2;
    const sr = b > 0 ? (100 * r) / b : 0;
    if (od && b >= 20) p += pick([sr > 140, sr > 120, sr >= 100, sr < 30, sr < 40, sr <= 50], [6, 4, 2, -6, -4, -2], 0);
    if (!od && b >= 10) p += pick([sr > 170, sr > 150, sr >= 130, sr < 50, sr < 60, sr <= 70], [6, 4, 2, -6, -4, -2], 0);
  }
  return p;
}

export function bowlingPoints(balls: number, runs: number, wkts: number, bowledLbw: number, od: boolean) {
  const econ = balls > 0 ? (6 * runs) / balls : 0;
  if (od) {
    const p = 25 * wkts + 8 * bowledLbw + pick([wkts >= 6, wkts === 5, wkts === 4], [12, 8, 4], 0);
    return p + (balls >= 30 ? pick([econ < 2.5, econ < 3.5, econ <= 4.5, econ > 9, econ > 8, econ >= 7], [6, 4, 2, -6, -4, -2], 0) : 0);
  }
  const p = 30 * wkts + 8 * bowledLbw + pick([wkts >= 5, wkts === 4, wkts === 3], [12, 8, 4], 0);
  return p + (balls >= 12 ? pick([econ < 5, econ < 6, econ <= 7, econ > 12, econ > 11, econ >= 10], [6, 4, 2, -6, -4, -2], 0) : 0);
}

/** Points per simulation and player (row-major n × players), fielding split by each player's usual share. */
export function simPoints(pack: Pack, sims: MatchSim[], roles: Record<string, string>) {
  const pids = pack.teams.flatMap((t) => t.players);
  const col = new Map(pids.map((p, i) => [p, i]));
  const P = pids.length, od = pack.format === "OD";
  const d = pack.dismissals;
  const [CAUGHT, CB, STUMPED, RUNOUT, BOWLED, LBW] = ["caught", "caught and bowled", "stumped", "run out", "bowled", "lbw"].map((k) => d.indexOf(k));
  const fielding = pids.every((p) => pack.players[p]?.fielding);
  const pts = new Float64Array(sims.length * P).fill(4);
  sims.forEach((m, i) => {
    const row = i * P;
    m.innings.forEach((inn, j) => {
      const team = j === 0 ? m.battingFirst : 1 - m.battingFirst;
      const bat = pack.batting.find((b) => b.team === team)!;
      bat.order.forEach((p, s) => {
        if (inn.batBalls[s] === 0 && !inn.batOut[s] && inn.batRuns[s] === 0) return;
        pts[row + col.get(p)!] += battingPoints(inn.batRuns[s], inn.batBalls[s], inn.batFours[s], inn.batSixes[s],
                                                 inn.batOut[s] === 1, roles[p] === "BOWL", od);
      });
      const bl = new Array(11).fill(0), cb = new Array(11).fill(0);
      const events = [0, 0, 0];
      let stumpedBy: number[] = [];
      for (let s = 0; s < 11; s++) {
        if (!inn.batOut[s]) continue;
        const k = inn.batKind[s], by = inn.batBy[s];
        if (by >= 0 && (k === BOWLED || k === LBW)) bl[by]++;
        if (by >= 0 && k === CB) cb[by]++;
        if (k === CAUGHT) events[0]++; else if (k === STUMPED) { events[1]++; stumpedBy.push(by); } else if (k === RUNOUT) events[2]++;
      }
      bat.bowlers.forEach((p, k) => {
        if (!inn.bowlBalls[k] && !inn.bowlWkts[k]) return;
        pts[row + col.get(p)!] += bowlingPoints(inn.bowlBalls[k], inn.bowlRuns[k], inn.bowlWkts[k], bl[k], od);
      });
      if (fielding) {
        bat.bowlers.forEach((p, k) => { pts[row + col.get(p)!] += 8 * cb[k]; });
        for (let e = 0; e < 3; e++) {
          if (!events[e]) continue;
          const tot = bat.bowlers.reduce((a, p) => a + (pack.players[p].fielding![e] ?? 0), 0) || 1;
          bat.bowlers.forEach((p) => { pts[row + col.get(p)!] += FIELD_POINTS[e] * (pack.players[p].fielding![e] / tot) * events[e]; });
        }
      } else {
        const keeper = bat.bowlers.find((p) => roles[p] === "WK");
        if (keeper) pts[row + col.get(keeper)!] += 12 * stumpedBy.length;
      }
      stumpedBy = [];
    });
  });
  return { pids, pts, n: sims.length };
}

/** Mean points with the simulations reweighted so the favourite wins a little more often (log-odds × 1.2). */
export function decisiveMean(pts: Float64Array, n: number, P: number, winners: number[], stretch = DECISIVE) {
  const p0 = winners.filter((w) => w === 0).length / n;
  const w = winners.map((x) => {
    if (!(p0 > 0 && p0 < 1) || stretch === 1) return 1;
    const q0 = 1 / (1 + Math.exp(-stretch * Math.log(p0 / (1 - p0))));
    return x === 0 ? q0 / p0 : (1 - q0) / (1 - p0);
  });
  const tot = w.reduce((a, v) => a + v, 0);
  const out = new Array(P).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < P; j++) out[j] += pts[i * P + j] * w[i];
  return out.map((v) => v / tot);
}

type Team = [string[], string, string];

function* combos(pool: number[], k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= pool.length - (k - acc.length); i++) { acc.push(pool[i]); yield* combos(pool, k, i + 1, acc); acc.pop(); }
}

/** Best 11 by score, 1–10 per side (and 1–8 per role when roles are given); captain and vice-captain by captainScore. */
export function pickXI(score: Record<string, number>, teamOf: Record<string, number>, roles: Record<string, string> | null,
                       captainScore?: Record<string, number>): Team {
  const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
  let xi: string[];
  if (!roles) {
    xi = ranked.slice(0, 11);
    for (const t of [0, 1]) if (!xi.some((p) => teamOf[p] === t)) xi[10] = ranked.find((p) => teamOf[p] === t)!;
  } else {
    const pool = ranked.slice(0, 15);
    for (const r of ROLES) pool.push(...ranked.filter((p) => roles[p] === r && !pool.includes(p)).slice(0, 2));
    const sc = pool.map((p) => score[p]), tm = pool.map((p) => teamOf[p]), rl = pool.map((p) => ROLES.indexOf(roles[p] ?? ""));
    let best: number[] | null = null, bestTotal = -Infinity;
    for (const c of combos(pool.map((_, i) => i), 11)) {
      let t0 = 0, total = 0;
      const per = [0, 0, 0, 0];
      for (const i of c) { t0 += tm[i] === 0 ? 1 : 0; if (rl[i] >= 0) per[rl[i]]++; total += sc[i]; }
      if (t0 < 1 || t0 > 10 || Math.min(...per) < 1 || Math.max(...per) > 8) continue;
      if (total > bestTotal) { bestTotal = total; best = [...c]; }
    }
    xi = (best ?? pool.slice(0, 11).map((_, i) => i)).map((i) => pool[i]);
  }
  const cs = captainScore ?? score;
  const [c, vc] = [...xi].sort((a, b) => cs[b] - cs[a]);
  return [xi, c, vc];
}

function rolesOk(xi: string[], roles: Record<string, string> | null) {
  if (!roles) return true;
  const per = ROLES.map((r) => xi.filter((p) => roles[p] === r).length);
  return Math.min(...per) >= 1 && Math.max(...per) <= 8;
}

/** k teams that together cover the likely matches (greedy on the best team of the set, judged on held-out simulations). */
function portfolio(pids: string[], pts: Float64Array, n: number, teamOf: Record<string, number>, k: number,
                   roles: Record<string, string> | null, mean: Record<string, number>): Team[] {
  const P = pids.length, col = new Map(pids.map((p, i) => [p, i]));
  const half = Math.floor(n / 2), nev = n - half;
  const scores = ([xi, c, vc]: Team) => {
    const s = new Float64Array(nev), idx = xi.map((p) => col.get(p)!), ci = col.get(c)!, vi = col.get(vc)!;
    for (let i = 0; i < nev; i++) {
      const row = (half + i) * P;
      let t = pts[row + ci] + 0.5 * pts[row + vi];
      for (const j of idx) t += pts[row + j];
      s[i] = t;
    }
    return s;
  };
  const teams: Team[] = [pickXI(mean, teamOf, roles)];
  const seen = new Set<string>();
  const key = ([xi, c, vc]: Team) => `${[...xi].sort().join(",")}|${c}|${vc}`;
  const cands: Team[] = [];
  const step = Math.max(1, Math.floor(half / 300));
  for (let r = 0; r < half && cands.length < 300; r += step) {
    const sc: Record<string, number> = {};
    pids.forEach((p, j) => { sc[p] = pts[r * P + j]; });
    const t = pickXI(sc, teamOf, null);
    if (!seen.has(key(t)) && rolesOk(t[0], roles)) { seen.add(key(t)); cands.push(t); }
  }
  for (const [xi] of [teams[0], ...cands.slice()]) {
    const top = [...xi].sort((a, b) => mean[b] - mean[a]).slice(0, 5);
    for (const c of top) for (const vc of top) {
      if (c === vc) continue;
      const t: Team = [xi, c, vc];
      if (!seen.has(key(t))) { seen.add(key(t)); cands.push(t); }
    }
  }
  let best = scores(teams[0]);
  const candScores = cands.map(scores);
  while (teams.length < k && cands.length) {
    let bi = 0, bg = -Infinity;
    candScores.forEach((s, i) => {
      let g = 0;
      for (let j = 0; j < nev; j++) g += Math.max(best[j], s[j]);
      if (g > bg) { bg = g; bi = i; }
    });
    teams.push(cands.splice(bi, 1)[0]);
    const s = candScores.splice(bi, 1)[0];
    best = best.map((v, j) => Math.max(v, s[j]));
  }
  return teams;
}

/** The Fantasy tab for a set of simulations: one XI, and five teams that cover the likely matches. */
export function fantasyPicks(pack: Pack, sims: MatchSim[], k = 5): FantasyPicks | null {
  if (!sims.length) return null;
  const roles: Record<string, string> = {};
  pack.teams.flatMap((t) => t.players).forEach((p) => { roles[p] = pack.players[p]?.role ?? ""; });
  const haveRoles = Object.values(roles).some((r) => r === "WK");
  const teamOf: Record<string, number> = {};
  pack.teams.forEach((t, k2) => t.players.forEach((p) => { teamOf[p] = k2; }));
  const { pids, pts, n } = simPoints(pack, sims, roles);
  const P = pids.length;
  const plain: Record<string, number> = {};
  const exp: Record<string, number> = {};
  const dm = decisiveMean(pts, n, P, sims.map((m) => m.winner));
  pids.forEach((p, j) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += pts[i * P + j];
    plain[p] = s / n; exp[p] = dm[j];
  });
  const use = haveRoles ? roles : null;
  const team = ([xi, c, vc]: Team): FantasyTeam => ({
    players: [...xi].sort((a, b) => exp[b] - exp[a]), captain: c, vice_captain: vc,
    expected: Math.round((xi.reduce((a, p) => a + exp[p], 0) + exp[c] + 0.5 * exp[vc]) * 10) / 10,
  });
  return {
    players: Object.fromEntries(pids.map((p) => [p, { team: teamOf[p], role: roles[p] || null, name: pack.players[p]?.name ?? p,
                                                       expected: Math.round(exp[p] * 10) / 10 }])),
    single: team(pickXI(exp, teamOf, use)),
    teams: portfolio(pids, pts, n, teamOf, k, use, plain).map(team),
    fielding: pids.every((p) => pack.players[p]?.fielding), simulations: n, format: pack.format,
  };
}
