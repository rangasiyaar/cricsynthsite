"""Fantasy lab: which way of scoring players picks the best XI on real matches?

Reads the rows a backtest writes with --fantasy-rows (per match, every player: simulated expected points, recent
real fantasy points before the match, real points in it) and scores single-team strategies the way the Results page
does: the XI (1-10 per side, captain x2, vice-captain x1.5) picked by each strategy's player scores, its real points as
a share of the best possible XI's.

Strategies: the simulations alone (the live rule, `dmean`), recent real form alone, blends of the two, and a ridge
regression on both learned only from earlier matches (rolling forward in date order, so no strategy sees the match
it is judged on or anything after it).

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
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("# Fantasy lab\n\n" + "\n\n".join(parts) + "\n")
    if weights_out:
        weights_out.parent.mkdir(parents=True, exist_ok=True)
        weights_out.write_text(json.dumps(weights, indent=1))
        click.echo(f"weights → {weights_out}:\n{json.dumps(weights)}")
    click.echo(out.read_text())


if __name__ == "__main__":
    main()
