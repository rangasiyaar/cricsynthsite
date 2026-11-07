# API and remote MCP on GitHub Actions + Cloudflare (zero spend)

**Idea:** GitHub Actions does all heavy work (fit, simulate, fantasy, venue reads, analytics kit) as it does today and
uploads the outputs to Cloudflare R2. A Cloudflare Worker serves the API (`/v1/...`) and a remote MCP endpoint (`/mcp`)
by reading those files and doing light arithmetic. No model or engine runs on Cloudflare (IP stays in Actions), and
nothing needs a card. Cloud Run is no longer needed for the API.

Free-plan limits to design for (check Cloudflare's pricing page before building): Workers ~100k requests/day and
~10 ms CPU per request; R2 10 GB storage; KV/D1 small daily write quotas.

## Legend

- **A — static read:** the answer is a published file (or a slice of one). Worker: fetch from R2, filter, return.
- **B — light compute:** arithmetic over the analytics kit (port of `cricmcp/insight.py`, ~320 lines) or SVG drawing
  (port of `cricmcp/graphics.py`, ~280 lines). Microseconds of CPU; fits the free plan.
- **C — precomputed scenarios:** needs simulation, so Actions computes it for every covered match (default inputs
  and a small grid of variants) and the Worker serves the nearest one. Custom inputs outside the grid → see D.
- **D — not on the edge:** needs a fresh simulation with the caller's own inputs (custom XIs, any state, any
  lineup change). Served by the local MCP (`uvx`) and MatchSynth Lab in the browser; the API returns a clear
  "not available on the hosted API" (or, later, a paid always-on host).

## API (56 endpoints)

| Endpoints | Count | Class | How |
|---|---:|---|---|
| Players: search, rating, phases, vs bowling types, vs batting hand, situations, formats, role, similar, compare | 10 | B | Kit `players.json` + `players/<id>.json`; similar is precomputed in the kit |
| Rankings batting / bowling | 2 | B | Kit `rankings/<fmt>-<gender>-<side>-<phase>.json`, sort and filter in the Worker |
| Match-ups: single, grid, best bowler against | 3 | B | Insight arithmetic over two or more player docs |
| Venues list / profile, competitions list / profile, teams list / profile, scoring trend | 7 | A/B | Kit files |
| Profile any XI (POST /v1/teams/profile) | 1 | B | Arithmetic over the XI's player docs |
| Pattern Lab list / detail | 2 | A | Published Pattern Lab report |
| Covered matches, match forecast, engine pack | 3 | A | `index.json`, `matches/<id>.json`, `matches/<id>.pack.json` |
| Fantasy for a covered match (GET) | 1 | A | Published `fantasy` block |
| Fantasy projections / team / portfolio (POST) for a covered match | 3 | C | Store each player's points per simulation (22 × N, compact) in R2; Worker re-picks XI / C-VC / teams with the caller's rules (greedy pick, cheap). Custom XIs → D |
| Toss decision, player projection (covered match) | 2 | A | Already in the published summary (`by_toss`, player rows) |
| Par score, chase curve (covered match) | 2 | C | Computed per covered match in Actions (one target grid each) |
| Win probability / innings projection from a state, live win probability for a covered match | 3 | C | Per covered match: a grid by innings × wickets × over × runs band (and target band when chasing); Worker interpolates. Any other team / state → D |
| Player impact, batting-order optimiser, bowling plan (covered match) | 3 | C | Computed per covered match for the default XIs; custom orders / bowlers → D |
| Simulate a match, compare scenarios, swap a player | 3 | D | Custom inputs need the engine |
| Graphics: 11 SVG cards (win, scores, worm, phases, duels, wickets, player match card, player profile, match-up, venue, trend) | 11 | B | Port of `graphics.py` (pure string building) over A/B data |
| **Total** | **56** | | **A+B: 42 · C: 11 · D: 3** |

## MCP (42 tools)

| Tools | Count | Class |
|---|---:|---|
| list_matches, match_forecast, player_outlook, key_matchups, innings_shape, about_the_model, toss_decision | 7 | A |
| search_players, player_rating, player_phases, player_vs_bowling, bowler_vs_batting_hand, player_situations, player_formats, player_role, similar_players, compare_players, rankings, matchup, matchup_grid, best_bowler_against, venues, venue_profile, competitions, competition_profile, scoring_trend, teams, team_profile | 21 | B |
| match_graphic, analytics_graphic | 2 | B |
| fantasy_projections, fantasy_team, fantasy_portfolio | 3 | C (covered matches, any team rules) |
| par_score, chase_curve, innings_projection, live_win_probability, player_impact, batting_order, bowling_plan | 7 | C (covered matches, default XIs) |
| simulate_scenario | 1 | D |
| api_request (calls the hosted API) | 1 | A — points at the Worker |
| **Total** | **42** | **A+B: 31 · C: 10 · D: 1** |

