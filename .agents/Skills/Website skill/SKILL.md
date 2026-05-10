---
name: cricsynthesis-website
description: Complete design and copy system for rebuilding cricsynthesis.in from scratch. Use this skill whenever rebuilding, refactoring, or adding new sections to the CricSynthesis website. Covers visual design system, brand voice, section-by-section copy, component patterns, and anti-patterns to avoid.
---

# CricSynthesis Website Skill

This skill encodes the full design system, copy rules, and section specifications for cricsynthesis.in — a cricket intelligence API platform targeting developers, sports tech startups, broadcast teams, and analytics firms.

The site is a dark-theme technical landing page. The aesthetic is: **precision-engineered, founder-built, no fluff**. Every word and pixel should communicate that a real engineer built this for real engineers — not a marketing team using a SaaS template.

Read this entire file before writing a single line of code or copy.

---

## 1. Brand Foundation

### What CricSynthesis is
A cricket intelligence API platform with three products:
- **CricVeda** — Player and match analytics API (form scores, matchup data, pitch modelling)
- **MatchSynth** — Match simulation and prediction API (win probability, innings projections, opposition analysis)
- **GraphSynth** — Broadcast visualization API (live overlays, score projection feeds, stat graphics)

Built on 15,000+ historical matches of ball-by-ball data. Multi-agent AI architecture. Sub-500ms API response times. Currently in private beta.

### Who the buyer is
- Developers and CTOs at sports tech startups
- Product teams at OTT and broadcast platforms
- Analytics leads at IPL franchises and cricket boards
- Founders building cricket-adjacent apps

### Who the buyer is NOT
- End consumers / cricket fans
- Fantasy sports users (real-money fantasy sports banned in India as of August 2025)
- Generic enterprise buyers who need handholding

### The one thing the site must communicate
"This is the data layer your cricket product is missing. It's already built. Just integrate it."

---

## 2. Design System

### Theme
Dark. Always dark. Background is near-black (`#0A0A0F`), not pure black. There is depth between layers — the page bg, card bg, and elevated card bg are three distinct shades.

### Color Palette

```css
:root {
  /* Backgrounds — three depth levels */
  --bg-base:       #0A0A0F;   /* page background */
  --bg-surface:    #111118;   /* card / section backgrounds */
  --bg-elevated:   #1A1A24;   /* code blocks, input fields, hover states */

  /* Brand colors */
  --brand-primary:   #7C5CFC;  /* CricSynthesis purple — CTAs, accents, highlights */
  --brand-secondary: #5ECFAD;  /* teal-green — used for CricVeda accents */
  --brand-amber:     #F59E0B;  /* amber — used for GraphSynth accents */
  --brand-coral:     #F97066;  /* coral — used for live/error states */

  /* Text hierarchy */
  --text-primary:    #F0EFF8;  /* headings, important body */
  --text-secondary:  #9895B0;  /* subtext, descriptions */
  --text-muted:      #4E4B6A;  /* labels, placeholders, dividers */
  --text-code:       #A8D8A8;  /* code values, API responses */

  /* Borders */
  --border-subtle:   rgba(255,255,255,0.06);
  --border-default:  rgba(255,255,255,0.10);
  --border-emphasis: rgba(124,92,252,0.35);  /* purple tint for focus/active */

  /* Status */
  --status-live:     #22C55E;
  --status-beta:     #7C5CFC;
  --status-ok:       #22C55E;
}
```

### Typography

```css
/* Import */
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');

:root {
  --font-display: 'Syne', sans-serif;     /* hero headings, product names, large titles */
  --font-body:    'Inter', sans-serif;     /* all body copy, descriptions, nav */
  --font-mono:    'JetBrains Mono', monospace; /* all code, API endpoints, stats */
}
```

**Type scale:**

| Role | Font | Size | Weight | Color |
|------|------|------|--------|-------|
| Hero headline | Syne | 64–80px | 700 | `--text-primary` |
| Section headline | Syne | 40–48px | 700 | `--text-primary` |
| Product name | Syne | 28px | 700 | `--text-primary` |
| Body | Inter | 16px | 400 | `--text-secondary` |
| Label / badge | Inter | 11px | 500 | `--text-muted` (uppercase, tracked) |
| Code | JetBrains Mono | 13px | 400 | `--text-code` |
| Stat number | Syne + JetBrains Mono | 48px | 700 | `--text-primary` |

