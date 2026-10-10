"""Share / broadcast cards as SVG, straight from a published match document."""
from __future__ import annotations

from xml.sax.saxutils import escape

THEMES = {
    "dark": {"bg": "#0b1220", "panel": "#131c2e", "text": "#e8edf6", "muted": "#8b97ad", "a": "#2fbf71",
             "b": "#3d8bfd", "grid": "#1f2a40"},
    "light": {"bg": "#f7f9fc", "panel": "#ffffff", "text": "#0e1726", "muted": "#5b6577", "a": "#1f9d5c",
              "b": "#2563eb", "grid": "#e3e8f0"},
}
W, H = 1200, 675
FONT = "font-family='Barlow, Inter, Segoe UI, Arial, sans-serif'"


def _frame(t: dict, title: str, subtitle: str, body: str, watermark: bool) -> str:
    wm = (f"<text x='{W - 40}' y='{H - 28}' text-anchor='end' fill='{t['muted']}' font-size='18' {FONT}>"
          "cricsynthesis.in · free plan</text>") if watermark else ""
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}'>"
            f"<rect width='{W}' height='{H}' fill='{t['bg']}'/>"
            f"<text x='40' y='64' fill='{t['text']}' font-size='38' font-weight='700' {FONT}>{escape(title)}</text>"
            f"<text x='40' y='100' fill='{t['muted']}' font-size='22' {FONT}>{escape(subtitle)}</text>"
            f"{body}"
            f"<text x='40' y='{H - 28}' fill='{t['muted']}' font-size='18' {FONT}>CricSynthesis · ball-by-ball simulation"
            f"</text>{wm}</svg>")


def _sub(doc: dict) -> str:
    m = doc["match"]
    sims = doc["summary"]["meta"]["simulations"]
    return " · ".join(x for x in (m.get("competition"), m.get("venue"), m.get("date"), f"{sims:,} simulations") if x)


