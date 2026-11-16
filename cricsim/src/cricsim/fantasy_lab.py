"""Fantasy lab: which way of scoring players picks the best XI on real matches?

Reads the rows a backtest writes with --fantasy-rows (per match, every player: simulated expected points, recent
real fantasy points before the match, real points in it) and scores single-team strategies the way the Results page
does: the XI (1-10 per side, captain x2, vice-captain x1.5) picked by each strategy's player scores, its real points as
a share of the best possible XI's.

Strategies: the simulations alone (the live rule, `dmean`), recent real form alone, blends of the two, and a ridge
regression on both learned only from earlier matches (rolling forward in date order, so no strategy sees the match
it is judged on or anything after it).

Captain choice: with the XI held at the live pick, rules for the captain and vice-captain (the XI's own score, the
simulated expected points, the ceiling, the top-scorer chance, spread bonuses, an all-rounder lean, and a model
learned on earlier matches of who ends up in an XI's top three), against the best captain in hindsight.

python -m cricsim.fantasy_lab ROWS.json [ROWS2.json ...] --out report.md
"""
from __future__ import annotations

import json
from pathlib import Path

import click
import numpy as np

from cricsim.fantasy import STACK_FEATURES, pick_xi, stack_features as features, team_points

FORM = ("last5", "last10", "ewma", "year")


def _src(r: dict, key: str) -> float:
    v = r.get(key)
    return r["dmean"] if v is None else v


def ridge(X: np.ndarray, y: np.ndarray, lam: float = 10.0) -> np.ndarray:
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1
    mu[0], sd[0] = 0, 1                                     # keep the intercept as is
    Z = (X - mu) / sd
    pen = lam * np.eye(Z.shape[1])
    pen[0, 0] = 0
    return _fold(np.linalg.solve(Z.T @ Z + pen, Z.T @ y), mu, sd)


def _fold(w, mu, sd):
    """Weights on the raw inputs from weights on standardised ones."""
    raw = w / sd
    raw[0] = w[0] - (w[1:] * mu[1:] / sd[1:]).sum()
    return raw


def evaluate(matches: list[dict], strategies: dict, min_train: int = 60) -> dict:
    """Real points of each strategy's XI per match (matches in date order; learned strategies only see earlier ones)."""
    matches = sorted(matches, key=lambda m: m["date"])
    out: dict[str, list[float]] = {k: [] for k in strategies}
    out["best"], out["label"] = [], []
    learned = {k: v for k, v in strategies.items() if isinstance(v, tuple)}
    X_by = [np.array([features(r) for r in m["players"]]) for m in matches] if learned else []
    y_by = [np.array([r["real"] for r in m["players"]]) for m in matches] if learned else []
    for i, m in enumerate(matches):
        if i < min_train:
            continue                                         # every strategy is judged on the same later matches
        ps = m["players"]
        team_of = {r["p"]: r["team"] for r in ps}
        real = {r["p"]: r["real"] for r in ps}
        fitted = {}
        if learned:
            X, y = np.vstack(X_by[:i]), np.concatenate(y_by[:i])
            for k, (_, lam) in learned.items():
                fitted[k] = ridge(X, y, lam)
        for k, f in strategies.items():
            if k in fitted:
                score = dict(zip((r["p"] for r in ps), (X_by[i] @ fitted[k]).tolist()))
            else:
                score = {r["p"]: f(r) for r in ps}
            out[k].append(team_points(*pick_xi(score, team_of), real))
        out["best"].append(team_points(*pick_xi(real, team_of), real))
        out["label"].append(m["label"])
    return out


CAPTAIN_FEATURES = ("intercept", "learned score", "dmean", "p90", "sd", "p_top x100", "ewma", "overs bowled", "top order")


def _captain_x(r: dict, base: float) -> list[float]:
    has = (r.get("n") or 0) > 0
    return [1.0, base, r["dmean"], r.get("p90", r["dmean"]), r["sd"], r["p_top"] * 100,
            (r.get("ewma") if has and r.get("ewma") is not None else r["dmean"]), min(r["bowl"], 60) / 6, float(r["slot"] <= 3)]


def captain_rules() -> dict:
    """Captain / vice-captain choices inside a fixed XI: player row, XI score -> captain score."""
    return {"same as the XI score (live rule)": lambda r, b: b,
            "simulated expected points": lambda r, b: r["dmean"],
            "ceiling (90th percentile)": lambda r, b: r.get("p90", r["dmean"]),
            "top-scorer chance": lambda r, b: r["p_top"],
            "XI score + 0.5 spread": lambda r, b: b + 0.5 * r["sd"],
            "XI score + 1.0 spread": lambda r, b: b + 1.0 * r["sd"],
            "half XI score, half ceiling": lambda r, b: 0.5 * b + 0.5 * r.get("p90", r["dmean"]),
            "XI score, all-rounder lean (+2 per over bowled if top 7)": lambda r, b: b + (2 * min(r["bowl"], 60) / 6 if r["slot"] <= 7 else 0),
            "learned for captains (ridge on top-3 of the XI)": "learned"}


