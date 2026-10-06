-- GraphSynth live snapshots — one row per match state received from any source.
-- Run AFTER platform_v2.sql.
--   scope 'public'        admin manual scoring or a paid feed; anyone with GraphSynth sees it
--   scope 'user:<uuid>'   a customer's own pushed feed; only that account sees it

CREATE TABLE IF NOT EXISTS live_snapshots (
    snapshot_id         BIGSERIAL PRIMARY KEY,
    upcoming_id         INTEGER  NOT NULL REFERENCES upcoming_matches(upcoming_id) ON DELETE CASCADE,
    scope               TEXT     NOT NULL,
    source              TEXT     NOT NULL CHECK (source IN ('customer', 'admin', 'feed')),
    innings             SMALLINT NOT NULL CHECK (innings IN (1, 2)),
    batting             TEXT     NOT NULL CHECK (batting IN ('home', 'away')),
    runs                SMALLINT NOT NULL,
    wickets             SMALLINT NOT NULL,
    legal_balls         SMALLINT NOT NULL,
    first_innings_total SMALLINT,
    win_prob_home       REAL     NOT NULL,
    proj_p10            SMALLINT NOT NULL,
    proj_p50            SMALLINT NOT NULL,
    proj_p90            SMALLINT NOT NULL,
    model_version       TEXT     NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- a correction for the same ball replaces the earlier row
    UNIQUE (upcoming_id, scope, innings, legal_balls)
);

CREATE INDEX IF NOT EXISTS idx_live_snapshots_series ON live_snapshots(upcoming_id, scope, innings, legal_balls);

ALTER TABLE live_snapshots ENABLE ROW LEVEL SECURITY;   -- served only through the API
