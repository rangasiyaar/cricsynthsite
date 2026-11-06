"""Match data from Khel Now's public match pages: the fixture list, squads and playing XIs, toss, the live state,
scorecards, and finished matches in Cricsheet's format (for matches Cricsheet hasn't added yet).

Each match page carries its data as JSON (Next.js `__NEXT_DATA__` → props.pageProps.data):
    match_info      teams, start time, venue, format, competition, toss, status, result
    squad           both squads with playing11 / role / substitute flags, and player details (styles, birthdate)
    matchInsights   per innings: the scorecard and every ball (runs split by kind, wickets, batters' and bowler's totals)
One sitemap (live-cricket.xml) lists every match page, so finding matches is one request.

    python -m cricsim.khelnow probe <page url>          what we read from one page (writes nothing)
    python -m cricsim.khelnow bridge --cricsheet data/raw/all_json.zip --cache data/khelnow --out data/raw/extra_json.zip
"""
from __future__ import annotations

import html
import json
import logging
import re
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import click

log = logging.getLogger("cricsim.khelnow")

BASE = "https://khelnow.com"
SITEMAP = f"{BASE}/live-cricket.xml"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
MONTHS = {m: i for i, m in enumerate(("january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"), 1)}
SCHEDULED, COMPLETED, LIVE, ABANDONED = 1, 2, 3, 4                       # match_info.status
FORMATS = {"T20": "T20", "T20I": "T20", "WOMEN T20": "T20", "WOMEN T20I": "T20", "ODI": "OD", "LIST A": "OD",
           "WOMEN ODI": "OD", "T10": "T10", "100-BALL": "HUNDRED", "THE HUNDRED": "HUNDRED"}
OVERS = {"T20": 20, "T10": 10, "OD": 50, "HUNDRED": 20}
ROLE_LABEL = {"bat": "batter", "bowl": "bowler", "all": "allrounder", "wk": "wk-batter", "wkbat": "wk-batter"}
GENERIC = {"women", "woman", "men", "cricket", "club", "team", "xi", "cc", "the", "of", "under", "s"}


# ── pages ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xml"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def safe(page, url: str) -> str:
    try:
        return page(url)
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        log.warning("%s: %s", url, e)
        return ""


def data_of(page_html: str) -> dict:
    """The match data a page carries ({} if none)."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page_html or "", re.S)
    if not m:
        return {}
    try:
        return (json.loads(m.group(1)).get("props", {}).get("pageProps", {}) or {}).get("data") or {}
    except ValueError:
        return {}


def match(url: str, page=get) -> dict:
    return data_of(safe(page, url))


def slug_date(url: str) -> date | None:
    m = re.search(r"-(\d{1,2})(?:st|nd|rd|th)-([a-z]+)-(\d{4})", url)
    if not m or m.group(2) not in MONTHS:
        return None
    try:
        return date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
    except ValueError:
        return None


def sitemap(text: str) -> list[dict]:
    """Every match page in the sitemap: {url, id, date} (the date is the page's, in the slug)."""
    out = []
    for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text or ""):
        url = html.unescape(loc)                               # "women&#039;s" → "women's"
        m = re.search(r"-(\d+)/?$", url)
        if "/live-cricket-score/" in url and m:
            out.append({"url": url, "id": int(m.group(1)), "date": slug_date(url)})
    return out


# ── reading one page ──────────────────────────────────────────────────────────────────────────────────────────────

def _int(x, default: int = 0) -> int:
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return default


def tokens(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s).split()


