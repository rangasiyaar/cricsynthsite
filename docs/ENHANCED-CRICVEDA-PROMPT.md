# CricVeda — Enhanced Product Build Prompt

## Context

CricSynthesis (cricsynthesis.in) is a cricket intelligence platform with three products:
- **CricVeda** — Fantasy cricket analytics API + Fan dashboard (active)
- **MatchSynth** — Match simulation engine for franchises (planned)
- **GraphSynth** — Broadcast-quality data visualizations (planned)

CricVeda is a Next.js 14 (App Router) application with TypeScript, Supabase (PostgreSQL), Upstash Redis, deployed on Vercel. Data source: CricSheet ball-by-ball (CC BY 4.0) across 13 T20 leagues.

---

## What to Build

When a user visits **cricsynthesis.in/cricveda**, they land on the CricVeda product experience. The product has **three distinct layers**:

---

### LAYER 1: Product Landing (`/cricveda`)

A polished product page (public, no auth) that explains CricVeda as an API-first analytics product.

**Sections:**
1. **Hero** — "Fantasy Cricket Intelligence API" with a live API response animation/preview
2. **Features Grid** — Each API capability as a card:
   - Player Form Scores (cross-league, 0-10 scale)
   - Batter vs Bowler Matchups (H2H with phase breakdown)
   - AI Dream Team Generator (constraint-based optimal XI)
   - Captain & VC Picks (weighted multi-factor scoring)
   - Venue Intelligence (pace/spin splits, chasing stats)
   - Differential Finder (underrated picks)
   - Key Battles (top matchups for upcoming fixtures)
   - Confidence Scoring (every output carries a reliability score)
3. **API Showcase** — Interactive code snippet showing a curl request → JSON response (copy-pasteable)
4. **Pricing Table** — Free ($0, 100 calls/day), Pro ($9/mo, 5K calls/day), Enterprise (custom, 50K/day)
5. **Supported Leagues** — Visual grid of 13 T20 leagues with logos/flags
6. **CTA** — "Get Your API Key" → redirects to `/cricveda/console` (requires login)
7. **Footer** — Links back to cricsynthesis.in, other products, socials

**Design:** Dark theme, minimal, modern SaaS aesthetic. Accent colors (indigo/emerald gradient). Subtle grid background, glassmorphism cards.

---

### LAYER 2: Developer Console (`/cricveda/console`) — Requires Authentication

After login (email/password via Supabase Auth), the user lands on their **Developer Console**. This is the API management hub.

**Subroutes:**

#### `/cricveda/console` (Overview)
- Welcome card with user name, plan badge, member since
- Quick metrics: Calls today, daily limit, total all-time calls, avg latency
- Quick links to Docs, Playground, Analytics Dashboard

#### `/cricveda/console/keys`
- List of API keys (prefix `cv_****`, created date, last used, status active/revoked)
- Create new key (name it, select scope if applicable)
- Reveal full key (show once, copy to clipboard)
- Regenerate key (danger zone, with confirmation modal)
- Revoke key
- Key permissions display (which endpoints this key can access based on tier)

#### `/cricveda/console/usage`
- **Daily usage chart** (bar chart, last 30 days, calls per day)
- **Endpoint breakdown table** — Which endpoints are called most, avg latency, error rate
- **Rate limit status** — Visual progress bar of today's usage vs limit
- **Response time heatmap** — Latency distribution across time of day
- **Error log** — Recent 4xx/5xx responses with timestamp, endpoint, error code
- **Export** — Download usage data as CSV

#### `/cricveda/console/settings`
- Account info (email, name, plan)
- Upgrade/downgrade plan (Stripe integration placeholder)
- Webhook URL configuration (future: get notified on rate limit breach)
- Delete account (danger zone)

#### `/cricveda/console/docs`
- Full interactive API documentation (OpenAPI-style)
- Per-endpoint: method, path, description, auth requirement, parameters, example request/response
- "Try it" button that hits the live API with the user's key
- Response schema with TypeScript types
- Error codes reference table
- Rate limiting explanation
- SDKs & libraries section (future)

---

### LAYER 3: Fan-Facing Analytics Dashboard (`/cricveda/dashboard`) — Public + Enhanced with Auth

This is the consumer-facing cricket analytics engine. Accessible to everyone, but authenticated users get richer data.

**Navigation:** Horizontal tab bar at top with tabs:

