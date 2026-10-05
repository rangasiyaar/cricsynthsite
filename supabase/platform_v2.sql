-- CricSynthesis platform v2 — subscription tiers, fast key lookup, quotas, admin
-- Run AFTER schema.sql, auth_schema.sql and upcoming_matches.sql (Supabase SQL Editor).
-- Safe to re-run: every statement is idempotent.

-- ============================================================
-- 1. Plans (subscription tiers). One API key works for every product the
--    account's plan includes. Edit rows here to change limits or entitlements.
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
    plan_id         TEXT PRIMARY KEY,
    name            TEXT    NOT NULL,
    daily_limit     INTEGER NOT NULL,             -- requests per account per UTC day
    max_keys        INTEGER NOT NULL DEFAULT 2,
    products        TEXT[]  NOT NULL,             -- subset of {cricveda, matchsynth, graphsynth}
    sort_order      SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO plans (plan_id, name, daily_limit, max_keys, products, sort_order) VALUES
    ('free',       'Free',       100,    2,  ARRAY['cricveda'],                             0),
    ('pro',        'Pro',        5000,   5,  ARRAY['cricveda', 'matchsynth'],               1),
    ('enterprise', 'Enterprise', 100000, 10, ARRAY['cricveda', 'matchsynth', 'graphsynth'], 2)
ON CONFLICT (plan_id) DO NOTHING;

-- ============================================================
-- 2. Subscriptions — one row per user. No row means the free plan.
--    Assigned from the admin panel until a payment provider is wired in.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id             TEXT NOT NULL REFERENCES plans(plan_id) DEFAULT 'free',
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled')),
    current_period_end  TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
    ON subscriptions FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plans are public" ON plans;
CREATE POLICY "Plans are public" ON plans FOR SELECT USING (TRUE);

-- ============================================================
-- 3. Admin flag
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
-- Make yourself an admin (replace the email):
--   UPDATE user_profiles SET is_admin = TRUE WHERE email = 'you@example.com';

-- ============================================================
-- 4. Fast key lookup. New keys are stored as SHA-256 (keys are 256-bit random
--    tokens, so a fast hash is safe) and found with one indexed query instead
--    of bcrypt-checking every row. Legacy bcrypt rows keep working and are
--    upgraded the first time they are used.
-- ============================================================

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_sha256 TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT;     -- e.g. "cs_live_Ab3x" for display
ALTER TABLE api_keys ALTER COLUMN key_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_sha256 ON api_keys(key_sha256);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ============================================================
-- 5. Atomic usage counter. Returns the account's total for the day after
--    counting this request, which the API compares with the plan limit.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_usage(p_key_id UUID, p_user_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    account_total INTEGER;
BEGIN
    INSERT INTO usage_daily (key_id, user_id, date, request_count)
    VALUES (p_key_id, p_user_id, p_date, 1)
    ON CONFLICT (key_id, date) DO UPDATE SET request_count = usage_daily.request_count + 1;

    UPDATE api_keys SET last_used_at = NOW() WHERE key_id = p_key_id;

    SELECT COALESCE(SUM(request_count), 0) INTO account_total
    FROM usage_daily WHERE user_id = p_user_id AND date = p_date;
    RETURN account_total;
END;
$$;

-- Keys created before user accounts existed have no user_id; count them per key.
CREATE TABLE IF NOT EXISTS usage_daily_unowned (
    key_id          UUID    NOT NULL REFERENCES api_keys(key_id) ON DELETE CASCADE,
    date            DATE    NOT NULL,
    request_count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, date)
);

CREATE OR REPLACE FUNCTION increment_key_usage(p_key_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    key_total INTEGER;
BEGIN
    UPDATE api_keys SET last_used_at = NOW() WHERE key_id = p_key_id;
    INSERT INTO usage_daily_unowned (key_id, date, request_count) VALUES (p_key_id, p_date, 1)
    ON CONFLICT (key_id, date) DO UPDATE SET request_count = usage_daily_unowned.request_count + 1
    RETURNING request_count INTO key_total;
    RETURN key_total;
END;
$$;

-- ============================================================
-- 6. Readable public IDs used in the v2 API (e.g. "p-vk18", "ipl-2026-m042")
-- ============================================================

CREATE TABLE IF NOT EXISTS public_ids (
    entity_type     TEXT    NOT NULL CHECK (entity_type IN ('player', 'match', 'fixture', 'venue', 'team')),
    slug            TEXT    NOT NULL,
    internal_id     TEXT    NOT NULL,             -- player_id / match_id / upcoming_id / venue_id / team name
    PRIMARY KEY (entity_type, slug),
    UNIQUE (entity_type, internal_id)
);

-- ============================================================
-- 7. Fixtures: readable slug + who last edited (admin panel)
-- ============================================================

ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_upcoming_slug ON upcoming_matches(slug);
