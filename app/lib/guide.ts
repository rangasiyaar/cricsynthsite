// The Guide (/docs/guide/ on the website, /m/guide/ in the app): what each analysis shows, how to read it and how it
// helps you decide, for a cricket fan. Rendered by components/Guide.tsx. The ⓘ panels link here (GUIDE_FOR).
//
// ── IP checklist (every edit, by anyone) ──────────────────────────────────────────────────────────────────────────
// Say what a number means and how to use it, never how we make it:
//   - no method details: no number of times we play a match, no model names, no weights, formulas or thresholds;
//   - no list of the factors or situations the model uses beyond the plain inputs (players' past matches, the ground,
//     the competition, the toss, the XIs), and nothing from our own research about which effects are real;
//   - no rules for how fantasy teams, captains or Mega League sets are built;
//   - no "how much" for MatchSynth Lab controls (never "dew adds 8 runs");
//   - no data source names (they live on /credits/ only), no betting language, no promises.
// Plain words for a cricket fan: no median, percentile, distribution, simulation or probability.

import type { GlossaryKey } from "@/lib/glossary";
import { PRO, rupees } from "@/lib/pro";

export type GuideGroup = "Start here" | "The match" | "The players" | "The ground" | "Fantasy" | "Tools" | "Decision guides";
export const GROUPS: GuideGroup[] = ["Start here", "The match", "The players", "The ground", "Fantasy", "Tools", "Decision guides"];

/** A match-centre section, for the live example and the "where to find it" link. */
export type GuideSection = "Overview" | "Scores" | "Wickets" | "Players" | "Top players" | "MVP" | "Matchups" | "Venue intelligence" | "Fantasy";

type Base = {
  slug: string; group: GuideGroup; title: string; short: string;
  seoTitle: string; description: string;
  /** "pro": a CricSynthesis Pro section (fully explained here, tagged Pro); "free": free for everyone. */
  access?: "free" | "pro";
};
export type AnalysisPage = Base & {
  kind: "analysis";
  section?: GuideSection;            // shows a live example of this section and links to it
  sections?: GuideSection[];         // a page covering more than one section (first one is shown)
  what: string;
  see: string[];                     // the numbered parts of the section
  read: string[];
  example?: string;
  decide: string[];
  mistakes: string[];
  faq: [string, string][];
};
export type HowToPage = Base & {
  kind: "howto";
  intro: string;
  minutes: number;
  steps: { title: string; text: string; page?: string }[];
  tip?: string;
};
export type ArticlePage = Base & {
  kind: "article";
  intro: string;
  blocks: { heading: string; text: string[] }[];
  faq?: [string, string][];
};
export type GuidePage = AnalysisPage | HowToPage | ArticlePage;