def info(d: dict) -> dict:
    """The facts about a match we use, from its page data."""
    mi = d.get("match_info") or {}
    comp = mi.get("competition") or {}
    teams = []
    sexes = {str(t.get("tid")): t.get("sex") for t in (d.get("squad") or {}).get("teams") or []}
    for k in ("teama", "teamb"):
        t = mi.get(k) or {}
        teams.append({"id": _int(t.get("team_id")), "name": t.get("name") or "", "short": t.get("short_name") or "",
                      "scores": t.get("scores_full") or ""})
    fmt_str = (mi.get("format_str") or "").upper()
    text = " ".join([comp.get("title") or "", mi.get("title") or "", fmt_str])
    women = "female" in sexes.values() or bool(re.search(r"\bwomen\b", text, re.I))
    start = _int(mi.get("timestamp_start"))
    venue = mi.get("venue") or {}
    return {"id": _int(d.get("id")), "status": _int(mi.get("status")), "state": mi.get("status_str") or "",
            "game_state": mi.get("game_state_str") or "", "note": mi.get("status_note") or "",
            "format_str": mi.get("format_str") or "", "format": FORMATS.get(fmt_str.replace("WOMEN'S", "WOMEN")),
            "international": (comp.get("category") or "").lower() == "international" or fmt_str in ("T20I", "ODI"),
            "competition": comp.get("title") or "", "season": comp.get("season") or "",
            "subtitle": mi.get("subtitle") or "", "match_number": mi.get("match_number") or "",
            "teams": teams, "gender": "female" if women else "male",
            "start": datetime.fromtimestamp(start, timezone.utc) if start else None,
            "venue": venue.get("name") or "", "city": venue.get("location") or "", "country": venue.get("country") or "",
            "toss": mi.get("toss") or {}, "result": mi.get("result") or "", "winner": _int(mi.get("winning_team_id")),
            "margin": mi.get("win_margin") or "", "dls": str(mi.get("match_dls_affected")).lower() == "true",
            "verified": str(mi.get("verified")).lower() == "true", "live_innings": _int(mi.get("live_inning_number"))}


def people(d: dict) -> dict[str, dict]:
    """Every listed player by Khel Now id: name, role, styles, birthdate."""
    out = {}
    for p in (d.get("squad") or {}).get("players") or []:
        out[str(p.get("pid"))] = {"name": p.get("title") or p.get("short_name") or "", "role": p.get("playing_role"),
                                  "bat": p.get("batting_style"), "bowl": p.get("bowling_style"),
                                  "bowl_type": p.get("bowling_type"), "born": p.get("birthdate") or None,
                                  "country": p.get("country")}
    return out


def squads(d: dict) -> dict[int, dict[str, list[dict]]]:
    """Per team id: 'xi' (the named playing XI, impact substitute included) and 'squad' (everyone listed), as
    {name, role, keeper, captain, teamId, pid} in the page's order."""
    sq, out = d.get("squad") or {}, {}
    for k in ("teama", "teamb"):
        side = sq.get(k) or {}
        tid = _int(side.get("team_id"))
        if not tid:
            continue
        t = out.setdefault(tid, {"xi": [], "squad": []})
        rows = side.get("squads") or []
        # every keeper-batter is role "wk"; the match's keeper is the one marked "(WK)" (else the first "wk" in the XI)
        marked = [p for p in rows if "WK" in (p.get("role_str") or "").upper()]
        keeper = marked[0] if marked else next((p for p in rows if (p.get("role") or "").lower().startswith("wk")
                                                and str(p.get("playing11")).lower() == "true"), None)
        for p in rows:
            role_str = (p.get("role_str") or "").upper()
            role = (p.get("role") or "").lower()
            label = ROLE_LABEL.get(role, "allrounder")
            if role.startswith("wk") and p is not keeper:
                label = "batter"
            row = {"name": p.get("name") or "", "role": label, "keeper": p is keeper,
                   "captain": bool(re.search(r"\bC\b", role_str)), "teamId": tid, "pid": str(p.get("player_id") or "")}
            t["squad"].append(row)
            if str(p.get("playing11")).lower() == "true" and str(p.get("substitute")).lower() != "true":
                t["xi"].append(row)
    return out


def toss(d: dict) -> tuple[int, str] | None:
    """(winning team id, 'bat' or 'field') once the toss is in."""
    t = (d.get("match_info") or {}).get("toss") or {}
    winner = _int(t.get("winner"))
    if not winner:
        return None
    text = (t.get("text") or "").lower()
    decision = "bat" if (_int(t.get("decision")) == 1 or "bat" in text) and "bowl" not in text else "field"
    return winner, decision


