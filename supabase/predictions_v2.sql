-- CricVeda v2 player predictions — written by cricveda_core.predictions.batch,
-- read by POST /v2/predictions/player. Run AFTER platform_v2.sql.

CREATE TABLE IF NOT EXISTS player_predictions (
    upcoming_id         INTEGER  NOT NULL REFERENCES upcoming_matches(upcoming_id) ON DELETE CASCADE,
    player_id           INTEGER  NOT NULL REFERENCES player_meta(player_id),
    batting_position    SMALLINT NOT NULL DEFAULT 0,      -- 0 = as entered in the squad; 1–7 what-if
    include_conditions  BOOLEAN  NOT NULL DEFAULT TRUE,   -- venue + toss features used
    team                TEXT     NOT NULL,
    role                TEXT,
    metric              TEXT     NOT NULL CHECK (metric IN ('runs', 'wickets', 'fantasy_points')),
    runs_p10            REAL, runs_p50    REAL, runs_p90    REAL,
    wickets_p10         REAL, wickets_p50 REAL, wickets_p90 REAL,
    points_p10          REAL, points_p50  REAL, points_p90  REAL,
    form_score          REAL     NOT NULL,
    form_trend          TEXT     NOT NULL CHECK (form_trend IN ('rising', 'steady', 'falling')),
    composite_score     REAL     NOT NULL,
    tier                TEXT     NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C', 'D')),
    captain_value       REAL     NOT NULL,
    confidence          REAL     NOT NULL,
    xi_status           TEXT     NOT NULL CHECK (xi_status IN ('confirmed', 'projected')),
    model_version       TEXT     NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (upcoming_id, player_id, batting_position, include_conditions)
);

CREATE INDEX IF NOT EXISTS idx_player_predictions_generated ON player_predictions(upcoming_id, generated_at DESC);

ALTER TABLE player_predictions ENABLE ROW LEVEL SECURITY;   -- served only through the API (service key)
