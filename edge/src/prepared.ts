// Answers that need simulation, for covered matches: read from the per-match files cricsim/edge.py prepares in
// GitHub Actions (shipped privately with the Worker, never on the public site). Live states are interpolated on a
// grid of prepared states. Shared by the API (api.ts) and the MCP tools (mcp.ts).
import { NotFound, type Source } from "./analytics.ts";
import { round } from "./py.ts";

type Row = Record<string, any>;
export class Unavailable extends Error {}
export const LATER = "Prepared answers are ready from 3 days before a covered match (the live-state ones from 36 hours " +
  "before). For other matches or your own inputs, use the local CricSynthesis MCP server or MatchSynth Lab.";

export async function prepared(edge: Source | null, mid: string): Promise<Row> {
  if (!edge) throw new Unavailable(LATER);
  try { return await edge.get(`edge/${encodeURIComponent(mid)}.json`); } catch (e) {
    if (e instanceof NotFound) throw new Unavailable(LATER);
    throw e;
  }
}

export function team(p: Row, name: string | number | null | undefined, what = "team"): number {
  if (typeof name === "number" && (name === 0 || name === 1)) return name;
  if (name == null || name === "") throw new Unavailable(`Name the ${what}: ${p.teams[0]} or ${p.teams[1]}.`);
  const q = String(name).trim().toLowerCase();
  const k = (p.teams as string[]).findIndex((t) => t.toLowerCase() === q);
  const j = k >= 0 ? k : (p.teams as string[]).findIndex((t) => t.toLowerCase().includes(q));
  if (j < 0) throw new Unavailable(`No team '${name}' in this match: ${p.teams[0]} or ${p.teams[1]}.`);
  return j;
}

export function player(p: Row, query: string): string {
  const q = query.trim().toLowerCase();
  const rows = Object.entries<string>(p.players);
  const hit = rows.find(([id, n]) => id.toLowerCase() === q || n.toLowerCase() === q)
    ?? rows.find(([, n]) => q.split(/\s+/).filter(Boolean).every((w) => n.toLowerCase().includes(w)));
  if (!hit) throw new Unavailable(`No player '${query}' in this match.`);
  return hit[0];
}

export function chase(p: Row, chasing: number, from?: number, to?: number, step?: number): Row {
  const c = p.chase[p.teams[chasing]];
  let rows: Row[] = c.curve;
  if (from != null || to != null || step != null) {
    const lo = from ?? rows[0].target, hi = to ?? rows[rows.length - 1].target, st = Math.max(10, step ?? 10);
    rows = rows.filter((r) => r.target >= lo && r.target <= hi && (r.target - lo) % st === 0);
    if (!rows.length) rows = c.curve.filter((r: Row) => r.target >= lo - 10 && r.target <= hi + 10);
  }
  return { chasing: c.chasing, curve: rows, coin_flip_target: c.coin_flip_target,
           note: `Targets are prepared every 10 runs from ${c.curve[0].target} to ${c.curve[c.curve.length - 1].target}.` };
}

export function toss(doc: Row): Row {
  const by: Row[] = doc.summary.result.by_toss || [];
  const names: string[] = doc.summary.teams.map((t: Row) => t.name);
  if (by.length === 1) return { decided: true, batting_first: by[0].batting_first, note: `The toss is done: ${by[0].batting_first} bat first.` };
  if (by.length < 2) throw new Unavailable("No toss split published for this match.");
  const win = (bf: string, t: string) => by.find((y) => y.batting_first === bf)?.win?.[t];
  return { teams: names.map((t, i) => {
    const bat = win(t, t), chase = win(names[1 - i], t);
    return { team: t, win_batting_first: bat, win_chasing: chase, choose: bat > chase ? "bat" : "bowl", edge: round(Math.abs(bat - chase), 4) };
  }) };
}

export function fantasyTeam(p: Row, rule = "mean"): Row {
  if (!p.fantasy) throw new Unavailable("No fantasy projections for this format.");
  return p.fantasy.team[rule === "upside" ? "upside" : "mean"];
}

export function portfolio(p: Row, k = 5): Row {
  if (!p.fantasy) throw new Unavailable("No fantasy projections for this format.");
  return p.fantasy.portfolio[String(Math.min(10, Math.max(2, k)))];
}

// ── live states ──

