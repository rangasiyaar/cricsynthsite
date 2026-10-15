"""Format audit: how a player's T20 and one-day records feed each other, out of sample.

    python -m cricsim.engine.format_audit --parquet data/parquet --cutoff 2025-01-01

The ball model gives each player one rating across every limited-overs format plus a deviation per format family
(short = T20 / T10 / Hundred, one-day = 50 overs), shrunk to 0 by SHRINK["bat_fmt"] / ["bowl_fmt"] balls. So a
player's one-day balls count fully towards his T20 rating until his own T20 balls say otherwise.

1. Shrink     how much should a player's own format-specific evidence count? Held-out log-loss with the format
              deviations re-scaled as if fitted with other prior strengths (∞ = one rating for all formats).
2. Form       does recent form carry across formats? Each player's last 5 matches before each held-out match,
              observed ÷ model boundaries and dismissals: same family, the other family, or any.
3. Switchers  players coming into a format from the other one (last match in the other family, or a long gap):
              observed ÷ model in their held-out matches.
"""
from __future__ import annotations

import logging
from collections import deque
from datetime import date, timedelta
from pathlib import Path

import click
import duckdb
import numpy as np

from cricsim.engine import states as S
from cricsim.engine.fit import FORM_PRIOR, FitConfig, fit, level_indices, load_training
from cricsim.engine.model import N_ERA, RECENT, Model, era_vector
from cricsim.engine.venue_diag import _remap

log = logging.getLogger(__name__)

FAMILIES = ("short", "one-day")
SHRINKS = (100, 300, 900, 2700, 8100, None)        # None = no format deviation at all
BETAS = (0.1, 0.25, 0.5)
SOON = 45                                          # days scored in the production-like form check


def score(con, model: Model, start: date, end: date | None, future: bool) -> dict:
    """Balls in [start, end) with the model's logits minus the format deviations (kept separately)."""
    d, ids = load_training(con, FitConfig(min_date=start, cutoff=end))
    _remap(d, ids, model)
    f = model.factors
    levels = level_indices(d, len(model.players), len(model.venues), len(model.comps))
    L = np.zeros((len(d["y"]), S.K), dtype=np.float32)
    for name, (idx, _) in levels.items():
        if name in ("bat_fmt", "bowl_fmt"):
            continue
        if name == "era" and future:
            L += np.stack([era_vector(model, 0), era_vector(model, 1)])[d["fam"]]
        elif name == "era":
            L += f[name][np.minimum(idx, 2 * N_ERA - 1)]
        else:
            L += f[name][idx]
    fam = d["fam"].astype(np.int64)
    return {"L": L, "db": f["bat_fmt"][d["bat"] * 2 + fam], "dw": f["bowl_fmt"][d["bowl"] * 2 + fam],
            "y": d["y"].astype(np.int64), "bat": d["bat"].astype(np.int64), "bowl": d["bowl"].astype(np.int64),
            "fam": fam, "match": d["match"].astype(np.int64), "day": d["day"].astype(np.int64),
            "runs": d["runs_total"].astype(np.float64)}


def _logloss(L: np.ndarray, y: np.ndarray) -> float:
    m = L.max(1, keepdims=True)
    lse = np.log(np.exp(L - m).sum(1)) + m[:, 0]
    return float((lse - L[np.arange(len(y)), y]).mean())


def _probs(L: np.ndarray) -> np.ndarray:
    P = np.exp(L - L.max(1, keepdims=True))
    return P / P.sum(1, keepdims=True)


def family_balls(con, model: Model, cutoff: date, half_life: float) -> tuple[np.ndarray, np.ndarray]:
    """(P, 2) recency-weighted balls per player and family before the cutoff — batting and bowling."""
    out = []
    for col in ("batter_id", "bowler_id"):
        n = np.zeros((len(model.players), 2))
        for pid, fam, w in con.execute(f"""
            SELECT {col}, CASE WHEN format = 'OD' THEN 1 ELSE 0 END,
                   sum(pow(0.5, date_diff('day', match_date, DATE '{cutoff}') / (365.25 * {half_life})))
            FROM balls WHERE match_date < DATE '{cutoff}' AND innings_no IN (1, 2) AND batter_id IS NOT NULL
              AND bowler_id IS NOT NULL AND gender IN ('male', 'female') GROUP BY 1, 2""").fetchall():
            i = model.pid(pid)
            if i:
                n[i, fam] = w
        out.append(n)
    return out[0], out[1]


