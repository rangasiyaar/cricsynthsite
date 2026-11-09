"""Results: how the forecast we published before a match compared with what happened.

    python -m cricsim.results --fixtures cricsim/fixtures --scorecards cricsim/results --out data/publish \
        [--site https://cricsynthesis.in]

1. Freeze. Once a fixture has started, publish-site stops re-simulating it. Its forecast, exactly as it was live
   before the start, is carried forward from the site into <out>/matches/<id>.json (+ pack) and listed in
   <out>/archive.json, so the match centre and the results page keep showing what we said beforehand.
2. Score. Every scorecard in <scorecards>/<id>.json is checked against that frozen forecast, tab by tab
   (Overview, Scores, Wickets, Players, Matchups) → <out>/results/<id>.json and <out>/results/index.json.
3. Fantasy. The forecast's fantasy picks (one XI and a set of five teams) are scored on the scorecard with the
   same points table, as a share of the best XI anyone could have picked afterwards. Matches published before
   the Fantasy tab existed use picks made afterwards by a model trained only on earlier matches
   (<picks>/<id>.json, written by `python -m cricsim.fantasy_check --picks-out`), and say so.

A range check "hits" when the actual value lands inside the forecast's 80% range (10th–90th percentile), so a
well-calibrated forecast hits about 80% of them; pick checks (favourite, top scorer, duels) hit when the actual
outcome is the one, or among the few, we rated most likely.
"""
from __future__ import annotations

import json
import re
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim.fantasy import pick_xi, scorecard_points, team_points
from cricsim.insights import tidy

IST = timezone(timedelta(hours=5, minutes=30))
TABS = ("Overview", "Scores", "Wickets", "Players", "Matchups")
SITES = ("https://cricsynthesis.in", "https://cricsynthesis.web.app")


# ── when a match counts as started ────────────────────────────────────────────────────────────────────────────────

def kickoff(fx: dict) -> datetime | None:
    if not fx.get("date"):
        return None
    t = fx.get("start_time") or "23:59"
    return datetime.fromisoformat(f"{fx['date']}T{t}:00").replace(tzinfo=IST)


LIVE_HOURS = {"T10": 2, "T20": 4, "HUNDRED": 3.5, "OD": 9}      # as the app's schedule.ts: surely over by then


def still_on(fx: dict, now: datetime | None = None) -> bool:
    """Started and possibly still being played (the app shows it as live)."""
    k = kickoff(fx)
    now = now or datetime.now(timezone.utc)
    return k is not None and k <= now < k + timedelta(hours=LIVE_HOURS.get(fx.get("format", ""), 8))


def started(fx: dict, now: datetime | None = None) -> bool:
    k = kickoff(fx)
    return k is not None and (now or datetime.now(timezone.utc)) >= k


def needs_xi_rerun(fx: dict, live_doc: dict | None, has_result: bool, now: datetime | None = None) -> bool:
    """A started match whose playing XIs were confirmed after its live forecast was made (the re-run the auto loop
    asked for was lost, e.g. its site update was cancelled by a newer one): re-simulate it once with the XIs.
    Only on the match day and before its result is in."""
    from cricsim.publish import xis_confirmed
    k = kickoff(fx)
    now = now or datetime.now(timezone.utc)
    if has_result or k is None or not (k <= now <= k + timedelta(hours=12)) or not xis_confirmed(fx):
        return False
    return live_doc is not None and not (live_doc.get("match") or {}).get("xis")


def frozen(fixtures: Path, scorecards: Path, now: datetime | None = None, fetch=None) -> list[str]:
    """Fixture files whose forecast stays as it was at the start: every started match, except one that still needs
    its confirmed-XI re-run (needs_xi_rerun)."""
    fetch = fetch or _fetch
    out = []
    for p in sorted(fixtures.glob("*.json")):
        f = json.loads(p.read_text())
        if not started(f, now):
            continue
        k = kickoff(f)
        recent = k is not None and (now or datetime.now(timezone.utc)) - k <= timedelta(hours=12)
        if recent and needs_xi_rerun(f, fetch(f"matches/{f['id']}.json"), (scorecards / p.name).exists(), now):
            continue
        out.append(p.name)
    return out


