// The hosted API: the same paths, parameters and response shapes as cricapi (so the docs, playground and examples stay
// valid), answered from the published files. Endpoints that need a fresh simulation are listed in NOT_HOSTED.
import { Analytics, BadRequest, NotFound } from "./analytics.ts";
import * as G from "./graphics.ts";
import { Kit, type Player } from "./insight.ts";
import * as P from "./prepared.ts";
import type { Account } from "./keys.ts";

type Row = Record<string, any>;
export const A = "Analytics", SM = "Simulation & modelling", GR = "Graphics";

export class HttpError extends Error {
  status: number;
  constructor(status: number, detail: string) { super(detail); this.status = status; }
}

export type Ctx = { params: Record<string, string>; q: Query; body: any; acct: Account; a: Analytics };
type Handler = (c: Ctx) => Promise<Row | string | null>;
export type Route = { method: string; path: string; tag: string; summary: string; re: RegExp; keys: string[]; run: Handler; svg?: boolean };

const FORMATS = ["T20", "T10", "HUNDRED", "OD"], GENDERS = ["male", "female"], PHASES = ["powerplay", "middle", "death"];
const THEMES = ["dark", "light"];

/** Query-string reading with FastAPI-style 422s. */
export class Query {
  p: URLSearchParams;
  constructor(p: URLSearchParams) { this.p = p; }
  str(name: string, def?: string | null): string | null {
    const v = this.p.get(name);
    if (v == null || v === "") {
      if (def === undefined) throw new HttpError(422, `Query parameter '${name}' is required`);
      return def;
    }
    if (v.length > 200) throw new HttpError(422, `'${name}' is too long`);
    return v;
  }
  need(name: string): string { return this.str(name) as string; }
  one(name: string, options: string[], def: string): string {
    const v = this.str(name, def) as string;
    if (!options.includes(v)) throw new HttpError(422, `'${name}' must be one of: ${options.join(", ")}`);
    return v;
  }
  int(name: string, def: number, lo: number, hi: number = Number.MAX_SAFE_INTEGER): number {
    const raw = this.str(name, String(def)) as string;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(422, `'${name}' must be a whole number from ${lo}${hi < 1e15 ? ` to ${hi}` : ""}`);
    return n;
  }
  ids(name: string, lo: number, hi: number): string[] {
    const ids = this.need(name).split(",").map((x) => x.trim()).filter(Boolean);
    if (ids.length < lo || ids.length > hi) throw new HttpError(422, `Give ${lo}–${hi} comma-separated player ids`);
    return ids;
  }
}

const routes: Route[] = [];
function route(method: string, path: string, tag: string, summary: string, run: Handler, svg = false) {
  const keys: string[] = [];
  const re = new RegExp("^" + path.replace(/\{(\w+)\}/g, (_, k) => { keys.push(k); return "([^/]+)"; }).replace(/\./g, "\\.") + "$");
  routes.push({ method, path, tag, summary, re, keys, run, svg });
}

// ── helpers ──
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
async function known(c: Ctx, pid: string): Promise<Player> {
  if (!SAFE_ID.test(pid)) throw new HttpError(404, `Unknown player ${pid}`);
  try { return await c.a.player(pid); } catch (e) { if (e instanceof NotFound) throw new HttpError(404, `Unknown player ${pid}`); throw e; }
}
const fmt = (c: Ctx, def = "T20") => c.q.one("format", FORMATS, def);
const gender = (c: Ctx) => c.q.one("gender", GENDERS, "male");
const phase = (c: Ctx) => c.q.one("phase", PHASES, "middle");
const theme = (c: Ctx) => c.q.one("theme", THEMES, "dark");
const wm = (c: Ctx) => c.acct.limits.watermark;

async function published(c: Ctx, mid: string): Promise<Row> {
  if (!SAFE_ID.test(mid)) throw new HttpError(404, "Match not found");
  let d: Row;
  try { d = await c.a.src.get(`matches/${encodeURIComponent(mid)}.json`); } catch (e) {
    if (e instanceof NotFound) throw new HttpError(404, "Match not found");
    throw e;
  }
  if (d.published === false) throw new HttpError(404, "Match not found");
  return d;
}

