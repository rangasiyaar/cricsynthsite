"""Fit the ball-outcome model from Cricsheet Parquet.

    python -m cricsim.engine fit --parquet data/parquet --out data/models/latest [--cutoff 2024-01-01]

Method: a multinomial log-linear model fitted by penalised iterative proportional fitting.
Each factor update is the Poisson–gamma fixed point

    f = (O + s·m·f_prior) / (B + s·m)        O observed, B expected without this factor,
                                             m = B / n expected per ball, s = prior strength in balls

so a level with little data stays near its prior (1 = league average for players, the
over-level rate for the situation base). Every ball is weighted by recency (half-life 4 years).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import duckdb
import numpy as np
import pyarrow as pa
import pyarrow.compute as pc

from cricsim.engine import states as S
from cricsim.engine.model import (BOWLER_DISMISSALS, DISMISSALS, ERA_START, FORMAT_LIST, GENDERS, MAX_OVERS, N_BASE,
                                  N_DECILES, N_ERA, N_EXP, N_PHASE3, RECENT, SITUATION, Model, base_index, era_index,
                                  N_CHASE_W, chase_w_bucket, exp_bucket, phase3)
from cricsim.patterns.features import build_balls

log = logging.getLogger(__name__)

SHRINK = {  # prior strength, in balls
    "base": 300, "set": 3000, "chase": 3000, "mile": 3000, "streak": 3000, "dots": 3000, "spell": 3000,
    "freehit": 1000, "hand_kind": 3000, "venue": 6000, "venue_g": 1000, "venue_ph": 2000, "venue_kind": 2000, "comp": 6000, "era": 20000, "era_g": 20000, "chase_w": 3000, "collapse": 3000, "bat_switch": 3000, "era_tt": 20000,
    # bat 150 (was 300): backtest at 3 cutoffs, win log-loss better at 2 of 3, Brier -0.0003 on average
    "bat_exp": 3000, "bowl_exp": 3000, "home": 2000, "bat_phase": 1500, "bowl_phase": 1500,
    "bat": 150, "bowl": 300, "bat_fmt": 900, "bowl_fmt": 900, "bat_kind": 900, "bowl_hand": 900,
}
ORDER = ("base", "era", "era_g", "era_tt", "set", "chase", "chase_w", "collapse", "bat_switch", "mile", "streak", "dots", "spell", "freehit", "hand_kind", "venue", "venue_g", "venue_ph", "venue_kind", "comp",
         "home", "bat_exp", "bowl_exp", "bat", "bowl", "bat_fmt", "bowl_fmt", "bat_kind", "bowl_hand",
         "bat_phase", "bowl_phase")


@dataclass
class FitConfig:
    cutoff: date | None = None                 # only balls strictly before this date (backtests)
    min_date: date = date(2004, 1, 1)
    half_life_years: float = 3.0
    passes: int = 4
    collapse: bool = False                     # wickets in the last 12 deliveries (collapses come in bunches)
    bat_switch: bool = True                    # batter's previous match was in the other format family
                                               # (backtest, 3 cutoffs: match Brier -0.0002, -0.0010, -0.0015)
    rule_split: bool = False                   # seasons a competition ran with 12 players a side (Impact Player and
                                               # similar) get their own competition level: '<comp>|ip'
    era_team_type: bool = False                # international and domestic cricket each get their own season trend
    chase_wickets: bool = False                # chase pressure × wickets in hand (a slipping chase with few wickets left)
    phase_skill: bool = False                  # player × stage of innings (powerplay / middle / death), shrunk to the player
    home: bool = True                          # home advantage: batting at home / away / neutral ground
                                               # (backtest, 3 cutoffs: win Brier -0.0003, -0.0021, -0.0012)
    experience: bool = True                    # players with little history: a factor by career balls so far
                                               # (backtest, 3 cutoffs: win Brier -0.005 to -0.011)
    new_ground: bool = False                   # a ground the model has never seen gets the level of grounds in their
                                               # first matches, not the global average (venue audit: new grounds
                                               # scored 2-7% under the model at three cutoffs)
    venue_half_life: float | None = None       # recency half-life (years) for the ground factors only (None = half_life_years)
    era_gender: bool = False                   # men's and women's cricket each get their own season trend (a deviation
                                               # from the shared one, shrunk to it)
    comp_groups: str = "off"                   # a competition's prior = similar competitions (format × gender):
                                               # "club" (leagues only), "all" (internationals too) or "off"
    shrink: dict = field(default_factory=lambda: dict(SHRINK))


OUTCOME_SQL = """CASE WHEN wides > 0 THEN 7 WHEN noballs > 0 THEN 8 WHEN is_wicket THEN 6
                      WHEN runs_batter = 0 AND byes + legbyes > 0 THEN 9
                      WHEN runs_batter >= 6 THEN 5 WHEN runs_batter >= 4 THEN 4 ELSE runs_batter END"""


KIND_SQL = "CASE " + " ".join(
    f"WHEN bowling_kind = 'pace' AND bowling_arm = '{arm}' THEN {S.bowling_kind_index(arm, 'pace')}"
    for arm in ("left", "right")) + " WHEN bowling_kind = 'pace' THEN 1 " + " ".join(
    f"WHEN bowling_kind = '{k}' THEN {i}" for i, k in enumerate(S.BOWLING_KINDS) if i > 2) + " ELSE 0 END"


def _encode(col: pa.ChunkedArray, values: pa.Array, missing: int = 0) -> np.ndarray:
    """Position of each value in `values`; `missing` where absent or null."""
    return pc.fill_null(pc.index_in(col, value_set=values), missing).to_numpy().astype(np.int32)


def load_training(con, cfg: FitConfig) -> tuple[dict[str, np.ndarray], dict[str, list[str]]]:
    where = [f"match_date >= DATE '{cfg.min_date}'"]
    if cfg.cutoff:
        where.append(f"match_date < DATE '{cfg.cutoff}'")
    xp_cols, xp_join = "0 AS bat_xp, 0 AS bowl_xp", ""
    if cfg.experience:      # balls faced / bowled in limited-overs matches before this one (any competition)
        con.execute("""
            CREATE OR REPLACE TEMP TABLE exp_hist AS
            WITH bm AS (
              SELECT batter_id AS pid, match_id, min(match_date) AS d, count(*) FILTER (WHERE wides = 0) AS nb, 0 AS nw
              FROM balls WHERE innings_no IN (1, 2) AND batter_id IS NOT NULL GROUP BY 1, 2
              UNION ALL
              SELECT bowler_id, match_id, min(match_date), 0, count(*) FILTER (WHERE wides = 0 AND noballs = 0)
              FROM balls WHERE innings_no IN (1, 2) AND bowler_id IS NOT NULL GROUP BY 1, 2
            ), pm AS (SELECT pid, match_id, min(d) AS d, sum(nb) AS nb, sum(nw) AS nw FROM bm GROUP BY 1, 2)
            SELECT pid AS xp_pid, match_id AS xp_mid,
                   coalesce(sum(nb) OVER w, 0) AS faced_before, coalesce(sum(nw) OVER w, 0) AS bowled_before
            FROM pm WINDOW w AS (PARTITION BY pid ORDER BY d, match_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)""")
        xp_cols = "coalesce(xb.faced_before, 0) AS bat_xp, coalesce(xw.bowled_before, 0) AS bowl_xp"
        xp_join = ("LEFT JOIN exp_hist xb ON xb.xp_pid = batter_id AND xb.xp_mid = match_id "
                   "LEFT JOIN exp_hist xw ON xw.xp_pid = bowler_id AND xw.xp_mid = match_id")
    home_col, home_join = "2 AS home_state", ""
    if cfg.home:            # a team is at home where it has played at least 3 times and twice as often as its opponent
        cutw = f"AND match_date < DATE '{cfg.cutoff}'" if cfg.cutoff else ""
        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE home_of AS
            WITH tm AS (SELECT DISTINCT match_id, venue_id, batting_team_id AS tid FROM balls
                        WHERE venue_id IS NOT NULL AND batting_team_id IS NOT NULL AND innings_no IN (1, 2) {cutw}),
                 cnt AS (SELECT venue_id, tid, count(*) AS n FROM tm GROUP BY 1, 2),
                 pm AS (SELECT tm.match_id, tm.tid, cnt.n - 1 AS n FROM tm JOIN cnt USING (venue_id, tid)),
                 r AS (SELECT match_id, arg_max(tid, n) AS top, max(n) AS n1, sum(n) - max(n) AS n2, count(*) AS k
                       FROM pm GROUP BY 1)
            SELECT match_id AS h_mid, top AS home_tid FROM r WHERE k = 2 AND n1 >= {HOME_MIN} AND n1 >= 2 * n2""")
        home_col = ("CASE WHEN h.home_tid IS NULL THEN 2 WHEN batting_team_id = h.home_tid THEN 0 ELSE 1 END "
                    "AS home_state")
        home_join = "LEFT JOIN home_of h ON h.h_mid = match_id"
    sw_col, sw_join = "0 AS switch", ""
    if cfg.bat_switch:      # the batter's previous match (any limited-overs format) was in the other family
        con.execute("""
            CREATE OR REPLACE TEMP TABLE bat_prev AS
            WITH pm AS (SELECT batter_id AS pid, match_id, min(match_date) AS d,
                               any_value(CASE WHEN format = 'OD' THEN 1 ELSE 0 END) AS fam
                        FROM balls WHERE innings_no IN (1, 2) AND batter_id IS NOT NULL GROUP BY 1, 2)
            SELECT pid AS sw_pid, match_id AS sw_mid,
                   CASE WHEN lag(fam) OVER (PARTITION BY pid ORDER BY d, match_id) IS NULL THEN 0
                        WHEN lag(fam) OVER (PARTITION BY pid ORDER BY d, match_id) <> fam THEN 1 ELSE 0 END AS switched
            FROM pm""")
        sw_col = "coalesce(sw.switched, 0) AS switch"
        sw_join = "LEFT JOIN bat_prev sw ON sw.sw_pid = batter_id AND sw.sw_mid = match_id"
    ip_on = "TRUE" if cfg.rule_split and _has_table(con, "ip_matches") else "FALSE"
    t = con.execute(f"""
        SELECT format, gender, innings_no, "over", team_wickets_before AS wkts, {xp_cols}, {home_col},
               batter_balls_before AS bf, batter_runs_before AS br,
               coalesce(target_runs - team_runs_before, 0) AS need,
               total_overs * balls_per_over - legal_balls_before AS balls_left,
               coalesce(batter_prev_runs, -1) AS prev_runs, coalesce(batter_prev_boundary, FALSE) AS prev_bnd,
               dots_before, coalesce(spell_start, FALSE) AS spell, coalesce(free_hit, FALSE) AS fh,
               batting_hand, {KIND_SQL} AS kind,
               coalesce(venue_id, '') AS venue,
               coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format)
                 || CASE WHEN {ip_on} AND match_id IN (SELECT match_id FROM ip_matches) THEN '|ip' ELSE '' END AS comp,
               coalesce(team_type, '') AS team_type, batter_id, bowler_id, date_diff('day', DATE '1970-01-01', match_date) AS day, match_id,
               {OUTCOME_SQL} AS y, runs_total, byes + legbyes AS byes,
               coalesce(wkts_last12, 0) AS wl12, {sw_col}
        FROM balls {xp_join} {home_join} {sw_join}
        WHERE innings_no IN (1, 2) AND batter_id IS NOT NULL AND bowler_id IS NOT NULL
          AND gender IN ('male', 'female') AND {' AND '.join(where)}
    """).to_arrow_table()
    players = pc.unique(pa.chunked_array(t["batter_id"].chunks + t["bowler_id"].chunks)).sort()
    venues = pc.unique(pc.filter(t["venue"], pc.not_equal(t["venue"], ""))).sort()
    comps = pc.unique(t["comp"]).sort()
    ids = {"players": [""] + players.to_pylist(), "venues": [""] + venues.to_pylist(), "comps": [""] + comps.to_pylist()}

    np_ = lambda c: t[c].to_numpy()  # noqa: E731
    fmt = _encode(t["format"], pa.array(FORMAT_LIST))
    fam = (fmt == FORMAT_LIST.index("OD")).astype(np.int8)                                   # 0 short, 1 od
    hand = _encode(t["batting_hand"], pa.array(S.HANDS))
    kind = np_("kind").astype(np.int16)
    d = {
        "fmt": fmt, "fam": fam,
        "gender": _encode(t["gender"], pa.array(GENDERS)),
        "inn0": np_("innings_no").astype(np.int8) - 1,
        "over": np.minimum(np_("over"), MAX_OVERS - 1).astype(np.int16),
        "wkts": np.minimum(np_("wkts"), 9).astype(np.int8),
        "bf": np_("bf"), "br": np_("br"), "need": np_("need"), "balls_left": np_("balls_left"),
        "prev_runs": np_("prev_runs"), "prev_bnd": np_("prev_bnd"), "dots": np_("dots_before"),
        "spell": np_("spell").astype(np.int8), "fh": np_("fh").astype(np.int8),
        "hand": hand.astype(np.int8), "kind": kind,
        "venue": _encode(t["venue"], venues, -1) + 1, "comp": _encode(t["comp"], comps, -1) + 1,
        "bat": _encode(t["batter_id"], players) + 1, "bowl": _encode(t["bowler_id"], players) + 1,
        "day": np_("day"), "y": np_("y").astype(np.int8),
        "bat_xp": np_("bat_xp"), "bowl_xp": np_("bowl_xp"), "home_state": np_("home_state").astype(np.int8),
        "match": pc.dictionary_encode(t["match_id"]).combine_chunks().indices.to_numpy().astype(np.int32), "runs_total": np_("runs_total"), "byes": np_("byes"),
        "wl12": np.minimum(np_("wl12"), 3).astype(np.int8), "switch": np_("switch").astype(np.int8),
        "club": (t["team_type"].to_numpy(zero_copy_only=False) == "club").astype(np.int8),
    }
    # competition group: club / international × format × gender (the commonest among the competition's balls)
    tt = _encode(t["team_type"], pa.array(TEAM_TYPES), missing=len(TEAM_TYPES))
    g = (tt.astype(np.int64) * len(FORMAT_LIST) + fmt) * 2 + d["gender"]
    nc = len(ids["comps"])
    counts = np.bincount(d["comp"].astype(np.int64) * N_GROUPS + g, minlength=nc * N_GROUPS).reshape(nc, N_GROUPS)
    group = np.where(counts.sum(1) > 0, counts.argmax(1), -1)
    group[0] = -1
    ids["comp_group"] = group.tolist()
    return d, ids


