// Remote MCP server at /mcp (Streamable HTTP, stateless JSON responses): the CricSynthesis MCP tools that need no
// simulation, answered from the published files with the same arithmetic as the local package (cricmcp/server.py).
// Fully custom what-ifs stay in the local package (uvx) and MatchSynth Lab.
import { Analytics, NotFound, BadRequest } from "./analytics.ts";
import * as G from "./graphics.ts";
import { Kit, type Player } from "./insight.ts";
import { fixed, round } from "./py.ts";

type Row = Record<string, any>;
const SITE = "https://cricsynthesis.in";
export const VERSION = "0.3.1";
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS = `CricSynthesis: cricket analytics and forecasts from a ball-by-ball model of every recorded delivery.
- Analytics (any player, venue, competition or team): player ratings, phase / bowling-type / situation splits, roles,
  similar players, rankings, batter-v-bowler match-ups, venue and competition profiles, scoring trends, team profiles.
  Players can be named in plain words; search_players helps when a name is ambiguous.
- Forecasts (upcoming covered matches, see list_matches): win chances, projected scores, player outlooks, key duels,
  innings shape, toss call, fantasy picks.
- Graphics: shareable SVG cards for matches, players, match-ups, venues and trends.
Numbers are model expectations or shares of simulated matches, not certainties; quote ranges where given. Ratings are
relative to an average player in the same format (1.00 = average). Data is rebuilt nightly. Custom what-if
simulations need the local CricSynthesis MCP server (uvx cricsynthesis-mcp) or MatchSynth Lab on the website.`;

export class ToolError extends Error {}

// ── helpers (cricmcp/server.py) ──
const pct = (p: number | null | undefined): string | null => (p == null ? null : `${fixed(100 * p, 0)}%`);
const range = (d: Row, lo = "10", hi = "90"): string | null => {
  const q = d.q || {};
  return lo in q && hi in q ? `${fixed(q[lo], 0)}-${fixed(q[hi], 0)}` : null;
};
const link = (mid: string) => `${SITE}/match/${mid}/`;
const STOP = new Set(["v", "vs", "versus", "and", "the", "match"]);

async function cards(a: Analytics): Promise<Row[]> {
  const idx = await a.src.get("index.json");
  return ((idx.matches || []) as Row[]).filter((m) => m.published !== false);
}

/** A match card by id or by words from the title / team names; no query = the next match. */
async function findMatch(a: Analytics, query?: string | null): Promise<Row> {
  const cs = (await cards(a)).map((m, i) => [m, i] as [Row, number]).sort((x, y) => {
    const kx = [x[0].date || "9999", x[0].start_time || ""], ky = [y[0].date || "9999", y[0].start_time || ""];
    return kx[0] < ky[0] ? -1 : kx[0] > ky[0] ? 1 : kx[1] < ky[1] ? -1 : kx[1] > ky[1] ? 1 : x[1] - y[1];
  }).map((x) => x[0]);
  if (!cs.length) throw new ToolError("No matches are published right now.");
  if (!query) return cs[0];
  const q = query.trim().toLowerCase();
  const exact = cs.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  const hay = (m: Row) => [m.title, m.competition, m.venue, m.date, ...m.teams.map((t: Row) => t.name), ...m.teams.map((t: Row) => t.short)]
    .filter((p) => p).join(" ").toLowerCase();
  const hit = cs.find((m) => words.length && words.every((w) => hay(m).includes(w)));
  if (!hit) {
    const names = cs.map((m) => `${m.id}: ${m.title || m.teams.map((t: Row) => t.name).join(" v ")}`).join("; ");
    throw new ToolError(`No published match matches '${query}'. Published matches: ${names}`);
  }
  return hit;
}

async function doc(a: Analytics, match?: string | null): Promise<[Row, Row]> {
  const card = await findMatch(a, match);
  return [card, await a.src.get(`matches/${encodeURIComponent(card.id)}.json`)];
}

function playerIndex(d: Row): Map<string, [number, Row]> {
  const m = new Map<string, [number, Row]>();
  d.summary.teams.forEach((team: Row, t: number) => team.players.forEach((p: Row) => m.set(p.id, [t, p])));
  return m;
}

