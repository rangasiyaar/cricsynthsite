"""Stacking lab: does blending the simulations with real recent form beat the simulations alone?

Reads the rows a backtest writes with --stack-rows: per match, the simulated win chance next to both teams' recent
results and their head-to-head, and every player's simulated runs (when he batted) and wickets (when he bowled)
next to his real recent runs and wickets. For each prediction it compares

- the simulations alone (what the site shows),
- a calibration layer (the simulation's own number, re-scaled),
- a stack (the simulation's number plus recent form, team results or head-to-head),
- a direct model: the outcome learned straight from match-level inputs (cricsim.direct_features: phase, matchup,
  slot, ground, workload, form, team strength...) with no simulation, linear and as boosted trees,
- a blend: the simulation's number plus the same direct inputs,

where the learned ones are refitted rolling forward in date order, so nothing is judged on a match it learned from.
Scores: Brier (and log-loss for the result) for chances, mean absolute and squared error for expected runs/wickets.

python -m cricsim.stack_lab ROWS.json [ROWS2.json ...] --out report.md [--weights-out weights.json]
"""
from __future__ import annotations

import json
from pathlib import Path

import click
import numpy as np

EPS = 1e-4


def logit(p):
    p = np.clip(np.asarray(p, dtype=float), 0.005, 0.995)
    return np.log(p / (1 - p))


def _std(X):
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1
    mu[0], sd[0] = 0, 1                                     # the intercept column stays as is
    return mu, sd


def _fold(w, mu, sd):
    raw = w / sd
    raw[0] = w[0] - (w[1:] * mu[1:] / sd[1:]).sum()
    return raw


def ridge(X, y, lam=10.0):
    mu, sd = _std(X)
    Z = (X - mu) / sd
    pen = lam * np.eye(Z.shape[1])
    pen[0, 0] = 0
    return _fold(np.linalg.solve(Z.T @ Z + pen, Z.T @ y), mu, sd)


def logistic(X, y, lam=1.0, iters=25):
    """L2-penalised logistic regression (Newton steps) on standardised inputs; weights on the raw inputs."""
    mu, sd = _std(X)
    Z = (X - mu) / sd
    w = np.zeros(Z.shape[1])
    pen = lam * np.eye(Z.shape[1])
    pen[0, 0] = 0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Z @ w))
        g = Z.T @ (p - y) + pen @ w
        H = (Z * (p * (1 - p))[:, None]).T @ Z + pen
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-6:
            break
    return _fold(w, mu, sd)


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


def _f(form: dict | None, key: str, default: float) -> float:
    v = (form or {}).get(key)
    return default if v is None else float(v)


# ---------- features (one function per prediction; the first column is the intercept, the second the simulation's)

def bat_mean_x(r):
    f, m = r["form"], r["mean"]
    has = float(f["n"] > 0)
    return [1.0, m, _f(f, "last10", m), _f(f, "ewma", m), _f(f, "year", m), has, min(f["n"], 30) / 30, r["balls"]]


def bat_p30_x(r):
    f, m = r["form"], r["mean"]
    has = float(f["n"] > 0)
    hit = (_f(f, "hit10", 0.0) * min(f["n"], 10) + 2 * r["p30"]) / (min(f["n"], 10) + 2)   # shrunk to the sims
    return [1.0, float(logit(r["p30"])), float(logit(hit)), (_f(f, "ewma", m) - m) / 30, has, min(f["n"], 30) / 30]


def bowl_mean_x(r):
    f, m = r["form"], r["mean"]
    return [1.0, m, _f(f, "last10", m), _f(f, "ewma", m), _f(f, "year", m), float(f["n"] > 0), min(f["n"], 30) / 30, r["balls"] / 24]


def bowl_p2_x(r):
    f, m = r["form"], r["mean"]
    hit = (_f(f, "hit10", 0.0) * min(f["n"], 10) + 2 * r["p2"]) / (min(f["n"], 10) + 2)
    return [1.0, float(logit(r["p2"])), float(logit(hit)), _f(f, "ewma", m) - m, float(f["n"] > 0), min(f["n"], 30) / 30]


