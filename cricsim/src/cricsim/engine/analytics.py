"""Analytics straight from the model (no full-match simulation): matchups and player projections."""
from __future__ import annotations

import numpy as np

from cricsim.engine import states as S
from cricsim.engine.model import Model
from cricsim.engine.simulate import _Tables, simulate
from cricsim.engine.spec import MatchSpec, Scenario, TeamSpec
from cricsim.engine.summary import _players, profile

PHASE_OVER = {"powerplay": 0.15, "middle": 0.5, "death": 0.9}     # representative point in the innings


def _ball_probs(model: Model, spec: MatchSpec, bat: str, bowl: str, phase: str, balls_faced: int = 12,
                wickets: int = 2) -> np.ndarray:
    rules = spec.rules
    over = min(int(PHASE_OVER[phase] * rules["overs"]), rules["overs"] - 1)
    T = _Tables(model, spec, Scenario(), 0, [bat], [bowl])
    base = T.base[over, wickets]
    L = (base + T.sit["set"][S.set_bucket(balls_faced)] + T.sit["streak"][2] + T.sit["dots"][0]
         + T.sit["mile"][S.milestone_bucket(15)] + T.sit["spell"][0] + T.sit["freehit"][0] + T.pair[0, 0])
    p = np.exp(L - L.max())
    return p / p.sum()


def matchup(model: Model, batter: str, bowler: str, fmt: str = "T20", gender: str = "male",
            phase: str = "middle", venue_id: str | None = None, comp_key: str | None = None) -> dict:
    """Per-ball outcome probabilities for this batter v this bowler, against an average pairing."""
    spec = MatchSpec(fmt, gender, (TeamSpec("bat", [batter]), TeamSpec("bowl", [bowler])),
                     venue_id=venue_id, comp_key=comp_key)
    p = _ball_probs(model, spec, batter, bowler, phase)
    avg = _ball_probs(model, spec, "", "", phase)          # two league-average players, same situation

    def stats(q):
        legal = q[S.LEGAL].sum()
        runs = float((q * np.array([0, 1, 2, 3, 4, 6, 0, 0, 0, 0])).sum())
        w = float(q[S.WKT] / legal)
        return {"dismissal_per_ball": round(w, 4), "balls_per_dismissal": round(1 / w, 1) if w else None,
                "strike_rate": round(100 * runs / legal, 1), "dot_pct": round(float(100 * q[S.DOT] / legal), 1),
                "boundary_pct": round(float(100 * (q[S.FOUR] + q[S.SIX]) / legal), 1),
                "six_pct": round(float(100 * q[S.SIX] / legal), 2)}
    me, base = stats(p), stats(avg)
    return {"batter": _who(model, batter), "bowler": _who(model, bowler), "format": fmt, "phase": phase,
            "per_ball": {o: round(float(x), 4) for o, x in zip(S.OUTCOMES, p)},
            "matchup": me, "average_pairing": base,
            "edge": {"wicket": round(me["dismissal_per_ball"] / base["dismissal_per_ball"], 2),
                     "strike_rate": round(me["strike_rate"] / base["strike_rate"], 2)},
            "note": "Ratings blend every league and format the players have played, adjusted for opposition "
                    "strength; little data means close to average."}


def _who(model: Model, pid: str) -> dict:
    i = model.pid(pid)
    return {"id": pid, "name": model.names[i] if model.knows(pid) else pid, "known": model.knows(pid),
            "hand": S.HANDS[model.hand[i]], "bowling_kind": S.BOWLING_KINDS[model.kind[i]]}


def projection(model: Model, pid: str, fmt: str = "T20", gender: str = "male", position: int | None = None,
               opposition: list[str] | None = None, venue_id: str | None = None, comp_key: str | None = None,
               n: int = 4000, seed: int = 0) -> dict:
    """The player's run / wicket distribution in a typical match: his side and the opposition are
    league-average players unless an opposition XI is given."""
    fam = 1 if fmt == "OD" else 0
    pos = position or (int(round(model.bat_pos[model.pid(pid), fam])) if model.knows(pid) else 0) or 6
    pos = min(max(pos, 1), 11)
    mine = [f"__avg_{i}" for i in range(11)]
    mine[pos - 1] = pid
    opp = opposition or [f"__opp_{i}" for i in range(11)]
    spec = MatchSpec(fmt, gender, (TeamSpec("Team", mine), TeamSpec("Opposition", opp)), venue_id=venue_id,
                     comp_key=comp_key)
    sims = simulate(model, spec, n=n, seed=seed)
    row = next(r for r in _players(sims, model, 0, None) if r["id"] == pid)
    bowls = model.knows(pid) and float(model.usage[model.pid(pid), fam].sum()) >= 0.5   # overs per match
    return {"player": _who(model, pid), "format": fmt, "position": pos, "simulations": n,
            "batting": row.get("batting"), "bowling": row.get("bowling") if bowls else None,
            "profile": profile(model, pid, fmt)}


def search_players(model: Model, q: str, limit: int = 20) -> list[dict]:
    ql = q.lower().strip()
    if len(ql) < 2:
        return []
    hits = []
    for i, name in enumerate(model.names):
        if i and ql in name.lower():
            exp = float(model.balls_faced[i].sum() + model.balls_bowled[i].sum())
            hits.append((-(name.lower().startswith(ql)), -exp, i))
    hits.sort()
    return [{"id": model.players[i], "name": model.names[i], "hand": S.HANDS[model.hand[i]],
             "bowling_kind": S.BOWLING_KINDS[model.kind[i]]} for _, _, i in hits[:limit]]
