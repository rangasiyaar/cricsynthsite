-- CricVeda — Upcoming Matches & Squad Selection Schema
-- Run this after schema.sql in the Supabase SQL Editor

-- ============================================================
-- UPCOMING MATCHES (manually entered for now)
-- ============================================================

CREATE TABLE IF NOT EXISTS upcoming_matches (
    upcoming_id     SERIAL PRIMARY KEY,
    league_id       TEXT REFERENCES leagues(league_id),
    match_date      DATE NOT NULL,
    team1           TEXT NOT NULL,
    team2           TEXT NOT NULL,
    venue_id        INTEGER REFERENCES venues(venue_id),
    format          TEXT NOT NULL DEFAULT 'T20' CHECK (format IN ('T20', 'ODI', 'Test')),
    toss_winner     TEXT,
    toss_decision   TEXT CHECK (toss_decision IN ('bat', 'field')),
    predicted_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_upcoming_date ON upcoming_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_upcoming_league ON upcoming_matches(league_id);

-- ============================================================
-- SQUAD SELECTIONS (manually entered — which players are in XI)
-- ============================================================

CREATE TABLE IF NOT EXISTS squad_selections (
    selection_id    SERIAL PRIMARY KEY,
    upcoming_id     INTEGER REFERENCES upcoming_matches(upcoming_id) NOT NULL,
    player_id       INTEGER REFERENCES player_meta(player_id) NOT NULL,
    team            TEXT NOT NULL,              -- team1 or team2 name (matches upcoming_matches)
    credits         FLOAT NOT NULL DEFAULT 8.0, -- Dream11 credit value for this player
    batting_order   SMALLINT,                   -- expected batting position (1-11), NULL if unknown
    is_playing_xi   BOOLEAN NOT NULL DEFAULT TRUE,
    is_confirmed    BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE once official XI announced
    UNIQUE (upcoming_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_upcoming ON squad_selections(upcoming_id);
CREATE INDEX IF NOT EXISTS idx_squad_player   ON squad_selections(player_id);
