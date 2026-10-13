"""Turn a pasted scorecard (the usual web layout, copied as text) into a results file.

    python -m cricsim.scorecard --id pak-v-sl-t20i-rawalpindi-2026-10-11 < scorecard.txt > cricsim/results/<id>.json

Each innings: team name, "215-3 (20 Ov)", batting rows (name, dismissal, R, B, 4s, 6s, SR), "Extras",
"5 (b 0, lb 0, w 4, nb 1, p 0)", "Total", "Did not Bat", bowling rows (name, O, M, R, W, NB, WD, ECO),
"Fall of Wickets" (name, "55-1", "6.5"), "Powerplays" (… "0.1 - 6", runs). Lines of "*" are ignored.
"""
from __future__ import annotations

import json
import re
import sys

import click

SCORE = re.compile(r"^(\d+)(?:-(\d+))?\s*\((\d+(?:\.\d)?)\s*Ov\)$")
NUM = re.compile(r"^-?\d+(?:\.\d+)?$")
HEADERS = {"Batter", "R", "B", "4s", "6s", "SR", "Bowler", "O", "M", "W", "NB", "WD", "ECO", "Score", "Over",
           "Overs", "Runs", "Mandatory", "Total", "Did not Bat", "Extras", "Fall of Wickets", "Powerplays"}


def _lines(text: str) -> list[str]:
    out = []
    for raw in text.splitlines():
        s = raw.strip()
        if not s or set(s) <= {"*", " "}:
            continue
        out.append(re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s))       # markdown links → names
    return out


def parse(text: str) -> dict:
    L = _lines(text)
    starts = [i for i in range(1, len(L)) if SCORE.match(L[i]) and L[i - 1] not in HEADERS]
    innings = []
    for n, i in enumerate(starts):
        end = starts[n + 1] - 1 if n + 1 < len(starts) else len(L)
        innings.append(_innings(L[i - 1], L[i], L[i + 1:end]))
    card = {"innings": innings}
    if len(innings) == 2:
        a, b = innings
        if b["runs"] > a["runs"]:
            card["winner"] = b["team"]
            card["result"] = f"{b['team']} won by {_n(10 - b['wickets'], 'wicket')}"
        elif a["runs"] > b["runs"]:
            card["winner"] = a["team"]
            card["result"] = f"{a['team']} won by {_n(a['runs'] - b['runs'], 'run')}"
        else:
            card["result"] = "Tie"
    return card


def _n(k: int, word: str) -> str:
    return f"{k} {word}{'' if k == 1 else 's'}"


def _innings(team: str, score: str, L: list[str]) -> dict:
    m = SCORE.match(score)
    inn = {"team": team, "runs": int(m.group(1)), "wickets": int(m.group(2) or 10), "overs": m.group(3),
           "batting": [], "bowling": [], "fall_of_wickets": []}
    i = 0

    def take_nums(k):
        nonlocal i
        vals = []
        while len(vals) < k and i < len(L) and NUM.match(L[i]):
            vals.append(float(L[i]) if "." in L[i] else int(L[i]))
            i += 1
        return vals

    section = None
    while i < len(L):
        s = L[i]
        if s in ("Batter", "Bowler", "Fall of Wickets", "Powerplays", "Extras", "Did not Bat"):
            section = s
            i += 1
            continue
        if s in HEADERS:
            i += 1
            continue
        if section == "Batter":
            name = re.sub(r"\s*\((c|wk|c & wk|c and wk)\)\s*$", "", s).strip()
            i += 1
            dismissal = ""
            if i < len(L) and not NUM.match(L[i]):
                dismissal = L[i]
                i += 1
            r, b, f4, f6, _sr = (take_nums(5) + [0] * 5)[:5]
            inn["batting"].append({"name": name, "dismissal": dismissal, "runs": int(r), "balls": int(b),
                                   "fours": int(f4), "sixes": int(f6)})
        elif section == "Extras":
            ex = dict((k, int(v)) for k, v in re.findall(r"\b(b|lb|w|nb|p)\s+(\d+)", s))
            inn["extras"] = {k: ex.get(k, 0) for k in ("b", "lb", "w", "nb", "p")}
            section = None
            i += 1
        elif section == "Bowler":
            name = re.sub(r"\s*\((c|wk|c & wk|c and wk)\)\s*$", "", s).strip()
            i += 1
            o, mdn, r, w, nb, wd, _eco = (take_nums(7) + [0] * 7)[:7]
            inn["bowling"].append({"name": name, "overs": str(o), "maidens": int(mdn), "runs": int(r), "wickets": int(w),
                                   "no_balls": int(nb), "wides": int(wd)})
        elif section == "Fall of Wickets":
            name = s
            i += 1
            if i + 1 < len(L) and re.match(r"^\d+-\d+$", L[i]):
                runs, wkt = map(int, L[i].split("-"))
                inn["fall_of_wickets"].append({"wicket": wkt, "batter": name, "score": runs, "over": L[i + 1]})
                i += 2
        elif section == "Powerplays":
            if re.match(r"^0\.1\s*-\s*\d+", s) and i + 1 < len(L) and NUM.match(L[i + 1]):
                inn.setdefault("powerplay_runs", int(L[i + 1]))
                i += 2
            else:
                i += 1
        else:
            i += 1
    return inn


@click.command()
@click.option("--id", "match_id", required=True)
def main(match_id: str) -> None:
    card = {"id": match_id, **parse(sys.stdin.read())}
    click.echo(json.dumps(card, indent=1))


if __name__ == "__main__":
    main()
