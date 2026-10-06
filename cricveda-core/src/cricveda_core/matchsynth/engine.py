"""Vectorised ball-by-ball match simulation.

Every iteration of the Monte Carlo is a column in numpy arrays; the engine
steps all of them forward one ball at a time, so 10,000 matches cost ~260
vector steps rather than 2.6 million Python iterations.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from cricveda_core.matchsynth.ball_model import (
    BOWLER_TYPES, EXTRA, FORMATS, K, LEGAL, PHASE_NAMES, PHASES, RUNS, WICKET,
    BallModel, phase_of, pressure_bucket,
)

QUOTA = {"T20": 4, "ODI": 10}
MAX_DELIVERIES_PER_OVER = 12        # after this many, force legal balls (stops runaway extras)
# Default bowling load when a player has no history, by role (overs per match).
DEFAULT_OVERS = {"BOWL": 3.5, "AR": 2.0}
PART_TIMER_OVERS = 0.25


@dataclass
class Side:
    name: str
    batters: list[int]                 # batting order (up to 11 player ids)
    bowlers: list[int]                 # everyone who might bowl
    bowler_types: list[int]
    bowler_weights: np.ndarray         # (n_bowlers, 3) overs-per-match × phase share

    @property
    def n_bowlers(self) -> int:
        return len(self.bowlers)


def build_side(model: BallModel, fmt: str, name: str, batting_order: list[int],
               roles: dict[int, str], bowling_types: dict[int, int]) -> Side:
    """Batting order as given; bowling options from history, falling back on role."""
    bowlers, types, weights = [], [], []
    for pid in batting_order:
        usage = model.bowler_usage.get(pid, {}).get(fmt)
        if usage and usage["overs_per_match"] > 0:
            w = usage["overs_per_match"] * np.array(usage["phase_share"])
        else:
            w = DEFAULT_OVERS.get((roles.get(pid) or "").upper(), PART_TIMER_OVERS) * np.ones(3) / 3
        bowlers.append(pid)
        types.append(bowling_types.get(pid, len(BOWLER_TYPES) - 1))
        weights.append(w)
    return Side(name, list(batting_order), bowlers, types, np.array(weights))


@dataclass
class InningsStart:
    """Where an innings resumes from (for scenarios / live projections)."""
    runs: int = 0
    wickets: int = 0
    legal_balls: int = 0
    striker: int | None = None          # index in the batting order; default = wickets
    non_striker: int | None = None      # default = wickets + 1
    bowler_overs: dict[int, int] = field(default_factory=dict)   # player_id -> overs already bowled
    last_bowler: int | None = None


@dataclass
class InningsResult:
    runs: np.ndarray
    wickets: np.ndarray
    legal_balls: np.ndarray
    phase_runs: np.ndarray             # (n, 3)
    phase_wickets: np.ndarray          # (n, 3)
    bowler_overs: np.ndarray | None = None   # (n, n_bowlers) completed overs
    max_consecutive: int = 1           # most overs in a row by one bowler (should be 1)


def simulate_innings(model: BallModel, fmt: str, innings: int, bat: Side, bowl: Side, n: int,
                     rng: np.random.Generator, target: np.ndarray | None = None,
                     start: InningsStart | None = None,
                     excluded_bowlers: set[int] | None = None) -> InningsResult:
    start = start or InningsStart()
    overs = FORMATS[fmt]
    quota = QUOTA[fmt]
    nb = bowl.n_bowlers
    table = model.match_tables(bat.batters, bowl.bowlers, bowl.bowler_types)       # (nbat, nb, K)
    context = model.context[fmt][innings - 1]                                      # (overs, 10, K)
    chase = model.chase
    n_bat = len(bat.batters)

    runs = np.full(n, start.runs, dtype=np.int32)
    wkts = np.full(n, start.wickets, dtype=np.int32)
    legal = np.full(n, start.legal_balls, dtype=np.int32)
    striker = np.full(n, start.wickets if start.striker is None else start.striker, dtype=np.int32)
    non_striker = np.full(n, start.wickets + 1 if start.non_striker is None else start.non_striker, dtype=np.int32)
    next_bat = np.full(n, max(start.wickets + 2, int(striker[0]) + 1, int(non_striker[0]) + 1), dtype=np.int32)
    bowled = np.zeros((n, nb), dtype=np.int32)
    for pid, o in start.bowler_overs.items():
        if pid in bowl.bowlers:
            bowled[:, bowl.bowlers.index(pid)] = o
    last = np.full(n, bowl.bowlers.index(start.last_bowler) if start.last_bowler in bowl.bowlers else -1)
    allowed = np.array([p not in (excluded_bowlers or set()) for p in bowl.bowlers])
    phase_runs = np.zeros((n, 3), dtype=np.int32)
    phase_wkts = np.zeros((n, 3), dtype=np.int32)
    consecutive = np.zeros(n, dtype=np.int32)
    max_consecutive = 0
    all_out = n_bat - 1
    done = (wkts >= all_out) | (legal >= overs * 6)
    if target is not None:
        done |= runs >= target
    rows = np.arange(n)

    for over in range(start.legal_balls // 6, overs):
        if done.all():
            break
        phase = int(phase_of(over, fmt))
        # ── choose this over's bowler for every live iteration ──
        w = np.broadcast_to(bowl.bowler_weights[:, phase] * allowed, (n, nb)).copy()
        w[bowled >= quota] = 0
        w[rows, np.clip(last, 0, nb - 1)] *= (last < 0)            # no back-to-back overs
        empty = w.sum(axis=1) == 0
        if empty.any():                                             # out of specialists: anyone fresh
            fallback = ((bowled[empty] < quota) & allowed).astype(float)
            fallback[np.arange(empty.sum()), np.clip(last[empty], 0, nb - 1)] *= (last[empty] < 0)
            fallback[fallback.sum(axis=1) == 0] = 1.0
            w[empty] = fallback
        cum = np.cumsum(w, axis=1)
        bowler = (cum < rng.random((n, 1)) * cum[:, -1:]).sum(axis=1).clip(0, nb - 1)

        live_at_start = ~done
        in_over = np.where(done, 6, legal - over * 6)
        for delivery in range(MAX_DELIVERIES_PER_OVER + 6):
            live = (~done) & (in_over < 6)
            if not live.any():
                break
            idx = np.nonzero(live)[0]
            s, b = striker[idx], bowler[idx]
            p = context[over, np.clip(wkts[idx], 0, 9)] * table[np.clip(s, 0, n_bat - 1), b]
            if target is not None:
                left = overs * 6 - legal[idx]
                p = p * chase[pressure_bucket(target[idx] - runs[idx], left, np.full(len(idx), 2))]
            if delivery >= MAX_DELIVERIES_PER_OVER:
                p[:, EXTRA] = 0
            p /= p.sum(axis=1, keepdims=True)
            u = rng.random((len(idx), 1))
            out = (np.cumsum(p, axis=1) < u).sum(axis=1).clip(0, K - 1)

            r = RUNS[out]
            runs[idx] += r
            phase_runs[idx, phase] += r
            legal[idx] += LEGAL[out]
            in_over[idx] += LEGAL[out]
            out_w = out == WICKET
            if out_w.any():
                wi = idx[out_w]
                wkts[wi] += 1
                phase_wkts[wi, phase] += 1
                striker[wi] = next_bat[wi]
                next_bat[wi] += 1
            odd = (out == 1) | (out == 3)
            if odd.any():
                oi = idx[odd]
                striker[oi], non_striker[oi] = non_striker[oi], striker[oi].copy()
            done[idx] |= wkts[idx] >= all_out
            if target is not None:
                done[idx] |= runs[idx] >= target[idx]

        # over complete: count it for the bowler, change ends
        live_rows = np.nonzero(live_at_start & (in_over >= 6))[0]     # completed this over
        bowled[live_rows, bowler[live_rows]] += 1
        same = last[live_rows] == bowler[live_rows]
        consecutive[live_rows] = np.where(same, consecutive[live_rows] + 1, 1)
        if len(live_rows):
            max_consecutive = max(max_consecutive, int(consecutive[live_rows].max()))
        last[live_rows] = bowler[live_rows]
        striker[live_rows], non_striker[live_rows] = non_striker[live_rows], striker[live_rows].copy()
        done |= legal >= overs * 6

    return InningsResult(runs, wkts, legal, phase_runs, phase_wkts, bowled, max_consecutive)


@dataclass
class MatchResult:
    batting_first: str
    batting_second: str
    first: InningsResult
    second: InningsResult
    fmt: str

    @property
    def first_wins(self) -> np.ndarray:
        """1 = side batting first won, 0 = lost, 0.5 = tie (super over treated as a coin flip)."""
        f, s = self.first.runs, self.second.runs
        return np.where(f > s, 1.0, np.where(f < s, 0.0, 0.5))


def simulate_match(model: BallModel, fmt: str, batting_first: Side, batting_second: Side, n: int,
                   seed: int = 0, first_start: InningsStart | None = None,
                   second_start: InningsStart | None = None, known_first_total: int | None = None,
                   excluded_bowlers: dict[str, set[int]] | None = None) -> MatchResult:
    """Simulate `n` matches. Pass `known_first_total` to simulate only the chase."""
    rng = np.random.default_rng(seed)
    ex = excluded_bowlers or {}
    if known_first_total is None:
        first = simulate_innings(model, fmt, 1, batting_first, batting_second, n, rng, start=first_start,
                                 excluded_bowlers=ex.get(batting_second.name))
    else:
        z = np.zeros((n, 3), dtype=np.int32)
        first = InningsResult(np.full(n, known_first_total), np.zeros(n, int), np.full(n, FORMATS[fmt] * 6), z, z)
    second = simulate_innings(model, fmt, 2, batting_second, batting_first, n, rng, target=first.runs + 1,
                              start=second_start, excluded_bowlers=ex.get(batting_first.name))
    return MatchResult(batting_first.name, batting_second.name, first, second, fmt)


# ── Summaries used by the API ────────────────────────────────────────────────

def quantiles(x: np.ndarray) -> dict:
    p10, p50, p90 = np.percentile(x, [10, 50, 90])
    return {"p10": int(round(p10)), "median": int(round(p50)), "p90": int(round(p90))}


def phase_label(fmt: str, phase: int) -> str:
    lo, hi = PHASES[fmt][phase]
    return f"overs_{lo + 1}_{hi}"


def pressure_phase(result: MatchResult) -> str:
    """The phase whose run margin between the sides best predicts who wins."""
    win = result.first_wins
    best, best_corr = 0, -1.0
    for j in range(3):
        margin = result.first.phase_runs[:, j] - result.second.phase_runs[:, j]
        if margin.std() == 0 or win.std() == 0:
            continue
        c = abs(float(np.corrcoef(margin, win)[0, 1]))
        if c > best_corr:
            best, best_corr = j, c
    return phase_label(result.fmt, best)


def batting_weaknesses(model: BallModel, fmt: str, side: Side, top_order: int = 7,
                       limit: int = 3) -> list[dict]:
    """Bowler type × phase combinations this side's batters handle worst.

    Compares the side's expected runs per ball and dismissal chance against a
    league-average batter facing the same bowler type in the same phase.
    """
    batters = side.batters[:top_order]
    found = []
    for t, tname in enumerate(BOWLER_TYPES[:-1]):
        tbl = model.match_tables(batters, [-1], [t])[:, 0, :]          # (batters, K); bowler = average
        for j, pname in enumerate(PHASE_NAMES):
            lo, hi = PHASES[fmt][j]
            ctx = model.context[fmt][0, lo:hi, 2].mean(axis=0)          # typical: 2 down
            league = ctx / ctx.sum()
            p = ctx[None, :] * tbl
            p /= p.sum(axis=1, keepdims=True)
            rpb = float((p @ RUNS).mean() / (league @ RUNS))
            wkt = float(p[:, WICKET].mean() / league[WICKET])
            score = (wkt - 1.0) + (1.0 - rpb)
            if wkt >= 1.12 or rpb <= 0.9:
                found.append({"tag": f"{tname}_{pname}", "bowler_type": tname, "phase": pname,
                              "run_rate_vs_league": round(rpb, 2), "dismissal_rate_vs_league": round(wkt, 2),
                              "score": round(score, 3)})
    found.sort(key=lambda f: f["score"], reverse=True)
    return found[:limit]