#### Tab: **Upcoming Matches** (`/cricveda/dashboard/matches`)
- List of upcoming T20 fixtures across all 13 leagues
- Filter by league, date range
- Each match card shows:
  - Teams with logos, venue, date/time (localized)
  - Match format badge (IPL, BBL, PSL, etc.)
  - Quick insight: "CSK favored — 65% win probability" (if precomputed)
  - Click → Match Detail page

#### Tab: **Match Detail** (`/cricveda/dashboard/matches/[id]`)
- Full match overview:
  - Teams, venue, toss info (if available), playing XI
  - **AI Dream Team** — Visual XI layout (cricket field graphic or grid)
  - **Captain Picks** — Top 3 with reasoning, risk level badge
  - **Key Battles** — Top 5 batter-vs-bowler matchups with advantage indicator
  - **Venue Intelligence** — Avg scores, pace/spin split chart, chasing win %
  - **Differentials** — Under-the-radar picks with expected points
  - **Win Prediction** — Team A vs Team B probability bar (based on form + venue + H2H)
  - Confidence scores shown on every insight

#### Tab: **Players** (`/cricveda/dashboard/players`)
- Searchable player directory (search by name, filter by role, country, league)
- Player cards showing: name, team, role, current form score (0-10 gauge), trend arrow
- Click → Player Profile

#### Tab: **Player Profile** (`/cricveda/dashboard/players/[id]`)
- Header: Player photo placeholder, name, team, role, country flag
- **Form Score** — Large gauge (0-10) with trend (improving/stable/declining)
- **Recent Performances** — Last 10 innings table with runs, SR, wickets, econ
- **Cross-League Form** — Shows form computed across all leagues (not just current tournament)
- **Matchup Explorer** — Pick a bowler/batter to see H2H stats
- **Fantasy Value** — Expected points per match, consistency chart
- **Form Breakdown** — Spider chart: power hitting, consistency, boundary %, impact innings, dot ball avoidance

#### Tab: **Matchups** (`/cricveda/dashboard/matchups`)
- Two-player selector: Pick batter + bowler
- Results panel:
  - Total balls faced, runs scored, dismissals
  - Strike rate, dot %, boundary %
  - Phase breakdown (powerplay/middle/death) as stacked bar
  - Advantage badge: "Batter Dominant" / "Bowler Dominant" / "Even"
  - Fantasy note (natural language insight)
  - Historical encounters timeline
  - Confidence score

#### Tab: **Predictions** (`/cricveda/dashboard/predictions`)
- Upcoming matches with AI-generated predictions:
  - Win probability (Team A vs Team B)
  - Top performer prediction (who will score most fantasy points)
  - Key factors (venue bias, form differential, H2H dominance)
  - Prediction confidence level
- Historical prediction accuracy tracker (% correct over past matches)

#### Tab: **Leaderboards** (`/cricveda/dashboard/leaderboards`)
- **Form Leaderboard** — Top 20 players by current form score, filterable by role/league
- **Fantasy Points Leaderboard** — Top performers of the current week/month
- **Consistency Kings** — Players with lowest variance in fantasy output
- **Rising Stars** — Players with biggest form improvement in last 14 days

---

## Technical Implementation Notes

### Routing Structure
```
src/app/
├── page.tsx                              # CricVeda product landing (Layer 1)
├── console/                              # Developer Console (Layer 2)
│   ├── layout.tsx                        # Console shell with sidebar nav, auth guard
│   ├── page.tsx                          # Console overview
│   ├── keys/page.tsx                     # API key management
│   ├── usage/page.tsx                    # Usage analytics
│   ├── settings/page.tsx                 # Account settings
│   └── docs/page.tsx                     # Interactive API docs
├── dashboard/                            # Fan Analytics Dashboard (Layer 3)
│   ├── layout.tsx                        # Dashboard shell with horizontal tab nav
│   ├── page.tsx                          # Redirects to /dashboard/matches
│   ├── matches/
│   │   ├── page.tsx                      # Upcoming matches list
│   │   └── [id]/page.tsx                 # Match detail with insights
│   ├── players/
│   │   ├── page.tsx                      # Player directory
│   │   └── [id]/page.tsx                 # Player profile
│   ├── matchups/page.tsx                 # H2H matchup explorer
│   ├── predictions/page.tsx             # AI predictions
│   └── leaderboards/page.tsx            # Form & fantasy leaderboards
├── api/                                  # REST API (unchanged)
│   ├── auth/
│   └── v1/
└── (auth)/                               # Auth pages
    ├── login/page.tsx
    └── signup/page.tsx
```