def evaluate_captains(matches: list[dict], min_train: int = 60, learned_xi: bool = True) -> dict:
    """Same XI every time (the live pick: learned ridge for T20, simulations for one-day); only the captain and
    vice-captain differ. Real points of the XI per match, plus how often the captain was the XI's top scorer."""
    matches = sorted(matches, key=lambda m: m["date"])
    rules = captain_rules()
    out = {k: [] for k in rules} | {"oracle (best captain in hindsight)": [], "best": [], "_hit": {k: [] for k in rules}}
    X_by = [np.array([features(r) for r in m["players"]]) for m in matches]
    y_by = [np.array([r["real"] for r in m["players"]]) for m in matches]
    cap_X, cap_y = [], []                                  # captain model: rows of earlier matches' XIs
    for i, m in enumerate(matches):
        ps = m["players"]
        team_of = {r["p"]: r["team"] for r in ps}
        real = {r["p"]: r["real"] for r in ps}
        if learned_xi and i >= 1:
            w = ridge(np.vstack(X_by[:i]), np.concatenate(y_by[:i]), 10.0)
            base = dict(zip((r["p"] for r in ps), (X_by[i] @ w).tolist()))
        else:
            base = {r["p"]: r["dmean"] for r in ps}
        xi, _, _ = pick_xi(base, team_of)
        row = {r["p"]: r for r in ps}
        if i >= min_train:
            wc = ridge(np.array(cap_X), np.array(cap_y), 10.0) if len(cap_X) > 50 else None
            top = max(xi, key=lambda p: real[p])
            for k, f in rules.items():
                if f == "learned":
                    cs = {p: (float(np.array(_captain_x(row[p], base[p])) @ wc) if wc is not None else base[p]) for p in xi}
                else:
                    cs = {p: f(row[p], base[p]) for p in xi}
                order = sorted(xi, key=lambda p: -cs[p])
                out[k].append(team_points(xi, order[0], order[1], real))
                out["_hit"][k].append(order[0] == top)
            by_real = sorted(xi, key=lambda p: -real[p])
            out["oracle (best captain in hindsight)"].append(team_points(xi, by_real[0], by_real[1], real))
            out["best"].append(team_points(*pick_xi(real, team_of), real))
        # the captain model learns, inside each XI, which players end up in its top three
        ranks = {p: k for k, p in enumerate(sorted(xi, key=lambda p: -real[p]))}
        for p in xi:
            cap_X.append(_captain_x(row[p], base[p]))
            cap_y.append(1.0 if ranks[p] < 3 else 0.0)
    return out


def captain_report(res: dict, title: str) -> str:
    best = np.array(res["best"])
    base = np.array(res["same as the XI score (live rule)"])
    rng = np.random.default_rng(1)
    lines = [f"## Captain choice: {title}", "", (f"{len(best)} matches judged; the XI is the same in every row, only the captain "
                                                   "(x2) and vice-captain (x1.5) change."), "",
             "| captain rule | points | share of best | v live rule | better in | captain was the XI's top scorer |",
             "|---|---:|---:|---:|---:|---:|"]
    rows = []
    for k, v in res.items():
        if k in ("best", "_hit"):
            continue
        v = np.array(v)
        d = v - base
        boot = [d[rng.integers(len(d), size=len(d))].mean() for _ in range(2000)]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        hit = f"{np.mean(res['_hit'][k]):.0%}" if k in res["_hit"] else "100%"
        rows.append((v.mean(), (f"| {k} | {v.mean():.1f} | {v.mean() / best.mean():.1%} | {d.mean():+.1f} ({lo:+.1f} to {hi:+.1f}) | "
                                f"{(d > 0).mean():.0%} | {hit} |")))
    lines += [r for _, r in sorted(rows, key=lambda x: -x[0])]
    return "\n".join(lines)