// ── analytics: players ──
route("GET", "/v1/players", A, "Search players", async (c) => {
  const q = c.q.need("q");
  if (q.length < 2) throw new HttpError(422, "'q' needs at least 2 characters");
  return c.a.searchPlayers(q, c.q.int("limit", 20, 1, 50));
});
route("GET", "/v1/players/compare", A, "Compare players side by side", async (c) => {
  const ps = await Promise.all(c.q.ids("ids", 2, 5).map((p) => known(c, p)));
  return (await c.a.kit()).compare(ps, fmt(c), gender(c));
});
route("GET", "/v1/players/{pid}", A, "Player rating", async (c) => (await c.a.kit()).rating(await known(c, c.params.pid), fmt(c)));
route("GET", "/v1/players/{pid}/phases", A, "Phase profile", async (c) =>
  (await c.a.kit()).phase_profile(await known(c, c.params.pid), fmt(c), gender(c)));
route("GET", "/v1/players/{pid}/vs-bowling", A, "Batter v bowling types", async (c) =>
  (await c.a.kit()).vs_bowling(await known(c, c.params.pid), fmt(c), gender(c), phase(c)));
route("GET", "/v1/players/{pid}/vs-batting-hand", A, "Bowler v left- and right-handers", async (c) =>
  (await c.a.kit()).vs_batting_hand(await known(c, c.params.pid), fmt(c), gender(c), phase(c)));
route("GET", "/v1/players/{pid}/situations", A, "Situational batting", async (c) =>
  (await c.a.kit()).situations(await known(c, c.params.pid), fmt(c), gender(c)));
route("GET", "/v1/players/{pid}/formats", A, "Format split", async (c) =>
  (await c.a.kit()).format_split(await known(c, c.params.pid), gender(c)));
route("GET", "/v1/players/{pid}/role", A, "Role and workload", async (c) =>
  (await c.a.kit()).role(await known(c, c.params.pid), fmt(c)));
route("GET", "/v1/players/{pid}/similar", A, "Similar players", async (c) => {
  const p = await known(c, c.params.pid);
  const f = fmt(c), side = c.q.one("side", ["batting", "bowling"], "batting");
  gender(c);
  return c.a.similar(p, f, side, c.q.int("limit", 10, 1, 25));
});

// ── analytics: rankings, match-ups ──
const BAT_SORTS = ["impact", "strike_rate", "balls_per_dismissal", "runs_per_dismissal", "boundary_pct", "dot_pct"];
const BOWL_SORTS = ["impact", "economy", "balls_per_wicket", "dot_pct", "boundary_pct"];
for (const side of ["batting", "bowling"]) {
  route("GET", `/v1/rankings/${side}`, A, `${side[0].toUpperCase()}${side.slice(1)} rankings`, async (c) => {
    const f = fmt(c);
    if (f === "T10" || f === "HUNDRED") throw new HttpError(422, "Rankings are for T20 and OD");
    return c.a.rankings(side, f, gender(c), phase(c), c.q.one("sort", side === "batting" ? BAT_SORTS : BOWL_SORTS, "impact"),
                        c.q.int("limit", 25, 1, 100), c.q.int("min_balls", 500, 50));
  });
}
route("GET", "/v1/matchups", A, "Batter v bowler", async (c) => {
  const [b, w] = await Promise.all([known(c, c.q.need("batter")), known(c, c.q.need("bowler"))]);
  return (await c.a.kit()).matchup(b, w, fmt(c), gender(c), phase(c));
});
route("GET", "/v1/matchups/grid", A, "Match-up grid", async (c) => {
  const bs = await Promise.all(c.q.ids("batters", 1, 11).map((p) => known(c, p)));
  const ws = await Promise.all(c.q.ids("bowlers", 1, 11).map((p) => known(c, p)));
  return (await c.a.kit()).matchup_grid(bs, ws, fmt(c), gender(c), phase(c));
});
route("GET", "/v1/matchups/counter", A, "Best bowler for a batter", async (c) => {
  const b = await known(c, c.q.need("batter"));
  const ws = await Promise.all(c.q.ids("candidates", 2, 11).map((p) => known(c, p)));
  return (await c.a.kit()).counter(b, ws, fmt(c), gender(c), phase(c));
});

