-- CricVeda Database Schema
-- Run this against your Supabase project via the SQL Editor

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE bowling_style_enum AS ENUM (
    'right-arm-fast',
    'right-arm-medium',
    'right-arm-off-break',
    'right-arm-leg-break',
    'left-arm-fast',
    'slow-left-arm'
);

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS leagues (
    league_id               TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    format                  TEXT NOT NULL CHECK (format IN ('T20', 'ODI', 'Test')),
    tier                    SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 4),
    difficulty_multiplier   FLOAT NOT NULL DEFAULT 1.0,
    format_similarity_weight FLOAT NOT NULL DEFAULT 1.0 CHECK (format_similarity_weight BETWEEN 0.0 AND 1.0),
    season_start_month      SMALLINT CHECK (season_start_month BETWEEN 1 AND 12),
    dream11_active          BOOLEAN NOT NULL DEFAULT FALSE,
    cricsheet_key           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venues (
    venue_id                INTEGER PRIMARY KEY,
    name                    TEXT NOT NULL,
    city                    TEXT,
    country                 TEXT,
    latitude                FLOAT,
    longitude               FLOAT,
    avg_first_innings_score FLOAT,
    avg_pace_economy        FLOAT,
    avg_spin_economy        FLOAT
);

CREATE TABLE IF NOT EXISTS player_meta (
    player_id               INTEGER PRIMARY KEY,
    name                    TEXT NOT NULL,
    batting_hand            TEXT CHECK (batting_hand IN ('Left hand', 'Right hand')),
    bowling_style           bowling_style_enum,
    bowling_style_raw       TEXT,
    primary_role            TEXT CHECK (primary_role IN ('BAT', 'BOWL', 'AR', 'WK')),
    nationality             TEXT,
    dob                     DATE
);

CREATE TABLE IF NOT EXISTS matches (
    match_id                INTEGER PRIMARY KEY,
    league_id               TEXT REFERENCES leagues(league_id),
    season                  TEXT,
    match_date              DATE NOT NULL,
    venue_id                INTEGER REFERENCES venues(venue_id),
    team1                   TEXT NOT NULL,
    team2                   TEXT NOT NULL,
    toss_winner             TEXT,
    toss_decision           TEXT,
    winner                  TEXT,
    rain_affected           BOOLEAN NOT NULL DEFAULT FALSE,
    low_ball_count          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS deliveries (
    delivery_id             BIGINT PRIMARY KEY,
    match_id                INTEGER REFERENCES matches(match_id) NOT NULL,
    innings                 SMALLINT NOT NULL CHECK (innings IN (1, 2)),
    over_ball               NUMERIC(4, 1) NOT NULL,
    striker_id              INTEGER REFERENCES player_meta(player_id),
    bowler_id               INTEGER REFERENCES player_meta(player_id),
    non_striker_id          INTEGER REFERENCES player_meta(player_id),
    runs_batter             SMALLINT NOT NULL DEFAULT 0,
    runs_extras             SMALLINT NOT NULL DEFAULT 0,
    runs_total              SMALLINT NOT NULL DEFAULT 0,
    wicket_type             TEXT,
    wicket_player_id        INTEGER REFERENCES player_meta(player_id),
    extras_type             TEXT,
    -- raw names kept until name resolution runs
    striker_name            TEXT,
    bowler_name             TEXT,
    non_striker_name        TEXT,
    wicket_player_name      TEXT
);

CREATE TABLE IF NOT EXISTS fantasy_points (
    player_id               INTEGER REFERENCES player_meta(player_id) NOT NULL,
    match_id                INTEGER REFERENCES matches(match_id) NOT NULL,
    batting_points          FLOAT NOT NULL DEFAULT 0,
    bowling_points          FLOAT NOT NULL DEFAULT 0,
    fielding_points         FLOAT NOT NULL DEFAULT 0,
    total_points            FLOAT NOT NULL DEFAULT 0,
    training_exclude        BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (player_id, match_id)
);

CREATE TABLE IF NOT EXISTS predictions (
    player_id               INTEGER REFERENCES player_meta(player_id) NOT NULL,
    match_id                INTEGER REFERENCES matches(match_id) NOT NULL,
    predicted_points        FLOAT NOT NULL,
    confidence              FLOAT,
    model_version           TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_id, match_id, model_version)
);

