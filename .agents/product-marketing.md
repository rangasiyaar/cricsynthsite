# Product Marketing Context: CricSynthesis

Version 1.0 · 27 Nov 2026 · Source of truth for the marketing skills in `.claude/skills/`. Facts come from CLAUDE.md,
`app/lib/pro.ts`, `app/lib/plans.ts` and the About page. House rules at the bottom override anything a skill suggests.

## Product Overview
- **One line:** Cricket match forecasts and analytics for fans, from a ball-by-ball model of every recorded delivery.
- **What fans get:** for each covered match, win chances, likely scores for both teams and how the runs come, the overs
  where wickets fall, every player rated, batter v bowler battles, a fantasy XI with captain and vice-captain, and
  MatchSynth Lab (change pitch, weather, toss, form or match state and replay the match in the browser).
- **Where:** website cricsynthesis.in (match centre, Lab, Guide) and an Android app (APK from the site, not on Google
  Play yet). Same account on both.
- **Free:** each match's Overview tab. **Pro:** every other match-centre tab and the full Lab.
- **Developers:** an analytics / simulation / graphics API (56 endpoints) and a hosted MCP server for AI assistants
  (41 tools). Free 200 calls a day.
- **Pricing:** CricSynthesis Pro ₹349/month (yearly ₹3,769 exists, but lead with monthly); one free day per account,
  first charge 24 h later; UPI Autopay or card. API Plus ₹4,999/month (20,000 calls a day, includes Pro). Business by contact.
- **Coverage:** men's and women's internationals, IPL-style leagues (WBBL, ILT20, NPL...), Indian domestic T20s, from
  3 days before the start; forecasts update when XIs and the toss come in.

## Target Audience
- **Primary:** Indian cricket fans 18+ who follow matches closely and play fantasy cricket; mobile-first, UPI users.
- **Secondary:** fans in Nepal, Bangladesh, Sri Lanka, Pakistan, Australia, the UK and the Gulf.
- **Developers:** fantasy apps, cricket media and content creators, data hobbyists, people building AI assistants.

## Problems & Pain Points
- Pre-match "predictions" online are opinion or tipster hype with no track record.
- Fantasy picks are guesswork: who bats where, who suits this ground, who to make captain.
- Scorecards say what happened, not what is likely to happen or why.
- Developers can't get modelled cricket analytics without scraping or expensive data deals.

## Competitive Landscape
- **Direct:** fantasy tip sites and apps, cricket stats sites with pre-match previews.
- **Secondary:** news previews, YouTube/Telegram tipsters, the fantasy platforms' own stats screens.
- **Indirect:** gut feel and friends' WhatsApp groups.
- Never name competitors in public copy.

## Differentiation
- Every forecast comes from one model of real ball-by-ball history, not opinion.
- Public, checkable track record: every call is scored after the match on /results/ (About page shows accuracy).
- Explains the why (phases, match-ups, venue) in plain words; ⓘ explanations on every section.
- MatchSynth Lab: no one else lets a fan replay a match under their own conditions.
- Same numbers available to developers (API, MCP).

## Objections
- "Predictions are gambling." → We are analytics for fans and fantasy players; no betting, odds or tips.
- "Can it really know?" → Show the scored track record; numbers are chances, not certainties.
- "₹349 is a lot." → One free day; cancel any time in one tap; cheaper than one paid fantasy contest mistake (don't say this literally).
- "Autopay worries." → ₹5 check refunded at once; cancel during the free day and you're never charged.

## Customer Language (use these words)
- Who will win, likely score, playing XI, captain pick, C/VC, pitch report, toss, death overs, powerplay, form.
- Avoid: model jargon ("Monte Carlo", "simulations"), "AI predicts", "guaranteed", "sure shot", "tips".

## Brand Voice
- Plain, confident, cricket-literate English a regular fan uses. Short sentences. Numbers over adjectives.
- No AI slop: no "unlock the power", "it's not X, it's Y", triplet lists, hype words, exclamation marks.
- Professional, never tipster-like.

## Proof Points
- Every finished covered match is scored on /results/ with hits and accuracy (figures on the About page are live).
- Thousands of checked calls across dozens of competitions (quote the live numbers, never invent them).

## Goals
- Grow organic search and AI-answer traffic to match pages.
- Convert free Overview readers and app users to Pro (free day → first paid charge).
- Keep Pro subscribers past the first charge (UPI mandate approvals, failed first charges are the main leak).
- Zero paid ads: everything must be organic or free.

## House Rules (override any skill)
- **Zero spend:** no paid tools, ads or partner products a skill recommends.
- **No betting language** (odds, tips, bet, wager, sure win). Fantasy is fine.
- **Don't name data sources** anywhere except /credits/. Don't name service providers in policies.
- **No method details** (how the model works) in public copy.
- **18+ only.** No targeting under-18s.
- **Design rules** in `app/DESIGN.md`; copy and prices for Pro live in `app/lib/pro.ts`.

## Learnings
- (none yet)

## Changelog
- 1.0 (27 Nov 2026): first version, written from the repo.