// ── analytics: venues, competitions, trends, teams ──
const nf = async <T>(p: Promise<T>, what: string): Promise<T> => {
  try { return await p; } catch (e) { if (e instanceof NotFound) throw new HttpError(404, `Unknown ${what}`); throw e; }
};
route("GET", "/v1/venues", A, "Venues", async (c) => c.a.venues(c.q.str("q", null), c.q.int("limit", 50, 1, 200)));
route("GET", "/v1/venues/{vid}", A, "Venue profile", async (c) => {
  if (!SAFE_ID.test(c.params.vid)) throw new HttpError(404, "Unknown venue");
  const f = fmt(c);
  return nf(c.a.venueProfile(c.params.vid, f, gender(c), true), "venue");
});
route("GET", "/v1/competitions", A, "Competitions", async (c) => c.a.competitions(c.q.str("q", null), c.q.int("limit", 50, 1, 200)));
route("GET", "/v1/competitions/{key}", A, "Competition profile", async (c) => {
  if (!SAFE_ID.test(c.params.key)) throw new HttpError(404, "Unknown competition");
  return nf(c.a.competitionProfile(c.params.key, true), "competition");
});
route("GET", "/v1/trends/scoring", A, "Scoring trend", async (c) => {
  const f = fmt(c);
  return nf(c.a.scoringTrend(f, gender(c)), "format");
});
route("GET", "/v1/teams", A, "Teams", async (c) =>
  c.a.teams(c.q.str("q", null), c.q.p.get("gender") ? gender(c) : null, c.q.int("limit", 50, 1, 200)));
route("GET", "/v1/teams/{tid}", A, "Team profile", async (c) => {
  if (!SAFE_ID.test(c.params.tid)) throw new HttpError(404, "Unknown team");
  return nf(c.a.teamProfile({ team: c.params.tid, fmt: fmt(c), exact: true }), "team");
});
route("POST", "/v1/teams/profile", A, "Profile any XI", async (c) => {
  const b = c.body || {};
  const f = b.format ?? "T20", g = b.gender ?? "male";
  if (!FORMATS.includes(f) || !GENDERS.includes(g)) throw new HttpError(422, "format / gender not recognised");
  if (!Array.isArray(b.players) || b.players.length !== 11) throw new HttpError(422, "players: give 11 player ids");
  const xi = await Promise.all(b.players.map((p: string) => c.a.playerOrStub(String(p))));
  const bowlers = Array.isArray(b.bowlers) && b.bowlers.length
    ? await Promise.all(b.bowlers.slice(0, 11).map((p: string) => c.a.playerOrStub(String(p)))) : null;
  return (await c.a.kit()).team_profile(xi, f, g, bowlers);
});

// ── analytics: Pattern Lab ──
const patterns = async (c: Ctx) => nf(c.a.src.get("patterns.json"), "report: Pattern Lab report not published yet");
route("GET", "/v1/patterns", A, "Pattern Lab", async (c) => patterns(c));
route("GET", "/v1/patterns/{pattern_id}", A, "Pattern detail", async (c) => {
  const hit = ((await patterns(c)).patterns || []).find((x: Row) => x.id === c.params.pattern_id);
  if (!hit) throw new HttpError(404, "Unknown pattern");
  return hit;
});

// ── covered matches (published forecasts) ──
route("GET", "/v1/matches", SM, "Covered matches", async (c) =>
  ({ matches: ((await c.a.src.get("index.json")).matches || []).filter((m: Row) => m.published !== false) }));
