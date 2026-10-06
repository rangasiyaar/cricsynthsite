"""Run the Pattern Lab: every catalog pattern + descriptive hazard curves → report.

    python -m cricsim.patterns --parquet data/parquet --out data/patterns/report
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, replace
from pathlib import Path

import click
import duckdb

from cricsim.patterns.catalog import CATALOG, OUTCOMES, STRATA, Pattern
from cricsim.patterns.features import build_balls, has_attributes
from cricsim.patterns.stats import Effect, benjamini_hochberg, mantel_haenszel, verdict

log = logging.getLogger(__name__)
SPLIT_YEAR = 2021        # discover on matches before this year, validate on this year onwards


def _strata_counts(con, p: Pattern, split_year: int) -> dict[str, list[tuple[int, int, int, int]]]:
    cols = ", ".join(p.strata)
    out = OUTCOMES[p.outcome]
    rows = con.execute(f"""
        SELECT {cols}, (year >= {split_year}) AS late,
               sum(CASE WHEN coalesce({p.exposed}, FALSE) AND {out} THEN 1 ELSE 0 END) AS a,
               sum(CASE WHEN coalesce({p.exposed}, FALSE) THEN 1 ELSE 0 END) AS n1,
               sum(CASE WHEN NOT coalesce({p.exposed}, FALSE) AND {out} THEN 1 ELSE 0 END) AS b,
               sum(CASE WHEN NOT coalesce({p.exposed}, FALSE) THEN 1 ELSE 0 END) AS n0
        FROM balls WHERE {p.population}
        GROUP BY ALL
    """).fetchall()
    k = len(p.strata)
    split = {"disc": [], "valid": [], "full": []}
    full: dict[tuple, list[int]] = {}
    for r in rows:
        key, late, (a, n1, b, n0) = r[:k], r[k], r[k + 1:]
        split["valid" if late else "disc"].append((int(a), int(n1), int(b), int(n0)))
        acc = full.setdefault(key, [0, 0, 0, 0])
        for i, v in enumerate((a, n1, b, n0)):
            acc[i] += int(v)
    split["full"] = [tuple(v) for v in full.values()]
    return split


def _effect_dict(e: Effect) -> dict:
    d = asdict(e)
    d["exposed_rate"] = round(e.exposed_rate, 5) if e.exposed_balls else None
    d["expected_rate"] = round(e.expected_rate, 5) if e.exposed_balls else None
    for k in ("rr", "lo", "hi"):
        d[k] = round(d[k], 3) if d[k] is not None else None
    return d


WICKET_OUTCOMES = {"wicket", "bowler_wicket"}
_TOKEN = re.compile(r"[a-z_][a-z0-9_]*")
_SQL_WORDS = {"and", "or", "not", "is", "null", "between", "true", "false", "coalesce", "least", "cast", "as",
              "int", "over", "in"}
_LITERAL = re.compile(r"'[^']*'")


def _columns(sql: str) -> set[str]:
    return {t for t in _TOKEN.findall(_LITERAL.sub(" ", sql.lower())) if t not in _SQL_WORDS}


def _adjusted(p: Pattern, real: list[Pattern]) -> Pattern:
    """Also hold established wicket effects equal, unless they're about the same variables."""
    mine = _columns(p.exposed)
    extra = tuple(f"coalesce({q.exposed}, FALSE)" for q in real
                  if q.id != p.id and not (_columns(q.exposed) & mine))
    return replace(p, strata=p.strata + extra) if extra else p


def run_patterns(con, split_year: int = SPLIT_YEAR, catalog: list[Pattern] = CATALOG) -> list[dict]:
    """Two passes. Pass 1 controls for the match situation. Pass 2 also controls for the wicket
    effects pass 1 found real — otherwise a pattern that merely correlates with a real effect
    (e.g. who is on strike at the start of an over) inherits a fake effect."""
    attrs = has_attributes(con)

    def test(patterns):
        out = {}
        for p in patterns:
            counts = _strata_counts(con, p, split_year)
            out[p.id] = {k: mantel_haenszel(v) for k, v in counts.items()}
        qs = benjamini_hochberg([out[p.id]["disc"].p for p in patterns])
        return out, dict(zip((p.id for p in patterns), qs))

    runnable = [p for p in catalog if not (p.needs == "attributes" and not attrs)]
    first, q1 = test(runnable)
    real = [p for p in runnable if p.outcome in WICKET_OUTCOMES
            and verdict(p.folklore, first[p.id]["disc"], first[p.id]["valid"], first[p.id]["full"], q1[p.id])[0]
            in ("real", "reversed")]
    second, q2 = test([_adjusted(p, real) if p.outcome in WICKET_OUTCOMES else p for p in runnable])

    results = []
    for p in catalog:
        base = {"id": p.id, "title": p.title, "question": p.question, "category": p.category,
                "outcome": p.outcome, "folklore": p.folklore}
        if p.id not in second:
            results.append({**base, "verdict": "needs data",
                            "why": "Needs batting-hand / bowling-style data, which Cricsheet doesn't include."})
            continue
        e = second[p.id]
        r = {**base, **{k: _effect_dict(v) for k, v in e.items()},
             "situation_only_rr": _effect_dict(first[p.id]["full"])["rr"],
             "adjusted_for": [q.id for q in real if q.id != p.id and p.outcome in WICKET_OUTCOMES
                              and not (_columns(q.exposed) & _columns(p.exposed))],
             "q_discovery": round(q2[p.id], 6) if q2[p.id] is not None else None}
        r["verdict"], r["why"] = verdict(p.folklore, e["disc"], e["valid"], e["full"], q2[p.id])
        results.append(r)
    return results


