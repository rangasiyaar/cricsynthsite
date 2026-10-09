"""Analytics, simulation & modelling, and graphics endpoints built on the engine's insight and modelling layers.

Registered before the core routes in main.py (so /v1/players/compare wins over /v1/players/{pid}).
"""
from __future__ import annotations

from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from cricapi import graphics

Format = Literal["T20", "T10", "HUNDRED", "OD"]
Gender = Literal["male", "female"]
Phase = Literal["powerplay", "middle", "death"]
A, SM, G = "Analytics", "Simulation & modelling", "Graphics"


# ── request bodies ─────────────────────────────────────────────────────────────

class TeamIn(BaseModel):
    name: str | None = None
    team_id: str | None = Field(None, description="Team id from /v1/teams; its latest XI is used when players are omitted")
    players: list[str] | None = Field(None, min_length=11, max_length=11, description="Player ids, batting order")
    bowlers: list[str] | None = Field(None, description="Who may bowl (default: anyone, by usual workload)")


class MatchIn(BaseModel):
    format: Format = "T20"
    gender: Gender = "male"
    teams: list[TeamIn] = Field(min_length=2, max_length=2)
    venue_id: str | None = None
    comp_key: str | None = None
    overs: int | None = Field(None, ge=1, le=50, description="Reduced-overs match")
    n: int = Field(4000, ge=200, le=50_000, description="Simulations (capped by plan)")


class StateIn(BaseModel):
    innings: Literal[1, 2] = 1
    batting: Literal[0, 1] = Field(0, description="Index of the team batting now")
    runs: int = Field(0, ge=0)
    wickets: int = Field(0, ge=0, le=9)
    overs: float = Field(0, ge=0, description="Overs bowled in this innings, cricket notation (12.3)")
    target: int | None = Field(None, ge=1, description="Required in the second innings")


class WinProbIn(MatchIn):
    state: StateIn


class ProjectionIn(WinProbIn):
    thresholds: list[int] | None = None


class ChaseIn(MatchIn):
    chasing: Literal[0, 1] = 1
    target_from: int = Field(120, ge=1)
    target_to: int = Field(220, ge=1)
    step: int = Field(10, ge=1, le=50)


class ScenarioIn(BaseModel):
    boundary_mult: float = Field(1.0, gt=0, le=3)
    wicket_mult: float = Field(1.0, gt=0, le=3)
    spin_wicket_mult: float = Field(1.0, gt=0, le=3)
    pace_wicket_mult: float = Field(1.0, gt=0, le=3)
    dew: float = Field(0.0, ge=0, le=1)
    extras_mult: float = Field(1.0, gt=0, le=3)
    player_form: dict[str, float] = {}
    exclude_bowlers: list[str] = []
    batting_first: Literal[0, 1] | None = None


class CompareIn(MatchIn):
    base: ScenarioIn = ScenarioIn()
    scenario: ScenarioIn


class SwapIn(MatchIn):
    out_player: str
    in_player: str


class ImpactIn(MatchIn):
    pass


class OrderIn(MatchIn):
    team: Literal[0, 1] = 0
    n: int = Field(1500, ge=200, le=10_000)


class BowlingPlanIn(MatchIn):
    bowling_team: Literal[0, 1] = 1
    bowlers: list[str] | None = None


class FantasyIn(MatchIn):
    roles: dict[str, Literal["WK", "BAT", "AR", "BOWL"]] = Field({}, description="Player id → role; inferred if omitted")
    captain_rule: Literal["mean", "upside"] = "mean"
    teams_count: int = Field(5, ge=2, le=10, description="Portfolio size")


class TeamProfileIn(BaseModel):
    format: Format = "T20"
    gender: Gender = "male"
    players: list[str] = Field(min_length=11, max_length=11)
    bowlers: list[str] | None = None


# ── helpers ────────────────────────────────────────────────────────────────────

