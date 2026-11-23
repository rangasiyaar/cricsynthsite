// The ⓘ explanations next to every section with numbers or a chart (components/Info.tsx). Written for a cricket fan,
// not a statistician: no "median", "percentile", "distribution", "simulation" or "probability". Each entry says what
// the section shows and how to read it, with an example where it helps.
//
// House line for where the numbers come from: we play the match out many times on computer, using how every player has
// batted and bowled before. Never betting language, never a promise, never a data source's name.

export type GlossaryEntry = { title: string; what: string; read?: string; example?: string };

const PLAYED = "We play this match out many times on computer, using how every player has batted and bowled before.";

export const GLOSSARY = {
  // ── match header and overview ──
  "win-chance": {
    title: "Win chance",
    what: `${PLAYED} The win chance is how often each team comes out on top.`,
    read: "60% means a team wins about 6 times out of 10. The other team still wins the other 4, so it's a lean, not a sure thing.",
  },
  "projected-scores": {
    title: "Projected scores",
    what: "The total each team usually ends up with when we play the match out. \"Likely\" is the range the score lands in half the time.",
    read: "The dot is the usual score. The thick bar is the likely range and the thin line shows the high and low ends. Par is the first-innings score that gives both teams an equal chance.",
    example: "165, likely 150–180: expect about 165, and anything from 150 to 180 would be quite normal.",
  },
  "runs-wickets-bars": {
    title: "Runs per over and wickets",
    what: "Each bar is how many runs a team usually scores in that over. A ring above a bar marks an over where a wicket usually falls.",
    read: "Tall bars show the overs where runs come quickest, usually the first six and the last few.",
  },
  "live-finish": {
    title: "Projected finish",
    what: "While the match is on, we take the real score so far and play the rest of the match out many times on computer.",
    read: "It shows where each innings is heading and each team's chance of winning from here. It moves after every update, so a big over can swing it.",
  },
  "key-duel": {
    title: "Key duel",
    what: "The bowler with the best chance of getting this batter out in this match.",
    read: "30% means that bowler gets this batter out about 3 times in every 10 matches we play out.",
  },
  "fall-of-wickets": {
    title: "Projected fall of wickets",
    what: "When each team usually loses wickets: the over the first wicket goes down, how many fall in total, and how many in each part of the innings.",
    read: "Wicket counts like 1.6 are averages across many matches, so 1.6 means 1 or 2 is most common. The steeper the line, the faster wickets are falling.",
  },
  "players-to-watch": {
    title: "Players to watch",
    what: "The batters who usually score the most runs and the bowlers who usually take the most wickets in this match.",
    read: "Each number is what the player averages across many matches we play out. A longer bar means a bigger part to play.",
  },
  "ground-overview": {
    title: "The ground",
    what: "What usually happens at this ground: the normal first-innings score, how often the chasing team wins, and how many wickets go to fast bowlers and to spinners.",
    read: "The little line shows the last few first-innings scores here, so you can see if the ground has been high or low scoring lately.",
  },
  "fantasy-overview": {
    title: "Fantasy picks",
    what: "Our captain and vice-captain picks and the players we'd put in almost any team for this match.",
    read: "The captain gets double points and the vice-captain one and a half times. Open the Fantasy tab for full teams.",
  },

  // ── scores ──
  "final-totals": {
    title: "Final totals",
    what: "How often each team ends up on each total when we play the match out.",
    read: "Taller bars are totals that happen more often (\"How often\"). Switch to \"Chance of reaching\" to see the chance of getting at least a given score. \"Batting first\" and \"Chasing\" show each case on its own.",
  },
  "score-fan": {
    title: "Score through the innings",
    what: "Where each team's score usually stands at every over.",
    read: "The line is the usual score. The darker band is where the score sits half the time and the lighter band covers most matches. A wider band means the innings could go a lot of different ways.",
  },
  "score-stages": {
    title: "Score at each stage",
    what: "Each team's usual score at key points of the innings, like the end of the powerplay, halfway and the end.",
    read: "Useful to judge in-match: if a team is well ahead of these numbers, they're on course for a big total.",
  },
  "runs-per-over": {
    title: "Runs per over",
    what: "How many runs each team usually scores in every over of the innings.",
    read: "Bars go up in the powerplay and at the end, and dip in the middle overs when teams rebuild.",
  },
  "win-by-first-innings": {
    title: "Win chance by first-innings total",
    what: "If the team batting first makes a given score, how often they go on to win.",
    read: "Find a score along the bottom and read the chance of winning above it. Where the line crosses 50% is par: a score that gives both teams an equal chance.",
  },
  "chase-by-target": {
    title: "Chasing: win chance by target",
    what: "For each target, how often the chasing team gets there.",
    read: "The lower the target, the better the chances. Below the marked score, the chasing side is the favourite.",
  },
  "phase-table": {
    title: "Score by phase",
    what: "Each part of the innings: the powerplay, the middle overs and the death overs.",
    read: "Runs is the usual score in that part, \"Likely\" the range it lands in half the time, Wickets the average number lost, and \"No wicket\" the chance of getting through it without losing one.",
  },
  "chance-of-reaching": {
    title: "Chance of reaching",
    what: "The chance a team scores at least this many.",
    read: "70% next to 160+ means the team gets to 160 or more about 7 times in 10.",
  },

  // ── wickets ──
  "wicket-each-over": {
    title: "Chance of a wicket in each over",
    what: "For every over, the chance that at least one wicket falls in it.",
    read: "Higher bars are the overs where wickets are most likely. The dotted line is the average over, so bars above it are danger overs for the batting side.",
  },
  "when-wickets": {
    title: "When wickets fall",
    what: "When each wicket usually falls, who usually takes it and who usually gets out.",
    read: "In the grid, a darker square means that wicket is more likely to fall in that over. In the table, \"Falls\" is the chance that wicket falls at all, and the over, score and partnership are what's usual when it does.",
  },

  // ── players ──
  "player-ranges": {
    title: "Player run ranges",
    what: "How many runs each batter usually makes, and how many wickets each bowler usually takes.",
    read: "The dot is the usual score. The thick bar is the range it lands in half the time, and the thin line shows a quiet day and a big day.",
  },
  "player-tables": {
    title: "Batting and bowling",
    what: "Every player in this match, from the times we play it out.",
    read: "Batting: Runs (avg) is the average score, \"Likely\" the normal range, 30+ or 50+ the chance of getting there, Duck the chance of getting out for 0, Top scorer the chance of top-scoring for the team. Bowling: Overs is how many they usually bowl, Wickets (avg) their average wickets, 2+ and 3+ the chance of that many wickets, Economy the runs they give away per over, Best bowler the chance of being the team's best bowler.",
  },
  "top-players": {
    title: "Top batters and bowlers",
    what: "All 22 players ranked by how much they're likely to give their team in this match.",
    read: "For batters it weighs runs and how quickly they come; for bowlers, wickets and how few runs they give away. The rating runs from 1 to 100, where 100 is a match-winning day.",
  },
  mvp: {
    title: "Most valuable players",
    what: "One list of all 22 players, mixing what they bring with the bat and with the ball.",
    read: "The MVP score runs from 1 to 10. A player who bats and bowls well, like a top all-rounder, rises to the top.",
  },
  matchups: {
    title: "Batter v bowler",
    what: "The bowler and batter pairs where the bowler is most likely to get the batter out in this match.",
    read: "15% means that bowler gets that batter out about 15 times in every 100 matches we play out. It counts the chance of them facing each other at all.",
  },

  // ── venue ──
  "venue-ground": {
    title: "The ground",
    what: "How this ground usually plays, from the matches played here in recent seasons.",
    read: "Words like \"high scoring\" or \"bowler friendly\" compare it with an average ground. \"Matches since\" is how many games that covers.",
  },
  "venue-first-innings": {
    title: "First-innings score here",
    what: "The usual first-innings total at this ground, and what we expect from each team if they bat first today.",
    read: "\"Likely\" is the range half the first innings here fall in.",
  },
  "venue-bat-chase": {
    title: "Batting first v chasing",
    what: "How often the team batting first won here, and how often the chasing team did.",
    read: "A big lean either way tells you what captains might choose at the toss.",
  },
  "venue-toss": {
    title: "Toss",
    what: "What toss winners chose here, and how often the toss winner went on to win the match.",
    read: "Close to 50% means the toss hasn't made much difference here.",
  },
  "venue-scores": {
    title: "First-innings scores at this ground",
    what: "Every first-innings total here, grouped into bands of 10 runs.",
    read: "Taller bars are the scores that come up most often. The markers show where today's teams are expected to finish.",
  },
  "venue-phases": {
    title: "Scoring by phase",
    what: "How quickly runs come in each part of the innings at this ground, compared with all grounds.",
    read: "Runs per over is the scoring speed. Balls per wicket is how long a batter usually lasts, so a higher number is better for batting. Boundary balls is how often a ball goes for four or six. Green helps batting, red helps bowling.",
  },
  "venue-pace-spin": {
    title: "Pace v spin",
    what: "How fast bowlers and spinners have done at this ground.",
    read: "Share of overs is how much each type bowls here. Economy is runs given away per over, so lower is better. Balls per wicket is how often they strike, so lower is better too. Share of wickets is how many of the wickets here each type takes.",
  },
  "venue-recent": {
    title: "Recent matches here",
    what: "The latest matches at this ground with their scores and results.",
    read: "The chart shows the first-innings scores in order, so you can see if the pitch has been getting better or worse for batting.",
  },
  "venue-xi-batting": {
    title: "This XI batting here",
    what: "How today's batters have done at this ground before.",
    read: "Inns is how many times they've batted here. Avg is runs per dismissal, the usual batting average. SR is runs per 100 balls, so higher means quicker scoring.",
  },
  "venue-xi-bowling": {
    title: "This XI bowling here",
    what: "How today's bowlers have done at this ground before.",
    read: "Wkts is wickets taken here. Econ is runs given away per over, so lower is better.",
  },

  // ── fantasy ──
  "fantasy-small": {
    title: "Small league team",
    what: "Our best single team for this match, built for contests with few entries where you want a safe, high-scoring side.",
    read: "Each player's number is the fantasy points we expect, with the captain's doubled and the vice-captain's one and a half times. They follow the playing XIs once they're announced.",
  },
  "fantasy-mega": {
    title: "Mega League teams",
    what: "A set of different teams for big contests, where you need something different from the crowd to finish near the top.",
    read: "Each team bets on a different way the match could go, with different captains. Use them together, not just one.",
  },
  "fantasy-ratings": {
    title: "All players",
    what: "Every player in the match rated out of 10 for fantasy.",
    read: "10 is the player we expect to score the most fantasy points, and everyone else is rated against them. 5 means about half that player's points.",
  },

  // ── results ──
  "result-accuracy": {
    title: "How our forecast did",
    what: "Before the match we make lots of calls: the winner, score ranges, who scores runs, who takes wickets. After the match we check each one against the scorecard.",
    read: "\"72 of 97 came true\" means 72 of our calls were right. The tabs split them by section. A tick means it came true, a cross means it didn't.",
  },
  "result-fantasy": {
    title: "Fantasy picks",
    what: "Our fantasy teams from before the match, scored with the real points from the scorecard.",
    read: "The Ultimate team of the match is the best possible team, picked after the match with full knowledge. Our teams are shown as a share of its points: 80% means we got 80% of the most anyone could have scored.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
