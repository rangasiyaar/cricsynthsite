"""Match pages as Khel Now serves them (the shapes the probes found), built from a few lines of match facts."""
import json

NZ = [("Tim Seifert", "wk", "(WK)"), ("Finn Allen", "bat", ""), ("Daryl Mitchell", "bat", ""),
      ("Glenn Phillips", "all", ""), ("Bevon Jacobs", "bat", ""), ("Michael Bracewell", "all", ""),
      ("Mitchell Santner", "all", "(C)"), ("Kyle Jamieson", "bowl", ""), ("Adam Milne", "bowl", ""),
      ("Jacob Duffy", "bowl", ""), ("Matthew Fisher", "bowl", ""), ("Ish Sodhi", "bowl", ""), ("Devon Conway", "wk", "")]
IND = [("Sanju Samson", "wk", "(WK)"), ("Abhishek Sharma", "all", ""), ("Vaibhav Sooryavanshi", "bat", ""),
       ("Shreyas Iyer", "bat", "(C)"), ("Tilak Varma", "bat", ""), ("Nitish Kumar Reddy", "all", ""),
       ("Naman Dhir", "bat", ""), ("Axar Patel", "all", ""), ("Bhuvneshwar Kumar", "bowl", ""),
       ("Arshdeep Singh", "bowl", ""), ("Prince Yadav", "bowl", ""), ("Kuldeep Yadav", "bowl", "")]
NZ_ID, IND_ID = 13, 2
START = 1793343600          # 30 Oct 2026 07:00 UTC (12:30 IST)
URL = "https://khelnow.com/live-cricket-score/new-zealand-vs-india-india-tour-of-new-zealand-30th-october-2026-at-7-00-am-40100"


def pid(team_id: int, k: int) -> str:
    return str(team_id * 1000 + k)


def squad(team_id: int, rows, named: bool) -> dict:
    return {"team_id": team_id, "squads": [
        {"player_id": pid(team_id, k), "name": n, "role": r, "role_str": rs, "substitute": "false", "out": "false",
         "in": "false", "playing11": "true" if named and k < 11 else "false"} for k, (n, r, rs) in enumerate(rows)]}


def players(team_id: int, rows) -> list[dict]:
    return [{"pid": int(pid(team_id, k)), "title": n, "short_name": n, "playing_role": r, "batting_style": "Right hand Bat",
             "bowling_style": "Right-arm fast", "bowling_type": "Pace", "birthdate": f"199{k % 10}-01-0{1 + k % 9}",
             "country": "nz"} for k, (n, r, _) in enumerate(rows)]


