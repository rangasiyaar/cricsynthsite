# CricSynthesis — Instagram match-prediction carousel: design brief

Use this prompt in Claude design (or any design tool) to create the master template. The automated pipeline then
renders every match's carousel from this template with that match's numbers.

---

## Prompt

Design a 6-slide Instagram carousel template for **CricSynthesis**, a cricket simulation and analytics brand that
forecasts matches by simulating them ball by ball thousands of times. Each carousel previews one upcoming match.
The template must work for any match (T20, ODI, men's and women's, international and league), so every number,
name and label below is a placeholder that will be filled automatically.

### Format
- 6 artboards, **1080 × 1350 px** (4:5 portrait), designed as one swipeable set.
- Safe zone: keep all text and key graphics inside **984 × 1254 px**, centred (48 px side margins, 48 px top and bottom).
- A thin continuous element (a line or bar) runs across the slide edges so the carousel reads as one strip when swiped.

### Brand
- Colours:
  - Paper background **#F2F2F3**, surface **#E9E9EA**, ink **#1D1F20**, muted ink **#5A5F64**
  - Steel blue (primary) **#5980A6**, deep steel **#416180**, darkest steel **#2C455D**
  - Team A accent **#3F6A93** (blue), Team B accent **#B5603A** (burnt orange), used only to tell the two sides apart
  - Lines **rgba(29,31,32,0.16)**
- Type:
  - Headlines: **Barlow Condensed SemiBold 600, UPPERCASE**, tight leading (1.0), slight letter-spacing (0.02em)
  - Body and labels: **Barlow** Regular/Medium
  - Numbers: Barlow Condensed with tabular figures
- Wordmark: "CRIC" in ink and "SYNTHESIS" in steel blue, set in Barlow Condensed SemiBold, preceded by a small
  mark (a chevron ">" followed by three short vertical bars). Use the text wordmark only; no other logo.
- Style: clean, editorial, data-first, like a premium sports-analytics publication. Flat colours, thin rules,
  generous whitespace, square or 4 px corners.
  - **Avoid:** gradients, glows, emojis, 3D, stock cricket imagery, team logos, player photos.

### Repeated elements (every slide)
- Top-left: small wordmark. Top-right: slide counter "02 / 06" in muted ink.
- Bottom strip: match label "IND vs NZ · 2nd T20I · 4 Nov" in small caps on the left; "cricsynthesis.in" on the right.
- A faint diagonal watermark "CricSynthesis" at about 4% opacity across the middle of slides 2–5 (protects the
  graphic if it is reposted).

### Slide 1: Cover
- Eyebrow: "MATCH PREDICTION" (steel blue, letter-spaced).
- Huge team names stacked: "INDIA" / "vs" / "NEW ZEALAND", using team A and team B accent colours for the names.
- Line: "2nd T20I · Eden Park, Auckland · 4 Nov, 12:30 IST".
- Big question: "WHO WINS?" with a small "Swipe →" cue bottom-right.
- Footnote: "From 20,000 simulations of the match".

### Slide 2: Win prediction
- Title: "WIN PREDICTION".
- A single wide horizontal bar split into the two team colours (58% / 42%), with each team's short code and
  percentage in very large numbers at each end ("IND 58%" · "NZ 42%").
- One-line read underneath, e.g. "India start as clear favourites." (variants: "A close one", "Strong favourites").
- No other numbers on this slide.

### Slide 3: Score prediction
- Title: "SCORE PREDICTION".
- Two stacked blocks, one per side, each with:
  - the team name;
  - a large likely range "165–185";
  - a thin horizontal range strip in the team colour, centred on a marker for the median (no axis numbers except
    the two ends).
- Caption: "Likely range: where half of our simulations land."

### Slide 4: Pitch report
- Title: "PITCH REPORT", subtitle with the ground name "Eden Park, Auckland".
- Three stat tiles in a row or column:
  - "Plays: HIGH SCORING" (a word badge);
  - "Typical first innings: 172";
  - "Batting first won: 54%", with a small two-colour split bar (bat first / chase).
- No phase-by-phase tables, no pace/spin numbers.

### Slide 5: Players to watch
- Title: "PLAYERS TO WATCH".
- Four player cards in a 2×2 grid, two per team, each with:
  - a thin team-colour edge;
  - the player name (no photo);
  - the role ("Batter" / "Bowler");
  - one big number with its label, e.g. "31% top scorer" or "2+ wickets 48%".
- Small note: "Chances from our match simulations".

### Slide 6: Call to action
- Large headline: "FULL PREVIEW, FANTASY PICKS & LIVE WIN PROBABILITY".
- Sub-line: "Free on cricsynthesis.in".
- A clean URL block "cricsynthesis.in/previews" in steel blue, plus "Link in bio".
- Small line: "Projections, not certainties. For analysis and entertainment."
- Wordmark larger here, centred.

### Content rules (important)
- Show headline numbers only: one win %, one score range per side, three ground facts, four player numbers. Never show
  full distributions, over-by-over data, match-ups, fantasy teams, captain picks or anything from the paid
  Scenario Lab. Those stay on the website.
- No betting language anywhere: no "odds", "bet", "tips", "sure win", "jackpot". Say "prediction", "chance",
  "projection", "simulations".
- Do not name any data provider.
- Text must stay legible on a phone: nothing below 26 px; key numbers 120 px or larger.
- Contrast: all text at least 4.5:1 against its background.

### Variations to show
- Slide 2 for a close match (51% / 49%) and a one-sided one (78% / 22%).
- One women's match (e.g. "INDIA WOMEN vs ZIMBABWE WOMEN") to check long names fit.
- Dark version of slide 1: background #111315, ink #E6E7E8, steel #8FB3D9.

### Deliverable
A reusable template: named layers or components for every placeholder (team names, short codes, colours,
percentages, ranges, ground facts, player cards, match label), so the same layout can be filled for any match.
