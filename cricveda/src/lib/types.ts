// ============================================================
// CricVeda — TypeScript Type Definitions
// ============================================================

// ─── DATABASE MODELS ───

export interface League {
  id: string;
  name: string;
  country: string | null;
  tier: 1 | 2 | 3;
  season_months: string | null;
  is_active: boolean;
}

export interface Venue {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  capacity: number | null;
  cricsheet_id: string | null;
  avg_1st_score: number | null;
  avg_2nd_score: number | null;
  pace_pct: number | null;
  spin_pct: number | null;
  toss_win_bat_pct: number | null;
  matches_count: number;
}

export interface Team {
  id: number;
  name: string;
  short_name: string | null;
  league_id: string;
  country: string | null;
  logo_url: string | null;
  is_active: boolean;
}

export interface Player {
  id: number;
  cricsheet_id: string;
  espncricinfo_id: string | null;
  name: string;
  full_name: string | null;
  country: string | null;
  dob: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  role: 'batter' | 'bowler' | 'allrounder' | 'wicketkeeper' | 'unknown';
  is_overseas: boolean;
  metadata_source: string;
  metadata_complete: boolean;
  t20_matches: number;
}

export interface Match {
  id: number;
  cricsheet_id: string | null;
  league_id: string;
  season: string | null;
  match_number: number | null;
  date: string;
  venue_id: number | null;
  team1_id: number;
  team2_id: number;
  toss_winner_id: number | null;
  toss_decision: 'bat' | 'field' | null;
  winner_id: number | null;
  result: string | null;
  result_margin: number | null;
  team1_score: number | null;
  team1_wickets: number | null;
  team2_score: number | null;
  team2_wickets: number | null;
  is_completed: boolean;
  is_ingested: boolean;
}

export interface Delivery {
  id: number;
  match_id: number;
  innings: 1 | 2;
  over_number: number;
  ball_number: number;
  batter_id: number;
  bowler_id: number;
  non_striker_id: number | null;
  runs_batter: number;
  runs_extras: number;
  runs_total: number;
  extra_type: string | null;
  is_wicket: boolean;
  wicket_kind: string | null;
  wicket_player_id: number | null;
  is_boundary: boolean;
  is_six: boolean;
  is_dot: boolean;
  phase: 'powerplay' | 'middle' | 'death';
}

export interface Fixture {
  id: number;
  league_id: string;
  season: string | null;
  match_number: number | null;
  date: string;
  time: string | null;
  venue_id: number | null;
  team1_id: number;
  team2_id: number;
  status: 'upcoming' | 'live' | 'completed';
  insights_ready: boolean;
  // Joined fields
  team1?: Team;
  team2?: Team;
  venue?: Venue;
  league?: League;
}

export interface PlayingXI {
  id: number;
  fixture_id: number;
  team_id: number;
  player_id: number;
  batting_order: number | null;
  is_captain: boolean;
  is_wk: boolean;
  status: 'predicted' | 'confirmed';
  player?: Player;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  is_admin: boolean;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_prefix: string;
  name: string;
  tier: 'free' | 'pro';
  daily_limit: number;
  calls_today: number;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

// ─── ANALYTICS TYPES ───

export interface FormScore {
  player_id: number;
  player_name: string;
  score_type: 'batting' | 'bowling' | 'overall';
  score: number;              // 0.00 - 10.00
  trend: 'improving' | 'declining' | 'stable';
  confidence: number;         // 0.00 - 1.00
  matches_used: number;
  leagues_used: string[];
  data_sources: string[];
  computed_at: string;
}

export interface MatchupResult {
  batter_id: number;
  batter_name: string;
  bowler_id: number;
  bowler_name: string;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number;
  dot_pct: number;
  boundary_pct: number;
  advantage: 'batter' | 'bowler' | 'even';
  confidence: number;
  fantasy_note: string;
  phases: {
    powerplay: PhaseStats;
    middle: PhaseStats;
    death: PhaseStats;
  };
  leagues: string[];
}

export interface PhaseStats {
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number;
  dot_pct: number;
}

export interface VenueIntelligence {
  venue_id: number;
  venue_name: string;
  city: string | null;
  matches_analyzed: number;
  avg_1st_innings: number;
  avg_2nd_innings: number;
  pace_wicket_pct: number;
  spin_wicket_pct: number;
  toss_bat_first_pct: number;
  chasing_win_pct: number;
  phase_breakdown: {
    powerplay: { avg_runs: number; avg_wickets: number };
    middle: { avg_runs: number; avg_wickets: number };
    death: { avg_runs: number; avg_wickets: number };
  };
  confidence: number;
}

export interface DreamTeam {
  fixture_id: number;
  players: DreamTeamPick[];
  total_expected_points: number;
  confidence: number;
  computed_at: string;
}

export interface DreamTeamPick {
  player_id: number;
  player_name: string;
  team: string;
  role: string;
  expected_points: number;
  reasoning: string[];
  form_score: number;
}

export interface CaptainPick {
  rank: number;
  player_id: number;
  player_name: string;
  team: string;
  captain_score: number;
  risk_level: 'safe' | 'moderate' | 'risky';
  reasoning: string[];
  anti_pick_warning: string | null;
}

export interface ConfidenceScore {
  value: number;           // 0.00 - 1.00
  label: 'very_high' | 'high' | 'moderate' | 'low' | 'very_low';
  data_depth: string;      // e.g. 'Veteran with deep multi-league data'
  data_sources: string[];
}

// ─── API TYPES ───

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  meta: {
    timestamp: string;
    cached: boolean;
    cache_age_seconds: number | null;
    api_version: string;
  };
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
  meta: {
    timestamp: string;
    api_version: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

// ─── FANTASY POINTS CONFIG ───

export interface FantasyPointsConfig {
  batting: {
    run: number;
    boundary: number;
    six: number;
    half_century: number;
    century: number;
    duck: number;
  };
  bowling: {
    wicket: number;
    maiden: number;
    three_wicket_haul: number;
    five_wicket_haul: number;
    dot_ball: number;
  };
  fielding: {
    catch: number;
    stumping: number;
    run_out_direct: number;
    run_out_indirect: number;
  };
  bonus: {
    playing_xi: number;
    captain_multiplier: number;
    vc_multiplier: number;
  };
}

// Dream11 T20 scoring (default config)
export const DREAM11_T20_SCORING: FantasyPointsConfig = {
  batting: {
    run: 1,
    boundary: 1,
    six: 2,
    half_century: 8,
    century: 16,
    duck: -2,
  },
  bowling: {
    wicket: 25,
    maiden: 8,
    three_wicket_haul: 4,
    five_wicket_haul: 8,
    dot_ball: 1,
  },
  fielding: {
    catch: 8,
    stumping: 12,
    run_out_direct: 12,
    run_out_indirect: 6,
  },
  bonus: {
    playing_xi: 4,
    captain_multiplier: 2,
    vc_multiplier: 1.5,
  },
};