def _spec(model, body: MatchIn):
    from cricsim.engine.io import spec_from_dict
    cat = model.meta.get("catalog", {}).get("teams", {})
    teams = []
    for k, t in enumerate(body.teams):
        players, name = t.players, t.name
        if t.team_id:
            info = cat.get(t.team_id)
            if not info:
                raise HTTPException(404, f"Unknown team {t.team_id}")
            name = name or info.get("name")
            if not players:
                f = info["formats"].get(body.format) or next(iter(info["formats"].values()))
                players = f.get("last_xi") or []
        if not players or len(players) != 11:
            raise HTTPException(422, f"Team {k}: give 11 players or a team_id with a known XI")
        teams.append({"name": name or f"Team {k + 1}", "players": players, "bowlers": t.bowlers, "team_id": t.team_id})
    try:
        spec, _ = spec_from_dict({"format": body.format, "gender": body.gender, "teams": teams,
                                  "venue_id": body.venue_id, "comp_key": body.comp_key, "overs": body.overs})
    except (TypeError, ValueError) as e:
        raise HTTPException(422, str(e))
    if spec.teams[0].name == spec.teams[1].name:
        spec.teams[1].name += " (2)"
    return spec


def _scenario(s: ScenarioIn):
    from cricsim.engine.spec import Scenario
    return Scenario(boundary_mult=s.boundary_mult, wicket_mult=s.wicket_mult, spin_wicket_mult=s.spin_wicket_mult,
                    pace_wicket_mult=s.pace_wicket_mult, dew=s.dew, extras_mult=s.extras_mult,
                    player_form=dict(s.player_form), exclude_bowlers=list(s.exclude_bowlers))


def _known(model, pid: str) -> str:
    if not model.knows(pid):
        raise HTTPException(404, f"Unknown player {pid}")
    return pid


def _ids(raw: str, lo: int, hi: int) -> list[str]:
    ids = [x.strip() for x in raw.split(",") if x.strip()]
    if not lo <= len(ids) <= hi:
        raise HTTPException(422, f"Give {lo}–{hi} comma-separated player ids")
    return ids


def _svg(svg: str | None) -> Response:
    if svg is None:
        raise HTTPException(404, "Not found")
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=600"})