route("GET", "/v1/matches/{match_id}", SM, "Match forecast", async (c) => published(c, c.params.match_id));
route("GET", "/v1/matches/{match_id}/pack", SM, "Engine pack", async (c) => {
  await published(c, c.params.match_id);
  return nf(c.a.src.get(`matches/${encodeURIComponent(c.params.match_id)}.pack.json`), "pack");
});
route("GET", "/v1/matches/{match_id}/fantasy", SM, "Fantasy projections for a covered match", async (c) => {
  const d = await published(c, c.params.match_id);
  if (!d.fantasy) throw new HttpError(404, "No fantasy projections for this match");
  return d.fantasy;
});

// ── graphics ──
for (const [card, title] of [["win", "Win probability card"], ["scores", "Score distribution card"], ["worm", "Run worm card"],
                             ["phases", "Phase card"], ["duels", "Key duels card"]]) {
  route("GET", `/v1/graphics/matches/{match_id}/${card}.svg`, GR, title, async (c) =>
    G.CARDS[card](await published(c, c.params.match_id), theme(c), wm(c)), true);
}
route("GET", "/v1/graphics/matches/{match_id}/wickets/{team}.svg", GR, "Wicket timing card", async (c) => {
  if (!["0", "1"].includes(c.params.team)) throw new HttpError(404, "team is 0 or 1");
  return G.wickets_card(await published(c, c.params.match_id), Number(c.params.team), theme(c), wm(c));
}, true);
route("GET", "/v1/graphics/matches/{match_id}/players/{pid}.svg", GR, "Player match card", async (c) =>
  G.player_card(await published(c, c.params.match_id), decodeURIComponent(c.params.pid), theme(c), wm(c)), true);
route("GET", "/v1/graphics/players/{pid}/profile.svg", GR, "Player profile card", async (c) =>
  G.player_profile_card((await c.a.kit()).phase_profile(await known(c, c.params.pid), fmt(c), gender(c)), theme(c), wm(c)), true);
route("GET", "/v1/graphics/matchups.svg", GR, "Match-up card", async (c) => {
  const [b, w] = await Promise.all([known(c, c.q.need("batter")), known(c, c.q.need("bowler"))]);
  return G.matchup_card((await c.a.kit()).matchup(b, w, fmt(c), gender(c), phase(c)), theme(c), wm(c));
}, true);
route("GET", "/v1/graphics/venues/{vid}.svg", GR, "Venue card", async (c) => {
  if (!SAFE_ID.test(c.params.vid)) throw new HttpError(404, "Not found");
  const f = fmt(c), g = gender(c);
  return G.venue_card(await nf(c.a.venueProfile(c.params.vid, f, g, true), "venue"), theme(c), wm(c));
}, true);
route("GET", "/v1/graphics/trends/scoring.svg", GR, "Scoring trend card", async (c) => {
  const f = fmt(c), g = gender(c);
  return G.trend_card(await nf(c.a.scoringTrend(f, g), "format"), theme(c), wm(c));
}, true);

// ── simulation & modelling for covered matches: prepared in Actions (cricsim/edge.py), read here ──
async function covered(c: Ctx): Promise<{ mid: string; p: Row; doc: Row }> {
  const b = c.body || {};
  const mid = b.match_id ?? c.params.match_id;
  if (!mid) {
    throw new HttpError(422, "Give match_id: a covered match from GET /v1/matches. The hosted API answers for covered " +
                             "matches; your own XIs need the local CricSynthesis engine (MCP server) or MatchSynth Lab.");
  }
  const doc = await published(c, String(mid));
  return { mid: String(mid), doc, p: await P.prepared(c.a.edge, String(mid)) };
}
const teamArg = (p: Row, v: any, what: string) => P.team(p, v, what);
const unav = async <T>(f: () => Promise<T>): Promise<T> => {
  try { return await f(); } catch (e) { if (e instanceof P.Unavailable) throw new HttpError(404, e.message); throw e; }
};
const noCustom = (b: Row, ...keys: string[]) => {
  for (const k of keys) {
    if (b[k] != null && !(Array.isArray(b[k]) && !b[k].length) && !(typeof b[k] === "object" && !Array.isArray(b[k]) && !Object.keys(b[k]).length)) {
      throw new HttpError(501, `'${k}' needs a fresh simulation, which the hosted API doesn't run. Use the local MCP server or MatchSynth Lab.`);
    }
  }
};

