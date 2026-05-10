# CricVeda — Complete Product Build Prompt (From Scratch)

## Overview

Build **CricVeda** — a fantasy cricket intelligence **API product** that lives at `cricsynthesis.in/cricveda`. It is the first product under the CricSynthesis platform. CricVeda is a pure API engine — it provides REST endpoints for fantasy cricket analytics. A fan-facing analytics dashboard will be built separately on the main CricSynthesis site later.

The product must maintain **exact visual and thematic consistency** with the parent CricSynthesis marketing site at `cricsynthesis.in`.

---

## Architecture

CricVeda is a **Next.js 14 (App Router)** application with TypeScript, deployed as a subdirectory under the CricSynthesis domain. Auth, console, and API keys are **platform-level** (shared across all CricSynthesis products).

```
cricsynthesis.in/              → Static marketing site (already exists)
cricsynthesis.in/login         → Platform auth (shared across all products)
cricsynthesis.in/signup        → Platform auth
cricsynthesis.in/console/*     → Platform console (API keys, usage, settings, docs)
cricsynthesis.in/cricveda      → CricVeda product page (features, endpoint docs, pricing)
cricsynthesis.in/cricveda/api/* → CricVeda REST API endpoints
```

**Key principle:** One account, one login, one API key (`cs_` prefix) for all CricSynthesis products. Plan determines which products/endpoints a user can access.

### Tech Stack

| Layer           | Technology                          | Rationale                                       |
|-----------------|-------------------------------------|------------------------------------------------|
| Framework       | Next.js 14 (App Router)            | SSR + API routes, Vercel deployment             |
| Language        | TypeScript (strict)                | Type safety for analytics types                 |
| Database        | Supabase (PostgreSQL)              | Managed Postgres, free tier, real-time          |
| Cache           | Upstash Redis                      | Serverless Redis, TTL, rate limiting            |
| Auth            | Supabase Auth (email/password + OAuth) | Session management, JWT tokens              |
| Styling         | CSS custom properties (NO Tailwind) | Must match parent CricSynthesis design system  |
| Charts          | Recharts                           | Usage analytics, form trends                    |
| Icons           | Lucide React                       | Consistent icon set                             |
| Animations      | Framer Motion                      | Page transitions, micro-interactions            |
| Testing         | Vitest + Playwright                | Unit + E2E                                      |
| Deployment      | Vercel (Mumbai region `bom1`)      | Edge network, low latency for India             |
| CI/CD           | GitHub Actions                     | Daily data scraping + precomputation            |

---

## Design System — "CricSynthesis Deep Space"

**CRITICAL:** CricVeda MUST inherit the exact same design tokens as the parent CricSynthesis site. No Tailwind — use CSS custom properties and class-based styles.

### Color Palette

```css
:root {
  /* Backgrounds */
  --color-bg-primary: #06080d;
  --color-bg-secondary: #0b0e16;
  --color-bg-tertiary: #111621;
  --color-bg-card: rgba(255, 255, 255, 0.025);
  --color-bg-card-hover: rgba(255, 255, 255, 0.055);
  --color-bg-glass: rgba(13, 17, 28, 0.6);

  /* Borders */
  --color-border: rgba(255, 255, 255, 0.06);
  --color-border-subtle: rgba(255, 255, 255, 0.035);
  --color-border-accent: rgba(99, 102, 241, 0.35);
  --color-border-glow: rgba(129, 140, 248, 0.25);

  /* Text */
  --color-text-primary: #f0f0f5;
  --color-text-secondary: #9ca3b0;
  --color-text-tertiary: #6b7280;
  --color-text-muted: #4b5263;

  /* Accents — Indigo/Purple gradient */
  --color-accent-primary: #6366f1;
  --color-accent-secondary: #818cf8;
  --color-accent-tertiary: #a78bfa;
  --color-accent-glow: rgba(99, 102, 241, 0.12);
  --color-accent-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);

  /* Semantic */
  --color-success: #10b981;
  --color-success-bg: rgba(16, 185, 129, 0.1);
  --color-warning: #f59e0b;
  --color-warning-bg: rgba(245, 158, 11, 0.1);
  --color-danger: #ef4444;
  --color-danger-bg: rgba(239, 68, 68, 0.1);
}
```

### Typography