CREATE TABLE IF NOT EXISTS api_keys (
    key_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash                TEXT NOT NULL UNIQUE,
    label                   TEXT,
    daily_limit             INTEGER NOT NULL DEFAULT 100,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at            TIMESTAMPTZ
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_deliveries_match      ON deliveries(match_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_striker     ON deliveries(striker_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_bowler      ON deliveries(bowler_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_player         ON fantasy_points(player_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_match          ON fantasy_points(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_league         ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_date           ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_match      ON predictions(match_id);

-- ============================================================
-- SEED DATA: Leagues
-- ============================================================

INSERT INTO leagues (league_id, name, format, tier, difficulty_multiplier, format_similarity_weight, season_start_month, dream11_active, cricsheet_key)
VALUES
    -- Tier 1 — elite, fully active on Dream11
    ('ipl',    'Indian Premier League',             'T20', 1, 1.5, 1.0, 3,  TRUE,  'ipl'),
    ('t20i',   'Men''s T20 Internationals',         'T20', 1, 1.4, 1.0, 1,  TRUE,  't20s'),
    ('odi',    'Men''s One Day Internationals',     'ODI', 1, 1.4, 0.9, 1,  TRUE,  'odis'),
    ('bbl',    'Big Bash League',                   'T20', 1, 1.2, 1.0, 12, TRUE,  'bbl'),
    ('psl',    'Pakistan Super League',             'T20', 1, 1.2, 1.0, 2,  TRUE,  'psl'),

    -- Tier 2 — high quality
    ('sa20',   'SA20',                              'T20', 2, 1.1, 1.0, 1,  TRUE,  'sa20'),
    ('cpl',    'Caribbean Premier League',          'T20', 2, 1.0, 1.0, 8,  TRUE,  'cpl'),
    ('ilt20',  'ILT20',                             'T20', 2, 1.0, 1.0, 1,  TRUE,  'ilt20'),
    ('lpl',    'Lanka Premier League',              'T20', 2, 0.9, 1.0, 7,  TRUE,  'lpl'),
    ('wpl',    'Women''s Premier League',           'T20', 2, 1.0, 1.0, 2,  FALSE, 'wpl'),

    -- Tier 3 — training data only (not active on Dream11)
    ('bpl',    'Bangladesh Premier League',         'T20', 3, 0.8, 1.0, 1,  FALSE, 'bpl'),
    ('blast',  'Vitality T20 Blast',                'T20', 3, 0.8, 1.0, 6,  FALSE, 'blast'),
    ('smat',   'Sheffield Shield / Marsh Cup',      'T20', 3, 0.7, 1.0, 10, FALSE, 'smat'),
    ('smash',  'Super Smash (New Zealand)',         'T20', 3, 0.7, 1.0, 12, FALSE, 'smash'),
    ('nat20',  'National T20 Cup (Pakistan)',       'T20', 3, 0.7, 1.0, 9,  FALSE, 'nat20'),

    -- Tier 4 — domestic feeder leagues
    ('hundred','The Hundred',                       'T20', 4, 0.8, 1.0, 8,  FALSE, 'hundred'),
    ('csa',    'CSA T20 Challenge',                 'T20', 4, 0.6, 1.0, 1,  FALSE, 'csa'),

    -- Women's leagues (all formats, Cricsheet-available)
    ('wt20i',  'Women''s T20 Internationals',       'T20', 1, 1.3, 1.0, 1,  FALSE, 'wt20s'),
    ('wodi',   'Women''s One Day Internationals',   'ODI', 1, 1.3, 0.9, 1,  FALSE, 'wodis'),
    ('wbbl',   'Women''s Big Bash League',          'T20', 2, 1.1, 1.0, 10, FALSE, 'wbbl'),
    ('wcpl',   'Women''s Caribbean Premier League', 'T20', 2, 0.9, 1.0, 9,  FALSE, 'wcpl'),
    ('hundredw','The Hundred Women''s',             'T20', 4, 0.8, 1.0, 8,  FALSE, 'hundredw')

ON CONFLICT (league_id) DO NOTHING;