### Spacing System
```
4px   — micro gap (between badge elements)
8px   — tight (within component internals)
12px  — default component gap
16px  — card internal padding
24px  — section element spacing
32px  — between major content blocks
64px  — section top/bottom padding
96px  — large section padding (hero)
```

### Border Radius
```
4px   — badges, code spans, tiny chips
8px   — inputs, buttons, small cards
12px  — product cards, feature boxes
16px  — large cards, modal-style blocks
0px   — code blocks (always square)
```

### Shadows
```css
/* Card lift */
--shadow-card: 0 1px 3px rgba(0,0,0,0.4), 0 0 0 0.5px var(--border-subtle);

/* Purple glow — used sparingly on CTAs and active states */
--shadow-glow: 0 0 24px rgba(124,92,252,0.20);

/* Code block */
--shadow-code: 0 2px 8px rgba(0,0,0,0.6), 0 0 0 0.5px var(--border-subtle);
```

---

## 3. Visual Design Rules

### The aesthetic direction
Precision-engineered dark SaaS. Think: Vercel, Linear, Planetscale — but with a cricket soul. Clean, dense, confident. Not flashy. Not a startup template. Every element earns its place.

### Grid and layout
- Max content width: `1100px`
- Page padding (mobile): `20px`
- Page padding (desktop): `40px`
- Use CSS Grid for product cards (3-column desktop, 1-column mobile)
- Asymmetry is okay — not everything needs to be centered

### Background texture
The hero section gets a subtle noise/grain texture overlay (`opacity: 0.03`) and a very soft radial gradient from `--brand-primary` at center (`opacity: 0.04`) to create depth. No particle animations — they're slow and cliché.

### Borders
- Cards: `0.5px solid var(--border-subtle)` — hairline borders, not thick
- Hover state: border transitions to `var(--border-default)`
- Active/focused: border transitions to `var(--border-emphasis)`
- No rounded corners on dividers or horizontal rules

### Product color accents
Each product has one accent color used for its icon background and subtitle color only:
- CricVeda → `--brand-secondary` (teal-green `#5ECFAD`)
- MatchSynth → `--brand-primary` (purple `#7C5CFC`)
- GraphSynth → `--brand-amber` (amber `#F59E0B`)

### Badges and status indicators
```html
<!-- Private beta badge -->
<span class="badge">
  <span class="badge-dot"></span>
  PRIVATE BETA
</span>
```
```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 0.5px solid var(--border-default);
  padding: 5px 12px;
  border-radius: 100px;
}
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-live);
  box-shadow: 0 0 6px var(--status-live);
}
```

### Buttons
```css
/* Primary CTA */
.btn-primary {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: var(--brand-primary);
  border: none;
  padding: 10px 22px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}
.btn-primary:hover { opacity: 0.88; }
.btn-primary:active { transform: scale(0.98); }

/* Secondary / ghost */
.btn-ghost {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  background: transparent;
  border: 0.5px solid var(--border-default);
  padding: 10px 22px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-ghost:hover {
  background: var(--bg-elevated);
  border-color: var(--border-emphasis);
}
```

### Code blocks
Code blocks are a MAJOR visual feature of this site — they're not decorative, they prove the product is real. Style them with care:

