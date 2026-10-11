// MatchSynth Lab: the full match-centre summary (the Summary shape of cricsim/engine/summary.py) from simulations run
// in the browser with the user's scenario. Player profiles and engine metadata aren't known here; the Lab merges
// them in from the published match.
import type { Dist, Fow, PlayerRow, Summary, TeamSummary } from "../types.ts";
import type { InningsResult, MatchSim, Pack } from "./sim.ts";

const Q = [5, 10, 25, 50, 75, 90, 95];
const r = (x: number, nd = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : 0);
const mean = (a: ArrayLike<number>) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return a.length ? t / a.length : 0; };
const share = (a: ArrayLike<boolean | number>) => { let t = 0; for (let i = 0; i < a.length; i++) if (a[i]) t++; return a.length ? t / a.length : 0; };

/** numpy.percentile (linear) on a sorted copy. */
function pctile(sorted: ArrayLike<number>, q: number): number {
  if (!sorted.length) return 0;
  const i = ((sorted.length - 1) * q) / 100, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const sortNum = (a: ArrayLike<number>) => Float64Array.from(a).sort();

function dist(a: ArrayLike<number>): Dist {
  if (!a.length) return { mean: null, q: {} };
  const s = sortNum(a);
  return { mean: r(mean(a), 2), q: Object.fromEntries(Q.map((q) => [String(q), r(pctile(s, q), 1)])) };
}

type Log = { inn: InningsResult; inn0: number };

function battingLogs(sims: MatchSim[], team: number): Log[] {
  return sims.map((m) => (m.battingFirst === team ? { inn: m.innings[0], inn0: 0 } : { inn: m.innings[1], inn0: 1 }));
}

function top(ids: string[], idx: number[], pack: Pack, n: number, k = 5) {
  const c = new Map<number, number>();
  for (const j of idx) if (j >= 0) c.set(j, (c.get(j) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([j, v]) => ({ id: ids[j], name: pack.players[ids[j]]?.name ?? ids[j], p: r(v / Math.max(n, 1), 4) }));
}

function teamBatting(pack: Pack, sims: MatchSim[], team: number): TeamSummary["batting"] {
  const { overs, pp, bpo } = pack.rules;
  const entry = pack.batting.find((b) => b.team === team)!;
  const logs = battingLogs(sims, team);
  const n = logs.length;
  const runs = logs.map((l) => l.inn.runs), wkts = logs.map((l) => l.inn.wkts);
  const width = overs <= 20 ? 10 : 20;
  const rs = sortNum(runs);
  const lo = Math.floor(Math.trunc(pctile(rs, 0.5)) / width) * width;
  const hi = Math.floor(Math.trunc(pctile(rs, 99.5)) / width) * width + width;
  const hist = [];
  for (let b = lo; b < hi; b += width) hist.push({ from: b, to: b + width, p: r(share(runs.map((x) => x >= b && x < b + width)), 4) });
  const pAtLeast: Record<string, number> = {};
  for (let t = lo + width; t < hi; t += width) pAtLeast[String(t)] = r(share(runs.map((x) => x >= t)));

  const death = Math.max(pp, Math.round(overs * 0.8));
  const phases = ([["Powerplay", 0, pp], ["Middle", pp, death], ["Death", death, overs]] as [string, number, number][]).map(([phase, a, b]) => {
    const pr = logs.map((l) => { let t = 0; for (let o = a; o < b; o++) t += l.inn.overRuns[o]; return t; });
    const pw = logs.map((l) => { let t = 0; for (let o = a; o < b; o++) t += l.inn.overWkts[o]; return t; });
    return { phase, overs: [a + 1, b] as [number, number], runs: dist(pr), wickets: dist(pw), p_no_wicket: r(share(pw.map((x) => x === 0))) };
  });
  const perOver = Array.from({ length: overs }, (_, o) => ({
    over: o + 1, runs: r(mean(logs.map((l) => l.inn.overRuns[o])), 2),
    p_wicket: r(share(logs.map((l) => l.inn.overWkts[o] > 0))), wickets: r(mean(logs.map((l) => l.inn.overWkts[o]))),
  }));
  // run fan: cumulative runs by the end of each over
  const cum = logs.map((l) => { let t = 0; return Array.from(l.inn.overRuns, (v) => (t += v)); });
  const cumW = logs.map((l) => { let t = 0; return Array.from(l.inn.overWkts, (v) => (t += v)); });
  const fan = Array.from({ length: overs }, (_, o) => {
    const col = sortNum(cum.map((c) => c[o]));
    return { over: o + 1, q10: r(pctile(col, 10), 0), q25: r(pctile(col, 25), 0), q50: r(pctile(col, 50), 0),
             q75: r(pctile(col, 75), 0), q90: r(pctile(col, 90), 0), wickets: r(mean(cumW.map((c) => c[o])), 2) };
  });

  const fow: Fow[] = [];
  const prev = new Float64Array(n);
  for (let k = 0; k < 10; k++) {
    const fell = logs.map((l) => l.inn.fowBall[k] > 0);
    const started = logs.map((l) => (k ? l.inn.fowBall[k - 1] > 0 : true));
    if (!fell.some(Boolean)) { fow.push({ wicket: k + 1, p: 0 }); continue; }
    const overOf: number[] = [], score: number[] = [], part: number[] = [];
    const byOver = new Float64Array(overs);
    logs.forEach((l, i) => {
      if (fell[i]) {
        const o = Math.floor((l.inn.fowBall[k] - 1) / bpo);
        overOf.push(o + 1); score.push(l.inn.fowRuns[k]);
        if (o < overs) byOver[o] += 1;
      }
      if (started[i]) part.push((fell[i] ? l.inn.fowRuns[k] : l.inn.runs) - prev[i]);
    });
    logs.forEach((l, i) => { if (fell[i]) prev[i] = l.inn.fowRuns[k]; });
    fow.push({
      wicket: k + 1, p: r(share(fell)), over: dist(overOf), score: dist(score), partnership: dist(part),
      by_over: Array.from(byOver, (v) => r(v / n, 4)),
      bowler: top(entry.bowlers, logs.map((l) => l.inn.fowBowler[k]), pack, n),
      batter: top(entry.order, logs.map((l) => l.inn.fowSlot[k]), pack, n),
    });
  }
  const byInnings = [0, 1].map((inn0) => {
    const sel = logs.filter((l) => l.inn0 === inn0);
    return { innings: inn0 + 1, score: dist(sel.map((l) => l.inn.runs)), n: sel.length };
  }).filter((x) => x.n > 0);
  return {
    score: { ...dist(runs), hist, p_at_least: pAtLeast },
    wickets: { ...dist(wkts), dist: Array.from({ length: 11 }, (_, k) => r(share(wkts.map((w) => w === k)), 4)) },
    balls: dist(logs.map((l) => l.inn.legal)), by_innings: byInnings, phases, per_over: perOver, fan,
    fall_of_wickets: fow,
    extras: { wides: r(mean(logs.map((l) => l.inn.extras[0])), 2), no_balls: r(mean(logs.map((l) => l.inn.extras[1])), 2),
              byes: r(mean(logs.map((l) => l.inn.extras[2])), 2), total: dist(logs.map((l) => l.inn.extras[0] + l.inn.extras[1] + l.inn.extras[2])) },
  };
}

function players(pack: Pack, sims: MatchSim[], team: number): PlayerRow[] {
  const marks = pack.format === "OD" ? [25, 50, 75, 100, 150] : [10, 20, 30, 50, 100];
  const bat = pack.batting.find((b) => b.team === team)!;          // this team batting
  const opp = pack.batting.find((b) => b.team === 1 - team)!;      // the other side batting (this team bowls)
  const batLogs = battingLogs(sims, team), bowlLogs = battingLogs(sims, 1 - team);
  const n = Math.max(batLogs.length, 1);
  // per simulation, each slot's share of "top scorer" and "best bowler" (ties split), computed once
  const topShare = batLogs.map((l) => {
    const best = Math.max(...l.inn.batRuns);
    const k = best > 0 ? l.inn.batRuns.filter((v) => v === best).length : 0;
    return Array.from(l.inn.batRuns, (v) => (best > 0 && v === best ? 1 / k : 0));
  });
  const bestShare = bowlLogs.map((l) => {
    const sc = Array.from(l.inn.bowlWkts, (w, x) => w * 1000 - l.inn.bowlRuns[x] + (l.inn.bowlBalls[x] > 0 ? 0.5 : 0));
    const mx = Math.max(...sc), k = sc.filter((v) => v === mx).length;
    return sc.map((v) => (v === mx ? 1 / k : 0));
  });
  return pack.teams[team].players.map((p): PlayerRow => {
    const info = pack.players[p];
    const row: PlayerRow = { id: p, name: info?.name ?? p, known: info?.known ?? false, profile: {} };
    const s = bat.order.indexOf(p);
    if (s >= 0) {
      const runs = batLogs.map((l) => l.inn.batRuns[s]), balls = batLogs.map((l) => l.inn.batBalls[s]);
      const out = batLogs.map((l) => l.inn.batOut[s] === 1), batted = balls.map((b) => b > 0);
      const how: Record<string, number> = {};
      const kinds = new Map<number, number>(), by = new Map<number, number>();
      batLogs.forEach((l) => {
        const k = l.inn.batKind[s], j = l.inn.batBy[s];
        if (k >= 0) kinds.set(k, (kinds.get(k) ?? 0) + 1);
        if (j >= 0) by.set(j, (by.get(j) ?? 0) + 1);
      });
      kinds.forEach((c, k) => { how[pack.dismissals[k]] = r(c / n); });
      const tops = topShare.map((t) => t[s]);
      let sr = 0, sb = 0;
      runs.forEach((v, i) => { if (batted[i]) { sr += v; sb += balls[i]; } });
      row.batting = {
        slot: s + 1, p_bats: r(share(batted)), runs: dist(runs), balls: dist(balls), strike_rate: r((100 * sr) / Math.max(sb, 1), 1),
        p_at_least: Object.fromEntries(marks.map((t) => [String(t), r(share(runs.map((v) => v >= t)))])),
        p_duck: r(share(runs.map((v, i) => v === 0 && out[i] && batted[i]))), p_out: r(share(out)), how_out: how,
        dismissed_by: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([j, c]) => ({ bowler: bat.bowlers[j], name: pack.players[bat.bowlers[j]]?.name ?? bat.bowlers[j], p: r(c / n) })),
        p_top_scorer: r(mean(tops)),
      };
    }
    const j = opp.bowlers.indexOf(p);
    if (j >= 0) {
      const wk = bowlLogs.map((l) => l.inn.bowlWkts[j]), rn = bowlLogs.map((l) => l.inn.bowlRuns[j]);
      const bl = bowlLogs.map((l) => l.inn.bowlBalls[j]), bowled = bl.map((b) => b > 0);
      const best = bestShare.map((b) => b[j]);
      const rb = rn.filter((_, i) => bowled[i]);
      const totB = bl.reduce((a, b) => a + b, 0), totR = rn.reduce((a, b) => a + b, 0);
      row.bowling = {
        p_bowls: r(share(bowled)), overs: r(mean(bl) / pack.rules.bpo, 2), wickets: dist(wk),
        p_wickets: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [String(k), r(share(wk.map((w) => w >= k)))])),
        runs: dist(rb.length ? rb : rn), economy: r((pack.rules.bpo * totR) / Math.max(totB, 1), 2), p_best_bowler: r(mean(best)),
      };
    }
    return row;
  });
}

