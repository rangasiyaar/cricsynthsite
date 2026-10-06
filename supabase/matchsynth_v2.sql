-- MatchSynth pre-computed simulations. Written by cricveda_core.matchsynth.batch,
-- read by POST /v2/simulate/match for the default request. Run AFTER platform_v2.sql.

CREATE TABLE IF NOT EXISTS match_simulations (
    upcoming_id     INTEGER NOT NULL REFERENCES upcoming_matches(upcoming_id) ON DELETE CASCADE,
    toss_key        TEXT    NOT NULL DEFAULT '',     -- '' = toss unknown (both batting orders)
    iterations      INTEGER NOT NULL,
    model_version   TEXT    NOT NULL,
    result          JSONB   NOT NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (upcoming_id, toss_key)
);

ALTER TABLE match_simulations ENABLE ROW LEVEL SECURITY;   -- served only through the API