def innings(d: dict) -> list[dict]:
    """Each innings so far: its scorecard and its balls (in order), super overs flagged."""
    ins = d.get("matchInsights") or []
    cards: dict[int, dict] = {}
    for x in ins:
        for inn in (x.get("score_card") or {}).get("innings") or []:
            cards[_int(inn.get("number"), len(cards) + 1)] = inn
    balls = {_int(x.get("innings_id")): [c for c in x.get("commentary") or [] if c.get("event") in ("ball", "wicket")]
             for x in ins}
    return [{"number": n, "card": cards[n], "balls": balls.get(n, []),
             "super_over": str(cards[n].get("issuperover")).lower() == "true"} for n in sorted(cards)]


def overs_to_balls(overs, bpo: int = 6) -> int:
    whole, _, part = f"{float(overs or 0):.1f}".partition(".")
    return int(whole) * bpo + int(part)


# ── the live state the browser engine starts from ─────────────────────────────────────────────────────────────────

def _side_name(i: dict, team_id) -> str:
    return next((t["name"] for t in i["teams"] if t["id"] == _int(team_id)), "")


def live_state(d: dict, roster, fmt: str) -> dict | None:
    """Our live doc (Firestore live/{id}) from a page: innings, score, balls, who is batting and who is out, in the
    forecast's player ids. Before the start only the state and status line."""
    from cricsim.engine.states import FORMAT_RULES
    i = info(d)
    if not i["teams"][0]["name"]:
        return None
    state = {COMPLETED: "Complete", ABANDONED: "Abandoned", LIVE: "In Progress"}.get(i["status"], "Preview")
    if i["status"] == ABANDONED and "no result" in (i["result"] + i["note"]).lower():
        state = "No result"
    if i["status"] == LIVE and re.search(r"break|delay|stump|rain|lunch|tea|drinks", i["game_state"], re.I):
        state = f"In Progress · {i['game_state']}"
    inns = [x for x in innings(d) if not x["super_over"]]
    if not inns or i["status"] == SCHEDULED:
        return {"state": "Toss" if toss(d) else state, "status": i["note"] or i["result"]}
    bpo = FORMAT_RULES.get(fmt, FORMAT_RULES["T20"])["bpo"]
    cur = next((x for x in inns if x["number"] == i["live_innings"]), inns[-1])
    card, eq = cur["card"], cur["card"].get("equations") or {}
    batting = roster.team(_side_name(i, card.get("batting_team_id")))
    first = inns[0]["card"]
    names = {pid: p["name"] for pid, p in people(d).items()}
    doc = {"state": state, "status": i["note"] or i["result"], "innings": min(cur["number"], 2), "batting": batting,
           "battingFirst": roster.team(_side_name(i, first.get("batting_team_id"))),
           "runs": _int(eq.get("runs")), "wickets": _int(eq.get("wickets")),
           "balls": overs_to_balls(eq.get("overs"), bpo), "overs": str(eq.get("overs") or 0)}
    if cur["number"] >= 2:
        doc["firstInningsTotal"] = _int((first.get("equations") or {}).get("runs"))
        if _int(card.get("target")):
            doc["target"] = _int(card["target"])
    on = _at_crease(cur, bpo)
    for field, pid in zip(("striker", "nonStriker"), on):
        p = roster.player(names.get(pid, ""), batting) if names.get(pid) else None
        if p:
            doc[field] = p
    out = [b.get("name") or names.get(str(b.get("batsman_id")), "") for b in card.get("batsmen") or []
           if (b.get("dismissal") or "").lower() not in ("", "retired", "retiredhurt", "not out")
           and "not out" not in (b.get("how_out") or "").lower()]
    doc["out"] = [p for p in (roster.player(n, batting) for n in out if n) if p]
    return doc


