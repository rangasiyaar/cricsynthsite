"""Per-ball features for the Pattern Lab, built with DuckDB straight from Parquet.

One row per delivery in limited-overs innings (super overs excluded), with the
situation before the ball plus sequence features: previous ball for the
batter / bowler / innings, dot and boundary streaks, bowler spells,
partnership age, recent wickets, position in the over, powerplay boundaries,
chase pressure, free hits and (optionally) batting hand / bowling style.
"""
from __future__ import annotations

from pathlib import Path

import duckdb

# Overs per innings and powerplay length (in overs; The Hundred uses 5-ball "overs":
# its 25-ball powerplay is the first 5 sets).
FORMATS = {"T20": (20, 6), "T10": (10, 2), "HUNDRED": (20, 5), "OD": (50, 10)}
BOWLER_KINDS = ("bowled", "caught", "lbw", "stumped", "caught and bowled", "hit wicket")


def _format_case(idx: int) -> str:
    whens = " ".join(f"WHEN '{f}' THEN {v[idx]}" for f, v in FORMATS.items())
    return f"CASE format {whens} END"


def build_balls(con: duckdb.DuckDBPyConnection, parquet_dir: Path, attributes: Path | None = None) -> int:
    """Create table `balls` in `con`; returns its row count."""
    deliveries = (parquet_dir / "deliveries" / "*.parquet").as_posix()
    formats = ", ".join(f"'{f}'" for f in FORMATS)
    kinds = ", ".join(f"'{k}'" for k in BOWLER_KINDS)

    con.execute(f"""
    CREATE OR REPLACE TABLE d AS
    SELECT *,
           row_number() OVER (PARTITION BY match_id, innings_no ORDER BY "over", ball_seq) AS seq,
           {_format_case(0)} AS total_overs,
           {_format_case(1)} AS pp_overs,
           (runs_total = 0 AND is_legal) AS is_dot,
           (runs_batter IN (4, 6) AND NOT non_boundary) AS is_boundary,
           (runs_batter = 6 AND NOT non_boundary) AS is_six,
           (wicket_kind IN ({kinds})) AS is_bowler_wicket
    FROM read_parquet('{deliveries}')
    WHERE NOT is_super_over AND format IN ({formats})
    """)

    # Bowler spells, at over level: a new spell starts when the bowler didn't bowl two overs earlier.
    con.execute("""
    CREATE OR REPLACE TABLE spells AS
    WITH o AS (
      SELECT DISTINCT match_id, innings_no, "over", bowler_id FROM d WHERE bowler_id IS NOT NULL
    ), l AS (
      SELECT *, lag("over") OVER (PARTITION BY match_id, innings_no, bowler_id ORDER BY "over") AS prev_over,
                count(*) OVER (PARTITION BY match_id, innings_no, bowler_id ORDER BY "over"
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS overs_before
      FROM o
    ), s AS (
      SELECT *, (prev_over IS NULL OR "over" - prev_over > 2) AS spell_start FROM l
    )
    SELECT *, sum(CASE WHEN spell_start THEN 1 ELSE 0 END)
                OVER (PARTITION BY match_id, innings_no, bowler_id ORDER BY "over") AS spell_no
    FROM s
    """)
    con.execute("""
    CREATE OR REPLACE TABLE spells2 AS
    SELECT *, row_number() OVER (PARTITION BY match_id, innings_no, bowler_id, spell_no ORDER BY "over") AS spell_over
    FROM spells
    """)

    con.execute("""
    CREATE OR REPLACE TABLE balls AS
    WITH base AS (
      SELECT d.*,
        lag(runs_batter) OVER inn AS prev_runs_batter,
        lag(is_boundary) OVER inn AS prev_boundary,
        lag(is_wicket) OVER inn AS prev_wicket,
        lag(wides) OVER inn AS prev_wides,
        lag(noballs) OVER inn AS prev_noballs,
        lag(is_six) OVER bat AS batter_prev_six,
        lag(is_boundary) OVER bat AS batter_prev_boundary,
        lag(is_boundary, 2) OVER bat AS batter_prev2_boundary,
        lag(is_six) OVER bowl AS bowler_prev_six,
        sum(CAST(is_wicket AS INT)) OVER (PARTITION BY match_id, innings_no ORDER BY seq
                                          ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS wkts_last12,
        sum(CAST(is_wicket AS INT)) OVER (PARTITION BY match_id, innings_no ORDER BY seq
                                          ROWS BETWEEN 18 PRECEDING AND 1 PRECEDING) AS wkts_last18,
        sum(CASE WHEN is_dot THEN 0 ELSE 1 END) OVER (PARTITION BY match_id, innings_no ORDER BY seq
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS dot_grp,
        sum(CASE WHEN is_boundary THEN 0 ELSE 1 END) OVER (PARTITION BY match_id, innings_no ORDER BY seq
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS bnd_grp,
        legal_balls_before - min(legal_balls_before) OVER (PARTITION BY match_id, innings_no, team_wickets_before)
          AS part_balls,
        team_runs_before - min(team_runs_before) OVER (PARTITION BY match_id, innings_no, team_wickets_before)
          AS part_runs
      FROM d
      WINDOW inn AS (PARTITION BY match_id, innings_no ORDER BY seq),
             bat AS (PARTITION BY match_id, innings_no, batter_id ORDER BY seq),
             bowl AS (PARTITION BY match_id, innings_no, bowler_id ORDER BY seq)
    ), streaks AS (
      SELECT *,
        -- rows since the last non-dot / non-boundary ball = current streak length before this ball
        count(*) OVER (PARTITION BY match_id, innings_no, dot_grp ORDER BY seq
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS dots_before,
        count(*) OVER (PARTITION BY match_id, innings_no, bnd_grp ORDER BY seq
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS boundaries_before
      FROM base
    )
    SELECT s.*,
      sp.spell_start, sp.spell_over, sp.overs_before AS bowler_overs_before, (sp.prev_over IS NULL) AS bowler_first_over,
      (sp.spell_start AND s.is_legal AND s.legal_ball_in_over = 1) AS spell_first_ball,
      EXTRACT(year FROM s.match_date) AS year,
      least(CAST(floor(10.0 * s."over" / s.total_overs) AS INT), 9) AS phase_bucket,
      least(s.team_wickets_before, 8) AS wk_bucket,
      CASE WHEN s.batter_balls_before < 5 THEN 0 WHEN s.batter_balls_before < 10 THEN 1
           WHEN s.batter_balls_before < 20 THEN 2 WHEN s.batter_balls_before < 30 THEN 3 ELSE 4 END AS set_bucket,
      CASE WHEN s.innings_no = 2 AND s.target_runs IS NOT NULL THEN
        6.0 * (s.target_runs - s.team_runs_before)
          / greatest(s.total_overs * s.balls_per_over - s.legal_balls_before, 1) END AS rrr,
      (s.prev_noballs > 0) AS free_hit
    FROM streaks s
    LEFT JOIN spells2 sp USING (match_id, innings_no, "over", bowler_id)
    """)

    if attributes is not None and attributes.exists():
        con.execute(f"CREATE OR REPLACE TABLE attrs AS SELECT * FROM read_parquet('{attributes.as_posix()}')")
        con.execute("""
        CREATE OR REPLACE TABLE balls AS
        SELECT b.*, ba.batting_hand, bo.bowling_arm, bo.bowling_kind, ns.batting_hand AS non_striker_hand
        FROM balls b
        LEFT JOIN attrs ba ON ba.player_id = b.batter_id
        LEFT JOIN attrs bo ON bo.player_id = b.bowler_id
        LEFT JOIN attrs ns ON ns.player_id = b.non_striker_id
        """)
    else:
        con.execute("""
        CREATE OR REPLACE TABLE balls AS
        SELECT *, CAST(NULL AS VARCHAR) AS batting_hand, CAST(NULL AS VARCHAR) AS bowling_arm,
                  CAST(NULL AS VARCHAR) AS bowling_kind, CAST(NULL AS VARCHAR) AS non_striker_hand
        FROM balls
        """)
    for t in ("d", "spells", "spells2"):
        con.execute(f"DROP TABLE {t}")
    return con.execute("SELECT count(*) FROM balls").fetchone()[0]


def has_attributes(con: duckdb.DuckDBPyConnection) -> bool:
    return bool(con.execute("SELECT count(*) FROM balls WHERE batting_hand IS NOT NULL").fetchone()[0])