def win_x(w):
    def rate(f):
        return (_f(f, "last10", 0.5) * min(f["n"], 10) + 0.5 * 3) / (min(f["n"], 10) + 3)   # shrunk to a coin flip
    t1, t2, h = w["t1"], w["t2"], w["h2h"]
    h2h = (_f(h, "ewma", 0.5) * min(h["n"], 5) + 0.5 * 3) / (min(h["n"], 5) + 3)
    return [1.0, float(logit(w["p"])), float(logit(rate(t1)) - logit(rate(t2))),
            _f(t1, "ewma", 0.5) - _f(t2, "ewma", 0.5), float(logit(h2h)), 1.0 if w["bf"] == 0 else -1.0]


# ---------- the predictions and their strategies: (kind, features, columns used, penalty)

TARGETS = {
    "player runs (expected, when batting)": {
        "rows": "bat", "kind": "mean", "x": bat_mean_x, "y": lambda r: float(r["actual"]),
        "strategies": {"calibrated": [0, 1], "stack: + recent runs": [0, 1, 2, 3, 4, 5, 6],
                       "stack: + recent runs + balls": list(range(8))}},
    "player 30+ runs (chance, when batting)": {
        "rows": "bat", "kind": "prob", "x": bat_p30_x, "y": lambda r: float(r["actual"] >= 30),
        "strategies": {"calibrated": [0, 1], "stack: + recent 30+ rate": [0, 1, 2, 4, 5],
                       "stack: + recent 30+ rate + runs": [0, 1, 2, 3, 4, 5]}},
    "bowler wickets (expected, when bowling)": {
        "rows": "bowl", "kind": "mean", "x": bowl_mean_x, "y": lambda r: float(r["actual"]),
        "strategies": {"calibrated": [0, 1], "stack: + recent wickets": [0, 1, 2, 3, 4, 5, 6],
                       "stack: + recent wickets + overs": list(range(8))}},
    "bowler 2+ wickets (chance, when bowling)": {
        "rows": "bowl", "kind": "prob", "x": bowl_p2_x, "y": lambda r: float(r["actual"] >= 2),
        "strategies": {"calibrated": [0, 1], "stack: + recent 2+ rate": [0, 1, 2, 4, 5],
                       "stack: + recent 2+ rate + wickets": [0, 1, 2, 3, 4, 5]}},
    "match result (team 1 wins)": {
        "rows": "win", "kind": "prob", "x": win_x, "y": lambda w: float(w["won"]),
        "strategies": {"calibrated": [0, 1], "stack: + team form": [0, 1, 2, 3],
                       "stack: + team form + head-to-head": [0, 1, 2, 3, 4], "stack: all + batting first": [0, 1, 2, 3, 4, 5]}},
}


def _rows(m: dict, which: str) -> list:
    if which == "win":
        return [m["win"]] if m.get("win") else []
    return m.get(which) or []


def _fit(kind, X, y, lam):
    return ridge(X, y, lam) if kind == "mean" else logistic(X, y, lam)


def _predict(kind, X, w):
    z = X @ w
    return np.maximum(z, 0) if kind == "mean" else np.clip(sigmoid(z), EPS, 1 - EPS)


def _loss(kind, pred, y):
    if kind == "mean":
        return {"abs": np.abs(pred - y), "sq": (pred - y) ** 2}
    p = np.clip(pred, EPS, 1 - EPS)
    return {"brier": (p - y) ** 2, "logloss": -(y * np.log(p) + (1 - y) * np.log(1 - p))}


DIRECT = {"direct (linear)": ("direct", "linear"), "direct (boosted trees)": ("direct", "trees"),
          "blend: simulations + direct (linear)": ("blend", "linear"),
          "blend: simulations + direct (boosted trees)": ("blend", "trees")}