function stateFrom(c: Ctx, p: Row, s: Row): Row {
  const inn = Number(s.innings ?? 1), bat = Number(s.batting ?? 0);
  if (![1, 2].includes(inn) || ![0, 1].includes(bat)) throw new HttpError(422, "state.innings is 1 or 2, state.batting is 0 or 1");
  if (inn === 2 && !s.target) throw new HttpError(422, "state.target is required in the second innings");
  const runs = Number(s.runs ?? 0), wk = Number(s.wickets ?? 0), overs = Number(s.overs ?? 0);
  if (!(runs >= 0) || !(wk >= 0 && wk <= 9) || !(overs >= 0)) throw new HttpError(422, "runs ≥ 0, wickets 0–9, overs ≥ 0");
  return P.liveState(p, bat, runs, wk, P.balls(overs, p.live?.bpo ?? 6), inn === 2 ? Number(s.target) : null);
}

route("POST", "/v1/par-score", SM, "Par score", async (c) => unav(async () => {
  noCustom(c.body || {}, "teams");
  const { mid, p } = await covered(c);
  return { match_id: mid, ...p.par };
}));
route("POST", "/v1/chase-curve", SM, "Chase curve", async (c) => unav(async () => {
  const b = c.body || {};
  const { mid, p } = await covered(c);
  return { match_id: mid, ...P.chase(p, teamArg(p, b.chasing ?? 1, "chasing team"), b.target_from, b.target_to, b.step) };
}));
route("POST", "/v1/toss", SM, "Toss decision", async (c) => unav(async () => {
  const { mid, doc } = await covered(c);
  return { match_id: mid, ...P.toss(doc) };
}));
route("POST", "/v1/players/{pid}/impact", SM, "Player impact", async (c) => unav(async () => {
  const { mid, p } = await covered(c);
  const row = p.impact[c.params.pid];
  if (!row) throw new HttpError(404, `${c.params.pid} isn't in either XI`);
  return { match_id: mid, ...row };
}));
route("POST", "/v1/players/{pid}/projection", SM, "Player projection", async (c) => unav(async () => {
  noCustom(c.body || {}, "opposition", "position");
  const { mid, doc } = await covered(c);
  for (const t of doc.summary.teams) for (const pl of t.players) {
    if (pl.id === c.params.pid) return { match_id: mid, team: t.name, id: pl.id, name: pl.name, batting: pl.batting ?? null, bowling: pl.bowling ?? null };
  }
  throw new HttpError(404, `${c.params.pid} isn't in either XI`);
}));
route("POST", "/v1/lineups/batting-order", SM, "Batting order optimiser", async (c) => unav(async () => {
  const { mid, p } = await covered(c);
  return { match_id: mid, ...p.batting_order[p.teams[teamArg(p, (c.body || {}).team ?? 0, "team")]] };
}));
route("POST", "/v1/lineups/bowling-plan", SM, "Bowling plan", async (c) => unav(async () => {
  noCustom(c.body || {}, "bowlers");
  const { mid, p } = await covered(c);
  const plan = p.bowling_plan[p.teams[teamArg(p, (c.body || {}).bowling_team ?? 1, "bowling team")]];
  if (!plan) throw new HttpError(404, "No bowling plan for this side (fewer than two usual bowlers)");
  return { match_id: mid, ...plan };
}));
route("POST", "/v1/fantasy/projections", SM, "Fantasy projections", async (c) => unav(async () => {
  noCustom(c.body || {}, "roles");
  const { mid, p } = await covered(c);
  if (!p.fantasy) throw new HttpError(404, "No fantasy projections for this format");
  return { match_id: mid, ...p.fantasy.projections };
}));
route("POST", "/v1/fantasy/team", SM, "Fantasy team", async (c) => unav(async () => {
  noCustom(c.body || {}, "roles");
  const { mid, p } = await covered(c);
  return { match_id: mid, ...P.fantasyTeam(p, (c.body || {}).captain_rule) };
}));
route("POST", "/v1/fantasy/portfolio", SM, "Fantasy portfolio", async (c) => unav(async () => {
  noCustom(c.body || {}, "roles");
  const { mid, p } = await covered(c);
  return { match_id: mid, ...P.portfolio(p, Number((c.body || {}).teams_count ?? 5)) };
}));
route("POST", "/v1/win-probability", SM, "Win probability from any state", async (c) => unav(async () => {
  const { mid, p } = await covered(c);
  return { match_id: mid, ...stateFrom(c, p, (c.body || {}).state || {}) };
}));
route("POST", "/v1/innings/projection", SM, "Innings projection", async (c) => unav(async () => {
  const b = c.body || {};
  const { mid, p } = await covered(c);
  const s = stateFrom(c, p, b.state || {});
  const lo = Math.floor(s.final_total.q["5"] / 10) * 10;
  const th: number[] = Array.isArray(b.thresholds) && b.thresholds.length ? b.thresholds.slice(0, 20).map(Number)
    : Array.from({ length: 9 }, (_, i) => lo + 10 * i);
  return { match_id: mid, team: s.batting, innings: s.innings, from: s.from, final_total: s.final_total,
           final_wickets_mean: s.final_wickets_mean, p_at_least: P.chanceAtLeast(s.final_total, th), p_all_out: s.p_all_out, note: s.note };
}));
route("GET", "/v1/matches/{match_id}/win-probability", SM, "Live win probability for a covered match", async (c) => unav(async () => {
  const { mid, p } = await covered(c);
  const innings = c.q.int("innings", 1, 1, 2), target = c.q.p.get("target");
  return { match_id: mid, ...stateFrom(c, p, { innings, batting: c.q.int("batting", 0, 0, 1), runs: c.q.int("runs", 0, 0),
    wickets: c.q.int("wickets", 0, 0, 9), overs: Number(c.q.str("overs", "0")), target: target ? Number(target) : undefined }) };
}));