```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Space Grotesk', 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### UI Patterns

- **Cards**: Glassmorphism with `backdrop-filter: blur(20px)`, subtle border (`--color-border`), hover glow
- **Buttons**: `.btn-primary` uses accent gradient, `.btn-outline` uses border-only, `.btn-ghost` transparent
- **Badges**: Color-coded status indicators (accent, success, warning, danger)
- **Navigation**: Glassmorphism nav with `backdrop-filter: blur(12px)`, sticky top
- **Shadows**: `--shadow-glow: 0 0 40px rgba(99, 102, 241, 0.15)`
- **Border radius**: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-full: 9999px`
- **Noise overlay**: Subtle grain texture `div.noise-overlay` on body

---

## Pages to Build

CricVeda has **two web experiences** plus auth pages. The fan analytics dashboard is **NOT** part of CricVeda — it will be built separately on the main CricSynthesis site later.

---

### CricVeda Product Page (`/cricveda`)

When users click "CricVeda" from the CricSynthesis landing site, they see this product showcase. **Not a landing page competitor** — it's a focused feature/docs/pricing page for the API product.

**Sections:**

1. **Header**
   - CricVeda wordmark + "Fantasy Cricket Intelligence API" tagline
   - Breadcrumb: CricSynthesis → CricVeda
   - CTAs: "Get API Key" → `/console/keys`, "View Docs" → `/console/docs`

2. **API Capabilities Grid** (8 cards)
   - Player Form Scores — cross-league, 0-10 scale with trend detection
   - Batter vs Bowler Matchups — H2H with phase breakdown (PP/middle/death)
   - AI Dream Team Generator — constraint-based optimal XI respecting Dream11 rules
   - Captain & VC Picks — weighted multi-factor scoring with risk levels
   - Venue Intelligence — pace/spin splits, chasing stats, avg scores
   - Differential Finder — underrated picks for competitive advantage
   - Key Battles — top matchups for upcoming fixtures
   - Confidence Scoring — every output carries a 0-1 reliability score

3. **Supported Leagues** — Grid of 13 T20 league badges:
   IPL, T20I, BBL, PSL, CPL, The Hundred, SA20, LPL, BPL, ILT20, MLC, SMAT, Vitality Blast

4. **API Showcase**
   - Interactive code block:
     ```bash
     curl -H "Authorization: Bearer cs_a4f7..." \
       https://cricsynthesis.in/cricveda/api/v1/players/42/form
     ```
   - Animated JSON response below
   - Copy button

5. **Endpoint Reference** (summary table)
   - All endpoints grouped: Players, Matches, Matchups, Venues, Fantasy
   - Method badge, path, description, auth requirement, plan requirement
   - "Full docs" link → `/console/docs`

6. **Pricing**
   | Free ($0/mo) | Pro ($9/mo) | Enterprise (Custom) |
   |---|---|---|
   | 100 calls/day | 5,000 calls/day | 50,000 calls/day |
   | Player form, matches, venue intel | + Dream Team, Captain Picks, Differentials | + Priority support, SLA |
   | Top 3 matchups | Unlimited matchups | Custom integrations |

7. **Footer**
   - Links: CricSynthesis Home, Console, Privacy, Terms
   - "© 2026 CricVeda · A CricSynthesis Product"

---

### Platform Console (`/console/*`)

Auth-required API management hub. **Platform-level** — shared across all CricSynthesis products. Uses a **sidebar layout**.

**Layout (`console/layout.tsx`):**
- Left sidebar (240px):
  - CricSynthesis logo at top
  - Product switcher: CricVeda (active), MatchSynth (coming soon), GraphSynth (coming soon)
  - Nav items: Overview, API Keys, Usage, Docs, Settings
  - Active item has accent highlight
  - User info at bottom (name, email, plan badge)
  - "Back to CricSynthesis" link
- Content area: scrollable, padded
- **Auth guard**: If no session → redirect to `/login`

**Subroutes:**

#### `/console` — Overview
- Welcome banner: "Welcome back, {name}" with plan badge
- 4 metric cards: Calls Today, Daily Limit, Total All-Time, Avg Latency
- Rate limit progress bar (used/limit with color: green < 50%, yellow < 80%, red > 80%)
- Quick actions grid: CricVeda Product Page, API Docs, View Usage
- Recent API activity feed (last 5 calls: endpoint, status, time)
- Active products card: shows which products user has access to based on plan

#### `/console/keys` — API Key Management
- List of user's API keys (table):
  - Key prefix (`cs_a4f7••••`), Name, Created, Last Used, Status (active/revoked)
