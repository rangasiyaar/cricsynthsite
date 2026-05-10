// ============================================================
// CricVeda — Core TypeScript Definitions
// ============================================================

// ─── Database Entities ───

export interface League {
  id: string;
  name: string;
  country: string;
  tier: number;
  season: string | null;
}

export interface Venue {
  id: number;
  name: string;
  city: string;
  country: string;
  capacity: number | null;
}

export interface Team {
  id: number;
  name: string;
  short_name: string;
  league_id: string;
  country: string | null;
}

export interface Player {
  id: number;
  cricsheet_id: string | null;
  name: string;
  country: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  role: 'batter' | 'bowler' | 'allrounder' | 'wicketkeeper';
}

export interface Match {
  id: number;
  cricsheet_id: string | null;
  league_id: string;
  venue_id: number;
  team1_id: number;
  team2_id: number;
  date: string;
  toss_winner_id: number | null;
  toss_decision: 'bat' | 'field' | null;
  winner_id: number | null;
  result: string | null;
  season: string | null;
}

export interface Delivery {
  id: number;
  match_id: number;
  innings: 1 | 2;
  over_number: number;
  ball_number: number;
  batter_id: number;
  bowler_id: number;
  non_striker_id: number;
  runs_batter: number;
  runs_extras: number;
  runs_total: number;
  is_wicket: boolean;
  wicket_kind: string | null;
  wicket_player_id: number | null;
  extras_type: string | null;
  phase: 'powerplay' | 'middle' | 'death';
}

export interface Fixture {
  id: number;
  league_id: string;
  team1_id: number;
  team2_id: number;
  venue_id: number;
  date: string;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
}

export interface PlayingXI {
  id: number;
  fixture_id: number;
  team_id: number;
  player_id: number;
  is_confirmed: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_prefix: string;
  key_hash: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiUsageLog {
  id: number;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  latency_ms: number | null;
  error_code: string | null;
  created_at: string;
}

export interface FormScore {
  id: number;
  player_id: number;
  score_type: 'batting' | 'bowling' | 'overall';
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number;
  matches_used: number;
  leagues_used: number;
  computed_at: string;
}

export interface PrecomputedInsight {
  id: number;
  fixture_id: number;
  insight_type: 'dream_team' | 'captain_picks' | 'key_battles' | 'differentials' | 'venue_analysis';
  data: Record<string, unknown>;
  confidence: number;
  computed_at: string;
}

export interface Prediction {
  id: number;
  fixture_id: number;
  team_a_win_prob: number;
  team_b_win_prob: number;
  top_performer_id: number;
  key_factors: Record<string, unknown>;
  confidence: number;
  computed_at: string;
}

// ─── API Response Types ───

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta: {
    timestamp: string;
    cached: boolean;
    cache_age_seconds: number | null;
    api_version: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

// ─── Analytics Types ───

export interface FormScoreResult {
  player_id: number;
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: ConfidenceScore;
  matches_used: number;
  leagues: string[];
  batting_sub: number;
  bowling_sub: number;
}

export interface MatchupResult {
  batter_id: number;
  bowler_id: number;
  balls: number;
  runs: number;
  dismissals: number;
  strike_rate: number;
  dot_percentage: number;
  boundary_percentage: number;
  phase_breakdown: {
    powerplay: PhaseStats;
    middle: PhaseStats;
    death: PhaseStats;
  };
  advantage: 'batter' | 'bowler' | 'even';
  fantasy_note: string;
  confidence: ConfidenceScore;
  leagues: string[];
}

export interface PhaseStats {
  balls: number;
  runs: number;
  strike_rate: number;
  dismissals: number;
}

export interface VenueIntelligence {
  venue_id: number;
  matches_analyzed: number;
  avg_first_innings_score: number;
  avg_second_innings_score: number;
  pace_wicket_pct: number;
  spin_wicket_pct: number;
  bat_first_pct: number;
  chasing_win_pct: number;
  phase_breakdown: {
    powerplay: { avg_runs: number; avg_wickets: number };
    middle: { avg_runs: number; avg_wickets: number };
    death: { avg_runs: number; avg_wickets: number };
  };
  confidence: ConfidenceScore;
}

export interface DreamTeamPlayer {
  player_id: number;
  player_name: string;
  team: string;
  role: string;
  expected_points: number;
  form_score: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface DreamTeamResult {
  players: DreamTeamPlayer[];
  team_composition: { wk: number; bat: number; ar: number; bowl: number };
  total_expected_points: number;
  confidence: ConfidenceScore;
}

export interface CaptainPick {
  player_id: number;
  player_name: string;
  team: string;
  role: string;
  captain_score: number;
  risk_level: 'safe' | 'moderate' | 'risky';
  reasoning: string[];
  confidence: ConfidenceScore;
}

export interface Differential {
  player_id: number;
  player_name: string;
  team: string;
  role: string;
  form_score: number;
  expected_points: number;
  reason: string;
}

export interface KeyBattle {
  batter_id: number;
  batter_name: string;
  bowler_id: number;
  bowler_name: string;
  balls: number;
  strike_rate: number;
  dismissals: number;
  advantage: 'batter' | 'bowler' | 'even';
  fantasy_impact: string;
}

export interface ConfidenceScore {
  score: number;
  label: string;
  tier: 'very_high' | 'high' | 'moderate' | 'low' | 'very_low';
  depth: string;
}

// ─── Fantasy Points Config ───

export interface FantasyPointsConfig {
  base_points: {
    batter: number;
    wicketkeeper: number;
    allrounder: number;
    bowler: number;
  };
  playing_xi_bonus: number;
}

export const DEFAULT_FANTASY_CONFIG: FantasyPointsConfig = {
  base_points: {
    batter: 28,
    wicketkeeper: 32,
    allrounder: 38,
    bowler: 30,
  },
  playing_xi_bonus: 4,
};

// ─── Rate Limiting ───

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

export const RATE_LIMITS: Record<string, { daily: number; burst: number }> = {
  free: { daily: 100, burst: 10 },
  pro: { daily: 5000, burst: 50 },
  enterprise: { daily: 50000, burst: 200 },
};
