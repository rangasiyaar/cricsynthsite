"""Cricsheet JSON → normalised rows. Pure functions, no I/O.

Cricsheet format reference: https://cricsheet.org/format/json/

Tables produced (one dict per row):
    matches        one row per match (format, competition, teams, venue, toss, result)
    match_players  who was in each XI (registry IDs)
    innings        one row per innings (incl. super overs, flagged)
    deliveries     one row per ball, with the match state *before* the ball
    wickets        one row per dismissal (a ball can rarely have two)
"""
from __future__ import annotations

from datetime import date

from cricdata.names import canonical_team, canonical_venue, team_id, venue_id

# Dismissals credited to the bowler.
BOWLER_WICKETS = {"bowled", "caught", "lbw", "stumped", "caught and bowled", "hit wicket"}
# Listed as "wickets" in Cricsheet but not dismissals.
NOT_OUT_KINDS = {"retired hurt", "retired not out"}

FORMAT_LIMITED = {"T20", "T10", "HUNDRED", "OD"}


def classify_format(info: dict) -> str:
    """T20 · T10 · HUNDRED · OD (50-over) · MULTIDAY · OTHER."""
    mt = (info.get("match_type") or "").upper()
    bpo = int(info.get("balls_per_over") or 6)
    overs = info.get("overs")
    event = ((info.get("event") or {}).get("name") or "").lower()
    if bpo == 5 or "the hundred" in event:
        return "HUNDRED"
    if mt in ("TEST", "MDM"):
        return "MULTIDAY"
    if mt in ("T20", "IT20"):
        return "T10" if overs == 10 else "T20"
    if mt in ("ODI", "ODM"):
        return "OD"
    return "OTHER"


def _outcome(info: dict) -> dict:
    o = info.get("outcome") or {}
    by = o.get("by") or {}
    result = o.get("result")            # 'tie' | 'no result' | 'draw'
    return {
        "winner": canonical_team(o["winner"]) if o.get("winner") else None,
        "result": result or ("win" if o.get("winner") else None),
        "by_runs": by.get("runs"),
        "by_wickets": by.get("wickets"),
        "by_innings": bool(by.get("innings")),
        "method": o.get("method"),
        "eliminator": canonical_team(o["eliminator"]) if o.get("eliminator") else None,
    }