function matchups(pack: Pack, sims: MatchSim[]) {
  const acc = new Map<string, number>();
  for (const m of sims) m.innings.forEach((inn, i) => {
    const team = i === 0 ? m.battingFirst : 1 - m.battingFirst;
    const b = pack.batting.find((x) => x.team === team)!;
    inn.batBy.forEach((j, s) => { if (j >= 0) { const k = `${b.order[s]}|${b.bowlers[j]}`; acc.set(k, (acc.get(k) ?? 0) + 1); } });
  });
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)
    .map(([k, c]) => { const [batter, bowler] = k.split("|"); return { batter, bowler, p: r(c / Math.max(sims.length, 1), 4) }; });
}

export function summarizeFull(pack: Pack, sims: MatchSim[]): Summary {
  const n = Math.max(sims.length, 1);
  const names = pack.teams.map((t) => t.name);
  const wins = [0, 0];
  let tie = 0;
  const mr: number[] = [], mw: number[] = [];
  for (const m of sims) {
    wins[m.winner] += 1; if (m.tie) tie += 1;
    const [r1, r2] = [m.innings[0].runs, m.innings[1].runs];
    if (r1 > r2) mr.push(r1 - r2);
    if (r2 > r1) mw.push(10 - m.innings[1].wkts);
  }
  const byToss = [0, 1].map((bf) => {
    const sel = sims.filter((m) => m.battingFirst === bf);
    return { batting_first: names[bf], n: sel.length,
             win: Object.fromEntries([0, 1].map((t) => [names[t], r(share(sel.map((m) => m.winner === t)))])) };
  }).filter((x) => x.n > 0);
  const width = pack.rules.overs <= 20 ? 10 : 20;
  const first = sims.map((m) => m.innings[0].runs), won = sims.map((m) => m.winner === m.battingFirst);
  const curve = [];
  if (sims.length) {
    for (let b = Math.floor(Math.min(...first) / width) * width; b <= Math.max(...first); b += width) {
      const idx = first.map((f, i) => (f >= b && f < b + width ? i : -1)).filter((i) => i >= 0);
      if (idx.length >= 40) curve.push({ from: b, to: b + width, p_win: r(share(idx.map((i) => won[i])), 4), n: idx.length });
    }
  }
  const balls = sims.reduce((t, m) => t + m.innings[0].legal + m.innings[1].legal, 0);
  return {
    meta: { format: pack.format, gender: pack.gender, simulations: sims.length, rules: { ...pack.rules },
            engine: { balls_simulated: balls } },
    result: {
      win: Object.fromEntries([0, 1].map((t) => [names[t], r(wins[t] / n)])), tie: r(tie / n),
      win_ci95: Object.fromEntries([0, 1].map((t) => [names[t], r(1.96 * Math.sqrt(Math.max((wins[t] / n) * (1 - wins[t] / n), 1e-9) / n), 4)])),
      win_by_first_innings: curve, by_toss: byToss, margin_runs: dist(mr), margin_wickets: dist(mw),
    },
    teams: [0, 1].map((t) => ({ name: names[t], batting: teamBatting(pack, sims, t), players: players(pack, sims, t) })) as [TeamSummary, TeamSummary],
    matchups: matchups(pack, sims),
  };
}