TEAM_TYPES = ("international", "club")
N_GROUPS = (len(TEAM_TYPES) + 1) * len(FORMAT_LIST) * 2
GROUP_KEYS = [f"{tt}|{f}|{g}" for tt in (*TEAM_TYPES, "unknown") for f in FORMAT_LIST for g in GENDERS]
GROUP_SHRINK = 20000.0    # balls: how much a competition's group counts before the global average takes over

OVERS = np.array([S.FORMAT_RULES[f]["overs"] for f in FORMAT_LIST])
RUNS_ONLY = ("venue_g", "venue_ph", "venue_kind")   # the venue diagnostic: these never carry over for wickets


def level_indices(d: dict[str, np.ndarray], n_players: int, n_venues: int, n_comps: int,
                  phase_skill: bool = False, era_gender: bool = False,
                  chase_wickets: bool = False, collapse: bool = False, bat_switch: bool = False,
                  era_team_type: bool = False) -> dict[str, tuple[np.ndarray, int]]:
    """Factor name → (level index per ball, number of levels). Mirrors simulate.py's state encoding."""
    fam = d["fam"].astype(np.int32)
    nk, nh = len(S.BOWLING_KINDS), len(S.HANDS)

    def per_family(bucket, n):
        return fam * n + bucket, 2 * n

    levels = {
        "base": (base_index(d["fmt"], d["gender"], d["inn0"], d["over"], d["wkts"]).astype(np.int32), N_BASE),
        "set": per_family(S.set_bucket(d["bf"]), SITUATION["set"]),
        "chase": per_family(S.chase_bucket(d["inn0"] + 1, d["need"], d["balls_left"]), SITUATION["chase"]),
        "mile": per_family(S.milestone_bucket(d["br"]), SITUATION["mile"]),
        "streak": per_family(S.streak_bucket(d["prev_runs"], d["prev_bnd"]), SITUATION["streak"]),
        "dots": per_family(S.dots_bucket(d["dots"]), SITUATION["dots"]),
        "spell": per_family(d["spell"].astype(np.int32), 2),
        "freehit": per_family(d["fh"].astype(np.int32), 2),
        "hand_kind": per_family(d["hand"].astype(np.int32) * nk + d["kind"], SITUATION["hand_kind"]),
        "era": (fam * N_ERA + era_index(d["day"]), 2 * N_ERA),
        "venue": (d["venue"], n_venues), "comp": (d["comp"], n_comps),
        "venue_g": (d["venue"] * 2 + d["gender"].astype(np.int32), n_venues * 2),   # men's v women's at a ground
        "venue_ph": (d["venue"] * S.N_VENUE_PHASE + S.venue_phase_bucket(d["over"], OVERS[d["fmt"]]),
                     n_venues * S.N_VENUE_PHASE),
        "venue_kind": (d["venue"] * S.N_KIND_GROUP + S.kind_group(d["kind"]), n_venues * S.N_KIND_GROUP),
        "bat": (d["bat"], n_players), "bowl": (d["bowl"], n_players),
        "bat_fmt": (d["bat"] * 2 + fam, n_players * 2), "bowl_fmt": (d["bowl"] * 2 + fam, n_players * 2),
        "bat_kind": (d["bat"] * nk + d["kind"], n_players * nk),
        "bowl_hand": (d["bowl"] * nh + d["hand"], n_players * nh),
    }
    if era_gender:       # season level × men's / women's (FitConfig.era_gender)
        levels["era_g"] = ((fam * 2 + d["gender"].astype(np.int32)) * N_ERA + era_index(d["day"]), 4 * N_ERA)
    if collapse:         # wickets in the last 12 deliveries, 0-3+ (FitConfig.collapse)
        levels["collapse"] = (fam * 4 + d["wl12"].astype(np.int32), 8)
    if bat_switch:       # batter coming from the other format family (FitConfig.bat_switch)
        levels["bat_switch"] = (fam * 2 + d["switch"].astype(np.int32), 4)
    if era_team_type:    # season level × international / domestic (FitConfig.era_team_type)
        levels["era_tt"] = ((fam * 2 + d["club"].astype(np.int32)) * N_ERA + era_index(d["day"]), 4 * N_ERA)
    if chase_wickets:    # required rate × wickets down in the chase (FitConfig.chase_wickets)
        levels["chase_w"] = (fam * N_CHASE_W + chase_w_bucket(d["inn0"] + 1, d["need"], d["balls_left"], d["wkts"]),
                             2 * N_CHASE_W)
    if phase_skill:      # player × powerplay / middle / death (FitConfig.phase_skill)
        ph = phase3(d["over"], OVERS[d["fmt"]])
        levels["bat_phase"] = (d["bat"] * N_PHASE3 + ph, n_players * N_PHASE3)
        levels["bowl_phase"] = (d["bowl"] * N_PHASE3 + ph, n_players * N_PHASE3)
    if (d["home_state"] != 2).any():                     # home advantage (FitConfig.home)
        levels["home"] = (fam * 3 + d["home_state"].astype(np.int32), 6)
    if np.any(d["bat_xp"]) or np.any(d["bowl_xp"]):     # experience factors (FitConfig.experience)
        levels["bat_exp"] = (fam * N_EXP + exp_bucket(d["bat_xp"]), 2 * N_EXP)
        levels["bowl_exp"] = (fam * N_EXP + exp_bucket(d["bowl_xp"]), 2 * N_EXP)
    return levels