def _at_crease(inn: dict, bpo: int) -> list[str]:
    """(striker, non-striker) Khel Now ids after the last ball: who faced it, swapped for an odd number run and at
    the end of an over. Empty after a wicket (the new batter isn't known until he faces)."""
    balls = inn["balls"]
    if not balls:
        return []
    last = balls[-1]
    pair = [str(b.get("batsman_id")) for b in last.get("batsmen") or []]
    faced = str(last.get("batsman_id"))
    if last.get("event") == "wicket" or faced not in pair or len(pair) != 2:
        return []
    other = pair[1] if pair[0] == faced else pair[0]
    ran = _int(last.get("bat_run")) + _int(last.get("bye_run")) + _int(last.get("legbye_run")) \
        + max(0, _int(last.get("wide_run")) - 1)
    if (last.get("four") or last.get("six")) and not _int(last.get("bye_run")) and not _int(last.get("legbye_run")):
        ran = 0                                                  # a boundary isn't run
    striker, non = (other, faced) if ran % 2 else (faced, other)
    legal = sum(1 for b in balls if not b.get("wideball") and not b.get("noball"))
    if not last.get("wideball") and not last.get("noball") and legal % bpo == 0:
        striker, non = non, striker
    return [striker, non]


# ── our scorecard (cricsim/results/<id>.json) ─────────────────────────────────────────────────────────────────────

def _overs_text(x) -> str:
    f = float(x or 0)
    return str(int(f)) if f == int(f) else f"{f:.1f}"


def _team_match(ours: dict, name: str, short: str = "") -> float:
    a, b = tokens(ours.get("name", "")), tokens(name)
    if a and "".join(a) == "".join(b):
        return 3
    if short and short.upper() == (ours.get("short") or "").upper():
        return 2
    return 1 if (set(a) - GENERIC) & (set(b) - GENERIC) else 0


def our_side(fx: dict, name: str) -> str:
    k = max(range(2), key=lambda j: _team_match(fx["teams"][j], name))
    return fx["teams"][k]["name"] if _team_match(fx["teams"][k], name) > 0 else name


def scorecard(fx: dict, d: dict) -> dict | None:
    """Our results file for a finished match, or None while it isn't over."""
    i = info(d)
    if i["status"] == ABANDONED or (i["status"] == COMPLETED and "no result" in i["result"].lower()):
        return {"id": fx["id"], "abandoned": True, "note": i["note"] or i["result"] or "No result"}
    if i["status"] != COMPLETED:
        return None
    inns = [x for x in innings(d) if not x["super_over"]][:2]
    if not inns:
        return None
    fmt = fx.get("format") or i["format"] or "T20"
    pp_overs = {"T20": 6, "T10": 2, "OD": 10, "HUNDRED": 5}.get(fmt, 6)
    out_inns, revised = [], 0
    for x in inns:
        c, eq, ex = x["card"], x["card"].get("equations") or {}, x["card"].get("extra_runs") or {}
        batting = [{"name": b.get("name"), "dismissal": _dismissal_text(b), "runs": _int(b.get("runs")),
                    "balls": _int(b.get("balls_faced")), "fours": _int(b.get("fours")), "sixes": _int(b.get("sixes"))}
                   for b in c.get("batsmen") or [] if (b.get("how_out") or "").strip() or _int(b.get("balls_faced")) > 0]
        bowling = [{"name": b.get("name"), "overs": _overs_text(b.get("overs")), "maidens": _int(b.get("maidens")),
                    "runs": _int(b.get("runs_conceded")), "wickets": _int(b.get("wickets")),
                    "no_balls": _int(b.get("noballs")), "wides": _int(b.get("wides"))}
                   for b in c.get("bowlers") or []]
        fow = [{"wicket": _int(w.get("number"), k + 1), "batter": w.get("name"), "score": _int(w.get("score_at_dismissal")),
                "over": _overs_text(w.get("overs_at_dismissal"))} for k, w in enumerate(c.get("fows") or [])]
        inn = {"team": our_side(fx, _side_name(i, c.get("batting_team_id"))), "runs": _int(eq.get("runs")),
               "wickets": _int(eq.get("wickets")), "overs": _overs_text(eq.get("overs")), "batting": batting,
               "bowling": bowling, "fall_of_wickets": fow,
               "extras": {"b": _int(ex.get("byes")), "lb": _int(ex.get("legbyes")), "w": _int(ex.get("wides")),
                          "nb": _int(ex.get("noballs")), "p": _int(ex.get("penalty"))}}
        if x["number"] == 1 and x["balls"]:
            inn["powerplay_runs"] = sum(_int(b.get("run")) for b in x["balls"] if _int(b.get("over")) < pp_overs)
        if i["dls"] and _int(c.get("max_over")):
            revised = max(revised, _int(c.get("max_over")))
        out_inns.append(inn)
    out = {"id": fx["id"], "innings": out_inns}
    if revised and revised < OVERS.get(fmt, 99):
        out["overs_per_side"] = revised
    if "tie" in i["result"].lower() and not i["winner"]:
        out["result"] = "Match tied"
    elif i["winner"]:
        winner = our_side(fx, _side_name(i, i["winner"]))
        m = re.match(r"(\d+)\s*(run|wicket)", i["margin"].lower())
        if m:
            n = int(m.group(1))
            out["result"] = f"{winner} won by {n} {m.group(2)}{'' if n == 1 else 's'}"
        else:
            out["result"] = f"{winner} won"
        out["winner"] = winner
    return out


