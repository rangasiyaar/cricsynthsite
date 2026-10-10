import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "MCP | CricSynthesis" };

const INDEX = "https://cricsynthesis.in/pypi/simple/";

const CONFIG = `{
  "mcpServers": {
    "cricsynthesis": {
      "command": "uvx",
      "args": ["--index", "${INDEX}", "cricsynthesis-mcp"]
    }
  }
}`;

const CLAUDE_CODE = `claude mcp add cricsynthesis -- uvx --index ${INDEX} cricsynthesis-mcp`;

const GROUPS: { title: string; text: string; tools: string[] }[] = [
  { title: "Players", text: "Ratings, phase splits, bowling types, batting hands, situations, formats, roles, similar players and side-by-side comparisons.",
    tools: ["search_players", "player_rating", "player_phases", "player_vs_bowling", "bowler_vs_batting_hand", "player_situations", "player_formats", "player_role", "similar_players", "compare_players"] },
  { title: "Rankings and match-ups", text: "Model leaderboards by format, phase and metric, and any batter against any bowler, ball by ball.",
    tools: ["rankings", "matchup", "matchup_grid", "best_bowler_against"] },
  { title: "Venues, leagues and teams", text: "How grounds and competitions play, scoring trends by season, and the profile of any side or XI.",
    tools: ["venues", "venue_profile", "competitions", "competition_profile", "scoring_trend", "teams", "team_profile"] },
  { title: "Match forecasts", text: "Win chances, projected scores, phases, wicket timing, key duels and player outlooks for upcoming matches.",
    tools: ["list_matches", "match_forecast", "innings_shape", "key_matchups", "player_outlook", "about_the_model"] },
  { title: "Decisions", text: "What-ifs, win probability and projections from any score, par score, chase curve, toss call, batting order, bowling plan and player impact.",
    tools: ["simulate_scenario", "live_win_probability", "innings_projection", "par_score", "chase_curve", "toss_decision", "batting_order", "bowling_plan", "player_impact"] },
  { title: "Fantasy and graphics", text: "Fantasy projections, a best XI with captain and vice-captain, multi-entry portfolios, and shareable SVG cards.",
    tools: ["fantasy_projections", "fantasy_team", "fantasy_portfolio", "match_graphic", "analytics_graphic"] },
];
const COUNT = GROUPS.reduce((n, g) => n + g.tools.length, 0);

const ASK = [
  "Who's favourite for India v West Indies, and does the toss matter?",
  "India are 120/4 after 15.2 overs chasing 165. Who wins?",
  "Heavy dew and a turning pitch: how does that change the forecast?",
  "Pick my fantasy XI and captain for the next match.",
  "How does Suryakumar Yadav fare against left-arm spin?",
  "Who are the best death bowlers in T20 right now?",
];

export default function Mcp() {
  return (
    <div className="page-head">
      <p className="cs-eyebrow">Model Context Protocol</p>
      <h1><span>CricSynthesis MCP.</span><span>Cricket for AI assistants.</span></h1>
      <p className="cs-lede">Ask Claude, ChatGPT desktop, Cursor or any MCP client about any player, ground, league or team, or
        about an upcoming match. Answers come from a ball-by-ball model of every recorded delivery. Free, and it runs on
        your own machine.</p>

      <h2 style={{ marginTop: 48 }}>Install</h2>
      <p className="muted" style={{ maxWidth: "62ch" }}>Needs <a href="https://docs.astral.sh/uv/">uv</a>. In Claude Desktop open
        Settings, Developer, Edit config, and add:</p>
      <div className="cs-api" style={{ padding: 0 }}><div className="cs-api-panel"><div className="cs-api-panel-head"><span>claude_desktop_config.json</span><span>JSON</span></div>
        <pre className="req">{CONFIG}</pre></div></div>
      <p className="muted" style={{ marginTop: 20 }}>Claude Code:</p>
      <div className="cs-api" style={{ padding: 0 }}><div className="cs-api-panel"><div className="cs-api-panel-head"><span>Terminal</span><span>shell</span></div>
        <pre className="req">{CLAUDE_CODE}</pre></div></div>

      <h2 style={{ marginTop: 56 }}>{COUNT} tools</h2>
      <div className="grid g3">
        {GROUPS.map((g) => (
          <div key={g.title} className="card">
            <h3>{g.title}</h3>
            <p className="small muted" style={{ margin: "6px 0 12px" }}>{g.text}</p>
            <div className="card-foot mono small" style={{ lineHeight: 1.7, color: "var(--cs-ink-2)" }}>{g.tools.join(" · ")}</div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 56 }}>Things to ask</h2>
      <div className="grid g3">
        {ASK.map((q) => <div key={q} className="card"><p style={{ margin: 0 }}>{q}</p></div>)}
      </div>

      <h2 style={{ marginTop: 56 }}>Full API</h2>
      <p className="muted" style={{ maxWidth: "62ch" }}>Set <span className="mono">CRICSYNTHESIS_API_KEY</span> in the server&apos;s
        environment and an <span className="mono">api_request</span> tool reaches all {""}
        <Link href="/developers/">56 API endpoints</Link>: player and venue analytics, decision models and graphics.</p>
      <div style={{ paddingBottom: 72 }} />
    </div>
  );
}
