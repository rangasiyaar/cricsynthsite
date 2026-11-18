// Copy for the Pro banners: one pitch per locked match-centre section and for MatchSynth Lab. Shared by the website
// banner (components/Gate.tsx ProBanner) and the app paywall (components/App.tsx ProPaywall). Every claim must match
// what the section really shows.
export type Pitch = { title: string; body: string };

export const PITCH: Record<string, Pitch> = {
  Scores: { title: "What will they post?",
    body: "Every likely final total for both sides, the range they'll land in, and how the runs come over by over." },
  Wickets: { title: "When will the wickets fall?",
    body: "The chance of a wicket in every over, so you know where the danger overs are before a ball is bowled." },
  Players: { title: "All 22, rated.",
    body: "Every player in the expected or confirmed XIs, with their role and a rating for this match." },
  "Top players": { title: "Who'll run the show?",
    body: "Both XIs ranked twice: top batters by projected runs and strike rate, top bowlers by wickets and economy." },
  MVP: { title: "Who wins it for them?",
    body: "One list of all 22 players, ranked by projected impact with bat and ball." },
  Matchups: { title: "The duels that decide it.",
    body: "Batter v bowler head-to-heads: who holds the edge, and where the key wickets could come from." },
  "Venue intelligence": { title: "Know the ground.",
    body: "First-innings scores here, scoring by phase, pace v spin, recent matches, and how these XIs have done at this venue." },
  Fantasy: { title: "Pick a smarter XI.",
    body: "A best XI with captain and vice-captain calls, plus alternative teams to spread your entries." },
  Lab: { title: "Change the match. See what moves.",
    body: "Set the pitch, dew, toss, player form and who's fit to bowl, then rerun the match. Every tab rebuilds for your scenario." },
};

export const PRO_LINE = "Pro opens every tab of every match, plus MatchSynth Lab.";
export const FREE_LINE = "The Overview stays free for every match.";