- **Note:** Key prefix is `cs_` (CricSynthesis-wide), not `cv_`
- "Create New Key" button → modal with name input → generates key → **show full key ONCE** with copy button
- Per-key actions: Copy prefix, Revoke (with confirmation), Regenerate (danger zone)
- Tier permissions panel: shows which endpoints this plan can access per product
- Code snippet: Quick start curl example using their key

#### `/console/usage` — Usage Analytics
- **Product filter**: pills to filter by CricVeda / All (future: MatchSynth, GraphSynth)
- **Daily usage bar chart** (Recharts, last 30 days, calls per day)
- **Endpoint breakdown table**: Endpoint path, Total calls, Avg latency (ms), Error rate (%), Trend arrow
- **Rate limit gauge**: Visual bar of today's usage vs limit
- **Error log table**: Last 20 errors with timestamp, endpoint, HTTP status, error code, message
- **Export button**: Download usage data as CSV

#### `/console/docs` — Interactive API Documentation
- Product tabs at top: CricVeda (active), MatchSynth (coming soon), GraphSynth (coming soon)
- Left sidebar: endpoint groups (Players, Matches, Matchups, Venues, Fantasy, Auth)
- Per endpoint:
  - Method badge (GET/POST/DELETE), Path, Description
  - Auth requirement badge (Required / Optional / Public)
  - PRO badge if only available on paid tier
  - Parameters table: Name, Type, Required, Description
  - Example request (curl) with copy button
  - Example response (formatted JSON) with copy button
  - TypeScript response type
- "Try It" button: executes request with user's API key, shows live response
- Error codes reference table
- Rate limiting explanation section
- Response envelope documentation

#### `/console/settings` — Account Settings
- Profile section: Name (editable), Email (readonly), Avatar upload placeholder
- Subscription section: Current plan, usage this billing cycle, "Upgrade" / "Downgrade" buttons
- Active products: checkboxes showing which products are enabled for this plan
- Webhook configuration: URL input for rate limit breach notifications (future, "Coming Soon")
- Danger zone: Delete account button with confirmation modal ("Type DELETE to confirm")

---

### Auth Pages (Platform-Level)

#### `/login`
- Clean centered card on dark background
- CricSynthesis logo (not CricVeda — this is platform auth)
- Email + Password inputs
- "Log In" button (accent gradient)
- "Don't have an account? Sign up" link → `/signup`
- Error message display
- After success → redirect to `/console`

#### `/signup`
- Centered card with CricSynthesis logo
- Name + Email + Password inputs
- "Create Account" button
- "Already have an account? Log in" link → `/login`
- Terms/Privacy checkbox
- After success → redirect to `/console` (API key auto-generated with `cs_` prefix)

---

## Database Schema

Use Supabase PostgreSQL. Schema file: `src/lib/db/schema.sql`

### Tables

```sql
-- Leagues (13 seeded)
CREATE TABLE leagues (
  id TEXT PRIMARY KEY,           -- 'ipl', 'bbl', 't20i', etc.
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  tier INTEGER DEFAULT 1,        -- 1=major, 2=secondary, 3=domestic
  season TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venues
CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,       -- 'CSK', 'MI', 'RCB'
  league_id TEXT REFERENCES leagues(id),
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  cricsheet_id TEXT UNIQUE,       -- CricSheet registry ID for dedup
  name TEXT NOT NULL,
  country TEXT,
  batting_style TEXT,
  bowling_style TEXT,
  role TEXT CHECK (role IN ('batter', 'bowler', 'allrounder', 'wicketkeeper')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Completed Matches
CREATE TABLE matches (
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

-- Ball-by-ball Deliveries (core data)
CREATE TABLE deliveries (
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
CREATE TABLE fixtures (
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
CREATE TABLE playing_xi (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, player_id)
);

-- Squad compositions
CREATE TABLE squads (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  league_id TEXT REFERENCES leagues(id),
  season TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, player_id, league_id, season)
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,        -- First 11 chars for display (e.g., cs_a4f7c2e)
  key_hash TEXT NOT NULL,          -- SHA-256 hash of full key
  name TEXT DEFAULT 'Default',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Usage Log
CREATE TABLE api_usage_log (
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
CREATE TABLE form_scores (
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
CREATE TABLE precomputed_insights (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,      -- 'dream_team', 'captain_picks', 'key_battles', 'differentials', 'venue_analysis'
  data JSONB NOT NULL,
  confidence DECIMAL(3,2),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, insight_type)
);

-- Predictions (new)
CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id),
  team_a_win_prob DECIMAL(5,4),
  team_b_win_prob DECIMAL(5,4),
  top_performer_id INTEGER REFERENCES players(id),
  key_factors JSONB,
  confidence DECIMAL(3,2),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard Cache (new)
CREATE TABLE leaderboard_cache (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,              -- 'form', 'fantasy', 'consistency', 'rising'
  league TEXT,
  role TEXT,
  data JSONB NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_deliveries_match ON deliveries(match_id);
CREATE INDEX idx_deliveries_batter ON deliveries(batter_id);
CREATE INDEX idx_deliveries_bowler ON deliveries(bowler_id);
CREATE INDEX idx_deliveries_phase ON deliveries(phase);
CREATE INDEX idx_matches_league ON matches(league_id);
CREATE INDEX idx_matches_date ON matches(date);
CREATE INDEX idx_fixtures_league ON fixtures(league_id);
CREATE INDEX idx_fixtures_status ON fixtures(status);
CREATE INDEX idx_form_scores_player ON form_scores(player_id);
CREATE INDEX idx_api_usage_key ON api_usage_log(api_key_id);
CREATE INDEX idx_api_usage_created ON api_usage_log(created_at);
CREATE INDEX idx_players_cricsheet ON players(cricsheet_id);
CREATE INDEX idx_matches_cricsheet ON matches(cricsheet_id);

-- Seed leagues
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
  ('blast', 'Vitality Blast', 'England', 3);
```

