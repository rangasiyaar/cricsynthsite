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

export type GuideGroup = "Start here" | "The match" | "The players" | "The ground" | "Fantasy" | "Tools" | "Quick guides";
export const GROUPS: GuideGroup[] = ["Start here", "The match", "The players", "The ground", "Fantasy", "Tools", "Quick guides"];

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
    kind: "article", slug: "how-our-forecasts-are-made", group: "Start here", title: "How our forecasts are made", access: "free",
    short: "Where the numbers come from and what moves them.",
    seoTitle: "How CricSynthesis cricket forecasts are made",
    description: "Where CricSynthesis match forecasts come from, what makes them change, and what no forecast can know.",
    intro: "Before every match we play it out many times on computer, ball by ball. In each run the players bat and bowl the way their past matches say they do. The win chances, scores and player numbers on a match page are simply a count of what happened across all those runs.",
    blocks: [
      { heading: "What goes in", text: [
        "Every player's record with bat and ball, how the ground tends to play, and how matches in the competition usually go. Once the toss and the playing XIs are known, they go in too. Until then we use the XIs we expect.",
      ] },
      { heading: "What moves a forecast", text: [
        "We run it again when the XIs are named and again after the toss, so a big name left out or a reshuffled order shows up straight away. During the match, the live projection starts from the real score and plays out the rest.",
      ] },
      { heading: "What no forecast can know", text: [
        "A mid-match injury, a dropped catch, rain that wasn't expected, someone playing the innings of their life. That's why we give chances, not calls. A team on 70% still loses about three games in ten.",
      ] },
      { heading: "How we keep score on ourselves", text: [
        "After every match we mark each pre-match call against the scorecard and publish it on the Results page, misses included.",
      ] },
    ],
    faq: [
      ["Why did the forecast change before the start?", "It's run again when the playing XIs are named and after the toss. A change in the XI or the batting order can move the numbers."],
      ["Can a 70% favourite lose?", "Yes, about three times in ten. That's exactly what 70% means."],
    ],
  },
  {
    kind: "article", slug: "free-and-pro", group: "Start here", title: "Free and Pro", access: "free",
    short: "What's free for every match, and what Pro adds.",
    seoTitle: "CricSynthesis Free and Pro: what each includes",
    description: "What every fan gets free on CricSynthesis, and what CricSynthesis Pro adds for every match.",
    intro: "Every match's Overview is free: win chances, projected scores, when wickets are likely to fall, players to watch, the key duel, the ground and our captain picks. So is the Results page, where every call is checked against the scorecard.",
    blocks: [
      { heading: "What Pro adds", text: [
        "The rest of the match centre for every match we cover: Scores, Wickets, Players, Top players, MVP, Batter v bowler, Venue and Fantasy.",
        "MatchSynth Lab, where you change the toss, the pitch, the dew or a player's form, or start from any score, and the whole match centre updates for your scenario.",
        "Each Pro section has its own page in this guide, so you can see what it shows before you subscribe.",
      ] },
      { heading: "Price", text: [
        `${rupees(PRO.monthly)} a month or ${rupees(PRO.yearly)} a year. New accounts get a free day, and you can cancel any time from your account.`,
      ] },
    ],
  },

  // ── the match ──
  {
    kind: "analysis", slug: "win-chance-and-projected-scores", group: "The match", title: "Win chance and projected scores", access: "free",
    short: "Who's favourite, by how much, and what each side usually scores.",
    seoTitle: "What does win chance mean in cricket? Win chance and projected scores explained",
    description: "How to read a cricket win chance, a projected score range and par, and how to use them before a match.",
    section: "Overview",
    what: "The top of every match page tells you who's favourite and by how much, and what total each side usually ends up with.",
    see: [
      "Each side's win chance, with a bar showing the split.",
      "Each side's projected score and its likely range, where the total lands in half our runs.",
      "A chart of both ranges. The dot is the usual score, the thick bar the likely range, the thin line the low and high ends, and the dashed line is par.",
      "Runs per over for both sides, with a ring wherever a wicket usually falls.",
    ],
    read: [
      "60% means a side wins about six games in ten. The wider the gap, the clearer the favourite. Near 50–50, the toss and the first few overs matter more.",
      "The projected score is the usual total, not a target. A narrow range means the innings tends to go one way; a wide one means it could go many ways.",
      "Par is the first-innings score that leaves both sides level. Bat first and pass it, and you're favourites.",
    ],
    example: "Side A on 58%, projected 165 (likely 150–180), par 160. If they bat first and make 175, they're in control. At 145, the chasing side would be ahead.",
    decide: [
      "Before the toss, use par to judge what a good first-innings score looks like.",
      "During the first innings, a score running well above the likely range means a big total is coming.",
      "For fantasy, batters from the side expected to score more usually return more points.",
    ],
    mistakes: [
      "Reading 60% as a win. The other side still takes four games in ten.",
      "Treating the projected score as exact. Anything inside the likely range is a normal day.",
    ],
    faq: [
      ["What does win chance mean in cricket?", "How often a side wins when we play the match out many times. 60% means about six wins in ten."],
      ["What is par score?", "The first-innings total that gives both sides an even chance."],
    ],
  },
  {
    kind: "analysis", slug: "scores", group: "The match", title: "Scores", access: "pro",
    short: "How each innings is likely to unfold, from the first over to the chase.",
    seoTitle: "Cricket score projections explained: totals, phases, par and the chase",
    description: "How to read projected totals, the score through the innings, runs by phase and what the chasing side needs.",
    section: "Scores",
    what: "Everything about runs: how often each total comes up, where the score usually stands at each over, how each phase goes, and what the side batting first needs to post.",
    see: [
      "Final totals, showing how often each side finishes on each score. Switch to Chance of reaching for the odds of at least a given total, or to Batting first and Chasing to see each on its own.",
      "Score through the innings, with the usual score at every over and a band for the normal range.",
      "Score at each stage, the usual score at the end of the powerplay, at halfway and at the end.",
      "Runs per over for both sides.",
      "Win chance by first-innings total, and the chasing side's chance for each target.",
      "A table for each side by phase, with runs, wickets and the chance of getting through without losing one.",
    ],
    read: [
      "Taller bars in Final totals are scores that come up more often. The wider the band in Score through the innings, the less settled the innings.",
      "In the win-chance chart, find a first-innings score along the bottom and read up. Where the line crosses 50% is par.",
      "No wicket is the chance of getting through that phase without losing one.",
    ],
    example: "Chance of reaching 180+: 25%. The side gets there about one game in four, so 180 would be a big day for them.",
    decide: [
      "At halfway, compare the real score with Score at each stage to see whether a big total is on.",
      "The moment the first innings ends, read the target off the chase chart.",
      "Pick batters who play in the phase where their side scores fastest.",
    ],
    mistakes: [
      "Looking only at the usual score. Chance of reaching tells you how likely a big total really is.",
    ],
    faq: [
      ["What is a good first-innings score?", "Anything above the point where the win-chance line crosses 50%. That's par for this match."],
    ],
  },
  {
    kind: "analysis", slug: "wickets", group: "The match", title: "Wickets", access: "pro",
    short: "When wickets fall, who takes them and which overs are dangerous.",
    seoTitle: "When do wickets fall? Cricket wicket projections explained",
    description: "How to read the chance of a wicket in each over, when each wicket usually falls and who's likely to take it.",
    section: "Wickets",
    what: "When each side usually loses its wickets, which overs are dangerous, and the bowler and batter most likely to be involved.",
    see: [
      "The chance of a wicket in every over for both sides, with a dotted line for an average over.",
      "Wickets each side usually has down at key points.",
      "A grid for each wicket, darker where it's more likely to fall.",
      "A table for each wicket with the chance it falls at all, the usual over, the score and partnership at the time, and the likely bowler and batter.",
    ],
    read: [
      "Bars above the dotted line are danger overs for the batting side.",
      "Falls is the chance that wicket goes down at all. A ninth wicket at 30% means the side is usually not bowled out.",
      "Figures like 2.4 wickets are averages, so two or three is most common.",
    ],
    decide: [
      "Use the danger overs to see when a collapse is most likely, and when a side usually rebuilds.",
      "For fantasy, bowlers who operate in the danger overs are the likeliest wicket-takers.",
    ],
    mistakes: [
      "Treating the likely bowler as certain. It's the bowler most likely to take that wicket, not the only one who can.",
    ],
    faq: [
      ["When are wickets most likely in a T20?", "It depends on the sides and the ground. The chance of a wicket in each over shows this match's danger overs."],
    ],
  },

  // ── the players ──
  {
    kind: "analysis", slug: "players", group: "The players", title: "Players", access: "pro",
    short: "Runs for every batter and wickets for every bowler, with the chances behind them.",
    seoTitle: "Cricket player projections explained: runs, wickets, fifties and ducks",
    description: "How to read each player's projected runs, chance of 30 or 50, duck chance, wickets and economy.",
    section: "Players",
    what: "Every player in both XIs: the runs each batter usually makes, the wickets each bowler usually takes, and how often they have a big day.",
    see: [
      "Player run ranges. The dot is the usual score, the thick bar the range in half our runs, the thin line a quiet day and a big one.",
      "The batting table, with average runs, the likely range, the chance of 30+ and 50+ (50+ and 100+ in one-dayers), the chance of a duck, the chance of top-scoring and the bowler most likely to get them out.",
      "The bowling table, with usual overs, average wickets, the chance of 2+ and 3+, economy, the chance of being the side's best bowler, and bowling style.",
    ],
    read: [
      "A batter averaging 28 with a 35% chance of 30+ gets to 30 about one game in three.",
      "Economy is runs given away per over. Lower is better.",
      "A player tagged new has no past matches to go on, so we expect an average performance.",
    ],
    decide: [
      "Pick captains on their chance of a big score, not just their average.",
      "Check who each batter is most likely out to. If it's a strong bowler in form, lower your expectations.",
    ],
    mistakes: [
      "Comparing averages across batting positions. Openers face more balls, so compare like with like.",
    ],
    faq: [
      ["What does chance of 50+ mean?", "How often the batter reaches 50 when we play the match out. 20% is about one game in five."],
    ],
  },
  {
    kind: "analysis", slug: "top-players-and-mvp", group: "The players", title: "Top players and MVP", access: "pro",
    short: "All 22 players ranked for this match, with bat, with ball and overall.",
    seoTitle: "Cricket player ratings for a match: top batters, bowlers and MVP explained",
    description: "How to read the batting and bowling ratings and the MVP score for a cricket match.",
    sections: ["Top players", "MVP"],
    what: "All 22 players ranked by what they're likely to give their side in this match. One list for batting, one for bowling, and an MVP list that combines the two.",
    see: [
      "Top batters, with usual runs and scoring rate and a rating from 1 to 100.",
      "Top bowlers, with usual wickets and economy and a rating from 1 to 100.",
      "Most valuable players, one list scored from 1 to 10 for what each player brings with bat and ball together.",
    ],
    read: [
      "Batters are rated on runs and how fast they come, bowlers on wickets and how few runs they concede. 100 is a match-winning day.",
      "The MVP score rewards players who do both, so a good all-rounder often tops it.",
      "Ratings are for this match only. The same player can rank differently against another side or at another ground.",
    ],
    decide: [
      "Look to the top of the MVP list for captains who can score with bat and ball.",
      "Use the batting and bowling lists to see who's likely to matter most in each innings.",
    ],
    mistakes: [
      "Reading the rating as a career score. It's about this match.",
    ],
    faq: [
      ["What is the MVP score?", "A score from 1 to 10 for what a player is likely to contribute with bat and ball together in this match."],
    ],
  },
  {
    kind: "analysis", slug: "batter-v-bowler", group: "The players", title: "Batter v bowler", access: "pro",
    short: "The bowlers most likely to get each batter out.",
    seoTitle: "Batter v bowler match-ups explained",
    description: "How to read batter v bowler match-ups and the key duel for a cricket match.",
    section: "Matchups",
    what: "The bowler–batter pairings where the bowler is most likely to take the wicket in this match.",
    see: [
      "Each pairing with the chance that bowler dismisses that batter.",
      "The top pairing, which also appears on the Overview as the key duel.",
    ],
    read: [
      "15% means that bowler gets that batter about 15 times in a hundred games.",
      "It allows for whether they're likely to face each other at all. A death bowler rarely meets an opener who's already back in the hut.",
    ],
    decide: [
      "Watch the key duel when that bowler comes on. It's often where the match turns.",
      "For fantasy, a batter facing several strong match-ups is a riskier captain.",
    ],
    mistakes: [
      "Reading a strong match-up as a sure thing. It's the likeliest pairing, nothing more.",
    ],
    faq: [
      ["What is a key duel in cricket?", "The bowler–batter pairing with the best chance of a dismissal in this match."],
    ],
  },

  // ── the ground ──
  {
    kind: "analysis", slug: "venue", group: "The ground", title: "Venue", access: "pro",
    short: "How the ground plays: scores, the toss, batting first or chasing, pace or spin.",
    seoTitle: "Cricket ground analysis explained: first-innings scores, toss, pace v spin",
    description: "How to read a cricket ground's first-innings scores, batting first v chasing record, toss record and pace v spin.",
    section: "Venue intelligence",
    what: "How this ground usually plays, based on recent matches here and compared with other grounds.",
    see: [
      "The ground's character (for example, high scoring and batting friendly), the usual first-innings score, the batting-first and chasing record, and the toss record.",
      "First-innings scores here in 10-run bands, with markers for today's sides.",
      "Scoring by phase, with runs per over, balls per wicket and boundary balls against all grounds.",
      "Pace v spin, with how much each bowls here, their economy and how often they strike.",
      "Recent matches here, and how today's players have done at this ground before.",
    ],
    read: [
      "Green figures favour batting, red ones favour bowling.",
      "Balls per wicket is how long a batter usually lasts. Higher suits batters, lower suits bowlers.",
      "A toss record near 50% means the toss hasn't counted for much here.",
    ],
    decide: [
      "If chasing usually wins here, expect the toss winner to bowl.",
      "If spin takes most of the wickets, pick the spinners, and back batters who play spin well.",
    ],
    mistakes: [
      "Trusting a ground with few matches. Check how many games the numbers come from.",
    ],
    faq: [
      ["What is a good score at this ground?", "Anything in the top bands of the first-innings chart is above average here."],
    ],
  },

  // ── fantasy ──
  {
    kind: "analysis", slug: "fantasy-teams", group: "Fantasy", title: "Fantasy teams", access: "pro",
    short: "Our small league team, the Mega League teams and a rating for every player.",
    seoTitle: "Fantasy cricket teams explained: small league, Mega League and player ratings",
    description: "How to use the CricSynthesis small league team, the Mega League teams and the fantasy player ratings.",
    section: "Fantasy",
    what: "Ready-made fantasy teams for the match, and a fantasy rating for every player.",
    see: [
      "The small league team, our strongest single XI, shown on a pitch with each player's expected points. The captain's points count double, the vice-captain's one and a half times.",
      "Mega League teams, a set of different XIs with different captains, built for big contests.",
      "All players, each rated out of 10 for fantasy.",
    ],
    read: [
      "Expected points are what a player usually scores in fantasy points across our runs.",
      "In the ratings, 10 is the player we expect to score most. A 5 scores about half as much.",
      "The teams update once the playing XIs are named. Before that they use the XIs we expect, so check again after the toss.",
    ],
    decide: [
      "In small contests, play the small league team. It's built to score well most of the time.",
      "In big contests, enter several Mega League teams together. Each one backs a different way the match could go, so between them they cover more of what can happen.",
      "Building your own? Start from the top-rated players and add a couple of your own picks.",
    ],
    mistakes: [
      "Locking a team before the XIs are out. A player who doesn't play scores nothing.",
      "Entering a single Mega League team in a big contest. They work as a set.",
    ],
    faq: [
      ["What's the difference between the small league and Mega League teams?", "The small league team is our strongest single XI, for contests with few entries. The Mega League teams are a set with different captains, for big contests where you enter several."],
    ],
  },

  // ── tools ──
  {
    kind: "analysis", slug: "live-projection", group: "Tools", title: "Live projection", access: "free",
    short: "Where the match is heading, updated as it's played.",
    seoTitle: "Live cricket win chance and projected finish explained",
    description: "How the live projection updates the win chance and projected finish during a cricket match.",
    what: "While a match is on, the Overview takes the real score and plays out the rest of the match from there.",
    see: [
      "Where the match stands, for example needs 54 from 36 balls.",
      "Each side's win chance from here.",
      "The projected finish for the innings in progress.",
    ],
    read: [
      "It moves with every update, so a big over or a wicket can swing it sharply.",
      "Early on it stays close to the pre-match forecast and firms up as the match goes on.",
    ],
    decide: [
      "In a chase, it tells you whether the batting side is ahead of the rate they need.",
    ],
    mistakes: [
      "Overreacting to one over. Watch the trend across a few.",
    ],
    faq: [
      ["How often does the live projection update?", "Every time the score updates during the match."],
    ],
  },
  {
    kind: "analysis", slug: "matchsynth-lab", group: "Tools", title: "MatchSynth Lab", access: "pro",
    short: "Change the conditions or start from any score, and replay the match.",
    seoTitle: "MatchSynth Lab: cricket what-if scenarios explained",
    description: "How to use MatchSynth Lab to change the toss, pitch, dew, a player's form or the score, and see the forecast again.",
    what: "Your own what-ifs. Change the conditions, or start from any score, and the whole match centre updates for your scenario.",
    see: [
      "Who bats first.",
      "The pitch, with more or fewer runs, more or fewer wickets, and help for spinners or seamers.",
      "Dew in the second innings.",
      "A bowler ruled out, or a change in a player's form.",
      "A starting score: the innings, wickets down, overs bowled and runs.",
    ],
    read: [
      "Each change gives you a fresh set of win chances, scores and player numbers to set against our forecast.",
      "It runs on your phone or computer. Your settings aren't sent to us.",
    ],
    decide: [
      "Before the toss, see how much batting first or chasing really changes things.",
      "During a match, start from the real score and test your own read, like a pitch slowing up.",
      "For fantasy, see how a player's numbers change when conditions suit spin or seam.",
    ],
    mistakes: [
      "Changing everything at once. Change one thing at a time so you know what made the difference.",
    ],
    faq: [
      ["What can I change in MatchSynth Lab?", "Who bats first, how the pitch plays, help for spin or seam, dew, a bowler being unavailable, a player's form and the score to start from."],
    ],
  },
  {
    kind: "analysis", slug: "results", group: "Tools", title: "Results", access: "free",
    short: "Every pre-match call, checked against the scorecard.",
    seoTitle: "How accurate are CricSynthesis forecasts? Results explained",
    description: "How CricSynthesis checks every pre-match forecast against the scorecard, and how to read the Results page.",
    what: "After each match we check every call we made before it against the scorecard and publish the outcome, hit or miss.",
    see: [
      "How many calls came true, overall and by tab.",
      "Each call: what we said, what happened, and a tick or a cross.",
      "Our fantasy teams scored on real points, next to the Ultimate team of the match, the best XI anyone could have picked with hindsight.",
    ],
    read: [
      "72 of 97 came true means 72 calls were right.",
      "Our fantasy teams are shown as a share of the Ultimate team's points. 80% means we got 80% of the most anyone could have scored.",
    ],
    decide: [
      "Use the record to decide how much weight to put on our forecasts for a competition or kind of match.",
    ],
    mistakes: [
      "Judging us on one match. A 70% favourite losing is normal. Look at the record over many games.",
    ],
    faq: [
      ["How accurate are the forecasts?", "Every pre-match call is marked against the scorecard on the Results page, so you can judge the record yourself."],
    ],
  },

  // ── quick guides ──
  {
    kind: "howto", slug: "pick-your-fantasy-team-in-5-minutes", group: "Quick guides", title: "Pick your fantasy team in 5 minutes", access: "pro", minutes: 5,
    short: "A five-minute routine from the playing XIs to a locked team.",
    seoTitle: "How to pick a fantasy cricket team in 5 minutes",
    description: "A five-minute routine for picking a fantasy cricket team and captain with CricSynthesis.",
    intro: "Four tabs, any match.",
    steps: [
      { title: "Wait for the XIs", text: "Open the match once the playing XIs are in. The forecast and the fantasy teams are run again with them.", page: "how-our-forecasts-are-made" },
      { title: "Start from our team", text: "In Fantasy, take the small league team for a small contest, or two or three Mega League teams for a big one.", page: "fantasy-teams" },
      { title: "Check your captain", text: "In Players, look at your captain's chance of 30+ or 50+ and who they're most likely out to. A big-score chance matters more than a high average.", page: "players" },
      { title: "Read the ground", text: "In Venue, if spin takes most wickets, make sure you have the spinners. If chasing usually wins, the side batting second's top order is worth more.", page: "venue" },
      { title: "Make a swap or two, then lock", text: "Use All players to bring in a couple of high-rated picks you believe in, then lock the team.", page: "fantasy-teams" },
    ],
    tip: "Look again after the toss. It's the last update before the first ball.",
  },
  {
    kind: "howto", slug: "before-the-toss", group: "Quick guides", title: "Before the toss", access: "pro", minutes: 3,
    short: "Three numbers that tell you how the match is likely to go.",
    seoTitle: "Before the toss: how to read a cricket match in 3 minutes",
    description: "What to check before the toss: who's favourite, what par is and how the ground plays.",
    intro: "Three numbers to know before the coin goes up.",
    steps: [
      { title: "Who's favourite, and by how much", text: "Check the win chance on the Overview. If it's close to 50–50, the toss and the powerplay carry more weight.", page: "win-chance-and-projected-scores" },
      { title: "What par is", text: "Note the par first-innings score. It's the number to compare against when the first innings ends.", page: "scores" },
      { title: "Bat or bowl here", text: "In Venue, see how often batting first and chasing have won, and what toss winners chose. That's likely the captain's call.", page: "venue" },
    ],
    tip: "To see how much the toss itself matters, switch who bats first in MatchSynth Lab and compare.",
  },
  {
    kind: "howto", slug: "is-this-chase-on", group: "Quick guides", title: "Is this chase on?", access: "free", minutes: 2,
    short: "Judge a target the moment the first innings ends.",
    seoTitle: "Is this chase on? How to judge a cricket chase",
    description: "How to judge a cricket chase with the chase chart, the live projection and the danger overs.",
    intro: "How to tell a good target from a gettable one, and whether the chase is on track.",
    steps: [
      { title: "Read the target", text: "When the first innings ends, find the target on the chase chart in Scores. Below the marked score, the chasing side is favourite.", page: "scores" },
      { title: "Follow the live projection", text: "During the chase, the Overview shows each side's chance from here. Watch the trend over a few overs, not a single ball.", page: "live-projection" },
      { title: "Know the danger overs", text: "If the chasing side gets through the danger overs from the Wickets tab with wickets in hand, they're usually in charge.", page: "wickets" },
    ],
  },
  {
    kind: "howto", slug: "size-up-a-ground", group: "Quick guides", title: "Size up an unfamiliar ground", access: "pro", minutes: 2,
    short: "Four numbers that tell you how a ground plays.",
    seoTitle: "How to read a cricket ground you don't know",
    description: "A quick way to read any cricket ground: the usual score, batting first or chasing, pace or spin.",
    intro: "New ground? Four numbers on the Venue tab cover most of what you need.",
    steps: [
      { title: "The usual first-innings score", text: "It tells you what a normal total looks like here.", page: "venue" },
      { title: "Batting first or chasing", text: "How often each has won tells you what the toss winner is likely to do.", page: "venue" },
      { title: "Pace or spin", text: "The share of wickets shows who does the damage. Lean your fantasy picks that way.", page: "venue" },
      { title: "How many matches", text: "A handful of games is a hint, not a rule.", page: "venue" },
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
