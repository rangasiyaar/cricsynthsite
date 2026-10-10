import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "MCP | CricSynthesis" };

const PKG = "git+https://github.com/rangasiyaar/cricsynthsite#subdirectory=cricmcp";

const CONFIG = `{
  "mcpServers": {
    "cricsynthesis": {
      "command": "uvx",
      "args": ["--from", "${PKG}",
               "cricsynthesis-mcp"]
    }
  }
}`;

const CLAUDE_CODE = `claude mcp add cricsynthesis -- uvx --from "${PKG}" cricsynthesis-mcp`;

const TOOLS: [string, string][] = [
  ["list_matches", "Upcoming matches with forecasts and start times in IST."],
  ["match_forecast", "Win chances, by who bats first, projected scores with ranges, phases and likely top performers."],
  ["player_outlook", "A player's runs, milestones, dismissal risks, wickets and economy."],
  ["key_matchups", "The batter-v-bowler duels most likely to decide the match."],
  ["innings_shape", "Over-by-over runs, wicket chance, score bands and fall of wickets."],
  ["simulate_scenario", "What-if: toss, pitch, dew, ground size, player form or a bowler missing."],
  ["live_win_probability", "Win chance from any score, simulated from the batters and bowlers left."],
  ["fantasy_team", "Expected fantasy points for all 22, a suggested XI, captain and vice-captain."],
  ["pattern_lab", "Cricket folklore tested on ball-by-ball data: real, myth or reversed."],
  ["about_the_model", "How the forecast is made and how much data is behind it."],
];

const ASK = [
  "Who's favourite for India v West Indies, and does the toss matter?",
  "India are 120/4 after 15.2 overs chasing 165. Who wins?",
  "Heavy dew and a turning pitch: how does that change the forecast?",
  "Pick my fantasy XI and captain for the next match.",
  "Is a wicket more likely straight after a six?",
  "What's Abhishek Sharma's chance of a fifty?",
];

export default function Mcp() {
  return (
    <div className="page-head">
      <p className="cs-eyebrow">Model Context Protocol</p>
      <h1><span>CricSynthesis MCP.</span><span>Cricket for AI assistants.</span></h1>
      <p className="cs-lede">Ask Claude, ChatGPT desktop, Cursor or any MCP client about upcoming matches. Answers come from
        20,000 ball-by-ball simulations per match. Free, and it runs on your own machine.</p>

      <h2 style={{ marginTop: 48 }}>Install</h2>
      <p className="muted" style={{ maxWidth: "62ch" }}>Needs <a href="https://docs.astral.sh/uv/">uv</a>. In Claude Desktop open
        Settings, Developer, Edit config, and add:</p>
      <div className="cs-api" style={{ padding: 0 }}><div className="cs-api-panel"><div className="cs-api-panel-head"><span>claude_desktop_config.json</span><span>JSON</span></div>
        <pre className="req">{CONFIG}</pre></div></div>
      <p className="muted" style={{ marginTop: 20 }}>Claude Code:</p>
      <div className="cs-api" style={{ padding: 0 }}><div className="cs-api-panel"><div className="cs-api-panel-head"><span>Terminal</span><span>shell</span></div>
        <pre className="req">{CLAUDE_CODE}</pre></div></div>

      <h2 style={{ marginTop: 56 }}>Tools</h2>
      <div className="grid g2">
        {TOOLS.map(([name, text]) => (
          <div key={name} className="card">
            <div className="mono" style={{ fontWeight: 500 }}>{name}</div>
            <p className="small muted" style={{ margin: "6px 0 0" }}>{text}</p>
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