def _dismissal_text(b: dict) -> str:
    how = (b.get("how_out") or "").strip()
    return "not out" if not how or how.lower() in ("batting", "not out") else how


# ── Cricsheet format (for the bridge) ─────────────────────────────────────────────────────────────────────────────

KINDS = {"caught": "caught", "bowled": "bowled", "lbw": "lbw", "runout": "run out", "run out": "run out",
         "stumped": "stumped", "hitwicket": "hit wicket", "retired": "retired hurt", "retiredhurt": "retired hurt",
         "retiredout": "retired out", "obstructing": "obstructing the field", "handled": "handled the ball",
         "timedout": "timed out"}


def to_cricsheet(d: dict, register: dict[str, str] | None = None) -> dict | None:
    """A finished limited-overs match in Cricsheet's JSON format, or None when it can't be rebuilt exactly (every
    innings' balls must add up to its scorecard). `register` maps Khel Now player ids to Cricsheet register ids;
    other players get "kn:<id>"."""
    i, register = info(d), register or {}
    if i["status"] != COMPLETED or not i["format"] or i["format"] == "HUNDRED":
        return None
    who = people(d)
    sq = squads(d)
    team_name = {t["id"]: t["name"] for t in i["teams"]}
    names: dict[str, str] = {}
    used: set[str] = set()
    for pid, p in who.items():
        nm = p["name"] or pid
        if nm in used:
            nm = f"{nm} ({pid})"
        used.add(nm)
        names[pid] = nm
    players = {team_name[tid]: [names.get(p["pid"], p["name"]) for p in s["xi"]] for tid, s in sq.items() if tid in team_name}
    registry = {names[pid]: register.get(pid, f"kn:{pid}") for pid in names
                if any(names[pid] in v for v in players.values())}
    inns_out = []
    for x in innings(d):
        c = x["card"]
        rows = {str(b.get("batsman_id")): b for b in c.get("batsmen") or []}
        overs: dict[int, list] = {}
        for b in x["balls"]:
            pair = [str(p.get("batsman_id")) for p in b.get("batsmen") or []]
            bat = str(b.get("batsman_id"))
            non = next((p for p in pair if p != bat), None)
            wd, nb, by, lb = (_int(b.get(k)) for k in ("wide_run", "noball_run", "bye_run", "legbye_run"))
            extras = {k: v for k, v in (("wides", wd), ("noballs", nb), ("byes", by), ("legbyes", lb)) if v}
            dv = {"batter": names.get(bat, bat), "bowler": names.get(str(b.get("bowler_id")), str(b.get("bowler_id"))),
                  "non_striker": names.get(non, non) if non else None,
                  "runs": {"batter": _int(b.get("bat_run")), "extras": wd + nb + by + lb, "total": _int(b.get("run"))}}
            if extras:
                dv["extras"] = extras
            if b.get("event") == "wicket":
                out_id = str(b.get("wicket_batsman_id") or bat)
                row = rows.get(out_id, {})
                kind = KINDS.get((row.get("dismissal") or "").lower().replace(" ", ""), "caught")
                if kind == "caught" and str(row.get("first_fielder_id") or "") == str(b.get("bowler_id")):
                    kind = "caught and bowled"
                w = {"player_out": names.get(out_id, out_id), "kind": kind}
                fielders = [names.get(str(row.get(k)), "") for k in ("first_fielder_id", "second_fielder_id",
                                                                      "third_fielder_id") if str(row.get(k) or "") not in ("", "0")]
                if fielders and kind in ("caught", "run out", "stumped"):
                    w["fielders"] = [{"name": f} for f in fielders if f]
                dv["wickets"] = [w]
            if dv["non_striker"] is None:
                del dv["non_striker"]
            overs.setdefault(_int(b.get("over")), []).append(dv)
        eq = c.get("equations") or {}
        total = sum(dv["runs"]["total"] for ov in overs.values() for dv in ov)
        wkts = sum(1 for ov in overs.values() for dv in ov for w in dv.get("wickets", [])
                   if w["kind"] not in ("retired hurt", "retired not out"))
        pen = _int((c.get("extra_runs") or {}).get("penalty"))
        if total + pen != _int(eq.get("runs")) or wkts != _int(eq.get("wickets")):
            log.info("match %s innings %s: balls don't add up (%s/%s v %s/%s); skipped", i["id"], x["number"],
                     total, wkts, eq.get("runs"), eq.get("wickets"))
            return None
        inn = {"team": _side_name(i, c.get("batting_team_id")),
               "overs": [{"over": k, "deliveries": v} for k, v in sorted(overs.items())]}
        if x["super_over"]:
            inn["super_over"] = True
        if _int(c.get("target")):
            inn["target"] = {"runs": _int(c["target"])}
            if i["dls"] and _int(c.get("max_over")):
                inn["target"]["overs"] = _int(c["max_over"])
        if pen:
            inn["penalty_runs"] = {"post": pen}
        inns_out.append(inn)
    if not inns_out:
        return None
    t = toss(d)
    when = i["start"].date().isoformat() if i["start"] else None
    mt = {"T20": "IT20" if i["international"] else "T20", "T10": "T20", "OD": "ODI" if i["international"] else "ODM"}[i["format"]]
    out_info = {"balls_per_over": 6, "city": i["city"] or None, "dates": [when], "gender": i["gender"],
                "match_type": mt, "overs": OVERS[i["format"]], "players": players,
                "registry": {"people": registry}, "season": i["season"] or (when or "")[:4],
                "team_type": "international" if i["international"] else "club",
                "teams": [i["teams"][0]["name"], i["teams"][1]["name"]],
                "venue": ", ".join(x for x in (i["venue"], i["city"]) if x),
                "event": {"name": i["competition"], **({"match_number": _int(i["match_number"])} if _int(i["match_number"]) else {})}}
    if t:
        out_info["toss"] = {"winner": team_name.get(t[0], ""), "decision": t[1]}
    res = i["result"].lower()
    if i["winner"]:
        m = re.match(r"(\d+)\s*(run|wicket)", i["margin"].lower())
        by = {("runs" if m.group(2) == "run" else "wickets"): int(m.group(1))} if m else {}
        out_info["outcome"] = {"winner": team_name.get(i["winner"], ""), **({"by": by} if by else {})}
        if i["dls"]:
            out_info["outcome"]["method"] = "D/L"
    elif "tie" in res:
        out_info["outcome"] = {"result": "tie"}
    elif "no result" in res or "abandon" in res:
        out_info["outcome"] = {"result": "no result"}
    out_info = {k: v for k, v in out_info.items() if v is not None}
    return {"meta": {"data_version": "1.1.0", "created": date.today().isoformat(), "revision": 1,
                     "source": "kn"}, "info": out_info, "innings": inns_out}


