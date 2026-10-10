# CricSynthesis MCP

Cricket analytics and match forecasts for AI assistants (Claude, ChatGPT desktop, Cursor and any MCP client).
Ask about any player, venue, competition or team, or about an upcoming match, and the assistant answers from a
ball-by-ball model of every recorded delivery.

Runs on your machine and is free. It reads the analytics and forecasts CricSynthesis publishes each night and does
the arithmetic and simulations locally.

## Install

Needs [uv](https://docs.astral.sh/uv/). In Claude Desktop open Settings → Developer → Edit config and add:

```json
{
  "mcpServers": {
    "cricsynthesis": {
      "command": "uvx",
      "args": ["--index", "https://cricsynthesis.in/pypi/simple/", "cricsynthesis-mcp"]
    }
  }
}
```

Claude Code: `claude mcp add cricsynthesis -- uvx --index https://cricsynthesis.in/pypi/simple/ cricsynthesis-mcp`

## Tools (41)

**Analytics** — any player, venue, competition or team

| Tool | |
|---|---|
| `search_players` | Find players and their ids |
| `player_rating` | Wicket, four and six multipliers v an average player |
| `player_phases` | Batting and bowling by powerplay, middle and death overs |
| `player_vs_bowling` | A batter against each bowling type |
| `bowler_vs_batting_hand` | A bowler against right- and left-handers |
| `player_situations` | New at the crease v set, and chasing at different required rates |
| `player_formats` | T20 v one-day |
| `player_role` | Batting position, overs by phase, workload |
| `similar_players` | Nearest players by style |
| `compare_players` | Up to eight players side by side |
| `rankings` | Model leaderboards by format, phase and metric |
| `matchup`, `matchup_grid`, `best_bowler_against` | Batter v bowler, ball by ball |
| `venues`, `venue_profile` | How grounds play |
| `competitions`, `competition_profile` | How leagues play |
| `scoring_trend` | Run rates by phase, season by season |
| `teams`, `team_profile` | A side's batting and bowling, or any XI |

**Simulation and modelling** — upcoming covered matches

| Tool | |
|---|---|
| `list_matches`, `match_forecast`, `innings_shape`, `key_matchups`, `player_outlook`, `about_the_model` | The forecast |
| `simulate_scenario` | What-if: toss, pitch, dew, ground size, form, a bowler missing |
| `live_win_probability`, `innings_projection` | From any score |
| `par_score`, `chase_curve`, `toss_decision` | Pre-match decisions |
| `batting_order`, `bowling_plan`, `player_impact` | Line-ups |
| `fantasy_projections`, `fantasy_team`, `fantasy_portfolio` | Fantasy |

**Graphics** — `match_graphic`, `analytics_graphic`: 1200×675 SVG cards, saved to `~/CricSynthesis/cards`.

Players, matches, venues and teams can be named in plain words.

## Settings

| Variable | Default | |
|---|---|---|
| `CRICSYNTHESIS_DATA_URL` | `https://cricsynthesis.in/data` | Where published data is read from |
| `CRICSYNTHESIS_OUT` | `~/CricSynthesis/cards` | Where graphics are saved |
| `CRICSYNTHESIS_API_KEY` | — | Adds `api_request` for the CricSynthesis API |
