// CricSynthesis Pro: prices and the words fans see on the paywall, the pricing page and the app's Pro screen.
// Written for every cricket fan, not just stats people: plain words, one idea per bullet, no jargon.
// Every feature must match what the product really shows. Prices are final (no GST: not registered).

export type Billing = "monthly" | "yearly";

export const PRO = {
  name: "CricSynthesis Pro",
  monthly: 349,
  yearly: 3769,          // 12 × ₹349, 10% off
  trialDays: 1,
} as const;

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const yearlySaving = PRO.monthly * 12 - PRO.yearly;                // ₹419
export const yearlyPerMonth = Math.round(PRO.yearly / 12);               // ₹314

export const PRO_HERO = {
  eyebrow: "CricSynthesis Pro",
  title: "Know the match before it's played.",
  sub: "Every insight for every match we cover, plus MatchSynth Lab to play out your own what-ifs. Try it free for a day.",
};

/** Short list for cards and the app screen. */
export const PRO_HIGHLIGHTS = [
  "The full match centre for every match we cover",
  "Likely scores for both teams, and how the runs will come",
  "The overs where wickets are most likely to fall",
  "Every player rated, with the top batters and bowlers ranked",
  "Batter v bowler battles that could decide the game",
  "A fantasy XI with captain and vice-captain picks",
  "MatchSynth Lab: change the conditions and replay the match",
];

/** What the free plan keeps. */
export const FREE_HIGHLIGHTS = [
  "Match Overview for every match we cover",
  "Each team's chance of winning",
  "Projected scores and players to watch",
  "Live win chances once the match starts",
];

/** The full list, grouped the way a fan thinks about a match. */
export const PRO_GROUPS: { title: string; items: string[] }[] = [
  { title: "Before the first ball", items: [
    "Likely final score for both teams, with a realistic range",
    "How the runs will come, over by over",
    "The danger overs: when wickets are most likely to fall",
  ] },
  { title: "The players", items: [
    "All 22 players rated for this match",
    "Top batters and top bowlers ranked",
    "Match MVP: who is most likely to win it for their team",
    "Batter v bowler battles: who has the edge",
  ] },
  { title: "The ground", items: [
    "Typical first-innings scores at the venue",
    "Where the runs come: powerplay, middle overs and death",
    "Pace or spin: which works better here",
    "How these players have done at this ground",
  ] },
  { title: "Fantasy", items: [
    "A ready-made fantasy XI for the match",
    "Captain and vice-captain picks",
    "Backup teams to spread your entries",
  ] },
  { title: "MatchSynth Lab", items: [
    "Change the pitch, the weather, dew and the toss",
    "Adjust player form and who is fit to bowl",
    "Start from any moment: say 80 for 3 after 10 overs",
    "Replay the match and see every number update",
  ] },
];

export const TRIAL_STEPS = [
  { when: "Today", text: "Start your free day. Everything in Pro opens straight away." },
  { when: "Before it ends", text: "We'll remind you a few hours before your free day is over." },
  { when: "Tomorrow", text: `Your plan starts and you're charged. Cancel any time before then and you pay nothing.` },
];

export const PRO_FAQ: { q: string; a: string }[] = [
  { q: "Do I have to pay for the free day?",
    a: "No. You add a payment method to start, but nothing is charged during your free day. Cancel before it ends and you pay nothing." },
  { q: "Can I cancel any time?",
    a: "Yes, in one tap from your account. You keep Pro until the end of the period you've paid for." },
  { q: "How can I pay?",
    a: "UPI, debit or credit card, and netbanking." },
  { q: "Does one plan work on the website and the app?",
    a: "Yes. Sign in with the same account and Pro works on both." },
  { q: "Who gets the free day?",
    a: "Every new account, once. If you've had Pro before, you can subscribe straight away." },
  { q: "Are the forecasts guaranteed?",
    a: "No. They are chances worked out from every recorded ball, not certainties. Cricket can always surprise. Please use them responsibly." },
];

export const PRO_FINE_PRINT = "For ages 18 and over. Prices in Indian rupees; the price shown is the price you pay.";

export const ctaLabel = (trial: boolean) => (trial ? "Start your free day" : "Subscribe");
export const afterTrial = (b: Billing) => b === "monthly"
  ? `Free for 1 day, then ${rupees(PRO.monthly)} a month. Cancel any time.`
  : `Free for 1 day, then ${rupees(PRO.yearly)} a year. Cancel any time.`;
