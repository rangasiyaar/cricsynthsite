-- ============================================================
-- CricVeda Database Schema
-- Supabase PostgreSQL
-- Version 1.0 — March 2026
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── LEAGUES ───
CREATE TABLE IF NOT EXISTS leagues (
  id            TEXT PRIMARY KEY,                -- e.g. 'ipl', 'bbl', 't20i'
  name          TEXT NOT NULL,                   -- e.g. 'Indian Premier League'
  country       TEXT,
  tier          SMALLINT DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  season_months TEXT,                            -- e.g. 'Mar-May'
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── VENUES ───
CREATE TABLE IF NOT EXISTS venues (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT,
  country       TEXT,
  capacity      INT,
  cricsheet_id  TEXT UNIQUE,
  avg_1st_score NUMERIC(6,2),
  avg_2nd_score NUMERIC(6,2),
  pace_pct      NUMERIC(5,2),                   -- % wickets to pace
  spin_pct      NUMERIC(5,2),                   -- % wickets to spin
  toss_win_bat_pct NUMERIC(5,2),
  matches_count INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TEAMS ───
CREATE TABLE IF NOT EXISTS teams (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  short_name    TEXT,                            -- e.g. 'CSK', 'MI'
  league_id     TEXT REFERENCES leagues(id),
  country       TEXT,
  logo_url      TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, league_id)
);

-- ─── PLAYERS ───
CREATE TABLE IF NOT EXISTS players (
  id            SERIAL PRIMARY KEY,
  cricsheet_id  TEXT UNIQUE NOT NULL,            -- CricSheet people register ID
  espncricinfo_id TEXT,
  name          TEXT NOT NULL,
  full_name     TEXT,
  country       TEXT,
  dob           DATE,
  batting_style TEXT,                            -- 'right-hand bat', 'left-hand bat'
  bowling_style TEXT,                            -- 'right-arm fast', 'left-arm orthodox', etc.
  role          TEXT DEFAULT 'unknown',          -- 'batter', 'bowler', 'allrounder', 'wicketkeeper'
  is_overseas   BOOLEAN DEFAULT false,
  metadata_source TEXT DEFAULT 'cricsheet',      -- 'cricsheet', 'wikidata', 'cricapi', 'manual'
  metadata_complete BOOLEAN DEFAULT false,
  t20_matches   INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_players_country ON players(country);
CREATE INDEX IF NOT EXISTS idx_players_role ON players(role);

-- ─── MATCHES ───
CREATE TABLE IF NOT EXISTS matches (
  id            SERIAL PRIMARY KEY,
  cricsheet_id  TEXT UNIQUE,
  league_id     TEXT REFERENCES leagues(id),
  season        TEXT,                            -- e.g. '2024/25', '2025'
  match_number  INT,
  date          DATE NOT NULL,
  venue_id      INT REFERENCES venues(id),
  team1_id      INT REFERENCES teams(id),
  team2_id      INT REFERENCES teams(id),
  toss_winner_id INT REFERENCES teams(id),
  toss_decision TEXT,                            -- 'bat', 'field'
  winner_id     INT REFERENCES teams(id),
  result        TEXT,                            -- 'runs', 'wickets', 'tie', 'no result'
  result_margin INT,
  team1_score   INT,
  team1_wickets INT,
  team1_overs   NUMERIC(4,1),
  team2_score   INT,
  team2_wickets INT,
  team2_overs   NUMERIC(4,1),
  is_completed  BOOLEAN DEFAULT false,
  is_ingested   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_venue ON matches(venue_id);

-- ─── DELIVERIES (ball-by-ball) ───
CREATE TABLE IF NOT EXISTS deliveries (
  id              BIGSERIAL PRIMARY KEY,
  match_id        INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings         SMALLINT NOT NULL,             -- 1 or 2
  over_number     SMALLINT NOT NULL,             -- 0-19
  ball_number     SMALLINT NOT NULL,             -- 1-6+
  batter_id       INT NOT NULL REFERENCES players(id),
  bowler_id       INT NOT NULL REFERENCES players(id),
  non_striker_id  INT REFERENCES players(id),
  runs_batter     SMALLINT DEFAULT 0,
  runs_extras     SMALLINT DEFAULT 0,
  runs_total      SMALLINT DEFAULT 0,
  extra_type      TEXT,                          -- 'wide', 'noball', 'bye', 'legbye', 'penalty'
  is_wicket       BOOLEAN DEFAULT false,
  wicket_kind     TEXT,                          -- 'bowled', 'caught', 'lbw', 'run out', etc.
  wicket_player_id INT REFERENCES players(id),
  is_boundary     BOOLEAN DEFAULT false,
  is_six          BOOLEAN DEFAULT false,
  is_dot          BOOLEAN DEFAULT false,
  phase           TEXT GENERATED ALWAYS AS (
    CASE
      WHEN over_number BETWEEN 0 AND 5 THEN 'powerplay'
      WHEN over_number BETWEEN 6 AND 15 THEN 'middle'
      ELSE 'death'
    END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_del_match ON deliveries(match_id);
CREATE INDEX IF NOT EXISTS idx_del_batter ON deliveries(batter_id);
CREATE INDEX IF NOT EXISTS idx_del_bowler ON deliveries(bowler_id);
CREATE INDEX IF NOT EXISTS idx_del_phase ON deliveries(phase);
CREATE INDEX IF NOT EXISTS idx_del_batter_bowler ON deliveries(batter_id, bowler_id);

-- ─── FIXTURES (upcoming matches) ───
CREATE TABLE IF NOT EXISTS fixtures (
  id              SERIAL PRIMARY KEY,
  league_id       TEXT REFERENCES leagues(id),
  season          TEXT,
  match_number    INT,
  date            DATE NOT NULL,
  time            TIME,
  venue_id        INT REFERENCES venues(id),
  team1_id        INT REFERENCES teams(id),
  team2_id        INT REFERENCES teams(id),
  status          TEXT DEFAULT 'upcoming',       -- 'upcoming', 'live', 'completed'
  insights_ready  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures(date);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);

-- ─── PLAYING XI ───
CREATE TABLE IF NOT EXISTS playing_xi (
  id              SERIAL PRIMARY KEY,
  fixture_id      INT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id         INT NOT NULL REFERENCES teams(id),
  player_id       INT NOT NULL REFERENCES players(id),
  batting_order   SMALLINT,
  is_captain      BOOLEAN DEFAULT false,
  is_wk           BOOLEAN DEFAULT false,
  status          TEXT DEFAULT 'predicted',      -- 'predicted', 'confirmed'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, team_id, player_id)
);

-- ─── SQUADS ───
CREATE TABLE IF NOT EXISTS squads (
  id              SERIAL PRIMARY KEY,
  team_id         INT NOT NULL REFERENCES teams(id),
  player_id       INT NOT NULL REFERENCES players(id),
  season          TEXT NOT NULL,
  league_id       TEXT REFERENCES leagues(id),
  price           NUMERIC(6,1),                  -- auction price in crores
  is_overseas     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, player_id, season, league_id)
);

-- ─── USERS ───
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  plan            TEXT DEFAULT 'free',           -- 'free', 'pro', 'enterprise'
  is_admin        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── API KEYS ───
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash        TEXT NOT NULL,                 -- SHA-256 hash, never plaintext
  key_prefix      TEXT NOT NULL,                 -- first 8 chars for display
  name            TEXT DEFAULT 'Default',
  tier            TEXT DEFAULT 'free',           -- 'free', 'pro'
  daily_limit     INT DEFAULT 100,               -- 100 free, 5000 pro
  calls_today     INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);

-- ─── FORM SCORES (pre-computed) ───
CREATE TABLE IF NOT EXISTS form_scores (
  id              SERIAL PRIMARY KEY,
  player_id       INT NOT NULL REFERENCES players(id),
  score_type      TEXT NOT NULL,                 -- 'batting', 'bowling', 'overall'
  score           NUMERIC(4,2) NOT NULL,         -- 0.00 - 10.00
  trend           TEXT DEFAULT 'stable',         -- 'improving', 'declining', 'stable'
  confidence      NUMERIC(3,2) NOT NULL,         -- 0.00 - 1.00
  matches_used    INT DEFAULT 0,
  leagues_used    TEXT[],                         -- array of league IDs used
  data_sources    TEXT[],
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, score_type)
);

CREATE INDEX IF NOT EXISTS idx_form_player ON form_scores(player_id);

-- ─── PRECOMPUTED INSIGHTS ───
CREATE TABLE IF NOT EXISTS precomputed_insights (
  id              SERIAL PRIMARY KEY,
  fixture_id      INT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  insight_type    TEXT NOT NULL,                  -- 'dream_team', 'captain_picks', 'venue_analysis', 'key_battles', 'differentials', 'match_insights'
  data            JSONB NOT NULL,
  confidence      NUMERIC(3,2),
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, insight_type)
);

