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
from cricsim.engine.model import (BOWLER_DISMISSALS, DISMISSALS, FORMAT_LIST, GENDERS, MAX_OVERS, N_BASE, N_DECILES,
                                  N_ERA, SITUATION, Model, base_index, era_index)
from cricsim.patterns.features import build_balls

log = logging.getLogger(__name__)

SHRINK = {  # prior strength, in balls
    "base": 300, "set": 3000, "chase": 3000, "mile": 3000, "streak": 3000, "dots": 3000, "spell": 3000,
    "freehit": 1000, "hand_kind": 3000, "venue": 6000, "comp": 6000, "era": 20000,
    "bat": 300, "bowl": 300, "bat_fmt": 900, "bowl_fmt": 900, "bat_kind": 900, "bowl_hand": 900,
}
ORDER = ("base", "era", "set", "chase", "mile", "streak", "dots", "spell", "freehit", "hand_kind", "venue", "comp",
         "bat", "bowl", "bat_fmt", "bowl_fmt", "bat_kind", "bowl_hand")


@dataclass
class FitConfig:
    cutoff: date | None = None                 # only balls strictly before this date (backtests)
    min_date: date = date(2004, 1, 1)
    half_life_years: float = 3.0
    passes: int = 4
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
    t = con.execute(f"""
        SELECT format, gender, innings_no, "over", team_wickets_before AS wkts,
               batter_balls_before AS bf, batter_runs_before AS br,
               coalesce(target_runs - team_runs_before, 0) AS need,
               total_overs * balls_per_over - legal_balls_before AS balls_left,
               coalesce(batter_prev_runs, -1) AS prev_runs, coalesce(batter_prev_boundary, FALSE) AS prev_bnd,
               dots_before, coalesce(spell_start, FALSE) AS spell, coalesce(free_hit, FALSE) AS fh,
               batting_hand, {KIND_SQL} AS kind,
               coalesce(venue_id, '') AS venue,
               coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format) AS comp,
               batter_id, bowler_id, date_diff('day', DATE '1970-01-01', match_date) AS day, match_id,
               {OUTCOME_SQL} AS y, runs_total, byes + legbyes AS byes
        FROM balls
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
        "match": pc.dictionary_encode(t["match_id"]).combine_chunks().indices.to_numpy().astype(np.int32), "runs_total": np_("runs_total"), "byes": np_("byes"),
    }
    return d, ids


def level_indices(d: dict[str, np.ndarray], n_players: int, n_venues: int, n_comps: int) -> dict[str, tuple[np.ndarray, int]]:
    """Factor name → (level index per ball, number of levels). Mirrors simulate.py's state encoding."""
    fam = d["fam"].astype(np.int32)
    nk, nh = len(S.BOWLING_KINDS), len(S.HANDS)

    def per_family(bucket, n):
        return fam * n + bucket, 2 * n

    return {
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
        "bat": (d["bat"], n_players), "bowl": (d["bowl"], n_players),
        "bat_fmt": (d["bat"] * 2 + fam, n_players * 2), "bowl_fmt": (d["bowl"] * 2 + fam, n_players * 2),
        "bat_kind": (d["bat"] * nk + d["kind"], n_players * nk),
        "bowl_hand": (d["bowl"] * nh + d["hand"], n_players * nh),
    }


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
    levels = level_indices(d, len(ids["players"]), len(ids["venues"]), len(ids["comps"]))
    priors = {"base": base_prior(levels["base"][0], d["y"], w)}
    logf = {name: priors.get(name, np.zeros((nl, K), dtype=np.float32)).copy() for name, (_, nl) in levels.items()}
    L = logf["base"][levels["base"][0]].astype(np.float32)
    P = np.empty_like(L)
    observed = {name: np.bincount(idx * K + d["y"], weights=w, minlength=nl * K).reshape(nl, K)
                for name, (idx, nl) in levels.items()}
    stats = {"balls": n, "passes": []}
    for it in range(cfg.passes):
        t0 = time.time()
        for name in ORDER:
            idx, nl = levels[name]
            _softmax(L, P)
            P *= w[:, None]
            E = _bincount2(idx, P, nl)
            O = observed[name]
            nb = np.bincount(idx, weights=w, minlength=nl)[:, None]
            f_old = np.exp(logf[name].astype(np.float64))
            B = E / f_old
            m = np.divide(B, nb, out=np.zeros_like(B), where=nb > 0)
            prior = np.exp(priors.get(name, np.zeros_like(B)))
            s = cfg.shrink[name]
            f_new = np.where(nb > 0, (O + s * m * prior) / np.maximum(B + s * m, 1e-12), prior)
            new = np.log(np.maximum(f_new, 1e-6)).astype(np.float32)
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
    stats["era_index"] = int(era_index(np.array([d["day"].max()]))[0])      # simulate at the latest season's level
    era = logf["era"].reshape(2, N_ERA, K)
    stats["era_recent"] = {fam_name: {str(2000 + y): {"four": round(float(era[f, y, S.FOUR]), 3),
                                                       "six": round(float(era[f, y, S.SIX]), 3),
                                                       "wicket": round(float(era[f, y, S.WKT]), 3)}
                                      for y in range(max(0, stats["era_index"] - 7), stats["era_index"] + 1)}
                           for f, fam_name in enumerate(S.FAMILY_LIST)}
    log.info("match-to-match conditions sd: %s", stats["conditions_sd"])
    # player 0 / venue 0 / comp 0 are "unknown": exactly average
    for name in ("bat", "bowl", "venue", "comp"):
        logf[name][0] = 0
    for name, width in (("bat_fmt", 2), ("bowl_fmt", 2), ("bat_kind", len(S.BOWLING_KINDS)), ("bowl_hand", len(S.HANDS))):
        logf[name][:width] = 0
    return logf, stats


def match_conditions_sd(d: dict[str, np.ndarray], P: np.ndarray) -> dict[str, float]:
    """Spread of match-level conditions the ball model can't see (pitch, weather, ground size).

    For each match, observed ÷ expected boundaries (and wickets) under the fitted model. Pure chance
    gives var(O/E) ≈ 1/E; anything beyond that is real match-to-match variation, which the
    simulator re-creates with one random 'conditions' draw per simulated match.
    """
    out = {}
    m = d["match"]
    nm = int(m.max()) + 1
    for name, classes in (("boundary", [S.FOUR, S.SIX]), ("wicket", [S.WKT])):
        O = np.bincount(m, weights=np.isin(d["y"], classes).astype(np.float64), minlength=nm)
        E = np.bincount(m, weights=P[:, classes].sum(1).astype(np.float64), minlength=nm)
        ok = E > 5
        r = O[ok] / E[ok]
        extra = r.var() - np.mean(1.0 / E[ok])
        out[name] = round(float(np.sqrt(max(extra, 0.0))), 4)
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

    faced = np.zeros((P, 2), dtype=np.float32)
    bowled = np.zeros((P, 2), dtype=np.float32)
    last = np.zeros(P, dtype=np.int32)
    for role, arr in (("batter_id", faced), ("bowler_id", bowled)):
        for pid, fam, n, lastday in con.execute(f"""
            SELECT {role}, {fam_sql}, sum(CASE WHEN wides = 0 THEN {wexpr} ELSE 0 END),
                   max(date_diff('day', DATE '1970-01-01', match_date))
            FROM balls WHERE innings_no IN (1, 2) AND {role} IS NOT NULL {cut} GROUP BY ALL""").fetchall():
            if pid in pidx:
                arr[pidx[pid], fam] = n
                last[pidx[pid]] = max(last[pidx[pid]], lastday)

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
    return {"usage": usage, "appearances": appearances, "bat_pos": bat_pos, "dismissal": dismissal.astype(np.float32),
            "runout_non_striker": ro_ns / ro_all if ro_all else 0.4,
            "wide_runs": wide_runs.astype(np.float32), "bye_runs": bye_runs.astype(np.float32),
            "balls_faced": faced, "balls_bowled": bowled, "last_played": last, "names": names,
            "hand": hand, "kind": kind}


def fit(parquet: Path, cfg: FitConfig | None = None, memory: str = "4GB", con=None) -> Model:
    cfg = cfg or FitConfig()
    con = con or duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    con.execute("SET preserve_insertion_order=false")
    if not con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = 'balls'").fetchone()[0]:
        attrs = parquet / "attributes" / "attributes.parquet"
        build_balls(con, parquet, attrs if attrs.exists() else None)
    d, ids = load_training(con, cfg)
    log.info("training on %d balls, %d players", len(d["y"]), len(ids["players"]))
    factors, stats = fit_factors(d, ids, cfg)
    tables = _tables(con, cfg, ids, parquet)
    ro = tables.pop("runout_non_striker")
    names = tables.pop("names")
    return Model(factors=factors, players=ids["players"], venues=ids["venues"], comps=ids["comps"], names=names,
                 runout_non_striker=ro,
                 meta={"cutoff": str(cfg.cutoff) if cfg.cutoff else None, "half_life_years": cfg.half_life_years,
                       "fit": stats, "bowler_dismissals": BOWLER_DISMISSALS.tolist()},
                 **tables)