def _direct_names(matches, which) -> list[str]:
    names: set[str] = set()
    for m in matches:
        for r in _rows(m, which):
            names |= set(r.get("x") or {})
    return sorted(names)


def _design(rows, spec, names):
    """(simulation + recent-form inputs, direct inputs) for these rows."""
    S = np.array([spec["x"](r) for r in rows], dtype=float)
    D = np.array([[float((r.get("x") or {}).get(k, 0.0)) for k in names] for r in rows], dtype=float).reshape(len(rows), len(names))
    if spec["rows"] == "win":                               # team results and head-to-head are direct inputs too
        D = np.hstack([D, S[:, 2:5]])
    return S, D


def _inputs(how, S, D):
    if how == "direct":
        return np.hstack([np.ones((len(D), 1)), D])
    return np.hstack([S[:, :2], D])                         # intercept, the simulation's number, direct inputs


def _trees(kind, X, y):
    from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
    args = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0,
                early_stopping=False, random_state=0)
    if kind == "mean":
        return HistGradientBoostingRegressor(loss="poisson", **args).fit(X[:, 1:], y)
    if len(set(y.tolist())) < 2:
        return None
    return HistGradientBoostingClassifier(**args).fit(X[:, 1:], y)


def _trees_predict(kind, model, X, base):
    if model is None:
        return base
    if kind == "mean":
        return model.predict(X[:, 1:])
    return np.clip(model.predict_proba(X[:, 1:])[:, 1], EPS, 1 - EPS)


def evaluate(matches: list[dict], name: str, spec: dict, min_train: int, refit: int = 5,
             lam_mean: float = 10.0, lam_prob: float = 1.0, trees: bool = True) -> dict:
    """Per judged match: each strategy's summed losses and the item count (for match-level bootstrap)."""
    matches = sorted(matches, key=lambda m: str(m["date"]))
    kind = spec["kind"]
    lam = lam_mean if kind == "mean" else lam_prob
    names = _direct_names(matches, spec["rows"])
    direct = {k: v for k, v in DIRECT.items() if names and (trees or v[1] == "linear")}
    designs = [_design(_rows(m, spec["rows"]), spec, names) for m in matches]
    y_by = [np.array([spec["y"](r) for r in _rows(m, spec["rows"])], dtype=float) for m in matches]
    strategies = ["simulations (live)", *spec["strategies"], *direct]
    out = {k: {} for k in strategies}
    count = []
    fitted: dict = {}
    for i, m in enumerate(matches):
        if i < min_train or not len(y_by[i]):
            continue
        if not any(len(y) for y in y_by[:i]):
            continue
        if not fitted or (i - min_train) % refit == 0:
            St = np.vstack([s for s, _ in designs[:i] if len(s)])
            Dt = np.vstack([d for s, d in designs[:i] if len(s)])
            yt = np.concatenate([y for y in y_by[:i] if len(y)])
            fitted = {k: ("cols", cols, _fit(kind, St[:, cols], yt, lam)) for k, cols in spec["strategies"].items()}
            for k, (how, model) in direct.items():
                X = _inputs(how, St, Dt)
                fitted[k] = (how, model, _fit(kind, X, yt, lam) if model == "linear" else _trees(kind, X, yt))
        S, D = designs[i]
        y = y_by[i]
        base = S[:, 1] if kind == "mean" else sigmoid(S[:, 1])
        preds = {"simulations (live)": base}
        for k, (how, what, w) in fitted.items():
            if how == "cols":
                preds[k] = _predict(kind, S[:, what], w)
            elif what == "linear":
                preds[k] = _predict(kind, _inputs(how, S, D), w)
            else:
                preds[k] = _trees_predict(kind, w, _inputs(how, S, D), base)
        for k, p in preds.items():
            for metric, v in _loss(kind, p, y).items():
                out[k].setdefault(metric, []).append(float(v.sum()))
        count.append(len(y))
    out["_n"] = count
    return out