/** Overs in cricket notation (12.3) → balls; refuses a ball count the format doesn't have. */
export function balls(overs: number, bpo: number): number {
  const whole = Math.trunc(overs);
  const part = Math.round((overs - whole) * 10);
  if (part >= bpo) throw new Unavailable(`Overs must be written as overs.balls with fewer than ${bpo} balls after the point.`);
  return whole * bpo + part;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (x: Row, y: Row, t: number): Row => ({
  win: [lerp(x.win[0], y.win[0], t), lerp(x.win[1], y.win[1], t)], q: x.q.map((v: number, i: number) => lerp(v, y.q[i], t)),
  mean: lerp(x.mean, y.mean, t), wk_mean: lerp(x.wk_mean, y.wk_mean, t), all_out: lerp(x.all_out, y.all_out, t), runs: lerp(x.runs, y.runs, t),
});

/** The state's values at one gridded ball count: interpolated across the three gridded run levels (clamped). */
function atBalls(states: Row[], b: number, wk: number, runs: number): Row | null {
  const rows = states.filter((s) => s.balls === b && (b === 0 || s.wk === wk)).sort((x, y) => x.runs - y.runs);
  if (!rows.length) return null;
  if (rows.length === 1 || runs <= rows[0].runs) return { ...rows[0] };
  if (runs >= rows[rows.length - 1].runs) return { ...rows[rows.length - 1] };
  const i = rows.findIndex((s) => s.runs >= runs);
  const x = rows[i - 1], y = rows[i];
  return mix(x, y, (runs - x.runs) / Math.max(1, y.runs - x.runs));
}

/** Win chances and the batting side's final total from a live state, interpolated on the prepared grid. */
export function liveState(p: Row, batting: number, runs: number, wickets: number, ballsDone: number, target?: number | null): Row {
  if (!p.live) throw new Unavailable("Live-state answers are prepared from 36 hours before the start.");
  const g = p.live;
  const inn = target ? 2 : 1;
  const bf = inn === 1 ? batting : 1 - batting;
  const states: Row[] = g.states.filter((s: Row) => s.bf === bf && s.inn === inn);
  if (ballsDone > g.balls_total) throw new Unavailable("More balls than the innings has.");
  let gridRuns = runs, shift = 0;
  if (inn === 2) {
    const t0 = states[0].target;
    const need = target! - runs;
    if (need <= 0) throw new Unavailable("The target is already reached.");
    gridRuns = Math.max(0, t0 - need);
    shift = runs - gridRuns;                     // the chase on the grid is against the prepared target
  }
  const steps: number[] = g.balls;
  const hi = steps.findIndex((b) => b >= ballsDone);
  const b1 = hi < 0 ? steps[steps.length - 1] : steps[hi], b0 = hi <= 0 ? b1 : steps[hi - 1];
  const x = atBalls(states, b0, wickets, gridRuns), y = atBalls(states, b1, wickets, gridRuns);
  if (!x || !y) throw new Unavailable("No prepared state near this one.");
  const v = b1 === b0 ? x : mix(x, y, (ballsDone - b0) / (b1 - b0));
  const name = p.teams[batting];
  const q = v.q.map((n: number) => n + shift);
  return { batting: name, innings: inn, from: { runs, wickets, balls: ballsDone, target: target ?? null },
           win: { [p.teams[0]]: round(v.win[0], 3), [p.teams[1]]: round(v.win[1], 3) },
           tie: round(Math.max(0, 1 - v.win[0] - v.win[1]), 3),
           final_total: { mean: round(v.mean + shift, 1), q: { "5": round(q[0]), "10": round(q[1]), "25": round(q[2]), "50": round(q[3]),
                          "75": round(q[4]), "90": round(q[5]), "95": round(q[6]) } },
           final_wickets_mean: round(v.wk_mean, 1), p_all_out: round(v.all_out, 3),
           ...(inn === 2 ? { required: { runs: target! - runs, balls: g.balls_total - ballsDone,
                                         rate: round(6 * (target! - runs) / Math.max(1, g.balls_total - ballsDone), 2) } } : {}),
           note: "Interpolated from prepared match states; for an exact re-simulation use the local MCP server or MatchSynth Lab." };
}

/** Chance the innings reaches each total, read off the final-total quantiles (linear between them). */
export function chanceAtLeast(final: Row, thresholds: number[]): Record<string, number> {
  const pts: [number, number][] = [["5", .05], ["10", .1], ["25", .25], ["50", .5], ["75", .75], ["90", .9], ["95", .95]]
    .map(([k, p]) => [final.q[k as string], p as number]);
  const out: Record<string, number> = {};
  for (const t of thresholds) {
    let cdf: number;
    if (t <= pts[0][0]) cdf = 0.05 * Math.max(0, t - (pts[0][0] - 30)) / 30;
    else if (t >= pts[6][0]) cdf = Math.min(1, 0.95 + 0.05 * (t - pts[6][0]) / 30);
    else {
      const i = pts.findIndex(([v]) => v >= t);
      const [v0, p0] = pts[i - 1], [v1, p1] = pts[i];
      cdf = v1 === v0 ? p1 : p0 + (p1 - p0) * (t - v0) / (v1 - v0);
    }
    out[String(t)] = round(1 - cdf, 3);
  }
  return out;
}