# ── the bridge: recent finished matches Cricsheet hasn't added yet ────────────────────────────────────────────────

def _cricsheet_index(zip_path: Path, since: date) -> tuple[list[tuple[date, set[str], set[str]]], dict[str, dict[str, str]]]:
    """From the Cricsheet zip: (date, team tokens A, team tokens B) for every match since `since` (to skip matches it
    has), and per team name the register id of every player who played for it in the last three years."""
    have, roster = [], {}
    cutoff = since - timedelta(days=3 * 365)
    with zipfile.ZipFile(zip_path) as zf:
        for n in zf.namelist():
            if not n.endswith(".json"):
                continue
            try:
                d = json.loads(zf.read(n))
                inf = d["info"]
                day = date.fromisoformat(str(inf["dates"][0]))
            except (KeyError, ValueError, IndexError):
                continue
            if day < cutoff:
                continue
            teams = inf.get("teams") or ["", ""]
            if day >= since - timedelta(days=2):
                have.append((day, set(tokens(teams[0])) - GENERIC, set(tokens(teams[1])) - GENERIC))
            reg = (inf.get("registry") or {}).get("people") or {}
            for team, names in (inf.get("players") or {}).items():
                r = roster.setdefault(" ".join(tokens(team)), {})
                for nm in names:
                    if nm in reg:
                        r[nm] = reg[nm]
    return have, roster