def report(res: dict, title: str, kind: str) -> str:
    n = np.array(res["_n"], dtype=float)
    if not len(n):
        return f"### {title}\n\nNo rows."
    rng = np.random.default_rng(0)
    metrics = ("brier", "logloss") if kind == "prob" else ("abs", "sq")
    label = {"brier": "Brier", "logloss": "log-loss", "abs": "mean abs error", "sq": "mean sq error"}
    main = metrics[0]
    lines = [f"### {title}", "", f"{int(n.sum())} predictions over {len(n)} matches judged (lower is better).", "",
             f"| strategy | {label[metrics[0]]} | {label[metrics[1]]} | v simulations ({label[main]}, 95% range) | matches better |",
             "|---|---:|---:|---:|---:|"]
    base = np.array(res["simulations (live)"][main])
    idx = [rng.integers(len(n), size=len(n)) for _ in range(2000)]
    for k, v in res.items():
        if k == "_n":
            continue
        a, b = np.array(v[metrics[0]]), np.array(v[metrics[1]])
        d = a - base
        boot = [d[j].sum() / n[j].sum() for j in idx]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        flag = " **(clearly better)**" if hi < 0 else " (worse)" if lo > 0 else ""
        lines.append(f"| {k} | {a.sum() / n.sum():.4f} | {b.sum() / n.sum():.4f} | "
                     f"{d.sum() / n.sum():+.4f} ({lo:+.4f} to {hi:+.4f}){flag} | {(d < 0).mean():.0%} |")
    return "\n".join(lines)


def fit_all(matches: list[dict], spec: dict, lam_mean: float = 10.0, lam_prob: float = 1.0) -> dict:
    """Linear weights of every strategy fitted on all rows (the trees are only judged, not exported)."""
    rows = [r for m in matches for r in _rows(m, spec["rows"])]
    if not rows:
        return {}
    names = _direct_names(matches, spec["rows"])
    S, D = _design(rows, spec, names)
    y = np.array([spec["y"](r) for r in rows], dtype=float)
    lam = lam_mean if spec["kind"] == "mean" else lam_prob
    out = {"rows": len(rows), "direct_inputs": names + (["team form (log-odds)", "team form (ewma)", "head-to-head"]
                                                        if spec["rows"] == "win" else [])}
    for k, cols in spec["strategies"].items():
        out[k] = {"columns": cols, "weights": [round(float(v), 6) for v in _fit(spec["kind"], S[:, cols], y, lam)]}
    if names:
        for k, (how, model) in DIRECT.items():
            if model == "linear":
                out[k] = {"weights": [round(float(v), 6) for v in _fit(spec["kind"], _inputs(how, S, D), y, lam)]}
    return out


@click.command()
@click.argument("rows", nargs=-1, type=click.Path(exists=True, path_type=Path))
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/stack-lab/report.md"))
@click.option("--min-train", default=60, help="Matches every strategy waits for before it is judged")
@click.option("--weights-out", type=click.Path(path_type=Path), default=None,
              help="Also fit every strategy on all matches and write the weights")
def main(rows: tuple[Path, ...], out: Path, min_train: int, weights_out: Path | None) -> None:
    parts, weights = [], {}
    for path in rows:
        matches = json.loads(path.read_text())
        if not matches:
            continue
        fam = "OD" if matches[0]["format"] == "OD" else "T20"
        mt = min(min_train, max(len(matches) // 3, 10))
        dates = sorted(str(m["date"]) for m in matches)
        parts.append(f"## {fam} ({len(matches)} matches, {dates[0]} to {dates[-1]}; judged after the first {mt})")
        for name, spec in TARGETS.items():
            parts.append(report(evaluate(matches, name, spec, mt), name, spec["kind"]))
            if weights_out:
                weights.setdefault(fam, {})[name] = fit_all(matches, spec)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("# Stacking lab\n\n" + "\n\n".join(parts) + "\n")
    if weights_out:
        weights_out.parent.mkdir(parents=True, exist_ok=True)
        weights_out.write_text(json.dumps(weights, indent=1))
    click.echo(out.read_text())


if __name__ == "__main__":
    main()
