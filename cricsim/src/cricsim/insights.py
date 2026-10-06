"""Plain-English headlines from a match summary — what a fan reads first."""
from __future__ import annotations

from cricsim.engine.model import Model


def _pct(p: float | None) -> str:
    return "—" if p is None else f"{100 * p:.0f}%"


def insights(s: dict, model: Model | None = None) -> list[dict]:
    out: list[dict] = []
    win = s["result"]["win"]
    (a, pa), (b, pb) = list(win.items())
    fav, p = (a, pa) if pa >= pb else (b, pb)
    out.append({"kind": "result", "text": f"{fav} win {_pct(p)} of {s['meta']['simulations']:,} simulations."
                if abs(pa - pb) > 0.04 else f"Too close to call: {a} {_pct(pa)}, {b} {_pct(pb)}."})

    by_toss = s["result"].get("by_toss") or []
    if len(by_toss) == 2:
        bf = {bt["batting_first"]: bt["win"] for bt in by_toss}      # who batted first → win shares
        swings = []
        for t in bf:
            other = next(o for o in bf if o != t)
            swings.append((bf[t][t] - bf[other][t], t, bf[t][t], bf[other][t]))
        d, t, first, chase = max(swings, key=lambda x: abs(x[0]))
        if abs(d) >= 0.04:
            out.append({"kind": "toss", "text": f"The toss matters: {t} win {_pct(first)} batting first "
                        f"v {_pct(chase)} chasing."})

    for team in s["teams"]:
        bat = team.get("batting") or {}
        sc = bat.get("score", {}).get("q", {})
        if sc:
            out.append({"kind": "score", "text": f"{team['name']} project {sc['50']:.0f} (80% range {sc['10']:.0f}–{sc['90']:.0f})."})
        pp = next((ph for ph in bat.get("phases", []) if ph["phase"] == "Powerplay"), None)
        if pp and pp["runs"]["mean"] is not None:
            out.append({"kind": "phase", "text": f"Powerplay: {team['name']} ~{pp['runs']['mean']:.0f} runs for "
                        f"{pp['wickets']['mean']:.1f} wickets; no wicket at all in {_pct(pp['p_no_wicket'])} of simulations."})
        fow = (bat.get("fall_of_wickets") or [{}])[0]
        if fow.get("bowler"):
            bw = fow["bowler"][0]
            out.append({"kind": "wicket", "text": f"{team['name']}'s first wicket most likely falls around over "
                        f"{fow['over']['q']['50']:.0f}; {bw['name']} is the likeliest to take it ({_pct(bw['p'])})."})
        players = team.get("players") or []
        bats = [p for p in players if p.get("batting")]
        if bats:
            top = max(bats, key=lambda p: p["batting"]["p_top_scorer"] or 0)
            out.append({"kind": "player", "text": f"{top['name']} is {team['name']}'s likeliest top scorer "
                        f"({_pct(top['batting']['p_top_scorer'])}), with a {_pct(top['batting']['p_at_least'].get('30') or top['batting']['p_at_least'].get('50'))} "
                        f"chance of {'30' if '30' in top['batting']['p_at_least'] else '50'}+."})
    for team in s["teams"]:
        bowls = [p for p in team.get("players") or [] if p.get("bowling") and (p["bowling"]["p_bowls"] or 0) > 0.5]
        if bowls:
            top = max(bowls, key=lambda p: p["bowling"]["p_best_bowler"] or 0)
            out.append({"kind": "player", "text": f"{top['name']} leads {team['name']}'s attack: "
                        f"{_pct(top['bowling']['p_wickets']['2'])} chance of 2+ wickets."})
    if s.get("matchups"):
        m = s["matchups"][0]
        name = (lambda pid: model.names[model.pid(pid)] if model is not None and model.knows(pid) else pid)
        out.append({"kind": "matchup", "text": f"Key duel: {name(m['bowler'])} dismisses {name(m['batter'])} "
                    f"in {_pct(m['p'])} of simulations."})
    return out
