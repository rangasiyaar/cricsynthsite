-- CricVeda Auth Schema
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- Requires Supabase Auth to be enabled on the project.

-- ============================================================
-- 1. Add user ownership to api_keys
-- ============================================================

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 2. Daily usage aggregates
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_daily (
    key_id          UUID        NOT NULL REFERENCES api_keys(key_id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    date            DATE        NOT NULL,
    request_count   INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_user  ON usage_daily(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_date  ON usage_daily(date);

-- ============================================================
-- 3. Row Level Security
-- ============================================================

-- api_keys: users manage only their own keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keys"
    ON api_keys FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own keys"
    ON api_keys FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own keys"
    ON api_keys FOR DELETE
    USING (auth.uid() = user_id);

-- usage_daily: users can only see their own usage
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
    ON usage_daily FOR SELECT
    USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by the FastAPI backend)
-- No additional policy needed — the service key already bypasses RLS.

-- ============================================================
-- 4. User profiles (display name + email cache)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name    TEXT,
    email           TEXT,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- Auto-create profile on first sign-in (trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
