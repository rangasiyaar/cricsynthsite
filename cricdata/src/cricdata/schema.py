"""Arrow schemas for every table — fixed so all Parquet chunks (and BigQuery) agree."""
from __future__ import annotations

import pyarrow as pa

S, I, B, D = pa.string(), pa.int32(), pa.bool_(), pa.date32()
LS = pa.list_(pa.string())

SCHEMAS: dict[str, pa.Schema] = {
    "matches": pa.schema([
        ("match_id", S), ("format", S), ("is_limited_overs", B), ("raw_match_type", S), ("team_type", S),
        ("gender", S), ("season", S), ("match_date", D), ("dates", LS), ("competition", S),
        ("competition_id", S), ("match_number", I), ("stage", S), ("city", S), ("venue", S),
        ("venue_raw", S), ("venue_id", S), ("team1", S), ("team2", S), ("team1_id", S), ("team2_id", S),
        ("team1_raw", S), ("team2_raw", S), ("toss_winner", S), ("toss_decision", S), ("overs", I),
        ("balls_per_over", I), ("player_of_match", LS), ("winner", S), ("result", S), ("by_runs", I),
        ("by_wickets", I), ("by_innings", B), ("method", S), ("eliminator", S),
    ]),
    "match_players": pa.schema([
        ("match_id", S), ("team", S), ("team_id", S), ("player_id", S), ("name", S), ("list_order", I),
    ]),
    "innings": pa.schema([
        ("match_id", S), ("innings_no", I), ("team", S), ("team_id", S), ("is_super_over", B), ("runs", I),
        ("wickets", I), ("legal_balls", I), ("target_runs", I), ("target_overs", pa.float32()),
        ("declared", B), ("forfeited", B),
        ("powerplays", pa.list_(pa.struct([("from", pa.float32()), ("to", pa.float32()), ("type", S)]))),
    ]),
    "deliveries": pa.schema([
        ("match_id", S), ("match_date", D), ("format", S), ("gender", S), ("team_type", S),
        ("competition_id", S), ("venue_id", S), ("innings_no", I), ("is_super_over", B),
        ("batting_team_id", S), ("bowling_team_id", S), ("over", I), ("ball_seq", I),
        ("legal_ball_in_over", I), ("balls_per_over", I), ("batter_id", S), ("batter", S),
        ("bowler_id", S), ("bowler", S), ("non_striker_id", S), ("non_striker", S),
        ("runs_batter", I), ("runs_extras", I), ("runs_total", I), ("non_boundary", B),
        ("wides", I), ("noballs", I), ("byes", I), ("legbyes", I), ("penalty", I),
        ("is_legal", B), ("is_wicket", B), ("wicket_kind", S), ("player_out_id", S),
        ("team_runs_before", I), ("team_wickets_before", I), ("legal_balls_before", I),
        ("batter_balls_before", I), ("batter_runs_before", I), ("bowler_balls_before", I),
        ("target_runs", I),
    ]),
    "wickets": pa.schema([
        ("match_id", S), ("match_date", D), ("format", S), ("innings_no", I), ("is_super_over", B),
        ("over", I), ("ball_seq", I), ("player_out_id", S), ("player_out", S), ("kind", S),
        ("is_dismissal", B), ("bowler_id", S), ("fielder_ids", LS), ("team_runs_at_fall", I),
        ("wicket_number", I),
    ]),
    "players": pa.schema([
        ("player_id", S), ("name", S), ("unique_name", S), ("key_cricinfo", S), ("key_cricbuzz", S),
        ("key_bcci", S), ("aliases", LS),
    ]),
}

# BigQuery layout: partition big tables by match month, cluster for the common filters.
BQ_LAYOUT = {
    "deliveries": {"partition": "match_date", "cluster": ["format", "gender", "batter_id", "bowler_id"]},
    "wickets": {"partition": "match_date", "cluster": ["format", "player_out_id", "bowler_id"]},
    "matches": {"partition": None, "cluster": ["format", "gender", "competition_id"]},
}
