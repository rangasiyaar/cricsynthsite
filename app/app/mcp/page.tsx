import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = seo("/mcp/", "MCP server | CricSynthesis", "The CricSynthesis MCP server gives Claude, Cursor and other AI assistants read-only access to cricket analytics, match forecasts and fantasy tools. Connect by URL, sign in, and ask.");

const HOSTED_URL = "https://mcp.cricsynthesis.in";

const REMOTE = `{
  "mcpServers": {
    "cricsynthesis": { "type": "http", "url": "${HOSTED_URL}" }
  }
}`;

const CLAUDE_CODE_REMOTE = `claude mcp add --transport http cricsynthesis ${HOSTED_URL}`;

const GROUPS: { title: string; text: string; tools: string[] }[] = [
  { title: "Players", text: "Find any player, then get ratings, phase splits, record against each bowling type and batting hand, form by situation and format, role, and the closest comparable players.",
    tools: ["search_players", "player_rating", "player_phases", "player_vs_bowling", "bowler_vs_batting_hand", "player_situations", "player_formats", "player_role", "similar_players", "compare_players"] },
  { title: "Rankings and match-ups", text: "Leaderboards by format, phase and metric, and how any batter fares against any bowler.",
    tools: ["rankings", "matchup", "matchup_grid", "best_bowler_against"] },
  { title: "Venues, competitions and teams", text: "How a ground plays, how a league scores and how that has changed by season, and the profile of any side.",
    tools: ["venues", "venue_profile", "competitions", "competition_profile", "scoring_trend", "teams", "team_profile"] },
  { title: "Match forecasts", text: "For the matches we cover: win chances, projected scores, innings shape, key duels, player outlooks and fantasy picks.",
    tools: ["list_matches", "match_forecast", "innings_shape", "key_matchups", "player_outlook", "fantasy_picks", "about_the_model"] },
  { title: "Decision tools", text: "Win probability and projected finish from any score, par for the side batting first, the chase curve, the toss call, batting order, bowling plan and player impact.",
    tools: ["live_win_probability", "innings_projection", "par_score", "chase_curve", "toss_decision", "batting_order", "bowling_plan", "player_impact"] },
  { title: "Fantasy and graphics", text: "Fantasy points projections, a best XI with captain and vice-captain, multi-entry portfolios, and shareable SVG cards.",
    tools: ["fantasy_projections", "fantasy_team", "fantasy_portfolio", "match_graphic", "analytics_graphic"] },
];
const COUNT = GROUPS.reduce((n, g) => n + g.tools.length, 0);

const ASK = [
  "Who's favourite for India v West Indies, and how much does the toss matter?",
  "India are 120/4 after 15.2 overs chasing 165. What are their chances?",
  "What's a par first-innings score at this ground?",
  "Build me a fantasy XI with captain and vice-captain for the next match.",
  "Which bowling type troubles this batter most in T20s?",
  "Rank the best death-overs bowlers in T20 right now.",
];

const FACTS: [string, string][] = [
  ["Access", "Read-only. The tools look data up; they never change anything in your account or ours."],
  ["Sign-in", "OAuth with your CricSynthesis account, free to create. Your assistant opens the sign-in page the first time you connect."],
  ["Limits", "200 tool calls a day on a free account. With an API key in the URL, calls count against that key's plan instead."],
  ["Coverage", "Player, venue, competition and team analytics for every format we model. Forecast, decision and fantasy tools answer for the matches we cover, from 3 days before the start."],
  ["Freshness", "Analytics are rebuilt every night. Match forecasts update as playing XIs and the toss come in."],
];

const Code = ({ label, kind, children }: { label: string; kind: string; children: string }) => (
  <div className="cs-api" style={{ padding: 0, marginTop: 10 }}><div className="cs-api-panel"><div className="cs-api-panel-head"><span>{label}</span><span>{kind}</span></div>
    <pre className="req">{children}</pre></div></div>
);

export default function Mcp() {
  return (
    <div className="page-head">
      <p className="cs-eyebrow">Model Context Protocol</p>
      <h1><span>CricSynthesis for AI assistants</span></h1>
      <p className="cs-lede">The CricSynthesis MCP server gives your AI assistant {COUNT} read-only cricket tools: player and venue
        analytics, match forecasts, decision models and fantasy picks. Connect it by URL and ask questions in plain English.</p>

      <h2 style={{ marginTop: 48 }}>Connect</h2>
      <p className="muted" style={{ maxWidth: "64ch" }}>Hosted, so there is nothing to install. Use this URL in any client that
        supports remote MCP servers:</p>
      <Code label="Server URL" kind="URL">{HOSTED_URL}</Code>

      <div className="grid g3" style={{ marginTop: 24 }}>
        <div className="card">
          <h3>Claude</h3>
          <p className="small muted" style={{ margin: "6px 0 0" }}>In claude.ai or the Claude desktop app, open Settings, then Connectors, choose
            Add custom connector and paste the server URL. Custom connectors depend on your Claude plan.</p>
        </div>
        <div className="card">
          <h3>Claude Code</h3>
          <p className="small muted" style={{ margin: "6px 0 0" }}>Run this in your terminal, then start a session and sign in when asked.</p>
        </div>
        <div className="card">
          <h3>Cursor and other clients</h3>
          <p className="small muted" style={{ margin: "6px 0 0" }}>Add the server to the client&apos;s MCP config file, such as <span className="mono">.cursor/mcp.json</span> or <span className="mono">.mcp.json</span>.</p>
        </div>
      </div>
      <Code label="Claude Code" kind="shell">{CLAUDE_CODE_REMOTE}</Code>
      <Code label="MCP config" kind="JSON">{REMOTE}</Code>
      <p className="small muted" style={{ maxWidth: "64ch", marginTop: 14 }}>To use an API key in place of signing in, add it to the URL:{" "}
        <span className="mono">{HOSTED_URL}/?key=cs_live_…</span>. Create keys from your <Link href="/account/">account</Link>.</p>

      <h2 style={{ marginTop: 56 }}>How it works</h2>
      <dl className="mcp-facts">
        {FACTS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <h2 style={{ marginTop: 56 }}>Tools</h2>
      <p className="muted" style={{ maxWidth: "64ch" }}>{COUNT} tools in six groups. Your assistant picks the right ones from your question,
        so you never need the names.</p>
      <div className="grid g3">
        {GROUPS.map((g) => (
          <div key={g.title} className="card">
            <h3>{g.title}</h3>
            <p className="small muted" style={{ margin: "6px 0 12px" }}>{g.text}</p>
            <div className="card-foot mono small" style={{ lineHeight: 1.7, color: "var(--cs-ink-2)" }}>
              {g.tools.map((t, i) => <span key={t}>{i ? " · " : ""}{t}</span>)}</div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 56 }}>Example prompts</h2>
      <div className="grid g3">
        {ASK.map((q) => <div key={q} className="card"><p style={{ margin: 0 }}>{q}</p></div>)}
      </div>

      <h2 style={{ marginTop: 56 }}>Beyond the assistant</h2>
      <p className="muted" style={{ maxWidth: "64ch" }}>The same data is available as an HTTP API: <Link href="/developers/">56 endpoints</Link>{" "}
        on the same account and keys, documented in the <Link href="/docs/api/">API reference</Link>. To change the conditions,
        player form or match state and re-run a forecast, use <Link href="/lab/">MatchSynth Lab</Link>.</p>
      <div style={{ paddingBottom: 72 }} />
    </div>
  );
}
