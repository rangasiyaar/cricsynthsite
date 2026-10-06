"""JSON ⇄ MatchSpec / Scenario (API requests, admin files, the browser Scenario Lab)."""
from __future__ import annotations

from dataclasses import fields

from cricsim.engine.spec import MatchSpec, Scenario, StartState, TeamSpec


def _only(cls, d: dict) -> dict:
    names = {f.name for f in fields(cls)}
    return {k: v for k, v in d.items() if k in names}


def spec_from_dict(d: dict) -> tuple[MatchSpec, Scenario]:
    teams = tuple(TeamSpec(**_only(TeamSpec, t)) for t in d["teams"])
    if len(teams) != 2 or any(len(t.players) != 11 for t in teams):
        raise ValueError("need two teams of 11 players")
    spec = MatchSpec(**{**_only(MatchSpec, d), "teams": teams})
    if spec.format not in ("T20", "T10", "HUNDRED", "OD"):
        raise ValueError(f"unsupported format {spec.format}")
    sc = d.get("scenario") or {}
    start = sc.get("start")
    scenario = Scenario(**{**_only(Scenario, sc),
                           "start": StartState(**_only(StartState, start)) if start else None,
                           "batting_order": {int(k): v for k, v in (sc.get("batting_order") or {}).items()}})
    return spec, scenario
