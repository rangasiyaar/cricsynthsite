# CricSynthesis MCP

Cricket match forecasts for AI assistants (Claude, ChatGPT desktop, Cursor and any MCP client). Ask about the next
match, a player, a toss or a live chase, and the assistant answers from 20,000 ball-by-ball simulations.

Runs on your machine and is free. Forecasts come from the CricSynthesis website; what-ifs are simulated locally
with the same engine as the site's Scenario Lab.

## Install

Needs [uv](https://docs.astral.sh/uv/). Add this to your client's MCP config (Claude Desktop:
Settings → Developer → Edit config):

```json
{
  "mcpServers": {
    "cricsynthesis": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/rangasiyaar/cricsynthsite#subdirectory=cricmcp", "cricsynthesis-mcp"]
    }
  }
}
```

Claude Code: `claude mcp add cricsynthesis -- uvx --from "git+https://github.com/rangasiyaar/cricsynthsite#subdirectory=cricmcp" cricsynthesis-mcp`

## Tools

| Tool | What it answers |
|---|---|
| `list_matches` | Upcoming matches with forecasts, times in IST |
| `match_forecast` | Win chances, by who bats first, projected scores and ranges, phases, likely top performers |
| `player_outlook` | One player's runs, milestones, dismissal risks, wickets and economy |
| `key_matchups` | The batter-v-bowler duels most likely to decide the match |
| `innings_shape` | Over-by-over runs, wicket chance, score bands and fall of wickets |
| `simulate_scenario` | What-if: toss, pitch, dew, ground size, player form, a bowler missing |
| `live_win_probability` | Win chance from any score, e.g. 120/4 after 15.2 overs chasing 165 |
| `fantasy_team` | Expected fantasy points for all 22, a suggested XI, captain and vice-captain |
| `pattern_lab` | Cricket folklore tested on ball-by-ball data: real, myth or reversed |
| `about_the_model` | How the forecast is made and how much data is behind it |

Matches can be named by id or by team names ("India v West Indies"); with no match given, tools use the next one.

## Settings

| Variable | Default | |
|---|---|---|
| `CRICSYNTHESIS_DATA_URL` | `https://cricsynthesis.web.app/data` | Where forecasts are read from (a URL or a local folder) |
| `CRICSYNTHESIS_API_KEY` | — | Adds `api_request`, which calls any of the 56 API endpoints |
| `CRICSYNTHESIS_API_URL` | `https://api.cricsynthesis.in` | API base for `api_request` |

## Development

```bash
uv run pytest cricmcp/tests -q        # includes exact parity with the browser engine (needs Node 22+)
uv run cricsynthesis-mcp              # stdio server
```
