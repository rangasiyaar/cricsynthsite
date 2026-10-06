"""Broadcast graphics as SVG (and PNG via resvg).

Every graphic is laid out on a 1600×900 (16:9) canvas with a 5% title-safe
margin and scales to any output size through the viewBox. Themes:

    broadcast_dark   dark panel, for full-frame or picture-in-picture
    broadcast_light  light panel
    transparent      no background — for keying over live video in OBS / vMix / CasparCG

Pure functions: data in, SVG text out. No I/O except the bundled fonts used
for PNG output.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

W, H = 1600, 900
MX, MY = 80, 54                       # title-safe margins (5% / 6%)
FONT_DIR = Path(__file__).parent / "fonts"
HEAD = "'Barlow Condensed', 'Arial Narrow', sans-serif"
BODY = "'Barlow', Arial, sans-serif"
_HEX = re.compile(r"^#?[0-9a-fA-F]{6}$")


@dataclass(frozen=True)
class Theme:
    name: str
    bg: str | None
    panel: str | None
    ink: str
    ink2: str
    grid: str
    home: str = "#5980a6"
    away: str = "#e0a43a"


THEMES = {
    "broadcast_dark": Theme("broadcast_dark", "#0e141b", "#16202b", "#f2f2f3", "#a9b4c0", "#2a3542"),
    "broadcast_light": Theme("broadcast_light", "#f2f2f3", "#ffffff", "#1d1f20", "#5d6166", "#d9dce0"),
    "transparent": Theme("transparent", None, "rgba(14,20,27,0.85)", "#f2f2f3", "#c9d1da", "rgba(255,255,255,0.18)"),
}


def theme_for(name: str, home_color: str | None = None, away_color: str | None = None) -> Theme:
    if name not in THEMES:
        raise ValueError(f"Unknown theme '{name}'. Use one of: {', '.join(THEMES)}")
    t = THEMES[name]
    kw = {}
    for key, value in (("home", home_color), ("away", away_color)):
        if value:
            if not _HEX.match(value):
                raise ValueError(f"{key}_color must be a hex colour like #1f6feb")
            kw[key] = value if value.startswith("#") else f"#{value}"
    return Theme(**{**t.__dict__, **kw})


# ── primitives ───────────────────────────────────────────────────────────────

def _t(x, y, text, size, fill, *, family=BODY, weight=500, anchor="start", extra=""):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}" {extra}>{escape(str(text))}</text>')


def _frame(theme: Theme, title: str, subtitle: str, body: str, width: int, height: int, label: str) -> str:
    bg = f'<rect width="{W}" height="{H}" fill="{theme.bg}"/>' if theme.bg else ""
    panel = (f'<rect x="{MX - 24}" y="{MY - 18}" width="{W - 2 * MX + 48}" height="{H - 2 * MY + 36}" '
             f'rx="6" fill="{theme.panel}"/>') if theme.panel else ""
    head = (_t(MX, MY + 44, title.upper(), 46, theme.ink, family=HEAD, weight=600, extra='letter-spacing="1"')
            + _t(MX, MY + 80, subtitle, 24, theme.ink2))
    brand = _t(W - MX, H - MY + 4, "CRICSYNTHESIS · GRAPHSYNTH", 16, theme.ink2, family=HEAD, weight=600,
               anchor="end", extra='letter-spacing="2" opacity="0.8"')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {W} {H}" '
            f'role="img" aria-label="{escape(label)}">{bg}{panel}{head}{body}{brand}</svg>')


def _plot_box(top=MY + 130, bottom=H - MY - 60, left=MX + 70, right=W - MX - 20):
    return left, top, right, bottom


# ── graphics ─────────────────────────────────────────────────────────────────

def win_probability(series: list[dict], home: str, away: str, overs: int, theme: Theme,
                    *, projection: dict | None = None, width: int = 1920, height: int = 1080) -> str:
    """Worm of the home side's win probability across both innings.

    series: [{"innings": 1|2, "balls": legal balls into the innings, "home_win": 0..1}, ...]
    """
    x0, y0, x1, y1 = _plot_box()
    span = 2 * overs * 6

    def px(p):
        return x0 + (x1 - x0) * min(span, (p["innings"] - 1) * overs * 6 + p["balls"]) / span

    def py(v):
        return y1 - (y1 - y0) * v

    grid = []
    for v, lab in ((1, "100%"), (0.75, "75%"), (0.5, "50%"), (0.25, "75%"), (0, "100%")):
        grid.append(f'<line x1="{x0}" x2="{x1}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{theme.grid}" '
                    f'stroke-width="{2 if v == 0.5 else 1}"/>')
        grid.append(_t(x0 - 14, py(v) + 7, lab, 20, theme.ink2, anchor="end"))
    mid = x0 + (x1 - x0) / 2
    grid.append(f'<line x1="{mid:.1f}" x2="{mid:.1f}" y1="{y0}" y2="{y1}" stroke="{theme.grid}" stroke-dasharray="6 6"/>')
    for inn in (1, 2):
        grid.append(_t(x0 + (x1 - x0) * (inn - 0.5) / 2, y1 + 40, f"INNINGS {inn}", 20, theme.ink2,
                       family=HEAD, weight=600, anchor="middle", extra='letter-spacing="2"'))
    grid.append(_t(x0 + 10, y0 + 28, home, 22, theme.home, family=HEAD, weight=600))
    grid.append(_t(x0 + 10, y1 - 14, away, 22, theme.away, family=HEAD, weight=600))

    pts = sorted(series, key=lambda p: ((p["innings"] - 1) * overs * 6 + p["balls"]))
    body = "".join(grid)
    if pts:
        line = " ".join(f"{px(p):.1f},{py(p['home_win']):.1f}" for p in pts)
        mid_y = py(0.5)
        first, last = pts[0], pts[-1]
        area = f"{px(first):.1f},{mid_y:.1f} {line} {px(last):.1f},{mid_y:.1f}"
        clip_top = f'<clipPath id="above"><rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{mid_y - y0:.1f}"/></clipPath>'
        clip_bot = f'<clipPath id="below"><rect x="{x0}" y="{mid_y:.1f}" width="{x1 - x0}" height="{y1 - mid_y:.1f}"/></clipPath>'
        body += (f"<defs>{clip_top}{clip_bot}</defs>"
                 f'<polygon points="{area}" fill="{theme.home}" fill-opacity="0.28" clip-path="url(#above)"/>'
                 f'<polygon points="{area}" fill="{theme.away}" fill-opacity="0.28" clip-path="url(#below)"/>'
                 f'<polyline points="{line}" fill="none" stroke="{theme.ink}" stroke-width="4" stroke-linejoin="round"/>'
                 f'<circle cx="{px(last):.1f}" cy="{py(last["home_win"]):.1f}" r="9" fill="{theme.ink}"/>')
        hw = last["home_win"]
        lead, pct, col = (home, hw, theme.home) if hw >= 0.5 else (away, 1 - hw, theme.away)
        body += _t(W - MX, MY + 44, f"{lead} {pct * 100:.0f}%", 54, col, family=HEAD, weight=600, anchor="end")
    if projection:
        body += _t(W - MX, MY + 80, f"Projected {projection['score']} ± {projection['band']}", 24, theme.ink2,
                   anchor="end")
    return _frame(theme, "Win probability", f"{home} v {away} · simulated by MatchSynth", body,
                  width, height, f"Win probability worm, {home} v {away}")


def score_projection(batting: str, runs: int, wickets: int, overs_text: str, projected: dict, theme: Theme,
                     *, target: int | None = None, color: str | None = None,
                     width: int = 1920, height: int = 1080) -> str:
    """Current score and projected final total (P10–P90 band, median marker)."""
    col = color or theme.home
    lo = max(0, min(runs, projected["p10"]) - 10)
    hi = max(projected["p90"], target or 0) + 10
    x0, x1, yb = MX + 40, W - MX - 40, 560

    def px(v):
        return x0 + (x1 - x0) * (v - lo) / max(1, hi - lo)

    body = (_t(MX, 300, f"{runs}/{wickets}", 150, theme.ink, family=HEAD, weight=600)
            + _t(MX + 8, 350, f"{batting} · {overs_text} overs", 30, theme.ink2)
            + f'<rect x="{x0}" y="{yb - 6}" width="{x1 - x0}" height="12" rx="6" fill="{theme.grid}"/>'
            + f'<rect x="{px(projected["p10"]):.1f}" y="{yb - 22}" width="{px(projected["p90"]) - px(projected["p10"]):.1f}" '
              f'height="44" rx="8" fill="{col}" fill-opacity="0.55"/>'
            + f'<rect x="{px(projected["median"]) - 3:.1f}" y="{yb - 40}" width="6" height="80" fill="{theme.ink}"/>'
            + _t(px(projected["median"]), yb - 56, f"{projected['median']}", 54, theme.ink, family=HEAD,
                 weight=600, anchor="middle")
            + _t(px(projected["p10"]), yb + 70, f"{projected['p10']}", 30, theme.ink2, anchor="middle")
            + _t(px(projected["p90"]), yb + 70, f"{projected['p90']}", 30, theme.ink2, anchor="middle")
            + _t(MX, yb + 190, "Projected total — middle 80% of simulated outcomes", 24, theme.ink2))
    if target:
        body += (f'<line x1="{px(target):.1f}" x2="{px(target):.1f}" y1="{yb - 30}" y2="{yb + 96}" '
                 f'stroke="{theme.away}" stroke-width="4" stroke-dasharray="8 6"/>'
                 + _t(px(target), yb + 124, f"TARGET {target}", 26, theme.away, family=HEAD, weight=600,
                      anchor="middle"))
    return _frame(theme, "AI score projection", f"{batting} · MatchSynth", body, width, height,
                  f"Score projection for {batting}")


def _bar_axes(theme: Theme, n_overs: int, ymax: float, x0, y0, x1, y1, step: int):
    out = []
    v = 0
    while v <= ymax:
        y = y1 - (y1 - y0) * v / ymax
        out.append(f'<line x1="{x0}" x2="{x1}" y1="{y:.1f}" y2="{y:.1f}" stroke="{theme.grid}"/>')
        out.append(_t(x0 - 14, y + 7, v, 20, theme.ink2, anchor="end"))
        v += step
    every = 1 if n_overs <= 20 else 5
    for o in range(n_overs):
        if (o + 1) % every == 0 or o == 0:
            out.append(_t(x0 + (x1 - x0) * (o + 0.5) / n_overs, y1 + 30, o + 1, 18, theme.ink2, anchor="middle"))
    return "".join(out)


def _legend(theme: Theme, names: list[tuple[str, str]]):
    out, x = [], W - MX
    for name, col in reversed(names):
        w = 26 + 13 * len(name)
        x -= w
        out.append(f'<rect x="{x}" y="{MY + 62}" width="16" height="16" fill="{col}"/>'
                   + _t(x + 24, MY + 78, name, 22, theme.ink, family=HEAD, weight=600))
        x -= 24
    return "".join(out)


def manhattan(innings: list[dict], theme: Theme, *, title_suffix: str = "", width: int = 1920,
              height: int = 1080) -> str:
    """Runs per over, side by side per innings; dots mark wickets.

    innings: [{"team": "MI", "runs": [per over], "wickets": [per over]}, ...] (1 or 2 entries)
    """
    x0, y0, x1, y1 = _plot_box()
    n = max(len(i["runs"]) for i in innings) if innings else 20
    ymax = max(12, max((max(i["runs"], default=0) for i in innings), default=0) + 4)
    step = 6 if ymax <= 30 else 10
    ymax = step * -(-ymax // step)
    cols = [theme.home, theme.away]
    slot = (x1 - x0) / n
    bw = slot * 0.8 / max(1, len(innings))
    body = _bar_axes(theme, n, ymax, x0, y0, x1, y1, step)
    for k, inn in enumerate(innings):
        for o, r in enumerate(inn["runs"]):
            x = x0 + slot * o + slot * 0.1 + bw * k
            h = (y1 - y0) * r / ymax
            body += f'<rect x="{x:.1f}" y="{y1 - h:.1f}" width="{bw:.1f}" height="{h:.1f}" fill="{cols[k]}"/>'
            for w in range(inn["wickets"][o] if o < len(inn["wickets"]) else 0):
                body += (f'<circle cx="{x + bw / 2:.1f}" cy="{y1 - h - 14 - w * 22:.1f}" r="8" '
                         f'fill="{theme.ink}" stroke="{cols[k]}" stroke-width="3"/>')
    body += _legend(theme, [(i["team"], cols[k]) for k, i in enumerate(innings)])
    teams = " v ".join(i["team"] for i in innings)
    return _frame(theme, "Manhattan", f"Runs per over{title_suffix}", body, width, height, f"Manhattan, {teams}")


def run_worm(innings: list[dict], theme: Theme, *, title_suffix: str = "", width: int = 1920,
             height: int = 1080) -> str:
    """Cumulative runs by over for each innings, wickets marked."""
    x0, y0, x1, y1 = _plot_box()
    n = max(len(i["runs"]) for i in innings) if innings else 20
    totals = [sum(i["runs"]) for i in innings]
    step = 25 if max(totals, default=0) <= 250 else 50
    ymax = step * -(-(max(totals, default=0) + 10) // step)
    cols = [theme.home, theme.away]
    body = _bar_axes(theme, n, ymax, x0, y0, x1, y1, step)
    for k, inn in enumerate(innings):
        cum, pts, wk = 0, [f"{x0},{y1}"], []
        for o, r in enumerate(inn["runs"]):
            cum += r
            x = x0 + (x1 - x0) * (o + 1) / n
            y = y1 - (y1 - y0) * cum / ymax
            pts.append(f"{x:.1f},{y:.1f}")
            if o < len(inn["wickets"]) and inn["wickets"][o]:
                wk.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{theme.ink}" stroke="{cols[k]}" stroke-width="3"/>')
        body += f'<polyline points="{" ".join(pts)}" fill="none" stroke="{cols[k]}" stroke-width="5"/>' + "".join(wk)
    body += _legend(theme, [(f'{i["team"]} {sum(i["runs"])}', cols[k]) for k, i in enumerate(innings)])
    return _frame(theme, "Worm", f"Cumulative runs{title_suffix}", body, width, height, "Run worm")


def phase_breakdown(rows: list[dict], theme: Theme, *, width: int = 1920, height: int = 1080) -> str:
    """Runs, wickets and run rate per phase for each team.

    rows: [{"team": "MI", "phases": [{"name": "Powerplay", "runs": 54, "wickets": 1, "overs": 6}, ...]}]
    """
    cols = [theme.home, theme.away]
    names = [p["name"] for p in rows[0]["phases"]] if rows else []
    x0, y_top = MX + 260, MY + 190
    col_w = (W - MX - x0) / max(1, len(names))
    max_rr = max((p["runs"] / max(p["overs"], 0.1) for r in rows for p in r["phases"]), default=10)
    body = "".join(_t(x0 + col_w * (j + 0.5), y_top - 30, nm.upper(), 26, theme.ink2, family=HEAD, weight=600,
                      anchor="middle", extra='letter-spacing="2"') for j, nm in enumerate(names))
    for k, row in enumerate(rows):
        y = y_top + 40 + k * 260
        body += _t(MX, y + 70, row["team"], 64, cols[k], family=HEAD, weight=600)
        for j, p in enumerate(row["phases"]):
            cx = x0 + col_w * j + 30
            rr = p["runs"] / max(p["overs"], 0.1)
            bar = (col_w - 60) * rr / max(max_rr, 1)
            body += (_t(cx, y + 60, f"{p['runs']}/{p['wickets']}", 64, theme.ink, family=HEAD, weight=600)
                     + _t(cx, y + 104, f"{rr:.2f} per over · {p['overs']:g} ov", 24, theme.ink2)
                     + f'<rect x="{cx}" y="{y + 126}" width="{col_w - 60:.1f}" height="10" fill="{theme.grid}"/>'
                     + f'<rect x="{cx}" y="{y + 126}" width="{bar:.1f}" height="10" fill="{cols[k]}"/>')
    return _frame(theme, "Phase breakdown", "Runs / wickets and scoring rate by phase", body, width, height,
                  "Phase breakdown")


def player_form(name: str, matches: list[dict], theme: Theme, *, width: int = 1920, height: int = 1080) -> str:
    """Fantasy points in recent matches (oldest → newest) with a recency-weighted average line.

    matches: [{"label": "v CSK", "points": 64.0}, ...]
    """
    x0, y0, x1, y1 = _plot_box(bottom=H - MY - 90)
    n = max(1, len(matches))
    top = max([m["points"] for m in matches] + [40])
    step = 20 if top <= 120 else 40
    ymax = step * -(-(top + 10) // step)
    slot = (x1 - x0) / n
    body = ""
    v = 0
    while v <= ymax:
        y = y1 - (y1 - y0) * v / ymax
        body += f'<line x1="{x0}" x2="{x1}" y1="{y:.1f}" y2="{y:.1f}" stroke="{theme.grid}"/>' + _t(x0 - 14, y + 7, v, 20, theme.ink2, anchor="end")
        v += step
    ewm, pts = None, []
    for i, m in enumerate(matches):
        h = (y1 - y0) * max(0, m["points"]) / ymax
        x = x0 + slot * i + slot * 0.15
        body += (f'<rect x="{x:.1f}" y="{y1 - h:.1f}" width="{slot * 0.7:.1f}" height="{h:.1f}" fill="{theme.home}"/>'
                 + _t(x + slot * 0.35, y1 + 32, m["label"], 18, theme.ink2, anchor="middle"))
        ewm = m["points"] if ewm is None else 0.6 * ewm + 0.4 * m["points"]
        pts.append(f"{x + slot * 0.35:.1f},{y1 - (y1 - y0) * ewm / ymax:.1f}")
    if pts:
        body += f'<polyline points="{" ".join(pts)}" fill="none" stroke="{theme.away}" stroke-width="5"/>'
        body += _legend(theme, [("Points", theme.home), ("Form (weighted)", theme.away)])
    return _frame(theme, name, f"Fantasy points, last {len(matches)} matches", body, width, height,
                  f"Recent form for {name}")


# ── output ───────────────────────────────────────────────────────────────────

def to_png(svg: str, width: int, height: int) -> bytes:
    """Rasterise with resvg using the bundled Barlow fonts (identical on every server)."""
    import resvg_py
    fonts = [str(p) for p in sorted(FONT_DIR.glob("*.ttf"))]
    return bytes(resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height, font_files=fonts,
                                       sans_serif_family="Barlow"))
