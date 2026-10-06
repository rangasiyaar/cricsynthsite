"""Quantile models: P10 / median / P90 for runs, wickets and fantasy points.

One XGBoost model per target, trained with the multi-quantile objective so a
single model outputs all three quantiles. Saved as `player_q_<target>_<version>.json`
plus one `player_q_<version>.meta.json` holding the feature list, metrics and
the reference distributions used to turn raw numbers into percentiles.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

log = logging.getLogger(__name__)

QUANTILES = (0.1, 0.5, 0.9)
# target name -> training column
TARGETS = {"runs": "target_runs", "wickets": "target_wickets", "points": "target_points"}
# naive "last few matches" baseline each model has to beat
BASELINES = {"runs": "bat_runs_avg5", "wickets": "bowl_wkts_avg5", "points": "fp_last5_avg"}
_UPPER_BOUND = {"runs": None, "wickets": 10.0, "points": None}
_REF_GRID = np.linspace(0, 1, 101)
_COUNT_TARGETS = {"wickets"}


@dataclass
class QuantileModels:
    models: dict[str, xgb.XGBRegressor]
    features: list[str]
    version: str
    reference: dict[str, list[float]] = field(default_factory=dict)
    metrics: dict = field(default_factory=dict)

    def predict(self, X: pd.DataFrame) -> dict[str, np.ndarray]:
        """{target: array (n, 3)} with P10 <= median <= P90, never negative."""
        Xf = X[self.features].astype(float)
        out = {}
        for target, model in self.models.items():
            q = np.asarray(model.predict(Xf), dtype=float).reshape(len(Xf), len(QUANTILES))
            q = np.sort(q, axis=1)                      # quantile crossing guard
            q = np.clip(q, 0.0, _UPPER_BOUND[target])
            if target in _COUNT_TARGETS:
                # Wickets are small whole numbers: show the nearest integer. An exact 80%
                # range rarely exists for a count (0–1 vs 0–2 jumps from ~70% to ~95%).
                q = np.round(q)
            out[target] = q
        return out

    # ── persistence ──
    def save(self, out_dir: Path, name: str | None = None) -> Path:
        """Write models + metadata. Files are named by `name` (default: version)."""
        name = name or self.version
        out_dir.mkdir(parents=True, exist_ok=True)
        for target, model in self.models.items():
            model.save_model(str(out_dir / f"player_q_{target}_{name}.json"))
        meta = out_dir / f"player_q_{name}.meta.json"
        meta.write_text(json.dumps({
            "version": self.version, "quantiles": list(QUANTILES), "features": self.features,
            "targets": list(self.models), "reference": self.reference, "metrics": self.metrics,
        }, indent=2))
        return meta

    @classmethod
    def load(cls, out_dir: Path, name: str = "latest") -> "QuantileModels":
        meta = json.loads((out_dir / f"player_q_{name}.meta.json").read_text())
        models = {}
        for target in meta["targets"]:
            m = xgb.XGBRegressor()
            m.load_model(str(out_dir / f"player_q_{target}_{name}.json"))
            models[target] = m
        return cls(models, meta["features"], meta["version"], meta["reference"], meta["metrics"])


def pinball_loss(y: np.ndarray, q_pred: np.ndarray, alpha: float) -> float:
    diff = y - q_pred
    return float(np.mean(np.maximum(alpha * diff, (alpha - 1) * diff)))


def evaluate(models: QuantileModels, df: pd.DataFrame) -> dict:
    """Interval coverage, pinball loss and median MAE vs the naive baseline."""
    preds = models.predict(df)
    report = {}
    for target, col in TARGETS.items():
        if target not in preds or col not in df:
            continue
        mask = df[col].notna().to_numpy()
        if mask.sum() == 0:
            continue
        y = df.loc[mask, col].to_numpy(dtype=float)
        q = preds[target][mask]
        base = df.loc[mask, BASELINES[target]].fillna(0).to_numpy(dtype=float) if BASELINES[target] in df else np.zeros_like(y)
        report[target] = {
            "n": int(mask.sum()),
            "coverage_p10_p90": float(np.mean((y >= q[:, 0]) & (y <= q[:, 2]))),
            "pinball": {str(a): pinball_loss(y, q[:, i], a) for i, a in enumerate(QUANTILES)},
            "median_mae": float(np.mean(np.abs(y - q[:, 1]))),
            "baseline_mae": float(np.mean(np.abs(y - base))),
        }
    return report


def _fit_one(X_train, y_train, X_val, y_val) -> xgb.XGBRegressor:
    model = xgb.XGBRegressor(
        objective="reg:quantileerror",
        quantile_alpha=np.array(QUANTILES),
        n_estimators=600,
        learning_rate=0.05,
        max_depth=5,
        min_child_weight=5,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        tree_method="hist",
        n_jobs=-1,
        random_state=42,
        early_stopping_rounds=30 if len(X_val) else None,
    )
    eval_set = [(X_val, y_val)] if len(X_val) else None
    model.fit(X_train, y_train, eval_set=eval_set, verbose=False)
    return model


def train_quantile_models(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    features: list[str],
    version: str,
) -> QuantileModels:
    models = {}
    for target, col in TARGETS.items():
        tr = train_df[train_df[col].notna()]
        va = val_df[val_df[col].notna()] if col in val_df else val_df.iloc[0:0]
        if len(tr) < 50:
            log.warning("Skipping %s model — only %d training rows", target, len(tr))
            continue
        log.info("Training %s quantile model on %d rows (val %d)", target, len(tr), len(va))
        models[target] = _fit_one(
            tr[features].astype(float), tr[col].astype(float),
            va[features].astype(float), va[col].astype(float),
        )

    qm = QuantileModels(models, list(features), version)
    # Reference distributions (from training rows) that percentile scores are measured against.
    train_preds = qm.predict(train_df)
    ref = {"fp_ewm5": np.quantile(train_df["fp_ewm5"].fillna(0), _REF_GRID).tolist()}
    if "points" in train_preds:
        ref["points_p50"] = np.quantile(train_preds["points"][:, 1], _REF_GRID).tolist()
        ref["points_p10"] = np.quantile(train_preds["points"][:, 0], _REF_GRID).tolist()
    qm.reference = ref
    qm.metrics = {"validation": evaluate(qm, val_df) if len(val_df) else {}}
    for target, m in qm.metrics["validation"].items():
        log.info("%s — P10–P90 coverage %.1f%% | median MAE %.2f (baseline %.2f)",
                 target, m["coverage_p10_p90"] * 100, m["median_mae"], m["baseline_mae"])
    return qm