# ── 2. rolling form ───────────────────────────────────────────────────────────────────────────────────────────────

def rolling_form(b: dict, P: np.ndarray, role: str, freeze: int | None = None) -> dict:
    """Per (player, match) in `role`: log observed ÷ expected boundaries and dismissals over the player's previous
    RECENT matches in the same family, the other family and any family; plus the family of the previous match and
    days since the previous same-family match. Matches on or after day `freeze` don't enter anyone's history."""
    who = b[role]
    bnd = np.isin(b["y"], [S.FOUR, S.SIX]).astype(np.float64)
    wkt = (b["y"] == S.WKT).astype(np.float64)
    eb = (P[:, S.FOUR] + P[:, S.SIX]).astype(np.float64)
    ew = P[:, S.WKT].astype(np.float64)
    M = int(b["match"].max()) + 1
    key = who * M + b["match"]
    uk, first, inv = np.unique(key, return_index=True, return_inverse=True)
    sums = np.stack([np.bincount(inv, weights=x, minlength=len(uk)) for x in (bnd, eb, wkt, ew)], 1)
    p, fam, day, m = who[first], b["fam"][first], b["day"][first], b["match"][first]
    order = np.lexsort((m, day, p))
    out = {k: np.zeros((len(uk), 2)) for k in ("same", "other", "any")}
    prev_fam = np.full(len(uk), -1)
    gap = np.full(len(uk), 10 ** 6)
    hist: dict = {}
    last_p = -1
    for i in order:
        if p[i] != last_p:
            hist = {0: deque(maxlen=RECENT), 1: deque(maxlen=RECENT), "any": deque(maxlen=RECENT), "last": [-1, -1]}
            last_p, prev = p[i], None
        fi = int(fam[i])
        for k, q in (("same", hist[fi]), ("other", hist[1 - fi]), ("any", hist["any"])):
            if q:
                s = np.sum(q, axis=0)
                out[k][i] = (np.log((s[0] + FORM_PRIOR) / (s[1] + FORM_PRIOR)), np.log((s[2] + FORM_PRIOR) / (s[3] + FORM_PRIOR)))
        prev_fam[i] = -1 if prev is None else prev
        if hist["last"][fi] >= 0:
            gap[i] = day[i] - hist["last"][fi]
        if freeze is not None and day[i] >= freeze:
            continue
        hist[fi].append(sums[i])
        hist["any"].append(sums[i])
        hist["last"][fi] = day[i]
        prev = fi
    return {"key": uk, "inv": inv, **out, "prev_fam": prev_fam, "gap": gap}


def _with_form(L: np.ndarray, fb: np.ndarray, fw: np.ndarray, beta: float) -> np.ndarray:
    L = L.copy()
    L[:, S.FOUR] += beta * (fb[:, 0] + fw[:, 0])
    L[:, S.SIX] += beta * (fb[:, 0] + fw[:, 0])
    L[:, S.WKT] += beta * (fb[:, 1] + fw[:, 1])
    return L


# ── report ────────────────────────────────────────────────────────────────────────────────────────────────────────

