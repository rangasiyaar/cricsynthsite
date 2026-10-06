"""Engine pack: the slice of the model one match needs, as JSON, so the browser can re-simulate.

The Scenario Lab runs the same ball-by-ball engine in a Web Worker (app/lib/engine), so fans can
change the pitch, the toss, the XI's form or the match situation and see every probability move —
with zero server cost. Scenario levers are applied in the browser exactly as `_Tables` applies them.
"""
from __future__ import annotations

import numpy as np

from cricsim.engine import states as S
from cricsim.engine.model import BOWLER_DISMISSALS, DISMISSALS, FORMAT_LIST, GENDERS, MAX_OVERS, RUN_OUT, SITUATION, Model
from cricsim.engine.simulate import _Tables
from cricsim.engine.spec import MatchSpec, Scenario


def _round(a: np.ndarray, nd: int = 4) -> list:
    return np.round(np.asarray(a, dtype=np.float64), nd).tolist()


def engine_pack(model: Model, spec: MatchSpec) -> dict:
    neutral = Scenario()
    rules = spec.rules
    K = S.K
    fmt = FORMAT_LIST.index(spec.format)
    g = GENDERS.index(spec.gender)
    base = model.factors["base"].reshape(len(FORMAT_LIST), 2, 2, MAX_OVERS, 10, K)[fmt, g][:, :rules["overs"]]
    batting = []
    for t in (0, 1):
        order, bowlers = list(spec.teams[t].players), list(spec.teams[1 - t].players)
        T = _Tables(model, spec, neutral, 0, order, bowlers, spec.teams[1 - t].bowlers)
        batting.append({"team": t, "order": order, "bowlers": bowlers, "pair": _round(T.pair),
                        "bowlWeights": _round(T.bowl_weights, 5), "dismissal": _round(T.dismissal),
                        "bowlerKinds": [S.BOWLING_KINDS[k] for k in T.kind]})
    T0 = _Tables(model, spec, neutral, 0, list(spec.teams[0].players), list(spec.teams[1].players))
    players = {}
    for team in spec.teams:
        for p in team.players:
            i = model.pid(p)
            players[p] = {"name": model.names[i] if model.knows(p) else p, "known": model.knows(p),
                          "hand": S.HANDS[model.hand[i]] if model.knows(p) else "unknown"}
    return {
        "version": 1, "format": spec.format, "gender": spec.gender, "rules": rules,
        "outcomes": list(S.OUTCOMES), "batRuns": S.BAT_RUNS.tolist(), "legal": S.LEGAL.tolist(),
        "battingClasses": S.BATTING_CLASSES.tolist(),
        "edges": {"set": S.SET_EDGES.tolist(), "chase": S.CHASE_EDGES.tolist(), "mile": S.MILE_EDGES.tolist(),
                  "dots": S.DOT_EDGES.tolist()},
        "base": _round(base), "situation": {k: _round(T0.sit[k]) for k in SITUATION if k != "hand_kind"},
        "batting": batting, "wideRuns": _round(T0.wide_runs), "byeRuns": _round(T0.bye_runs),
        "runoutNonStriker": round(float(T0.runout_ns), 4), "dismissals": list(DISMISSALS),
        "bowlerDismissals": BOWLER_DISMISSALS.tolist(), "runOut": RUN_OUT,
        "conditionsSd": model.meta.get("fit", {}).get("conditions_sd", {}),
        "teams": [{"name": t.name, "players": t.players} for t in spec.teams], "players": players,
    }
