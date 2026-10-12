"""Rating lab: which player-rating formula best predicts how players actually perform?

    python -m cricsim.rating_lab --fixtures cricsim/fixtures --scorecards cricsim/results

For every scored match it takes the frozen pre-match forecast (fetched from the site, as cricsim.results does) and the
scorecard, works out what each player actually did as fantasy points (the usual T20 scoring: runs, boundaries,
milestones, strike rate, wickets, bowled/lbw, hauls, maidens, economy, catches, stumpings, run outs), and checks how
well each candidate formula, computed from the forecast alone, ranks the 22 players:

  - Spearman rank correlation with the actual points (batting, bowling, all-round), per match, then averaged
  - hit rate: is the actual best batter / bowler / MVP inside the formula's top 3?

The batting and bowling ratings and the MVP on the site come from the winner (app/lib/ratings.ts mirrors it).
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import click

from cricsim.results import SITES, Roster, _fetch, credited_bowler


# ── actual: fantasy points from the scorecard ─────────────────────────────────────────────────────────────────────

def _balls(overs: str | float) -> int:
    whole, _, part = str(overs).partition(".")
    return int(whole) * 6 + (int(part) if part else 0)


def actual_points(card: dict, roster: Roster) -> dict[str, dict[str, float]]:
    """{player id: {bat, bowl, field, total}} from the scorecard."""
    pts: dict[str, dict[str, float]] = {}

    def get(pid: str) -> dict[str, float]:
        return pts.setdefault(pid, {"bat": 0.0, "bowl": 0.0, "field": 0.0})

    for inn in card["innings"]:
        bat_team = roster.team(inn["team"])
        field_team = 1 - bat_team
        bowled_lbw: dict[str, int] = {}
        for b in inn["batting"]:
            pid = roster.player(b["name"], bat_team)
            if pid:
                r, n = b["runs"], b["balls"]
                p = r + b.get("fours", 0) + 2 * b.get("sixes", 0)
                p += 16 if r >= 100 else 8 if r >= 50 else 4 if r >= 30 else 0
                if r == 0 and b["dismissal"] and not b["dismissal"].lower().startswith("not out"):
                    p -= 2
                if n >= 10:
                    sr = 100 * r / n
                    p += 6 if sr > 170 else 4 if sr > 150 else 2 if sr >= 130 else -6 if sr < 50 else -4 if sr < 60 else -2 if sr < 70 else 0
                get(pid)["bat"] += p
            d = b["dismissal"].strip()
            bowler = credited_bowler(d)
            if bowler and re.match(r"^(b|lbw)\s", d):
                bowled_lbw[bowler] = bowled_lbw.get(bowler, 0) + 1
            # fielding
            m = re.match(r"^c\s+(?:\(sub\))?(.+?)\s+b\s+(.+)$", d)
            if d.startswith("c and b "):
                f = roster.player(d[len("c and b "):], field_team)
                if f:
                    get(f)["field"] += 8
            elif m and not m.group(1).startswith("(sub)"):
                f = roster.player(m.group(1), field_team)
                if f:
                    get(f)["field"] += 8
            elif d.startswith("st "):
                f = roster.player(re.sub(r"^st\s+(.+?)\s+b\s+.+$", r"\1", d), field_team)
                if f:
                    get(f)["field"] += 12
            elif d.startswith("run out"):
                who = re.findall(r"\(([^)]*)\)", d)
                for name in (who[0].split("/") if who else [])[:2]:
                    f = roster.player(name, field_team)
                    if f:
                        get(f)["field"] += 6
        for w in inn["bowling"]:
            pid = roster.player(w["name"], field_team)
            if not pid:
                continue
            k = w["wickets"]
            p = 25 * k + 8 * sum(v for name, v in bowled_lbw.items() if roster.player(name, field_team) == pid)
            p += 16 if k >= 5 else 8 if k >= 4 else 4 if k >= 3 else 0
            p += 12 * w.get("maidens", 0)
            balls = _balls(w["overs"])
            if balls >= 12:
                e = 6 * w["runs"] / balls
                p += 6 if e < 5 else 4 if e < 6 else 2 if e <= 7 else -6 if e > 12 else -4 if e > 11 else -2 if e >= 10 else 0
            get(pid)["bowl"] += p
    for v in pts.values():
        v["total"] = v["bat"] + v["bowl"] + v["field"]
    return pts


# ── predicted: candidate formulas from the forecast ───────────────────────────────────────────────────────────────

def _players(doc: dict) -> list[dict]:
    return [p for t in doc["summary"]["teams"] for p in t["players"]]


def _averages(doc: dict) -> tuple[float, float]:
    runs = balls = conceded = overs = 0.0
    for p in _players(doc):
        if p.get("batting"):
            runs += p["batting"]["runs"]["mean"] or 0
            balls += p["batting"]["balls"]["mean"] or 0
        if p.get("bowling"):
            conceded += p["bowling"]["runs"]["mean"] or 0
            overs += p["bowling"]["overs"]
    return (100 * runs / balls if balls else 130.0), (conceded / overs if overs else 8.0)


def value(doc: dict, wicket: float, sr_exp: float, econ_w: float) -> dict[str, dict[str, float]]:
    """The site's formula family: batting = E[runs]·(SR/avgSR)^sr_exp; bowling = E[wkts]·wicket + econ_w·runs saved."""
    avg_sr, avg_econ = _averages(doc)
    out = {}
    for p in _players(doc):
        b, w = p.get("batting"), p.get("bowling")
        bat = (b["runs"]["mean"] or 0) * ((b["strike_rate"] / avg_sr) ** sr_exp if b and b["strike_rate"] > 0 else 1) if b else 0
        bowl = ((w["wickets"]["mean"] or 0) * wicket + econ_w * w["overs"] * (avg_econ - w["economy"])) if w else 0
        out[p["id"]] = {"bat": max(0.0, bat), "bowl": max(0.0, bowl)}
    return out