```css
.code-block {
  background: #090910;
  border: 0.5px solid var(--border-subtle);
  border-radius: 0;  /* square — always */
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  padding: 20px 24px;
  overflow-x: auto;
  box-shadow: var(--shadow-code);
}

/* Window chrome bar above code */
.code-chrome {
  background: var(--bg-elevated);
  border-bottom: 0.5px solid var(--border-subtle);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}

/* Traffic light dots */
.code-dots { display: flex; gap: 6px; }
.dot-red    { width:11px; height:11px; border-radius:50%; background:#FF5F57; }
.dot-yellow { width:11px; height:11px; border-radius:50%; background:#FFBD2E; }
.dot-green  { width:11px; height:11px; border-radius:50%; background:#28CA41; }

/* Syntax tokens */
.token-key      { color: #9F8FEF; }   /* JSON keys */
.token-string   { color: #A8D8A8; }   /* string values */
.token-number   { color: #F59E0B; }   /* numeric values */
.token-boolean  { color: #5ECFAD; }   /* true/false */
.token-comment  { color: #3D3A55; }   /* comments */
.token-method   { color: #F97066; }   /* HTTP method (POST, GET) */
.token-path     { color: #F0EFF8; }   /* endpoint path */
.token-ok       { color: #22C55E; }   /* 200 OK */
```

---

## 4. Section Specifications

### 4.1 Navigation

**Structure:** Logo left · Nav links center · CTA right
**Behavior:** Sticky. On scroll past 60px, add `backdrop-filter: blur(12px)` and `border-bottom: 0.5px solid var(--border-subtle)`.
**Height:** 64px
**Links:** Products · How It Works · CricVeda Dashboard
**CTA:** "Request Invite" — `btn-primary`

```
Logo: CS shield mark + "CricSynthesis" in Syne 500
Nav link font: Inter 14px, --text-secondary, hover → --text-primary
Active link: --text-primary + 2px bottom border in --brand-primary
```

---

### 4.2 Hero Section

**Layout:** Full-width, centered, min-height 85vh
**Background:** `--bg-base` + subtle noise texture + soft purple radial glow (opacity 0.04)

**Badge:**
```
● PRIVATE BETA — INVITE ONLY
```

**Headline (two lines):**
```
Cricket Intelligence
Delivered as APIs
```
Line 1: `--text-primary`, Syne 700, 72px
Line 2: `--brand-primary`, Syne 700, 72px (same size, color shift only — no gradient)

**Subtext (max 280 chars):**
```
Ball-by-ball data, player analytics, and match simulation —
structured as REST APIs and ready to integrate. Built for apps and teams
that need cricket intelligence without building the data layer from scratch.
```
Font: Inter 18px, `--text-secondary`, max-width 580px, centered

**CTA row:**
```
[Request Early Access →]    [View API Docs]
  btn-primary                  btn-ghost
```

**Stats bar (below hero text, above fold):**
Three numbers in a horizontal row, separated by vertical dividers:

| Stat | Label |
|------|-------|
| 3 | APIs |
| 15,000+ | Matches in dataset |
| <500ms | API response time |

Stat number: JetBrains Mono 48px, `--text-primary`
Stat label: Inter 12px uppercase tracked, `--text-muted`

---

### 4.3 Built For Ticker

**Purpose:** Social proof via buyer categories. Scrolling horizontal ticker, no interaction needed.

**Items (left to right, looping):**
```
Analytics Firms  ·  Cricket Boards  ·  Sports Apps  ·  Sports Media  ·  Cricket Academies  ·  OTT Platforms  ·  IPL Franchises  ·  Broadcast Teams  ·  Coaching Staff
```

**Design:** Single row, auto-scrolling at 30px/sec. Each item is Inter 13px, `--text-muted`, with a small relevant Tabler icon. Fade edges using `mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent)`.

**Section label above ticker:**
```
BUILT FOR THE CRICKET ECOSYSTEM
```
Inter 11px, uppercase, `--text-muted`, letter-spacing 0.1em, centered

---

### 4.4 Products Section

**Section label:** `THE APIS`
**Headline:**
```
Three APIs. One data layer.
```
Syne 700, 44px, `--text-primary`

**Subtext:**
```
Each API solves a different problem in the cricket data stack.
Private beta — early partners get direct access to the team and shape the roadmap.
```
Inter 16px, `--text-secondary`, max-width 560px, centered

**Grid:** 3 columns (desktop), 1 column (mobile), gap 16px

---

#### Product Card Structure

Each card:
- Background: `--bg-surface`
- Border: `0.5px solid var(--border-subtle)`, hover → `var(--border-default)`
- Border-radius: 12px
- Padding: 28px
- Top accent bar: 2px solid [product accent color], border-radius top only