### Auth Flow
- Use Supabase Auth (email/password + OAuth providers: Google, GitHub)
- Console routes are protected by middleware (redirect to `/login` if unauthenticated)
- Dashboard is publicly accessible, but authenticated users see:
  - Full dream team (free users see top 3 only)
  - Unlimited matchup lookups (free = 5/day without auth)
  - Prediction confidence details
  - Personalized watchlist

### Data Flow
- Dashboard pages call the internal API routes (`/api/v1/*`) using the user's API key (stored in cookie/localStorage after login)
- Unauthenticated dashboard users get public data (matches list, basic player info, limited insights)
- Console usage charts query `api_usage_log` table grouped by day/endpoint

### UI/UX Requirements
- **Framework:** Next.js 14 App Router with React Server Components where possible
- **Styling:** Tailwind CSS (migrate from current inline styles) + shadcn/ui components
- **Icons:** Lucide React
- **Charts:** Recharts (for usage charts, form trends, win probability bars)
- **Animations:** Framer Motion for page transitions and micro-interactions
- **Theme:** Dark-first design (current brand colors preserved):
  - Background: `#0a0a0f` → `#12121a`
  - Cards: glassmorphism with subtle border glow
  - Accent gradient: indigo-500 → emerald-400
  - Text: white/gray-300/gray-500 hierarchy
- **Responsive:** Mobile-first, works on all breakpoints
- **Loading states:** Skeleton loaders for all async data
- **Error boundaries:** Per-section error handling with retry buttons

### Key Components to Build
- `<ConsoleLayout />` — Sidebar with nav items (Overview, Keys, Usage, Settings, Docs)
- `<DashboardLayout />` — Top tab bar + content area
- `<AuthGuard />` — HOC/middleware that redirects unauthenticated users
- `<ApiKeyCard />` — Reusable key display with copy/reveal/revoke
- `<UsageChart />` — Daily usage bar chart (Recharts)
- `<MatchCard />` — Fixture card with teams, venue, quick insight
- `<PlayerCard />` — Player card with form gauge and trend
- `<FormGauge />` — Circular/linear gauge showing 0-10 score
- `<MatchupPanel />` — Side-by-side batter vs bowler comparison
- `<DreamTeamGrid />` — 11-player grid with role badges and expected points
- `<CaptainPickCard />` — Captain recommendation with reasoning
- `<VenueIntelCard />` — Venue stats visualization
- `<ConfidenceBadge />` — Color-coded confidence indicator
- `<WinProbabilityBar />` — Horizontal bar showing Team A % vs Team B %
- `<PricingTable />` — 3-tier pricing comparison

### API Endpoints Needed (New)
```
POST /api/auth/login          — Login with email/password, return session
POST /api/auth/logout         — Destroy session
GET  /api/auth/me             — Get current user profile
GET  /api/console/usage       — Usage stats for current user (last 30 days)
GET  /api/console/keys        — List user's API keys
POST /api/console/keys        — Create new API key
DELETE /api/console/keys/[id] — Revoke API key
GET  /api/v1/predictions/[match_id] — Win prediction for a match (new endpoint)
GET  /api/v1/leaderboards     — Form/fantasy leaderboards (new endpoint)
```

### Database Additions
```sql
-- Add to existing schema:
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';

-- Predictions table (new)
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

-- Leaderboard cache (new)
CREATE TABLE leaderboard_cache (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL, -- 'form', 'fantasy', 'consistency', 'rising'
  league TEXT,
  role TEXT,
  data JSONB NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Priority Order

1. **Layer 1** (Product Landing) — First impression, drives signups
2. **Layer 2** (Developer Console) — Core monetization, API key management
3. **Layer 3** (Fan Dashboard) — Engagement, retention, SEO traffic

---

## Success Criteria

- [ ] Visiting `/cricveda` shows a stunning product page with clear value prop
- [ ] Clicking "Get API Key" routes to login → console with key generation
- [ ] Console shows real usage data, allows key CRUD, displays plan info
- [ ] Dashboard tab opens a full analytics engine with 6+ tabs
- [ ] Match detail page shows AI Dream Team, Captain Picks, Key Battles, Venue Intel
- [ ] Player profiles show form score gauge, trend, cross-league performance
- [ ] Matchup explorer allows picking any batter/bowler pair and showing H2H
- [ ] All insights carry confidence scores
- [ ] Mobile responsive across all pages
- [ ] Auth flow works end-to-end (signup → get key → use API → see usage)
- [ ] Dark theme consistent with CricSynthesis brand