def register(app: FastAPI, st, account) -> None:
    def n_for(body_n: int, acct: dict, cap: int) -> int:
        return max(200, min(body_n, acct["limits"]["max_simulations"], cap))

    I = __import__("cricsim.engine.insight", fromlist=["x"])        # noqa: N806 (lazy: keeps app start fast)

    # ── analytics ──
    @app.get("/v1/players/compare", tags=[A], summary="Compare players side by side")
    def players_compare(ids: str = Query(..., description="2–5 comma-separated player ids"), format: Format = "T20",
                        gender: Gender = "male", acct=Depends(account)):
        """Batting and bowling expectations by phase for up to five players, with the format average."""
        return I.compare(st.model, [_known(st.model, p) for p in _ids(ids, 2, 5)], format, gender)

    @app.get("/v1/players/{pid}/phases", tags=[A], summary="Phase profile")
    def player_phases(pid: str, format: Format = "T20", gender: Gender = "male", acct=Depends(account)):
        """Strike rate, dismissal rate, dot and boundary share in the powerplay, middle and death overs, batting and
        bowling, each against the format average."""
        return I.phase_profile(st.model, _known(st.model, pid), format, gender)

    @app.get("/v1/players/{pid}/vs-bowling", tags=[A], summary="Batter v bowling types")
    def player_vs_bowling(pid: str, format: Format = "T20", gender: Gender = "male", phase: Phase = "middle",
                          acct=Depends(account)):
        """Expected scoring and dismissal rate against right- and left-arm pace, off-spin, leg-spin, left-arm
        orthodox and wrist spin, with the strongest and weakest match-up."""
        return I.vs_bowling(st.model, _known(st.model, pid), format, gender, phase)

    @app.get("/v1/players/{pid}/vs-batting-hand", tags=[A], summary="Bowler v left- and right-handers")
    def player_vs_hand(pid: str, format: Format = "T20", gender: Gender = "male", phase: Phase = "middle",
                       acct=Depends(account)):
        """Economy, balls per wicket and dot share against right- and left-handed batters."""
        return I.vs_batting_hand(st.model, _known(st.model, pid), format, gender, phase)

    @app.get("/v1/players/{pid}/situations", tags=[A], summary="Situational batting")
    def player_situations(pid: str, format: Format = "T20", gender: Gender = "male", acct=Depends(account)):
        """How the batter performs on the first ball, while new, once set, and when chasing at each required rate."""
        return I.situations(st.model, _known(st.model, pid), format, gender)

    @app.get("/v1/players/{pid}/formats", tags=[A], summary="Format split")
    def player_formats(pid: str, gender: Gender = "male", acct=Depends(account)):
        """Short-format (T20, T10, Hundred) versus one-day expectations, with data volume in each."""
        return I.format_split(st.model, _known(st.model, pid), gender)

    @app.get("/v1/players/{pid}/role", tags=[A], summary="Role and workload")
    def player_role(pid: str, format: Format = "T20", acct=Depends(account)):
        """Usual batting position, overs per match by phase, bowling role (e.g. death specialist) and last appearance."""
        return I.role(st.model, _known(st.model, pid), format)

    @app.get("/v1/players/{pid}/similar", tags=[A], summary="Similar players")
    def player_similar(pid: str, format: Format = "T20", gender: Gender = "male",
                       side: Literal["batting", "bowling"] = "batting", limit: int = Query(10, ge=1, le=25),
                       min_balls: int = Query(300, ge=50), acct=Depends(account)):
        """Nearest players by style fingerprint (scoring, boundary and dismissal rates by phase and bowling type).
        Useful for replacements and scouting."""
        return I.similar(st.model, _known(st.model, pid), format, gender, side, limit, min_balls)

    @app.get("/v1/rankings/batting", tags=[A], summary="Batting rankings")
    def rankings_batting(format: Format = "T20", gender: Gender = "male", phase: Phase = "middle",
                         sort: Literal["impact", "strike_rate", "balls_per_dismissal", "runs_per_dismissal",
                                       "boundary_pct", "dot_pct"] = "impact",
                         min_balls: int = Query(500, ge=50), active_days: int = Query(730, ge=30),
                         limit: int = Query(25, ge=1, le=100), acct=Depends(account)):
        """Model leaderboard of active batters. Impact = runs added per 120 balls against an average batter, with
        wickets priced at a format-typical run value."""
        return I.rankings(st.model, "batting", format, gender, phase, min_balls, active_days, limit, sort)

    @app.get("/v1/rankings/bowling", tags=[A], summary="Bowling rankings")
    def rankings_bowling(format: Format = "T20", gender: Gender = "male", phase: Phase = "middle",
                         sort: Literal["impact", "economy", "balls_per_wicket", "dot_pct", "boundary_pct"] = "impact",
                         min_balls: int = Query(500, ge=50), active_days: int = Query(730, ge=30),
                         limit: int = Query(25, ge=1, le=100), acct=Depends(account)):
        """Model leaderboard of active bowlers. Impact = runs saved per 120 balls against an average bowler."""
        return I.rankings(st.model, "bowling", format, gender, phase, min_balls, active_days, limit, sort)

    @app.get("/v1/matchups/grid", tags=[A], summary="Match-up grid")
    def matchup_grid(batters: str = Query(..., description="1–11 batter ids"),
                     bowlers: str = Query(..., description="1–11 bowler ids"), format: Format = "T20",
                     gender: Gender = "male", phase: Phase = "middle", acct=Depends(account)):
        """Every batter against every bowler: strike rate, balls per dismissal and edges against an average pairing."""
        return I.matchup_grid(st.model, _ids(batters, 1, 11), _ids(bowlers, 1, 11), format, gender, phase)

    @app.get("/v1/matchups/counter", tags=[A], summary="Best bowler for a batter")
    def matchup_counter(batter: str, candidates: str = Query(..., description="2–11 bowler ids"),
                        format: Format = "T20", gender: Gender = "male", phase: Phase = "middle", acct=Depends(account)):
        """Ranks your bowling options against one batter by net runs per over, with wickets priced in."""
        return I.counter(st.model, _known(st.model, batter), _ids(candidates, 2, 11), format, gender, phase)

    @app.get("/v1/venues", tags=[A], summary="Venues")
    def venues(q: str | None = None, limit: int = Query(50, ge=1, le=200), acct=Depends(account)):
        """Grounds the model knows, by matches played. Filter by name or city."""
        return {"venues": I.venues(st.model, q, limit)}

    @app.get("/v1/venues/{vid}", tags=[A], summary="Venue profile")
    def venue(vid: str, format: Format = "T20", gender: Gender = "male", acct=Depends(account)):
        """Scoring and wicket environment by phase against a neutral ground, and a one-line character."""
        v = I.venue_profile(st.model, vid, format, gender)
        if v is None:
            raise HTTPException(404, "Unknown venue")
        return v

    @app.get("/v1/competitions", tags=[A], summary="Competitions")
    def competitions(q: str | None = None, limit: int = Query(50, ge=1, le=200), acct=Depends(account)):
        """Leagues and international categories the model covers, most recent first."""
        return {"competitions": I.competitions(st.model, q, limit)}

    @app.get("/v1/competitions/{key}", tags=[A], summary="Competition profile")
    def competition(key: str, gender: Gender | None = None, acct=Depends(account)):
        """Scoring and wicket environment of a competition against a neutral one, by phase."""
        c = I.comp_profile(st.model, key, gender)
        if c is None:
            raise HTTPException(404, "Unknown competition")
        return c

    @app.get("/v1/trends/scoring", tags=[A], summary="Scoring trend")
    def trend(format: Format = "T20", gender: Gender = "male", acct=Depends(account)):
        """Runs per over, balls per wicket and boundary share by season and phase, plus the model's current level."""
        return I.scoring_trend(st.model, format, gender)

    @app.get("/v1/teams", tags=[A], summary="Teams")
    def teams(q: str | None = None, gender: Gender | None = None, limit: int = Query(50, ge=1, le=200),
              acct=Depends(account)):
        """Franchise and national teams with formats played and latest match."""
        return {"teams": I.teams(st.model, q, gender, limit)}

    @app.get("/v1/teams/{tid}", tags=[A], summary="Team profile")
    def team(tid: str, format: Format = "T20", acct=Depends(account)):
        """Latest XI and its batting and bowling profile."""
        t = I.team_detail(st.model, tid, format)
        if t is None:
            raise HTTPException(404, "Unknown team")
        return t

    @app.post("/v1/teams/profile", tags=[A], summary="Profile any XI")
    def team_profile(body: TeamProfileIn, acct=Depends(account)):
        """Batting order strength, survival against spin and pace, left-hander count, bowling options and phase
        economy for any eleven."""
        return I.team_profile(st.model, body.players, body.format, body.gender, body.bowlers)

    @app.get("/v1/patterns/{pattern_id}", tags=[A], summary="Pattern detail")
    def pattern(pattern_id: str, acct=Depends(account)):
        """One Pattern Lab test: effect size, confidence interval, holdout check and verdict."""
        p = st.content.patterns()
        hit = next((x for x in (p or {}).get("patterns", []) if x.get("id") == pattern_id), None)
        if hit is None:
            raise HTTPException(404, "Unknown pattern")
        return hit

    # ── simulation & modelling ──
    M = __import__("cricsim.engine.modelling", fromlist=["x"])       # noqa: N806

    def _state(body: WinProbIn):
        s = body.state
        if s.innings == 2 and not s.target:
            raise HTTPException(422, "state.target is required in the second innings")
        spec = _spec(st.model, body)
        bf = s.batting if s.innings == 1 else 1 - s.batting
        return M.state_scenario(spec, s.innings, s.runs, s.wickets, s.overs, s.target, bf)

    @app.post("/v1/win-probability", tags=[SM], summary="Win probability from any state")
    def win_probability(body: WinProbIn, acct=Depends(account)):
        """Re-simulates the rest of the match from a score, wickets and overs: win chances, projected total and the
        required rate when chasing."""
        spec, sc = _state(body)
        return M.win_probability(st.model, spec, sc, n_for(body.n, acct, 10_000))

    @app.post("/v1/innings/projection", tags=[SM], summary="Innings projection")
    def innings_projection(body: ProjectionIn, acct=Depends(account)):
        """Final total and wickets distribution for the innings in progress, chance of passing each score and
        expected runs in every remaining over."""
        spec, sc = _state(body)
        return M.innings_projection(st.model, spec, sc, n_for(body.n, acct, 10_000), body.thresholds)

    @app.post("/v1/par-score", tags=[SM], summary="Par score")
    def par_score(body: MatchIn, acct=Depends(account)):
        """Median first-innings total for each side batting first, and the totals that make it 50, 60 and 70% to win."""
        return M.par_score(st.model, _spec(st.model, body), n_for(body.n, acct, 10_000))

    @app.post("/v1/chase-curve", tags=[SM], summary="Chase curve")
    def chase_curve(body: ChaseIn, acct=Depends(account)):
        """Chance of chasing down each target in a range, and the target that makes it a coin flip."""
        if body.target_to <= body.target_from:
            raise HTTPException(422, "target_to must be above target_from")
        targets = list(range(body.target_from, body.target_to + 1, body.step))[:25]
        return M.chase_curve(st.model, _spec(st.model, body), body.chasing, targets,
                             max(200, n_for(body.n, acct, 20_000) // len(targets)))

    @app.post("/v1/toss", tags=[SM], summary="Toss decision")
    def toss(body: MatchIn, acct=Depends(account)):
        """Win chances for each side batting first and chasing, and the better call at the toss."""
        return M.toss(st.model, _spec(st.model, body), n_for(body.n, acct, 10_000))

    @app.post("/v1/scenarios/compare", tags=[SM], summary="Compare scenarios")
    def scenarios_compare(body: CompareIn, acct=Depends(account)):
        """Same match under two sets of conditions (pitch, dew, form, bowlers ruled out), simulated with common
        random numbers so the difference is the effect of the change."""
        spec = _spec(st.model, body)
        a, b = _scenario(body.base), _scenario(body.scenario)
        if body.scenario.batting_first is not None:
            spec.batting_first = body.scenario.batting_first
        return M.compare_scenarios(st.model, spec, a, b, n_for(body.n, acct, 10_000))

    @app.post("/v1/players/{pid}/impact", tags=[SM], summary="Player impact")
    def player_impact(pid: str, body: ImpactIn, acct=Depends(account)):
        """Win probability and runs the player adds to their XI over a replacement-level player in the same slot."""
        try:
            return M.player_impact(st.model, _spec(st.model, body), pid, n_for(body.n, acct, 10_000))
        except ValueError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/lineups/swap", tags=[SM], summary="Swap a player")
    def lineup_swap(body: SwapIn, acct=Depends(account)):
        """Effect of replacing one player with another on win chances and scores."""
        try:
            return M.swap(st.model, _spec(st.model, body), body.out_player, body.in_player, n_for(body.n, acct, 10_000))
        except ValueError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/lineups/batting-order", tags=[SM], summary="Batting order optimiser")
    def lineup_order(body: OrderIn, acct=Depends(account)):
        """Tests the given order, adjacent swaps in the top eight and promotions to No. 3, and ranks them by win
        probability."""
        return M.batting_order(st.model, _spec(st.model, body), body.team, n_for(body.n, acct, 3000))

    @app.post("/v1/lineups/bowling-plan", tags=[SM], summary="Bowling plan")
    def lineup_bowling(body: BowlingPlanIn, acct=Depends(account)):
        """Over-by-over allocation within quotas, matching each bowler to the phase and batters where they're most
        effective."""
        try:
            return M.bowling_plan(st.model, _spec(st.model, body), body.bowling_team, body.bowlers)
        except ValueError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/fantasy/projections", tags=[SM], summary="Fantasy projections")
    def fantasy_projections(body: FantasyIn, acct=Depends(account)):
        """Fantasy points distribution for all 22 players: mean, median, 10th and 90th percentile and chance of
        top-scoring."""
        out, _ = M.fantasy_projections(st.model, _spec(st.model, body), body.roles, n_for(body.n, acct, 10_000))
        return out

    @app.post("/v1/fantasy/team", tags=[SM], summary="Fantasy team")
    def fantasy_team(body: FantasyIn, acct=Depends(account)):
        """Highest expected-points XI within 1–10 players per side (and role limits when roles are given), with
        captain and vice-captain."""
        return M.fantasy_team(st.model, _spec(st.model, body), body.roles, n_for(body.n, acct, 10_000), body.captain_rule)

    @app.post("/v1/fantasy/portfolio", tags=[SM], summary="Fantasy portfolio")
    def fantasy_portfolio(body: FantasyIn, acct=Depends(account)):
        """A set of different teams that together cover the likely match scripts, for multi-entry contests."""
        return M.fantasy_portfolio(st.model, _spec(st.model, body), body.teams_count, body.roles,
                                   n_for(body.n, acct, 10_000))

    def _covered(match_id: str):
        from cricsim.engine.io import spec_from_dict
        doc = st.content.match(match_id)
        cov = st.content.coverage(match_id)
        if not doc or not doc.get("published", True) or not cov:
            raise HTTPException(404, "Match not found")
        return spec_from_dict(cov)[0], cov

    @app.get("/v1/matches/{match_id}/win-probability", tags=[SM], summary="Live win probability for a covered match")
    def match_win_probability(match_id: str, innings: int = Query(1, ge=1, le=2), batting: int = Query(0, ge=0, le=1),
                              runs: int = Query(0, ge=0), wickets: int = Query(0, ge=0, le=9),
                              overs: float = Query(0, ge=0), target: int | None = None,
                              n: int = Query(3000, ge=200, le=20_000), acct=Depends(account)):
        """Win chances from the current score of a match we cover, using the published XIs and venue."""
        if innings == 2 and not target:
            raise HTTPException(422, "target is required in the second innings")
        spec, _ = _covered(match_id)
        bf = batting if innings == 1 else 1 - batting
        spec, sc = M.state_scenario(spec, innings, runs, wickets, overs, target, bf)
        return M.win_probability(st.model, spec, sc, n_for(n, acct, 10_000))

    @app.get("/v1/matches/{match_id}/fantasy", tags=[SM], summary="Fantasy projections for a covered match")
    def match_fantasy(match_id: str, n: int = Query(3000, ge=200, le=20_000), acct=Depends(account)):
        """Player projections and the expected-points XI for a match we cover, using its roles when published."""
        spec, cov = _covered(match_id)
        roles = {p: r for t in cov.get("teams", []) for p, r in zip(t.get("players", []), t.get("roles") or [])}
        k = n_for(n, acct, 10_000)
        out, _ = M.fantasy_projections(st.model, spec, roles, k)
        out["team"] = M.fantasy_team(st.model, spec, roles, k)
        return out

    # ── graphics ──
    def wm(acct):
        return acct["limits"]["watermark"]

    def _doc(match_id: str) -> dict:
        d = st.content.match(match_id)
        if not d or not d.get("published", True):
            raise HTTPException(404, "Match not found")
        return d

    for card, title, what in (("win", "Win probability card", "Win chances, projected scores and the headline insight."),
                              ("scores", "Score distribution card", "Where each side's total lands, with the 80% range."),
                              ("worm", "Run worm card", "Expected cumulative score over by over for both sides."),
                              ("phases", "Phase card", "Expected runs and wickets in each phase for both sides."),
                              ("duels", "Key duels card", "The bowler-batter pairings most likely to produce a wicket.")):
        def make(card=card):
            def route(match_id: str, theme: Literal["dark", "light"] = "dark", acct=Depends(account)):
                return _svg(graphics.CARDS[card](_doc(match_id), theme, wm(acct)))
            return route
        app.add_api_route(f"/v1/graphics/matches/{{match_id}}/{card}.svg", make(), methods=["GET"], tags=[G],
                          summary=title, description=what, response_class=Response)

    @app.get("/v1/graphics/players/{pid}/profile.svg", tags=[G], summary="Player profile card", response_class=Response)
    def g_player(pid: str, format: Format = "T20", gender: Gender = "male", theme: Literal["dark", "light"] = "dark",
                 acct=Depends(account)):
        """Strike rate and economy by phase against the format average."""
        return _svg(graphics.player_profile_card(I.phase_profile(st.model, _known(st.model, pid), format, gender),
                                                 theme, wm(acct)))

    @app.get("/v1/graphics/matchups.svg", tags=[G], summary="Match-up card", response_class=Response)
    def g_matchup(batter: str, bowler: str, format: Format = "T20", gender: Gender = "male", phase: Phase = "middle",
                  theme: Literal["dark", "light"] = "dark", acct=Depends(account)):
        """Head-to-head per-ball expectations against an average pairing."""
        from cricsim.engine.analytics import matchup
        return _svg(graphics.matchup_card(matchup(st.model, _known(st.model, batter), _known(st.model, bowler), format,
                                                  gender, phase), theme, wm(acct)))

    @app.get("/v1/graphics/venues/{vid}.svg", tags=[G], summary="Venue card", response_class=Response)
    def g_venue(vid: str, format: Format = "T20", gender: Gender = "male", theme: Literal["dark", "light"] = "dark",
                acct=Depends(account)):
        """Runs per over and balls per wicket by phase against a neutral ground."""
        return _svg(graphics.venue_card(I.venue_profile(st.model, vid, format, gender), theme, wm(acct))
                    if I.venue_profile(st.model, vid, format, gender) else None)

    @app.get("/v1/graphics/trends/scoring.svg", tags=[G], summary="Scoring trend card", response_class=Response)
    def g_trend(format: Format = "T20", gender: Gender = "male", theme: Literal["dark", "light"] = "dark",
                acct=Depends(account)):
        """Runs per over by season for each phase."""
        return _svg(graphics.trend_card(I.scoring_trend(st.model, format, gender), theme, wm(acct)))
