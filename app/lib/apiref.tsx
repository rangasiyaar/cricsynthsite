// Shared by /docs and /playground: the generated API reference, sample calls and small render helpers.
import examples from "@/data-static/api-examples.json";
import ref from "@/data-static/api-reference.json";

export const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

export type Field = { name: string; type: string; required: boolean; description: string; default?: unknown;
                      enum?: unknown[]; fields?: Field[] };
export type Param = Field & { in: string };
export type Endpoint = { id: string; category: string; method: string; path: string; summary: string; description: string;
                         returns: "json" | "svg"; params: Param[]; body: Field[] | null };
export type Example = { path: string; query: Record<string, unknown>; body: unknown; status: number; response: unknown };

export const ENDPOINTS = ref.endpoints as Endpoint[];
export const CATEGORIES = ref.categories as string[];
export const EXAMPLES = (examples as { examples: Record<string, Example> }).examples;

// descriptions for parameters shared by many endpoints
export const COMMON: Record<string, string> = {
  pid: "Player id (from /v1/players)", format: "T20, T10, HUNDRED (5-ball sets) or OD (50 overs)",
  gender: "male or female", phase: "powerplay, middle or death overs", theme: "dark or light",
  limit: "Maximum rows", q: "Search text", match_id: "Match id (from /v1/matches)", vid: "Venue id (from /v1/venues)",
  key: "Competition key (from /v1/competitions)", tid: "Team id (from /v1/teams)", n: "Simulations (capped by plan)",
  teams: "Two teams: each a team_id, or a name and 11 player ids in batting order", venue_id: "Venue id",
  comp_key: "Competition key", overs: "Reduced-overs match", state: "Current score: innings, batting side, runs, wickets, overs, target",
  ids: "Comma-separated player ids", batter: "Batter id", bowler: "Bowler id", min_balls: "Minimum balls of data",
  active_days: "Only players seen within this many days", sort: "Ranking order", side: "batting or bowling",
  team: "Team index (0 or 1)", innings: "1 or 2", batting: "Index of the batting side", runs: "Runs so far",
  wickets: "Wickets down", target: "Target in the second innings", pattern_id: "Pattern id (from /v1/patterns)",
  batters: "Comma-separated batter ids", bowlers: "Comma-separated bowler ids", candidates: "Comma-separated bowler ids",
  players: "11 player ids in batting order", scenario: "Conditions: boundary_mult, wicket_mult, spin/pace_wicket_mult, dew, form, excluded bowlers",
  base: "Baseline conditions (default: neutral)", roles: "Player id → WK, BAT, AR or BOWL", captain_rule: "mean or upside (90th percentile)",
  teams_count: "Teams in the portfolio", chasing: "Index of the chasing side", target_from: "First target", target_to: "Last target",
  step: "Gap between targets", out_player: "Player leaving the XI", in_player: "Player coming in", bowling_team: "Index of the bowling side",
  thresholds: "Totals to report chances for", position: "Batting position", opposition: "Opposition XI (11 ids)",
  conditions: "Filter simulations, e.g. team_score at_least", attributes: "Hand / bowling type for unknown players",
  batting_first: "Index of the side batting first",
};
export const describe = (f: { name: string; description?: string }) => f.description || COMMON[f.name] || "";

export function urlFor(ex: Example | undefined, ep: Endpoint): string {
  const path = ex?.path ?? ep.path;
  const q = new URLSearchParams(Object.entries(ex?.query ?? {}).map(([k, v]) => [k, String(v)])).toString();
  return `${API}${path}${q ? `?${q}` : ""}`;
}

export function curl(ep: Endpoint, url: string, body?: unknown, key = "cs_live_your_key"): string {
  const lines = [`curl${ep.method === "GET" ? "" : " -X " + ep.method} "${url}" \\`, `  -H "X-API-Key: ${key}"`];
  if (body !== undefined && body !== null) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "Content-Type: application/json" \\`, `  -d '${JSON.stringify(body, null, 2)}'`);
  }
  return lines.join("\n");
}

// JSON with the previous docs' highlight classes (.str .num .kw)
export function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? "";
  const parts = text.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g);
  return (
    <pre>{parts.map((p, i) => {
      if (i % 2 === 0) return p;
      if (p.startsWith('"')) return <span key={i} className={p.endsWith(":") ? "fn" : "str"}>{p}</span>;
      if (/^-?\d/.test(p)) return <span key={i} className="num">{p}</span>;
      return <span key={i} className="kw">{p}</span>;
    })}</pre>
  );
}

export function Svg({ markup }: { markup: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`} />;
}