function findInMatch(d: Row, query: string): [number, Row] {
  const q = query.trim().toLowerCase();
  const rows = [...playerIndex(d).values()];
  const exact = rows.filter(([, p]) => p.name.toLowerCase() === q || p.id.toLowerCase() === q);
  if (exact.length) return exact[0];
  const loose = rows.filter(([, p]) => q.split(/\s+/).filter(Boolean).every((w) => p.name.toLowerCase().includes(w)));
  if (loose.length) return loose[0];
  throw new ToolError(`No player '${query}' in this match. Players: ` + rows.map(([, p]) => p.name).join(", "));
}

const sortDesc = <T>(xs: T[], k: (x: T) => number) => xs.map((x, i) => [x, i] as [T, number]).sort((a, b) => k(b[0]) - k(a[0]) || a[1] - b[1]).map((x) => x[0]);
const g = (p: Player, gender?: string | null) => gender || p.gender || "male";

// ── tools ──
type Tool = { name: string; description: string; input: Row; run: (a: Analytics, x: Row) => Promise<Row>; category: string };
const S = {
  str: (description: string) => ({ type: "string", description }),
  int: (lo: number, hi: number, def: number) => ({ type: "integer", minimum: lo, maximum: hi, default: def }),
  one: (vals: string[], def?: string, description?: string) => ({ type: "string", enum: vals, ...(def ? { default: def } : {}), ...(description ? { description } : {}) }),
  list: (lo: number, hi: number, description: string) => ({ type: "array", items: { type: "string" }, minItems: lo, maxItems: hi, description }),
};
const MATCH = S.str("Match id, or words from the team names / title, e.g. 'India v West Indies'. Leave empty for the next match.");
const PLAYER = S.str("Player name (or part of it) or player id");
const FORMAT = S.one(["T20", "OD"], "T20"), FORMAT_ALL = S.one(["T20", "T10", "HUNDRED", "OD"], "T20");
const GENDER = S.one(["male", "female"]), GENDER_M = S.one(["male", "female"], "male");
const PHASE = S.one(["powerplay", "middle", "death"], "middle"), THEME = S.one(["dark", "light"], "dark");
const obj = (properties: Row, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false });
const A = "Analytics", SM = "Simulation & modelling", GR = "Graphics";