---

## Analytics Engine

All analytics live in `src/lib/analytics/`. Each module is a pure function that queries the database and returns typed results.

### Form Score Calculator (`form-score.ts`)
- Fetches last 20 matches per player across all leagues
- Exponential decay weighting (factor 0.92)
- Batting sub-score: Runs (30%), Strike Rate (25%), Boundary % (15%), Impact (10%), Consistency (20%)
- Bowling sub-score: Wickets (30%), Economy (25%), Dot % (20%), Bowling SR (15%), Impact (10%)
- Role-weighted combination: Batter 85/15, Bowler 20/80, All-rounder 50/50
- Trend: compare last 3 vs previous 3 matches
- Output: `{ score: 8.4, trend: 'improving', confidence: 0.91, matches_used: 18, leagues: ['ipl','t20i'] }`

### Matchup Analyzer (`matchup.ts`)
- Queries all deliveries where batter_id = X and bowler_id = Y
- Computes: balls, runs, dismissals, SR, dot %, boundary %, phase breakdown
- Advantage logic: Batter if SR ≥ 140 + dismissal rate < 5%; Bowler if SR < 100 + dismissal rate > 4%
- Minimum 6 balls for statistical relevance
- Generates natural language fantasy note
- Output: Full matchup stats + advantage + fantasy_note + confidence

### Venue Intelligence (`venue.ts`)
- Queries all matches at venue_id = X
- Computes: avg 1st/2nd innings scores, pace vs spin wicket %, bat first %, chasing win %, phase breakdown
- Output: Comprehensive venue report with confidence

### Fantasy Engine (`fantasy.ts`)
- **Dream Team**: Optimal XI respecting Dream11 constraints (11 players, WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6, max 7 per team)
- Expected points: `base_points[role] × (0.5 + form_score/10) + playing_xi_bonus`
- **Captain Picks**: Weighted scoring (Form 35%, Venue 25%, Matchup 20%, Consistency 10%, Role Ceiling 10%), risk levels
- **Differentials**: Players with form 4.0-7.5 sorted by expected points
- **Key Battles**: Top batter-vs-bowler matchups for a fixture

### Confidence Scorer (`confidence.ts`)
- Factors: Match count (0-0.40), League diversity (0-0.25), Data recency (0-0.20), Sample size (0-0.15)
- Tiers: very_high (≥0.85), high (≥0.70), moderate (≥0.50), low (≥0.25), very_low (<0.25)
- Every analytical output carries a confidence score

---

## REST API

### Base URL
```
https://cricsynthesis.in/cricveda/api/v1
```

### Authentication
API key via `Authorization: Bearer cs_xxx` header or `?api_key=cs_xxx` query param.

### Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "...", "cached": false, "cache_age_seconds": null, "api_version": "v1" }
}
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | API status |
| GET | `/players` | Optional | List/search players |
| GET | `/players/:id` | Optional | Player profile |
| GET | `/players/:id/form` | Optional | Form score |
| GET | `/matches` | Optional | Upcoming/recent fixtures |
| GET | `/matches/:id/insights` | Optional | Full match intelligence |
| GET | `/matches/:id/recommendations` | Required | Player recommendations |
| GET | `/matchups/batter-vs-bowler` | Required | H2H analysis |
| GET | `/matchups/key-battles/:match_id` | Required | Top matchups for a match |
| GET | `/fantasy/:match_id/dream-team` | Required | AI dream team |
| GET | `/fantasy/:match_id/captain-picks` | Required | Captain recommendations |
| GET | `/venues/:id` | Required | Venue intelligence |
| GET | `/predictions/:match_id` | Required | Win prediction |
| GET | `/leaderboards` | Optional | Form/fantasy leaderboards |
| POST | `/auth/signup` | No | Create account |
| POST | `/auth/login` | No | Login |
| POST | `/auth/api-key` | Required | Generate new key |
| GET | `/console/usage` | Required | Usage stats (last 30 days) |
| GET | `/console/keys` | Required | List user's API keys |
| POST | `/console/keys` | Required | Create new API key |
| DELETE | `/console/keys/:id` | Required | Revoke API key |

### Rate Limits
| Plan | Daily | Burst/sec |
|------|-------|-----------|
| Free | 100 | 10 |
| Pro | 5,000 | 50 |
| Enterprise | 50,000 | 200 |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Caching (Upstash Redis)
| Endpoint | TTL |
|----------|-----|
| Player list | 300s |
| Player profile | 600s |
| Form score | 1800s |
| Match list | 120s |
| Match insights | 300s |
| Matchup data | 300s |
| Falls back to in-memory Map if Redis unavailable |

---

## Data Pipeline

### Scripts (`src/scripts/`)

1. **`ingest-cricsheet.ts`** — Downloads CricSheet JSON archives, parses ball-by-ball data, inserts into DB
2. **`scrape-fixtures.ts`** — Scrapes upcoming match schedules
3. **`scrape-squads.ts`** — Scrapes confirmed/predicted squad compositions
4. **`precompute-insights.ts`** — Batch computation: form scores → dream teams → captain picks → key battles → differentials → venue analysis

### GitHub Actions
- **daily-scrape.yml**: Cron 03:00 UTC — scrape fixtures → scrape squads → precompute insights
- **precompute.yml**: Manual dispatch with optional fixture_id

### NPM Scripts
```bash
npm run ingest           # CricSheet ingestion
npm run scrape:fixtures  # Scrape upcoming fixtures
npm run scrape:squads    # Scrape squad updates
npm run precompute       # Pre-compute all insights
```

---

## File Structure

```
cricveda/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Redirect → /cricveda
│   │   ├── layout.tsx                        # Root layout (fonts, globals, noise overlay)
│   │   ├── globals.css                       # Global styles (design system)
│   │   ├── login/page.tsx                    # Platform Auth: Login
│   │   ├── signup/page.tsx                   # Platform Auth: Signup
│   │   ├── cricveda/page.tsx                 # CricVeda Product Page (features, docs, pricing)
│   │   ├── console/
│   │   │   ├── layout.tsx                    # Console sidebar + auth guard
│   │   │   ├── page.tsx                      # Console Overview
│   │   │   ├── keys/page.tsx                 # API Key Management
│   │   │   ├── usage/page.tsx                # Usage Analytics
│   │   │   ├── settings/page.tsx             # Account Settings
│   │   │   └── docs/page.tsx                 # Interactive API Docs
│   │   ├── admin/page.tsx                    # Admin Panel
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── signup/route.ts
│   │       │   ├── login/route.ts
│   │       │   └── api-key/route.ts
│   │       ├── console/
│   │       │   ├── usage/route.ts
│   │       │   └── keys/route.ts
│   │       └── v1/
│   │           ├── health/route.ts
│   │           ├── players/route.ts
│   │           ├── players/[id]/route.ts
│   │           ├── players/[id]/form/route.ts
│   │           ├── matches/route.ts
│   │           ├── matches/[id]/insights/route.ts
│   │           ├── matches/[id]/recommendations/route.ts
│   │           ├── matchups/batter-vs-bowler/route.ts
│   │           ├── matchups/key-battles/[match_id]/route.ts
│   │           ├── fantasy/[match_id]/dream-team/route.ts
│   │           ├── fantasy/[match_id]/captain-picks/route.ts
│   │           ├── venues/[id]/route.ts
│   │           ├── predictions/[match_id]/route.ts
│   │           └── leaderboards/route.ts
│   ├── lib/
│   │   ├── types.ts                          # All TypeScript interfaces
│   │   ├── middleware.ts                     # Auth middleware + response helpers
│   │   ├── db/
│   │   │   ├── schema.sql                    # PostgreSQL schema
│   │   │   └── supabase.ts                   # DB client + query helpers
│   │   ├── cache/
│   │   │   └── redis.ts                      # Redis + in-memory fallback
│   │   ├── auth/
│   │   │   ├── api-key.ts                    # Key generation, hashing, validation
│   │   │   └── rate-limit.ts                 # Daily rate limiting
│   │   └── analytics/
│   │       ├── form-score.ts                 # Form score calculator
│   │       ├── matchup.ts                    # Matchup analyzer
│   │       ├── venue.ts                      # Venue intelligence
│   │       ├── fantasy.ts                    # Dream team + captain picks
│   │       └── confidence.ts                 # Confidence scoring
│   └── scripts/
│       ├── ingest-cricsheet.ts
│       ├── precompute-insights.ts
│       ├── scrape-fixtures.ts
│       └── scrape-squads.ts
├── data/cricsheet/                           # Downloaded CricSheet data
├── .github/workflows/
│   ├── daily-scrape.yml
│   └── precompute.yml
├── package.json
├── tsconfig.json
├── next.config.js
├── vercel.json
├── vitest.config.ts
├── .env.example
└── README.md
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# App
NEXT_PUBLIC_APP_URL=https://cricsynthesis.in/cricveda
```