def run(parquet: Path, cutoff: date, window: int, memory: str) -> str:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    cfg = FitConfig(cutoff=cutoff)
    model = fit(parquet, cfg, memory=memory, con=con)
    s_bat, s_bowl = cfg.shrink["bat_fmt"], cfg.shrink["bowl_fmt"]
    n_bat, n_bowl = family_balls(con, model, cutoff, cfg.half_life_years)
    pre = score(con, model, cutoff - timedelta(days=400), cutoff, False)
    post = score(con, model, cutoff, None, True)
    out = [f"### Format audit: model fitted before {cutoff}", ""]

    # ── 1. shrink ──
    b = post
    fam = b["fam"]
    nb, nw = n_bat[b["bat"], fam], n_bowl[b["bowl"], fam]
    other_b, other_w = n_bat[b["bat"], 1 - fam], n_bowl[b["bowl"], 1 - fam]
    cross_b = other_b > 2.3 * np.maximum(nb, 1e-9)            # 70%+ of the batter's history in the other family
    cross_w = other_w > 2.3 * np.maximum(nw, 1e-9)
    base = b["L"] + b["db"] + b["dw"]
    subsets = [("all held-out balls", np.ones(len(fam), bool))] + \
              [(f"{FAMILIES[k]} matches", fam == k) for k in (0, 1)]
    out += ["#### 1. How much should format-specific evidence count?", "",
            f"{len(fam):,} held-out balls. Change in log-loss per ball (×1000; negative = better) if the format "
            f"deviations had been fitted with another prior strength (today: batting {s_bat:.0f}, bowling {s_bowl:.0f} "
            "balls; ∞ = one rating for every format). 'Crossing' = the player's history is 70%+ in the other family.",
            ""]
    for role, s0, n, d_, cross in (("Batting", s_bat, nb, "db", cross_b), ("Bowling", s_bowl, nw, "dw", cross_w)):
        rows = subsets + [("crossing players", cross)] + [(f"crossing, {FAMILIES[k]} matches", cross & (fam == k))
                                                           for k in (0, 1)]
        out += [f"**{role}**", "", "| Balls | n | " + " | ".join("∞" if s is None else str(s) for s in SHRINKS) + " |",
                "|---|---|" + "---|" * len(SHRINKS)]
        for label, k in rows:
            if k.sum() < 1000:
                continue
            ref = _logloss(base[k], b["y"][k])
            cells = []
            for s in SHRINKS:
                scale = 0.0 if s is None else (n[k] + s0) / (n[k] + s)
                L = base[k] + (scale[:, None] - 1) * b[d_][k] if s is not None else base[k] - b[d_][k]
                cells.append(f"{1000 * (_logloss(L, b['y'][k]) - ref):+.3f}")
            out.append(f"| {label} | {k.sum():,} | " + " | ".join(cells) + " |")
        out.append("")

    # ── 2. rolling form across formats ──
    both = {k: np.concatenate([pre[k], post[k] + (pre["match"].max() + 1 if k == "match" else 0)])
            for k in ("L", "db", "dw", "y", "bat", "bowl", "fam", "match", "day", "runs")}
    P = _probs(both["L"] + both["db"] + both["dw"])
    cut_day = int((np.datetime64(cutoff) - np.datetime64("1970-01-01")).astype(int))
    rb, rw = rolling_form(both, P, "bat"), rolling_form(both, P, "bowl")
    held = (both["day"] >= cut_day) & (both["day"] < cut_day + window)
    hb, hw = rb["inv"][held], rw["inv"][held]
    Lh = (both["L"] + both["db"] + both["dw"])[held]
    yh, famh = both["y"][held], both["fam"][held]
    switch = rb["prev_fam"][hb] == 1 - famh                       # batter's previous match was in the other family
    switch_w = rw["prev_fam"][hw] == 1 - famh
    groups = [("all", np.ones(len(yh), bool))] + [(FAMILIES[k], famh == k) for k in (0, 1)] + \
             [("batter / bowler coming from the other family", switch | switch_w)]
    out += ["#### 2. Does recent form carry across formats?", "",
            f"Held-out matches in the {window} days after the cutoff ({held.sum():,} balls). Each player's previous "
            f"{RECENT} matches (before and after the cutoff, scored with the frozen model): log observed ÷ expected "
            f"boundaries and dismissals, shrunk by {FORM_PRIOR:g} expected events, added to the ball model × weight. "
            "Change in log-loss per ball ×1000 (negative = form helps).", "",
            "| Form from | Weight | " + " | ".join(g for g, _ in groups) + " |", "|---|---|" + "---|" * len(groups)]
    ref = {g: _logloss(Lh[k], yh[k]) for g, k in groups}
    for src in ("same", "other", "any"):
        for beta in BETAS:
            L = _with_form(Lh, rb[src][hb], rw[src][hw], beta)
            out.append(f"| {src} family | {beta} | " + " | ".join(
                f"{1000 * (_logloss(L[k], yh[k]) - ref[g]):+.3f}" if k.sum() >= 500 else "–" for g, k in groups) + " |")
    for beta in BETAS:
        fb = rb["same"][hb] + 0.5 * rb["other"][hb]
        fw = rw["same"][hw] + 0.5 * rw["other"][hw]
        L = _with_form(Lh, fb, fw, beta)
        out.append(f"| same + ½ other | {beta} | " + " | ".join(
            f"{1000 * (_logloss(L[k], yh[k]) - ref[g]):+.3f}" if k.sum() >= 500 else "–" for g, k in groups) + " |")

    # production-like: the model has seen the form matches (nightly refit), and only the next few weeks are scored
    fb_, fw_ = rolling_form(both, P, "bat", cut_day), rolling_form(both, P, "bowl", cut_day)
    soon = (both["day"] >= cut_day) & (both["day"] < cut_day + SOON)
    sb, sw = fb_["inv"][soon], fw_["inv"][soon]
    Ls, ys, fs = (both["L"] + both["db"] + both["dw"])[soon], both["y"][soon], both["fam"][soon]
    sw_ = (fb_["prev_fam"][sb] == 1 - fs) | (fw_["prev_fam"][sw] == 1 - fs)
    g2 = [("all", np.ones(len(ys), bool))] + [(FAMILIES[k], fs == k) for k in (0, 1)] + \
         [("coming from the other family", sw_)]
    ref2 = {g: _logloss(Ls[k], ys[k]) for g, k in g2}
    out += ["", f"Production-like: form only from matches before the cutoff (which the model was fitted on, as after a "
            f"nightly refit), scored on the next {SOON} days ({soon.sum():,} balls).", "",
            "| Form from | Weight | " + " | ".join(g for g, _ in g2) + " |", "|---|---|" + "---|" * len(g2)]
    for src in ("same", "other", "any"):
        for beta in BETAS:
            L = _with_form(Ls, fb_[src][sb], fw_[src][sw], beta)
            out.append(f"| {src} family | {beta} | " + " | ".join(
                f"{1000 * (_logloss(L[k], ys[k]) - ref2[g]):+.3f}" if k.sum() >= 500 else "–" for g, k in g2) + " |")

    # ── 3. switchers ──
    Ph = _probs(Lh)
    run_mean = np.bincount(yh, weights=both["runs"][held], minlength=S.K) / np.maximum(np.bincount(yh, minlength=S.K), 1)
    er = Ph @ run_mean
    gap = rb["gap"][hb]
    out += ["", "#### 3. Batters coming into a format", "",
            "Held-out balls by how long since the batter's previous match in this format family, and whether the "
            "previous match was in the other family. Observed ÷ model.", "",
            "| Group | Family | Balls | Runs O/E | Boundaries O/E | Dismissals O/E | Runs O/E, prior 8100 |",
            "|---|---|---|---|---|---|---|"]
    nbh, nwh = n_bat[both["bat"][held], famh], n_bowl[both["bowl"][held], famh]
    L8 = (both["L"][held] + both["db"][held] * ((nbh + s_bat) / (nbh + 8100))[:, None]
          + both["dw"][held] * ((nwh + s_bowl) / (nwh + 8100))[:, None])
    er8 = _probs(L8) @ run_mean
    for k_f in (0, 1):
        for label, k in (("previous match same family, ≤ 90 days", (gap <= 90) & ~switch),
                         ("previous match other family, ≤ 90 days since this family", (gap <= 90) & switch),
                         ("91-365 days since this family", (gap > 90) & (gap <= 365)),
                         ("over a year / first time in this family", gap > 365)):
            k = k & (famh == k_f)
            if k.sum() < 300:
                continue
            ob = np.isin(yh[k], [S.FOUR, S.SIX]).sum() / (Ph[k][:, S.FOUR] + Ph[k][:, S.SIX]).sum()
            ow = (yh[k] == S.WKT).sum() / Ph[k][:, S.WKT].sum()
            out.append(f"| {label} | {FAMILIES[k_f]} | {k.sum():,} | {both['runs'][held][k].sum() / er[k].sum():.3f} | "
                       f"{ob:.3f} | {ow:.3f} | {both['runs'][held][k].sum() / er8[k].sum():.3f} |")
    return "\n".join(out)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), default="2025-01-01")
@click.option("--window", default=180, help="Days after the cutoff scored for the form and switcher checks")
@click.option("--memory", default="5GB")
def main(parquet: Path, cutoff, window: int, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    click.echo(run(parquet, cutoff.date(), window, memory))


if __name__ == "__main__":
    main()