export const GUIDE: GuidePage[] = [
  // ── start here ──
  {
    kind: "article", slug: "how-our-forecasts-are-made", group: "Start here", title: "How our forecasts are made",
    short: "Where the numbers come from, what changes them and what they can't know.",
    seoTitle: "How CricSynthesis cricket forecasts are made", access: "free",
    description: "In plain words: where CricSynthesis match forecasts come from, what makes them change and what they can't know.",
    intro: "Every forecast on CricSynthesis comes from playing the match out many times on computer, ball by ball, before it starts. Each time, the players bat and bowl the way their past matches suggest they would. Count what happens across all those matches and you get the win chances, scores and player numbers you see.",
    blocks: [
      { heading: "What goes in", text: [
        "How each player has batted and bowled in their past matches.",
        "How the ground usually plays, and how matches in this competition usually go.",
        "The toss and the playing XIs, once they're announced. Before that we use the XIs we expect.",
      ] },
      { heading: "What changes a forecast", text: [
        "The forecast is made again when the playing XIs are named and when the toss is done. A big name left out, or a different batting order, can move the numbers a lot.",
        "During a match, the live projection takes the real score so far and plays the rest of the match out from there.",
      ] },
      { heading: "What it can't know", text: [
        "Things nobody can see coming: an injury during the match, a dropped catch, a sudden change in the weather, a player having the day of their life.",
        "A forecast is a set of chances, not a promise. A team we give 70% still loses about 3 matches in 10, and that's the forecast working, not failing.",
      ] },
      { heading: "How we check ourselves", text: [
        "Before every match we make lots of calls: the winner, score ranges, who scores runs, who takes wickets. After the match we mark each one against the scorecard and publish the result, hit or miss, on the Results page.",
      ] },
    ],
    faq: [
      ["Are the forecasts guesses?", "No. Each one comes from playing the match out many times using how every player has actually batted and bowled before, so it shows what usually happens with these players at this ground."],
      ["Why did the forecast change before the match?", "It's made again when the playing XIs and the toss are announced. A change in the XI or the order can move the numbers."],
      ["Can a 70% favourite lose?", "Yes, about 3 times in 10. That's what 70% means."],
    ],
  },
  {
    kind: "article", slug: "free-and-pro", group: "Start here", title: "Free and Pro", access: "free",
    short: "What every fan gets for free, and what CricSynthesis Pro adds.",
    seoTitle: "CricSynthesis Free and Pro: what each includes",
    description: "What's free on CricSynthesis for every match, and what CricSynthesis Pro adds: every match-centre tab and MatchSynth Lab.",
    intro: "Every match's Overview is free for everyone: win chances, projected scores, when wickets fall, players to watch, the key duel, the ground and our captain picks. Results, with every call marked against the scorecard, are free too.",
    blocks: [
      { heading: "What Pro adds", text: [
        "Every other tab of the match centre: Scores, Wickets, Players, Top players, MVP, Batter v bowler, Venue and Fantasy, for every match we cover.",
        "MatchSynth Lab: change the toss, the pitch, the dew, a player's form or who can bowl, or start from any score, and see every tab again for your scenario.",
        "Each of those is explained in full in this guide, marked Pro, so you can see exactly what you'd get.",
      ] },
      { heading: "Price", text: [
        `CricSynthesis Pro is ${rupees(PRO.monthly)} a month or ${rupees(PRO.yearly)} a year, with one free day for new accounts. You can cancel any time from your account.`,
      ] },
    ],
  },

  // ── the match ──
  {
    kind: "analysis", slug: "win-chance-and-projected-scores", group: "The match", title: "Win chance and projected scores", access: "free",
    short: "Who's favourite, by how much, and what each team usually scores.",
    seoTitle: "What does win chance mean in cricket? Win chance and projected scores explained",
    description: "How to read a cricket win chance and a projected score range, and how to use them before a match.",
    section: "Overview",
    what: "The top of every match page: each team's chance of winning, and the total each team usually ends up with when we play the match out.",
    see: [
      "The win chance for each team, with the bar showing the split.",
      "Each team's projected score with its \"likely\" range: where the total lands half the time.",
      "The ranges chart: the dot is the usual score, the thick bar the likely range, the thin line the high and low ends. The dashed line is par.",
      "Runs per over for both teams, with rings where wickets usually fall.",
    ],
    read: [
      "60% means a team wins about 6 times out of 10. The bigger the gap between the two teams, the clearer the favourite. Close to 50–50 means it could go either way.",
      "A projected score is the usual total, not a target. The likely range shows how much it can move: a narrow range means the innings tends to go one way, a wide one means it's harder to call.",
      "Par is the first-innings score that gives both teams an equal chance. If the team batting first goes past it, they become favourites.",
    ],
    example: "Team A 58%, projected 165 (likely 150–180), par 160. Team A are slight favourites. If they bat first and make 175, they're well placed; 145 would put the chasing side ahead.",
    decide: [
      "Before the toss, use the win chance and par to judge how big a first-innings score needs to be.",
      "During the first innings, compare the score with the projected range: well above it means a big total is coming.",
      "For fantasy, the favourite's top order and the side expected to score more usually give more points.",
    ],
    mistakes: [
      "Reading 60% as \"will win\". The other team still wins 4 times in 10.",
      "Treating the projected score as exact. Anything inside the likely range is normal.",
    ],
    faq: [
      ["What does win chance mean in cricket?", "It's how often a team wins when we play the match out many times. 60% means about 6 wins in 10."],
      ["What is par score?", "The first-innings total that gives both teams an equal chance of winning."],
    ],
  },
  {
    kind: "analysis", slug: "scores", group: "The match", title: "Scores", access: "pro",
    short: "How each innings unfolds: totals, phases, par and the chase.",
    seoTitle: "Cricket score projections explained: totals, phases, par and chase",
    description: "How to read projected totals, the score through the innings, phase-by-phase runs and the chase curve.",
    section: "Scores",
    what: "Everything about runs: how often each total comes up, where the score usually stands at every over, how each part of the innings goes, and what the team batting first needs to win.",
    see: [
      "Final totals: how often each team ends on each score. Switch to \"Chance of reaching\" for the chance of getting at least a score, and to \"Batting first\" or \"Chasing\" for each case.",
      "Score through the innings: the usual score at every over, with a band for the normal range.",
      "Score at each stage: the usual score at the end of the powerplay, halfway and the end.",
      "Runs per over for each team.",
      "Win chance by first-innings total, and the chasing side's chance for each target.",
      "Each team by phase: runs, wickets and the chance of getting through the powerplay, middle overs or death without losing a wicket.",
    ],
    read: [
      "Taller bars in Final totals are scores that happen more often. The band in Score through the innings shows how sure the forecast is: a wide band means the innings could go many ways.",
      "In the win-chance chart, find the first-innings score along the bottom and read the chance above it. Where the line crosses 50% is par.",
      "\"No wicket\" in the phase table is the chance of getting through that part of the innings without losing one.",
    ],
    example: "Chance of reaching 180+: 25%. A team gets to 180 or more about 1 time in 4, so 180 would be a big score for them.",
    decide: [
      "At the halfway mark of an innings, compare the real score with Score at each stage to see if a big total is on.",
      "Use the chase chart to judge a target the moment the first innings ends.",
      "Phase runs show when a team usually scores fast, which helps you pick batters who play in those overs.",
    ],
    mistakes: [
      "Looking only at the usual score. Check the chance of reaching a total too: that's what tells you how likely a big score really is.",
    ],
    faq: [
      ["What is a good first-innings score?", "Use the win chance by first-innings total: any score above where the line crosses 50% makes the batting side favourites."],
    ],
  },
  {
    kind: "analysis", slug: "wickets", group: "The match", title: "Wickets", access: "pro",
    short: "When wickets fall, who takes them and the danger overs.",
    seoTitle: "When do wickets fall? Cricket wicket projections explained",
    description: "How to read the chance of a wicket in each over, when each wicket usually falls, and who's likely to take it.",
    section: "Wickets",
    what: "When each team usually loses its wickets, which overs are dangerous, and which bowler and batter are most likely to be involved.",
    see: [
      "The chance of a wicket in every over for both teams, with a dotted line for the average over.",
      "Expected wickets down at key points of the innings.",
      "A grid for each wicket: darker squares are the overs where it's most likely to fall.",
      "A table for each wicket: the chance it falls at all, the usual over, the score and partnership at the time, the likely bowler and the batter likely to go.",
    ],
    read: [
      "Bars above the dotted line are danger overs for the batting side.",
      "\"Falls\" is the chance that wicket goes down at all. A 9th wicket at 30% means the team is usually not bowled out.",
      "Numbers like 2.4 wickets are averages over many matches, so 2 or 3 is most common.",
    ],
    decide: [
      "Use the danger overs to judge when a team is most likely to collapse, and when to expect a rebuild.",
      "For fantasy, bowlers who bowl in the danger overs are more likely to pick up wickets.",
    ],
    mistakes: [
      "Treating the likely bowler as certain. It's the bowler most likely to take that wicket, not the only one.",
    ],
    faq: [
      ["When are wickets most likely in T20?", "It depends on the teams and the ground. The chance-of-a-wicket chart shows the danger overs for this match."],
    ],
  },

  // ── the players ──
  {
    kind: "analysis", slug: "players", group: "The players", title: "Players", access: "pro",
    short: "Every batter's runs and every bowler's wickets, with their chances.",
    seoTitle: "Cricket player projections explained: runs, wickets, 50s and ducks",
    description: "How to read each player's projected runs, chances of 30+ or 50+, duck chance, wickets and economy.",
    section: "Players",
    what: "Every player in both XIs: how many runs each batter usually makes, how many wickets each bowler usually takes, and their chances of a big day.",
    see: [
      "Player run ranges: the dot is the usual score, the thick bar the range it lands in half the time, the thin line a quiet day and a big day.",
      "Batting table: average runs, the likely range, the chance of 30+ and 50+ (50+ and 100+ in one-day matches), the chance of a duck, the chance of top-scoring and the bowler most likely to get them out.",
      "Bowling table: overs they usually bowl, average wickets, the chance of 2+ and 3+ wickets, economy, the chance of being the team's best bowler, and their bowling style.",
    ],
    read: [
      "A batter averaging 28 with a 35% chance of 30+ gets to 30 about 1 time in 3.",
      "Economy is the runs a bowler gives away per over, so lower is better.",
      "A player tagged \"new\" has no past matches to go on, so we expect an average performance from them.",
    ],
    decide: [
      "Pick captains and vice-captains from players with a high chance of a big score, not only a high average.",
      "Check \"most likely out to\": if a batter's main threat is a strong bowler in form, temper your expectations.",
    ],
    mistakes: [
      "Comparing averages across different batting positions. Openers face more balls, so compare like with like.",
    ],
    faq: [
      ["What does chance of 50+ mean?", "How often the batter scores at least 50 when we play the match out. 20% means about 1 match in 5."],
    ],
  },
  {
    kind: "analysis", slug: "top-players-and-mvp", group: "The players", title: "Top players and MVP", access: "pro",
    short: "All 22 players ranked for this match, with bat, with ball and overall.",
    seoTitle: "Cricket player ratings for a match: top batters, bowlers and MVP explained",
    description: "How to read the top batter and bowler ratings and the MVP score for a match.",
    sections: ["Top players", "MVP"],
    what: "All 22 players ranked by how much they're likely to give their team in this match: one list for batting, one for bowling, and an MVP list that mixes both.",
    see: [
      "Top batters: each batter's usual runs and scoring speed, with a rating from 1 to 100.",
      "Top bowlers: each bowler's usual wickets and economy, with a rating from 1 to 100.",
      "Most valuable players: one list with a score from 1 to 10 that adds up what each player brings with bat and ball.",
    ],
    read: [
      "For batters the rating weighs runs and how quickly they come; for bowlers, wickets and how few runs they give away. 100 is a match-winning day.",
      "The MVP score rewards players who do both. A good all-rounder often tops it even if they're not the best batter or bowler.",
      "The ratings are for this match only: the same player can rank differently against other teams or at other grounds.",
    ],
    decide: [
      "Use the MVP list to find captain picks who can score from both bat and ball.",
      "Use the batting and bowling lists to spot who's likely to matter most in each half of the match.",
    ],
    mistakes: [
      "Treating the rating as a career score. It's how this player is expected to do in this match.",
    ],
    faq: [
      ["What is the MVP score?", "A score from 1 to 10 for how much a player is likely to give their team with bat and ball together in this match."],
    ],
  },
  {
    kind: "analysis", slug: "batter-v-bowler", group: "The players", title: "Batter v bowler", access: "pro",
    short: "Which bowlers are most likely to get which batters out.",
    seoTitle: "Batter v bowler match-ups explained",
    description: "How to read batter v bowler match-ups and the key duel for a cricket match.",
    section: "Matchups",
    what: "The bowler and batter pairs where the bowler is most likely to get the batter out in this match.",
    see: [
      "Each pair, with the chance that bowler dismisses that batter, shown as a bar.",
      "The top pair is the key duel shown on the Overview.",
    ],
    read: [
      "15% means that bowler gets that batter out about 15 times in every 100 matches we play out.",
      "It includes the chance of them facing each other at all: a bowler who bowls at the death rarely meets an opener who's already out.",
    ],
    decide: [
      "Watch the key duel when that bowler comes on: it's the moment the match can turn.",
      "For fantasy, a batter facing several high match-ups is riskier as a captain.",
    ],
    mistakes: [
      "Reading a high match-up as \"this bowler always gets him\". It's the most likely pairing, not a sure thing.",
    ],
    faq: [
      ["What is a key duel in cricket?", "The bowler and batter pair where the bowler has the best chance of a dismissal in this match."],
    ],
  },

  // ── the ground ──
  {
    kind: "analysis", slug: "venue", group: "The ground", title: "Venue", access: "pro",
    short: "How the ground plays: scores, batting first or chasing, the toss, pace and spin.",
    seoTitle: "Cricket ground analysis explained: first-innings scores, toss, pace v spin",
    description: "How to read a cricket ground's first-innings scores, batting first v chasing record, toss record and pace v spin.",
    section: "Venue intelligence",
    what: "How this ground usually plays, from the matches played here in recent seasons, compared with other grounds.",
    see: [
      "The ground's character (like \"high scoring, batting friendly\"), the usual first-innings score, how often batting first and chasing won, and the toss record.",
      "First-innings scores here, grouped in 10-run bands, with markers for today's teams.",
      "Scoring by phase: runs per over, balls per wicket and boundary balls in each part of the innings, against all grounds.",
      "Pace v spin: how much each type bowls here, their economy, how often they take wickets.",
      "Recent matches here, and how today's players have done at this ground before.",
    ],
    read: [
      "Green numbers help batting, red ones help bowling.",
      "Balls per wicket is how long a batter usually lasts: higher is better for batting, lower is better for bowling.",
      "A toss record close to 50% means the toss hasn't made much difference here.",
    ],
    decide: [
      "If chasing wins most matches here, the toss winner will probably bowl first.",
      "If spin takes most wickets here, spinners are good fantasy picks and batters who play spin well are worth backing.",
    ],
    mistakes: [
      "Trusting a ground with very few matches. Check \"Matches since\": a handful of games isn't much to go on.",
    ],
    faq: [
      ["What is a good score at this ground?", "Look at the usual first-innings score and the 10-run bands: a score in the top bands is above average here."],
    ],
  },

  // ── fantasy ──
  {
    kind: "analysis", slug: "fantasy-teams", group: "Fantasy", title: "Fantasy teams", access: "pro",
    short: "Our small league team, the Mega League teams and every player's fantasy rating.",
    seoTitle: "Fantasy cricket teams explained: small league, Mega League and player ratings",
    description: "How to use the CricSynthesis small league team, the Mega League teams and the fantasy player ratings.",
    section: "Fantasy",
    what: "Ready-made fantasy teams for this match and a fantasy rating for every player, with expected points for each.",
    see: [
      "Small league team: our best single team, shown on a pitch with each player's expected points. The captain's are doubled and the vice-captain's are one and a half times.",
      "Mega League teams: a set of different teams with different captains, for big contests.",
      "All players: every player rated out of 10 for fantasy.",
    ],
    read: [
      "Expected points are what a player usually scores in fantasy points when we play the match out.",
      "In the ratings, 10 is the player we expect to score the most points. 5 means about half that player's points.",
      "The teams follow the playing XIs once they're announced. Before that they use the XIs we expect, so check again after the toss.",
    ],
    decide: [
      "Small contests with few entries: use the small league team. It's built to score well most of the time.",
      "Big contests: enter several of the Mega League teams together. Each one bets on a different way the match could go, so between them they cover more outcomes.",
      "Making your own team: start from the highest-rated players and swap in a couple of your own picks.",
    ],
    mistakes: [
      "Locking teams before the XIs are out. A missing player scores nothing.",
      "Entering only one Mega League team in a big contest. They're meant to be used as a set.",
    ],
    faq: [
      ["What's the difference between small league and Mega League teams?", "The small league team is our single strongest team for contests with few entries. The Mega League teams are a set with different captains, for big contests where you enter several teams."],
    ],
  },

  // ── tools ──
  {
    kind: "analysis", slug: "live-projection", group: "Tools", title: "Live projection", access: "free",
    short: "Where the match is heading while it's being played.",
    seoTitle: "Live cricket win chance and projected finish explained",
    description: "How the live projection updates the win chance and projected finish during a cricket match.",
    what: "During a match, the Overview shows a live projection: we take the real score so far and play the rest of the match out from there.",
    see: [
      "The current situation, like \"needs 54 from 36 balls\".",
      "Each team's win chance from here, with the bar showing the split.",
      "The projected finish for the innings in progress.",
    ],
    read: [
      "The numbers move after every update, so a big over or a wicket can swing them a lot.",
      "Early in a match the projection is close to the pre-match forecast; it firms up as the match goes on.",
    ],
    decide: [
      "In a chase, the live win chance tells you whether the chasing side is ahead of the rate they need.",
    ],
    mistakes: [
      "Overreacting to one over. Watch how the number moves over a few overs.",
    ],
    faq: [
      ["How often does the live projection update?", "Every time the score updates during the match."],
    ],
  },
  {
    kind: "analysis", slug: "matchsynth-lab", group: "Tools", title: "MatchSynth Lab", access: "pro",
    short: "Change the conditions or start from any score, and see the match again.",
    seoTitle: "MatchSynth Lab: cricket what-if scenarios explained",
    description: "How to use MatchSynth Lab to change the toss, pitch, dew, player form or the score and see the forecast again.",
    what: "Your own what-ifs. Change the conditions of a match, or start from any score, and every tab of the match centre is worked out again for your scenario, right on your phone or computer.",
    see: [
      "Who bats first.",
      "The pitch: more or fewer runs, more or fewer wickets, and help for spinners or seamers.",
      "Dew in the second innings.",
      "Rule a bowler out, or change a player's form.",
      "Start from any score: the innings, wickets down, overs bowled and runs.",
    ],
    read: [
      "Every change gives you a new set of win chances, scores and player numbers, so you can compare your scenario with our forecast.",
      "It runs on your device, and the settings you choose aren't sent to us.",
    ],
    decide: [
      "Before the toss: see how much batting first or chasing changes the win chance.",
      "During a match: start from the real score to see where it's heading under your assumptions, like a pitch slowing down.",
      "Fantasy: check how a player's numbers change if conditions suit spin or seam.",
    ],
    mistakes: [
      "Stacking every change at once. Change one thing at a time so you can see what made the difference.",
    ],
    faq: [
      ["What can I change in MatchSynth Lab?", "Who bats first, how the pitch plays, help for spinners or seamers, dew, a bowler being unavailable, a player's form, and the score to start from."],
    ],
  },
  {
    kind: "analysis", slug: "results", group: "Tools", title: "Results", access: "free",
    short: "Every call we made before the match, marked against the scorecard.",
    seoTitle: "How accurate are CricSynthesis forecasts? Results explained",
    description: "How CricSynthesis checks every pre-match forecast against the scorecard, and how to read the Results page.",
    what: "After each match we check every call we made before it against the scorecard, and publish the result, hit or miss.",
    see: [
      "How many of our calls came true, split by tab.",
      "Each call: what we said before the match, what happened, and a tick or a cross.",
      "Our fantasy teams scored with the real points, against the Ultimate team of the match: the best team anyone could have picked after the match.",
    ],
    read: [
      "\"72 of 97 came true\" means 72 of our calls were right.",
      "Our fantasy teams are shown as a share of the Ultimate team's points: 80% means we got 80% of the most anyone could have scored.",
    ],
    decide: [
      "Use the record to judge how much weight to give our forecasts for a competition or type of match.",
    ],
    mistakes: [
      "Judging the forecasts on one match. A 70% favourite losing once is normal; look at the record over many matches.",
    ],
    faq: [
      ["How accurate are the forecasts?", "Every pre-match call is marked against the scorecard on the Results page, so you can see the record for yourself."],
    ],
  },

  // ── decision guides ──
  {
    kind: "howto", slug: "pick-your-fantasy-team-in-5-minutes", group: "Decision guides", title: "Pick your fantasy team in 5 minutes", access: "pro", minutes: 5,
    short: "From the XIs to a locked team, using four tabs.",
    seoTitle: "How to pick a fantasy cricket team in 5 minutes",
    description: "A five-minute routine for picking a fantasy cricket team and captain using CricSynthesis.",
    intro: "A quick routine for any match: four tabs, five minutes, a team you can lock with confidence.",
    steps: [
      { title: "Wait for the XIs", text: "Open the match once the playing XIs are out (look for the XIs tag). The forecast and the fantasy teams are made again with them.", page: "how-our-forecasts-are-made" },
      { title: "Start from our team", text: "Open Fantasy. For a small contest, the small league team is your starting point. For a big contest, take two or three Mega League teams.", page: "fantasy-teams" },
      { title: "Check your captain", text: "Open Players and look at your captain's chance of a big score and who is most likely to get them out. A high chance of 30+ or 50+ matters more than a high average.", page: "players" },
      { title: "Look at the ground", text: "Open Venue. If spin takes most wickets here, make sure you have the spinners; if chasing usually wins, the side batting second's top order is worth more.", page: "venue" },
      { title: "Make one or two swaps, then lock", text: "Use All players in Fantasy to swap in a couple of high-rated players you believe in. Then lock it.", page: "fantasy-teams" },
    ],
    tip: "Check again after the toss: it's when the forecast is updated for the last time before the start.",
  },
  {
    kind: "howto", slug: "before-the-toss", group: "Decision guides", title: "Before the toss: what to look at", access: "pro", minutes: 3,
    short: "Three things that tell you how the match is likely to go.",
    seoTitle: "Before the toss: how to read a cricket match in 3 minutes",
    description: "What to check before the toss: the favourite, par score and how the ground plays.",
    intro: "Three things to look at before the coin goes up, so you know what to expect whoever wins it.",
    steps: [
      { title: "Who's favourite, and by how much", text: "On the Overview, check the win chance. Close to 50–50 means the toss and the first few overs matter more.", page: "win-chance-and-projected-scores" },
      { title: "What par is", text: "Note the par first-innings score. It's the number to watch when the first innings ends.", page: "scores" },
      { title: "Bat or bowl here", text: "In Venue, check how often batting first and chasing won, and what toss winners chose. That's the call the captain is likely to make.", page: "venue" },
    ],
    tip: "Want to see how much the toss itself matters? Switch who bats first in MatchSynth Lab and compare the win chances.",
  },
  {
    kind: "howto", slug: "is-this-chase-on", group: "Decision guides", title: "Is this chase on?", access: "free", minutes: 2,
    short: "Judge a target the moment the first innings ends, and as the chase goes.",
    seoTitle: "Is this chase on? How to judge a cricket chase",
    description: "How to judge a cricket chase using the chase chart, the live projection and the danger overs.",
    intro: "How to tell whether a target is a good one, and whether the chasing side is on track.",
    steps: [
      { title: "Read the target", text: "When the first innings ends, find the target on the chasing chart in Scores. Below the marked score, the chasing side is the favourite.", page: "scores" },
      { title: "Follow the live projection", text: "During the chase, the Overview's live projection shows each side's chance from here. Watch the trend over a few overs, not one ball.", page: "live-projection" },
      { title: "Know the danger overs", text: "Wickets in the danger overs from the Wickets tab can turn a chase. If the chasing side gets through them with wickets in hand, they're usually in charge.", page: "wickets" },
    ],
  },
  {
    kind: "howto", slug: "size-up-a-ground", group: "Decision guides", title: "Size up a ground you don't know", access: "pro", minutes: 2,
    short: "A two-minute read of any ground before the match.",
    seoTitle: "How to read a cricket ground you don't know",
    description: "A two-minute way to read any cricket ground: usual score, batting first or chasing, pace or spin.",
    intro: "New ground, unfamiliar conditions? Four numbers tell you most of what you need.",
    steps: [
      { title: "The usual first-innings score", text: "In Venue, the first tile tells you what's normal here. It sets your expectations for both teams.", page: "venue" },
      { title: "Batting first or chasing", text: "How often each won here tells you what the toss winner is likely to choose.", page: "venue" },
      { title: "Pace or spin", text: "Share of wickets shows who does the damage here. Lean your fantasy picks that way.", page: "venue" },
      { title: "How many matches", text: "Check how many matches the numbers come from. A handful of games is a hint, not a rule.", page: "venue" },
    ],
  },
];