**Card anatomy (top to bottom):**
1. Beta badge: `● PRIVATE BETA` (11px, muted)
2. Product icon: 48×48px, rounded-10, accent-color bg at 15% opacity, icon in accent color
3. Product name: Syne 700 24px, `--text-primary`
4. Product subtitle: Inter 13px, [accent color]
5. Description: Inter 15px, `--text-secondary`, line-height 1.6
6. Feature list: 4 items, each with `→` prefix in accent color
7. "Built for" chips: small pills, `--bg-elevated` bg, `--text-muted` text
8. CTA: "Request Invite →" ghost button, full-width

---

#### CricVeda — Copy

**Name:** CricVeda
**Subtitle color:** `--brand-secondary` (#5ECFAD)
**Subtitle text:** Player & Match Analytics

**Description:**
```
Pre-match player intelligence API. Form scores, head-to-head matchup data,
pitch-condition modelling, and performance distributions — structured for
integration into apps, dashboards, and editorial tools.
```

**Features:**
```
→ Player form score (0–1 normalised scale)
→ Head-to-head matchup data
→ Pitch and condition modelling
→ Historical performance distributions
```

**Built for:** Sports apps · Analytics teams · Coaching staff

---

#### MatchSynth — Copy

**Name:** MatchSynth
**Subtitle color:** `--brand-primary` (#7C5CFC)
**Subtitle text:** Match Simulation Engine

**Description:**
```
Statistical match simulation across 15,000+ historical matches.
Run win probability, innings projections, and opposition weakness analysis
before a ball is bowled. Built for teams and media that need scenario
modelling — not opinions.
```

**Features:**
```
→ Win probability distribution
→ Innings projection engine
→ Opposition weakness model
→ Auction value estimation
```

**Built for:** Professional Franchises · Coaching Staff · Sports Media

---

#### GraphSynth — Copy

**Name:** GraphSynth
**Subtitle color:** `--brand-amber` (#F59E0B)
**Subtitle text:** Broadcast Visualizations

**Description:**
```
Real-time data feeds structured for broadcast and streaming.
Live win probability, score projection overlays, and historical stat graphics —
delivered as JSON ready for your rendering pipeline. No scraping, no maintenance.
```

**Features:**
```
→ Live win probability feed
→ Score projection graphics
→ Historical stat overlays
→ Broadcast integration SDK
```

**Built for:** OTT Platforms · Broadcasters · YouTube Streamers

---

### 4.5 How It Works

**Section label:** `HOW IT WORKS`

**Headline:**
```
One integration. Three products.
```
Syne 700, 40px

**Subtext:**
```
Standard REST APIs. JSON responses. Most integrations go live in under a day.
```
Inter 16px, `--text-secondary`

**Steps layout:** 3 columns with arrow connector between them (desktop), vertical stack (mobile)

**Step numbers:** JetBrains Mono 48px, `--brand-primary`, opacity 0.4

---

**Step 01 — Request early access**
```
Apply for private beta. We review each application and onboard
integration partners directly — no automated approvals.
We want to know what you're building.
```

**Step 02 — Hit the endpoints**
```
REST API, JSON responses, standard auth headers.
Documentation is available on approval. Pick CricVeda, MatchSynth,
or GraphSynth — or all three from the same key.
```

**Step 03 — Ship to production**
```
Sub-500ms response times. Built for production load, not prototypes.
We stay reachable during your integration — not just during sales.
```

---

### 4.6 Live API Demo

**Purpose:** This section proves the product is real. It must look like an actual API client, not a mockup. Do not simplify it.

**Layout:** Two-pane split (request left, response right), inside a code-chrome window

**Window chrome:**
- Left: traffic light dots (red, yellow, green)
- Center: `Example · CricVeda API v2.0`
- Right: `LIVE` badge (green dot + green text, Inter 11px mono)

**Request pane label:** `POST  REQUEST`
**Response pane label:** `RESPONSE`

**Request pane content:**
```
POST /v2/predictions/player

Authorization: cv_live_••••••••

{
  // identity
  "match_id":  "ipl-2026-m042",
  "player_id": "p-vk18",

  // options
  "context": {
    "batting_position":   3,
    "xi_confirmed":       true,
    "include_conditions": true
  }
}
```

**Response pane content:**
```
200 OK   143ms   1.2 KB

{
  "request_id":  "req_01hx4kz",
  "data_as_of":  "2026-04-10T06:25Z",
  "ttl_seconds": 300,

  "player": {
    "id":   "p-vk18",
    "name": "Virat Kohli",
    "role": "BAT"
  },

  "form": {
    "score": 0.87,
    "trend": "rising"
  },

  "prediction": {
    "runs": {
      "p10":    18,
      "median": 44,
      "p90":    78
    }
  }
}
```

**Caption below demo:**
```
Real response. Real data. IPL 2026, Match 042. 143ms.
```
Inter 13px, `--text-muted`, centered, italic

---

### 4.7 Request Invite Form

**Section label:** `PRIVATE BETA`

**Headline:**
```
Request early access
```
Syne 700, 36px

**Subtext:**
```
We're working with a small group of integration partners right now.
Tell us what you're building — we'll respond within 48 hours.
```
Inter 16px, `--text-secondary`, max-width 480px, centered

**Form container:**
- Background: `--bg-surface`
- Border: `0.5px solid var(--border-default)`
- Border-radius: 12px
- Padding: 32px
- Max-width: 640px
- Centered

**Form fields:**

| Field | Type | Placeholder |
|-------|------|-------------|
| Full Name | text | Your name |
| Work Email | email | you@company.com |
| Organization | text | Company or team name |
| Interested Product | select | Select a product |
| What are you building? | textarea | Brief description — what does your product do? |

Product options: CricVeda · MatchSynth · GraphSynth · All three

**Submit button:**
```
[Request Invite →]
```
Full-width, `btn-primary`, height 48px, font-size 15px

**Fine print:**
```
By requesting an invite, you agree to receive product updates.
We don't share your data with third parties.
```
Inter 12px, `--text-muted`, centered

---

### 4.8 Footer

**Layout:** Logo + tagline left · Three link columns right

**Tagline under logo:**
```
Cricket intelligence, delivered as API.
```
Inter 14px, `--text-muted`

**Link columns:**

PRODUCTS: CricVeda · MatchSynth · GraphSynth

COMPANY: About · Careers · Contact

LEGAL: Privacy Policy · Terms of Service

**Bottom bar:**
```
© 2026 CricSynthesis. All rights reserved.
```
Left-aligned, `--text-muted`, Inter 13px

Social icons right: LinkedIn · X (Twitter)
Use Tabler outline icons: `ti-brand-linkedin`, `ti-brand-x`

---

## 5. Copy Rules

### Voice
- **Founder voice, not marketing voice.** Write like a senior engineer explaining their own product to another engineer. Direct, precise, no hype.
- Short sentences. Active verbs. No passive constructions.
- Never start a sentence with "Leverage", "Empower", "Unlock", "Harness", or "Revolutionize".
- Contractions are fine (`don't`, `we'll`, `it's`).

### What every piece of copy must do
1. Say something specific — not "powerful APIs" but "ball-by-ball data over 15,000 matches"
2. Name the pain it removes — "without building the data layer from scratch"
3. State the constraint honestly — "private beta", "invite only", "early partners"

### Words to never use
```
❌ powerful
❌ seamless
❌ robust
❌ cutting-edge
❌ state-of-the-art
❌ leverage
❌ unlock
❌ empower
❌ game-changer
❌ revolutionary
❌ fantasy users / fantasy platforms (legally sensitive post-Aug 2025 ban)
❌ gaming platforms (avoid — implies real-money gaming)
```

### Words that are fine and accurate
```
✓ precise
✓ production-grade
✓ structured
✓ ball-by-ball
✓ statistical
✓ integrate
✓ endpoints
✓ latency
✓ pipeline
✓ dataset
```

### Numbers — always include them
When you have a real number, use it. Never be vague when you can be specific.
```
✓ "15,000+ historical matches"     ❌ "extensive historical data"
✓ "sub-500ms response time"        ❌ "fast responses"
✓ "143ms on the CricVeda endpoint" ❌ "low latency"
✓ "three REST APIs"                ❌ "multiple APIs"
```

---

## 6. Component Patterns

### Product icon
```html
<div class="product-icon" style="--accent: #5ECFAD;">
  <i class="ti ti-chart-line"></i>
</div>
```
```css
.product-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 0.5px solid color-mix(in srgb, var(--accent) 25%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: var(--accent);
}
```

### Feature list item
```html
<li class="feature-item">
  <span class="feature-arrow" style="color: var(--accent)">→</span>
  <span>Player form score (0–1 normalised scale)</span>
</li>
```
```css
.feature-item {
  display: flex;
  gap: 10px;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--text-secondary);
  padding: 6px 0;
  border-bottom: 0.5px solid var(--border-subtle);
}
.feature-item:last-child { border-bottom: none; }
```

### Built-for chip
```html
<span class="chip">Sports apps</span>
```
```css
.chip {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 0.5px solid var(--border-subtle);
  padding: 4px 10px;
  border-radius: 100px;
}
```

### Stat item
```html
<div class="stat-item">
  <span class="stat-number">15,000+</span>
  <span class="stat-label">Matches in dataset</span>
</div>
```
```css
.stat-number {
  font-family: var(--font-mono);
  font-size: 44px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.stat-label {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-top: 6px;
}
```

---

## 7. Anti-Patterns — Never Do These

### Design anti-patterns
```
❌ Pure black (#000000) background — use --bg-base (#0A0A0F)
❌ Purple gradient text on hero headline — solid color only
❌ Animated particle backgrounds — slow, clichéd, distracting
❌ Glassmorphism cards — overused in 2022, avoid
❌ Rounded corners on code blocks — always square
❌ Generic stock icons that don't match the product
❌ Three gradient blobs floating in background
❌ "Glow" effects on every element — use sparingly, CTAs only
❌ Light mode — this site is dark-only
```

### Copy anti-patterns
```
❌ "Three powerful APIs for fantasy platforms" — fantasy is banned + generic
❌ "From Data to Intelligence in Minutes" — sounds like a template
❌ "Each API is purpose-built for a specific segment" — filler sentence
❌ "All from one platform" — adds no information
❌ Bullet points that just list feature names without context
❌ "We respect your privacy" as a trust signal in 2026
❌ "Get started today" as a CTA — too generic
```

### Structure anti-patterns
```
❌ Testimonials section — you're in private beta, don't fake this
❌ Pricing section — not public yet, skip it
❌ "Trusted by 1000+ companies" — don't fabricate social proof
❌ FAQ accordion with generic questions
❌ Newsletter signup — not relevant for a B2B API product
```

---

## 8. Responsive Behaviour

| Breakpoint | Changes |
|-----------|---------|
| `< 768px` | Hero font 44px · Product cards single column · Nav collapses to hamburger · Stats stack vertically · Code demo hides response pane |
| `768–1024px` | Product cards 2-column · Hero font 56px |
| `> 1024px` | Full layout as specified |

---

## 9. Performance Rules

- No autoplay video backgrounds
- No heavy animation libraries — CSS transitions only
- Font display: `swap` on all Google Fonts
- Code block syntax highlighting: inline spans only, no heavy JS libraries
- Images: WebP format, lazy loaded, explicit width/height to prevent CLS
- No third-party chat widgets or analytics that block the main thread

---

## 10. Quick Reference Checklist

Before shipping any page or section, verify:

- [ ] No use of "fantasy", "gaming platforms", or real-money gaming references
- [ ] All numbers are specific (ms, matches, APIs count)
- [ ] Code demo shows real endpoint, real response structure
- [ ] No gradient text on hero headline
- [ ] Code blocks have square corners
- [ ] Font is Syne (headings) + Inter (body) + JetBrains Mono (code)
- [ ] Background is `#0A0A0F`, not pure black
- [ ] Product accent colors are correct (CricVeda=teal, MatchSynth=purple, GraphSynth=amber)
- [ ] "Request Invite" CTA is present above the fold
- [ ] Footer tagline reads: "Cricket intelligence, delivered as API."
