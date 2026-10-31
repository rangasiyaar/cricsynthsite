"""Fantasy XI by win chance, on every scored result: with a 60-40 forecast take the favourite's top 60% of the XI
(7) and the other side's top 40% (4) by expected points; captain and vice-captain are the favourite's top two.
Compared with the XI we published, as a share of the best XI in hindsight.

    uv run python -m cricsim.fantasy_split
"""
import json

import click

from cricsim.fantasy import team_points
from cricsim.results import SITES, _fetch


def split_xi(players: dict, win: list[float], cv_overall: bool = False) -> tuple[list[str], str, str]:
    """players: {id: {"team": 0|1, "expected": x}}; win: [p0, p1]."""
    fav = 0 if win[0] >= win[1] else 1
    n = {fav: min(10, max(1, round(11 * max(win)))), 1 - fav: 0}
    n[1 - fav] = 11 - n[fav]
    ranked = {t: sorted((p for p, r in players.items() if r["team"] == t), key=lambda p: -players[p]["expected"])
              for t in (0, 1)}
    xi = ranked[fav][:n[fav]] + ranked[1 - fav][:n[1 - fav]]
    lead = sorted(xi, key=lambda p: -players[p]["expected"]) if cv_overall else ranked[fav]
    return xi, lead[0], lead[1]


@click.command()
def main() -> None:
    index = (_fetch("results/index.json", SITES) or {}).get("matches", [])
    rows = []
    for r in index:
        if not r.get("fantasy"):
            continue
        rep, doc = _fetch(f"results/{r['id']}.json", SITES), _fetch(f"matches/{r['id']}.json", SITES)
        if not rep or not doc or not rep.get("fantasy") or not doc.get("fantasy"):
            continue
        fz, real = doc["fantasy"]["players"], rep["fantasy"]["real"]
        best = rep["fantasy"]["best"]["points"]
        names = [t["name"] for t in doc["match"]["teams"]]
        win = [doc["summary"]["result"]["win"].get(n, 0.5) for n in names]
        xi, c, vc = split_xi(fz, win)
        xi2, c2, vc2 = split_xi(fz, win, cv_overall=True)
        ours = rep["fantasy"]["single"]
        rows.append({"id": r["id"], "win": max(win), "fav_won": r.get("favourite_won"), "best": best,
                     "ours": ours["points"], "split": round(team_points(xi, c, vc, real), 1),
                     "split_cv": round(team_points(xi2, c2, vc2, real), 1), "after": bool(rep["fantasy"].get("after"))})
    if not rows:
        click.echo("no scored fantasy results")
        return
    click.echo(f"{'match':52} {'fav':>4} {'won':>4} {'best':>6} {'ours':>6} {'split':>6} {'splitCV':>7}")
    for x in rows:
        click.echo(f"{x['id'][:52]:52} {x['win']:4.0%} {('yes' if x['fav_won'] else 'no'):>4} {x['best']:6.0f} "
                   f"{x['ours']:6.0f} {x['split']:6.0f} {x['split_cv']:7.0f}")
    n = len(rows)
    for key, label in (("ours", "published XI"), ("split", "win-% split, C/VC from favourite"),
                       ("split_cv", "win-% split, C/VC best two overall")):
        share = sum(x[key] / x["best"] for x in rows if x["best"]) / n
        wins = sum(x[key] > x["ours"] for x in rows) if key != "ours" else None
        click.echo(f"{label:38} mean {sum(x[key] for x in rows) / n:6.1f} pts, {share:.1%} of best"
                   + (f", beats published in {wins}/{n}" if wins is not None else ""))
    fw = [x for x in rows if x["fav_won"]]
    fl = [x for x in rows if x["fav_won"] is False]
    for sub, label in ((fw, "favourite won"), (fl, "favourite lost")):
        if sub:
            click.echo(f"{label} ({len(sub)}): published {sum(x['ours'] for x in sub) / len(sub):.1f}, "
                       f"split {sum(x['split'] for x in sub) / len(sub):.1f}, "
                       f"split C/VC overall {sum(x['split_cv'] for x in sub) / len(sub):.1f}")


if __name__ == "__main__":
    main()
