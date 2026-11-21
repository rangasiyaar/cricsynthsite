# CricSynthesis Business API: "Before the toss" reel

A 45-second vertical reel (9:16, 1080×1920) selling the Business API to the people who run cricket coverage.
Source: `marketing/reel/business-reel.html` (each frame comes from `render(t)`).

## The idea

For a cricket publisher or app, **the toss is a deadline**. In the hour before it, their readers type very specific
questions into search: what will India score, when do the wickets fall, pace or spin here, who should I captain.
Whoever answers first, with something better than a guess, gets the traffic.

So the reel *is* that hour: real searches typed out, each one answered with an actual CricSynthesis number and its
range. The questions sell the need; the answers are the proof; the toss is the ending.

Why it isn't generic: it shows the buyer their own audience's behaviour, uses cricket's own deadline, and every claim
on screen is a product output rather than an adjective. No "AI-powered", no "insights", no "at scale", no "who wins".

## 1. Marketer

| | |
|---|---|
| **Audience** | Heads of content, product and growth at sports publishers, broadcasters, fantasy and sports apps. |
| **Insight** | Pre-match search is the biggest traffic window of a match day, and it closes at the toss. Preview desks can't write a data-led answer for every fixture by hand. |
| **Promise** | Answer every pre-match question, for every match we cover, inside your product, before the toss. |
| **Proof** | Product outputs only: 184 (likely 166–201), overs 16–19, spin's edge at the ground, captain picks, the one API call. |
| **Action** | Book a call · cricsynthesis.in/contact |
| **Where** | LinkedIn video first, then Instagram Reels and YouTube Shorts, and sales follow-up emails. |
| **Never** | Betting words, "guaranteed", accuracy %, customer counts or logos we can't show, data sources, league or team logos. |

## 2. Scriptwriter (45 s)

| # | Time | Beat | On screen |
|---|---|---|---|
| 1 | 0–3.5 s | **Cold open** | Search types *"what will india score today"* · **Every match starts with a search.** |
| 2 | 3.5–8 s | **The flood** | *"when do the wickets fall"*, *"pace or spin at this ground"*, *"who should i captain"* · **Your readers ask before the toss.** |
| 3 | 8–16 s | **The answers** | **184** likely 166–201 · **Overs 16–19** · **Spin has the edge**, typical score 168 · **C: top-order bat**, VC: lead spinner · **Give them numbers.** |
| 4 | 16–19.5 s | **The reveal** | `GET /v1/matches/{id}`, the four answers gather · **Every answer. One API.** |
| 5 | 19.5–27 s | **What's in the API** | Match forecasts (win chance pre-match and live, projected runs, wickets, danger overs) · Player intelligence (ratings, form, match-ups, fantasy points, captain picks) · Grounds & teams (typical scores, pace or spin, team profiles, rankings, trends) · Simulation (change the toss, conditions or line-up and replay) · Graphics (ready-to-post match and player cards) |
| 6 | 27–32 s | **Graphics + AI** | **A graphic for every post.** Win-chance card, score worm, key-duel card · **Works with AI assistants**, same data through MCP |
| 7 | 32–38 s | **The service** | **Built around your product.** Custom limits sized to your traffic · Your own live dashboard · Integration done with you (site, app, CMS, graphics workflow) · Priority support |
| 8 | 38–41 s | **Where it lives** | On your site. In your app. On your graphics desk. |
| 9 | 41–45 s | **Line + CTA** | **Answer before the toss.** · BOOK A CALL · cricsynthesis.in/contact · logo, Business API |

The toss clock at the top fills across the whole reel and turns clay as the final line lands. Sample numbers
illustrate real product outputs, not a real fixture.

## 3. Filmmaker

- The whole film is one screen-space: a search interface on a night-match navy ground, lit by a single drawn floodlight.
- Searches are lowercase, typed with a caret, like real queries; answers are big Barlow Condensed numbers. The contrast
  (messy human question, clean exact number) is the visual idea.
- A thin **toss clock** runs along the top edge for the whole reel and reaches the end exactly as "Answer before the
  toss" lands. It is the only motion that never stops.
- Clay is used once per answer, for the single most important figure.

## 4. Video editor

- 30 fps, 30.0 s, 1080×1920, H.264, `yuv420p`; safe areas 120 px top, 220 px bottom.
- Typing at 18 characters a second; each new search drops 0.25 s after the last finishes.
- Answers replace questions with a 0.3 s cross-wipe; numbers count up over 0.8 s.
- Hold the end card 3.5 s. Cut-downs: 15 s (beats 1, 3, 6) and a 6 s bumper (beat 1 + end card).
- Burned-in captions are the on-screen text; it plays complete with the sound off.

## 5. Voice-over (optional; the reel works silent)

Calm, dry, broadcaster's voice. Never hype. ~140 wpm.

| Time | Line |
|---|---|
| 0.3 s | "Every match starts with a search." |
| 3.8 s | "When do the wickets fall? Pace or spin? Who do I captain?" *(quick, like several readers)* |
| 8.3 s | "Give them numbers. One eighty-four. Overs sixteen to nineteen. Spin." |
| 16.3 s | "Every answer, from one API." |
| 19.8 s | "Match forecasts, before the toss and live. Player ratings and match-ups. Grounds, teams and trends. What-if simulations." |
| 27.3 s | "And a ready graphic for every post. Or plug it straight into your AI assistant." |
| 32.3 s | "The Business plan is built around you: limits sized to your traffic, your own dashboard, integration done with your team, and priority support." |
| 38.2 s | "On your site, in your app, on your graphics desk." |
| 41.5 s | "CricSynthesis Business API. Answer before the toss." |

Music: a quiet ticking pulse that tightens toward the end; it stops on "toss", then one low note under the CTA.

## 6. Posting copy

> Every match starts with a search: what will they score, when do the wickets fall, pace or spin, who to captain.
> The CricSynthesis Business API answers all of it with numbers and ranges, for every match we cover, inside your site
> or app, before the toss. Book a call: cricsynthesis.in/contact
