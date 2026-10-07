"""Turn a fixture written with player names into a coverage file with player IDs.

    python -m cricsim.resolve --parquet data/parquet --fixture fixture.json --out coverage/matches/<id>.json

The fixture is a coverage document whose team "players" are names in batting order, plus an optional
"venue_search" (text matched against known venue names). Each name is matched against players who have
played for that team (same gender), by full name, registry aliases, then surname + initials; the most
recent appearance wins ties. A name that matches nobody is kept as a new player (simulated as a
league-average newcomer) and reported.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import click
import duckdb


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z ]", " ", s).split())


def _keys(name: str) -> tuple[str, str, str]:
    """(full, surname, first initial)"""
    w = _norm(name).split()
    return " ".join(w), (w[-1] if w else ""), (w[0][0] if w else "")


def candidates(con, parquet: Path, team: str, gender: str) -> list[dict]:
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    m = (parquet / "matches" / "*.parquet").as_posix()
    pl = (parquet / "players" / "*.parquet").as_posix()
    rows = con.execute(f"""
        SELECT x.player_id, any_value(x.name), max(m.match_date) AS last, count(*) AS n,
               any_value(p.name), any_value(p.unique_name), any_value(p.aliases)
        FROM read_parquet('{mp}') x JOIN read_parquet('{m}') m USING (match_id)
        LEFT JOIN read_parquet('{pl}') p ON p.player_id = x.player_id
        WHERE x.team = ? AND m.gender = ? AND x.player_id IS NOT NULL
        GROUP BY x.player_id""", [team, gender]).fetchall()
    out = []
    for pid, scored, last, n, reg, uniq, aliases in rows:
        names = {x for x in [scored, reg, uniq, *(aliases or [])] if x}
        out.append({"id": pid, "name": scored or reg, "last": str(last), "n": n, "names": names})
    return out


def match_name(name: str, cands: list[dict]) -> tuple[dict | None, str]:
    full, sur, ini = _keys(name)
    exact = [c for c in cands if any(_keys(x)[0] == full for x in c["names"])]
    if exact:
        return max(exact, key=lambda c: (c["last"], c["n"])), "exact"
    # registry names are usually "initials surname" (e.g. "JL Nkomo"): surname + first initial
    loose = [c for c in cands if any(_keys(x)[1] == sur and (_keys(x)[0].split()[0][:1] == ini
                                                                  or ini in _keys(x)[0].split()[0])
                                     for x in c["names"])]
    if loose:
        return max(loose, key=lambda c: (c["last"], c["n"])), "surname+initial"
    sur_only = [c for c in cands if any(_keys(x)[1] == sur for x in c["names"])]
    if len(sur_only) == 1:
        return sur_only[0], "surname"
    return None, "unresolved"


def find_venue(con, parquet: Path, text: str) -> tuple[str | None, str | None]:
    m = (parquet / "matches" / "*.parquet").as_posix()
    row = con.execute(f"""SELECT venue_id, any_value(venue), count(*) n FROM read_parquet('{m}')
                          WHERE lower(venue) LIKE ? OR lower(venue_raw) LIKE ? GROUP BY 1 ORDER BY n DESC LIMIT 1""",
                      [f"%{text.lower()}%"] * 2).fetchone()
    return (row[0], row[1]) if row else (None, None)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--fixture", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--out", type=click.Path(path_type=Path), required=True)
def main(parquet: Path, fixture: Path, out: Path) -> None:
    fx = json.loads(fixture.read_text())
    con = duckdb.connect()
    missing = []
    for team in fx["teams"]:
        cands = candidates(con, parquet, team["name"], fx["gender"])
        ids = []
        for name in team["players"]:
            c, how = match_name(name, cands)
            if c is None:
                missing.append(f"{team['name']}: {name}")
                click.echo(f"  {team['name']:12} {name:28} → no record, simulated as a newcomer")
                ids.append(f"new:{name}")
                continue
            ids.append(c["id"])
            click.echo(f"  {team['name']:12} {name:28} → {c['id']} {c['name']:24} ({how}; {c['n']} matches, last {c['last']})")
        team["players"] = ids
    if fx.get("venue_search"):
        vid, vname = find_venue(con, parquet, fx.pop("venue_search"))
        click.echo(f"  venue → {vid} ({vname})")
        if vid:
            fx["venue_id"], fx["venue"] = vid, fx.get("venue") or vname
    if missing:
        click.echo("  newcomers: " + "; ".join(missing))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fx, indent=2))


if __name__ == "__main__":
    main()