def expected_fantasy(doc: dict) -> dict[str, dict[str, float]]:
    """Expected fantasy points from the forecast distributions (boundaries ≈ 20% bonus on runs; bowled/lbw ≈ 30% of
    wickets; economy bonus applied when the bowler is likely to bowl two overs or more)."""
    out = {}
    for p in _players(doc):
        b, w = p.get("batting"), p.get("bowling")
        bat = bowl = 0.0
        if b:
            r = b["runs"]["mean"] or 0
            pa = b.get("p_at_least") or {}
            bat = 1.2 * r + 4 * (pa.get("30", 0) - pa.get("50", 0)) + 8 * pa.get("50", 0) - 2 * b.get("p_duck", 0)
            sr = b["strike_rate"]
            bonus = 6 if sr > 170 else 4 if sr > 150 else 2 if sr >= 130 else -6 if sr < 50 else -4 if sr < 60 else -2 if sr < 70 else 0
            bat += bonus * min(1.0, (b["balls"]["mean"] or 0) / 10)
        if w and w.get("p_bowls", 0) > 0.05:
            k = w["wickets"]["mean"] or 0
            pw = w.get("p_wickets") or {}
            bowl = 27.4 * k + 4 * pw.get("3", 0)
            e = w["economy"]
            bonus = 6 if e < 5 else 4 if e < 6 else 2 if e <= 7 else -6 if e > 12 else -4 if e > 11 else -2 if e >= 10 else 0
            bowl += bonus * min(1.0, w["overs"] / 2) * w["p_bowls"]
        out[p["id"]] = {"bat": max(0.0, bat), "bowl": max(0.0, bowl)}
    return out


def probability(doc: dict) -> dict[str, dict[str, float]]:
    """Ranking by the chance of being top scorer / best bowler."""
    out = {}
    for p in _players(doc):
        b, w = p.get("batting"), p.get("bowling")
        out[p["id"]] = {"bat": b["p_top_scorer"] if b else 0.0, "bowl": w["p_best_bowler"] if w else 0.0}
    return out


def _roles(doc: dict, fx: dict | None) -> dict[str, str]:
    """Player id → fixture role (WK / BAT / AR / BOWL), by position in the XI."""
    out = {}
    for k, t in enumerate(doc["match"]["teams"]):
        roles = ((fx or {}).get("teams", [{}, {}])[k].get("roles") or []) if fx else []
        for i, pid in enumerate(t["players"]):
            out[pid] = roles[i] if i < len(roles) else ""
    return out


def with_fielding(pred: dict[str, dict[str, float]], roles: dict[str, str], wk: float, other: float) -> dict:
    """Adds expected fielding points to the batting side of the ledger (only the MVP total uses it)."""
    return {i: {"bat": v["bat"], "bowl": v["bowl"], "field": wk if roles.get(i) == "WK" else other} for i, v in pred.items()}


def rank_blend(pred: dict[str, dict[str, float]]) -> dict:
    """MVP as the sum of a player's batting and bowling percentile within the match (rewards all-rounders)."""
    ids = list(pred)
    out = {i: {"bat": 0.0, "bowl": 0.0} for i in ids}
    for key in ("bat", "bowl"):
        rk = _ranks([pred[i][key] for i in ids])
        for i, x in zip(ids, rk):
            out[i][key] = x / (len(ids) - 1) if pred[i][key] > 0 else 0.0
    return out