export const TOOLS: Tool[] = [
  // forecasts
  { name: "list_matches", category: SM, input: obj({}),
    description: "Upcoming matches with published forecasts: teams, date and time (IST), venue, win chances, projected scores.",
    run: async (a) => {
      const cs = (await cards(a)).map((m, i) => [m, i] as [Row, number]).sort((x, y) =>
        (x[0].date || "9999") < (y[0].date || "9999") ? -1 : (x[0].date || "9999") > (y[0].date || "9999") ? 1
          : (x[0].start_time || "") < (y[0].start_time || "") ? -1 : (x[0].start_time || "") > (y[0].start_time || "") ? 1 : x[1] - y[1]).map((x) => x[0]);
      return { matches: cs.map((m) => ({
        id: m.id, title: m.title || m.teams.map((t: Row) => t.name).join(" v "), format: m.format, competition: m.competition ?? null,
        venue: m.venue ?? null, date: m.date ?? null, start_time_ist: m.start_time ?? null,
        win: Object.fromEntries(Object.entries<number>(m.win).map(([k, v]) => [k, pct(v)])),
        projected_first_innings: Object.fromEntries(m.teams.map((t: Row, i: number) => [t.name, (m.projected || [])[i]]).filter((x: any[]) => x[1] !== undefined)),
        link: link(m.id) })) };
    } },
  { name: "match_forecast", category: SM, input: obj({ match: MATCH }),
    description: "Pre-match forecast: win chances (overall and by who bats first), projected scores with 80% ranges, phase-by-phase runs and wickets, likely top performers, winning margins and the main talking points.",
    run: async (a, x) => {
      const [, d] = await doc(a, x.match);
      const s = d.summary, m = d.match, res = s.result;
      const teams = (s.teams as Row[]).map((t) => {
        const b = t.batting;
        const bat = sortDesc((t.players as Row[]).filter((p) => p.batting), (p) => p.batting.runs.mean).slice(0, 3);
        const bowl = sortDesc((t.players as Row[]).filter((p) => p.bowling), (p) => p.bowling.wickets.mean).slice(0, 3);
        return { name: t.name, projected_score: round(b.score.mean), score_80pct_range: range(b.score),
          wickets_lost_avg: round(b.wickets.mean, 1),
          phases: (b.phases as Row[]).map((ph) => ({ phase: ph.phase, overs: `${ph.overs[0]}-${ph.overs[1]}`, runs: round(ph.runs.mean),
                                                     wickets: round(ph.wickets.mean, 1), no_wicket: pct(ph.p_no_wicket) })),
          top_run_scorers: bat.map((p) => ({ name: p.name, runs_avg: round(p.batting.runs.mean), top_scorer: pct(p.batting.p_top_scorer),
                                             fifty: pct(p.batting.p_at_least["50"]) })),
          top_wicket_takers: bowl.map((p) => ({ name: p.name, wickets_avg: round(p.bowling.wickets.mean, 1),
                                                two_plus: pct(p.bowling.p_wickets["2"]), economy: p.bowling.economy })) };
      });
      return {
        match: { id: m.id, title: m.title ?? null, format: m.format, competition: m.competition ?? null, venue: m.venue ?? null,
                 date: m.date ?? null, start_time_ist: m.start_time ?? null },
        win: Object.fromEntries(Object.entries<number>(res.win).map(([k, v]) => [k, pct(v)])), tie: pct(res.tie),
        win_margin_of_error: Object.fromEntries(Object.entries<number>(res.win_ci95 || {}).map(([k, v]) => [k, `±${fixed(100 * v, 1)} pts`])),
        win_by_who_bats_first: (res.by_toss || []).map((y: Row) => ({ batting_first: y.batting_first,
          win: Object.fromEntries(Object.entries<number>(y.win).map(([k, v]) => [k, pct(v)])) })),
        margin_if_batting_side_wins_runs: { median: res.margin_runs.q["50"] ?? null, range_80pct: range(res.margin_runs) },
        margin_if_chasing_side_wins_wickets: { median: res.margin_wickets.q["50"] ?? null },
        teams, talking_points: (d.insights || []).map((i: Row) => i.text), generated_at: d.generated_at ?? null, link: link(m.id) };
    } },
  { name: "player_outlook", category: SM, input: obj({ player: S.str("Player name (or part of it)"), match: MATCH }, ["player"]),
    description: "One player's simulated outlook in a match: batting slot, runs (median and range), chances of 30/50/100, duck, top-scoring, how they get out and to whom; bowling overs, wickets, economy and chance of being best bowler.",
    run: async (a, x) => {
      const [card, d] = await doc(a, x.match);
      const [t, p] = findInMatch(d, x.player);
      const out: Row = { player: p.name, team: d.summary.teams[t].name, match: card.id };
      const b = p.batting;
      if (b) {
        out.batting = { slot: b.slot, chance_bats: pct(b.p_bats), runs_avg: round(b.runs.mean, 1), runs_median: b.runs.q["50"] ?? null,
          runs_80pct_range: range(b.runs), balls_median: b.balls.q["50"] ?? null, strike_rate: b.strike_rate,
          chance_at_least: Object.fromEntries(Object.entries<number>(b.p_at_least).map(([k, v]) => [k, pct(v)])), duck: pct(b.p_duck),
          top_scorer: pct(b.p_top_scorer),
          how_out: Object.fromEntries(sortDesc(Object.entries<number>(b.how_out), (kv) => kv[1]).filter(([, v]) => v >= 0.02).map(([k, v]) => [k, pct(v)])),
          most_likely_dismissed_by: (b.dismissed_by as Row[]).slice(0, 3).map((y) => ({ bowler: y.name, chance: pct(y.p) })) };
      }
      const w = p.bowling;
      if (w) {
        out.bowling = { chance_bowls: pct(w.p_bowls), overs_avg: w.overs, wickets_avg: round(w.wickets.mean, 2),
          chance_wickets: Object.fromEntries(Object.entries<number>(w.p_wickets).map(([k, v]) => [k, pct(v)])), economy: w.economy,
          runs_conceded_80pct_range: range(w.runs), best_bowler: pct(w.p_best_bowler) };
      }
      const prof = p.profile || {};
      out.profile = Object.fromEntries(["hand", "bowling_kind", "in_this_format"].filter((k) => prof[k] != null).map((k) => [k, prof[k]]));
      if (!p.known) out.note = "Little or no recorded data for this player; the outlook leans on typical values for the role.";
      return out;
    } },
  { name: "key_matchups", category: SM, input: obj({ match: MATCH, limit: S.int(1, 30, 10) }),
    description: "Batter-v-bowler duels most likely to decide the match: the chance each bowler dismisses each batter.",
    run: async (a, x) => {
      const [card, d] = await doc(a, x.match);
      const idx = playerIndex(d);
      const name = (pid: string) => idx.get(pid)?.[1].name ?? pid;
      const rows = sortDesc(d.summary.matchups as Row[], (r) => r.p).slice(0, x.limit ?? 10);
      return { match: card.id, matchups: rows.map((r) => ({ batter: name(r.batter), bowler: name(r.bowler), chance_bowler_dismisses_batter: pct(r.p) })) };
    } },
  { name: "innings_shape", category: SM, input: obj({ match: MATCH }),
    description: "How each innings is expected to unfold over by over: median score and 50%/80% bands at the end of each over, runs and wicket chance per over, and when each wicket typically falls.",
    run: async (a, x) => {
      const [card, d] = await doc(a, x.match);
      return { match: card.id, teams: (d.summary.teams as Row[]).map((t) => {
        const b = t.batting;
        return { team: t.name,
          by_over: (b.per_over as Row[]).map((o) => ({ over: o.over, runs: round(o.runs, 1), wicket_chance: pct(o.p_wicket) })),
          cumulative_score_bands: (b.fan || []).map((f: Row) => Object.fromEntries(["over", "q10", "q25", "q50", "q75", "q90"].map((k) => [k, f[k] ?? null]))),
          fall_of_wickets: (b.fall_of_wickets as Row[]).filter((f) => f.p >= 0.05).map((f) => ({ wicket: f.wicket, chance_falls: pct(f.p),
            median_over: (f.over || {}).q?.["50"] ?? null, median_score: (f.score || {}).q?.["50"] ?? null })) };
      }) };
    } },
  { name: "toss_decision", category: SM, input: obj({ match: MATCH }),
    description: "Bat or bowl: each side's win chance batting first and chasing, the better choice and by how much.",
    run: async (a, x) => {
      const [card, d] = await doc(a, x.match);
      const by: Row[] = d.summary.result.by_toss || [];
      const names: string[] = d.summary.teams.map((t: Row) => t.name);
      if (by.length === 1) {
        return { match: card.id, decided: true, batting_first: by[0].batting_first,
                 note: `The toss is done: ${by[0].batting_first} bat first. The forecast already assumes it.` };
      }
      if (by.length < 2) throw new ToolError("No toss split published for this match.");
      const win = (bf: string, t: string) => by.find((y) => y.batting_first === bf)?.win?.[t];
      return { match: card.id, teams: names.map((t, i) => {
        const bat = win(t, t), chase = win(names[1 - i], t);
        return { team: t, win_batting_first: round(bat, 3), win_chasing: round(chase, 3), choose: bat > chase ? "bat" : "bowl",
                 edge: round(Math.abs(bat - chase), 3) };
      }) };
    } },
  { name: "fantasy_picks", category: SM, input: obj({ match: MATCH }),
    description: "Published fantasy projections for a covered match: each player's expected points and role, with the suggested team, captain and vice-captain.",
    run: async (a, x) => {
      const [card, d] = await doc(a, x.match);
      if (!d.fantasy) throw new ToolError("No fantasy projections are published for this match yet.");
      return { match: card.id, ...d.fantasy, link: link(card.id) };
    } },
  { name: "about_the_model", category: SM, input: obj({ match: MATCH }),
    description: "How the forecast is made and how much to trust it: the kind of model, the format and when it was generated.",
    run: async (a, x) => {
      const [, d] = await doc(a, x.match);
      return { method: "A ball-by-ball outcome model (dot, 1-6, wicket, extras) fitted on recorded deliveries, with player, venue and " +
                       "situation effects. Each match is simulated in full many times; every number is a share of those simulations.",
               format: d.summary.meta.format, model_version: d.model ?? null, generated_at: d.generated_at ?? null };
    } },
  // analytics
  { name: "search_players", category: A, input: obj({ query: S.str("Part of a name, e.g. 'Kohli' or 'Smith'"), limit: S.int(1, 50, 10) }, ["query"]),
    description: "Find players by name: ids, gender, batting hand, bowling type and how much data the model has on them.",
    run: async (a, x) => a.searchPlayers(x.query, x.limit ?? 10) },
  { name: "player_rating", category: A, input: obj({ player: PLAYER, format: FORMAT }, ["player"]),
    description: "A player's model rating: wicket, four and six multipliers batting and bowling against an average player (1.0 = average), with the balls behind them in short formats and one-day cricket.",
    run: async (a, x) => (await a.kit()).rating(await a.resolvePlayer(x.player), x.format ?? "T20") },
  { name: "player_phases", category: A, input: obj({ player: PLAYER, format: FORMAT_ALL, gender: GENDER }, ["player"]),
    description: "Batting and bowling by powerplay, middle and death overs: strike rate, balls per dismissal, dot and boundary rates, economy, balls per wicket, each also as a ratio to an average player.",
    run: async (a, x) => { const p = await a.resolvePlayer(x.player); return (await a.kit()).phase_profile(p, x.format ?? "T20", g(p, x.gender)); } },
  { name: "player_vs_bowling", category: A, input: obj({ player: PLAYER, format: FORMAT_ALL, phase: PHASE, gender: GENDER }, ["player"]),
    description: "A batter against each bowling type (right/left-arm pace, off-spin, leg-spin, left-arm orthodox and wrist spin): strike rate and balls per dismissal, with the strongest and weakest match-up.",
    run: async (a, x) => { const p = await a.resolvePlayer(x.player); return (await a.kit()).vs_bowling(p, x.format ?? "T20", g(p, x.gender), x.phase ?? "middle"); } },
  { name: "bowler_vs_batting_hand", category: A, input: obj({ player: PLAYER, format: FORMAT_ALL, phase: PHASE, gender: GENDER }, ["player"]),
    description: "A bowler against right- and left-handed batters: economy, balls per wicket, dot and boundary rates.",
    run: async (a, x) => { const p = await a.resolvePlayer(x.player); return (await a.kit()).vs_batting_hand(p, x.format ?? "T20", g(p, x.gender), x.phase ?? "middle"); } },
  { name: "player_situations", category: A, input: obj({ player: PLAYER, format: FORMAT_ALL, gender: GENDER }, ["player"]),
    description: "How a batter's scoring and survival change from the first ball to being set, and when chasing at different required run rates.",
    run: async (a, x) => { const p = await a.resolvePlayer(x.player); return (await a.kit()).situations(p, x.format ?? "T20", g(p, x.gender)); } },
  { name: "player_formats", category: A, input: obj({ player: PLAYER, gender: GENDER }, ["player"]),
    description: "The same player in T20 and one-day cricket, batting and bowling, with the data behind each.",
    run: async (a, x) => { const p = await a.resolvePlayer(x.player); return (await a.kit()).format_split(p, g(p, x.gender)); } },
  { name: "player_role", category: A, input: obj({ player: PLAYER, format: FORMAT }, ["player"]),
    description: "Usual batting position and role, overs per match and when they're bowled (powerplay / middle / death), matches and when last played.",
    run: async (a, x) => (await a.kit()).role(await a.resolvePlayer(x.player), x.format ?? "T20") },
  { name: "similar_players", category: A, input: obj({ player: PLAYER, format: FORMAT, side: S.one(["batting", "bowling"], "batting") }, ["player"]),
    description: "The ten players with the most similar style (outcome rates by phase and bowling type or batting hand).",
    run: async (a, x) => a.similar(await a.resolvePlayer(x.player), x.format ?? "T20", x.side ?? "batting") },
  { name: "compare_players", category: A, input: obj({ players: S.list(2, 8, "Names or ids"), format: FORMAT_ALL, gender: GENDER }, ["players"]),
    description: "Two to eight players side by side, batting and bowling by phase, with the average player for reference.",
    run: async (a, x) => { const ps = await Promise.all((x.players as string[]).map((q) => a.resolvePlayer(q))); return (await a.kit()).compare(ps, x.format ?? "T20", g(ps[0], x.gender)); } },
  { name: "rankings", category: A,
    input: obj({ side: S.one(["batting", "bowling"], "batting"), format: FORMAT, gender: GENDER_M, phase: PHASE,
                 sort: S.one(["impact", "strike_rate", "balls_per_dismissal", "boundary_pct", "six_pct", "dot_pct", "economy", "balls_per_wicket", "extras_per_over"], "impact"),
                 limit: S.int(1, 100, 25), min_balls: { type: "integer", minimum: 500, default: 500 } }),
    description: "Model leaderboard of active players (played in the last two years, 500+ balls). Impact = runs added (batting) or saved (bowling) per 120 balls against an average player, each wicket priced at a typical run value.",
    run: async (a, x) => a.rankings(x.side ?? "batting", x.format ?? "T20", x.gender ?? "male", x.phase ?? "middle", x.sort ?? "impact", x.limit ?? 25, x.min_balls ?? 500) },
  { name: "matchup", category: A, input: obj({ batter: PLAYER, bowler: PLAYER, format: FORMAT_ALL, phase: PHASE, gender: GENDER }, ["batter", "bowler"]),
    description: "Batter v bowler, ball by ball: chance of each outcome, strike rate, balls per dismissal, dot and boundary rates, and the edge against an average pairing.",
    run: async (a, x) => { const b = await a.resolvePlayer(x.batter), w = await a.resolvePlayer(x.bowler); return (await a.kit()).matchup(b, w, x.format ?? "T20", g(b, x.gender), x.phase ?? "middle"); } },
  { name: "matchup_grid", category: A, input: obj({ batters: S.list(1, 11, "Names or ids"), bowlers: S.list(1, 11, "Names or ids"), format: FORMAT_ALL, phase: PHASE, gender: GENDER }, ["batters", "bowlers"]),
    description: "Every batter against every bowler: strike rate, balls per dismissal and wicket / scoring edges.",
    run: async (a, x) => {
      const bs = await Promise.all((x.batters as string[]).map((q) => a.resolvePlayer(q)));
      const ws = await Promise.all((x.bowlers as string[]).map((q) => a.resolvePlayer(q)));
      return (await a.kit()).matchup_grid(bs, ws, x.format ?? "T20", g(bs[0], x.gender), x.phase ?? "middle");
    } },
  { name: "best_bowler_against", category: A, input: obj({ batter: PLAYER, candidates: S.list(1, 15, "Bowler names or ids"), format: FORMAT_ALL, phase: PHASE, gender: GENDER }, ["batter", "candidates"]),
    description: "Which of these bowlers to use against a batter: ranked by net runs per over with wickets priced in.",
    run: async (a, x) => {
      const b = await a.resolvePlayer(x.batter);
      const cs = await Promise.all((x.candidates as string[]).map((q) => a.resolvePlayer(q)));
      return (await a.kit()).counter(b, cs, x.format ?? "T20", g(b, x.gender), x.phase ?? "middle");
    } },
  { name: "venues", category: A, input: obj({ search: S.str("Name or city"), limit: S.int(1, 100, 20) }),
    description: "Grounds the model knows, with city and matches; search by name or city.",
    run: async (a, x) => a.venues(x.search, x.limit ?? 20) },
  { name: "venue_profile", category: A, input: obj({ venue: S.str("Venue name, city or id"), format: FORMAT, gender: GENDER_M }, ["venue"]),
    description: "How a ground plays: runs per over, balls per wicket and boundary rate by phase against a neutral ground, and its character (high / low scoring, bowler / batting friendly).",
    run: async (a, x) => a.venueProfile(x.venue, x.format ?? "T20", x.gender ?? "male") },
  { name: "competitions", category: A, input: obj({ search: S.str("Name or key"), limit: S.int(1, 100, 20) }),
    description: "Leagues and series the model knows: format, gender, matches and the latest season.",
    run: async (a, x) => a.competitions(x.search, x.limit ?? 20) },
  { name: "competition_profile", category: A, input: obj({ competition: S.str("Competition name or key, e.g. 'IPL'") }, ["competition"]),
    description: "How a competition plays compared with neutral conditions: scoring and wicket indices by phase.",
    run: async (a, x) => a.competitionProfile(x.competition) },
  { name: "scoring_trend", category: A, input: obj({ format: FORMAT, gender: GENDER_M }),
    description: "Runs per over, balls per wicket and boundary rate by phase, season by season, plus the model's current level.",
    run: async (a, x) => a.scoringTrend(x.format ?? "T20", x.gender ?? "male") },
  { name: "teams", category: A, input: obj({ search: S.str("Team name"), gender: GENDER, limit: S.int(1, 100, 20) }),
    description: "Teams the model knows (international and franchise), with formats and last match.",
    run: async (a, x) => a.teams(x.search, x.gender, x.limit ?? 20) },
  { name: "team_profile", category: A, input: obj({ team: S.str("Team name or id; its latest XI is used"), players: S.list(11, 11, "Or any 11 players in batting order"), format: FORMAT, gender: GENDER }),
    description: "A side's batting (each position v average, survival against spin and pace, left-handers in the top seven) and bowling (options by type, economy and strike by phase). Give a team or any XI.",
    run: async (a, x) => a.teamProfile({ team: x.team, fmt: x.format ?? "T20", gender: x.gender,
      players: x.players ? await Promise.all((x.players as string[]).map((q) => a.resolvePlayer(q))) : null }) },
  // graphics
  { name: "match_graphic", category: GR,
    input: obj({ card: S.one(["win", "scores", "worm", "phases", "duels", "wickets", "player"], "win"), match: MATCH,
                 team: S.str("For 'wickets'"), player: S.str("For 'player'"), theme: THEME }),
    description: "A 1200x675 SVG card for a covered match: win probability, score distributions, run worm, phases, key duels, wicket timing for a team, or one player's outlook. Returned as SVG text.",
    run: async (a, x) => {
      const [card, d] = await doc(a, x.match);
      const kind = x.card ?? "win", theme = x.theme ?? "dark";
      let svg: string | null;
      if (kind === "wickets") {
        let t = 0;
        if (x.team) {
          const q = String(x.team).trim().toLowerCase();
          t = d.summary.teams.findIndex((tm: Row) => tm.name.toLowerCase().includes(q));
          if (t < 0) throw new ToolError(`No team '${x.team}' in this match: ${d.summary.teams[0].name} or ${d.summary.teams[1].name}.`);
        }
        svg = G.wickets_card(d, t, theme, true);
      } else if (kind === "player") {
        if (!x.player) throw new ToolError("Name the player for a player card.");
        svg = G.player_card(d, findInMatch(d, x.player)[1].id, theme, true);
      } else svg = G.CARDS[kind](d, theme, true);
      return { name: `${card.id}-${kind}`, format: "image/svg+xml", size: "1200x675", svg };
    } },
  { name: "analytics_graphic", category: GR,
    input: obj({ card: S.one(["player", "matchup", "venue", "trend"]), player: S.str("Player (the batter for 'matchup')"), bowler: S.str("For 'matchup'"),
                 venue: S.str("For 'venue'"), format: FORMAT, gender: GENDER_M, theme: THEME }, ["card"]),
    description: "A 1200x675 SVG card from the model: a player's phase profile, a batter-v-bowler match-up (player = batter), a venue profile or the scoring trend. Returned as SVG text.",
    run: async (a, x) => {
      const k = await a.kit(), f = x.format ?? "T20", gd = x.gender ?? "male", theme = x.theme ?? "dark";
      const out = (name: string, svg: string) => ({ name, format: "image/svg+xml", size: "1200x675", svg });
      if (x.card === "player") {
        const p = await a.resolvePlayer(x.player || "");
        const prof = k.phase_profile(p, f, g(p, null));
        return out(`player-${prof.player.name}`, G.player_profile_card(prof, theme, true));
      }
      if (x.card === "matchup") {
        if (!(x.player && x.bowler)) throw new ToolError("Give player (the batter) and bowler.");
        const b = await a.resolvePlayer(x.player), w = await a.resolvePlayer(x.bowler);
        const mu = k.matchup(b, w, f, g(b, null), "middle");
        return out(`matchup-${mu.batter.name}-v-${mu.bowler.name}`, G.matchup_card(mu, theme, true));
      }
      if (x.card === "venue") {
        const v = await a.venueProfile(x.venue || "", f, gd);
        return out(`venue-${v.venue.id}`, G.venue_card(v, theme, true));
      }
      return out(`trend-${f}-${gd}`, G.trend_card(await a.scoringTrend(f, gd), theme, true));
    } },
];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Light argument checks against the tool's schema (types, enums, bounds, required). */
function check(t: Tool, args: Row): Row {
  const props: Row = t.input.properties || {};
  for (const k of t.input.required || []) if (args[k] == null || args[k] === "") throw new ToolError(`'${k}' is required.`);
  for (const [k, v] of Object.entries(args)) {
    const s = props[k];
    if (!s) throw new ToolError(`Unknown argument '${k}'.`);
    if (v == null) continue;
    if (s.type === "string" && typeof v !== "string") throw new ToolError(`'${k}' must be text.`);
    if (s.type === "string" && v.length > 200) throw new ToolError(`'${k}' is too long.`);
    if (s.enum && !s.enum.includes(v)) throw new ToolError(`'${k}' must be one of: ${s.enum.join(", ")}.`);
    if (s.type === "integer" && (!Number.isInteger(v) || (s.minimum != null && v < s.minimum) || (s.maximum != null && v > s.maximum))) {
      throw new ToolError(`'${k}' must be a whole number${s.minimum != null ? ` from ${s.minimum}` : ""}${s.maximum != null ? ` to ${s.maximum}` : ""}.`);
    }
    if (s.type === "array" && (!Array.isArray(v) || v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? 1e9) || v.some((y) => typeof y !== "string"))) {
      throw new ToolError(`'${k}' must be a list of ${s.minItems}–${s.maxItems} names.`);
    }
  }
  return args;
}

