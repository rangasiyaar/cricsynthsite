# CricVeda

**Fantasy Cricket Intelligence API** — part of the CricSynthesis platform.

CricVeda provides predictive analytics for fantasy cricket platforms, powered by ball-by-ball data from CricSheet (CC BY 4.0) across 13+ T20 leagues worldwide.

## Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Copy environment variables
cp .env.example .env.local
# Fill in your Supabase + Upstash credentials

# 3. Set up database (run schema.sql in your Supabase SQL editor)
# File: src/lib/db/schema.sql

# 4. Ingest CricSheet data
npm run ingest

# 5. Start development server
npm run dev
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── auth/           # Signup, API key generation
│   │   └── v1/             # Public API endpoints
│   │       ├── health/
│   │       ├── matches/
│   │       ├── players/
│   │       ├── matchups/
│   │       ├── fantasy/
│   │       └── venues/
│   ├── dashboard/          # User dashboard
│   ├── docs/               # API documentation page
│   ├── matches/            # Match detail pages
│   ├── players/            # Player profiles
│   └── playground/         # API playground
├── lib/
│   ├── analytics/          # Core intelligence engine
│   │   ├── confidence.ts   # Multi-factor confidence scoring
│   │   ├── fantasy.ts      # Dream Team, Captain Picks, Differentials
│   │   ├── form-score.ts   # Cross-league form calculator
│   │   ├── matchup.ts      # Batter vs Bowler analysis
│   │   └── venue.ts        # Venue intelligence
│   ├── auth/               # API key auth + rate limiting
│   ├── cache/              # Redis (Upstash) with in-memory fallback
│   ├── db/                 # Supabase client + schema
│   └── middleware.ts       # Auth middleware, response helpers
└── scripts/                # Data pipeline
    ├── ingest-cricsheet.ts
    ├── precompute-insights.ts
    ├── scrape-fixtures.ts
    └── scrape-squads.ts
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run test` | Run unit tests (vitest) |
| `npm run test:watch` | Watch mode |
| `npm run ingest` | Ingest CricSheet ball-by-ball data |
| `npm run scrape:fixtures` | Scrape upcoming match fixtures |
| `npm run scrape:squads` | Scrape squad announcements |
| `npm run precompute` | Pre-compute insights for all upcoming fixtures |

## API Endpoints

All endpoints return responses in the format:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "...", "cached": false, "api_version": "v1" }
}
```

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/health` | No | Health check |
| GET | `/api/v1/matches` | Optional | List upcoming/recent matches |
| GET | `/api/v1/players` | Required | Search players |
| GET | `/api/v1/players/:id` | Required | Player profile |
| GET | `/api/v1/players/:id/form` | Required | Player form score |
| GET | `/api/v1/matchups/batter-vs-bowler` | Required | Head-to-head stats |
| GET | `/api/v1/matches/:id/insights` | Required | Match insights |
| GET | `/api/v1/fantasy/:match_id/dream-team` | Required | AI Dream Team |
| GET | `/api/v1/fantasy/:match_id/captain-picks` | Required | Captain recommendations |
| GET | `/api/v1/venues/:id` | Required | Venue intelligence |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL (falls back to in-memory) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis token |

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Cache:** Upstash Redis
- **Data Source:** CricSheet (ball-by-ball)
- **Testing:** Vitest
- **Deployment:** Vercel (Mumbai region)

## Data Pipeline

1. **Ingest** — Download CricSheet JSON archives → parse → insert into `deliveries` table
2. **Scrape** — Daily cron fetches upcoming fixtures and squad updates
3. **Precompute** — After scraping, compute form scores, dream teams, captain picks, venue analysis for all upcoming matches
4. **Cache** — API responses cached in Redis (TTL 60-300s)

## License

Proprietary. Cricket data sourced from [CricSheet](https://cricsheet.org/) under CC BY 4.0.
