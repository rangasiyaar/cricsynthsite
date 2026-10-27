"""Turn a fixture written with player names into a coverage file with player IDs.

    python -m cricsim.resolve --parquet data/parquet --fixture fixture.json --out coverage/matches/<id>.json

The fixture is a coverage document whose team "players" are names in batting order, plus an optional
"venue_search" (text matched against known venue names). Each name is matched against players who have
played for that team (same gender), by full name, registry aliases, then surname + initials; the most
recent appearance wins ties. A name not found in the team falls back to every player of that gender
(same rules), so league records count for players not yet capped. A name that matches nobody is kept as a new player (simulated as a
league-average newcomer) and reported.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import click
import duckdb

try:                                    # same city spellings as the data build
    from cricdata.names import canonical_city
except ImportError:                     # pragma: no cover
    def canonical_city(city):
        return city


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z ]", " ", s).split())


def _keys(name: str) -> tuple[str, str, str]:
    """(full, surname, first initial)"""
    w = _norm(name).split()
    return " ".join(w), (w[-1] if w else ""), (w[0][0] if w else "")


def candidates(con, parquet: Path, team: str | None, gender: str) -> list[dict]:
    """Players who have played for `team` (or, with team=None, for anyone) in matches of this gender."""
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    m = (parquet / "matches" / "*.parquet").as_posix()
    pl = (parquet / "players" / "*.parquet").as_posix()
    rows = con.execute(f"""
        SELECT x.player_id, any_value(x.name), max(m.match_date) AS last, count(*) AS n,
               any_value(p.name), any_value(p.unique_name), any_value(p.aliases)
        FROM read_parquet('{mp}') x JOIN read_parquet('{m}') m USING (match_id)
        LEFT JOIN read_parquet('{pl}') p ON p.player_id = x.player_id
        WHERE (x.team = ? OR ? IS NULL) AND m.gender = ? AND x.player_id IS NOT NULL
        GROUP BY x.player_id""", [team, team, gender]).fetchall()
    out = []
    for pid, scored, last, n, reg, uniq, aliases in rows:
        names = {x for x in [scored, reg, uniq, *(aliases or [])] if x}
        out.append({"id": pid, "name": scored or reg, "last": str(last), "n": n, "names": names})
    return out


def _loose(name: str, variant: str) -> bool:
    """Same surname, and the first name agrees: initials ("BKG Mendis") must contain the first initial; a written
    first name must share its first three letters ("Hassan" for "Hasan", not "Abdul" for "Aqeel"), or every word
    of the variant appears in the name ("Salman Mirza" for "Mohammad Salman Mirza")."""
    full, sur, ini = _keys(name)
    words = _norm(variant).split()
    if len(words) < 2 or words[-1] != sur:
        return False
    raw = variant.split()[0]
    if raw.isalpha() and raw.isupper() and len(raw) <= 4:      # registry initials
        return ini in raw.lower()
    first = full.split()[0]
    return words[0][:3] == first[:3] or set(words) <= set(full.split())


def _shorter(name: str, variant: str) -> bool:
    """The record uses a shorter form of the name: same first name, every word in the full name ("Syed Aziz" for
    "Syed Aziz Mubarak", "Muhammad Amir" for "Muhammad Amir Azim"). Only within the player's own team."""
    full = _keys(name)[0].split()
    words = _norm(variant).split()
    return len(words) >= 2 and len(words) < len(full) and words[0] == full[0] and set(words) <= set(full)


def match_name(name: str, cands: list[dict], taken: set[str] = frozenset(), shorter: bool = False) -> tuple[dict | None, str]:
    """Full name / alias, else surname + first initial. Never surname alone: "Kamil Pooran" is not "N Pooran".
    Players in `taken` (already matched in this XI) are skipped, so two Mendises don't both become Kusal."""
    full, _, _ = _keys(name)
    pool = [c for c in cands if c["id"] not in taken]
    exact = [c for c in pool if any(_keys(x)[0] == full for x in c["names"])]
    if exact:
        return max(exact, key=lambda c: (c["last"], c["n"])), "exact"
    loose = [c for c in pool if any(_loose(name, x) for x in c["names"])]
    if loose:
        return max(loose, key=lambda c: (c["last"], c["n"])), "surname+initial"
    short = [c for c in pool if any(_shorter(name, x) for x in c["names"])] if shorter else []
    if len(short) == 1:
        return short[0], "shorter name"
    return None, "unresolved"


