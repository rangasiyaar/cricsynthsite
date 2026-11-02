// Evergreen pages that tie the match pages together (built at deploy from the published matches and results):
// /venues/{slug}/, /series/{slug}/, /teams/{a}-vs-{b}/ and /players/{slug}/. Server only.
import fs from "node:fs";
import path from "node:path";
import { matchIds, readMatch, readResult, resultIds } from "./build.ts";
import type { MatchDoc, ResultDoc } from "./types.ts";

export const slug = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Ireland tour of Namibia, 2026 · 2nd ODI" → "Ireland tour of Namibia 2026". */
export const seriesName = (comp?: string) => clean((comp ?? "").split(" · ")[0].replace(/,(\s*\d{4})/g, "$1"));
export const pairSlug = (a: string, b: string) => [slug(a), slug(b)].sort().join("-vs-");
export const playerSlug = (name: string, id: string) => `${slug(name)}-${id}`;
const PLAYER_ID = /^[0-9a-f]{8}$/;     // registry ids only; made-up ids of unknown players get no page

export const venuePath = (name: string) => `/venues/${slug(clean(name))}/`;
export const seriesPath = (name: string) => `/series/${slug(name)}/`;
export const pairPath = (a: string, b: string) => `/teams/${pairSlug(a, b)}/`;
export const playerPath = (name: string, id: string) => (PLAYER_ID.test(id) ? `/players/${playerSlug(name, id)}/` : null);

/** One match as the hub pages list it: our forecast, and the result once it is in. */
export type Row = {
  id: string; date?: string; time?: string; title: string; series: string; venue?: string; venueId?: string; format: string;
  teams: [string, string]; win: [number, number]; projected: [number | null, number | null];
  result?: ResultDoc | null; doc: MatchDoc;
};

let cache: Row[] | null = null;
export function rows(): Row[] {
  if (cache) return cache;
  const done = new Set(resultIds());
  cache = matchIds().flatMap((id) => {
    const d = readMatch(id);
    if (!d) return [];
    const t = d.summary.teams;
    const m = d.match as MatchDoc["match"] & { venue_id?: string };
    return [{ id, date: m.date, time: m.start_time, title: `${t[0].name} vs ${t[1].name}`, series: seriesName(m.competition),
      venue: m.venue ? clean(m.venue) : undefined, venueId: m.venue_id, format: d.summary.meta.format,
      teams: [t[0].name, t[1].name] as [string, string], win: [d.summary.result.win[t[0].name] ?? 0, d.summary.result.win[t[1].name] ?? 0] as [number, number],
      projected: [t[0].batting.score.mean, t[1].batting.score.mean] as [number | null, number | null],
      result: done.has(id) ? readResult(id) : null, doc: d }];
  }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
  return cache;
}

function group(key: (r: Row) => string | null | undefined) {
  const out = new Map<string, Row[]>();
  for (const r of rows()) { const k = key(r); if (k) out.set(k, [...(out.get(k) ?? []), r]); }
  return out;
}

export const venues = () => group((r) => r.venue && slug(r.venue));
export const series = () => group((r) => r.series && slug(r.series));
export const pairs = () => group((r) => pairSlug(...r.teams));

/** Every player in a published XI, with each match they are projected in. */
export type PlayerMatch = { row: Row; team: string; side: 0 | 1; runs: number | null; topScorer?: number; wickets: number | null;
                            bestBowler?: number; fantasy?: number; real?: number };
export type Player = { id: string; name: string; teams: string[]; hand?: string; bowling?: string; matches: PlayerMatch[] };
let pcache: Map<string, Player> | null = null;
export function players(): Map<string, Player> {
  if (pcache) return pcache;
  pcache = new Map();
  for (const r of rows()) {
    r.doc.summary.teams.forEach((t, side) => t.players.forEach((p) => {
      if (!PLAYER_ID.test(p.id)) return;
      const s = playerSlug(p.name, p.id);
      const pl = pcache!.get(s) ?? { id: p.id, name: p.name, teams: [], matches: [] };
      if (!pl.teams.includes(t.name)) pl.teams.push(t.name);
      pl.hand ??= p.profile?.hand; pl.bowling ??= p.profile?.bowling_kind;
      pl.matches.push({ row: r, team: t.name, side: side as 0 | 1, runs: p.batting?.runs.mean ?? null, topScorer: p.batting?.p_top_scorer,
        wickets: (p.bowling?.p_bowls ?? 0) > 0.5 ? p.bowling?.wickets.mean ?? null : null, bestBowler: p.bowling?.p_best_bowler,
        fantasy: r.doc.fantasy?.players[p.id]?.expected, real: r.result?.fantasy?.real[p.id] });
      pcache!.set(s, pl);
    }));
  }
  return pcache;
}

/** The model's view of a ground (the analytics kit, when it was published with the site). */
export type Ground = { character: string; scoring_index: number; wicket_index: number;
                       by_phase: Record<string, { runs_per_over: number; balls_per_wicket: number | null; boundary_pct: number | null }> };
export function ground(venueId: string | undefined, format: string, gender: string): Ground | null {
  if (!venueId) return null;
  try {
    const f = path.join(process.cwd(), "public", "data", "analytics", "venues", `${venueId.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`);
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    return d[`${format === "OD" ? "OD" : "T20"}:${gender}`] ?? null;
  } catch { return null; }
}

/** Not played yet (no result, and not before yesterday: an abandoned match never becomes "next"). */
export const upcoming = (r: Row) => !r.result && (r.date ?? "") >= new Date(Date.now() - 864e5).toISOString().slice(0, 10);

export const paramsOf = (m: Map<string, unknown>) => (m.size ? [...m.keys()] : ["_"]).map((slug) => ({ slug }));
