"""The fitted model: log-factors for the ball-outcome model plus the tables the simulator needs.

P(outcome | ball) ∝ exp( Σ factor[level(ball)] )  over outcome classes (states.OUTCOMES).

Factor layout (levels × K, natural-log multipliers):
    base       format × gender × innings × over × wickets-down     (the match situation)
    era        season × format family                             (scoring levels drift; simulate at the latest)
    set chase mile streak dots spell freehit hand_kind              (Pattern Lab situation effects, per family)
    venue comp                                                       (ground and competition environment; a league
                                                                      leans on similar leagues — format × gender)
    home                                                             (batting at home / away / on a neutral ground)
    comp_group                                                       (each group's level: the competition factor for a
                                                                      competition the model has never seen)
    venue_g venue_ph venue_kind                                      (ground × men's/women's, × stage of innings, × pace/spin;
                                                                      runs only — wickets column fixed at 0)
    The venue factor's prior is the other grounds in the same city.
    bat_exp bowl_exp                                                 (career balls so far: how players with little
                                                                      history do — a newcomer's starting point)
    bat bowl                                                         (player, all formats and leagues together)
    bat_phase bowl_phase                                             (player × powerplay / middle / death, optional)
    form_bat form_bowl                                               ((P, 2) log observed/expected boundaries, dismissals
                                                                      over the last RECENT matches, shrunk; optional use)
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
EXP_EDGES = np.array([60, 240, 960])  # career balls faced / bowled: debutant, few games, some, established
N_EXP = len(EXP_EDGES) + 1
RECENT = 5                           # matches that make up a player's current role (batting slot, overs)


PHASE3_EDGES = (0.3, 0.8)            # share of the innings' overs: powerplay-ish / middle / death
N_PHASE3 = 3


def phase3(over, total_overs) -> np.ndarray:
    """0 powerplay, 1 middle, 2 death, from the over (0-based) and the innings length."""
    frac = np.asarray(over) / np.asarray(total_overs)
    return (frac >= PHASE3_EDGES[0]).astype(np.int32) + (frac >= PHASE3_EDGES[1]).astype(np.int32)


def exp_bucket(balls) -> np.ndarray:
    return np.searchsorted(EXP_EDGES, np.asarray(balls), side="right")


def base_index(fmt, gender, innings0, over, wkts):
    """fmt/gender are integer codes; innings0 is 0 or 1."""
    return (((np.asarray(fmt) * 2 + gender) * 2 + innings0) * MAX_OVERS + np.minimum(over, MAX_OVERS - 1)) * 10 \
        + np.minimum(wkts, 9)


N_BASE = len(FORMAT_LIST) * 2 * 2 * MAX_OVERS * 10
ERA_START, N_ERA = 2000, 40          # one scoring-level factor per season and format family
ERA_SEASONS = 4                      # seasons the scoring-trend line is fitted on
ERA_AHEAD = 0.5                      # years past the last training ball the forecast is aimed at
ERA_WICKETS = "trend"                # "latest": dismissals at the latest season's level, not the trend line (variant;
                                     # the level audit found the wicket trend over-projected out of sample)


def era_index(days_since_epoch):
    years = (np.asarray(days_since_epoch).astype("datetime64[D]").astype("datetime64[Y]").astype(int) + 1970)
    return np.clip(years - ERA_START, 0, N_ERA - 1)


def _era_line(f: np.ndarray, balls: np.ndarray, i: int, asof: float) -> np.ndarray:
    """A straight line through the last ERA_SEASONS season levels of one block (weighted by balls), read off
    ERA_AHEAD past the last training ball."""
    seasons = np.arange(max(0, i - ERA_SEASONS + 1), i + 1)
    if len(seasons) < 3:
        return f[i].astype(np.float64)
    y = f[seasons].astype(np.float64)
    b = np.asarray(balls, dtype=np.float64)[seasons]
    w = b / max(b.max(), 1.0) + 1e-6
    x = seasons + 0.5                                   # a season's level sits mid-year
    xm = (w * x).sum() / w.sum()
    ym = (w[:, None] * y).sum(0) / w.sum()
    slope = (w[:, None] * (x - xm)[:, None] * (y - ym)).sum(0) / (w * (x - xm) ** 2).sum()
    return ym + slope * (asof + ERA_AHEAD - xm)


def era_vector(model: "Model", fam: int, gender: int | None = None) -> np.ndarray:
    """Log-multipliers for the coming months — scoring levels drift (T20 run rates rose sharply after 2022).

    A straight line through the last few seasons' levels (weighted by how many balls each season has, so a
    half-played season counts less), read off half a year past the last training ball. With an era_g factor
    (FitConfig.era_gender) men's and women's cricket add their own trend on top."""
    f = model.factors.get("era")
    if f is None:                                       # models fitted before the era factor existed
        return np.zeros(10, dtype=np.float32)
    fit = model.meta.get("fit", {})
    i = int(fit.get("era_index", N_ERA - 1))
    asof = fit.get("era_asof", i + 1.0)
    balls = fit.get("era_balls", [[1.0] * N_ERA] * 2)[fam]
    out = _era_line(f[fam * N_ERA:(fam + 1) * N_ERA], balls, i, asof)
    if (model.meta.get("sim") or {}).get("era_wickets", ERA_WICKETS) == "latest":
        frac = min(max(asof - i, 0.0), 1.0)                          # share of the latest season played
        out[S.WKT] = frac * f[fam * N_ERA + i, S.WKT] + (1 - frac) * f[fam * N_ERA + i - 1, S.WKT]
    g = model.factors.get("era_g")
    if g is not None and gender is not None:
        blk = fam * 2 + gender
        bg = fit.get("era_balls_g", [[1.0] * N_ERA] * 4)[blk]
        out = out + _era_line(g[blk * N_ERA:(blk + 1) * N_ERA], bg, i, asof)
    return out.astype(np.float32)


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
    usage_slot: np.ndarray | None = None              # (2, 11, deciles) the same by team-sheet slot (newcomers' prior)
    usage_recent: np.ndarray | None = None            # (P, 2, deciles) the same over the last RECENT matches
    recent_n: np.ndarray | None = None                # (P, 2) how many recent matches that is (0..RECENT)
    bat_pos_recent: np.ndarray | None = None          # (P, 2) batting position over the last RECENT innings
    career_balls: np.ndarray | None = None            # (P, 2) balls faced / bowled so far (experience buckets)
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

    def venue_factor(self, venue_id: str | None, gender: int) -> np.ndarray:
        """Ground environment: the venue factor plus its men's / women's adjustment."""
        i = self.venue(venue_id)
        f = self.factors["venue"][i]
        g = self.factors.get("venue_g")
        return f if g is None else f + g[i * 2 + gender]

    def venue_phase(self, venue_id: str | None, fmt: str) -> np.ndarray:
        """(MAX_OVERS, K) ground × stage-of-innings adjustment for each over."""
        f = self.factors.get("venue_ph")
        if f is None:
            return np.zeros((MAX_OVERS, S.K), dtype=np.float32)
        ph = S.venue_phase_bucket(np.arange(MAX_OVERS), S.FORMAT_RULES[fmt]["overs"])
        return f[self.venue(venue_id) * S.N_VENUE_PHASE + np.minimum(ph, S.N_VENUE_PHASE - 1)]

    def venue_kind(self, venue_id: str | None, kinds) -> np.ndarray:
        """(len(kinds), K) ground × pace/spin adjustment for each bowler type."""
        f = self.factors.get("venue_kind")
        kinds = np.asarray(kinds)
        if f is None:
            return np.zeros((len(kinds), S.K), dtype=np.float32)
        return f[self.venue(venue_id) * S.N_KIND_GROUP + S.kind_group(kinds)]

    def comp(self, comp_key: str | None) -> int:
        return self._cidx.get(comp_key or "", 0)

    def comp_factor(self, comp_key: str | None, fmt: str, gender: str, team_type: str | None = None) -> np.ndarray:
        """Competition environment. A competition the model has never seen gets its group's level (club or
        international × format × gender); team_type defaults to international for "intl-international-…" keys,
        club otherwise."""
        i = self.comp(comp_key)
        groups, keys = self.factors.get("comp_group"), self.meta.get("comp_groups")
        if i or groups is None or not keys:
            return self.factors["comp"][i]
        tt = team_type or ("international" if (comp_key or "").startswith("intl-international") else "club")
        key = f"{tt}|{fmt}|{gender}"
        return groups[keys.index(key)] if key in keys else self.factors["comp"][0]

    def home_team(self, venue_id: str | None, team_names) -> int | None:
        """Index of the team at home on this ground (played there 3+ times and at least twice as often as the
        other side), or None for a neutral ground or when the model has no home data."""
        counts = (self.meta.get("home_counts") or {}).get(venue_id or "")
        if not counts:
            return None
        n = [counts.get(t, 0) for t in team_names]
        top = int(np.argmax(n))
        return top if n[top] >= 3 and n[top] >= 2 * n[1 - top] else None

    def knows(self, player_id: str) -> bool:
        return player_id in self._pidx and self._pidx[player_id] != 0

    # ── persistence ──
    ARRAYS = ("hand", "kind", "balls_faced", "balls_bowled", "last_played", "usage", "usage_slot", "usage_recent", "recent_n",
              "bat_pos_recent", "career_balls", "appearances", "bat_pos",
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