export function toolList(): Row[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input,
                             annotations: { readOnlyHint: true, openWorldHint: true } }));
}

/** Run one tool; errors a user can fix come back as tool errors (isError), not protocol errors. */
export async function callTool(a: Analytics, name: string, args: Row): Promise<Row> {
  const t = BY_NAME.get(name);
  if (!t) throw new RpcError(-32602, `Unknown tool '${name}'`);
  try {
    const out = await t.run(a, check(t, args || {}));
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  } catch (e) {
    if (e instanceof ToolError || e instanceof NotFound || e instanceof BadRequest) {
      const msg = e instanceof NotFound && e.message.startsWith("404") ? "Not found in the published data." : e.message;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    throw e;
  }
}

export const toolCategory = (name: string) => BY_NAME.get(name)?.category ?? A;

export class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) { super(message); this.code = code; }
}

/** One JSON-RPC message → its response (null for notifications). `allow` is checked before each tools/call. */
export async function handle(a: Analytics, msg: Row, allow: (tool: string) => Promise<string | null>): Promise<Row | null> {
  const id = msg?.id;
  const isNote = id === undefined || id === null;
  const reply = (result: Row) => (isNote ? null : { jsonrpc: "2.0", id, result });
  const error = (code: number, message: string) => (isNote ? null : { jsonrpc: "2.0", id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return error(-32600, "Invalid request");
  try {
    switch (msg.method) {
      case "initialize": {
        const want = msg.params?.protocolVersion;
        return reply({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
                       capabilities: { tools: { listChanged: false } },
                       serverInfo: { name: "CricSynthesis", title: "CricSynthesis", version: VERSION, websiteUrl: SITE },
                       instructions: INSTRUCTIONS });
      }
      case "ping": return reply({});
      case "tools/list": return reply({ tools: toolList() });
      case "tools/call": {
        const name = msg.params?.name;
        if (typeof name !== "string") return error(-32602, "params.name is required");
        const refused = await allow(name);
        if (refused) return reply({ content: [{ type: "text", text: refused }], isError: true });
        return reply(await callTool(a, name, msg.params?.arguments || {}));
      }
      case "resources/list": return reply({ resources: [] });
      case "prompts/list": return reply({ prompts: [] });
      default:
        if (msg.method.startsWith("notifications/")) return null;
        return error(-32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    if (e instanceof RpcError) return error(e.code, e.message);
    console.error(e);
    return error(-32603, "Something went wrong");
  }
}
