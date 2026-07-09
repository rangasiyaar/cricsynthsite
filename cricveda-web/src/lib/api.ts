const BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.cricsynthesis.in";
const KEY = process.env.CRICVEDA_API_KEY ?? "";

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/v1${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": KEY },
    next: { revalidate: 300 }, // ISR: revalidate every 5 min by default
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface UpcomingMatch {
  upcoming_id: number;
  league_id: string;
  match_date: string;
  team1: string;
  team2: string;
  venue_id: number | null;
  format: string;
  status: string;
  toss_winner: string | null;
  toss_decision: string | null;
}

export interface PlayerPrediction {
  player_id: number;
  player_name: string | null;
  team: string;
  role: string | null;
  predicted_points: number;
  credits: number;
  model_version: string;
}

export interface MatchPrediction {
  upcoming_id: number;
  team1: string;
  team2: string;
  match_date: string;
  players: PlayerPrediction[];
  win_probability_team1: number | null;
}

export interface DreamTeamPlayer {
  player_id: number;
  player_name: string | null;
  team: string;
  role: string | null;
  predicted_points: number;
  credits: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface DreamTeamResponse {
  upcoming_id: number;
  team1: string;
  team2: string;
  lineup: DreamTeamPlayer[];
  total_credits: number;
  projected_score: number;
}

export interface PlayerForm {
  player_id: number;
  name: string | null;
  role: string | null;
  batting_hand: string | null;
  bowling_style: string | null;
  nationality: string | null;
  matches_last_10: number;
  fp_last3_avg: number;
  fp_last5_avg: number;
  fp_last10_avg: number;
  fp_std5: number;
  fp_trend: "rising" | "falling" | "stable";
  bat_runs_avg5: number;
  bat_sr_avg5: number;
  bat_boundary_pct5: number;
  bowl_wkts_avg5: number;
  bowl_eco_avg5: number;
  recent_scores: Array<{
    match_id: number;
    match_date: string;
    vs: string;
    total_points: number;
    batting_points: number;
    bowling_points: number;
    fielding_points: number;
  }>;
}

export interface MatchupStats {
  player_id: number;
  matchup_type: string;
  strike_rate: number | null;
  economy_rate: number | null;
  sample_deliveries: number;
}

// ── API functions ──────────────────────────────────────────────────────────

export const getUpcomingMatches = (params?: { league_id?: string; format?: string; limit?: string }) =>
  apiFetch<UpcomingMatch[]>("/matches/upcoming", params as Record<string, string>);

export const getMatchPrediction = (id: number) =>
  apiFetch<MatchPrediction>(`/matches/${id}/prediction`);

export const getDreamTeam = (id: number) =>
  apiFetch<DreamTeamResponse>(`/matches/${id}/dream-team`);

export const getPlayerForm = (id: number) =>
  apiFetch<PlayerForm>(`/players/${id}/form`);

export const getPlayerMatchup = (id: number, type: string) =>
  apiFetch<MatchupStats>(`/players/${id}/vs/${type}`);