def parse_match(data: dict, match_id: str) -> dict[str, list[dict]]:
    info = data["info"]
    registry = (info.get("registry") or {}).get("people") or {}
    pid = registry.get     # name → Cricsheet registry id (None if missing)

    fmt = classify_format(info)
    dates = [str(d) for d in info.get("dates") or []]
    start = date.fromisoformat(dates[0]) if dates else None
    teams_raw = list(info.get("teams") or [])
    event = info.get("event") or {}
    toss = info.get("toss") or {}
    venue_raw = info.get("venue") or ""
    city = info.get("city")
    bpo = int(info.get("balls_per_over") or 6)

    match = {
        "match_id": match_id,
        "format": fmt,
        "is_limited_overs": fmt in FORMAT_LIMITED,
        "raw_match_type": info.get("match_type"),
        "team_type": info.get("team_type"),               # international | club
        "gender": info.get("gender"),
        "season": str(info.get("season")) if info.get("season") is not None else None,
        "match_date": start,
        "dates": dates,
        "competition": event.get("name"),
        "competition_id": _slug_or_none(event.get("name")),
        "match_number": event.get("match_number"),
        "stage": event.get("stage") or event.get("group"),
        "city": city,
        "venue": canonical_venue(venue_raw, city) if venue_raw else None,
        "venue_raw": venue_raw or None,
        "venue_id": venue_id(venue_raw, city) if venue_raw else None,
        "team1": canonical_team(teams_raw[0]) if teams_raw else None,
        "team2": canonical_team(teams_raw[1]) if len(teams_raw) > 1 else None,
        "team1_id": team_id(teams_raw[0]) if teams_raw else None,
        "team2_id": team_id(teams_raw[1]) if len(teams_raw) > 1 else None,
        "team1_raw": teams_raw[0] if teams_raw else None,
        "team2_raw": teams_raw[1] if len(teams_raw) > 1 else None,
        "toss_winner": canonical_team(toss["winner"]) if toss.get("winner") else None,
        "toss_decision": toss.get("decision"),
        "overs": info.get("overs"),
        "balls_per_over": bpo,
        "player_of_match": [pid(n) or n for n in info.get("player_of_match") or []],
        **_outcome(info),
    }

    players = []
    for team, names in (info.get("players") or {}).items():
        for order, name in enumerate(names, start=1):
            players.append({"match_id": match_id, "team": canonical_team(team), "team_id": team_id(team),
                            "player_id": pid(name), "name": name, "list_order": order})

    innings_rows, deliveries, wickets = [], [], []
    for inn_no, inn in enumerate(data.get("innings") or [], start=1):
        batting = canonical_team(inn["team"])
        bowling = (match["team2"] if batting == match["team1"] else match["team1"])
        is_super = bool(inn.get("super_over"))
        target = inn.get("target") or {}
        runs = wkts = legal = 0
        faced: dict[str, int] = {}        # batter name → legal balls faced so far (wides excluded)
        scored: dict[str, int] = {}
        bowler_balls: dict[str, int] = {}

        for over in inn.get("overs") or []:
            over_no = int(over["over"])
            legal_in_over = 0
            for seq, d in enumerate(over.get("deliveries") or [], start=1):
                batter = d.get("batter") or d.get("batsman")
                bowler = d["bowler"]
                ex = d.get("extras") or {}
                r = d.get("runs") or {}
                wides, noballs = int(ex.get("wides", 0)), int(ex.get("noballs", 0))
                is_legal = wides == 0 and noballs == 0
                if is_legal:
                    legal_in_over += 1
                dismissals = d.get("wickets") or []
                real = [w for w in dismissals if w.get("kind") not in NOT_OUT_KINDS]

                deliveries.append({
                    "match_id": match_id, "match_date": start, "format": fmt, "gender": match["gender"],
                    "team_type": match["team_type"], "competition_id": match["competition_id"],
                    "venue_id": match["venue_id"], "innings_no": inn_no, "is_super_over": is_super,
                    "batting_team_id": team_id(inn["team"]),
                    "bowling_team_id": team_id(bowling) if bowling else None,
                    "over": over_no, "ball_seq": seq, "legal_ball_in_over": legal_in_over if is_legal else None,
                    "balls_per_over": bpo,
                    "batter_id": pid(batter), "batter": batter,
                    "bowler_id": pid(bowler), "bowler": bowler,
                    "non_striker_id": pid(d.get("non_striker")), "non_striker": d.get("non_striker"),
                    "runs_batter": int(r.get("batter", 0)), "runs_extras": int(r.get("extras", 0)),
                    "runs_total": int(r.get("total", 0)), "non_boundary": bool(r.get("non_boundary", False)),
                    "wides": wides, "noballs": noballs, "byes": int(ex.get("byes", 0)),
                    "legbyes": int(ex.get("legbyes", 0)), "penalty": int(ex.get("penalty", 0)),
                    "is_legal": is_legal,
                    "is_wicket": bool(real),
                    "wicket_kind": real[0]["kind"] if real else None,
                    "player_out_id": pid(real[0]["player_out"]) if real else None,
                    # match state before this ball
                    "team_runs_before": runs, "team_wickets_before": wkts, "legal_balls_before": legal,
                    "batter_balls_before": faced.get(batter, 0), "batter_runs_before": scored.get(batter, 0),
                    "bowler_balls_before": bowler_balls.get(bowler, 0),
                    "target_runs": target.get("runs"),
                })
                for w in dismissals:
                    kind = w.get("kind")
                    wickets.append({
                        "match_id": match_id, "match_date": start, "format": fmt, "innings_no": inn_no,
                        "is_super_over": is_super, "over": over_no, "ball_seq": seq,
                        "player_out_id": pid(w.get("player_out")), "player_out": w.get("player_out"),
                        "kind": kind, "is_dismissal": kind not in NOT_OUT_KINDS,
                        "bowler_id": pid(bowler) if kind in BOWLER_WICKETS else None,
                        "fielder_ids": [pid(f.get("name")) or f.get("name") for f in w.get("fielders") or []
                                        if f.get("name")],
                        "team_runs_at_fall": runs + int(r.get("total", 0)),
                        "wicket_number": wkts + 1 if kind not in NOT_OUT_KINDS else None,
                    })
                    if kind not in NOT_OUT_KINDS:
                        wkts += 1

                runs += int(r.get("total", 0))
                if is_legal:
                    legal += 1
                    bowler_balls[bowler] = bowler_balls.get(bowler, 0) + 1
                if wides == 0:                       # no-balls count as balls faced; wides don't
                    faced[batter] = faced.get(batter, 0) + 1
                scored[batter] = scored.get(batter, 0) + int(r.get("batter", 0))

        pens = inn.get("penalty_runs") or {}
        innings_rows.append({
            "match_id": match_id, "innings_no": inn_no, "team": batting, "team_id": team_id(inn["team"]),
            "is_super_over": is_super, "runs": runs + int(pens.get("pre", 0)) + int(pens.get("post", 0)),
            "wickets": wkts, "legal_balls": legal, "target_runs": target.get("runs"),
            "target_overs": target.get("overs"), "declared": bool(inn.get("declared")),
            "forfeited": bool(inn.get("forfeited")),
            "powerplays": [{"from": p.get("from"), "to": p.get("to"), "type": p.get("type")}
                           for p in inn.get("powerplays") or []],
        })

    return {"matches": [match], "match_players": players, "innings": innings_rows,
            "deliveries": deliveries, "wickets": wickets}


def _slug_or_none(text: str | None) -> str | None:
    if not text:
        return None
    from cricdata.names import slug
    return slug(text)
