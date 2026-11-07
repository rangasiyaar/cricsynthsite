// Catalog-level analytics over the published kit (cricmcp/server.py and cricmcp/data.py, ported): player search,
// rankings, similar players, venues, competitions, teams and team profiles. Same arithmetic and shapes.
import { Kit, type Player } from "./insight.ts";
import { round } from "./py.ts";

type Row = Record<string, any>;

export class NotFound extends Error {}

const norm = (s: string) => s.toLowerCase().replace(/[.,'\-]/g, " ").split(/\s+/).filter(Boolean).join(" ");
/** 'v kohli' for 'virat kohli', 'rg sharma' for 'rohit sharma': same surname, first initial matches. */
const initials = (name: string, words: string[]) => {
  const t = name.split(" ");
  return t.length >= 2 && t[t.length - 1] === words[words.length - 1] && t[0][0] === words[0][0];
};

/** Where published files come from: R2 in production, the website or local files elsewhere. */
export interface Source { get(path: string): Promise<any> }

/** File name of a published id (cricsim.kit.safe_id). */
export const safeId = (pid: string): string => pid.replace(/[^A-Za-z0-9_.-]/g, "_");

export class Analytics {
  src: Source;
  edge: Source | null;              // prepared per-match answers (cricsim/edge.py), private to the Worker
  private kitP: Promise<Kit> | null = null;
  constructor(src: Source, edge: Source | null = null) { this.src = src; this.edge = edge; }

  file(path: string): Promise<any> { return this.src.get(`analytics/${path}`); }
  kit(): Promise<Kit> { return (this.kitP ??= this.file("context.json").then((c) => new Kit(c))); }
  player(pid: string): Promise<Player> { return this.file(`players/${safeId(pid)}.json`); }

  async playerOrStub(pid: string): Promise<Player> {
    try { return await this.player(pid); } catch (e) { if (e instanceof NotFound) return Kit.stub(pid); throw e; }
  }

  private search: { idx: any; rows: { rec: Row; names: string[] }[] } | null = null;
  /** The search index with names normalised once per isolate (it's re-read when the published file changes). */
  private async searchRows(): Promise<{ rec: Row; names: string[] }[]> {
    const idx = await this.file("players.json");
    if (this.search && this.search.idx === idx) return this.search.rows;
    const fields: string[] = idx.fields;
    const rows = (idx.players as any[][]).map((row) => {
      const rec: Row = {};
      fields.forEach((f, i) => { rec[f] = row[i]; });
      return { rec, names: [rec.name || "", ...(rec.aka || [])].map(norm) };
    });
    this.search = { idx, rows };
    return rows;
  }

  /** Players matching the query by name or another name they're known by ("Virat Kohli" finds Cricsheet's
   * "V Kohli"): an id, then an exact name, then prefix or every word, then surname plus first initial; the most
   * experienced first. An exact namesake with little data gives way to an established player the query also fits. */
  async findPlayers(query: string, limit = 10): Promise<Row[]> {
    const rows = await this.searchRows();
    const q = norm(query);
    const words = q.split(" ").filter(Boolean);
    const hits: [number, number, Row][] = [];
    for (const { rec, names } of rows) {
      let rank: number;
      if (rec.id.toLowerCase() === q) rank = 0;
      else if (names.includes(q)) rank = 1;
      else if (names.some((n) => n.startsWith(q)) || (words.length > 0 && names.some((n) => words.every((w) => n.includes(w))))) rank = 2;
      else if (words.length >= 2 && names.some((n) => initials(n, words))) rank = 3;
      else continue;
      hits.push([rank, -rec.balls, rec]);
    }
    // an exact namesake with little data gives way to an established player the query also fits ("Rohit Sharma")
    const top = hits.filter((h) => h[0] >= 2).reduce<[number, number] | null>((t, h) => (!t || -h[1] > t[0] ? [-h[1], h[0]] : t), null);
    if (top) for (const h of hits) if (h[0] === 1 && top[0] >= 2000 && -h[1] * 10 < top[0]) h[0] = top[1];
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return hits.slice(0, limit).map((h) => { const { aka: _aka, ...rest } = h[2]; return rest; });
  }

  /** A player by id first, else by name (the MCP tools accept either). */
  async resolvePlayer(query: string): Promise<Player> {
    const hits = await this.findPlayers(query, 5);
    if (!hits.length) throw new NotFound(`No player matches '${query}'. Try search_players with part of the name.`);
    return this.player(hits[0].id);
  }

  async searchPlayers(query: string, limit = 10): Promise<Row> {
    return { players: (await this.findPlayers(query, limit)).map((x) => ({ ...x, balls: Math.trunc(x.balls) })) };
  }

  async name(pid: string): Promise<string> {
    try { return (await this.player(pid)).name; } catch (e) { if (e instanceof NotFound) return pid; throw e; }
  }

  async similar(p: Player, fmt = "T20", side = "batting", limit = Infinity): Promise<Row> {
    const rows: [string, number][] | undefined = ((p.similar || {})[fmt] || {})[side];
    if (!rows || !rows.length) {
      return { player: Kit.who(p), format: fmt, side, similar: [],
               note: `Not enough ${side} data in ${fmt} (300 balls) to compare styles.` };
    }
    const similar = await Promise.all(rows.slice(0, limit).map(async ([pid, d]) =>
      ({ id: pid, name: await this.name(pid), similarity: round(1 / (1 + d), 3) })));
    return { player: Kit.who(p), format: fmt, side, similar };
  }

  async rankings(side: string, fmt = "T20", gender = "male", phase = "middle", sort = "impact", limit = 25,
                 minBalls = 500): Promise<Row> {
    const rk = await this.file(`rankings/${fmt}-${gender}-${side}-${phase}.json`);
    let rows: Row[] = (rk.players as Row[]).filter((x) => (x.balls || 0) >= minBalls);
    const ascending = side === "batting" ? new Set(["dot_pct"])
      : new Set(["economy", "balls_per_wicket", "boundary_pct", "extras_per_over"]);
    let key: (x: Row) => number;
    if (sort === "impact") key = (x) => -(x.impact_per_120 || 0);
    else if (ascending.has(sort)) key = (x) => (x[sort] != null ? x[sort] : 1e9);
    else key = (x) => -(x[sort] || 0);
    rows = rows.map((x, i) => [x, i] as [Row, number]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1])
      .map((x) => x[0]).slice(0, limit);
    const head: Row = {};
    for (const k of ["format", "gender", "side", "phase", "average"]) if (k in rk) head[k] = rk[k];
    return { ...head, sort, players: rows.map((x, i) => {
      const { rank: _rank, ...rest } = x;
      return { ...rest, rank: i + 1 };
    }) };
  }

  async venues(search?: string | null, limit = 20): Promise<Row> {
    let rows: Row[] = (await this.file("venues.json")).venues;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((v) => v.id.toLowerCase().includes(q) || (v.name || "").toLowerCase().includes(q)
        || (v.city || "").toLowerCase().includes(q));
    }
    return { venues: rows.slice(0, limit) };
  }

  /** A venue's profile; `exact` takes an id only (the API), else the best match for a name, city or id (MCP). */
  async venueProfile(venue: string, fmt = "T20", gender = "male", exact = false): Promise<Row> {
    let id = venue;
    if (!exact) {
      const rows = (await this.venues(venue, 1)).venues;
      if (!rows.length) throw new NotFound(`No venue matches '${venue}'.`);
      id = rows[0].id;
    }
    const prof = (await this.file(`venues/${safeId(id)}.json`))[`${fmt}:${gender}`];
    if (!prof) throw new NotFound(`No ${fmt} ${gender} profile for ${id}.`);
    return prof;
  }

  async competitions(search?: string | null, limit = 20): Promise<Row> {
    let rows: Row[] = (await this.file("competitions.json")).competitions;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((c) => c.key.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q));
    }
    return { competitions: rows.slice(0, limit) };
  }

  async competitionProfile(competition: string, exact = false): Promise<Row> {
    let key = competition;
    if (!exact) {
      const rows = (await this.competitions(competition, 1)).competitions;
      if (!rows.length) throw new NotFound(`No competition matches '${competition}'.`);
      key = rows[0].key;
    }
    return this.file(`competitions/${safeId(key)}.json`);
  }

  scoringTrend(fmt = "T20", gender = "male"): Promise<Row> { return this.file(`trends/${fmt}-${gender}.json`); }

  async teams(search?: string | null, gender?: string | null, limit = 20): Promise<Row> {
    const cat: Row = (await this.file("teams.json")).teams;
    const rows: Row[] = [];
    for (const [tid, t] of Object.entries<Row>(cat)) {
      if (search && !tid.toLowerCase().includes(search.toLowerCase()) && !(t.name || "").toLowerCase().includes(search.toLowerCase())) continue;
      if (gender && t.gender !== gender) continue;
      const lasts = Object.values<Row>(t.formats).map((v) => v.last || "");
      rows.push({ id: tid, name: t.name ?? null, gender: t.gender ?? null, formats: Object.keys(t.formats).sort(),
                  last_match: lasts.length ? lasts.reduce((a, b) => (b > a ? b : a)) : "" });
    }
    const order = rows.map((x, i) => [x, i] as [Row, number]);
    order.sort((a, b) => (a[0].last_match < b[0].last_match ? 1 : a[0].last_match > b[0].last_match ? -1 : a[1] - b[1]));
    return { teams: order.map((x) => x[0]).slice(0, limit) };
  }

  /** A side's batting and bowling profile, from a team (its latest XI; `exact`: an id only) or any eleven players. */
  async teamProfile(o: { team?: string | null; players?: Player[] | null; fmt?: string; gender?: string | null;
                         bowlers?: Player[] | null; exact?: boolean }): Promise<Row> {
    const k = await this.kit();
    const fmt = o.fmt || "T20";
    let gender = o.gender ?? null, info: Row | null = null, xi: Player[];
    if (o.players) {
      if (o.players.length !== 11) throw new BadRequest("Give exactly 11 players.");
      xi = o.players;
    } else {
      if (!o.team) throw new BadRequest("Give a team or 11 players.");
      const cat: Row = (await this.file("teams.json")).teams;
      const q = o.team.toLowerCase();
      const tid = Object.keys(cat).find((t) => t.toLowerCase() === q) ?? (o.exact ? undefined
        : Object.entries<Row>(cat).find(([t, v]) => t.toLowerCase().includes(q) || (v.name || "").toLowerCase().includes(q))?.[0]);
      if (!tid) throw new NotFound(`No team matches '${o.team}'.`);
      info = cat[tid];
      const f = info!.formats[fmt] ?? Object.values<Row>(info!.formats)[0];
      const ids: string[] = f.last_xi || [];
      if (ids.length !== 11) throw new NotFound(`No full XI on record for ${info!.name}.`);
      xi = await Promise.all(ids.map((pid) => this.playerOrStub(pid)));
      gender = gender || info!.gender;
    }
    let out = k.team_profile(xi, fmt, gender || xi[0].gender || "male", o.bowlers ?? null);
    if (info) out = { team: info.name ?? null, ...out };
    return out;
  }
}

export class BadRequest extends Error {}
