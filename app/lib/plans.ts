// The plans, shared by the pricing page and the app's Pro screen.
export const TIERS = [
  { id: "free", name: "Free", price: "₹0", note: "No account needed",
    lines: ["The Match Overview for every covered match", "Win chances, projected scores and players to watch",
            "The live simulation engine"] },
  { id: "pro", name: "Pro", price: "₹0", note: "Free during the beta", tag: "Beta",
    lines: ["Everything in Free", "The full match centre: scores, wickets, players, MVP, match-ups, venue and fantasy",
            "MatchSynth Lab: pitch, conditions, dew and toss", "Player form, bowler availability and any match situation"] },
  { id: "api", name: "API", price: "From ₹0", note: "For businesses",
    lines: ["56 endpoints: analytics, simulation and graphics", "Free, Pro and Business limits", "Docs, playground and MCP server"] },
];