---

## Key Implementation Rules

1. **NO Tailwind CSS** — Use CSS custom properties and class-based styles matching the parent CricSynthesis design system
2. **Shared components** — Extract reusable components: `<Nav>`, `<Footer>`, `<ConfidenceBadge>`, `<ApiKeyCard>`, `<UsageChart>`, `<EndpointCard>`, `<PricingTable>`
3. **Error boundaries** — Every section should have error handling with retry buttons
4. **Loading states** — Skeleton loaders for all async data
5. **Mobile responsive** — Works on all breakpoints (test at 375px, 768px, 1024px, 1440px)
6. **Accessibility** — Semantic HTML, ARIA labels, keyboard navigation
7. **SEO** — Meta tags, Open Graph, structured data for match/player pages
8. **Type safety** — Strict TypeScript, no `any`, proper interface definitions for all API responses
9. **Security** — bcrypt for password hashing (not SHA-256), API keys stored as SHA-256 hashes only, Supabase RLS policies
10. **Demo data** — All pages should work with mock/demo data when database is not connected, graceful fallback

---

## Priority Order

1. **Core infrastructure** — Project setup, DB schema, types, middleware, cache
2. **Analytics engine** — form-score, matchup, venue, fantasy, confidence
3. **API routes** — All REST endpoints with auth + caching + rate limiting
4. **Auth pages** — Login/Signup (platform-level with CricSynthesis branding)
5. **Platform Console** — API key management, usage analytics, interactive docs, settings
6. **CricVeda Product Page** — Feature showcase, endpoint reference, pricing
7. **Data pipeline** — Ingestion, scraping, precomputation scripts
8. **Admin panel** — Internal management tool
9. **Testing** — Unit tests + E2E tests
10. **Deployment** — Vercel config, CI/CD workflows

---

## Success Criteria

- [ ] `cricsynthesis.in/cricveda` shows API product page with features, endpoint reference, pricing
- [ ] CricSynthesis marketing site links to `/cricveda` and `/console`
- [ ] Auth flow works end-to-end (signup → get `cs_` key → use API → see usage in console)
- [ ] Console shows real usage data, allows key CRUD, displays plan info
- [ ] Console has product switcher (CricVeda active, others "coming soon")
- [ ] Console docs page has interactive "Try It" for all endpoints
- [ ] API key uses `cs_` prefix (platform-wide, not product-specific)
- [ ] All 18+ CricVeda API endpoints return proper JSON envelope with rate limit headers
- [ ] Analytics engine computes form scores, matchups, venue intel, dream teams, captain picks
- [ ] Every analytical output carries a confidence score
- [ ] Mobile responsive across all pages
- [ ] Dark theme exactly matches CricSynthesis brand (same CSS variables, fonts, card styles)
- [ ] All pages work with demo data when DB is not connected
- [ ] Production build passes with zero type errors