def _in_cricsheet(i: dict, have) -> bool:
    if not i["start"]:
        return False
    a, b = (set(tokens(t["name"])) - GENERIC for t in i["teams"])
    day = i["start"].date()
    return any(abs((d - day).days) <= 1 and ((a & x and b & y) or (a & y and b & x)) for d, x, y in have)


def _same_person(kn_name: str, cs_name: str) -> bool:
    a, b = tokens(kn_name), tokens(cs_name)
    if not a or not b:
        return False
    if a == b:
        return True
    return a[-1] == b[-1] and (a[0][0] == b[0][0] or (len(b[0]) <= 4 and a[0][0] in b[0]))


def link_players(d: dict, roster: dict[str, dict[str, str]], known: dict[str, str]) -> dict[str, str]:
    """Khel Now player id → Cricsheet register id for this match's XIs: the saved links, else the one player of the
    same name (surname + initial) who played for that team in the last three years."""
    i, out = info(d), {}
    team_names = {t["id"]: " ".join(tokens(t["name"])) for t in i["teams"]}
    for tid, s in squads(d).items():
        cand = roster.get(team_names.get(tid, ""), {})
        if not cand:                                            # the team under another name: any listed side sharing a word
            words = set(team_names.get(tid, "").split()) - GENERIC
            cand = {nm: rid for team, r in roster.items() if words & set(team.split()) for nm, rid in r.items()}
        for p in s["xi"]:
            if p["pid"] in known:
                out[p["pid"]] = known[p["pid"]]
                continue
            fits = {rid for nm, rid in cand.items() if _same_person(p["name"], nm)}
            if len(fits) == 1:
                out[p["pid"]] = fits.pop()
    return out


