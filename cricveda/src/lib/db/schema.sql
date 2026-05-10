-- ============================================================
-- CricVeda — Database Schema
-- Run this in Supabase SQL Editor to initialize the database.
-- ============================================================

-- Leagues (13 seeded)
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  tier INTEGER DEFAULT 1,
  season TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venues
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  league_id TEXT REFERENCES leagues(id),
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  cricsheet_id TEXT UNIQUE,
  name TEXT NOT NULL,
  country TEXT,
  batting_style TEXT,
  bowling_style TEXT,
  role TEXT CHECK (role IN ('batter', 'bowler', 'allrounder', 'wicketkeeper')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Completed Matches
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  cricsheet_id TEXT UNIQUE,
  league_id TEXT REFERENCES leagues(id),
  venue_id INTEGER REFERENCES venues(id),
  team1_id INTEGER REFERENCES teams(id),
  team2_id INTEGER REFERENCES teams(id),
  date DATE NOT NULL,
  toss_winner_id INTEGER REFERENCES teams(id),
  toss_decision TEXT CHECK (toss_decision IN ('bat', 'field')),
  winner_id INTEGER REFERENCES teams(id),
  result TEXT,
  season TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ball-by-ball Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id BIGSERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  innings INTEGER NOT NULL CHECK (innings IN (1, 2)),
  over_number INTEGER NOT NULL,
  ball_number INTEGER NOT NULL,
  batter_id INTEGER REFERENCES players(id),
  bowler_id INTEGER REFERENCES players(id),
  non_striker_id INTEGER REFERENCES players(id),
  runs_batter INTEGER DEFAULT 0,
  runs_extras INTEGER DEFAULT 0,
  runs_total INTEGER DEFAULT 0,
  is_wicket BOOLEAN DEFAULT FALSE,
  wicket_kind TEXT,
  wicket_player_id INTEGER REFERENCES players(id),
  extras_type TEXT,
  phase TEXT GENERATED ALWAYS AS (
    CASE
      WHEN over_number < 6 THEN 'powerplay'
      WHEN over_number < 16 THEN 'middle'
      ELSE 'death'
    END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upcoming Fixtures
CREATE TABLE IF NOT EXISTS fixtures (
  id SERIAL PRIMARY KEY,
  league_id TEXT REFERENCES leagues(id),
  team1_id INTEGER REFERENCES teams(id),
  team2_id INTEGER REFERENCES teams(id),
  venue_id INTEGER REFERENCES venues(id),
  date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing XI
CREATE TABLE IF NOT EXISTS playing_xi (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, player_id)
);

-- Squad Compositions
CREATE TABLE IF NOT EXISTS squads (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  league_id TEXT REFERENCES leagues(id),
  season TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, player_id, league_id, season)
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT DEFAULT 'Default',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Usage Log
CREATE TABLE IF NOT EXISTS api_usage_log (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-computed Form Scores
CREATE TABLE IF NOT EXISTS form_scores (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  score_type TEXT CHECK (score_type IN ('batting', 'bowling', 'overall')),
  score DECIMAL(4,2) NOT NULL,
  trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),
  confidence DECIMAL(3,2),
  matches_used INTEGER,
  leagues_used INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, score_type)
);

-- Pre-computed Insights (per fixture)
CREATE TABLE IF NOT EXISTS precomputed_insights (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  data JSONB NOT NULL,
  confidence DECIMAL(3,2),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, insight_type)
);

-- Predictions
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id),
  team_a_win_prob DECIMAL(5,4),
  team_b_win_prob DECIMAL(5,4),
  top_performer_id INTEGER REFERENCES players(id),
  key_factors JSONB,
  confidence DECIMAL(3,2),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard Cache
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  league TEXT,
  role TEXT,
  data JSONB NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_deliveries_match ON deliveries(match_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_batter ON deliveries(batter_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_bowler ON deliveries(bowler_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_phase ON deliveries(phase);
CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_fixtures_league ON fixtures(league_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
CREATE INDEX IF NOT EXISTS idx_form_scores_player ON form_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_players_cricsheet ON players(cricsheet_id);
CREATE INDEX IF NOT EXISTS idx_matches_cricsheet ON matches(cricsheet_id);

-- ─── Seed Leagues ───
INSERT INTO leagues (id, name, country, tier) VALUES
  ('ipl', 'Indian Premier League', 'India', 1),
  ('t20i', 'T20 International', 'Global', 1),
  ('bbl', 'Big Bash League', 'Australia', 1),
  ('psl', 'Pakistan Super League', 'Pakistan', 1),
  ('cpl', 'Caribbean Premier League', 'West Indies', 1),
  ('hundred', 'The Hundred', 'England', 1),
  ('sa20', 'SA20', 'South Africa', 1),
  ('lpl', 'Lanka Premier League', 'Sri Lanka', 2),
  ('bpl', 'Bangladesh Premier League', 'Bangladesh', 2),
  ('ilt20', 'International League T20', 'UAE', 2),
  ('mlc', 'Major League Cricket', 'USA', 2),
  ('smat', 'Syed Mushtaq Ali Trophy', 'India', 3),
  ('blast', 'Vitality Blast', 'England', 3)
ON CONFLICT (id) DO NOTHING;