def find_venue(con, parquet: Path, text: str, city: str | None = None) -> tuple[str | None, str | None]:
    """The ground whose name contains `text`, most matches first. With a city (the fixture's own, or the part of its
    venue after the last comma) only grounds in that city count, so a name several cities share can't pick the wrong
    one; without a usable city, a search matching grounds in several cities is reported."""
    m = (parquet / "matches" / "*.parquet").as_posix()
    like = f"%{text.lower()}%"
    if city:       # the city's own grounds first: a common word ("stadium") must not lose them below the top 20
        c = (canonical_city(city.strip()) or city.strip()).lower()
        local = con.execute(f"""SELECT venue_id, any_value(venue) FROM read_parquet('{m}')
                                WHERE (lower(venue) LIKE ? OR lower(venue_raw) LIKE ?)
                                  AND (lower(city) = ? OR lower(venue) LIKE ?)
                                GROUP BY 1 ORDER BY count(*) DESC LIMIT 1""", [like, like, c, f"%{c}%"]).fetchall()
        if local:
            return local[0][0], local[0][1]
    rows = con.execute(f"""SELECT venue_id, any_value(venue), lower(any_value(city)), count(*) n FROM read_parquet('{m}')
                           WHERE lower(venue) LIKE ? OR lower(venue_raw) LIKE ? GROUP BY 1 ORDER BY n DESC LIMIT 20""",
                       [like, like]).fetchall()
    if not rows:
        return None, None
    cities = {r[2] for r in rows if r[2] and r[3] >= max(3, rows[0][3] // 4)}
    if len(cities) > 1:
        click.echo(f"  warning: venue search {text!r} matches grounds in {', '.join(sorted(cities))}; "
                   "add the city to the fixture's venue")
    return rows[0][0], rows[0][1]


BOWLING_ROLES = {"BOWL", "AR"}   # backtest: telling the engine who bowls, 2+ wickets Brier -0.002 to -0.003


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--fixture", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--out", type=click.Path(path_type=Path), required=True)
def main(parquet: Path, fixture: Path, out: Path) -> None:
    fx = json.loads(fixture.read_text())
    con = duckdb.connect()
    missing = []
    everyone = None
    for team in fx["teams"]:
        # records name women's sides like men's ("India", not "India Women")
        cands = candidates(con, parquet, team.get("record_name") or re.sub(r"\s+Women$", "", team["name"]), fx["gender"])
        aka = team.get("aka") or {}            # other spellings to try, e.g. {"Kranti Gaud": ["Kranti Goud"]}

        def match(name, pool, taken=frozenset(), shorter=False):
            for variant in [name, *aka.get(name, [])]:
                c, how = match_name(variant, pool, taken, shorter)
                if c is not None:
                    return c, how if variant == name else f"{how} as {variant}"
            return None, "unresolved"
        # exact names first, so a loose match can't take a player who is named in full elsewhere in the XI
        found: dict[str, tuple[dict | None, str]] = {}
        for name in team["players"]:
            c, how = match(name, cands)
            if how.startswith("exact"):
                found[name] = (c, how)
        taken = {c["id"] for c, _ in found.values()}
        ids = []
        for name in team["players"]:
            c, how = found.get(name) or match(name, cands, taken, shorter=True)
            if c is None:      # not capped for this team yet: their league / domestic record still counts
                everyone = everyone or candidates(con, parquet, None, fx["gender"])
                c, how = match(name, everyone, taken)
                how = f"{how}, other teams"
            if c is None:
                missing.append(f"{team['name']}: {name}")
                click.echo(f"  {team['name']:12} {name:28} → no record, simulated as a newcomer")
                ids.append(f"new:{name}")
                continue
            taken.add(c["id"])
            ids.append(c["id"])
            click.echo(f"  {team['name']:12} {name:28} → {c['id']} {c['name']:24} ({how}; {c['n']} matches, last {c['last']})")
        by_name = dict(zip(team["players"], ids))
        if team.get("bowlers"):      # bowling plan, written as names from the XI
            team["bowlers"] = [by_name[b] for b in team["bowlers"]]
        elif team.get("roles"):      # otherwise who may bowl comes from the roles: bowlers and all-rounders
            listed = [by_name[n] for n, r in zip(team["players"], team["roles"]) if str(r).upper() in BOWLING_ROLES]
            if len(listed) >= 5:     # a full attack, else leave it to the players' records
                team["bowlers"] = listed
        team["players"] = ids
    if fx.get("venue_search") and not fx.get("venue_id"):        # a pinned ground ID wins over the search
        city = fx.get("city") or (fx["venue"].rsplit(",", 1)[1] if "," in (fx.get("venue") or "") else None)
        vid, vname = find_venue(con, parquet, fx["venue_search"], city)
        click.echo(f"  venue → {vid} ({vname})")
        if vid:
            fx["venue_id"], fx["venue"] = vid, fx.get("venue") or vname
    fx.pop("venue_search", None)
    if fx.get("date") and fx.get("format"):    # recent real fantasy points, for the learned fantasy pick
        from datetime import date as _date

        from cricsim import fantasy_history
        ids = {p for t in fx["teams"] for p in t["players"] if not p.startswith("new:")}
        hist = fantasy_history.build(con, parquet, fantasy_history.family(fx["format"]), players=ids)
        day = _date.fromisoformat(fx["date"])
        fx["form"] = {p: hist.features(p, day) for p in sorted(ids)}
        click.echo(f"  fantasy form: {sum(f['n'] > 0 for f in fx['form'].values())}/{len(ids)} players with past matches")
        fam = fantasy_history.family(fx["format"])
        from cricsim.stack import families
        if fam in families():                  # recent real wickets, for the bowlers' blended forecasts
            stats = fantasy_history.build_stats(con, parquet, fam, players=ids)
            fx["bowl_form"] = {p: fantasy_history.form(stats["wkts"], p, day, hit=2) for p in sorted(ids)}
            click.echo(f"  bowling form: {sum(f['n'] > 0 for f in fx['bowl_form'].values())}/{len(ids)} players have bowled")
    if missing:
        click.echo("  newcomers: " + "; ".join(missing))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fx, indent=2))


if __name__ == "__main__":
    main()