So the hosted service answers **53 of 56 API endpoints and 41 of 42 MCP tools**; the C group only for covered
matches (which is what fans and most API users ask about). The local `uvx` MCP keeps all 42 with full freedom.

## What Actions adds (no new cost)

1. **Upload step** in `publish-site.yml` after the build: `data/publish` (index, matches, packs, results, venue,
   analytics kit) → R2 with `wrangler r2 object put` (only changed files). Secret: `CLOUDFLARE_API_TOKEN` (R2 + Workers
   edit, this account only) and `CLOUDFLARE_ACCOUNT_ID` in GitHub secrets.
2. **Scenario files per covered match** (`cricsim/edge.py`, new): fantasy points samples, par score, chase curve,
   state grid for win probability / innings projection, player impact, batting order and bowling plan for the
   default XIs. Runs in the existing publish job; reuses each match's simulations where possible.
3. **The 5-minute loop** re-uploads only the matches it re-ran (XIs named, results).

## The Worker (TypeScript, `edge/` in this repo)

- Routes: `/v1/...` (same paths and response shapes as `cricapi`, so the docs, playground and examples stay valid)
  and `/mcp` (Streamable HTTP MCP with the 41 tools; the descriptions copied from `cricmcp/server.py`).
- Ports: `insight.ts` (from `cricmcp/insight.py`), `graphics.ts` (from `graphics.py`), a fantasy re-picker. Parity
  tests against the Python versions, as `test_insight_parity.py` does today.
- API keys: the same keys as the dashboard (Firestore `users/{uid}/keys`, hash + prefix). The Worker looks a key up
  (cached a few minutes) and counts usage in a Durable Object / D1 per key per day, flushed to Firestore in batches,
  so plan limits (free / pro / business) work as now. Anonymous MCP use gets a small per-IP daily allowance.
- Domain: `api.cricsynthesis.in` and `mcp.cricsynthesis.in` if the domain's DNS moves to Cloudflare (free); until
  then `<name>.workers.dev`.

## Steps

1. Cloudflare account (free), R2 bucket `cricsynthesis-data` (private), API token → GitHub secrets. *(user)*
2. Upload step in the publish workflow (A data first). Worker serving A + B endpoints with keys; parity tests.
3. `/mcp` on the Worker (A + B tools); test as a claude.ai custom connector.
4. `cricsim/edge.py` scenario files and the C endpoints / tools.
5. Point the docs, playground, MCP page and examples at the Worker; retire the Cloud Run deploy workflow.
6. Add the Cloudflare free limits and our guards to `infra/COSTS.md`.

## Status (built)

- `edge/` — the Worker (TypeScript): `insight.ts` and `analytics.ts` (port of `cricmcp/insight.py` and the MCP
  server's catalog tools), `graphics.ts` (port of `graphics.py`), `api.ts` (40 endpoints: all of A + B, same paths,
  parameters and shapes as `cricapi`), `keys.ts` (dashboard API keys via Firestore REST, plan limits, usage in a
  Durable Object per key, written to `users/{uid}/usage/{day}` once a minute). `cricmcp/tests/test_edge_parity.py`
  checks every analytics answer and card against the Python; `edge/tests/api.test.ts` runs the Worker end to end.
- **No R2.** Enabling R2 needs a payment method on the Cloudflare account, so the Worker reads the published files
  from the site's `/data` (the same files the local MCP server reads). The C files (step 4) can ship privately as
  Worker static assets (free, up to 20,000 files) read through the Worker.
- `.github/workflows/deploy-worker.yml` — tests, then `wrangler deploy` once `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` are set; `FIRESTORE_SA_KEY` (service-account JSON) turns on dashboard keys.
- The 16 C/D endpoints answer 501 with where to go instead (`/v1` lists them under `not_hosted`).
- `/mcp` on the same Worker (`edge/src/mcp.ts`): Streamable HTTP, JSON responses, no sessions. 31 tools: the A + B
  tools, `toss_decision` from the published who-bats-first split, and `fantasy_picks` (the published fantasy block).
  No simulation counts or engine details (the local package still shows them). A key is optional (header
  `X-API-Key` / `Authorization: Bearer`, or `?key=` in the connector URL): with one, calls count against its plan;
  without, 100 tool calls a day per IP. Only `tools/call` counts. Parity with the Python tools is in
  `test_edge_parity.py`; `edge/tests/mcp.test.ts` covers the protocol.
