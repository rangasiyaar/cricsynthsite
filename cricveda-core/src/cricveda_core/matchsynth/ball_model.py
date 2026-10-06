"""Ball-outcome model for MatchSynth.

P(outcome | ball) for outcomes  0 · 1 · 2 · 3 · 4 · 6 · wicket · extra
is a product of factors, renormalised:

    context[format, innings, over, wickets_down]   league-wide baseline
  × batter[striker]                                how this batter deviates
  × bowler[bowler]                                 how this bowler deviates
  × batter_vs_type[striker, bowler_type]           e.g. struggles v left-arm pace
  × chase[pressure_bucket]                         2nd innings required-rate pressure

Each player factor is an observed/expected ratio shrunk toward 1 by a prior
worth `s` balls, so a player with little data behaves like the league
average. The factored form is what makes 10,000-iteration simulations cheap:
for a match it collapses to a small (batter × bowler × outcome) table.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

OUTCOMES = ("0", "1", "2", "3", "4", "6", "W", "X")
K = len(OUTCOMES)
RUNS = np.array([0, 1, 2, 3, 4, 6, 0, 1], dtype=np.int16)       # runs added to the total
LEGAL = np.array([1, 1, 1, 1, 1, 1, 1, 0], dtype=np.int16)      # counts as a ball
WICKET, EXTRA = 6, 7

FORMATS = {"T20": 20, "ODI": 50}
BOWLER_TYPES = ("right_arm_pace", "left_arm_pace", "off_spin", "leg_spin", "left_arm_spin", "unknown")
_STYLE_TO_TYPE = {
    "right-arm-fast": 0, "right-arm-medium": 0, "right-arm-fast-medium": 0, "right-arm-medium-fast": 0,
    "left-arm-fast": 1, "left-arm-medium": 1, "left-arm-fast-medium": 1, "left-arm-medium-fast": 1,
    "right-arm-off-break": 2, "right-arm-leg-break": 3, "right-arm-googly": 3,
    "slow-left-arm": 4, "left-arm-orthodox": 4, "left-arm-wrist-spin": 4,
}
# 2nd-innings pressure: runs needed per remaining ball
PRESSURE_EDGES = np.array([0.8, 1.1, 1.4, 1.7, 2.0])
N_PRESSURE = len(PRESSURE_EDGES) + 2          # bucket 0 = 1st innings / no chase
PHASES = {"T20": ((0, 6), (6, 15), (15, 20)), "ODI": ((0, 10), (10, 40), (40, 50))}
PHASE_NAMES = ("powerplay", "middle", "death")

CONTEXT_PRIOR = 500.0       # pseudo-balls pulling each over×wickets cell toward its over
SHRINK = {"batter": 300.0, "bowler": 300.0, "batter_vs_type": 600.0, "chase": 500.0}


def bowler_type(style: str | None) -> int:
    return _STYLE_TO_TYPE.get((style or "").strip().lower(), len(BOWLER_TYPES) - 1)


def pressure_bucket(runs_needed: np.ndarray, balls_left: np.ndarray, innings: np.ndarray) -> np.ndarray:
    rate = np.where(balls_left > 0, runs_needed / np.maximum(balls_left, 1), 9.9)
    b = np.searchsorted(PRESSURE_EDGES, rate, side="right") + 1
    return np.where(innings == 2, b, 0).astype(np.int8)


def phase_of(over: np.ndarray | int, fmt: str) -> np.ndarray:
    edges = [hi for _, hi in PHASES[fmt]]
    return np.searchsorted(edges, np.asarray(over), side="right").clip(0, 2)


# ── Turning raw deliveries into per-ball training states ─────────────────────

def encode_outcome(runs_total: pd.Series, extras_type: pd.Series, wicket_type: pd.Series) -> np.ndarray:
    ex = extras_type.fillna("").astype(str).str.lower()
    is_extra = ex.isin(["wides", "wide", "noballs", "noball"])
    is_wkt = wicket_type.notna() & (wicket_type.astype(str) != "")
    runs = runs_total.fillna(0).astype(int).clip(0, 7)
    by_runs = np.select([runs == 0, runs == 1, runs == 2, runs == 3, runs.isin([4, 5]), runs >= 6],
                        [0, 1, 2, 3, 4, 5], 0)
    return np.where(is_extra, EXTRA, np.where(is_wkt, WICKET, by_runs)).astype(np.int8)


def build_ball_states(deliveries: pd.DataFrame, matches: pd.DataFrame, leagues: pd.DataFrame,
                      bowling_styles: dict[int, str]) -> pd.DataFrame:
    """One row per delivery with the match situation before the ball."""
    fmt_of_league = dict(zip(leagues["league_id"], leagues["format"]))
    m = matches.set_index("match_id")
    d = deliveries.sort_values(["match_id", "innings", "delivery_id"]).copy()
    d["format"] = d["match_id"].map(m["league_id"]).map(fmt_of_league)
    d = d[d["format"].isin(list(FORMATS))]
    d["outcome"] = encode_outcome(d["runs_total"], d.get("extras_type", pd.Series(index=d.index, dtype=object)),
                                  d.get("wicket_type", pd.Series(index=d.index, dtype=object)))
    d["over"] = np.floor(d["over_ball"].astype(float)).astype(int)
    g = d.groupby(["match_id", "innings"], sort=False)
    d["wkts"] = (g["outcome"].transform(lambda s: (s == WICKET).cumsum().shift(fill_value=0))).clip(0, 9)
    d["runs_before"] = g["runs_total"].transform(lambda s: s.fillna(0).cumsum().shift(fill_value=0))
    legal = (d["outcome"] != EXTRA).astype(int)
    d["legal_before"] = legal.groupby([d["match_id"], d["innings"]]).cumsum() - legal
    first_inn_total = d[d["innings"] == 1].groupby("match_id")["runs_total"].sum()
    target = d["match_id"].map(first_inn_total + 1)
    max_balls = d["format"].map(FORMATS) * 6
    need = (target - d["runs_before"]).fillna(0).to_numpy()
    left = (max_balls - d["legal_before"]).to_numpy()
    d["pressure"] = pressure_bucket(need, left, d["innings"].to_numpy())
    d["btype"] = d["bowler_id"].map(lambda b: bowler_type(bowling_styles.get(b))).astype(int)
    d["over"] = d["over"].clip(0, d["format"].map(FORMATS) - 1)
    return d[["match_id", "format", "innings", "over", "wkts", "pressure", "striker_id", "bowler_id",
              "btype", "outcome"]].reset_index(drop=True)


# ── Model ────────────────────────────────────────────────────────────────────

@dataclass
class BallModel:
    context: dict[str, np.ndarray]                       # fmt -> (2, overs, 10, K) probabilities
    batter: dict[int, np.ndarray] = field(default_factory=dict)       # id -> (K,)
    bowler: dict[int, np.ndarray] = field(default_factory=dict)       # id -> (K,)
    batter_vs_type: dict[int, np.ndarray] = field(default_factory=dict)  # id -> (types, K)
    chase: np.ndarray = field(default_factory=lambda: np.ones((N_PRESSURE, K)))
    bowler_usage: dict[int, dict] = field(default_factory=dict)       # id -> {overs_per_match, phase_share}
    version: str = "dev"
    metrics: dict = field(default_factory=dict)

    # ── fitting ──
    @staticmethod
    def _context_table(states: pd.DataFrame, fmt: str) -> np.ndarray:
        overs = FORMATS[fmt]
        s = states[states["format"] == fmt]
        counts = np.zeros((2, overs, 10, K))
        np.add.at(counts, (s["innings"].to_numpy() - 1, s["over"].to_numpy(), s["wkts"].to_numpy(),
                           s["outcome"].to_numpy()), 1)
        global_p = (counts.sum(axis=(0, 1, 2)) + 1) / (counts.sum() + K)
        by_over = counts.sum(axis=2, keepdims=True)                                   # pool wickets
        over_p = (by_over + CONTEXT_PRIOR * global_p) / (by_over.sum(-1, keepdims=True) + CONTEXT_PRIOR)
        return (counts + CONTEXT_PRIOR * over_p) / (counts.sum(-1, keepdims=True) + CONTEXT_PRIOR)

    def _expected(self, s: pd.DataFrame, use: tuple[str, ...]) -> np.ndarray:
        """Model probabilities for each row using only the listed factors."""
        p = np.empty((len(s), K))
        for fmt in FORMATS:
            mask = (s["format"] == fmt).to_numpy()
            if mask.any() and fmt in self.context:
                ss = s[mask]
                p[mask] = self.context[fmt][ss["innings"].to_numpy() - 1, ss["over"].to_numpy(), ss["wkts"].to_numpy()]
        if "chase" in use:
            p *= self.chase[s["pressure"].to_numpy()]
        if "batter" in use:
            p *= _lookup(self.batter, s["striker_id"])
        if "bowler" in use:
            p *= _lookup(self.bowler, s["bowler_id"])
        if "batter_vs_type" in use:
            p *= _lookup_type(self.batter_vs_type, s["striker_id"], s["btype"])
        return p / p.sum(axis=1, keepdims=True)

    @staticmethod
    def _oe(keys: np.ndarray, outcomes: np.ndarray, expected: np.ndarray, shrink: float) -> dict:
        """Shrunk observed/expected multipliers per key."""
        uniq, inv = np.unique(keys, return_inverse=True)
        obs = np.zeros((len(uniq), K))
        np.add.at(obs, (inv, outcomes), 1)
        exp = np.zeros((len(uniq), K))
        np.add.at(exp, inv, expected)
        n = obs.sum(axis=1, keepdims=True)
        q = exp / np.maximum(n, 1)                              # mean expected probability
        mult = (obs + shrink * q) / (exp + shrink * q + 1e-12)
        return dict(zip(uniq.tolist(), mult))

    @classmethod
    def fit(cls, states: pd.DataFrame, version: str = "dev", rounds: int = 2) -> "BallModel":
        states = states[states["striker_id"].notna() & states["bowler_id"].notna()]
        model = cls(context={f: cls._context_table(states, f) for f in FORMATS
                             if (states["format"] == f).any()}, version=version)
        y = states["outcome"].to_numpy()
        # chase pressure first (only 2nd-innings rows carry information)
        chase_rows = states["pressure"].to_numpy() > 0
        if chase_rows.any():
            e = model._expected(states, ())
            mult = cls._oe(states["pressure"].to_numpy()[chase_rows], y[chase_rows], e[chase_rows], SHRINK["chase"])
            for b, m in mult.items():
                model.chase[b] = m
        for _ in range(rounds):
            model.batter = cls._oe(states["striker_id"].to_numpy(), y,
                                   model._expected(states, ("chase", "bowler", "batter_vs_type")), SHRINK["batter"])
            model.bowler = cls._oe(states["bowler_id"].to_numpy(), y,
                                   model._expected(states, ("chase", "batter", "batter_vs_type")), SHRINK["bowler"])
            e = model._expected(states, ("chase", "batter", "bowler"))
            keys = states["striker_id"].to_numpy().astype(np.int64) * 10 + states["btype"].to_numpy()
            flat = cls._oe(keys, y, e, SHRINK["batter_vs_type"])
            vs: dict[int, np.ndarray] = {}
            for key, m in flat.items():
                vs.setdefault(int(key // 10), np.ones((len(BOWLER_TYPES), K)))[int(key % 10)] = m
            model.batter_vs_type = vs
        model.bowler_usage = _bowler_usage(states)
        return model

    # ── evaluation ──
    def log_loss(self, states: pd.DataFrame, use=("chase", "batter", "bowler", "batter_vs_type")) -> float:
        p = self._expected(states, use)
        return float(-np.mean(np.log(np.clip(p[np.arange(len(states)), states["outcome"].to_numpy()], 1e-12, 1))))

    def evaluate(self, states: pd.DataFrame) -> dict:
        full = self.log_loss(states)
        base = self.log_loss(states, ())
        return {"balls": int(len(states)), "log_loss": full, "context_only_log_loss": base,
                "improvement_pct": (base - full) / base * 100 if base else 0.0}

    # ── match tables for the simulator ──
    def match_tables(self, batters: list[int], bowlers: list[int], bowler_types: list[int]) -> np.ndarray:
        """(n_batters, n_bowlers, K) multiplier table for one batting side v one bowling side."""
        bat = np.stack([self.batter.get(b, np.ones(K)) for b in batters])
        bowl = np.stack([self.bowler.get(b, np.ones(K)) for b in bowlers])
        vs = np.stack([[self.batter_vs_type.get(b, np.ones((len(BOWLER_TYPES), K)))[t] for t in bowler_types]
                       for b in batters])
        return bat[:, None, :] * bowl[None, :, :] * vs

    # ── persistence ──
    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        arrays = {f"context_{f}": t for f, t in self.context.items()}
        arrays["chase"] = self.chase
        for name, table in (("batter", self.batter), ("bowler", self.bowler)):
            ids = np.array(sorted(table), dtype=np.int64)
            arrays[f"{name}_ids"] = ids
            arrays[f"{name}_mult"] = np.stack([table[i] for i in ids]) if len(ids) else np.zeros((0, K))
        vids = np.array(sorted(self.batter_vs_type), dtype=np.int64)
        arrays["vs_ids"] = vids
        arrays["vs_mult"] = (np.stack([self.batter_vs_type[i] for i in vids]) if len(vids)
                             else np.zeros((0, len(BOWLER_TYPES), K)))
        meta = {"version": self.version, "metrics": self.metrics,
                "bowler_usage": {str(k): v for k, v in self.bowler_usage.items()}}
        arrays["meta"] = np.frombuffer(json.dumps(meta).encode(), dtype=np.uint8)
        with open(path, "wb") as fh:
            np.savez_compressed(fh, **arrays)

    @classmethod
    def load(cls, path: Path) -> "BallModel":
        z = np.load(path)
        meta = json.loads(bytes(z["meta"]).decode())
        model = cls(
            context={k[len("context_"):]: z[k] for k in z.files if k.startswith("context_")},
            chase=z["chase"], version=meta["version"], metrics=meta.get("metrics", {}),
            bowler_usage={int(k): v for k, v in meta.get("bowler_usage", {}).items()},
        )
        model.batter = dict(zip(z["batter_ids"].tolist(), z["batter_mult"]))
        model.bowler = dict(zip(z["bowler_ids"].tolist(), z["bowler_mult"]))
        model.batter_vs_type = dict(zip(z["vs_ids"].tolist(), z["vs_mult"]))
        return model


def _gather_index(table: dict, ids: pd.Series) -> np.ndarray:
    """Row index into the stacked table for each id; unknown ids → the trailing 'ones' row."""
    idx = pd.Index(list(table)).get_indexer(ids.to_numpy())
    return np.where(idx < 0, len(table), idx)


def _lookup(table: dict, ids: pd.Series) -> np.ndarray:
    stacked = np.vstack([np.stack(list(table.values())) if table else np.zeros((0, K)), np.ones((1, K))])
    return stacked[_gather_index(table, ids)]


def _lookup_type(table: dict, ids: pd.Series, types: pd.Series) -> np.ndarray:
    n_types = len(BOWLER_TYPES)
    stacked = np.concatenate([np.stack(list(table.values())) if table else np.zeros((0, n_types, K)),
                              np.ones((1, n_types, K))])
    return stacked[_gather_index(table, ids), types.to_numpy()]


def _bowler_usage(states: pd.DataFrame) -> dict[int, dict]:
    """Overs per match and share of overs by phase, from history."""
    usage: dict[int, dict] = {}
    for fmt in FORMATS:
        s = states[states["format"] == fmt]
        if s.empty:
            continue
        overs = s.drop_duplicates(["match_id", "innings", "over"])[["match_id", "bowler_id", "over"]]
        overs = overs.assign(phase=phase_of(overs["over"].to_numpy(), fmt))
        per_match = overs.groupby(["bowler_id", "match_id"]).size().groupby("bowler_id").mean()
        share = overs.groupby(["bowler_id", "phase"]).size().unstack(fill_value=0).reindex(columns=[0, 1, 2], fill_value=0)
        share = (share + 1).div(share.sum(axis=1) + 3, axis=0)       # add-one smoothing
        for b in per_match.index:
            usage.setdefault(int(b), {})[fmt] = {
                "overs_per_match": round(float(per_match[b]), 3),
                "phase_share": [round(float(x), 4) for x in share.loc[b].tolist()],
            }
    return usage
