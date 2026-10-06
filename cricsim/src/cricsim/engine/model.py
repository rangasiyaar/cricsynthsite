"""The fitted model: log-factors for the ball-outcome model plus the tables the simulator needs.

P(outcome | ball) ∝ exp( Σ factor[level(ball)] )  over outcome classes (states.OUTCOMES).

Factor layout (levels × K, natural-log multipliers):
    base       format × gender × innings × over × wickets-down     (the match situation)
    era        season × format family                             (scoring levels drift; simulate at the latest)
    set chase mile streak dots spell freehit hand_kind              (Pattern Lab situation effects, per family)
    venue comp                                                       (ground and competition environment)
    bat bowl                                                         (player, all formats and leagues together)
    bat_fmt bowl_fmt                                                 (player × format family, shrunk to the above)
    bat_kind bowl_hand                                               (player v bowling kind / batting hand)

Cross-league: one rating per player across every competition he has played in, with competitions
linked through the players who play in several — a debutant inherits what his IPL / domestic /
A-team balls say, adjusted for the strength of the bowlers and batters he faced there.
Cross-format: bat_fmt/bowl_fmt only move a player away from his overall rating when there is
enough data in that format family.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from cricsim.engine import states as S

FORMAT_LIST = ("T20", "T10", "HUNDRED", "OD")
GENDERS = ("male", "female")
MAX_OVERS = 50
DISMISSALS = ("caught", "bowled", "lbw", "stumped", "run out", "caught and bowled", "hit wicket", "other")
BOWLER_DISMISSALS = np.array([True, True, True, True, False, True, True, False])
RUN_OUT = DISMISSALS.index("run out")
N_DECILES = 10


def base_index(fmt, gender, innings0, over, wkts):
    """fmt/gender are integer codes; innings0 is 0 or 1."""
    return (((np.asarray(fmt) * 2 + gender) * 2 + innings0) * MAX_OVERS + np.minimum(over, MAX_OVERS - 1)) * 10 \
        + np.minimum(wkts, 9)


N_BASE = len(FORMAT_LIST) * 2 * 2 * MAX_OVERS * 10
ERA_START, N_ERA = 2000, 40          # one scoring-level factor per season and format family
ERA_TREND = 0.5                      # share of the latest season-on-season change projected forward


def era_index(days_since_epoch):
    years = (np.asarray(days_since_epoch).astype("datetime64[D]").astype("datetime64[Y]").astype(int) + 1970)
    return np.clip(years - ERA_START, 0, N_ERA - 1)


def era_vector(model: "Model", fam: int) -> np.ndarray:
    """Log-multipliers for the most recent season — scoring levels drift (T20 run rates rose sharply after 2022)."""
    f = model.factors.get("era")
    if f is None:                                       # models fitted before the era factor existed
        return np.zeros(10, dtype=np.float32)
    i = int(model.meta.get("fit", {}).get("era_index", N_ERA - 1))
    v = f[fam * N_ERA + i]
    if i > 0:      # scoring keeps rising: carry part of last season's change forward (backtest-tuned)
        v = v + model.meta.get("era_trend", ERA_TREND) * (v - f[fam * N_ERA + i - 1])
    return v

# situation factors: name → levels per family
SITUATION = {
    "set": S.N_SET, "chase": S.N_CHASE, "mile": S.N_MILE, "streak": S.N_STREAK, "dots": S.N_DOTS,
    "spell": 2, "freehit": 2, "hand_kind": len(S.HANDS) * len(S.BOWLING_KINDS),
}


@dataclass
class Model:
    factors: dict[str, np.ndarray]                    # name → (levels, K) float32 log-multipliers
    players: list[str]                                # index → Cricsheet player id
    venues: list[str]
    comps: list[str]
    names: list[str] = field(default_factory=list)    # index → display name
    hand: np.ndarray | None = None                    # (P,) HANDS index
    kind: np.ndarray | None = None                    # (P,) BOWLING_KINDS index
    balls_faced: np.ndarray | None = None             # (P, 2 families) recency-weighted
    balls_bowled: np.ndarray | None = None
    last_played: np.ndarray | None = None             # (P,) days since epoch
    usage: np.ndarray | None = None                   # (P, 2, deciles) overs per match by innings decile
    appearances: np.ndarray | None = None             # (P, 2) recency-weighted matches
    bat_pos: np.ndarray | None = None                 # (P, 2) mean batting position (0 = unknown)
    wide_runs: np.ndarray | None = None               # (2, 5) P(1..5 runs | wide)
    bye_runs: np.ndarray | None = None                # (2, 4) P(1..4 runs | bye)
    dismissal: np.ndarray | None = None               # (2, kinds, len(DISMISSALS)) P(how out | wicket, bowler kind)
    runout_non_striker: float = 0.4
    meta: dict = field(default_factory=dict)

    # ── lookups ──
    def __post_init__(self):
        self._pidx = {p: i for i, p in enumerate(self.players)}
        self._vidx = {v: i for i, v in enumerate(self.venues)}
        self._cidx = {c: i for i, c in enumerate(self.comps)}

    def pid(self, player_id: str) -> int:
        """Index of a player; unknown players (never seen) map to 0 — the league-average newcomer."""
        return self._pidx.get(player_id, 0)

    def venue(self, venue_id: str | None) -> int:
        return self._vidx.get(venue_id or "", 0)

    def comp(self, comp_key: str | None) -> int:
        return self._cidx.get(comp_key or "", 0)

    def knows(self, player_id: str) -> bool:
        return player_id in self._pidx and self._pidx[player_id] != 0

    # ── persistence ──
    ARRAYS = ("hand", "kind", "balls_faced", "balls_bowled", "last_played", "usage", "appearances", "bat_pos",
              "wide_runs", "bye_runs", "dismissal")

    def save(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        arrays = {f"factor_{k}": v.astype(np.float32) for k, v in self.factors.items()}
        arrays.update({k: getattr(self, k) for k in self.ARRAYS if getattr(self, k) is not None})
        np.savez_compressed(path / "model.npz", **arrays)
        (path / "model.json").write_text(json.dumps({
            "players": self.players, "names": self.names, "venues": self.venues, "comps": self.comps,
            "runout_non_striker": self.runout_non_striker, "meta": self.meta}))

    @classmethod
    def load(cls, path: Path) -> "Model":
        z = np.load(path / "model.npz")
        j = json.loads((path / "model.json").read_text())
        factors = {k[len("factor_"):]: z[k] for k in z.files if k.startswith("factor_")}
        extra = {k: z[k] for k in cls.ARRAYS if k in z.files}
        return cls(factors=factors, players=j["players"], venues=j["venues"], comps=j["comps"], names=j["names"],
                   runout_non_striker=j["runout_non_striker"], meta=j["meta"], **extra)
