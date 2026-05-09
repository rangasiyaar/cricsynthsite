# CricSynthesis — Complete Project Report

**Document Version:** 1.0  
**Date:** May 9, 2026  
**Author:** Project Analysis  
**Classification:** Internal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Overview](#2-platform-overview)
3. [Product Architecture](#3-product-architecture)
4. [CricVeda — Detailed Breakdown](#4-cricveda--detailed-breakdown)
5. [Database Schema](#5-database-schema)
6. [Analytics Engine](#6-analytics-engine)
7. [API Reference](#7-api-reference)
8. [Fan-Facing Dashboard](#8-fan-facing-dashboard)
9. [Data Pipeline](#9-data-pipeline)
10. [Authentication & Security](#10-authentication--security)
11. [Infrastructure & Deployment](#11-infrastructure--deployment)
12. [Design System](#12-design-system)
13. [File Inventory](#13-file-inventory)
14. [Current Status & Gaps](#14-current-status--gaps)
15. [Roadmap & Next Steps](#15-roadmap--next-steps)

---

## 1. Executive Summary

**CricSynthesis** is a cricket intelligence platform that delivers analytics as APIs and consumer-facing dashboards. It targets three markets:

| Product | Target Audience | Status |
|---------|----------------|--------|
| **CricVeda** | Fantasy cricket fans & platforms (Dream11, etc.) | Active development — ~85% complete |
| **MatchSynth** | Professional franchises, match simulation | Planned — no code |
| **GraphSynth** | Broadcasters, data visualization | Planned — no code |

The platform is positioned as **"Private Beta — Invite Only"** with a freemium pricing model ($0 free tier, $9/mo Pro).

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL), Upstash Redis, Vitest, Vercel.

**Data Source:** CricSheet (cricsheet.org) — ball-by-ball data under CC BY 4.0, covering 13 T20 leagues globally.

---

## 2. Platform Overview

### 2.1 Repository Structure

```
cricsynthesis/
├── index.html                    # Marketing landing page (static)
├── docs.html                     # Internal document center (static)
├── privacy.html                  # Privacy policy
├── terms.html                    # Terms of service
├── css/index.css                 # Marketing site styles (59KB)
├── js/index.js                   # Marketing site JavaScript (18KB)
├── assets/
│   └── logo New.png              # CricSynthesis logo (169KB)
├── docs/cricveda/                # 8 product planning documents (HTML)
│   ├── cricveda-product-vision-doc 1.html
│   ├── cricveda-problem-statement-doc 2.html
│   ├── cricveda-competitive-analysis-doc 3.html
│   ├── cricveda-problem-statement-doc 4.html
│   ├── cricveda-market-sizing-doc 5.html
│   ├── cricveda-product-requirement-document-doc6.html
│   ├── cricveda-mvp-scope-doc7.html
│   └── cricveda-decision-log-doc8.html
├── .github/workflows/            # (empty — root-level CI/CD)
└── cricveda/                     # Next.js application
    ├── src/
    │   ├── app/                  # 10 route directories, 14 page/route files
    │   ├── lib/                  # Core logic — 13 files
    │   └── scripts/              # Data pipeline — 4 files
    ├── data/cricsheet/           # (empty — data not downloaded)
    ├── .github/workflows/        # 2 GitHub Actions workflows
    ├── package.json
    ├── vercel.json
    ├── vitest.config.ts
    ├── .env.example
    └── README.md
```

### 2.2 Product Planning Documents

8 detailed planning documents exist covering the full product lifecycle:

| Document | Content |
|----------|---------|
| **Doc 1 — Product Vision** | Long-term vision, mission statement, target persona |
| **Doc 2 — Problem Statement** | Pain points of fantasy cricket users |
| **Doc 3 — Competitive Analysis** | Analysis of existing fantasy tools and analytics providers |
| **Doc 4 — Problem Statement (Extended)** | Deeper market research |
| **Doc 5 — Market Sizing** | TAM/SAM/SOM for fantasy cricket analytics |
| **Doc 6 — PRD** | Full product requirements with feature IDs (F1.x–F3.x) |
| **Doc 7 — MVP Scope** | What's in v1 vs deferred |
| **Doc 8 — Decision Log** | Architecture and technology decisions with rationale |

---

## 3. Product Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  MARKETING SITE                          │
│              (Static HTML/CSS/JS)                         │
│   Landing Page · Docs Center · Privacy · Terms           │
└─────────────────┬───────────────────────────────────────┘
                  │ Links to /cricveda
┌─────────────────▼───────────────────────────────────────┐
│                CRICVEDA NEXT.JS APP                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Fan-Facing   │  │  API Layer   │  │   Admin       │ │
│  │  Dashboard    │  │  /api/v1/*   │  │   Panel       │ │
│  │              │  │              │  │               │ │
│  │ • Landing    │  │ • Players    │  │ • Fixtures    │ │
│  │ • Matches    │  │ • Matches    │  │ • Playing XI  │ │
│  │ • Player     │  │ • Matchups   │  │ • Recompute   │ │
│  │ • Docs       │  │ • Fantasy    │  │ • System      │ │
│  │ • Playground │  │ • Venues     │  │               │ │
│  │ • Dashboard  │  │ • Auth       │  │               │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                 │                   │          │
│  ┌──────▼─────────────────▼───────────────────▼───────┐ │
│  │              CORE ENGINE (src/lib/)                  │ │
│  │                                                     │ │
│  │  Analytics     Auth        Cache       Database     │ │
│  │  • form-score  • api-key   • redis     • supabase   │ │
│  │  • matchup     • rate-limit             • schema    │ │
│  │  • venue       Middleware                           │ │
│  │  • fantasy                                          │ │
│  │  • confidence                                       │ │
│  └─────────┬──────────────┬───────────────┬───────────┘ │
│            │              │               │              │
└────────────┼──────────────┼───────────────┼──────────────┘
             │              │               │
    ┌────────▼──────┐  ┌───▼────┐  ┌───────▼──────┐
    │   Supabase    │  │ Upstash│  │  CricSheet   │
    │  PostgreSQL   │  │ Redis  │  │  (CC BY 4.0) │
    │  (Database)   │  │ (Cache)│  │  (Data)      │
    └───────────────┘  └────────┘  └──────────────┘
```

### 3.2 Technology Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Next.js 14 (App Router) | SSR + API routes in one codebase, Vercel deployment |
| **Language** | TypeScript | Type safety for complex analytics types |
| **Database** | Supabase (PostgreSQL) | Managed Postgres with REST API, free tier, real-time |
| **Cache** | Upstash Redis | Serverless Redis with REST API, TTL support, rate limiting |
| **Data Source** | CricSheet | Only CC BY 4.0 ball-by-ball cricket data globally |
| **Styling** | Custom CSS variables + inline styles | Matches marketing site design system exactly |
| **Testing** | Vitest | Fast, Vite-native, TypeScript-first |
| **Deployment** | Vercel (Mumbai region) | Edge network, Next.js optimization, bom1 for India latency |
| **CI/CD** | GitHub Actions | Scheduled scraping + precomputation daily at 03:00 UTC |

---

## 4. CricVeda — Detailed Breakdown

### 4.1 What CricVeda Does

CricVeda is a **fantasy cricket intelligence product** with two delivery channels:

1. **REST API** — For developers and fantasy platforms to integrate analytics
2. **Web Dashboard** — For cricket fans to browse matches, view AI dream teams, check player form, and explore matchup data

### 4.2 Core Features (PRD Feature IDs)

| ID | Feature | Status |
|----|---------|--------|
| F1.1 | CricSheet data ingestion pipeline | ✅ Implemented |
| F1.5 | Pre-computation engine (batch insights) | ✅ Implemented |
| F2.1 | Cross-league form score calculator | ✅ Implemented (392 lines) |
| F2.2 | Batter vs bowler matchup analyzer | ✅ Implemented (275 lines) |
| F2.3 | Venue intelligence | ✅ Implemented (194 lines) |
| F2.5 | Dream Team generator | ✅ Implemented (constraint-based) |
| F2.6 | Captain picker | ✅ Implemented (weighted scoring) |
| F2.7 | Differential finder | ✅ Implemented |
| F2.8 | Key battles identification | ✅ Implemented |
| F2.9 | Confidence scoring system | ✅ Implemented (148 lines) |
| F3.7 | API key authentication | ✅ Implemented (SHA-256 hashed) |
| F3.8 | Rate limiting | ✅ Implemented (daily limits) |

### 4.3 Supported T20 Leagues

| League | ID | Tier | Country |
|--------|----|------|---------|
| Indian Premier League | `ipl` | 1 | India |
| T20 International | `t20i` | 1 | Global |
| Big Bash League | `bbl` | 1 | Australia |
| Pakistan Super League | `psl` | 1 | Pakistan |
| Caribbean Premier League | `cpl` | 1 | West Indies |
| The Hundred | `hundred` | 1 | England |
| SA20 | `sa20` | 1 | South Africa |
| Lanka Premier League | `lpl` | 2 | Sri Lanka |
| Bangladesh Premier League | `bpl` | 2 | Bangladesh |
| International League T20 | `ilt20` | 2 | UAE |
| Major League Cricket | `mlc` | 2 | USA |
| Syed Mushtaq Ali Trophy | `smat` | 3 | India |
| Vitality Blast | `blast` | 3 | England |

### 4.4 Pricing Model

| Plan | Price | Daily Calls | Features |
|------|-------|-------------|----------|
| **Free** | $0/mo | 100 | Player form, match insights, venue intel, top 3 matchups |
| **Pro** | $9/mo | 5,000 | Everything in Free + Dream Team, Captain Picks, Differentials, full matchups |
| **Enterprise** | Custom | 50,000 | All features + priority support |

---

## 5. Database Schema

### 5.1 Schema Overview

The database uses **Supabase PostgreSQL** with 12 tables, 15 indexes, and seed data for 13 leagues.

**Schema file:** `src/lib/db/schema.sql` (277 lines)

### 5.2 Entity Relationship

```
leagues ─────┬──────── teams
             │           │
             │           ├──── squads ────── players
             │           │                      │
             ├──── matches ──── deliveries ─────┘
             │                      │
             ├──── fixtures ── playing_xi ── players
             │        │
             │        └──── precomputed_insights
             │
users ──── api_keys ──── api_usage_log
               │
           form_scores ──── players
```

### 5.3 Table Details

| Table | Primary Key | Rows (Expected) | Purpose |
|-------|-------------|-----------------|---------|
| `leagues` | `TEXT` (e.g. 'ipl') | 13 (seeded) | T20 league definitions |
| `venues` | `SERIAL` | ~200 | Cricket grounds with stats |
| `teams` | `SERIAL` | ~100 | Franchise/national teams |
| `players` | `SERIAL` | ~3,000+ | Player profiles + metadata |
| `matches` | `SERIAL` | ~4,500+ | Completed match records |
| `deliveries` | `BIGSERIAL` | ~1,000,000+ | Ball-by-ball data (core) |
| `fixtures` | `SERIAL` | ~50 active | Upcoming/live matches |
| `playing_xi` | `SERIAL` | ~100 active | Predicted/confirmed lineups |
| `squads` | `SERIAL` | ~500 | Season squad compositions |
| `users` | `UUID` | Growing | Registered API users |
| `api_keys` | `UUID` | 1 per user | SHA-256 hashed API keys |
| `form_scores` | `SERIAL` | ~9,000 | Pre-computed form (bat/bowl/overall per player) |
| `precomputed_insights` | `SERIAL` | ~300 | Dream team, captain picks, etc. per fixture |
| `api_usage_log` | `BIGSERIAL` | Growing | Request audit trail |

### 5.4 Key Design Decisions

- **Ball-by-ball storage** — Every delivery is a row in `deliveries` with `phase` as a generated column (`powerplay`/`middle`/`death` based on `over_number`).
- **CricSheet IDs** — Players and matches carry `cricsheet_id` for deduplication during ingestion.
- **Pre-computation** — `precomputed_insights` stores JSONB payloads (dream team, captain picks, etc.) per fixture, updated by cron.
- **API key security** — Only SHA-256 hash stored in `key_hash`; plaintext shown once at creation. `key_prefix` (first 11 chars) for display.

---

## 6. Analytics Engine

### 6.1 Form Score Calculator (`form-score.ts` — 392 lines)

Computes a 0-10 score representing a player's recent T20 form **across all leagues**.

**Algorithm:**
1. Fetch last 20 matches for a player (across all leagues)
2. Apply exponential decay weighting (factor 0.92) — recent matches matter more
3. Compute batting sub-score using weighted components:
   - Runs scored (30%) — normalized against 60
   - Strike rate (25%) — normalized range 80-180
   - Boundary percentage (15%) — normalized against 30%
   - Impact innings (10%) — 50+ = 1.0, 30+ = 0.7, 15+ = 0.4
   - Consistency bonus (20%) — low coefficient of variation
4. Compute bowling sub-score:
   - Wickets (30%), Economy (25%), Dot % (20%), Bowling SR (15%), Impact (10%)
5. Combine based on player role:
   - Batter/WK: 85% batting + 15% bowling
   - Bowler: 20% batting + 80% bowling
   - All-rounder: 50/50
6. Calculate trend (improving/declining/stable) by comparing last 3 vs previous 3 matches
7. Attach confidence score

### 6.2 Matchup Analyzer (`matchup.ts` — 275 lines)

Computes batter-vs-bowler head-to-head statistics across all T20 encounters.

**Output:**
- Total balls, runs, dismissals
- Strike rate, dot %, boundary %
- Phase breakdown (powerplay/middle/death)
- Advantage determination (batter/bowler/even)
- Fantasy note (natural language summary)
- Confidence score
- Leagues where they faced each other

**Advantage Logic:**
- Batter advantage: SR ≥ 140 + dismissal rate < 5%, OR SR ≥ 120 + dismissal rate < 3%
- Bowler advantage: SR < 100 + dismissal rate > 4%, OR dismissal rate > 8%
- Minimum 6 balls for statistical relevance

### 6.3 Venue Intelligence (`venue.ts` — 194 lines)

Computes comprehensive venue analytics from all T20 matches played there.

**Output:**
- Average 1st and 2nd innings scores
- Pace vs spin wicket percentage (categorized by bowler style keywords)
- Toss decision patterns (bat first %)
- Chasing win percentage
- Phase breakdown (avg runs and wickets per phase per innings)

### 6.4 Fantasy Engine (`fantasy.ts` — 497 lines)

#### Dream Team Generator

Generates an optimal fantasy XI respecting Dream11 constraints:

**Constraints:**
- Total: 11 players
- WK: 1-4, BAT: 3-6, AR: 1-4, BOWL: 3-6
- Max 7 from one team, min 1 from each team

**Algorithm:**
1. Get playing XI for both teams
2. Compute expected fantasy points per player: `base_points[role] × (0.5 + form_score/10) + playing_xi_bonus`
3. Base points: Batter=28, WK=32, AR=38, Bowler=30
4. Two-pass selection: first ensure role minimums, then fill by highest expected points
5. Validate team composition

#### Captain Picker

Ranks players for captain/vice-captain with weighted scoring:
- Form: 35%
- Venue history: 25%
- Matchup analysis: 20%
- Consistency (trend): 10%
- Role ceiling: 10%

Each pick has a risk level (safe/moderate/risky) and natural-language reasoning.

#### Differential Finder

Identifies underrated picks: players with form score 4.0-7.5 (decent but not obvious), sorted by expected points.

### 6.5 Confidence Scoring (`confidence.ts` — 148 lines)

Every analytical output carries a confidence score (0.00-1.00) with a human-readable label.

**Factors:**
1. **Match count** (0-0.40): 15+ matches = max
2. **League diversity** (0-0.25): 4+ leagues = max
3. **Data recency** (0-0.20): within 14 days = max, >120 days = 0
4. **Sample size** (0-0.15): 30+ balls for matchups = max

**Tiers:**
| Score | Label | Meaning |
|-------|-------|---------|
| ≥ 0.85 | `very_high` | Veteran with deep multi-league data |
| ≥ 0.70 | `high` | Experienced player with solid coverage |
| ≥ 0.50 | `moderate` | Limited data or first time in league |
| ≥ 0.25 | `low` | Domestic debut or minimal data |
| < 0.25 | `very_low` | Essentially no useful data |

---

## 7. API Reference

### 7.1 Base URL

```
https://cricveda.com/api/v1
```

### 7.2 Authentication

API key passed as `Authorization: Bearer cv_xxx` header or `?api_key=cv_xxx` query parameter.

### 7.3 Response Envelope

All responses follow:
```json
{
  "success": true|false,
  "data": { ... },
  "error": "...",         // only on failure
  "code": "ERROR_CODE",   // only on failure
  "meta": {
    "timestamp": "2026-05-09T12:00:00Z",
    "cached": false,
    "cache_age_seconds": null,
    "api_version": "v1"
  }
}
```

### 7.4 Endpoints

#### Health
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns API status, version |

#### Players
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/players` | Optional | List/search players. Params: `search`, `role`, `country`, `page`, `per_page` |
| GET | `/players/:id` | Optional | Full player profile + form scores |
| GET | `/players/:id/form` | Optional | Cross-league form score. Params: `type` (batting/bowling/overall) |

#### Matches
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/matches` | Optional | Upcoming/recent fixtures. Params: `league`, `status`, `page`, `per_page` |
| GET | `/matches/:id/insights` | Optional | Full match intelligence: venue, H2H, precomputed analytics |
| GET | `/matches/:id/recommendations` | Required | Match-specific player recommendations |

#### Matchups
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/matchups/batter-vs-bowler` | Required | H2H analysis. Params: `batter_id`, `bowler_id` |

#### Fantasy
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/fantasy/:match_id/dream-team` | Required | AI-generated optimal XI |
| GET | `/fantasy/:match_id/captain-picks` | Required | Top captain recommendations |

#### Venues
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/venues/:id` | Required | Venue intelligence report |

#### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | No | Create account, receive API key. Body: `email`, `password`, `name` |
| POST | `/auth/api-key` | Required | Generate new API key |

### 7.5 Rate Limits

| Plan | Daily Calls | Burst (per second) |
|------|-------------|---------------------|
| Free | 100 | 10 |
| Pro | 5,000 | 50 |
| Enterprise | 50,000 | 200 |

Rate limit headers on every response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 77
X-RateLimit-Reset: 2026-05-09T23:59:59.999Z
```

### 7.6 Caching Strategy

| Endpoint | TTL | Storage |
|----------|-----|---------|
| Player list | 300s | Redis |
| Player profile | 600s | Redis |
| Player form score | 1800s | Redis |
| Match list | 120s | Redis |
| Match insights | 300s | Redis |
| Matchup data | 300s | Redis |

Falls back to in-memory `Map` if Redis is unavailable.

---

## 8. Fan-Facing Dashboard

### 8.1 Pages Overview

| Route | Page | Lines of Code | Status |
|-------|------|--------------|--------|
| `/` | CricVeda Landing | 242 | ✅ Complete |
| `/matches` | Upcoming Matches Browser | 167 | ✅ Complete |
| `/matches/[id]` | Match Insights Detail | 240 | ✅ Complete |
| `/players/[id]` | Player Profile | 15 | ❌ Stub only |
| `/docs` | API Documentation | 177 | ✅ Complete |
| `/playground` | API Playground | 176 | ✅ Complete |
| `/dashboard` | User Dashboard | 295 | ✅ Complete |
| `/admin` | Admin Panel | 190 | ✅ Complete |

### 8.2 Landing Page (`/`)

Full marketing-grade page with:
- Hero section with gradient orbs, grid overlay, animated badges
- Metrics bar: 4,500+ T20 Matches, 13 T20 Leagues, 18 Endpoints, $0 Free Tier
- 6 feature cards (Form Scores, Matchups, Venue Intel, Dream Team, Captain Picker, Confidence Scoring)
- Live API response preview (Suryakumar Yadav form score example)
- 2-tier pricing (Free vs Pro at $9/mo)
- Data attribution (CricSheet CC BY 4.0, Wikidata CC0)

### 8.3 Matches Browser (`/matches`)

- League filter pills (IPL, T20I, BBL, PSL, CPL, The Hundred, SA20)
- Match cards showing: league badge, team names, venue, date, live indicator, "Insights Ready" badge
- Click-through to match detail
- Fetches from `/api/v1/matches` endpoint

### 8.4 Match Detail Page (`/matches/[id]`)

- Hero card with team names, league, status, venue, date
- **Venue Intelligence card**: avg innings scores, pace/spin split, bat first %, chasing win %
- **Head to Head card**: team1 wins / total / team2 wins
- **Dream Team card**: 11 players with role, team, expected points, confidence badge
- **Captain Picks card**: ranked picks with risk level (safe/moderate/risky), reasoning bullets
- **Key Battles card**: batter vs bowler matchups with SR, dismissals, advantage indicator

### 8.5 Dashboard (`/dashboard`)

Three tabs:
- **Overview**: API call metrics (today, limit, total, % used), quick action cards (Browse Matches, API Docs, Playground), account info
- **API Key**: Key display (masked), copy button, quick start curl example, regenerate (danger zone)
- **Usage**: Daily usage breakdown table (endpoint, calls, avg latency, errors), upgrade CTA

### 8.6 API Playground (`/playground`)

Postman-like interface:
- 9 preset requests (form score, search players, matches, insights, matchups, venue, dream team, captain picks, health)
- API key input field
- Method selector (GET/POST) + URL input
- Send button with loading state
- Response viewer with status code coloring, response time display, pretty-printed JSON

### 8.7 API Docs (`/docs`)

- Sidebar with 6 groups: Players (3), Matches (2), Matchups (2), Venues (1), Fantasy (3), Auth (2)
- Each endpoint shows: method badge, path, PRO badge if auth required, description, parameter pills
- Auth section explaining Bearer token format
- Free vs Pro tier comparison
- Response envelope documentation

### 8.8 Admin Panel (`/admin`)

Internal tool with 4 tabs:
- **Fixtures**: Add fixture form (league, date, teams, venue) + CSV bulk upload
- **Playing XI**: Select fixture + team, enter 11 player names, triggers recompute
- **Recompute**: Full pipeline trigger, single fixture recompute, CricSheet data ingestion trigger
- **System**: Health indicators (Supabase, Redis, API version, endpoint count), data count table (all 8 core tables)

---

## 9. Data Pipeline

### 9.1 Pipeline Overview

```
CricSheet (cricsheet.org)
    │
    ▼ Download JSON archives
┌───────────────────────┐
│  ingest-cricsheet.ts  │  F1.1 — Parses ball-by-ball JSON
│  (384 lines)          │  Maps leagues, creates players,
│                       │  inserts matches + deliveries
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  scrape-fixtures.ts   │  Scrapes upcoming match schedules
│  scrape-squads.ts     │  Scrapes confirmed/predicted squads
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ precompute-insights.ts│  F1.5 — Batch computation
│  (157 lines)          │  Form scores → Dream teams →
│                       │  Captain picks → Key battles
└───────────────────────┘
```

### 9.2 Ingestion Script

**File:** `src/scripts/ingest-cricsheet.ts` (384 lines)

- Downloads from `https://cricsheet.org/downloads`
- Maps 13 CricSheet league folder names to internal league IDs
- Parses each JSON match file: extracts teams, venue, toss, result, and every delivery
- Creates/updates player records using `cricsheet_id` for deduplication
- Inserts match records and ball-by-ball deliveries
- Returns stats: matches ingested, deliveries inserted, players created, errors

### 9.3 Pre-computation Script

**File:** `src/scripts/precompute-insights.ts` (157 lines)

Runs in sequence:
1. `computeAllFormScores()` — iterates all players with T20 data, computes batting/bowling/overall form
2. For each upcoming fixture with playing XI:
   - `generateDreamTeam(fixtureId)` → stored as `dream_team` insight
   - `getCaptainPicks(fixtureId)` → stored as `captain_picks` insight
   - `getKeyBattles(fixtureId)` → stored as `key_battles` insight
   - `getDifferentials(fixtureId)` → stored as `differentials` insight
   - `getVenueIntelligence(venueId)` → stored as `venue_analysis` insight

### 9.4 GitHub Actions Workflows

#### daily-scrape.yml
- **Trigger:** Cron at 03:00 UTC daily + manual dispatch
- **Job 1 (scrape-fixtures):** Runs `scrape-fixtures.ts` then `scrape-squads.ts`
- **Job 2 (precompute):** Depends on Job 1, runs `precompute-insights.ts`
- **Env:** Supabase + Redis secrets from GitHub Secrets

#### precompute.yml
- **Trigger:** Manual dispatch with optional `fixture_id` input
- **Job:** Runs `precompute-insights.ts` with optional fixture ID argument

### 9.5 NPM Script Shortcuts

```bash
npm run ingest           # Run CricSheet ingestion
npm run scrape:fixtures  # Scrape upcoming fixtures
npm run scrape:squads    # Scrape squad updates
npm run precompute       # Pre-compute all insights
```

---

## 10. Authentication & Security

### 10.1 API Key System

**File:** `src/lib/auth/api-key.ts` (110 lines)

- **Key format:** `cv_` prefix + 24 random hex bytes (e.g., `cv_a4f7c2e1...`)
- **Storage:** Only SHA-256 hash stored in database (`key_hash` column)
- **Display:** First 11 characters stored as `key_prefix` for UI display
- **Validation:** Hash incoming key → match against `key_hash` + check `is_active`
- **Operations:** Generate, create, validate, revoke, regenerate

### 10.2 Authentication Middleware

**File:** `src/lib/middleware.ts` (148 lines)

Two modes:
- `withAuth()` — Key required, returns 401 if missing/invalid
- `withOptionalAuth()` — Key optional, applies rate limit only if key provided

Key extraction: `Authorization: Bearer cv_xxx` header OR `?api_key=cv_xxx` query param.

### 10.3 Rate Limiting

**File:** `src/lib/auth/rate-limit.ts` (55 lines)

- Daily counter per API key using Redis `INCR` with end-of-day TTL
- Falls back to in-memory Map if Redis unavailable
- Returns standard `X-RateLimit-*` headers on every response
- 3 tiers: Free (100/day), Pro (5,000/day), Enterprise (50,000/day)

### 10.4 User Registration

- `POST /api/auth/signup` — email + password (min 8 chars)
- Password stored as SHA-256 hash
- API key auto-generated on signup, shown once
- Duplicate email check returns 409

---

## 11. Infrastructure & Deployment

### 11.1 Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All DB operations |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side DB access |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side DB (bypasses RLS) |
| `UPSTASH_REDIS_REST_URL` | No | Cache + rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | No | Cache + rate limiting |
| `NEXT_PUBLIC_APP_URL` | No | App base URL |

### 11.2 Vercel Configuration

**File:** `vercel.json`

- Framework: Next.js
- Region: `bom1` (Mumbai, India — optimal for IPL users)
- CORS headers on all `/api/v1/*` routes
- Cache-Control: `public, s-maxage=60, stale-while-revalidate=120`

### 11.3 Dependencies

**Runtime:**
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 14.1.0 | Framework |
| `react` | 18.3.1 | UI |
| `react-dom` | 18.3.1 | UI |
| `@supabase/supabase-js` | ^2.100.1 | Database client |
| `@upstash/redis` | ^1.37.0 | Cache client |

**Dev:**
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.4.0 | Type checking |
| `vitest` | ^1.2.0 | Unit testing |
| `tsx` | ^4.7.0 | Script execution |
| `eslint` + `eslint-config-next` | ^8.56.0 / 14.1.0 | Linting |

---

## 12. Design System

### 12.1 Theme: "CricSynthesis Deep Space"

Dark-mode design with indigo/purple accent palette.

**Color Palette:**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-primary` | `#06080d` | Page background |
| `--color-bg-secondary` | `#0b0e16` | Section backgrounds |
| `--color-bg-tertiary` | `#111621` | Card backgrounds |
| `--color-accent-primary` | `#6366f1` | Primary accent (indigo) |
| `--color-accent-secondary` | `#818cf8` | Secondary accent |
| `--color-accent-tertiary` | `#a78bfa` | Tertiary accent (purple) |
| `--color-success` | `#10b981` | Positive indicators |
| `--color-warning` | `#f59e0b` | Warning/Pro badges |
| `--color-danger` | `#ef4444` | Errors/danger zones |

**Typography:**
| Token | Font | Usage |
|-------|------|-------|
| `--font-primary` | Inter | Body text |
| `--font-display` | Space Grotesk | Headings, metrics |
| `--font-mono` | JetBrains Mono | Code, API paths, keys |

### 12.2 Component Patterns

All UI is built with CSS custom properties and inline styles (no component library). Common patterns:
- `.card` — Glass-morphism cards with subtle borders
- `.btn`, `.btn-primary`, `.btn-outline` — Button variants
- `.badge` — Status badges (accent, success, warning, danger)
- `.metric-card` — Numeric display cards
- `.code-block` — Syntax-highlighted code display
- `.nav` — Glassmorphism navigation with backdrop blur
- `.confidence-badge` — Color-coded confidence level indicator

---

## 13. File Inventory

### 13.1 Complete File List (39 source files in cricveda/src)

**App Pages (10 files):**
```
src/app/page.tsx                           242 lines  Landing page
src/app/layout.tsx                          32 lines  Root layout
src/app/globals.css                        571 lines  Global styles
src/app/matches/page.tsx                   167 lines  Match browser
src/app/matches/[id]/page.tsx              240 lines  Match detail
src/app/players/[id]/page.tsx               15 lines  Player profile (STUB)
src/app/docs/page.tsx                      177 lines  API docs
src/app/playground/page.tsx                176 lines  API playground
src/app/dashboard/page.tsx                 295 lines  User dashboard
src/app/admin/page.tsx                     190 lines  Admin panel
```

**API Routes (14 files):**
```
src/app/api/v1/health/route.ts              23 lines
src/app/api/v1/players/route.ts             56 lines
src/app/api/v1/players/[id]/route.ts        47 lines
src/app/api/v1/players/[id]/form/route.ts   33 lines
src/app/api/v1/matches/route.ts             93 lines
src/app/api/v1/matches/[id]/insights/route.ts        97 lines
src/app/api/v1/matches/[id]/recommendations/route.ts  (exists)
src/app/api/v1/matchups/batter-vs-bowler/route.ts     (exists)
src/app/api/v1/fantasy/[match_id]/dream-team/route.ts (exists)
src/app/api/v1/fantasy/[match_id]/captain-picks/route.ts (exists)
src/app/api/v1/venues/[id]/route.ts                    (exists)
src/app/api/auth/signup/route.ts            87 lines
src/app/api/auth/api-key/route.ts                      (exists)
```

**Core Library (11 files):**
```
src/lib/types.ts                           347 lines  All TypeScript types
src/lib/middleware.ts                      148 lines  Auth + response helpers
src/lib/db/schema.sql                      277 lines  PostgreSQL schema
src/lib/db/supabase.ts                     141 lines  DB client + helpers
src/lib/cache/redis.ts                     149 lines  Redis + in-memory cache
src/lib/auth/api-key.ts                    110 lines  API key management
src/lib/auth/rate-limit.ts                  55 lines  Rate limiting
src/lib/analytics/form-score.ts            392 lines  Form calculator
src/lib/analytics/matchup.ts               275 lines  Matchup analyzer
src/lib/analytics/venue.ts                 194 lines  Venue intelligence
src/lib/analytics/fantasy.ts               497 lines  Dream team + captain
src/lib/analytics/confidence.ts            148 lines  Confidence scoring
```

**Data Pipeline Scripts (4 files):**
```
src/scripts/ingest-cricsheet.ts            384 lines
src/scripts/precompute-insights.ts         157 lines
src/scripts/scrape-fixtures.ts                  (exists)
src/scripts/scrape-squads.ts                    (exists)
```

**Tests (3 files, 25 tests):**
```
src/lib/analytics/__tests__/confidence.test.ts   15 tests
src/lib/analytics/__tests__/form-score.test.ts    3 tests
src/lib/analytics/__tests__/fantasy.test.ts       7 tests
```

**Configuration (7 files):**
```
package.json, tsconfig.json, next.config.js, next-env.d.ts
vercel.json, vitest.config.ts, .env.example
```

### 13.2 Total Code Volume

| Category | Files | Approximate Lines |
|----------|-------|-------------------|
| Frontend pages | 10 | ~2,100 |
| API routes | 14 | ~700 |
| Core library | 11 | ~2,500 |
| Scripts | 4 | ~700 |
| Tests | 3 | ~250 |
| Styles | 2 | ~630 |
| Config | 7 | ~100 |
| **Total** | **51** | **~7,000** |

---

## 14. Current Status & Gaps

### 14.1 What's Complete

| Component | Completion | Notes |
|-----------|-----------|-------|
| Marketing site | 100% | Landing, docs center, privacy, terms |
| Product planning | 100% | 8 comprehensive documents |
| Database schema | 100% | Full schema with indexes, seeds |
| Analytics engine | 100% | Form, matchup, venue, fantasy, confidence |
| API routes | ~95% | All endpoints implemented with auth + caching |
| Fan dashboard | ~85% | 7/8 pages complete |
| Admin panel | 100% | All 4 tabs functional (UI-level) |
| Auth system | 100% | API keys, rate limiting, signup |
| Cache layer | 100% | Redis + in-memory fallback |
| CI/CD workflows | 100% | Daily scrape + on-demand precompute |
| Tests | Started | 25 unit tests passing |
| Dev tooling | 100% | env example, README, vitest, vercel.json |

### 14.2 What's Missing

| Gap | Impact | Effort |
|-----|--------|--------|
| **No database provisioned** | Nothing works without Supabase | Low — create project + run SQL |
| **No data ingested** | `data/cricsheet/` is empty | Medium — download + run ingestion |
| **Player profile page is a stub** | Fan dashboard incomplete | Medium — 200-300 lines |
| **No E2E/integration tests** | Only unit tests exist | Medium |
| **Password hashing uses SHA-256** | Should use bcrypt/argon2 for passwords | Low — swap one function |
| **No Supabase RLS policies** | Service role key bypasses, but needs RLS for client | Low-Medium |
| **No payment/billing integration** | Pro tier pricing shown but not functional | High |
| **MatchSynth + GraphSynth** | Planned products, zero code | Very High |

### 14.3 Known Technical Debt

1. **Inline styles everywhere** — All dashboard pages use inline React styles instead of CSS modules or Tailwind. Works but hard to maintain.
2. **`Record<string, unknown>` casts** — Supabase query results are heavily cast due to untyped client. Could use generated types.
3. **Sequential DB queries in form-score** — `getRecentPerformances()` makes N+1 queries (one per match). Should batch.
4. **No error boundaries** — Client pages lack React error boundaries.
5. **Repeated nav component** — Navigation is copy-pasted in every page instead of being a shared component.

---

## 15. Roadmap & Next Steps

### 15.1 Immediate (Week 1)

1. Provision Supabase project → run `schema.sql`
2. Create `.env.local` with real credentials
3. Download CricSheet data → run `npm run ingest`
4. Run `npm run precompute` to generate initial insights
5. Build out player profile page (`/players/[id]`)
6. Replace SHA-256 password hashing with bcrypt

### 15.2 Short-term (Weeks 2-4)

1. Deploy to Vercel
2. Set up GitHub Secrets for CI/CD
3. Add Supabase RLS policies
4. Implement Stripe for Pro tier billing
5. Add E2E tests with Playwright
6. Extract shared Nav/Footer/Layout components
7. Add proper error handling + loading skeletons

### 15.3 Medium-term (Months 2-3)

1. Add more data sources (Wikidata for player metadata, CricAPI for live scores)
2. Real-time WebSocket updates for live matches
3. Mobile-responsive optimization
4. SEO optimization for match pages
5. Analytics dashboard (PostHog/Mixpanel)

### 15.4 Long-term (Months 4+)

1. **MatchSynth** development — Monte Carlo match simulation engine
2. **GraphSynth** development — D3.js/Canvas broadcast-quality visualizations
3. Enterprise tier with custom integrations
4. Regional expansion (Hindi, Tamil language support)

---

*End of Report*

**Total project size:** ~7,000 lines of TypeScript/CSS across 51 files  
**Data coverage:** 13 T20 leagues, ~4,500+ matches (when ingested)  
**API surface:** 14 REST endpoints with auth, caching, rate limiting  
**Dashboard:** 8 web pages (7 complete, 1 stub)