def _softmax(L: np.ndarray, out: np.ndarray) -> np.ndarray:
    np.subtract(L, L.max(axis=1, keepdims=True), out=out)
    np.exp(out, out=out)
    out /= out.sum(axis=1, keepdims=True)
    return out


def _bincount2(idx: np.ndarray, weights: np.ndarray, n: int) -> np.ndarray:
    """(n, K) sums of weights[:, k] by idx."""
    return np.stack([np.bincount(idx, weights=weights[:, k], minlength=n) for k in range(weights.shape[1])], axis=1)


def base_prior(idx: np.ndarray, y: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Log rates for each base cell, pooled over wickets-down then smoothed — the base factor's prior."""
    K = S.K
    counts = np.zeros((N_BASE, K))
    np.add.at(counts, (idx, y), w)
    by = counts.reshape(-1, 10, K)
    overall = (counts.sum(0) + 1) / (counts.sum() + K)
    over = by.sum(1)                                                   # pooled over wickets
    over_p = (over + 50 * overall) / (over.sum(1, keepdims=True) + 50)
    return np.log(np.repeat(over_p, 10, axis=0)).astype(np.float32)


def fit_factors(d: dict[str, np.ndarray], ids: dict[str, list[str]], cfg: FitConfig) -> tuple[dict, dict]:
    n, K = len(d["y"]), S.K
    ref_day = (np.datetime64(cfg.cutoff) - np.datetime64("1970-01-01")).astype(int) if cfg.cutoff else d["day"].max()
    w = (0.5 ** ((ref_day - d["day"]) / (365.25 * cfg.half_life_years))).astype(np.float64)
    levels = level_indices(d, len(ids["players"]), len(ids["venues"]), len(ids["comps"]), cfg.phase_skill,
                           cfg.era_gender, cfg.chase_wickets, cfg.collapse, cfg.bat_switch, cfg.era_team_type)
    priors = {"base": base_prior(levels["base"][0], d["y"], w)}
    logf = {name: priors.get(name, np.zeros((nl, K), dtype=np.float32)).copy() for name, (_, nl) in levels.items()}
    L = logf["base"][levels["base"][0]].astype(np.float32)
    P = np.empty_like(L)
    wv = w if not cfg.venue_half_life else \
        (0.5 ** ((ref_day - d["day"]) / (365.25 * cfg.venue_half_life))).astype(np.float64)
    wt = lambda name: wv if name in VENUE_FACTORS else w  # noqa: E731
    observed = {name: np.bincount(idx * K + d["y"], weights=wt(name), minlength=nl * K).reshape(nl, K)
                for name, (idx, nl) in levels.items()}
    stats = {"balls": n, "passes": []}
    city = np.asarray(ids.get("venue_city") or [-1] * len(ids["venues"]), dtype=np.int64)
    group = np.asarray(ids.get("comp_group") or [-1] * len(ids["comps"]), dtype=np.int64)
    if cfg.comp_groups == "club":       # internationals keep the neutral prior: player ratings already say who is weak
        group = np.where(group // (len(FORMAT_LIST) * 2) == TEAM_TYPES.index("club"), group, -1)
    for it in range(cfg.passes):
        t0 = time.time()
        for name in ORDER:
            if name not in levels:
                continue
            idx, nl = levels[name]
            ww = wt(name)
            if name == "venue":
                priors["venue"] = city_prior(logf["venue"], np.bincount(idx, weights=ww, minlength=nl), city)
            if name == "comp" and cfg.comp_groups != "off":
                priors["comp"] = city_prior(logf["comp"], np.bincount(idx, weights=w, minlength=nl), group, GROUP_SHRINK)
            _softmax(L, P)
            P *= ww[:, None]
            E = _bincount2(idx, P, nl)
            O = observed[name]
            nb = np.bincount(idx, weights=ww, minlength=nl)[:, None]
            f_old = np.exp(logf[name].astype(np.float64))
            B = E / f_old
            m = np.divide(B, nb, out=np.zeros_like(B), where=nb > 0)
            prior = np.exp(priors.get(name, np.zeros_like(B)))
            s = cfg.shrink[name]
            f_new = np.where(nb > 0, (O + s * m * prior) / np.maximum(B + s * m, 1e-12), prior)
            new = np.log(np.maximum(f_new, 1e-6)).astype(np.float32)
            if name in RUNS_ONLY:
                new[:, S.WKT] = 0
            L += (new - logf[name])[idx]
            logf[name] = new
        _softmax(L, P)
        ll = -float((w * np.log(np.maximum(P[np.arange(n), d["y"]], 1e-9))).sum() / w.sum())
        pred = (P * w[:, None]).sum(0) / w.sum()
        obs = np.bincount(d["y"], weights=w, minlength=K) / w.sum()
        stats["passes"].append({"pass": it + 1, "log_loss": round(ll, 5), "seconds": round(time.time() - t0, 1),
                                "pred_wicket": round(float(pred[S.WKT]), 5), "obs_wicket": round(float(obs[S.WKT]), 5)})
        log.info("pass %d: weighted log-loss %.5f (%.0fs)", it + 1, ll, time.time() - t0)
    stats["conditions_sd"] = match_conditions_sd(d, P / w[:, None])
    last = np.array([d["day"].max()]).astype("datetime64[D]")
    stats["era_index"] = int(era_index(last)[0])                            # latest season seen
    stats["era_asof"] = round(float((last - np.datetime64(f"{ERA_START}-01-01")).astype(int)[0]) / 365.25, 3)
    stats["era_balls"] = np.bincount(d["fam"].astype(np.int64) * N_ERA + era_index(d["day"]),
                                     minlength=2 * N_ERA).reshape(2, N_ERA).tolist()
    stats["era_balls_g"] = np.bincount((d["fam"].astype(np.int64) * 2 + d["gender"]) * N_ERA + era_index(d["day"]),
                                       minlength=4 * N_ERA).reshape(4, N_ERA).tolist()
    stats["era_balls_tt"] = np.bincount((d["fam"].astype(np.int64) * 2 + d["club"]) * N_ERA + era_index(d["day"]),
                                        minlength=4 * N_ERA).reshape(4, N_ERA).tolist()
    era = logf["era"].reshape(2, N_ERA, K)
    stats["era_recent"] = {fam_name: {str(2000 + y): {"four": round(float(era[f, y, S.FOUR]), 3),
                                                       "six": round(float(era[f, y, S.SIX]), 3),
                                                       "wicket": round(float(era[f, y, S.WKT]), 3)}
                                      for y in range(max(0, stats["era_index"] - 7), stats["era_index"] + 1)}
                           for f, fam_name in enumerate(S.FAMILY_LIST)}
    log.info("match-to-match conditions sd: %s", stats["conditions_sd"])
    if cfg.comp_groups != "off":
        logf["comp_group"] = group_levels(logf["comp"], np.bincount(d["comp"], weights=w, minlength=len(group)), group)
    # player 0 / venue 0 / comp 0 are "unknown": exactly average
    for name in ("bat", "bowl", "venue", "comp"):
        logf[name][0] = 0
    if cfg.new_ground:
        logf["venue"][0], stats["new_ground"] = new_ground_level(d, L, logf, levels, w, cfg.min_date)
    logf["venue_kind"].reshape(-1, S.N_KIND_GROUP, K)[:, 0] = 0          # bowler type unknown: no adjustment
    logf.update(recent_form(d, L))
    for name in ("bat_phase", "bowl_phase"):
        if name in logf:
            logf[name][:N_PHASE3] = 0
    for name, width in (("venue_g", 2), ("venue_ph", S.N_VENUE_PHASE), ("venue_kind", S.N_KIND_GROUP), ("bat_fmt", 2), ("bowl_fmt", 2), ("bat_kind", len(S.BOWLING_KINDS)), ("bowl_hand", len(S.HANDS))):
        logf[name][:width] = 0
    return logf, stats


VENUE_FACTORS = ("venue", "venue_g", "venue_ph", "venue_kind")
NEW_GROUND_MATCHES = 10   # a ground's first matches stand in for a ground the model has never seen
NEW_GROUND_SHRINK = 5000.0


def new_ground_level(d: dict[str, np.ndarray], L: np.ndarray, logf: dict, levels: dict, w: np.ndarray,
                     min_date) -> tuple[np.ndarray, dict]:
    """Observed ÷ expected outcomes in grounds' first NEW_GROUND_MATCHES matches, with every ground factor taken out
    (what the model predicts for a ground it has never seen), shrunk to 1. Grounds already in use when the data
    starts are left out: their first matches here are not their first matches."""
    K = S.K
    v, m, day = d["venue"].astype(np.int64), d["match"].astype(np.int64), d["day"]
    start = (np.datetime64(min_date) - np.datetime64("1970-01-01")).astype(int) + 730
    key = v * (int(m.max()) + 1) + m
    uk, first = np.unique(key, return_index=True)
    gv, gd = v[first], day[first]
    order = np.lexsort((gd, gv))
    rank = np.empty(len(order), dtype=np.int64)
    bounds = np.r_[0, np.flatnonzero(np.diff(gv[order])) + 1]
    rank[order] = np.arange(len(order)) - np.repeat(bounds, np.diff(np.r_[bounds, len(order)]))
    debut = np.full(int(v.max()) + 1, np.iinfo(np.int64).max)
    np.minimum.at(debut, gv, gd)
    early = uk[(rank < NEW_GROUND_MATCHES) & (gv > 0) & (debut[gv] >= start)]
    sel = np.flatnonzero(np.isin(key, early))
    if not len(sel):
        return np.zeros(K, dtype=np.float32), {"balls": 0}
    Lx = L[sel].copy()
    for name in VENUE_FACTORS:
        if name in levels:
            Lx -= logf[name][levels[name][0][sel]]
    P = np.empty_like(Lx)
    _softmax(Lx, P)
    ws = w[sel]
    O = np.bincount(d["y"][sel], weights=ws, minlength=K)
    E = (P * ws[:, None]).sum(0)
    pbar = E / E.sum()
    ok = (E > 0) & (O > 0)
    lvl = np.zeros(K, dtype=np.float32)
    lvl[ok] = np.log((O[ok] + NEW_GROUND_SHRINK * pbar[ok]) / (E[ok] + NEW_GROUND_SHRINK * pbar[ok]))
    return lvl, {"balls": int(len(sel)), "grounds": int(len(np.unique(v[sel]))),
                 "four": round(float(lvl[S.FOUR]), 4), "six": round(float(lvl[S.SIX]), 4),
                 "wicket": round(float(lvl[S.WKT]), 4)}


FORM_PRIOR = 4.0          # expected boundaries / dismissals: how much evidence recent form needs before it counts


def recent_form(d: dict[str, np.ndarray], L: np.ndarray) -> dict[str, np.ndarray]:
    """Each player's last RECENT matches against what the fitted model expected of him: log(observed / expected)
    boundaries and dismissals, shrunk towards 0 by FORM_PRIOR expected events. (P, 2) for batters and bowlers."""
    P = np.empty_like(L)
    _softmax(L, P)
    bnd = np.isin(d["y"], [S.FOUR, S.SIX]).astype(np.float64)
    wkt = (d["y"] == S.WKT).astype(np.float64)
    e_bnd = P[:, [S.FOUR, S.SIX]].sum(1).astype(np.float64)
    e_wkt = P[:, S.WKT].astype(np.float64)
    out = {}
    for role in ("bat", "bowl"):
        who = d[role].astype(np.int64)
        n = int(who.max()) + 1
        key = who * (int(d["match"].max()) + 1) + d["match"]
        uk, first = np.unique(key, return_index=True)          # one row per (player, match)
        p_of, day = who[first], d["day"][first]
        order = np.lexsort((-day, p_of))                       # each player's matches, newest first
        rank = np.empty(len(order), dtype=np.int64)
        start = np.r_[0, np.flatnonzero(np.diff(p_of[order])) + 1]
        rank[order] = np.arange(len(order)) - np.repeat(start, np.diff(np.r_[start, len(order)]))
        recent = np.isin(key, uk[rank < RECENT])
        f = np.zeros((n, 2), dtype=np.float32)
        for k, (o, e) in enumerate(((bnd, e_bnd), (wkt, e_wkt))):
            O = np.bincount(who[recent], weights=o[recent], minlength=n)
            E = np.bincount(who[recent], weights=e[recent], minlength=n)
            f[:, k] = np.log((O + FORM_PRIOR) / (E + FORM_PRIOR))
        f[0] = 0
        out[f"form_{role}"] = f
    return out


CITY_SHRINK = 6000.0      # balls: how much other grounds in the same city count before the global average takes over


def group_levels(f: np.ndarray, balls: np.ndarray, group: np.ndarray) -> np.ndarray:
    """Each competition group's level (ball-weighted over its competitions), shrunk to the global average:
    the competition factor for a competition the model has never seen."""
    ok = group >= 0
    out = np.zeros((N_GROUPS, f.shape[1]), dtype=np.float64)
    wf = balls[ok, None] * f[ok].astype(np.float64)
    for k in range(f.shape[1]):
        out[:, k] = np.bincount(group[ok], weights=wf[:, k], minlength=N_GROUPS)
    out /= (np.bincount(group[ok], weights=balls[ok], minlength=N_GROUPS) + GROUP_SHRINK)[:, None]
    return out.astype(np.float32)


def city_prior(f: np.ndarray, balls: np.ndarray, city: np.ndarray, shrink: float = CITY_SHRINK) -> np.ndarray:
    """Each ground's prior = the ball-weighted venue factor of the other grounds in its city (itself left out),
    shrunk to the global average. A ground with little history then leans on its neighbours, not on the world.
    (Competitions use the same pooling with their group in place of the city.)"""
    ok = (city >= 0) & (np.arange(len(city)) > 0)
    if not ok.any():
        return np.zeros_like(f)
    nc = int(city[ok].max()) + 1
    c = np.where(ok, city, nc)
    wf = balls[:, None] * f.astype(np.float64)
    S_ = np.stack([np.bincount(c, weights=wf[:, k], minlength=nc + 1) for k in range(f.shape[1])], axis=1)
    N_ = np.bincount(c, weights=balls, minlength=nc + 1)
    prior = (S_[c] - wf) / (N_[c] - balls + shrink)[:, None]
    prior[~ok] = 0
    return prior.astype(np.float32)


def match_conditions_sd(d: dict[str, np.ndarray], P: np.ndarray) -> dict[str, float]:
    """Spread of match-level conditions the ball model can't see (pitch, weather, ground size).

    For each match, observed ÷ expected boundaries (and wickets) under the fitted model. Pure chance
    gives var(O/E) ≈ 1/E; anything beyond that is real match-to-match variation, which the
    simulator re-creates with one random 'conditions' draw per simulated match.
    """
    out = {}
    m = d["match"]
    nm = int(m.max()) + 1
    mi = m.astype(np.int64) * 2 + d["inn0"].astype(np.int64)            # one cell per innings
    for name, classes in (("boundary", [S.FOUR, S.SIX]), ("wicket", [S.WKT])):
        hit = np.isin(d["y"], classes).astype(np.float64)
        ex = P[:, classes].sum(1).astype(np.float64)
        O = np.bincount(m, weights=hit, minlength=nm)
        E = np.bincount(m, weights=ex, minlength=nm)
        ok = E > 5
        r = O[ok] / E[ok]
        extra = r.var() - np.mean(1.0 / E[ok])
        out[name] = round(float(np.sqrt(max(extra, 0.0))), 4)
        # split by innings: the part both innings share (pitch, weather) is the covariance between a match's two
        # innings; what's left of each innings' spread beyond chance is that side's day
        Oi = np.bincount(mi, weights=hit, minlength=2 * nm).reshape(nm, 2)
        Ei = np.bincount(mi, weights=ex, minlength=2 * nm).reshape(nm, 2)
        both = (Ei > 3).all(1)
        if both.sum() > 50:
            ri = Oi[both] / Ei[both]
            shared = float(np.cov(ri[:, 0], ri[:, 1])[0, 1])
            own = float(ri.var(0).mean() - np.mean(1.0 / Ei[both]) - shared)
            out[f"{name}_shared"] = round(float(np.sqrt(max(shared, 0.0))), 4)
            out[f"{name}_innings"] = round(float(np.sqrt(max(own, 0.0))), 4)
    return out


def _tables(con, cfg: FitConfig, ids: dict[str, list[str]], parquet: Path) -> dict:
    """Usage, batting positions, dismissal kinds, extras runs, player meta."""
    cut = f"AND match_date < DATE '{cfg.cutoff}'" if cfg.cutoff else ""
    ref = f"DATE '{cfg.cutoff or con.execute('SELECT max(match_date) FROM balls').fetchone()[0]}'"
    wexpr = f"pow(0.5, date_diff('day', match_date, {ref}) / (365.25 * {cfg.half_life_years}))"
    pidx = {p: i for i, p in enumerate(ids["players"])}
    P = len(ids["players"])
    fam_sql = "CASE WHEN format = 'OD' THEN 1 ELSE 0 END"

    usage = np.zeros((P, 2, N_DECILES), dtype=np.float32)
    for pid, fam, dec, ov in con.execute(f"""
        SELECT bowler_id, {fam_sql}, least(CAST(floor(10.0 * "over" / total_overs) AS INT), 9), sum({wexpr})
        FROM (SELECT DISTINCT match_id, innings_no, "over", bowler_id, format, total_overs, match_date FROM balls
              WHERE innings_no IN (1, 2) AND bowler_id IS NOT NULL {cut})
        GROUP BY ALL""").fetchall():
        if pid in pidx:
            usage[pidx[pid], fam, dec] = ov

    mp = (parquet / "match_players" / "*.parquet").as_posix()
    mt = (parquet / "matches" / "*.parquet").as_posix()
    appearances = np.zeros((P, 2), dtype=np.float32)
    for pid, fam, wsum in con.execute(f"""
        SELECT p.player_id, {fam_sql.replace('format', 'm.format')}, sum({wexpr.replace('match_date', 'm.match_date')})
        FROM read_parquet('{mp}') p JOIN read_parquet('{mt}') m USING (match_id)
        WHERE m.format IN ('T20', 'T10', 'HUNDRED', 'OD') {cut.replace('match_date', 'm.match_date')}
        GROUP BY ALL""").fetchall():
        if pid in pidx:
            appearances[pidx[pid], fam] = wsum
    usage /= np.maximum(appearances, 1)[:, :, None]

    # the same by team-sheet slot (1..11): how much a player listed there usually bowls — the prior for players
    # the model has barely seen (a newcomer listed at 9 is very likely a frontline bowler)
    usage_slot = np.zeros((2, 11, N_DECILES), dtype=np.float32)
    slot_apps = np.zeros((2, 11), dtype=np.float64)
    for fam, pos, wsum in con.execute(f"""
        SELECT {fam_sql.replace('format', 'm.format')}, least(p.list_order, 11), sum({wexpr.replace('match_date', 'm.match_date')})
        FROM read_parquet('{mp}') p JOIN read_parquet('{mt}') m USING (match_id)
        WHERE m.format IN ('T20', 'T10', 'HUNDRED', 'OD') AND p.list_order >= 1 {cut.replace('match_date', 'm.match_date')}
        GROUP BY ALL""").fetchall():
        slot_apps[fam, pos - 1] = wsum
    for fam, pos, dec, ov in con.execute(f"""
        SELECT {fam_sql}, least(p.list_order, 11), least(CAST(floor(10.0 * o."over" / o.total_overs) AS INT), 9), sum({wexpr})
        FROM (SELECT DISTINCT match_id, innings_no, "over", bowler_id, format, total_overs, match_date FROM balls
              WHERE innings_no IN (1, 2) AND bowler_id IS NOT NULL {cut}) o
        JOIN read_parquet('{mp}') p ON p.match_id = o.match_id AND p.player_id = o.bowler_id
        WHERE p.list_order >= 1
        GROUP BY ALL""").fetchall():
        usage_slot[fam, pos - 1, dec] = ov
    usage_slot /= np.maximum(slot_apps, 1)[:, :, None]

    bat_pos = np.zeros((P, 2), dtype=np.float32)
    for pid, fam, pos in con.execute(f"""
        WITH ent AS (
          SELECT match_id, innings_no, format, match_date, pid, min(seq * 2 + ns) AS first
          FROM (SELECT match_id, innings_no, format, match_date, batter_id AS pid, seq, 0 AS ns FROM balls
                UNION ALL
                SELECT match_id, innings_no, format, match_date, non_striker_id, seq, 1 FROM balls)
          WHERE pid IS NOT NULL AND innings_no IN (1, 2) {cut}
          GROUP BY ALL
        ), r AS (
          SELECT *, row_number() OVER (PARTITION BY match_id, innings_no ORDER BY first) AS pos FROM ent
        )
        SELECT pid, {fam_sql}, sum(pos * {wexpr}) / sum({wexpr}) FROM r GROUP BY ALL""").fetchall():
        if pid in pidx:
            bat_pos[pidx[pid], fam] = pos

    # when in the innings each player usually walks in (share of the innings' balls gone), from number 3 down:
    # finishers held back, pinch-hitters sent up, the tail protected. Also the same per batting position.
    entry_frac = np.full((P, 2), -1.0, dtype=np.float32)
    pos_entry = np.zeros((2, 11), dtype=np.float32)
    ent_sql = f"""
        WITH ent AS (
          SELECT match_id, innings_no, format, match_date, pid, min(seq * 2 + ns) AS first,
                 arg_min(lb, seq * 2 + ns) AS lb, any_value(tot) AS tot
          FROM (SELECT match_id, innings_no, format, match_date, batter_id AS pid, seq, 0 AS ns,
                       legal_balls_before AS lb, total_overs * balls_per_over AS tot FROM balls
                UNION ALL
                SELECT match_id, innings_no, format, match_date, non_striker_id, seq, 1,
                       legal_balls_before, total_overs * balls_per_over FROM balls)
          WHERE pid IS NOT NULL AND innings_no IN (1, 2) {cut}
          GROUP BY ALL
        ), r AS (
          SELECT *, row_number() OVER (PARTITION BY match_id, innings_no ORDER BY first) AS pos,
                 least(lb / tot, 1.0) AS frac FROM ent
        )"""
    for pid, fam, fr, n in con.execute(ent_sql + f"""
        SELECT pid, {fam_sql}, sum(frac * {wexpr}) / sum({wexpr}), count(*) FROM r WHERE pos >= 3
        GROUP BY ALL""").fetchall():
        if pid in pidx and n >= ENTRY_MIN:
            entry_frac[pidx[pid], fam] = fr
    for fam, pos, fr in con.execute(ent_sql + f"""
        SELECT {fam_sql}, pos, avg(frac) FROM r WHERE pos <= 11 GROUP BY ALL""").fetchall():
        pos_entry[fam, pos - 1] = fr

    # the same over each player's last RECENT innings / matches: their current role (promoted to open, new frontliner)
    bat_pos_recent = np.zeros((P, 2), dtype=np.float32)
    for pid, fam, pos in con.execute(f"""
        WITH ent AS (
          SELECT match_id, innings_no, format, match_date, pid, min(seq * 2 + ns) AS first
          FROM (SELECT match_id, innings_no, format, match_date, batter_id AS pid, seq, 0 AS ns FROM balls
                UNION ALL
                SELECT match_id, innings_no, format, match_date, non_striker_id, seq, 1 FROM balls)
          WHERE pid IS NOT NULL AND innings_no IN (1, 2) {cut}
          GROUP BY ALL
        ), r AS (
          SELECT *, row_number() OVER (PARTITION BY match_id, innings_no ORDER BY first) AS pos FROM ent
        ), k AS (
          SELECT *, {fam_sql} AS fam, row_number() OVER (PARTITION BY pid, {fam_sql} ORDER BY match_date DESC, match_id DESC) AS rk
          FROM r
        )
        SELECT pid, fam, avg(pos) FROM k WHERE rk <= {RECENT} GROUP BY ALL""").fetchall():
        if pid in pidx:
            bat_pos_recent[pidx[pid], fam] = pos
    usage_recent = np.zeros((P, 2, N_DECILES), dtype=np.float32)
    recent_n = np.zeros((P, 2), dtype=np.float32)
    rq = f"""
        WITH r AS (
          SELECT p.player_id AS pid, {fam_sql.replace('format', 'm.format')} AS fam, m.match_id,
                 row_number() OVER (PARTITION BY p.player_id, {fam_sql.replace('format', 'm.format')}
                                    ORDER BY m.match_date DESC, m.match_id DESC) AS rk
          FROM read_parquet('{mp}') p JOIN read_parquet('{mt}') m USING (match_id)
          WHERE m.format IN ('T20', 'T10', 'HUNDRED', 'OD') AND p.player_id IS NOT NULL {cut.replace('match_date', 'm.match_date')}
        ) SELECT * FROM r WHERE rk <= {RECENT}"""
    for pid, fam, c in con.execute(f"SELECT pid, fam, count(*) FROM ({rq}) GROUP BY ALL").fetchall():
        if pid in pidx:
            recent_n[pidx[pid], fam] = c
    for pid, fam, dec, ov in con.execute(f"""
        SELECT o.bowler_id, rr.fam, least(CAST(floor(10.0 * o."over" / o.total_overs) AS INT), 9), count(*)
        FROM (SELECT DISTINCT match_id, innings_no, "over", bowler_id, total_overs FROM balls
              WHERE innings_no IN (1, 2) AND bowler_id IS NOT NULL {cut}) o
        JOIN ({rq}) rr ON rr.pid = o.bowler_id AND rr.match_id = o.match_id
        GROUP BY ALL""").fetchall():
        if pid in pidx:
            usage_recent[pidx[pid], fam, dec] = ov
    usage_recent /= np.maximum(recent_n, 1)[:, :, None]

    dismissal = np.ones((2, len(S.BOWLING_KINDS), len(DISMISSALS)), dtype=np.float64) * 0.5
    kinds = {k: i for i, k in enumerate(DISMISSALS)}
    ro_ns = ro_all = 0.0
    for fam, arm, bk, wk, out_is_ns, cnt in con.execute(f"""
        SELECT {fam_sql}, bowling_arm, bowling_kind, wicket_kind, player_out_id = non_striker_id, sum({wexpr})
        FROM balls WHERE is_wicket AND innings_no IN (1, 2) {cut} GROUP BY ALL""").fetchall():
        dismissal[fam, S.bowling_kind_index(arm, bk), kinds.get(wk, kinds["other"])] += cnt
        if wk == "run out":
            ro_all += cnt
            ro_ns += cnt if out_is_ns else 0
    dismissal /= dismissal.sum(-1, keepdims=True)

    wide_runs = np.ones((2, 5)) * 0.1
    bye_runs = np.ones((2, 4)) * 0.1
    for fam, wd, byes, rt, cnt in con.execute(f"""
        SELECT {fam_sql}, wides, byes + legbyes, runs_total, sum({wexpr}) FROM balls
        WHERE innings_no IN (1, 2) AND (wides > 0 OR (byes + legbyes > 0 AND runs_batter = 0 AND noballs = 0)) {cut}
        GROUP BY ALL""").fetchall():
        if wd > 0:
            wide_runs[fam, min(max(rt, 1), 5) - 1] += cnt
        else:
            bye_runs[fam, min(max(byes, 1), 4) - 1] += cnt
    wide_runs /= wide_runs.sum(1, keepdims=True)
    bye_runs /= bye_runs.sum(1, keepdims=True)

    career = np.zeros((P, 2), dtype=np.float32)            # balls faced / bowled so far (unweighted, any competition)
    for col, k, legal in (("batter_id", 0, "wides = 0"), ("bowler_id", 1, "wides = 0 AND noballs = 0")):
        for pid, n in con.execute(f"""SELECT {col}, count(*) FILTER (WHERE {legal}) FROM balls
                                       WHERE innings_no IN (1, 2) AND {col} IS NOT NULL {cut} GROUP BY 1""").fetchall():
            if pid in pidx:
                career[pidx[pid], k] = n
    faced = np.zeros((P, 2), dtype=np.float32)
    bowled = np.zeros((P, 2), dtype=np.float32)
    last = np.zeros(P, dtype=np.int32)
    last_fam = np.full(P, -1, dtype=np.int8)
    last_bat = np.zeros(P, dtype=np.int32)
    for role, arr in (("batter_id", faced), ("bowler_id", bowled)):
        for pid, fam, n, lastday in con.execute(f"""
            SELECT {role}, {fam_sql}, sum(CASE WHEN wides = 0 THEN {wexpr} ELSE 0 END),
                   max(date_diff('day', DATE '1970-01-01', match_date))
            FROM balls WHERE innings_no IN (1, 2) AND {role} IS NOT NULL {cut} GROUP BY ALL""").fetchall():
            if pid in pidx:
                i = pidx[pid]
                arr[i, fam] = n
                last[i] = max(last[i], lastday)
                if role == "batter_id" and lastday >= last_bat[i]:
                    last_bat[i], last_fam[i] = lastday, fam

    fielding = _fielding_shares(con, parquet, pidx, cut.replace("match_date", "m.match_date"),
                                wexpr.replace("match_date", "m.match_date"))

    names = list(ids["players"])
    hand = np.zeros(P, dtype=np.int8)
    kind = np.zeros(P, dtype=np.int8)
    pl = parquet / "players"
    if any(pl.glob("*.parquet")):
        for pid, name in con.execute(f"SELECT player_id, name FROM read_parquet('{(pl / '*.parquet').as_posix()}')").fetchall():
            if pid in pidx:
                names[pidx[pid]] = name
    at = parquet / "attributes" / "attributes.parquet"
    if at.exists():
        for pid, h, a, k in con.execute(f"""SELECT player_id, batting_hand, bowling_arm, bowling_kind
                                             FROM read_parquet('{at.as_posix()}')""").fetchall():
            if pid in pidx:
                hand[pidx[pid]] = S.hand_index(h)
                kind[pidx[pid]] = S.bowling_kind_index(a, k)
    names[0] = "Newcomer"
    return {"usage": usage, "usage_slot": usage_slot, "usage_recent": usage_recent, "recent_n": recent_n,
            "bat_pos_recent": bat_pos_recent, "career_balls": career, "appearances": appearances, "bat_pos": bat_pos, "dismissal": dismissal.astype(np.float32),
            "runout_non_striker": ro_ns / ro_all if ro_all else 0.4,
            "wide_runs": wide_runs.astype(np.float32), "bye_runs": bye_runs.astype(np.float32),
            "balls_faced": faced, "balls_bowled": bowled, "last_played": last, "last_fam": last_fam, "names": names,
            "entry_frac": entry_frac, "pos_entry": pos_entry, "fielding": fielding,
            "hand": hand, "kind": kind}


FIELD_EVENTS = ("caught", "stumped", "run out")
FIELD_PRIOR = 15.0                                     # team events of pseudo-data at an even 1/11 share


def _fielding_shares(con, parquet: Path, pidx: dict[str, int], cut: str, wexpr: str) -> np.ndarray | None:
    """(P, 3) each player's share of his side's catches, stumpings and run-out involvements while on the field
    (recency-weighted, shrunk to 1/11). Caught-and-bowled counts as a catch by the bowler. For fantasy fielding
    points: the simulation knows how many catches its bowlers earn, not who held them."""
    wk, inn = parquet / "wickets", parquet / "innings"
    if not any(wk.glob("*.parquet")) or not any(inn.glob("*.parquet")):
        return None
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    mt = (parquet / "matches" / "*.parquet").as_posix()
    rows = con.execute(f"""
        WITH ev AS (
          SELECT w.match_id, i.team AS bat_team,
                 CASE WHEN w.kind IN ('caught', 'caught and bowled') THEN 0 WHEN w.kind = 'stumped' THEN 1 ELSE 2 END AS k,
                 CASE WHEN w.kind = 'caught and bowled' THEN [w.bowler_id] ELSE w.fielder_ids END AS f
          FROM read_parquet('{(wk / "*.parquet").as_posix()}') w
          JOIN read_parquet('{(inn / "*.parquet").as_posix()}') i USING (match_id, innings_no)
          WHERE w.kind IN ('caught', 'caught and bowled', 'stumped', 'run out') AND NOT w.is_super_over),
        tot AS (SELECT match_id, bat_team, k, count(*) AS n FROM ev GROUP BY ALL),
        mine AS (SELECT match_id, k, pid, count(*) AS n FROM (SELECT match_id, k, unnest(f) AS pid FROM ev) GROUP BY ALL),
        pm AS (SELECT p.match_id, p.team, p.player_id, {wexpr} AS w
               FROM read_parquet('{mp}') p JOIN read_parquet('{mt}') m USING (match_id)
               WHERE m.format IN ('T20', 'T10', 'HUNDRED', 'OD') {cut})
        SELECT pm.player_id, t.k, sum(pm.w * coalesce(mi.n, 0)), sum(pm.w * t.n)
        FROM pm JOIN tot t ON t.match_id = pm.match_id AND t.bat_team <> pm.team
        LEFT JOIN mine mi ON mi.match_id = pm.match_id AND mi.k = t.k AND mi.pid = pm.player_id
        GROUP BY ALL""").fetchall()
    num = np.zeros((len(pidx), 3), dtype=np.float64)
    den = np.zeros((len(pidx), 3), dtype=np.float64)
    for pid, k, a, b in rows:
        if pid in pidx:
            num[pidx[pid], k], den[pidx[pid], k] = a, b
    return ((num + FIELD_PRIOR / 11) / (den + FIELD_PRIOR)).astype(np.float32)


def _catalog(con, cfg: FitConfig, ids: dict[str, list[str]], parquet: Path) -> dict:
    """Display names and recency for venues, competitions and teams (for the analytics endpoints)."""
    mt = parquet / "matches"
    if not any(mt.glob("*.parquet")):
        return {"venues": {}, "comps": {}, "teams": {}, "player_gender": ""}
    m = f"read_parquet('{(mt / '*.parquet').as_posix()}')"
    cut = f"AND match_date < DATE '{cfg.cutoff}'" if cfg.cutoff else ""
    lim = f"format IN ('T20', 'T10', 'HUNDRED', 'OD') AND match_date >= DATE '{cfg.min_date}' {cut}"
    known_v, known_c = set(ids["venues"]), set(ids["comps"])
    venues = {v: {"name": n, "city": c, "matches": k, "last": str(d)} for v, n, c, k, d in con.execute(f"""
        SELECT venue_id, any_value(venue), any_value(city), count(*), max(match_date) FROM {m}
        WHERE {lim} AND venue_id IS NOT NULL GROUP BY 1""").fetchall() if v in known_v}
    comps = {c: {"name": n, "format": f, "gender": g, "matches": k, "last": str(d)} for c, n, f, g, k, d in con.execute(f"""
        SELECT coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format),
               coalesce(any_value(competition), 'International ' || any_value(format)), any_value(format),
               any_value(gender), count(*), max(match_date) FROM {m} WHERE {lim} GROUP BY 1""").fetchall()
        if c in known_c}
    teams: dict[str, dict] = {}
    mp = parquet / "match_players"
    rows = con.execute(f"""
        WITH t AS (SELECT team1_id AS tid, team1 AS name, match_id, match_date, format, gender FROM {m} WHERE {lim}
                   UNION ALL SELECT team2_id, team2, match_id, match_date, format, gender FROM {m} WHERE {lim}),
             r AS (SELECT *, row_number() OVER (PARTITION BY tid, format ORDER BY match_date DESC) AS rk FROM t
                   WHERE tid IS NOT NULL)
        SELECT tid, format, any_value(name), any_value(gender), count(*), max(match_date),
               arg_max(match_id, match_date) FROM r GROUP BY 1, 2""").fetchall()
    last_ids = {mid for *_, mid in rows}
    xi: dict[tuple[str, str], list[str]] = {}
    if any(mp.glob("*.parquet")) and last_ids:
        ph = ",".join(f"'{x}'" for x in last_ids)
        for mid, tid, pid in con.execute(f"""
            SELECT match_id, team_id, player_id FROM read_parquet('{(mp / '*.parquet').as_posix()}')
            WHERE match_id IN ({ph}) ORDER BY match_id, team_id, list_order""").fetchall():
            xi.setdefault((mid, tid), []).append(pid)
    gender = ["u"] * len(ids["players"])
    if any(mp.glob("*.parquet")):
        pidx = {p: i for i, p in enumerate(ids["players"])}
        for pid, g in con.execute(f"""
            SELECT p.player_id, mode(m.gender) FROM read_parquet('{(mp / '*.parquet').as_posix()}') p
            JOIN {m} m USING (match_id) WHERE {lim.replace('format', 'm.format').replace('match_date', 'm.match_date')}
            GROUP BY 1""").fetchall():
            if pid in pidx and g:
                gender[pidx[pid]] = g[0]
    for tid, fmt, name, g, k, d, mid in rows:
        e = teams.setdefault(tid, {"name": name, "gender": g, "formats": {}})
        e["formats"][fmt] = {"matches": k, "last": str(d), "last_xi": xi.get((mid, tid), [])}
    return {"venues": venues, "comps": comps, "teams": teams, "player_gender": "".join(gender)}


ENTRY_MIN = 3             # innings at number 3 or lower before a player's usual entry point counts
def _has_table(con, name: str) -> bool:
    return bool(con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]).fetchone()[0])