def candidates(doc: dict, fx: dict | None = None) -> dict[str, dict[str, dict[str, float]]]:
    roles = _roles(doc, fx)
    c = {"site now (w=12, sr^0.5, econ 1)": value(doc, 12, 0.5, 1),
         "expected fantasy points": expected_fantasy(doc),
         "top scorer / best bowler chance": probability(doc)}
    for wk in (8, 15, 20, 25):
        c[f"w={wk}, sr^0.5, econ 1"] = value(doc, wk, 0.5, 1)
    for sr in (0.0, 1.0):
        c[f"w=12, sr^{sr:g}, econ 1"] = value(doc, 12, sr, 1)
    for ew in (0.0, 0.5, 2.0):
        c[f"w=12, sr^0.5, econ {ew:g}"] = value(doc, 12, 0.5, ew)
    ef = expected_fantasy(doc)
    for wk, other in ((12, 4), (20, 6)):
        c[f"fantasy + fielding (wk {wk}, others {other})"] = with_fielding(ef, roles, wk, other)
        c[f"w=12, econ 0.5 + fielding (wk {wk}, others {other})"] = with_fielding(value(doc, 12, 0.5, 0.5), roles, wk, other)
    c["rank blend (bat pct + bowl pct)"] = rank_blend(value(doc, 12, 0.5, 0.5))
    c["rank blend + fielding"] = with_fielding(rank_blend(value(doc, 12, 0.5, 0.5)), roles, 0.25, 0.05)
    return c


# ── evaluation ────────────────────────────────────────────────────────────────────────────────────────────────────

def _ranks(xs: list[float]) -> list[float]:
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a: list[float], b: list[float]) -> float:
    if len(a) < 3:
        return float("nan")
    ra, rb = _ranks(a), _ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else float("nan")


def top_hit(pred: dict[str, float], actual: dict[str, float], k: int = 3) -> float:
    best = max(actual, key=actual.get)
    return 1.0 if best in sorted(pred, key=pred.get, reverse=True)[:k] else 0.0


def evaluate(matches: list[tuple[dict, dict, dict | None]]) -> dict:
    agg: dict[str, dict[str, list[float]]] = {}
    per_match = []
    for doc, card, fx in matches:
        roster = Roster(doc, fx)
        act = actual_points(card, roster)
        ids = [p["id"] for p in _players(doc)]
        a = {i: act.get(i, {"bat": 0, "bowl": 0, "field": 0, "total": 0}) for i in ids}
        per_match.append({"id": doc["match"]["id"], "matched": sum(1 for i in ids if i in act),
                          "mvp": max(ids, key=lambda i: a[i]["total"])})
        for name, pred in candidates(doc, fx).items():
            m = agg.setdefault(name, {k: [] for k in ("bat", "bowl", "mvp", "hit_bat", "hit_bowl", "hit_mvp")})
            for key in ("bat", "bowl"):
                m[key].append(spearman([pred[i][key] for i in ids], [a[i][key] for i in ids]))
                m["hit_" + key].append(top_hit({i: pred[i][key] for i in ids}, {i: a[i][key] for i in ids}))
            tot = {i: pred[i]["bat"] + pred[i]["bowl"] + pred[i].get("field", 0.0) for i in ids}
            m["mvp"].append(spearman([tot[i] for i in ids], [a[i]["total"] for i in ids]))
            m["hit_mvp"].append(top_hit(tot, {i: a[i]["total"] for i in ids}))
    mean = lambda xs: sum(x for x in xs if x == x) / max(1, sum(1 for x in xs if x == x))
    table = {name: {k: round(mean(v), 3) for k, v in m.items()} for name, m in agg.items()}
    return {"matches": per_match, "candidates": table}


@click.command()
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--scorecards", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/results"))
def main(fixtures: Path, scorecards: Path) -> None:
    fx = {json.loads(p.read_text())["id"]: json.loads(p.read_text()) for p in fixtures.glob("*.json")}
    matches = []
    for p in sorted(scorecards.glob("*.json")):
        card = json.loads(p.read_text())
        doc = _fetch(f"matches/{card['id']}.json", SITES)
        if doc is None:
            click.echo(f"- {card['id']}: forecast not found, skipped")
            continue
        matches.append((doc, card, fx.get(card["id"])))
    r = evaluate(matches)
    click.echo(f"### Rating lab: {len(matches)} matches\n")
    for m in r["matches"]:
        click.echo(f"- {m['id']}: {m['matched']}/22 players matched to the scorecard; actual MVP {m['mvp']}")
    click.echo("\n| Formula | Bat ρ | Bowl ρ | MVP ρ | Best bat in top 3 | Best bowl in top 3 | MVP in top 3 |")
    click.echo("|---|---|---|---|---|---|---|")
    for name, m in sorted(r["candidates"].items(), key=lambda kv: -(kv[1]["bat"] + kv[1]["bowl"] + kv[1]["mvp"])):
        click.echo(f"| {name} | {m['bat']:.2f} | {m['bowl']:.2f} | {m['mvp']:.2f} | {m['hit_bat']:.0%} | {m['hit_bowl']:.0%} | {m['hit_mvp']:.0%} |")


if __name__ == "__main__":
    main()