CREATE INDEX IF NOT EXISTS idx_insights_fixture ON precomputed_insights(fixture_id);

-- ─── API USAGE LOG ───
CREATE TABLE IF NOT EXISTS api_usage_log (
  id              BIGSERIAL PRIMARY KEY,
  api_key_id      UUID REFERENCES api_keys(id),
  endpoint        TEXT NOT NULL,
  status_code     SMALLINT,
  response_ms     INT,
  called_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_key ON api_usage_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON api_usage_log(called_at);

-- ─── SEED LEAGUES ───
INSERT INTO leagues (id, name, country, tier) VALUES
  ('ipl',     'Indian Premier League',       'India',        1),
  ('t20i',    'T20 International',           NULL,           1),
  ('bbl',     'Big Bash League',             'Australia',    1),
  ('psl',     'Pakistan Super League',       'Pakistan',     1),
  ('cpl',     'Caribbean Premier League',    'West Indies',  1),
  ('hundred', 'The Hundred',                 'England',      1),
  ('sa20',    'SA20',                        'South Africa', 1),
  ('lpl',     'Lanka Premier League',        'Sri Lanka',    2),
  ('bpl',     'Bangladesh Premier League',   'Bangladesh',   2),
  ('ilt20',   'International League T20',    'UAE',          2),
  ('mlc',     'Major League Cricket',        'USA',          2),
  ('smat',    'Syed Mushtaq Ali Trophy',     'India',        3),
  ('blast',   'Vitality Blast',              'England',      3)
ON CONFLICT (id) DO NOTHING;