export const guidePage = (slug: string) => GUIDE.find((p) => p.slug === slug);
export const guidePath = (slug?: string) => (slug ? `/docs/guide/${slug}/` : "/docs/guide/");
export const appGuidePath = (slug?: string) => (slug ? `/m/guide/?p=${encodeURIComponent(slug)}` : "/m/guide/");

/** The guide page each ⓘ explanation links to ("Learn more in the Guide"). */
export const GUIDE_FOR: Partial<Record<GlossaryKey, string>> = {
  "win-chance": "win-chance-and-projected-scores", "projected-scores": "win-chance-and-projected-scores", "runs-wickets-bars": "win-chance-and-projected-scores",
  "live-finish": "live-projection", "key-duel": "batter-v-bowler", "fall-of-wickets": "wickets", "players-to-watch": "players",
  "ground-overview": "venue", "fantasy-overview": "fantasy-teams",
  "final-totals": "scores", "score-fan": "scores", "score-stages": "scores", "runs-per-over": "scores", "win-by-first-innings": "scores",
  "chase-by-target": "scores", "phase-table": "scores", "chance-of-reaching": "scores",
  "wicket-each-over": "wickets", "when-wickets": "wickets",
  "player-ranges": "players", "player-tables": "players", "top-players": "top-players-and-mvp", mvp: "top-players-and-mvp", matchups: "batter-v-bowler",
  "venue-ground": "venue", "venue-first-innings": "venue", "venue-bat-chase": "venue", "venue-toss": "venue", "venue-scores": "venue",
  "venue-phases": "venue", "venue-pace-spin": "venue", "venue-recent": "venue", "venue-xi-batting": "venue", "venue-xi-bowling": "venue",
  "fantasy-small": "fantasy-teams", "fantasy-mega": "fantasy-teams", "fantasy-ratings": "fantasy-teams",
  "result-accuracy": "results", "result-fantasy": "results",
};