/** Endpoints of the full API that need a fresh simulation with the caller's own inputs: local only. */
export const NOT_HOSTED: { method: string; path: string; tag: string; summary: string; local_only?: boolean }[] = [
  { method: "POST", path: "/v1/simulate", tag: SM, summary: "Simulate a match", local_only: true },
  { method: "POST", path: "/v1/scenarios/compare", tag: SM, summary: "Compare scenarios", local_only: true },
  { method: "POST", path: "/v1/lineups/swap", tag: SM, summary: "Swap a player", local_only: true },
];
const notHostedRe = NOT_HOSTED.map((n) => ({ ...n, re: new RegExp("^" + n.path.replace(/\{\w+\}/g, "[^/]+") + "$") }));

export function match(method: string, path: string): { route: Route; params: Record<string, string> } | { notHosted: typeof NOT_HOSTED[number] } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  const nh = notHostedRe.find((n) => n.method === method && n.re.test(path));
  return nh ? { notHosted: nh } : null;
}

export function catalog(): Row {
  const eps: Record<string, Row[]> = { [A]: [], [SM]: [], [GR]: [] };
  for (const r of routes) eps[r.tag].push({ method: r.method, path: r.path, summary: r.summary });
  return { endpoints: eps, not_hosted: NOT_HOSTED.map(({ method, path, summary, local_only }) =>
    ({ method, path, summary, where: local_only ? "local MCP server or MatchSynth Lab" : "coming to the hosted API" })) };
}

export { BadRequest, Kit, NotFound, routes };