def innings(number: int, bat_team: int, bowl_team: int, balls: list[tuple], target: int = 0) -> tuple[dict, list[dict]]:
    """A scorecard innings and its commentary from (batter k, bowler k, runs, kind) per ball; kind is '', 'wd', 'nb',
    'lb', or 'W:<dismissal>' (the batter on strike out)."""
    comm, legal, runs, wkts = [], 0, 0, 0
    strike, other, next_in = 0, 1, 2
    faced: dict[int, list[int]] = {}
    bowl: dict[int, list[int]] = {}
    out_rows: dict[int, dict] = {}
    fows = []
    for bat_k, bowl_k, r, kind in balls:
        bat_k = strike
        wd, nb, lb = (r if kind == "wd" else 0), (1 if kind == "nb" else 0), (r if kind == "lb" else 0)
        bat_run = 0 if kind in ("wd", "lb") else r
        total = bat_run + wd + nb + lb
        is_legal = kind not in ("wd", "nb")
        over, ball = divmod(legal, 6)
        legal += is_legal
        runs += total
        f = faced.setdefault(bat_k, [0, 0])
        f[0] += bat_run
        f[1] += kind != "wd"
        b = bowl.setdefault(bowl_k, [0, 0, 0])
        b[0] += is_legal
        b[1] += total - lb
        ev = {"event": "ball", "batsman_id": pid(bat_team, bat_k), "bowler_id": pid(bowl_team, bowl_k),
              "over": str(over), "ball": str(ball + 1), "run": total, "bat_run": str(bat_run), "wide_run": str(wd),
              "noball_run": str(nb), "bye_run": "0", "legbye_run": str(lb), "wideball": kind == "wd",
              "noball": kind == "nb", "four": bat_run == 4, "six": bat_run == 6, "timestamp": START + len(comm) * 40}
        if kind.startswith("W:"):
            wkts += 1
            b[2] += 1
            ev.update({"event": "wicket", "wicket_batsman_id": pid(bat_team, bat_k), "how_out": "b X"})
            out_rows[bat_k] = {"dismissal": kind[2:], "how_out": f"{kind[2:]} b {bowl_k}",
                               "first_fielder_id": pid(bowl_team, 5) if kind[2:] == "caught" else ""}
            fows.append({"name": "", "batsman_id": pid(bat_team, bat_k), "score_at_dismissal": runs,
                         "overs_at_dismissal": f"{legal // 6}.{legal % 6}", "number": wkts})
        ev["batsmen"] = [{"batsman_id": int(pid(bat_team, bat_k)), "runs": faced[bat_k][0]},
                         {"batsman_id": int(pid(bat_team, other)), "runs": faced.get(other, [0])[0]}]
        comm.append(ev)
        if kind.startswith("W:"):
            strike, next_in = next_in, next_in + 1
        else:
            ran = bat_run + lb + max(0, wd - 1)
            if ran % 2 and not ev["four"]:
                strike, other = other, strike
        if is_legal and legal % 6 == 0:
            strike, other = other, strike
            comm.append({"event": "overend", "over": legal // 6})
    batsmen = [{"name": "", "batsman_id": pid(bat_team, k), "runs": str(v[0]), "balls_faced": str(v[1]),
                "fours": "0", "sixes": "0", "dismissal": out_rows.get(k, {}).get("dismissal", ""),
                "how_out": out_rows.get(k, {}).get("how_out", "not out"),
                "first_fielder_id": out_rows.get(k, {}).get("first_fielder_id", ""), "second_fielder_id": "",
                "third_fielder_id": ""} for k, v in faced.items()]
    bowlers = [{"name": "", "bowler_id": pid(bowl_team, k), "overs": f"{v[0] // 6}.{v[0] % 6}", "maidens": "0",
                "runs_conceded": str(v[1]), "wickets": str(v[2]), "noballs": "0", "wides": "0"} for k, v in bowl.items()]
    card = {"iid": 1000 + number, "number": number, "name": "", "batting_team_id": str(bat_team),
            "fielding_team_id": str(bowl_team), "issuperover": "false", "target": str(target), "max_over": "20",
            "equations": {"runs": runs, "wickets": wkts, "overs": f"{legal // 6}" + (f".{legal % 6}" if legal % 6 else "")},
            "extra_runs": {"byes": 0, "legbyes": sum(r for _, _, r, k in balls if k == "lb"),
                           "wides": sum(r for _, _, r, k in balls if k == "wd"),
                           "noballs": sum(1 for *_, k in balls if k == "nb"), "penalty": "0"},
            "batsmen": batsmen, "bowlers": bowlers, "fows": fows, "did_not_bat": []}
    return card, comm


def names(card: dict, rows_bat, rows_bowl, bat_team: int, bowl_team: int) -> dict:
    for b in card["batsmen"]:
        b["name"] = rows_bat[int(b["batsman_id"]) - bat_team * 1000][0]
    for b in card["bowlers"]:
        b["name"] = rows_bowl[int(b["bowler_id"]) - bowl_team * 1000][0]
    for w in card["fows"]:
        w["name"] = rows_bat[int(w["batsman_id"]) - bat_team * 1000][0]
    return card


def page(status: int = 1, named: bool = False, inns: list | None = None, toss: tuple | None = None, result: str = "",
         winner: int = 0, margin: str = "", live_inning: int = 0, verified: bool = True, competition: str =
         "India tour of New Zealand", category: str = "international", fmt: str = "T20I", match_id: int = 40100, start: int = START) -> str:
    status_str = {1: "Scheduled", 2: "Completed", 3: "Live", 4: "Abandoned"}[status]
    mi = {"match_id": 99000, "title": "New Zealand vs India", "subtitle": "4th T20I", "match_number": "4",
          "format_str": fmt, "status": status, "status_str": status_str, "status_note": result or "",
          "game_state_str": "Play Ongoing" if status == 3 else "Default", "verified": "true" if verified else "false",
          "competition": {"title": competition, "category": category, "season": "2026"},
          "teama": {"team_id": NZ_ID, "name": "New Zealand", "short_name": "NZ"},
          "teamb": {"team_id": IND_ID, "name": "India", "short_name": "IND"},
          "timestamp_start": start, "venue": {"name": "Eden Park", "location": "Auckland", "country": "New Zealand"},
          "toss": {"winner": toss[0], "decision": 1 if toss[1] == "bat" else 2, "text": ""} if toss else {"winner": 0, "decision": 0},
          "result": result, "winning_team_id": winner, "win_margin": margin, "match_dls_affected": "false",
          "live_inning_number": live_inning}
    data = {"id": str(match_id), "match_info": mi, "matchInsights": [], "squad": None}
    if status != 1 or named:
        data["squad"] = {"teama": squad(NZ_ID, NZ, named or status != 1), "teamb": squad(IND_ID, IND, named or status != 1),
                         "players": players(NZ_ID, NZ) + players(IND_ID, IND),
                         "teams": [{"tid": NZ_ID, "sex": "male"}, {"tid": IND_ID, "sex": "male"}]}
    cards = [c for c, _ in inns or []]
    data["matchInsights"] = [{"innings_id": c["number"], "score_card": {"innings": cards}, "commentary": comm}
                             for c, comm in inns or []]
    blob = json.dumps({"props": {"pageProps": {"data": data}}})
    return f'<html><script id="__NEXT_DATA__" type="application/json">{blob}</script></html>'


def sitemap(*urls: str) -> str:
    return "<urlset>" + "".join(f"<url><loc>{u.replace(chr(39), '&#039;')}</loc></url>" for u in urls) + "</urlset>"