def bridge(cricsheet_zip: Path, cache: Path, out_zip: Path, days: int = 21, page=get, now: datetime | None = None,
           max_requests: int = 400) -> dict[str, int]:
    """Finished limited-overs matches of the last `days` days that Cricsheet doesn't have yet, in its format, written
    to `out_zip` for `cricdata build --extra`. Pages already read are kept in `cache` (verified matches for good,
    unverified ones re-read a day later); player links are kept in cache/links.json."""
    now = now or datetime.now(timezone.utc)
    cache.mkdir(parents=True, exist_ok=True)
    links_path = cache / "links.json"
    known = json.loads(links_path.read_text()) if links_path.exists() else {}
    since = (now - timedelta(days=days)).date()
    have, roster = _cricsheet_index(cricsheet_zip, since)
    entries = [e for e in sitemap(safe(page, SITEMAP)) if e["date"] and since <= e["date"] < now.date()]
    stats = {"pages": len(entries), "fetched": 0, "in_cricsheet": 0, "written": 0, "skipped": 0}
    written: dict[str, dict] = {}
    for e in sorted(entries, key=lambda e: e["date"], reverse=True):
        f = cache / f"{e['id']}.json"
        d = json.loads(f.read_text()) if f.exists() else None
        stale = d is not None and not info(d)["verified"] and time.time() - f.stat().st_mtime > 86400
        if (d is None or stale) and stats["fetched"] < max_requests:
            d = match(e["url"], page)
            stats["fetched"] += 1
            time.sleep(0.5 if page is get else 0)
            if d:
                f.write_text(json.dumps(d))
        if not d:
            continue
        i = info(d)
        if i["status"] != COMPLETED or not i["format"]:
            continue
        if _in_cricsheet(i, have):
            stats["in_cricsheet"] += 1
            continue
        reg = link_players(d, roster, known)
        known.update(reg)
        cs = to_cricsheet(d, reg)
        if cs:
            written[f"kn{i['id']}.json"] = cs
        else:
            stats["skipped"] += 1
    links_path.write_text(json.dumps(known, indent=0, sort_keys=True))
    out_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, cs in written.items():
            zf.writestr(name, json.dumps(cs))
    stats["written"] = len(written)
    linked = sum(1 for cs in written.values() for rid in cs["info"]["registry"]["people"].values() if not rid.startswith("kn:"))
    total = sum(len(cs["info"]["registry"]["people"]) for cs in written.values())
    stats["players_linked_pct"] = round(100 * linked / max(1, total))
    return stats


# ── command line ──────────────────────────────────────────────────────────────────────────────────────────────────

@click.group()
def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


@main.command()
@click.argument("url")
def probe(url: str) -> None:
    """What we read from one match page (no writes): a check that the page format hasn't changed."""
    d = match(url)
    if not d:
        click.echo("no match data on the page")
        return
    i = info(d)
    click.echo(f"{i['teams'][0]['name']} v {i['teams'][1]['name']} | {i['competition']} | {i['format_str']} → {i['format']} | "
               f"{i['state']} / {i['game_state']} | {i['note']} | start {i['start']} | toss {toss(d)}")
    for tid, s in squads(d).items():
        click.echo(f"team {tid}: xi {len(s['xi'])}, squad {len(s['squad'])}; captain "
                   f"{[p['name'] for p in s['squad'] if p['captain']]}; keeper {[p['name'] for p in s['squad'] if p['keeper']]}")
    for x in innings(d):
        eq = x["card"].get("equations") or {}
        click.echo(f"innings {x['number']}: {eq.get('runs')}/{eq.get('wickets')} ({eq.get('overs')} ov); "
                   f"{len(x['balls'])} balls; super over {x['super_over']}; at crease {_at_crease(x, 6)}")
    cs = to_cricsheet(d)
    click.echo(f"Cricsheet rebuild: {'ok' if cs else 'not available'}")


@main.command("bridge")
@click.option("--cricsheet", "cs_zip", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--cache", type=click.Path(path_type=Path), default=Path("data/khelnow"))
@click.option("--out", "out_zip", type=click.Path(path_type=Path), default=Path("data/raw/extra_json.zip"))
@click.option("--days", default=21, help="How far back to look for matches Cricsheet doesn't have yet")
def bridge_cmd(cs_zip: Path, cache: Path, out_zip: Path, days: int) -> None:
    """Recent finished matches Cricsheet hasn't added yet, in its format (for cricdata build --extra)."""
    click.echo(json.dumps(bridge(cs_zip, cache, out_zip, days)))


if __name__ == "__main__":
    main()