def default_strategies() -> dict:
    s = {"simulations (live rule)": lambda r: r["dmean"],
         "simulations, no favourite lean": lambda r: r["mean"],
         "recent form only (last 10)": lambda r: _src(r, "last10"),
         "recent form only (weighted)": lambda r: _src(r, "ewma")}
    for src in ("last10", "ewma", "year"):
        for w in (0.2, 0.35, 0.5):
            s[f"blend {int(w * 100)}% {src}"] = (lambda src, w: lambda r: (1 - w) * r["dmean"] + w * _src(r, src))(src, w)
    for k0 in (5, 10):          # form counts more the more matches it rests on
        s[f"blend by experience (k={k0}) ewma"] = (lambda k0: lambda r: r["dmean"] + min(r.get("n", 0), 20)
                                                    / (min(r.get("n", 0), 20) + k0) * (_src(r, "ewma") - r["dmean"]))(k0)
    s["learned (ridge, λ=10)"] = ("ridge", 10.0)
    s["learned (ridge, λ=100)"] = ("ridge", 100.0)
    return s


def report(res: dict, title: str) -> str:
    best = np.array(res["best"])
    base = np.array(res["simulations (live rule)"])
    rng = np.random.default_rng(0)
    lines = [f"## {title}", "", f"{len(best)} matches judged (each strategy only learns from matches before the one it picks for).", "",
             "| strategy | points | share of best | v live rule | better in |", "|---|---:|---:|---:|---:|"]
    rows = []
    for k, v in res.items():
        if k in ("best", "label"):
            continue
        v = np.array(v)
        d = v - base
        boot = [d[rng.integers(len(d), size=len(d))].mean() for _ in range(2000)]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        rows.append((v.mean() / best.mean(), f"| {k} | {v.mean():.1f} | {v.mean() / best.mean():.1%} | "
                     f"{d.mean():+.1f} ({lo:+.1f} to {hi:+.1f}) | {(d > 0).mean():.0%} |"))
    lines += [r for _, r in sorted(rows, key=lambda x: -x[0])]
    lines += ["", f"Best possible XI: {best.mean():.1f} points on average."]
    return "\n".join(lines)


def correlations(matches: list[dict]) -> str:
    """How well each single predictor ranks the 22 players by real points (average over matches)."""
    def spearman(a, b):
        ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
        return float(np.corrcoef(ra, rb)[0, 1]) if np.std(ra) and np.std(rb) else 0.0
    keys = ["dmean", "mean", "p_top", "last5", "last10", "ewma", "year"]
    out = ["| predictor | rank correlation with real points | players with history |", "|---|---:|---:|"]
    for k in keys:
        cs, cover = [], []
        for m in matches:
            ps = m["players"]
            cs.append(spearman([_src(r, k) for r in ps], [r["real"] for r in ps]))
            cover.append(np.mean([r.get(k) is not None for r in ps]))
        out.append(f"| {k} | {np.mean(cs):.3f} | {np.mean(cover):.0%} |")
    return "\n".join(out)


@click.command()
@click.argument("rows", nargs=-1, type=click.Path(exists=True, path_type=Path))
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/fantasy-lab/report.md"))
@click.option("--min-train", default=60, help="Matches every strategy waits for before it is judged")
@click.option("--weights-out", type=click.Path(path_type=Path), default=None,
              help="Also fit the learned pick (ridge, λ=10) on all matches and write its weights per format family")
def main(rows: tuple[Path, ...], out: Path, min_train: int, weights_out: Path | None) -> None:
    parts, weights = [], {}
    for path in rows:
        matches = json.loads(path.read_text())
        if weights_out and matches:
            X = np.array([features(r) for m in matches for r in m["players"]])
            y = np.array([r["real"] for m in matches for r in m["players"]])
            fam = "OD" if matches[0]["format"] == "OD" else "T20"
            weights[fam] = {"weights": [round(float(x), 6) for x in ridge(X, y, 10.0)], "lambda": 10.0,
                            "features": list(STACK_FEATURES), "matches": len(matches),
                            "from": min(m["date"] for m in matches), "to": max(m["date"] for m in matches)}
        fmt = matches[0]["format"] if matches else "?"
        res = evaluate(matches, default_strategies(), min_train=min(min_train, max(len(matches) // 3, 10)))
        parts.append(report(res, f"{path.stem} ({fmt}, {len(matches)} matches)"))
        parts.append("\n### Ranking players\n\n" + correlations(matches))
        cap = evaluate_captains(matches, min_train=min(min_train, max(len(matches) // 3, 10)), learned_xi=fmt != "OD")
        parts.append(captain_report(cap, f"{path.stem} ({fmt})"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("# Fantasy lab\n\n" + "\n\n".join(parts) + "\n")
    if weights_out:
        weights_out.parent.mkdir(parents=True, exist_ok=True)
        weights_out.write_text(json.dumps(weights, indent=1))
        click.echo(f"weights → {weights_out}:\n{json.dumps(weights)}")
    click.echo(out.read_text())


if __name__ == "__main__":
    main()
