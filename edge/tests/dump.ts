// Answers a list of calls from a kit directory and prints them as JSON (cricmcp/tests/test_edge_parity.py).
//   node --experimental-strip-types tests/dump.ts <calls.json> <data dir>
import { readFileSync } from "node:fs";
import { Analytics } from "../src/analytics.ts";
import { FileSource } from "../src/files.ts";
import * as G from "../src/graphics.ts";

const [callsFile, dir] = process.argv.slice(2);
const calls: { fn: string; args: any[] }[] = JSON.parse(readFileSync(callsFile, "utf8"));
const src = new FileSource(dir);
const a = new Analytics(src);
const P = (q: string) => a.resolvePlayer(q);

async function run(fn: string, args: any[]): Promise<any> {
  const k = await a.kit();
  switch (fn) {
    case "search_players": return a.searchPlayers(args[0], args[1]);
    case "player_rating": return k.rating(await P(args[0]), args[1]);
    case "player_phases": { const p = await P(args[0]); return k.phase_profile(p, args[1], args[2] || p.gender || "male"); }
    case "player_vs_bowling": { const p = await P(args[0]); return k.vs_bowling(p, args[1], args[3] || p.gender || "male", args[2]); }
    case "bowler_vs_batting_hand": { const p = await P(args[0]); return k.vs_batting_hand(p, args[1], args[3] || p.gender || "male", args[2]); }
    case "player_situations": { const p = await P(args[0]); return k.situations(p, args[1], args[2] || p.gender || "male"); }
    case "player_formats": { const p = await P(args[0]); return k.format_split(p, args[1] || p.gender || "male"); }
    case "player_role": return k.role(await P(args[0]), args[1]);
    case "similar_players": return a.similar(await P(args[0]), args[1], args[2]);
    case "compare_players": { const ps = await Promise.all(args[0].map(P)); return k.compare(ps, args[1], args[2] || ps[0].gender || "male"); }
    case "rankings": return a.rankings(args[0], args[1], args[2], args[3], args[4], args[5]);
    case "matchup": { const b = await P(args[0]); return k.matchup(b, await P(args[1]), args[2], args[4] || b.gender || "male", args[3]); }
    case "matchup_grid": { const bs = await Promise.all(args[0].map(P)); const ws = await Promise.all(args[1].map(P));
      return k.matchup_grid(bs, ws, args[2], args[4] || bs[0].gender || "male", args[3]); }
    case "best_bowler_against": { const b = await P(args[0]); const cs = await Promise.all(args[1].map(P));
      return k.counter(b, cs, args[2], args[4] || b.gender || "male", args[3]); }
    case "venues": return a.venues(args[0], args[1]);
    case "venue_profile": return a.venueProfile(args[0], args[1], args[2]);
    case "competitions": return a.competitions(args[0], args[1]);
    case "competition_profile": return a.competitionProfile(args[0]);
    case "scoring_trend": return a.scoringTrend(args[0], args[1]);
    case "teams": return a.teams(args[0], args[1], args[2]);
    case "team_profile": return a.teamProfile({ team: args[0], players: args[1] ? await Promise.all(args[1].map(P)) : null,
      fmt: args[2], gender: args[3] });
    case "card": { const doc = await src.get(`matches/${args[0]}.json`); return args[1] === "wickets"
      ? G.wickets_card(doc, args[2], args[3], args[4]) : args[1] === "player" ? G.player_card(doc, args[2], args[3], args[4])
      : G.CARDS[args[1]](doc, args[3], args[4]); }
    case "profile_card": { const p = await P(args[0]); return G.player_profile_card(k.phase_profile(p, args[1], p.gender || "male"), args[2], args[3]); }
    case "matchup_card": { const b = await P(args[0]); return G.matchup_card(k.matchup(b, await P(args[1]), args[2], b.gender || "male", args[3]), args[4], args[5]); }
    case "venue_card": return G.venue_card(await a.venueProfile(args[0], args[1], args[2]), args[3], args[4]);
    case "trend_card": return G.trend_card(await a.scoringTrend(args[0], args[1]), args[2], args[3]);
  }
  throw new Error(`unknown call ${fn}`);
}

const out = [];
for (const c of calls) {
  try { out.push({ ok: await run(c.fn, c.args) }); } catch (e: any) { out.push({ error: String(e?.message || e) }); }
}
process.stdout.write(JSON.stringify(out));
