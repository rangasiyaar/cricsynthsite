export interface Fixture {
  upcoming_id: number;
  slug: string | null;
  league_id: string | null;
  match_date: string;
  start_time: string | null;
  team1: string;
  team2: string;
  venue_id: number | null;
  format: "T20" | "ODI" | "Test";
  toss_winner: string | null;
  toss_decision: "bat" | "field" | null;
  status: "scheduled" | "completed" | "cancelled";
}

export interface SquadRow {
  player_id: number;
  team: string;
  batting_order: number | null;
  is_playing_xi: boolean;
  is_confirmed: boolean;
  player_meta?: { name: string | null; primary_role: string | null } | null;
}

export interface PlayerHit {
  player_id: number;
  name: string;
  primary_role: string | null;
  batting_hand: string | null;
  bowling_style: string | null;
}