# ── names: scorecard names → forecast player ids ──────────────────────────────────────────────────────────────────

def _tokens(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\((c|wk|c & wk|c and wk|vc)\)", " ", s)
    return re.sub(r"[^a-z ]", " ", s).split()


def _similar(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0
    if a == b:
        return 4
    sa, sb = set(a), set(b)
    if len(sa & sb) >= 2 and (sa <= sb or sb <= sa):
        return 3                                     # "Salman Mirza" ⊂ "Mohammad Salman Mirza"
    if a[-1] == b[-1] and (a[0][0] == b[0][0] or (len(b[0]) <= 4 and a[0][0] in b[0])):
        return 2                                     # "Shai Hope" ~ "SD Hope"
    if len(sa & sb) >= 2:
        return 1.5                                   # "Mohammad Imran Randhawa" ~ "Muhammad Imran Randhawa"
    return 0


class Roster:
    """The 22 forecast players with every name we know them by (fixture name + registry name)."""

    def __init__(self, doc: dict, fixture: dict | None):
        self.teams: list[list[tuple[str, list[list[str]]]]] = []
        names = {p["id"]: p["name"] for t in doc["summary"]["teams"] for p in t["players"]}
        for k, t in enumerate(doc["match"]["teams"]):
            fx_names = (fixture or {}).get("teams", [{}, {}])[k].get("players", []) if fixture else []
            row = []
            for i, pid in enumerate(t["players"]):
                variants = [_tokens(names.get(pid, pid))]
                if i < len(fx_names):
                    variants.append(_tokens(fx_names[i]))
                if pid.startswith("new:"):
                    variants.append(_tokens(pid[4:]))
                row.append((pid, variants))
            self.teams.append(row)
        self.team_names = [t["name"] for t in doc["match"]["teams"]]

    def team(self, name: str) -> int:
        tn = _tokens(name)
        scores = [_similar(tn, _tokens(x)) for x in self.team_names]
        return max(range(2), key=lambda k: scores[k])

    def player(self, name: str, team: int | None = None) -> str | None:
        tn = _tokens(name)
        best, who = 0.0, None
        for k in ([team] if team is not None else [0, 1]):
            for pid, variants in self.teams[k]:
                s = max(_similar(tn, v) for v in variants)
                if s > best:
                    best, who = s, pid
        return who


# ── scorecard helpers ─────────────────────────────────────────────────────────────────────────────────────────────

def over_number(s: str | float) -> int:
    """Cricket notation → the over the ball was in: '6.5' → 7, '0.6' → 1, '19.6' → 20, '7' → 7."""
    whole, _, balls = str(s).partition(".")
    return int(whole) + (1 if balls and int(balls) > 0 else 0)


def credited_bowler(dismissal: str) -> str | None:
    d = dismissal.strip()
    if not d or d.lower().startswith(("not out", "run out", "retired", "absent")):
        return None
    m = re.search(r"(?:^|\s)b\s+(.+)$", d)
    return m.group(1).strip() if m else None


def _rng(dist: dict | None) -> tuple[float, float] | None:
    q = (dist or {}).get("q") or {}
    if "10" not in q or "90" not in q:
        return None
    return float(q["10"]), float(q["90"])


def _fmt(r: tuple[float, float] | None) -> str:
    return "—" if r is None else f"{round(r[0])}–{round(r[1])}"


def _pct(p: float) -> str:
    return f"{100 * p:.0f}%"


def _balls(overs, bpo: int) -> int:
    o, _, b = str(overs or "0").partition(".")
    return int(o or 0) * bpo + int(b or 0)


def fill_result(card: dict, overs: int, bpo: int = 6) -> dict:
    """The result from the two innings when the scorecard came without one (the source sometimes leaves the winner
    out). Only when it is certain: the chase passed the total, or the chasing side was bowled out or used all its
    overs. A match with revised overs (rain, a target set by the rain rules) or an unfinished chase is left as it is."""
    inns = card.get("innings") or []
    if card.get("winner") or card.get("result") or card.get("abandoned") or card.get("overs_per_side") or len(inns) != 2:
        return card
    a, b = inns
    if b["runs"] > a["runs"]:
        n = 10 - b["wickets"]
        return {**card, "winner": b["team"], "result": f"{b['team']} won by {n} wicket{'' if n == 1 else 's'}"}
    if b["wickets"] < 10 and _balls(b.get("overs"), bpo) < overs * bpo:
        return card                                    # the chase didn't finish: no result we can be sure of
    if a["runs"] > b["runs"]:
        n = a["runs"] - b["runs"]
        return {**card, "winner": a["team"], "result": f"{a['team']} won by {n} run{'' if n == 1 else 's'}"}
    return {**card, "result": "Match tied"}


# ── scoring ───────────────────────────────────────────────────────────────────────────────────────────────────────

def score(doc: dict, card: dict, fixture: dict | None = None) -> dict:
    s, roster = doc["summary"], Roster(doc, fixture)
    card = fill_result(card, s["meta"]["rules"]["overs"], s["meta"]["rules"].get("bpo", 6))
    names = {p["id"]: p["name"].removeprefix("new:") for t in s["teams"] for p in t["players"]}
    checks: list[dict] = []

    def add(tab, label, projected, actual, hit, note=None):
        checks.append({"tab": tab, "check": label, "projected": projected, "actual": actual,
                       "hit": bool(hit), **({"note": note} if note else {})})

    def in_range(tab, label, dist, actual, fmt=lambda v: str(v)):
        r = _rng(dist)
        if r is None or actual is None:
            return
        add(tab, label, f"{_fmt(r)} (median {round(float(dist['q']['50']))})", fmt(actual), r[0] <= actual <= r[1])

    inns = card.get("innings") or []          # an abandoned match with no toss has no innings
    # a match cut short (rain) is shown with its result but not scored: the forecast was for the full overs
    reduced = bool(card.get("abandoned")) or (bool(card.get("overs_per_side")) and card["overs_per_side"] < s["meta"]["rules"]["overs"])
    order = [roster.team(i["team"]) for i in inns]           # forecast team index of each innings
    team_name = roster.team_names

    # Overview: the result
    winner = card.get("winner")
    w = roster.team(winner) if winner else None
    win = s["result"]["win"]
    fav = max(range(2), key=lambda k: win.get(team_name[k], 0))
    if w is not None:
        add("Overview", "Favourite wins", f"{team_name[fav]} {_pct(win.get(team_name[fav], 0))}",
            f"{team_name[w]} won", w == fav)
        if len(inns) == 2:
            r1, r2 = inns[0]["runs"], inns[1]["runs"]
            if r1 > r2:
                in_range("Overview", "Winning margin (runs, batting first)", s["result"].get("margin_runs"), r1 - r2,
                         lambda v: f"{v} runs")
            elif r2 > r1:
                in_range("Overview", "Winning margin (wickets, chasing)", s["result"].get("margin_wickets"),
                         10 - inns[1]["wickets"], lambda v: f"{v} wickets")

    # Scores and Wickets, innings by innings
    for n, inn in enumerate(inns):
        k = order[n]
        tb = s["teams"][k]["batting"]
        who = team_name[k]
        by = next((b for b in tb.get("by_innings") or [] if b["innings"] == n + 1), None)
        in_range("Scores", f"{who} total ({'batting first' if n == 0 else 'chasing'})",
                 by["score"] if by else tb["score"], inn["runs"])
        in_range("Scores", f"{who} wickets lost", tb.get("wickets"), inn["wickets"])
        pp = next((p for p in tb.get("phases") or [] if p["phase"] == "Powerplay"), None)
        if pp and inn.get("powerplay_runs") is not None:
            in_range("Scores", f"{who} powerplay runs", pp["runs"], inn["powerplay_runs"])
        ex = inn.get("extras") or {}
        if ex:
            in_range("Scores", f"{who} extras", tb.get("extras", {}).get("total"), sum(ex.get(x, 0) for x in ("b", "lb", "w", "nb", "p")))
        fow = inn.get("fall_of_wickets") or []
        pp_overs = s["meta"]["rules"]["pp"]
        if pp:
            in_range("Wickets", f"{who} powerplay wickets", pp["wickets"],
                     sum(1 for f in fow if over_number(f["over"]) <= pp_overs))
        for f in fow:
            fk = next((x for x in tb.get("fall_of_wickets") or [] if x["wicket"] == f["wicket"]), None)
            if not fk or not fk.get("p"):
                continue
            in_range("Wickets", f"{who} wicket {f['wicket']}: over", fk.get("over"), over_number(f["over"]),
                     lambda v: f"over {v}")
            in_range("Wickets", f"{who} wicket {f['wicket']}: score", fk.get("score"), f["score"])

    # Players: batting and bowling ranges, top scorer, best bowler
    rows = {p["id"]: p for t in s["teams"] for p in t["players"]}
    for n, inn in enumerate(inns):
        k = order[n]
        bowl_k = 1 - k
        batted = []
        for b in inn.get("batting") or []:
            pid = roster.player(b["name"], k)
            if not pid or b.get("balls", 0) == 0 and not b.get("runs"):
                continue
            batted.append((pid, b["runs"]))
            row = rows.get(pid, {}).get("batting")
            if row:
                in_range("Players", f"{names.get(pid, b['name'])} runs", row["runs"], b["runs"])
        if batted:
            ranked = sorted(s["teams"][k]["players"], key=lambda p: -(p.get("batting") or {}).get("p_top_scorer", 0))[:3]
            top = max(r for _, r in batted)
            actual = [pid for pid, r in batted if r == top]
            add("Players", f"{team_name[k]} top scorer in our top 3", ", ".join(names[p["id"]] for p in ranked),
                ", ".join(names.get(p, p) for p in actual), any(p["id"] in actual for p in ranked))
        bowled = []
        for b in inn.get("bowling") or []:
            pid = roster.player(b["name"], bowl_k)
            if not pid:
                continue
            bowled.append((pid, b["wickets"], b["runs"]))
            row = rows.get(pid, {}).get("bowling")
            if row:
                in_range("Players", f"{names.get(pid, b['name'])} wickets", row["wickets"], b["wickets"])
                in_range("Players", f"{names.get(pid, b['name'])} runs conceded", row["runs"], b["runs"])
        if bowled:
            ranked = sorted(s["teams"][bowl_k]["players"], key=lambda p: -(p.get("bowling") or {}).get("p_best_bowler", 0))[:3]
            best = max(bowled, key=lambda x: (x[1], -x[2]))
            actual = [pid for pid, wk, rn in bowled if (wk, rn) == (best[1], best[2])]
            add("Players", f"{team_name[bowl_k]} best bowler in our top 3", ", ".join(names[p["id"]] for p in ranked),
                ", ".join(names.get(p, p) for p in actual), any(p["id"] in actual for p in ranked))

    # Matchups: did each actual bowler dismissal appear among the duels we listed?
    duels = s.get("matchups") or []
    shown = {(m["batter"], m["bowler"]): (i, m["p"]) for i, m in enumerate(duels[:25])}
    every = {(m["batter"], m["bowler"]): m["p"] for m in duels}
    for n, inn in enumerate(inns):
        k = order[n]
        for b in inn.get("batting") or []:
            bowler = credited_bowler(b.get("dismissal", ""))
            if not bowler:
                continue
            bat, bow = roster.player(b["name"], k), roster.player(bowler, 1 - k)
            if not bat or not bow:
                continue
            hit = (bat, bow) in shown
            p = every.get((bat, bow))
            add("Matchups", f"{names.get(bow, bowler)} dismisses {names.get(bat, b['name'])}",
                f"#{shown[(bat, bow)][0] + 1} of our key duels ({_pct(p)})" if hit else (f"{_pct(p)}, not in our top 25" if p else "not in our duels"),
                "happened", hit)

    if reduced:
        checks.clear()
    checks.sort(key=lambda c: TABS.index(c["tab"]))           # stable: keeps innings order within each tab
    by_tab = {t: {"hits": sum(c["hit"] for c in checks if c["tab"] == t),
                  "checks": sum(1 for c in checks if c["tab"] == t)} for t in TABS}
    hits = sum(c["hit"] for c in checks)
    p_w = win.get(team_name[w], 0) if w is not None and not reduced else None
    return {
        "id": doc["match"]["id"], "title": doc["match"].get("title"), "date": doc["match"].get("date"),
        "competition": doc["match"].get("competition"), "venue": doc["match"].get("venue"),
        "teams": [{"name": t["name"], "short": t.get("short")} for t in doc["match"]["teams"]],
        "result": card.get("result"), "winner": team_name[w] if w is not None else None,
        "scores": [{"team": i["team"], "runs": i["runs"], "wickets": i["wickets"], "overs": str(i.get("overs", ""))} for i in inns],
        "forecast": {"win": win, "projected": [t["batting"]["score"]["q"].get("50") for t in s["teams"]],
                     "generated_at": doc.get("generated_at")},
        "hits": hits, "checks": len(checks), "accuracy": round(hits / len(checks), 4) if checks else None,
        "brier": round((1 - p_w) ** 2, 4) if p_w is not None else None,
        "tabs": by_tab, "items": checks,
        **({"note": f"{card.get('note') or 'Abandoned'}. No result, so nothing to score."} if card.get("abandoned") else
           {"note": f"{card.get('note') or 'Match shortened'}. Not scored: our forecast was for {s['meta']['rules']['overs']} overs a side."}
           if reduced else {}),
    }


def score_fantasy(fantasy: dict, card: dict, roster: Roster) -> dict:
    """The fantasy picks against the scorecard: everyone's real points, the best XI in hindsight, and our XI and
    each team of the set as a share of it."""
    players = list(fantasy["players"])
    roles = {p: r.get("role") for p, r in fantasy["players"].items()}
    team_of = {p: r["team"] for p, r in fantasy["players"].items()}
    got = scorecard_points(card, roster.player, roles, players, od=fantasy.get("format") == "OD")
    real = {p: got.get(p, 4.0) for p in players}
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    xi, c, vc = pick_xi(real, team_of, use_roles)
    best = team_points(xi, c, vc, real)

    def scored(t):
        pts = team_points(t["players"], t["captain"], t["vice_captain"], real)
        return {**t, "points": round(pts, 1), "share": round(pts / best, 4) if best > 0 else None}
    single, teams = scored(fantasy["single"]), [scored(t) for t in fantasy["teams"]]
    return {"real": {p: round(v, 1) for p, v in real.items()},
            "best": {"players": sorted(xi, key=lambda p: -real[p]), "captain": c, "vice_captain": vc,
                     "points": round(best, 1)},
            "single": single, "teams": teams,
            "best_of_teams": max((t["share"] for t in teams if t["share"] is not None), default=None),
            **({"after": True} if fantasy.get("after") else {})}


# ── freezing forecasts and writing everything ─────────────────────────────────────────────────────────────────────

def _fetch(path: str, sites=SITES) -> dict | None:
    for site in sites:
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{site}/data/{path}", headers={"User-Agent": "cricsynthesis-ci"}),
                                        timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            continue
    return None


def _xis(f: dict) -> bool:
    """The playing XIs are named (same test as cricsim.publish.xis_confirmed; frozen docs predate the flag)."""
    return bool((f.get("live") or {}).get("xis")) or "confirmed" in (f.get("note") or "").lower()


def run(fixtures: Path, scorecards: Path, out: Path, sites=SITES, now: datetime | None = None, fetch=_fetch,
        picks: Path | None = None) -> dict:
    fx = {json.loads(p.read_text())["id"]: json.loads(p.read_text()) for p in sorted(fixtures.glob("*.json"))}
    cards = {json.loads(p.read_text())["id"]: json.loads(p.read_text()) for p in sorted(scorecards.glob("*.json"))} \
        if scorecards.exists() else {}
    live_archive = (fetch("archive.json", sites) or {}).get("matches", [])
    today = (now or datetime.now(timezone.utc)).astimezone(IST).date().isoformat()
    yesterday = ((now or datetime.now(timezone.utc)).astimezone(IST) - timedelta(days=1)).date().isoformat()
    # freeze fixtures that started recently (older ones were never frozen and aren't live any more)
    recent = {i for i, f in fx.items() if started(f, now) and (f.get("date") or "") >= yesterday}
    want = {m["id"] for m in live_archive} | recent | set(cards)
    (out / "matches").mkdir(parents=True, exist_ok=True)
    archive, missing = [], []
    for mid in sorted(want):
        doc_p = out / "matches" / f"{mid}.json"
        if not doc_p.exists():                       # not re-simulated this run: keep what was live
            doc = fetch(f"matches/{mid}.json", sites)
            if doc is None:
                missing.append(mid)
                continue
            doc_p.write_text(json.dumps(doc, separators=(",", ":")))
            pack = fetch(f"matches/{mid}.pack.json", sites)
            if pack is not None:
                (out / "matches" / f"{mid}.pack.json").write_text(json.dumps(pack, separators=(",", ":")))
        doc = json.loads(doc_p.read_text())
        fp = picks / f"{mid}.json" if picks else None
        if not doc.get("fantasy") and fp and fp.exists():      # published before the Fantasy tab: picks made afterwards
            doc["fantasy"] = {**json.loads(fp.read_text()), "after": True}
            doc_p.write_text(json.dumps(doc, separators=(",", ":")))
        m, sm = doc["match"], doc["summary"]
        archive.append({"id": mid, "title": m.get("title"), "date": m.get("date"), "competition": m.get("competition"),
                        "teams": [{"name": t["name"], "short": t.get("short")} for t in m["teams"]],
                        "win": sm["result"]["win"], "has_result": mid in cards})
    archive.sort(key=lambda c: (c.get("date") or "", c["id"]), reverse=True)
    (out / "archive.json").write_text(json.dumps({"matches": archive}))
    # a match under way stays on the home page for the rest of its day, with its frozen pre-match forecast
    idx_p = out / "index.json"
    idx = json.loads(idx_p.read_text()) if idx_p.exists() else {"matches": []}
    # a past match simulated again (resimulate) belongs on the Results page, not with today's fixtures; one that
    # started yesterday evening (IST) and is still going stays (a 21:30 start runs past midnight)
    on = lambda i: (fx.get(i, {}).get("date") or today) >= today or still_on(fx.get(i, {}), now)   # noqa: E731
    idx["matches"] = [c for c in idx["matches"] if c["id"] not in cards and on(c["id"])]
    listed = {c["id"] for c in idx["matches"]}
    for mid in sorted(want):
        doc_p = out / "matches" / f"{mid}.json"
        if mid in listed or mid in cards or not doc_p.exists() or not (fx.get(mid, {}).get("date") == today
                                                                        or still_on(fx.get(mid, {}), now)):
            continue                                                  # finished: Results page
        doc = tidy(json.loads(doc_p.read_text()))
        doc_p.write_text(json.dumps(doc, separators=(",", ":")))       # frozen docs made by older code: cleaned
        m, sm = doc["match"], doc["summary"]
        idx["matches"].append({**{k: m.get(k) for k in ("id", "title", "date", "start_time", "format", "competition", "venue")},
                               "teams": [{"name": t["name"], "short": t.get("short")} for t in m["teams"]],
                               "win": sm["result"]["win"], "projected": [t["batting"]["score"]["q"].get("50") for t in sm["teams"]],
                               "headline": doc["insights"][0]["text"] if doc.get("insights") else None,
                               "xis": bool(m.get("xis")) or _xis(fx.get(mid, {})),
                               "published": True, "generated_at": doc.get("generated_at"), "status": "started"})
    idx["matches"].sort(key=lambda c: (c.get("date") or "", c.get("start_time") or ""))
    idx_p.write_text(json.dumps(idx))

    (out / "results").mkdir(parents=True, exist_ok=True)
    index = []
    for mid, card in cards.items():
        doc_p = out / "matches" / f"{mid}.json"
        if not doc_p.exists():
            continue
        doc = json.loads(doc_p.read_text())
        rep = score(doc, card, fx.get(mid))
        fantasy = doc.get("fantasy")
        if fantasy and rep["checks"]:                     # rain-shortened / abandoned: not scored, fantasy included
            rep["fantasy"] = {**score_fantasy(fantasy, card, Roster(doc, fx.get(mid))),
                              "names": {p: r.get("name", p) for p, r in fantasy["players"].items()}}
        (out / "results" / f"{mid}.json").write_text(json.dumps(rep, separators=(",", ":")))
        index.append({k: rep[k] for k in ("id", "title", "date", "competition", "teams", "result", "winner", "scores",
                                          "hits", "checks", "accuracy", "brier", "tabs")} | ({"note": rep["note"]} if rep.get("note") else {})
                     | {"favourite_won": next((c["hit"] for c in rep["items"] if c["check"] == "Favourite wins"), None)}
                     | ({"fantasy": {"single": rep["fantasy"]["single"]["share"],
                                     "best_of_teams": rep["fantasy"]["best_of_teams"]}} if rep.get("fantasy") else {}))
    index.sort(key=lambda r: (r.get("date") or "", r["id"]), reverse=True)
    hits, checks = sum(r["hits"] for r in index), sum(r["checks"] for r in index)
    tabs = {t: {"hits": sum(r["tabs"][t]["hits"] for r in index), "checks": sum(r["tabs"][t]["checks"] for r in index)}
            for t in TABS}
    summary = {"matches": index, "hits": hits, "checks": checks,
               "accuracy": round(hits / checks, 4) if checks else None, "tabs": tabs,
               "favourite_won": sum(1 for r in index if r.get("favourite_won")),
               "brier": round(sum(b) / len(b), 4) if (b := [r["brier"] for r in index if r["brier"] is not None]) else None,
               **({"fantasy": {"matches": len(f), "single": round(sum(x["single"] for x in f) / len(f), 4),
                               "best_of_teams": round(sum(x["best_of_teams"] for x in f) / len(f), 4)}}
                  if (f := [r["fantasy"] for r in index if r.get("fantasy") and r["fantasy"]["single"] is not None]) else {}),
               "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    (out / "results" / "index.json").write_text(json.dumps(summary, separators=(",", ":")))
    return {"archived": [a["id"] for a in archive], "missing": missing, "scored": [r["id"] for r in index]}


@click.command()
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--scorecards", type=click.Path(path_type=Path), default=Path("cricsim/results"))
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/publish"))
@click.option("--picks", type=click.Path(path_type=Path), default=Path("cricsim/fantasy"),
              help="Fantasy picks made afterwards for matches published before the Fantasy tab")
@click.option("--started", "show_started", is_flag=True, help="Print the ids of fixtures that have started, and exit")
def main(fixtures: Path, scorecards: Path, out: Path, picks: Path, show_started: bool) -> None:
    if show_started:
        for name in frozen(fixtures, scorecards):
            click.echo(name)
        return
    r = run(fixtures, scorecards, out, picks=picks)
    click.echo(f"archived {len(r['archived'])}, scored {len(r['scored'])}"
               + (f", forecast missing for {', '.join(r['missing'])}" if r["missing"] else ""))
    for mid in r["scored"]:
        rep = json.loads((out / "results" / f"{mid}.json").read_text())
        tabs = ", ".join(f"{t} {v['hits']}/{v['checks']}" for t, v in rep["tabs"].items())
        if not rep["checks"]:
            click.echo(f"- {mid}: not scored ({rep.get('note', 'no checks')})")
            continue
        fz = rep.get("fantasy")
        click.echo(f"- {mid}: {rep['hits']}/{rep['checks']} came true ({rep['accuracy']:.0%}); {tabs}"
                   + (f"; fantasy XI {fz['single']['share']:.0%} of the best, best of 5 teams {fz['best_of_teams']:.0%}"
                      if fz and fz["single"]["share"] is not None else ""))


if __name__ == "__main__":
    main()
