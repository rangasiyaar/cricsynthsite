"""Venue audit: how grounds are identified, and where the venue factor costs accuracy, out of sample.

    python -m cricsim.engine.venue_audit --parquet data/parquet --cutoff 2025-01-01

1. Identity     one ID covering grounds in several cities, and one ground split over several IDs
2. Lookups      every candidate ground behind each fixture's venue_search text
3. History      held-out T20 matches by how much history their ground had at the cutoff: observed ÷ model runs,
                and for grounds the model has never seen, which prior would have done better than the global
                average (same city, the competition's usual grounds)
4. Leagues      at a ground one league dominates, does that league's level belong to the ground? (matches there
                in other competitions)
5. Drift        does a ground's last season before the cutoff (what the long-run factor misses) carry forward?
6. Volatility   do some grounds swing more from match to match than others, consistently?
7. Fixtures     what the model knows about the grounds in the current fixtures
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, timedelta
from pathlib import Path

import click
import duckdb
import numpy as np

from cricsim.engine import states as S
from cricsim.engine.fit import CITY_SHRINK, FitConfig, fit, level_indices, load_training
from cricsim.engine.model import FORMAT_LIST, N_ERA, Model, era_vector
from cricsim.engine.venue_diag import _remap, _wcorr

log = logging.getLogger(__name__)

T20 = FORMAT_LIST.index("T20")
CITY_ALIASES = {"bangalore": "bengaluru", "chittagong": "chattogram", "chandigarh": "mohali", "bombay": "mumbai",
                "madras": "chennai", "calcutta": "kolkata", "gqeberha": "port elizabeth", "trivandrum":
                "thiruvananthapuram", "vizag": "visakhapatnam", "baroda": "vadodara", "dharmasala": "dharamsala",
                "navi mumbai": "mumbai"}
GENERIC = {"stadium", "cricket", "ground", "oval", "international", "the", "club", "association", "park", "sports",
           "sport", "complex", "academy", "national", "of", "and", "county", "no", "de", "la", "centre", "center",
           "arena", "field", "recreation", "memorial", "university", "college", "school", "gymkhana", "main"}
HISTORY = ((1, "new (never seen)"), (1500, "thin (< 1,500 balls)"), (6000, "light (1,500-6,000)"),
           (24000, "medium (6,000-24,000)"), (float("inf"), "established (24,000+)"))
COMP_SHRINK = 6000.0


def norm_city(c: str | None) -> str:
    c = (c or "").strip().lower()
    return CITY_ALIASES.get(c, c)


def tokens(name: str) -> frozenset[str]:
    return frozenset(t for t in re.findall(r"[a-z0-9']+", name.lower()) if t not in GENERIC)


# ── 1. identity ───────────────────────────────────────────────────────────────────────────────────────────────────

def identity(con, m: str) -> list[str]:
    rows = con.execute(f"""SELECT venue_id, any_value(venue), city, count(*), min(year(match_date)), max(year(match_date))
                           FROM read_parquet('{m}') WHERE venue_id IS NOT NULL GROUP BY venue_id, city""").fetchall()
    by_id: dict[str, dict] = {}
    names: dict[str, str] = {}
    for vid, name, city, n, y0, y1 in rows:
        names[vid] = name
        e = by_id.setdefault(vid, {})
        c = norm_city(city)
        n0, a, b = e.get(c, (0, y0, y1))
        e[c] = (n0 + n, min(a, y0), max(b, y1))
    total = sum(n for e in by_id.values() for n, _, _ in e.values())
    no_city = sum(n for e in by_id.values() for c, (n, _, _) in e.items() if not c)

    coll = []
    for vid, e in by_id.items():
        cs = sorted(((n, c, a, b) for c, (n, a, b) in e.items() if c), reverse=True)
        if len(cs) >= 2:
            coll.append((sum(x[0] for x in cs[1:]), vid, cs))
    coll.sort(reverse=True)
    out = ["#### 1. Identity", "",
           f"{len(by_id):,} ground IDs over {total:,} matches; {no_city:,} matches have no city.", "",
           f"**One ID, several cities** ({len(coll)} IDs; {sum(c[0] for c in coll):,} matches outside the main city). "
           "The ID is the ground name with the city stripped, so generic names collide and pool unrelated grounds.", "",
           "| ID | Name | Cities (matches, years) |", "|---|---|---|"]
    for _, vid, cs in coll[:25]:
        out.append(f"| {vid} | {names[vid]} | " + "; ".join(f"{c} ({n}, {a}-{b})" for n, c, a, b in cs[:5]) + " |")

    # one ground, several IDs: same city, same distinctive name words
    city_of = {vid: max(e.items(), key=lambda kv: kv[1][0])[0] for vid, e in by_id.items()}
    n_of = {vid: sum(n for n, _, _ in e.values()) for vid, e in by_id.items()}
    yrs = {vid: (min(a for _, a, _ in e.values()), max(b for _, _, b in e.values())) for vid, e in by_id.items()}
    groups: dict[str, list[str]] = {}
    for vid, c in city_of.items():
        if c:
            groups.setdefault(c, []).append(vid)
    pairs = []
    for c, vids in groups.items():
        for i, a in enumerate(vids):
            ta = tokens(names[a])
            for b in vids[i + 1:]:
                tb = tokens(names[b])
                if not ta or not tb:
                    continue
                small, big = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
                if ta == tb or (small <= big and not any(ch.isdigit() for t in big - small for ch in t)):
                    pairs.append((min(n_of[a], n_of[b]), c, a, b))
    pairs.sort(reverse=True)
    out += ["", f"**One ground, several IDs** ({len(pairs)} likely pairs in the same city). Each part's history "
            "is thinner than the ground's.", "",
            "| City | Ground A (matches, years) | Ground B (matches, years) |", "|---|---|---|"]
    for _, c, a, b in pairs[:30]:
        out.append(f"| {c} | {names[a]} ({n_of[a]}, {yrs[a][0]}-{yrs[a][1]}) | "
                   f"{names[b]} ({n_of[b]}, {yrs[b][0]}-{yrs[b][1]}) |")
    return out


# ── 2. fixture lookups ────────────────────────────────────────────────────────────────────────────────────────────

def lookups(con, m: str, fixtures: Path) -> tuple[list[str], dict[str, str]]:
    out = ["", "#### 2. Fixture venue lookups", "",
           "Each fixture's venue_search text, every ground it matches (most matches first; the lookup takes the top).",
           "", "| Fixture | Search | Candidates (matches, city, last) |", "|---|---|---|"]
    chosen = {}
    for f in sorted(fixtures.glob("*.json")):
        fx = json.loads(f.read_text())
        q = fx.get("venue_search")
        if not q:
            continue
        rows = con.execute(f"""SELECT venue_id, any_value(venue), any_value(city), count(*) n, max(match_date)
                               FROM read_parquet('{m}') WHERE lower(venue) LIKE ? OR lower(venue_raw) LIKE ?
                               GROUP BY 1 ORDER BY n DESC LIMIT 4""", [f"%{q.lower()}%"] * 2).fetchall()
        if rows:
            chosen[f.stem] = rows[0][0]
        cands = "; ".join(f"{v} ({n}, {c or '?'}, {d})" for v, _, c, n, d in rows) or "**none**"
        out.append(f"| {f.stem} | {q} | {cands} |")
    return out, chosen


# ── scoring held-out balls ────────────────────────────────────────────────────────────────────────────────────────

def score_matches(con, model: Model, start: date, end: date | None, future: bool, run_mean: np.ndarray | None):
    """T20 matches in [start, end): observed and model-expected runs, boundaries and wickets, per match."""
    d, ids = load_training(con, FitConfig(min_date=start, cutoff=end))
    keep = d["fmt"] == T20
    d = {k: v[keep] for k, v in d.items()}
    venue = np.array(ids["venues"], dtype=object)[d["venue"]]
    comp = np.array(ids["comps"], dtype=object)[d["comp"]]
    team_type = (np.asarray(ids["comp_group"])[d["comp"]] // (len(FORMAT_LIST) * 2))      # 0 intl, 1 club, 2 ?
    _remap(d, ids, model)
    f = model.factors
    levels = level_indices(d, len(model.players), len(model.venues), len(model.comps))
    L = np.zeros((len(d["y"]), S.K), dtype=np.float32)
    for name, (idx, _) in levels.items():
        if name == "era" and future:
            L += era_vector(model, 0)
        elif name == "era":
            L += f[name][np.minimum(idx, 2 * N_ERA - 1)]
        else:
            L += f[name][idx]
    L -= L.max(1, keepdims=True)
    P = np.exp(L)
    del L
    P /= P.sum(1, keepdims=True)
    y, runs = d["y"], d["runs_total"].astype(np.float64)
    if run_mean is None:
        run_mean = np.bincount(y, weights=runs, minlength=S.K) / np.maximum(np.bincount(y, minlength=S.K), 1)
    er = P @ run_mean
    var = P @ run_mean ** 2 - er ** 2
    pb = P[:, S.FOUR] + P[:, S.SIX]
    pw = P[:, S.WKT].astype(np.float64)
    _, first, mi = np.unique(d["match"], return_index=True, return_inverse=True)
    nm = len(first)
    s = lambda w: np.bincount(mi, weights=w, minlength=nm)  # noqa: E731
    return {"venue": venue[first], "comp": comp[first], "tt": team_type[first], "gender": d["gender"][first],
            "day": d["day"][first], "balls": np.bincount(mi, minlength=nm),
            "O": s(runs), "E": s(er), "V": s(var),
            "Ob": s(np.isin(y, [S.FOUR, S.SIX]).astype(float)), "Eb": s(pb.astype(np.float64)),
            "Ow": s((y == S.WKT).astype(float)), "Ew": s(pw)}, run_mean, (P.sum(0) / len(P)).astype(np.float64)


def run_effect(f: np.ndarray, p_bar: np.ndarray, run_mean: np.ndarray) -> np.ndarray:
    """Log multiplier on expected runs per ball implied by each level of a factor."""
    q = p_bar[None] * np.exp(f.astype(np.float64))
    q /= q.sum(1, keepdims=True)
    return np.log(q @ run_mean) - np.log(p_bar @ run_mean)


def _ratio(obs, exp) -> str:
    return f"{obs.sum() / exp.sum():.3f}" if exp.sum() else "–"


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x ** 2))) if len(x) else float("nan")


# ── report ────────────────────────────────────────────────────────────────────────────────────────────────────────

def run(parquet: Path, cutoff: date, years: float, min_matches: int, memory: str, fixtures: Path) -> str:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    m = (parquet / "matches" / "*.parquet").as_posix()
    out = [f"### Venue audit: model fitted before {cutoff}", ""]
    out += identity(con, m)
    lk, chosen = lookups(con, m, fixtures)
    out += lk

    model = fit(parquet, FitConfig(cutoff=cutoff), memory=memory, con=con)
    post, run_mean, p_bar = score_matches(con, model, cutoff, None, True, None)
    pre = score_matches(con, model, cutoff - timedelta(days=int(365.25 * years)), cutoff, False, run_mean)[0]
    v_eff = run_effect(model.factors["venue"], p_bar, run_mean)
    c_eff = run_effect(model.factors["comp"], p_bar, run_mean)

    # recency-weighted balls of history per ground (what the venue factor's shrinkage sees), and per competition
    hist: dict[str, float] = {}
    comp_grounds: dict[str, dict[str, float]] = {}
    ground_comps: dict[str, dict[str, float]] = {}
    for v, c, w in con.execute(f"""
        SELECT venue_id, coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format),
               sum(pow(0.5, date_diff('day', match_date, DATE '{cutoff}') / (365.25 * 3)))
        FROM balls WHERE match_date < DATE '{cutoff}' AND match_date >= DATE '2004-01-01'
          AND innings_no IN (1, 2) AND venue_id IS NOT NULL GROUP BY 1, 2""").fetchall():
        hist[v] = hist.get(v, 0.0) + w
        comp_grounds.setdefault(c, {})[v] = w
        ground_comps.setdefault(v, {})[c] = w
    meta = {v: (n, norm_city(c)) for v, n, c in con.execute(
        f"SELECT venue_id, any_value(venue), any_value(city) FROM read_parquet('{m}') WHERE venue_id IS NOT NULL "
        "GROUP BY 1").fetchall()}
    name = lambda v: meta.get(v, (v,))[0]  # noqa: E731

    # ── 3. history ──
    known = np.array([model.venue(v) > 0 for v in post["venue"]])
    h = np.array([hist.get(v, 0.0) if k else 0.0 for v, k in zip(post["venue"], known)])
    has_v = post["venue"] != ""
    cls = np.searchsorted([e for e, _ in HISTORY], h, side="right")
    rel = np.log(np.maximum(post["O"], 1) / post["E"])
    out += ["", "#### 3. Ground history at the cutoff (held-out T20 matches)", "",
            f"{len(rel):,} matches after {cutoff}. O/E = observed ÷ model-expected, over all matches in the row; "
            "RMS = root-mean-square of each match's log(O/E) runs (chance and conditions included).", "",
            "| Ground history | Matches | Grounds | Runs O/E | Boundaries O/E | Wickets O/E | RMS log runs |",
            "|---|---|---|---|---|---|---|"]
    for i, (_, label) in enumerate(HISTORY):
        k = has_v & (cls == i)
        out.append(f"| {label} | {k.sum():,} | {len(set(post['venue'][k])):,} | {_ratio(post['O'][k], post['E'][k])} | "
                   f"{_ratio(post['Ob'][k], post['Eb'][k])} | {_ratio(post['Ow'][k], post['Ew'][k])} | {_rms(rel[k]):.3f} |")
    k = ~has_v
    out.append(f"| no ground recorded | {k.sum():,} | – | {_ratio(post['O'][k], post['E'][k])} | – | – | {_rms(rel[k]):.3f} |")

    new = has_v & (cls == 0)
    out += ["", "New grounds by kind of match:", "", "| Kind | Matches | Runs O/E | Boundaries O/E | Wickets O/E |",
            "|---|---|---|---|---|"]
    for tt, tname in ((0, "international"), (1, "club"), (2, "unknown")):
        for g, gname in ((0, "men"), (1, "women")):
            k = new & (post["tt"] == tt) & (post["gender"] == g)
            if k.sum():
                out.append(f"| {tname} {gname} | {k.sum():,} | {_ratio(post['O'][k], post['E'][k])} | "
                           f"{_ratio(post['Ob'][k], post['Eb'][k])} | {_ratio(post['Ow'][k], post['Ew'][k])} |")
    known_comp = np.array([model.comp(c) > 0 for c in post["comp"]])
    for kc, label in ((True, "competition known"), (False, "competition new too")):
        k = new & (known_comp == kc)
        out.append(f"| {label} | {k.sum():,} | {_ratio(post['O'][k], post['E'][k])} | "
                   f"{_ratio(post['Ob'][k], post['Eb'][k])} | {_ratio(post['Ow'][k], post['Ew'][k])} |")

    # priors for a ground the model has never seen
    city_peers: dict[str, list[tuple[float, float]]] = {}
    for v, w in hist.items():
        i = model.venue(v)
        if i and meta.get(v, ("", ""))[1]:
            city_peers.setdefault(meta[v][1], []).append((w, float(v_eff[i])))

    def city_adj(v: str) -> float | None:
        p = city_peers.get(meta.get(v, ("", ""))[1])
        if not p:
            return None
        return sum(w * e for w, e in p) / (sum(w for w, _ in p) + CITY_SHRINK)

    def comp_adj(c: str) -> float | None:
        g = comp_grounds.get(c)
        if not g:
            return None
        pairs = [(w, float(v_eff[model.venue(v)])) for v, w in g.items() if model.venue(v)]
        return sum(w * e for w, e in pairs) / (sum(w for w, _ in pairs) + COMP_SHRINK) if pairs else None

    idx = np.flatnonzero(new)
    ca = np.array([city_adj(v) for v in post["venue"][idx]], dtype=object)
    pa_ = np.array([comp_adj(c) for c in post["comp"][idx]], dtype=object)
    cand = {"global average (today)": np.zeros(len(idx)),
            "same city": np.array([x if x is not None else 0.0 for x in ca], dtype=float),
            "competition's grounds": np.array([x if x is not None else 0.0 for x in pa_], dtype=float),
            "city, else competition": np.array([c if c is not None else (p if p is not None else 0.0)
                                                for c, p in zip(ca, pa_)], dtype=float),
            "competition, else city": np.array([p if p is not None else (c if c is not None else 0.0)
                                                for c, p in zip(ca, pa_)], dtype=float)}
    r0 = rel[idx]
    out += ["", f"Priors for the {len(idx):,} matches at new grounds ({sum(x is not None for x in ca)} have "
            f"same-city grounds, {sum(x is not None for x in pa_)} a competition with known grounds). "
            "Bias = mean log(O/E); lower RMS is better.", "",
            "| Prior | Bias | RMS log runs | Change |", "|---|---|---|---|"]
    base = _rms(r0) if len(r0) else 0.0
    for label, adj in (cand.items() if len(r0) else ()):
        r = r0 - adj
        out.append(f"| {label} | {r.mean():+.3f} | {_rms(r):.4f} | {_rms(r) - base:+.4f} |")
    if len(r0):
        out.append(f"| flat level (in-sample upper bound) | 0.000 | {_rms(r0 - r0.mean()):.4f} | "
                   f"{_rms(r0 - r0.mean()) - base:+.4f} |")

    # ── 4. league level v ground level ──
    rows = []
    for j in np.flatnonzero(has_v & known):
        v = post["venue"][j]
        gc = ground_comps.get(v, {})
        tot = sum(gc.values())
        if not tot:
            continue
        dom, wd = max(gc.items(), key=lambda kv: kv[1])
        if wd / tot < 0.6 or post["comp"][j] == dom or not model.comp(dom):
            continue
        rows.append((rel[j], float(c_eff[model.comp(dom)]) - float(c_eff[model.comp(post["comp"][j])]),
                     float(c_eff[model.comp(dom)]), v))
    out += ["", "#### 4. Does a league's level belong to its grounds?", ""]
    if len(rows) >= 20:
        r, gap, lvl = (np.array([x[i] for x in rows]) for i in range(3))
        slope = float((gap * r).sum() / (gap ** 2).sum())
        resid = r - slope * gap
        se = float(np.sqrt(resid.var() / (gap ** 2).sum()))
        out += [f"{len(rows):,} held-out matches at grounds where one competition has 60%+ of the history, played in "
                f"another competition ({len({x[3] for x in rows})} grounds). gap = that league's run level minus "
                "this match's competition level (log runs per ball).", "",
                f"- mean log(O/E): {r.mean():+.3f}; corr with gap {np.corrcoef(r, gap)[0, 1]:+.2f}; "
                f"share of the gap the model misses: **{slope:+.2f}** (se {se:.2f})",
                "- positive share: part of the league's level is really the grounds' (the venue factor should carry "
                "it); negative: the venue factor already carries too much of it."]
    else:
        out.append(f"Only {len(rows)} such matches.")

    # ── 5. drift ──
    def ground_rel(b: dict, since: int | None = None) -> dict[str, tuple[float, int, float]]:
        """Ground → (log O/E runs, matches, noise variance of that log ratio from match-to-match swings)."""
        k = b["venue"] != ""
        if since is not None:
            k &= b["day"] >= since
        r = np.log(np.maximum(b["O"], 1) / b["E"])
        res = {}
        for v in set(b["venue"][k]):
            kk = k & (b["venue"] == v)
            n = int(kk.sum())
            res[v] = (float(np.log(b["O"][kk].sum() / b["E"][kk].sum())), n,
                      float(r[kk].var(ddof=1) / n) if n > 1 else 0.0)
        return res

    cut_day = int((np.datetime64(cutoff) - np.datetime64("1970-01-01")).astype(int))
    after = ground_rel(post)
    out += ["", "#### 5. Drift: does a ground's recent residual carry forward?", "",
            f"Grounds with {min_matches}+ held-out matches. Residual = observed ÷ model runs over the window before the "
            "cutoff (in sample: what the long-run, 3-year half-life factor didn't absorb). "
            "Scale = best multiplier on that residual for predicting the held-out one; R² = share of the held-out "
            "ground-to-ground spread it explains.", "",
            "| Window before cutoff | Grounds | Corr | Scale | R² |", "|---|---|---|---|---|"]
    for label, days in (("last 6 months", 183), ("last year", 365), ("last 2 years", 730)):
        before = ground_rel(pre, cut_day - days)
        g = [v for v in after if after[v][1] >= min_matches and before.get(v, (0, 0))[1] >= min_matches // 2]
        if len(g) < 8:
            out.append(f"| {label} | {len(g)} | – | – | – |")
            continue
        a = np.array([before[v][0] for v in g])
        b = np.array([after[v][0] for v in g])
        w = 1 / (1 / np.array([before[v][1] for v in g]) + 1 / np.array([after[v][1] for v in g]))
        scale = float((w * a * b).sum() / (w * a * a).sum())
        r2 = 1 - (w * (b - scale * a) ** 2).sum() / (w * b ** 2).sum()
        out.append(f"| {label} | {len(g)} | {_wcorr(a, b, w):+.2f} | {scale:.2f} | {r2:+.1%} |")
    g = [v for v in after if after[v][1] >= min_matches]
    if g:
        b = np.array([after[v][0] for v in g])
        noise = float(np.mean([after[v][2] for v in g]))
        out.append(f"\nHeld-out ground residuals ({len(g)} grounds): sd {b.std():.3f}, of which match-to-match noise "
                   f"explains {np.sqrt(noise):.3f}; real ground-level miss ≈ **{np.sqrt(max(b.var() - noise, 0)):.3f}** "
                   f"(× {np.exp(np.sqrt(max(b.var() - noise, 0))):.3f} runs).")
        worst = sorted(g, key=lambda v: -abs(after[v][0]))[:10]
        out += ["", "| Ground | Held-out matches | Runs O/E | History (balls) |", "|---|---|---|---|"]
        for v in worst:
            out.append(f"| {name(v)} | {after[v][1]} | {np.exp(after[v][0]):.3f} | {hist.get(v, 0):,.0f} |")

    # ── 6. volatility ──
    def excess_sd(b: dict) -> dict[str, tuple[float, int]]:
        res = {}
        r = np.log(np.maximum(b["O"], 1) / b["E"])
        chance = b["V"] / b["E"] ** 2
        for v in set(b["venue"]):
            if not v:
                continue
            k = b["venue"] == v
            if k.sum() < min_matches:
                continue
            res[v] = (float(np.sqrt(max(r[k].var(ddof=1) - chance[k].mean(), 0.0))), int(k.sum()))
        return res

    sp, sq = excess_sd(pre), excess_sd(post)
    g = [v for v in sq if v in sp]
    out += ["", "#### 6. Volatility: match-to-match swing in runs beyond chance, by ground", ""]
    if len(g) >= 8:
        a = np.array([sp[v][0] for v in g])
        b = np.array([sq[v][0] for v in g])
        allr = np.log(np.maximum(post["O"], 1) / post["E"])
        overall = np.sqrt(max(allr[has_v].var() - (post["V"] / post["E"] ** 2)[has_v].mean(), 0))
        out += [f"{len(g)} grounds with {min_matches}+ matches before and after. Typical swing {np.median(b):.3f} "
                f"(all held-out matches pooled {overall:.3f}). Corr before v after **{np.corrcoef(a, b)[0, 1]:+.2f}**; "
                "a clearly positive corr means a per-ground swing would sharpen the bands.", "",
                "| Ground | Swing before | Swing after | Matches after |", "|---|---|---|---|"]
        for v in sorted(g, key=lambda v: -sq[v][0])[:6] + sorted(g, key=lambda v: sq[v][0])[:4]:
            out.append(f"| {name(v)} | {sp[v][0]:.3f} | {sq[v][0]:.3f} | {sq[v][1]} |")
    else:
        out.append(f"Only {len(g)} grounds with enough matches.")

    # ── 7. fixture grounds ──
    before1 = ground_rel(pre, cut_day - 365)
    out += ["", "#### 7. Fixture grounds", "",
            "| Fixture | Ground | City | History (balls) | Venue factor (runs ×) | City grounds | Last-year residual | "
            "Held-out O/E |", "|---|---|---|---|---|---|---|---|"]
    for fx, v in chosen.items():
        i = model.venue(v)
        peers = len(city_peers.get(meta.get(v, ("", ""))[1], [])) - (1 if i else 0)
        lr = before1.get(v)
        ho = after.get(v)
        out.append(f"| {fx} | {name(v)} | {meta.get(v, ('', '?'))[1]} | {hist.get(v, 0):,.0f} | "
                   f"{np.exp(v_eff[i]):.3f} | {peers} | "
                   f"{f'{np.exp(lr[0]):.3f} ({lr[1]})' if lr else '–'} | {f'{np.exp(ho[0]):.3f} ({ho[1]})' if ho else '–'} |")
    return "\n".join(out)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), default="2025-01-01")
@click.option("--years", default=3.0, help="Years before the cutoff scored for the drift and volatility checks")
@click.option("--min-matches", default=8)
@click.option("--fixtures", type=click.Path(path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--memory", default="5GB")
def main(parquet: Path, cutoff, years: float, min_matches: int, fixtures: Path, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    click.echo(run(parquet, cutoff.date(), years, min_matches, memory, fixtures))


if __name__ == "__main__":
    main()