CURVES = {
    "batter_balls_faced": ("least(batter_balls_before, 40)", ("format", "gender", "innings_no", "phase_bucket", "wk_bucket")),
    "dot_streak": ("least(dots_before, 8)", STRATA),
    "partnership_balls": ("least(CAST(part_balls / 6 AS INT) * 6, 60)", STRATA),
    "ball_in_over": ("legal_ball_in_over", STRATA),
    "wickets_last_12_balls": ("least(wkts_last12, 3)", STRATA),
    "bowler_spell_over": ("least(spell_over, 4)", STRATA),
}


def hazard_curves(con) -> dict[str, list[dict]]:
    """Wicket rate by value, relative to what the situation alone predicts (O/E, 1.0 = normal)."""
    out = {}
    for name, (expr, strata) in CURVES.items():
        cols = ", ".join(strata)
        rows = con.execute(f"""
            WITH x AS (SELECT {cols}, {expr} AS v, is_wicket FROM balls WHERE is_legal AND {expr} IS NOT NULL),
                 s AS (SELECT {cols}, avg(CAST(is_wicket AS DOUBLE)) AS rate FROM x GROUP BY ALL)
            SELECT v, count(*) AS balls, sum(CAST(is_wicket AS INT)) AS wickets, sum(s.rate) AS expected
            FROM x JOIN s USING ({cols}) GROUP BY v ORDER BY v
        """).fetchall()
        out[name] = [{"value": int(v), "balls": int(n), "wicket_rate": round(w / n, 5) if n else None,
                      "o_e": round(w / e, 3) if e else None} for v, n, w, e in rows]
    return out


ICON = {"real": "✅ real", "reversed": "🔄 reversed", "weak": "〰 weak", "myth": "❌ myth",
        "inconclusive": "❔ inconclusive", "insufficient data": "… too little data", "needs data": "🧩 needs data"}


def write_report(summary: dict, results: list[dict], curves: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.with_suffix(".json").write_text(json.dumps({"summary": summary, "patterns": results, "curves": curves},
                                                    indent=2, default=str))
    lines = ["# Pattern Lab", "",
             f"{summary['balls']:,} limited-overs balls · discovery before {summary['split_year']}, "
             f"validation {summary['split_year']} onwards. RR = rate on pattern balls ÷ rate on comparable "
             "balls in the same situation (1.00 = no effect). Balls with known batting hand: "
             f"{100 * summary.get('attribute_coverage', {}).get('batting_hand', 0):.0f}%, bowling style: "
             f"{100 * summary.get('attribute_coverage', {}).get('bowling_kind', 0):.0f}%.", "",
             "| Pattern | Verdict | RR (95% CI) | Situation-only RR | Rate: pattern v expected | Discovery RR | Validation RR | Pattern balls |",
             "|---|---|---|---|---|---|---|---|"]
    for r in results:
        if "full" not in r:
            lines.append(f"| {r['title']} | {ICON[r['verdict']]} | — | — | — | — | — | — |")
            continue
        f, d, v = r["full"], r["disc"], r["valid"]
        ci = f"{f['rr']:.2f} ({f['lo']:.2f}–{f['hi']:.2f})" if f["lo"] is not None else (f"{f['rr']:.2f}" if f["rr"] is not None else "—")
        rate = (f"{100 * f['exposed_rate']:.2f}% v {100 * f['expected_rate']:.2f}%"
                if f["exposed_rate"] is not None and f["expected_rate"] is not None else "—")
        lines.append(f"| {r['title']} ({r['outcome']}) | {ICON[r['verdict']]} | {ci} | {r['situation_only_rr']} | {rate} | "
                     f"{d['rr'] if d['rr'] is not None else '—'} | {v['rr'] if v['rr'] is not None else '—'} | "
                     f"{f['exposed_balls']:,} |")
    lines += ["", "## Hazard curves (wicket rate ÷ situation-expected; 1.00 = normal)", ""]
    for name, rows in curves.items():
        lines.append(f"**{name.replace('_', ' ')}**: " + " · ".join(
            f"{r['value']}: {r['o_e']}" for r in rows if r["o_e"] is not None and r["balls"] >= 2000))
        lines.append("")
    path.with_suffix(".md").write_text("\n".join(lines) + "\n")


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--attributes", type=click.Path(path_type=Path), default=None,
              help="Parquet with player_id, batting_hand, bowling_arm, bowling_kind "
                   "(default: <parquet>/attributes/attributes.parquet if present — see `cricdata attributes`)")
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/patterns/report"))
@click.option("--split-year", default=SPLIT_YEAR, show_default=True)
@click.option("--memory", default="3GB", show_default=True)
def main(parquet: Path, attributes: Path | None, out: Path, split_year: int, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    con.execute(f"SET temp_directory='{(out.parent / '.duckdb_tmp').as_posix()}'")   # spill big windows to disk
    con.execute("SET preserve_insertion_order=false")
    attributes = attributes or parquet / "attributes" / "attributes.parquet"
    n = build_balls(con, parquet, attributes)
    log.info("Built features for %d balls", n)
    results = run_patterns(con, split_year)
    curves = hazard_curves(con)
    covered = con.execute("SELECT avg(CAST(batting_hand IS NOT NULL AS DOUBLE)), "
                          "avg(CAST(bowling_kind IS NOT NULL AS DOUBLE)) FROM balls").fetchone()
    summary = {"balls": n, "split_year": split_year,
               "attribute_coverage": {"batting_hand": round(covered[0] or 0, 3), "bowling_kind": round(covered[1] or 0, 3)},
               "verdicts": {k: sum(r["verdict"] == k for r in results) for k in ICON}}
    write_report(summary, results, curves, out)
    click.echo(out.with_suffix(".md").read_text())