def ip_matches(con, parquet: Path) -> None:
    """Matches where both sides list more than 11 players (an Impact Player or other substitute rule)."""
    mp = parquet / "match_players"
    if not any(mp.glob("*.parquet")):
        con.execute("CREATE OR REPLACE TEMP TABLE ip_matches (match_id VARCHAR)")
        return
    con.execute(f"""CREATE OR REPLACE TEMP TABLE ip_matches AS
        SELECT match_id FROM (SELECT match_id, team, count(*) AS n FROM read_parquet('{(mp / '*.parquet').as_posix()}')
                              GROUP BY 1, 2) GROUP BY 1 HAVING min(n) > 11""")


HOME_MIN = 3              # matches at a ground before it counts as a team's home


def _home_counts(con, cfg: FitConfig, parquet: Path) -> dict[str, dict[str, int]]:
    """Ground → {team name: matches there} (teams with HOME_MIN+), so a fixture can tell who is at home."""
    mt = parquet / "matches"
    if not any(mt.glob("*.parquet")):
        return {}
    cut = f"AND match_date < DATE '{cfg.cutoff}'" if cfg.cutoff else ""
    out: dict[str, dict[str, int]] = {}
    for v, team, n in con.execute(f"""
        SELECT venue_id, team, count(*) FROM (
          SELECT venue_id, team1 AS team, match_date FROM read_parquet('{(mt / '*.parquet').as_posix()}')
          UNION ALL SELECT venue_id, team2, match_date FROM read_parquet('{(mt / '*.parquet').as_posix()}'))
        WHERE venue_id IS NOT NULL AND team IS NOT NULL {cut} GROUP BY 1, 2 HAVING count(*) >= {HOME_MIN}""").fetchall():
        out.setdefault(v, {})[team] = int(n)
    return out