def win_card(doc: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    (a, pa), (b, pb) = list(doc["summary"]["result"]["win"].items())
    x0, x1, y = 40, W - 40, 300
    split = x0 + (x1 - x0) * pa
    proj = [tm["batting"]["score"]["q"].get("50") for tm in doc["summary"]["teams"]]
    body = (f"<text x='{x0}' y='{y - 40}' fill='{t['a']}' font-size='96' font-weight='700' {FONT}>{100 * pa:.0f}%</text>"
            f"<text x='{x1}' y='{y - 40}' text-anchor='end' fill='{t['b']}' font-size='96' font-weight='700' {FONT}>{100 * pb:.0f}%</text>"
            f"<rect x='{x0}' y='{y}' width='{split - x0:.1f}' height='34' rx='6' fill='{t['a']}'/>"
            f"<rect x='{split:.1f}' y='{y}' width='{x1 - split:.1f}' height='34' rx='6' fill='{t['b']}'/>"
            f"<text x='{x0}' y='{y + 80}' fill='{t['text']}' font-size='34' {FONT}>{escape(a)}</text>"
            f"<text x='{x1}' y='{y + 80}' text-anchor='end' fill='{t['text']}' font-size='34' {FONT}>{escape(b)}</text>"
            f"<text x='{x0}' y='{y + 122}' fill='{t['muted']}' font-size='24' {FONT}>Projected score {proj[0]:.0f}</text>"
            f"<text x='{x1}' y='{y + 122}' text-anchor='end' fill='{t['muted']}' font-size='24' {FONT}>Projected score {proj[1]:.0f}</text>")
    if doc.get("insights"):
        body += (f"<text x='{x0}' y='{y + 210}' fill='{t['text']}' font-size='26' {FONT}>"
                 f"{escape(doc['insights'][0]['text'])}</text>")
    return _frame(t, doc["match"].get("title") or f"{a} v {b}", _sub(doc), body, watermark)


def scores_card(doc: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    teams = doc["summary"]["teams"]
    hists = [tm["batting"]["score"]["hist"] for tm in teams]
    lo = min(h[0]["from"] for h in hists)
    hi = max(h[-1]["to"] for h in hists)
    width = hists[0][0]["to"] - hists[0][0]["from"]
    bins = list(range(lo, hi, width))
    pmax = max(x["p"] for h in hists for x in h) or 1
    x0, y0, w, h = 60, 150, W - 120, 380
    bw = w / len(bins)
    body = ""
    for k, (tm, hist, col) in enumerate(zip(teams, hists, (t["a"], t["b"]))):
        by = {x["from"]: x["p"] for x in hist}
        for i, b in enumerate(bins):
            p = by.get(b, 0)
            bh = h * p / pmax
            body += (f"<rect x='{x0 + i * bw + k * bw / 2 + 2:.1f}' y='{y0 + h - bh:.1f}' width='{bw / 2 - 4:.1f}' "
                     f"height='{bh:.1f}' rx='3' fill='{col}'/>")
        q = tm["batting"]["score"]["q"]
        body += (f"<text x='{x0 + k * w / 2}' y='{y0 + h + 80}' fill='{col}' font-size='26' {FONT}>"
                 f"{escape(tm['name'])}: {q['50']:.0f} (80%: {q['10']:.0f}–{q['90']:.0f})</text>")
    for i, b in enumerate(bins):
        if i % 2 == 0:
            body += (f"<text x='{x0 + i * bw:.1f}' y='{y0 + h + 28}' fill='{t['muted']}' font-size='18' {FONT}>{b}</text>")
    return _frame(t, "Where the scores land", _sub(doc), body, watermark)


def wickets_card(doc: dict, team: int = 0, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    tm = doc["summary"]["teams"][team]
    fow = [f for f in tm["batting"]["fall_of_wickets"] if f.get("by_over")]
    overs = len(tm["batting"]["per_over"])
    x0, y0 = 150, 140
    cw = (W - x0 - 60) / overs
    ch = min(42, 420 / max(len(fow), 1))
    vmax = max((v for f in fow for v in f["by_over"]), default=1) or 1
    col = t["a"] if team == 0 else t["b"]
    body = ""
    for r, f in enumerate(fow[:10]):
        body += (f"<text x='{x0 - 16}' y='{y0 + r * ch + ch * 0.68:.1f}' text-anchor='end' fill='{t['muted']}' "
                 f"font-size='18' {FONT}>Wkt {f['wicket']}</text>")
        for o, v in enumerate(f["by_over"]):
            body += (f"<rect x='{x0 + o * cw:.1f}' y='{y0 + r * ch:.1f}' width='{cw - 2:.1f}' height='{ch - 2:.1f}' "
                     f"fill='{col}' fill-opacity='{0.06 + 0.94 * v / vmax:.3f}'/>")
    step = 1 if overs <= 20 else 5
    for o in range(0, overs, step):
        body += (f"<text x='{x0 + o * cw + cw / 2:.1f}' y='{y0 + len(fow[:10]) * ch + 26:.1f}' text-anchor='middle' "
                 f"fill='{t['muted']}' font-size='16' {FONT}>{o + 1}</text>")
    return _frame(t, f"When {tm['name']} lose wickets", "Darker = likelier · " + _sub(doc), body, watermark)


def player_card(doc: dict, pid: str, theme: str = "dark", watermark: bool = False) -> str | None:
    t = THEMES.get(theme, THEMES["dark"])
    for k, tm in enumerate(doc["summary"]["teams"]):
        for p in tm["players"]:
            if p["id"] != pid:
                continue
            col = t["a"] if k == 0 else t["b"]
            rows = []
            if p.get("batting"):
                rows += [(f"{m}+ runs", v) for m, v in p["batting"]["p_at_least"].items()]
                rows.append(("Top scorer", p["batting"]["p_top_scorer"]))
            if p.get("bowling") and (p["bowling"]["p_bowls"] or 0) > 0.5:
                rows += [(f"{m}+ wickets", v) for m, v in list(p["bowling"]["p_wickets"].items())[:3]]
            body = ""
            for i, (label, v) in enumerate(rows[:9]):
                y = 150 + i * 52
                body += (f"<text x='40' y='{y + 28}' fill='{t['text']}' font-size='24' {FONT}>{escape(label)}</text>"
                         f"<rect x='260' y='{y + 6}' width='{(W - 420) * (v or 0):.1f}' height='30' rx='5' fill='{col}'/>"
                         f"<text x='{W - 60}' y='{y + 30}' text-anchor='end' fill='{t['text']}' font-size='24' "
                         f"{FONT}>{100 * (v or 0):.0f}%</text>")
            return _frame(t, f"{p['name']} · {tm['name']}", _sub(doc), body, watermark)
    return None


CARDS = {"win": win_card, "scores": scores_card}


# ── more match cards ───────────────────────────────────────────────────────────

def _names(doc: dict) -> dict[str, str]:
    return {p["id"]: p["name"] for tm in doc["summary"]["teams"] for p in tm["players"]}


def worm_card(doc: dict, theme: str = "dark", watermark: bool = False) -> str:
    """Expected cumulative score, over by over, for both sides."""
    t = THEMES.get(theme, THEMES["dark"])
    teams = doc["summary"]["teams"]
    curves = []
    for tm in teams:
        acc, pts = 0.0, []
        for o in tm["batting"]["per_over"]:
            acc += o["runs"] or 0
            pts.append(acc)
        curves.append(pts)
    overs = max(len(c) for c in curves)
    top = max(max(c) for c in curves) or 1
    x0, y0, w, h = 90, 140, W - 160, 400
    body = ""
    for v in range(0, int(top) + 1, 50 if top > 120 else 20):
        y = y0 + h - h * v / top
        body += (f"<line x1='{x0}' x2='{x0 + w}' y1='{y:.1f}' y2='{y:.1f}' stroke='{t['grid']}'/>"
                 f"<text x='{x0 - 12}' y='{y + 6:.1f}' text-anchor='end' fill='{t['muted']}' font-size='16' {FONT}>{v}</text>")
    for k, (pts, col) in enumerate(zip(curves, (t["a"], t["b"]))):
        path = " ".join(f"{'M' if i == 0 else 'L'}{x0 + w * (i + 1) / overs:.1f},{y0 + h - h * v / top:.1f}"
                        for i, v in enumerate(pts))
        body += f"<path d='M{x0},{y0 + h} {path[1:] if path.startswith('M') else path}' fill='none' stroke='{col}' stroke-width='4'/>"
        body += (f"<text x='{x0 + k * w / 2}' y='{y0 + h + 70}' fill='{col}' font-size='26' {FONT}>"
                 f"{escape(teams[k]['name'])}: {pts[-1]:.0f} expected</text>")
    step = 5 if overs > 20 else 2
    for o in range(step, overs + 1, step):
        body += (f"<text x='{x0 + w * o / overs:.1f}' y='{y0 + h + 28}' text-anchor='middle' fill='{t['muted']}' "
                 f"font-size='16' {FONT}>{o}</text>")
    return _frame(t, "Expected run worm", _sub(doc), body, watermark)


def phases_card(doc: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    teams = doc["summary"]["teams"]
    rows = [(ph["phase"], [tm["batting"]["phases"][i] for tm in teams]) for i, ph in enumerate(teams[0]["batting"]["phases"])]
    vmax = max((x["runs"]["mean"] or 0) for _, pair in rows for x in pair) or 1
    body = ""
    for r, (name, pair) in enumerate(rows):
        y = 160 + r * 150
        body += f"<text x='40' y='{y + 22}' fill='{t['text']}' font-size='26' font-weight='700' {FONT}>{escape(name)}</text>"
        for k, (x, col) in enumerate(zip(pair, (t["a"], t["b"]))):
            yy = y + 40 + k * 46
            ln = (W - 520) * (x["runs"]["mean"] or 0) / vmax
            body += (f"<rect x='300' y='{yy}' width='{ln:.1f}' height='34' rx='5' fill='{col}'/>"
                     f"<text x='40' y='{yy + 26}' fill='{t['muted']}' font-size='20' {FONT}>{escape(teams[k]['name'])}</text>"
                     f"<text x='{310 + ln:.1f}' y='{yy + 26}' fill='{t['text']}' font-size='22' {FONT}>"
                     f"{x['runs']['mean']:.0f} runs · {x['wickets']['mean']:.1f} wkts</text>")
    return _frame(t, "Phase by phase", _sub(doc), body, watermark)


def duels_card(doc: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    names = _names(doc)
    rows = doc["summary"].get("matchups", [])[:7]
    vmax = max((r["p"] for r in rows), default=1) or 1
    body = ""
    for i, r in enumerate(rows):
        y = 150 + i * 62
        label = f"{names.get(r['bowler'], r['bowler'])} dismisses {names.get(r['batter'], r['batter'])}"
        body += (f"<text x='40' y='{y + 28}' fill='{t['text']}' font-size='24' {FONT}>{escape(label)}</text>"
                 f"<rect x='680' y='{y + 6}' width='{(W - 820) * r['p'] / vmax:.1f}' height='30' rx='5' fill='{t['a']}'/>"
                 f"<text x='{W - 40}' y='{y + 30}' text-anchor='end' fill='{t['text']}' font-size='24' {FONT}>{100 * r['p']:.0f}%</text>")
    return _frame(t, "Key duels", "Chance each bowler dismisses each batter · " + _sub(doc), body, watermark)


# ── analytics cards (from the model, not a match) ──────────────────────────────

def _bars(t: dict, rows: list[tuple[str, float, str]], x_label: int = 40, x_bar: int = 420, top: int = 150,
          step: int = 64, col: str | None = None) -> str:
    vmax = max((abs(v) for _, v, _ in rows), default=1) or 1
    body = ""
    for i, (label, v, txt) in enumerate(rows):
        y = top + i * step
        body += (f"<text x='{x_label}' y='{y + 28}' fill='{t['text']}' font-size='24' {FONT}>{escape(label)}</text>"
                 f"<rect x='{x_bar}' y='{y + 6}' width='{(W - x_bar - 200) * abs(v) / vmax:.1f}' height='30' rx='5' "
                 f"fill='{col or t['a']}'/>"
                 f"<text x='{W - 40}' y='{y + 30}' text-anchor='end' fill='{t['text']}' font-size='24' {FONT}>{escape(txt)}</text>")
    return body


def player_profile_card(prof: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    p = prof["player"]
    rows = []
    for ph, m in prof["batting"].items():
        rows.append((f"Strike rate · {ph}", m["strike_rate"] or 0, f"{m['strike_rate']:.0f}  ({m['v_average']['strike_rate']:.2f}×)"))
    for ph, m in prof["bowling"].items():
        rows.append((f"Economy · {ph}", m["economy"] or 0, f"{m['economy']:.2f}  ({m['v_average']['economy']:.2f}×)"))
    sub = f"{prof['format']} · {p['hand']}-hand bat · {p['bowling_kind'].replace('_', ' ')} · v average player"
    return _frame(t, p["name"], sub, _bars(t, rows, step=70), watermark)


def matchup_card(mu: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    me, avg = mu["matchup"], mu["average_pairing"]
    rows = [("Strike rate", me["strike_rate"], f"{me['strike_rate']:.0f} v {avg['strike_rate']:.0f} avg"),
            ("Balls per dismissal", me["balls_per_dismissal"] or 0,
             f"{me['balls_per_dismissal'] or 0:.0f} v {avg['balls_per_dismissal'] or 0:.0f} avg"),
            ("Dot balls %", me["dot_pct"], f"{me['dot_pct']:.0f}% v {avg['dot_pct']:.0f}%"),
            ("Boundary %", me["boundary_pct"], f"{me['boundary_pct']:.0f}% v {avg['boundary_pct']:.0f}%")]
    title = f"{mu['batter']['name']} v {mu['bowler']['name']}"
    return _frame(t, title, f"{mu['format']} · {mu['phase']} overs · per-ball model", _bars(t, rows, step=90, top=170), watermark)


def venue_card(v: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    rows = []
    for ph, m in v["by_phase"].items():
        rows.append((f"Runs per over · {ph}", m["runs_per_over"] or 0,
                     f"{m['runs_per_over']:.2f}  ({m['v_neutral']['scoring']:.2f}×)"))
    for ph, m in v["by_phase"].items():
        rows.append((f"Balls per wicket · {ph}", m["balls_per_wicket"] or 0,
                     f"{m['balls_per_wicket'] or 0:.0f}  ({m['v_neutral']['wickets']:.2f}×)"))
    name = v["venue"].get("name") or v["venue"]["id"]
    return _frame(t, name, f"{v['format']} · {v['character']} · v neutral ground", _bars(t, rows, step=70, col=t["b"]), watermark)


def trend_card(tr: dict, theme: str = "dark", watermark: bool = False) -> str:
    t = THEMES.get(theme, THEMES["dark"])
    rows = tr["seasons"]
    if not rows:
        return _frame(t, "Scoring trend", tr["format"], "", watermark)
    x0, y0, w, h = 90, 150, W - 170, 380
    phases_ = ("powerplay", "middle", "death")
    vals = [r[ph]["runs_per_over"] or 0 for r in rows for ph in phases_]
    lo, hi = min(vals) - 0.5, max(vals) + 0.5
    cols = (t["a"], t["b"], t["muted"])
    body = ""
    for k, ph in enumerate(phases_):
        pts = [(x0 + w * i / max(len(rows) - 1, 1), y0 + h - h * ((r[ph]["runs_per_over"] or 0) - lo) / (hi - lo))
               for i, r in enumerate(rows)]
        body += f"<path d='{' '.join(('M' if i == 0 else 'L') + f'{x:.1f},{y:.1f}' for i, (x, y) in enumerate(pts))}' " \
                f"fill='none' stroke='{cols[k]}' stroke-width='4'/>"
        body += (f"<text x='{x0 + k * 300}' y='{y0 + h + 80}' fill='{cols[k]}' font-size='24' {FONT}>"
                 f"{ph.title()}: {rows[-1][ph]['runs_per_over']:.2f} an over</text>")
    for i, r in enumerate(rows):
        if i % max(1, len(rows) // 8) == 0 or i == len(rows) - 1:
            body += (f"<text x='{x0 + w * i / max(len(rows) - 1, 1):.1f}' y='{y0 + h + 30}' text-anchor='middle' "
                     f"fill='{t['muted']}' font-size='16' {FONT}>{r['season']}</text>")
    return _frame(t, "Scoring trend", f"{tr['format']} · runs per over by phase, average batter v average attack", body, watermark)


CARDS.update({"worm": worm_card, "phases": phases_card, "duels": duels_card})
