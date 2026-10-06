"""Fixture-level MatchSynth services, shared by the API and the nightly job.

    simulate_fixture   full-match Monte Carlo → win probability, totals, pressure phase, weaknesses
    scenario           resume from any match state with what-ifs
    opposition_report  where a side's batting is weak, and which bowlers exploit it
    auction_value      win probability a player adds over a replacement-level player
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from cricveda_core.matchsynth.ball_model import BOWLER_TYPES, FORMATS, BallModel, bowler_type
from cricveda_core.matchsynth.engine import (
    InningsStart, Side, batting_weaknesses, build_side, pressure_phase, quantiles, simulate_match,
)

TOSS_KEYS = ("home_bat", "home_bowl", "away_bat", "away_bowl")
REPLACEMENT_ID = -1            # unknown id → league-average multipliers in the model
MATCHES_PER_SEASON = 14        # IPL league stage


@dataclass
class SquadRow:
    player_id: int
    team: str
    batting_order: int | None
    is_playing_xi: bool
    is_confirmed: bool
    role: str | None = None
    bowling_style: str | None = None


def _xi(squad: list[SquadRow], team: str) -> list[SquadRow]:
    xi = [p for p in squad if p.team == team and p.is_playing_xi]
    return sorted(xi, key=lambda p: (p.batting_order is None, p.batting_order or 0))


def xi_status(squad: list[SquadRow], team: str) -> str:
    xi = _xi(squad, team)
    if not xi:
        return "unknown"
    return "confirmed" if all(p.is_confirmed for p in xi) else "projected"


def make_side(model: BallModel, fmt: str, team: str, squad: list[SquadRow],
              batting_order: list[int] | None = None) -> Side:
    xi = _xi(squad, team)
    if len(xi) < 2:
        raise ValueError(f"{team} needs at least two players in the XI")
    order = batting_order or [p.player_id for p in xi]
    by_id = {p.player_id: p for p in xi}
    roles = {p.player_id: (p.role or "") for p in xi}
    types = {p.player_id: bowler_type(p.bowling_style) for p in xi}
    for pid in order:
        if pid not in by_id and pid != REPLACEMENT_ID:
            raise ValueError(f"Player {pid} isn't in {team}'s XI")
    return build_side(model, fmt, team, order, roles, types)


def toss_key_from_fixture(fixture: dict) -> str | None:
    winner, decision = fixture.get("toss_winner"), fixture.get("toss_decision")
    if not winner or decision not in ("bat", "field"):
        return None
    side = "home" if winner == fixture["team1"] else "away"
    return f"{side}_{'bat' if decision == 'bat' else 'bowl'}"


def _batting_first(toss_key: str) -> str:
    side, choice = toss_key.split("_")
    return side if choice == "bat" else ("away" if side == "home" else "home")


def _fmt(fixture: dict) -> str:
    fmt = (fixture.get("format") or "T20").upper()
    if fmt not in FORMATS:
        raise ValueError(f"MatchSynth simulates T20 and ODI matches, not {fmt}")
    return fmt


def simulate_fixture(model: BallModel, fixture: dict, squad: list[SquadRow], iterations: int = 10000,
                     toss_key: str | None = None, seed: int = 0) -> dict:
    """Full match. Without a known toss, half the runs have each side batting first."""
    fmt = _fmt(fixture)
    home_name, away_name = fixture["team1"], fixture["team2"]
    sides = {"home": make_side(model, fmt, home_name, squad), "away": make_side(model, fmt, away_name, squad)}
    toss_key = toss_key or toss_key_from_fixture(fixture)
    orders = [_batting_first(toss_key)] if toss_key else ["home", "away"]
    per_order = iterations // len(orders)

    home_wins, totals_first, totals_second, results = [], {"home": [], "away": []}, {"home": [], "away": []}, []
    for k, first in enumerate(orders):
        second = "away" if first == "home" else "home"
        res = simulate_match(model, fmt, sides[first], sides[second], per_order, seed=seed + k)
        results.append(res)
        fw = res.first_wins
        home_wins.append(fw if first == "home" else 1 - fw)
        totals_first[first].append(res.first.runs)
        totals_second[second].append(res.second.runs)

    hw = float(np.concatenate(home_wins).mean())
    first_side = orders[0] if len(orders) == 1 else None
    out = {
        "iterations": per_order * len(orders),
        "toss": toss_key,
        "win_probability": {home_name: round(hw, 2), away_name: round(1 - hw, 2)},
        "pressure_phase": pressure_phase(results[0]) if len(results) == 1 else
        _majority([pressure_phase(r) for r in results]),
        "opposition_weakness": [w["tag"] for w in batting_weaknesses(model, fmt, sides["away"])],
        "weaknesses": {
            home_name: batting_weaknesses(model, fmt, sides["home"]),
            away_name: batting_weaknesses(model, fmt, sides["away"]),
        },
        "xi": {home_name: xi_status(squad, home_name), away_name: xi_status(squad, away_name)},
        "model_version": model.version,
    }
    if first_side:
        second_side = "away" if first_side == "home" else "home"
        out["first_innings"] = {"batting": sides[first_side].name, "total": quantiles(results[0].first.runs)}
        out["second_innings"] = {"batting": sides[second_side].name, "total": quantiles(results[0].second.runs)}
    else:
        out["first_innings"] = {
            "total": quantiles(np.concatenate(totals_first["home"] + totals_first["away"])),
            "by_team": {sides[s].name: quantiles(np.concatenate(totals_first[s])) for s in ("home", "away")},
        }
    return out


def _majority(labels: list[str]) -> str:
    return max(set(labels), key=labels.count)


def scenario(model: BallModel, fixture: dict, squad: list[SquadRow], *, innings: int, batting: str,
             runs: int, wickets: int, balls: int, first_innings_total: int | None = None,
             bowler_overs: dict[int, int] | None = None, last_bowler: int | None = None,
             batting_order: list[int] | None = None, exclude_bowlers: list[int] | None = None,
             iterations: int = 10000, seed: int = 0) -> dict:
    """Resume from a match state. `batting` = 'home' | 'away' (the side at the crease)."""
    fmt = _fmt(fixture)
    names = {"home": fixture["team1"], "away": fixture["team2"]}
    bowling = "away" if batting == "home" else "home"
    bat_side = make_side(model, fmt, names[batting], squad, batting_order)
    bowl_side = make_side(model, fmt, names[bowling], squad)
    start = InningsStart(runs=runs, wickets=wickets, legal_balls=balls,
                         bowler_overs=bowler_overs or {}, last_bowler=last_bowler)
    excluded = {names[bowling]: set(exclude_bowlers or [])}
    if innings == 1:
        res = simulate_match(model, fmt, bat_side, bowl_side, iterations, seed=seed, first_start=start,
                             excluded_bowlers=excluded)
        win = float(res.first_wins.mean())
        projected = quantiles(res.first.runs)
    else:
        if first_innings_total is None:
            raise ValueError("first_innings_total is required for a 2nd-innings scenario")
        res = simulate_match(model, fmt, bowl_side, bat_side, iterations, seed=seed, second_start=start,
                             known_first_total=first_innings_total, excluded_bowlers=excluded)
        win = float(1 - res.first_wins.mean())
        projected = quantiles(res.second.runs)
    return {
        "iterations": iterations,
        "batting": names[batting],
        "win_probability": {names[batting]: round(win, 2), names[bowling]: round(1 - win, 2)},
        "projected_total": projected,
        "model_version": model.version,
    }


def opposition_report(model: BallModel, fixture: dict, squad: list[SquadRow], team: str) -> dict:
    """`team` = the opposition being analysed ('home' | 'away')."""
    fmt = _fmt(fixture)
    names = {"home": fixture["team1"], "away": fixture["team2"]}
    ours = "away" if team == "home" else "home"
    opp = make_side(model, fmt, names[team], squad)
    our_side = make_side(model, fmt, names[ours], squad)
    weaknesses = batting_weaknesses(model, fmt, opp, limit=5)
    for w in weaknesses:
        t = BOWLER_TYPES.index(w["bowler_type"])
        w["our_bowlers"] = [pid for pid, bt, wt in zip(our_side.bowlers, our_side.bowler_types,
                                                       our_side.bowler_weights.sum(axis=1)) if bt == t and wt >= 1.0]
    return {"team": names[team], "weaknesses": weaknesses, "model_version": model.version}


def auction_value(model: BallModel, fixture: dict, squad: list[SquadRow], player_id: int,
                  iterations: int = 6000, seed: int = 0, crore_per_win: float | None = None) -> dict:
    """Win probability the player adds over a league-average replacement in the same slot."""
    fmt = _fmt(fixture)
    player = next((p for p in squad if p.player_id == player_id and p.is_playing_xi), None)
    if player is None:
        raise ValueError(f"Player {player_id} isn't in either XI")
    team_key = "home" if player.team == fixture["team1"] else "away"
    other_key = "away" if team_key == "home" else "home"
    names = {"home": fixture["team1"], "away": fixture["team2"]}
    other = make_side(model, fmt, names[other_key], squad)

    def win_prob(side: Side) -> float:
        a = simulate_match(model, fmt, side, other, iterations // 2, seed=seed).first_wins.mean()
        b = 1 - simulate_match(model, fmt, other, side, iterations // 2, seed=seed + 1).first_wins.mean()
        return float((a + b) / 2)

    with_player = make_side(model, fmt, names[team_key], squad)
    replaced = make_side(model, fmt, names[team_key], squad)
    i = replaced.batters.index(player_id)
    replaced.batters[i] = REPLACEMENT_ID
    j = replaced.bowlers.index(player_id)
    replaced.bowlers[j] = REPLACEMENT_ID
    replaced.bowler_types[j] = len(BOWLER_TYPES) - 1        # replacement: average bowler, same workload
    added = win_prob(with_player) - win_prob(replaced)
    season_wins = added * MATCHES_PER_SEASON
    return {
        "player_id": player_id,
        "team": names[team_key],
        "win_probability_added": round(added, 3),
        "season_wins_added": round(season_wins, 2),
        "estimated_value_cr": round(season_wins * crore_per_win, 2) if crore_per_win else None,
        "replacement": "league-average player in the same batting slot and bowling workload",
        "iterations": iterations,
        "model_version": model.version,
    }