def venue_cities(parquet: Path, venues: list[str], con) -> list[int]:
    """City index per ground (-1 = unknown), for the same-city venue prior."""
    m = (parquet / "matches" / "*.parquet").as_posix()
    try:
        rows = dict(con.execute(f"SELECT venue_id, lower(trim(any_value(city))) FROM read_parquet('{m}') "
                                "WHERE venue_id IS NOT NULL AND city IS NOT NULL GROUP BY 1").fetchall())
    except duckdb.Error:
        return [-1] * len(venues)
    names: dict[str, int] = {}
    return [names.setdefault(rows[v], len(names)) if rows.get(v) else -1 for v in venues]


def fit(parquet: Path, cfg: FitConfig | None = None, memory: str = "4GB", con=None) -> Model:
    cfg = cfg or FitConfig()
    con = con or duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    con.execute("SET preserve_insertion_order=false")
    if not con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = 'balls'").fetchone()[0]:
        attrs = parquet / "attributes" / "attributes.parquet"
        build_balls(con, parquet, attrs if attrs.exists() else None)
    ip_matches(con, parquet)
    d, ids = load_training(con, cfg)
    ids["venue_city"] = venue_cities(parquet, ids["venues"], con)
    log.info("training on %d balls, %d players", len(d["y"]), len(ids["players"]))
    home_counts = _home_counts(con, cfg, parquet) if cfg.home else {}
    factors, stats = fit_factors(d, ids, cfg)
    tables = _tables(con, cfg, ids, parquet)
    ro = tables.pop("runout_non_striker")
    names = tables.pop("names")
    return Model(factors=factors, players=ids["players"], venues=ids["venues"], comps=ids["comps"], names=names,
                 runout_non_striker=ro,
                 meta={"cutoff": str(cfg.cutoff) if cfg.cutoff else None, "half_life_years": cfg.half_life_years,
                       "comp_groups": GROUP_KEYS if cfg.comp_groups != "off" else None, "experience": cfg.experience,
                       "rule_split": cfg.rule_split,
                       "home_counts": home_counts,
                       "fit": stats, "bowler_dismissals": BOWLER_DISMISSALS.tolist(),
                       "catalog": _catalog(con, cfg, ids, parquet)},
                 **tables)
