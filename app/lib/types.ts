// Shapes of published documents (cricsim/publish.py, cricsim/engine/summary.py).

export type Dist = { mean: number | null; q: Record<string, number> };

export type MatchCard = {
  id: string; title?: string; date?: string; start_time?: string; format: string; competition?: string; venue?: string;
  teams: { name: string; short: string }[]; win: Record<string, number>; projected: (number | null)[];
  headline?: string | null; published: boolean; generated_at: string;
};
export type MatchIndex = { matches: MatchCard[]; generated_at?: string };

export type Fow = {
  wicket: number; p: number; over?: Dist; score?: Dist; partnership?: Dist; by_over?: number[];
  bowler?: { id: string; name: string; p: number }[]; batter?: { id: string; name: string; p: number }[];
};

export type PlayerRow = {
  id: string; name: string; known: boolean;
  batting?: {
    slot: number; p_bats: number; runs: Dist; balls: Dist; strike_rate: number; p_at_least: Record<string, number>;
    p_duck: number; p_out: number; how_out: Record<string, number>;
    dismissed_by: { bowler: string; name: string; p: number }[]; p_top_scorer: number;
  };
  bowling?: {
    p_bowls: number; overs: number; wickets: Dist; p_wickets: Record<string, number>; runs: Dist; economy: number;
    p_best_bowler: number;
  };
  profile: {
    source?: string; balls_faced?: Record<string, number>; balls_bowled?: Record<string, number>; in_this_format?: number;
    batting?: Record<string, number>; bowling?: Record<string, number>; hand?: string; bowling_kind?: string;
  };
};

export type TeamSummary = {
  name: string;
  batting: {
    score: Dist & { hist: { from: number; to: number; p: number }[]; p_at_least: Record<string, number> };
    wickets: Dist & { dist: number[] };
    balls: Dist;
    phases: { phase: string; overs: [number, number]; runs: Dist; wickets: Dist; p_no_wicket: number }[];
    per_over: { over: number; runs: number; p_wicket: number; wickets: number }[];
    fall_of_wickets: Fow[];
    extras: { wides: number; no_balls: number; byes: number; total: Dist };
  };
  players: PlayerRow[];
};

export type Summary = {
  meta: { format: string; gender: string; simulations: number; rules: { overs: number; pp: number; bpo: number; quota: number } };
  result: {
    win: Record<string, number>; tie: number;
    by_toss: { batting_first: string; n: number; win: Record<string, number> }[];
    margin_runs: Dist; margin_wickets: Dist;
  };
  teams: [TeamSummary, TeamSummary];
  matchups: { batter: string; bowler: string; p: number }[];
};

export type MatchDoc = {
  match: { id: string; title?: string; date?: string; start_time?: string; format: string; competition?: string;
           venue?: string; teams: { name: string; short: string; players: string[] }[] };
  summary: Summary; insights: { kind: string; text: string }[]; generated_at: string; model: string;
};

export type PatternRow = {
  id: string; title: string; question: string; category: string; outcome: string; folklore: string; verdict: string;
  why?: string; full?: { rr: number | null; lo: number | null; hi: number | null; exposed_balls: number;
                         exposed_rate: number | null; expected_rate: number | null };
  disc?: { rr: number | null }; valid?: { rr: number | null };
};
export type PatternReport = {
  summary: { balls: number; split_year: number; attribute_coverage?: Record<string, number> };
  patterns: PatternRow[];
  curves: Record<string, { value: number; balls: number; wicket_rate: number | null; o_e: number | null }[]>;
};
