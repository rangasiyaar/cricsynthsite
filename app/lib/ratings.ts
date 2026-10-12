// Player ratings for one match, from the simulated forecast (published, or a MatchSynth Lab scenario).
//  Batting value: expected runs, adjusted for strike rate against the match average.
//  Bowling value: expected wickets (each worth ~12 runs in T20, 16 in one-dayers, so a top batter and a top bowler rate
//  alike) plus half the runs saved against the match's average economy.
//  Both are put on 1–100 with the same curve, scaled to the format's length.
//  MVP: a player's batting percentile plus bowling percentile within the match, scaled so the top player is 10.
//  Chosen by the rating lab (cricsim/rating_lab.py) against scored matches, with fantasy points as the yardstick.
import type { PlayerRow, Summary } from "@/lib/types";

export type Rated = {
  p: PlayerRow; team: number; bat: number; bowl: number; mvp: number;
  runs: number | null; sr: number | null; wkts: number | null; econ: number | null;
};

const curve = (v: number, k: number) => 1 - Math.exp(-Math.max(0, v) / k);

export function rate(s: Summary): Rated[] {
  const scale = s.meta.rules.overs / 20;                       // a 50-over match is worth ~2.5 T20s
  const all = s.teams.flatMap((t, team) => t.players.map((p) => ({ p, team })));
  let runs = 0, balls = 0, conceded = 0, overs = 0;
  for (const { p } of all) {
    if (p.batting) { runs += p.batting.runs.mean ?? 0; balls += p.batting.balls.mean ?? 0; }
    if (p.bowling) { conceded += p.bowling.runs.mean ?? 0; overs += p.bowling.overs; }
  }
  const avgSR = balls > 0 ? (100 * runs) / balls : 130;
  const avgEcon = overs > 0 ? conceded / overs : 8;
  const rows = all.map(({ p, team }) => {
    const b = p.batting, w = p.bowling;
    const r = b?.runs.mean ?? 0;
    const batV = b && b.strike_rate > 0 ? r * Math.sqrt(b.strike_rate / avgSR) : r;
    const bowlV = w ? (w.wickets.mean ?? 0) * (s.meta.rules.overs >= 50 ? 16 : 12) + 0.5 * w.overs * (avgEcon - w.economy) : 0;
    const bv = Math.max(0, batV) / scale, wv = Math.max(0, bowlV) / scale;
    return {
      p, team, bv, wv,
      bat: Math.max(1, Math.round(100 * curve(bv, 30))),
      bowl: Math.max(1, Math.round(100 * curve(wv, 30))),
      mvp: 0,
      runs: b?.runs.mean ?? null, sr: b?.strike_rate ?? null,
      wkts: w && w.p_bowls > 0.25 ? w.wickets.mean : null, econ: w && w.p_bowls > 0.25 ? w.economy : null,
    };
  });
  // percentile of each value within the match (0 for players who won't contribute with that discipline)
  const pct = (key: "bv" | "wv") => {
    const sorted = rows.map((x) => x[key]).sort((a, b) => a - b);
    return (v: number) => (v > 0 ? sorted.lastIndexOf(v) / (sorted.length - 1) : 0);
  };
  const pb = pct("bv"), pw = pct("wv");
  const most = Math.max(...rows.map((x) => x.bv + x.wv), 1e-9);
  const blend = rows.map((x) => pb(x.bv) + pw(x.wv) + (0.15 * (x.bv + x.wv)) / most);   // small value term breaks rank ties
  const top = Math.max(...blend, 1e-9);
  return rows.map(({ bv: _b, wv: _w, ...x }, i) => ({ ...x, mvp: Math.round(10 * (1 + (9 * blend[i]) / top)) / 10 }));
}
