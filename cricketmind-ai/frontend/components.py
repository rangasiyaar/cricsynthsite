"""CricketMind AI — UI Components (CricSynthesis Theme)

Cricket app components: fixture cards, scorecard, squad list, match detail,
plus existing ranking/prediction components.
"""

import streamlit as st

# ── Design Tokens ─────────────────────────────────────────────
C = {
    "bg1": "#0a0a0b", "bg2": "#111113", "bg3": "#18181b",
    "card": "rgba(255,255,255,0.02)", "card_h": "rgba(255,255,255,0.04)",
    "bdr": "rgba(255,255,255,0.06)", "bdr_s": "rgba(255,255,255,0.04)",
    "bdr_a": "rgba(99,102,241,0.3)",
    "t1": "#fafafa", "t2": "#a1a1aa", "t3": "#71717a", "t4": "#52525b",
    "acc": "#6366f1", "acc2": "#818cf8", "glow": "rgba(99,102,241,0.15)",
    "grad": "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    "ok": "#10b981", "warn": "#f59e0b", "err": "#ef4444",
}
F_H = "'Space Grotesk', 'Inter', sans-serif"
F_B = "'Inter', -apple-system, sans-serif"

# Export for other modules
FONT_H = F_H
FONT_B = F_B


# ═══════════════════════════════════════════════════════════
#  HERO
# ═══════════════════════════════════════════════════════════

def render_hero() -> None:
    st.markdown("""
    <div class="cm-hero-wrap">
        <div class="cm-grid-overlay"></div>
        <div class="cm-orb cm-orb-1"></div>
        <div class="cm-orb cm-orb-2"></div>
        <div class="cm-hero-content">
            <div class="cm-badge">
                <span class="cm-badge-dot"></span>
                <span class="cm-badge-text">AI-Powered Cricket Predictions</span>
            </div>
            <h1 class="cm-hero-title">
                CricketMind <span class="cm-gradient-text">AI</span>
            </h1>
            <p class="cm-hero-subtitle">
                Live fixtures, squads, scorecards — and AI-ranked player predictions
                for every match. Powered by CricSynthesis.
            </p>
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_section_header(title: str, subtitle: str = "") -> None:
    sub = f'<p style="font-family:{F_B};font-size:0.9rem;color:{C["t3"]};margin:0.25rem 0 0">{subtitle}</p>' if subtitle else ""
    st.markdown(f"""
    <div style="margin:2.5rem 0 1.5rem">
        <div style="width:32px;height:3px;border-radius:2px;background:{C['grad']};margin-bottom:0.75rem"></div>
        <h2 style="font-family:{F_H};font-size:1.5rem;font-weight:700;color:{C['t1']};letter-spacing:-0.02em;margin:0">{title}</h2>
        {sub}
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════
#  FIXTURE CARDS
# ═══════════════════════════════════════════════════════════

def render_fixture_card(match: dict, card_class: str = "upcoming") -> None:
    """Render a single fixture card."""
    teams = match.get("teams", ["?", "?"])
    status = match.get("status", "")
    date = match.get("date", "")
    venue = match.get("venue", "")
    fmt = match.get("matchType", "")
    league = match.get("league_name", "")
    local_score = match.get("local_score", "")
    visitor_score = match.get("visitor_score", "")
    note = match.get("note", "")

    status_class = "cm-status-live" if "🔴" in status or "Innings" in status else \
                   "cm-status-finished" if "Result" in status else "cm-status-upcoming"
    border_class = "cm-fixture-live" if "live" in card_class else \
                   "cm-fixture-finished" if "finished" in card_class else "cm-fixture-upcoming"

    # Score display
    score_html = ""
    if local_score or visitor_score:
        t2 = teams[1] if len(teams) > 1 else "?"
        score_html = (
            f'<div style="display:flex;justify-content:space-between;margin:0.75rem 0;padding:0.5rem 0;border-top:1px solid {C["bdr_s"]}">'
            f'<span style="font-family:{F_H};font-weight:600;color:{C["t1"]};font-size:0.95rem">{teams[0]}: {local_score}</span>'
            f'<span style="font-family:{F_H};font-weight:600;color:{C["t1"]};font-size:0.95rem">{t2}: {visitor_score}</span>'
            f'</div>'
        )

    note_html = f'<div style="font-family:{F_B};font-size:0.75rem;color:{C["ok"]};margin-top:0.5rem">{note}</div>' if note else ""
    t2 = teams[1] if len(teams) > 1 else "?"

    html = (
        f'<div class="cm-fixture {border_class}">'
        f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">'
        f'<span class="{status_class}">{status}</span>'
        f'<span style="font-family:{F_B};font-size:0.7rem;color:{C["t4"]}">{fmt} · {league}</span>'
        f'</div>'
        f'<div style="font-family:{F_H};font-size:1.1rem;font-weight:700;color:{C["t1"]};letter-spacing:-0.01em">'
        f'{teams[0]} <span style="color:{C["t4"]};font-weight:400">vs</span> {t2}'
        f'</div>'
        f'{score_html}'
        f'<div style="display:flex;gap:1.5rem;margin-top:0.5rem">'
        f'<span style="font-family:{F_B};font-size:0.75rem;color:{C["t3"]}">📅 {date}</span>'
        f'<span style="font-family:{F_B};font-size:0.75rem;color:{C["t3"]}">🏟️ {venue}</span>'
        f'</div>'
        f'{note_html}'
        f'</div>'
    )
    st.html(html)


def render_no_fixtures(message: str) -> None:
    st.markdown(f"""
    <div style="text-align:center;padding:3rem 2rem;background:{C['card']};border:1px solid {C['bdr']};border-radius:16px">
        <div style="font-size:2rem;margin-bottom:0.75rem">🏏</div>
        <div style="font-family:{F_H};font-size:1rem;font-weight:600;color:{C['t2']}">{message}</div>
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════
#  MATCH DETAIL
# ═══════════════════════════════════════════════════════════

def render_match_detail(detail: dict) -> None:
    """Render full match detail: toss, venue, umpires, weather, etc."""
    items = []

    if detail.get("venue"):
        city = f' ({detail["venue_city"]})' if detail.get("venue_city") else ""
        items.append(("🏟️", "Venue", f'{detail["venue"]}{city}'))
    if detail.get("date"):
        items.append(("📅", "Date", detail["date"]))
    if detail.get("matchType"):
        items.append(("🏏", "Format", detail["matchType"]))
    if detail.get("round"):
        items.append(("🔄", "Round", detail["round"]))
    if detail.get("toss"):
        items.append(("🪙", "Toss", detail["toss"]))
    if detail.get("man_of_match"):
        items.append(("⭐", "MoM", detail["man_of_match"]))
    if detail.get("umpire_1"):
        u2 = f' & {detail["umpire_2"]}' if detail.get("umpire_2") else ""
        items.append(("👨‍⚖️", "Umpires", f'{detail["umpire_1"]}{u2}'))
    if detail.get("referee"):
        items.append(("📋", "Referee", detail["referee"]))
    if detail.get("note"):
        items.append(("📝", "Result", detail["note"]))
    if detail.get("super_over"):
        items.append(("⚡", "Super Over", "Yes"))
    if detail.get("follow_on"):
        items.append(("📌", "Follow On", "Yes"))

    if not items:
        return

    cells = ""
    for icon, label, value in items:
        cells += f'''<div style="padding:0.75rem 1rem;background:rgba(255,255,255,0.015);border-radius:10px;border:1px solid {C['bdr_s']}">
            <div style="font-size:0.65rem;color:{C['t3']};font-family:{F_B};margin-bottom:0.2rem">{icon} {label}</div>
            <div style="font-size:0.88rem;color:{C['t1']};font-family:{F_H};font-weight:600">{value}</div>
        </div>'''

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:1.5rem">
        <div style="font-family:{F_B};font-size:0.6rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1rem">📊 Match Info</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem">
            {cells}
        </div>
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════
#  SQUAD LIST
# ═══════════════════════════════════════════════════════════

def render_squad_list(squads: list) -> None:
    """Render team squads side by side."""
    if not squads:
        st.info("No squad data available for this fixture.")
        return

    cols = st.columns(len(squads))
    for i, team_data in enumerate(squads):
        team_name = team_data.get("teamName", "Unknown")
        players = team_data.get("players", [])

        rows = ""
        for j, p in enumerate(players):
            role = p.get("role", "")
            role_colors = {
                "Batsman": "#3b82f6", "Bowler": "#ef4444",
                "All-rounder": "#f59e0b", "WK-Batsman": "#10b981",
            }
            rc = role_colors.get(role, C["t3"])
            bat = p.get("batting_style", "")
            bowl = p.get("bowling_style", "")
            style_text = f' · {bat}' if bat else ""
            if bowl:
                style_text += f' · {bowl}'

            rows += f"""
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;
                {'border-bottom:1px solid ' + C['bdr_s'] + ';' if j < len(players)-1 else ''}">
                <span style="width:22px;text-align:center;font-family:{F_H};font-size:0.75rem;color:{C['t4']};flex-shrink:0">{j+1}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-family:{F_H};font-weight:600;color:{C['t1']};font-size:0.85rem">{p.get('name','?')}</div>
                    <div style="font-family:{F_B};font-size:0.68rem;color:{C['t4']}">{style_text.lstrip(' · ')}</div>
                </div>
                <span style="padding:0.15rem 0.5rem;border-radius:6px;background:rgba({int(rc[1:3],16)},{int(rc[3:5],16)},{int(rc[5:7],16)},0.1);
                    border:1px solid rgba({int(rc[1:3],16)},{int(rc[3:5],16)},{int(rc[5:7],16)},0.2);
                    font-family:{F_B};font-size:0.65rem;color:{rc};flex-shrink:0">{role}</span>
            </div>
            """

        with cols[i]:
            st.markdown(f"""
            <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:1.25rem">
                <div style="font-family:{F_H};font-size:1rem;font-weight:700;color:{C['t1']};margin-bottom:1rem;
                    padding-bottom:0.75rem;border-bottom:2px solid {C['acc']}">{team_name}
                    <span style="font-family:{F_B};font-size:0.75rem;font-weight:400;color:{C['t4']};margin-left:0.5rem">{len(players)} players</span>
                </div>
                {rows}
            </div>
            """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════
#  SCORECARD
# ═══════════════════════════════════════════════════════════

def render_scorecard(scorecard: dict) -> None:
    """Render batting and bowling scorecard tables."""
    batting = scorecard.get("batting", [])
    bowling = scorecard.get("bowling", [])
    runs = scorecard.get("runs", [])
    teams = scorecard.get("teams", ["Team A", "Team B"])

    if not batting and not bowling and not runs:
        st.info("No scorecard data available.")
        return

    # Innings totals
    if runs:
        totals = ""
        for r in runs:
            team = r.get("team", {})
            team_name = team.get("name", f'Team {r.get("team_id", "?")}') if isinstance(team, dict) else f'Team {r.get("team_id", "?")}'
            score = f'{r.get("score", 0)}/{r.get("wickets", 0)}'
            overs = r.get("overs", "")
            inning = r.get("inning", "")
            ov_text = f" ({overs} ov)" if overs else ""
            inn_text = f"Inning {inning}" if inning else ""

            totals += f"""
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;
                background:rgba(99,102,241,0.05);border-radius:8px;margin-bottom:0.5rem">
                <div>
                    <span style="font-family:{F_H};font-weight:700;color:{C['t1']};font-size:1rem">{team_name}</span>
                    <span style="font-family:{F_B};font-size:0.7rem;color:{C['t4']};margin-left:0.5rem">{inn_text}</span>
                </div>
                <span style="font-family:{F_H};font-weight:700;color:{C['acc2']};font-size:1.25rem">{score}{ov_text}</span>
            </div>
            """

        st.markdown(f"""
        <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:1.25rem;margin-bottom:1rem">
            <div style="font-family:{F_B};font-size:0.6rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.75rem">📊 Innings Summary</div>
            {totals}
        </div>
        """, unsafe_allow_html=True)

    # Batting
    if batting:
        th = f"padding:0.6rem 0.5rem;text-align:left;color:{C['t4']};font-family:{F_B};font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em"
        rows = ""
        for b in batting:
            batsman = b.get("batsman", {})
            name = batsman.get("fullname", f'Player {b.get("player_id", "?")}') if isinstance(batsman, dict) else f'Player {b.get("player_id", "?")}'
            bowler = b.get("bowler", {})
            bowler_name = bowler.get("fullname", "") if isinstance(bowler, dict) else ""
            r_val = b.get("score", 0)
            balls = b.get("ball", 0)
            fours = b.get("four_x", 0)
            sixes = b.get("six_x", 0)
            sr = b.get("rate", 0)
            how_out = b.get("scoring_rate", b.get("catch_stump_player_id", ""))

            rows += f"""<tr style="border-bottom:1px solid {C['bdr_s']}">
                <td style="padding:0.5rem;font-family:{F_H};font-weight:600;color:{C['t1']};font-size:0.85rem">{name}</td>
                <td style="padding:0.5rem;font-family:{F_H};font-weight:700;color:{C['acc']};font-size:0.95rem">{r_val}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t2']};font-size:0.8rem">{balls}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t2']};font-size:0.8rem">{fours}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t2']};font-size:0.8rem">{sixes}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t3']};font-size:0.8rem">{sr}</td>
            </tr>"""

        st.markdown(f"""
        <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;overflow:hidden;margin-bottom:1rem">
            <div style="padding:1rem 1.25rem;border-bottom:1px solid {C['bdr']}">
                <span style="font-family:{F_B};font-size:0.6rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em">🏏 Batting</span>
            </div>
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="background:{C['bg2']}">
                        <th style="{th}">Batsman</th><th style="{th}">R</th><th style="{th}">B</th>
                        <th style="{th}">4s</th><th style="{th}">6s</th><th style="{th}">SR</th>
                    </tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        </div>
        """, unsafe_allow_html=True)

    # Bowling
    if bowling:
        th = f"padding:0.6rem 0.5rem;text-align:left;color:{C['t4']};font-family:{F_B};font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em"
        rows = ""
        for bw in bowling:
            bowler = bw.get("bowler", {})
            name = bowler.get("fullname", f'Player {bw.get("player_id", "?")}') if isinstance(bowler, dict) else f'Player {bw.get("player_id", "?")}'
            overs = bw.get("overs", 0)
            maidens = bw.get("medians", 0)
            runs_given = bw.get("runs", 0)
            wickets = bw.get("wickets", 0)
            econ = bw.get("rate", 0)
            wide = bw.get("wide", 0)
            noball = bw.get("noball", 0)

            rows += f"""<tr style="border-bottom:1px solid {C['bdr_s']}">
                <td style="padding:0.5rem;font-family:{F_H};font-weight:600;color:{C['t1']};font-size:0.85rem">{name}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t2']};font-size:0.8rem">{overs}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t2']};font-size:0.8rem">{maidens}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t2']};font-size:0.8rem">{runs_given}</td>
                <td style="padding:0.5rem;font-family:{F_H};font-weight:700;color:{C['err']};font-size:0.95rem">{wickets}</td>
                <td style="padding:0.5rem;font-family:{F_B};color:{C['t3']};font-size:0.8rem">{econ}</td>
            </tr>"""

        st.markdown(f"""
        <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;overflow:hidden;margin-bottom:1rem">
            <div style="padding:1rem 1.25rem;border-bottom:1px solid {C['bdr']}">
                <span style="font-family:{F_B};font-size:0.6rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em">🎯 Bowling</span>
            </div>
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="background:{C['bg2']}">
                        <th style="{th}">Bowler</th><th style="{th}">O</th><th style="{th}">M</th>
                        <th style="{th}">R</th><th style="{th}">W</th><th style="{th}">Econ</th>
                    </tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        </div>
        """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════
#  PREDICTION COMPONENTS (kept from previous)
# ═══════════════════════════════════════════════════════════

def render_player_card(player: dict, card_type: str = "value") -> None:
    configs = {
        "captain": ("CAPTAIN PICK", "👑", "2×", True, "rgba(99,102,241,0.12)", "rgba(99,102,241,0.25)"),
        "vc":      ("VICE-CAPTAIN", "🥈", "1.5×", True, "rgba(139,92,246,0.12)", "rgba(139,92,246,0.25)"),
        "value":   ("VALUE PICK",   "💎", "",      False, "rgba(16,185,129,0.1)", "rgba(16,185,129,0.2)"),
    }
    label, icon, mult, glow, badge_bg, badge_bdr = configs.get(card_type, configs["value"])
    name = player.get("player_name", player.get("player", "Unknown"))
    team = player.get("team", "")
    role = player.get("role", "")
    points = player.get("predicted_fantasy_points", 0)
    confidence = player.get("confidence", "Medium")
    reason = player.get("reason", player.get("key_reason", ""))
    conf_color = {"High": C["ok"], "Medium": C["warn"], "Low": C["err"]}.get(confidence, C["t3"])
    conf_emoji = {"High": "🟢", "Medium": "🟡", "Low": "🔴"}.get(confidence, "⚪")
    glow_css = f"box-shadow:0 0 60px {C['glow']},inset 0 1px 0 rgba(255,255,255,0.05);" if glow else ""
    mult_html = f'<span style="color:{C["t4"]}">·</span><span style="padding:0.15rem 0.5rem;background:rgba(99,102,241,0.1);border-radius:4px;color:{C["acc2"]};font-weight:600">{mult}</span>' if mult else ""
    reason_html = f'<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid {C["bdr_s"]};font-family:{F_B};font-size:0.78rem;color:{C["t3"]};line-height:1.5">{reason}</div>' if reason else ""

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:2rem 1.5rem;text-align:center;{glow_css}backdrop-filter:blur(10px)">
        <div style="display:inline-flex;align-items:center;gap:0.375rem;padding:0.3rem 0.875rem;border-radius:9999px;background:{badge_bg};border:1px solid {badge_bdr};margin-bottom:1.25rem">
            <span style="font-size:0.75rem">{icon}</span>
            <span style="font-family:{F_B};font-size:0.6rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em">{label}</span>
        </div>
        <div style="font-family:{F_H};font-size:1.375rem;font-weight:700;color:{C['t1']};letter-spacing:-0.02em;margin-bottom:0.25rem">{name}</div>
        <div style="font-family:{F_B};font-size:0.8rem;color:{C['t3']};margin-bottom:1.25rem">{team} · {role}</div>
        <div class="cm-gradient-text" style="font-family:{F_H};font-size:2.25rem;font-weight:700;margin-bottom:0.5rem;line-height:1">{points} <span style="font-size:0.9rem">pts</span></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:0.75rem;font-family:{F_B};font-size:0.75rem">
            <span style="color:{conf_color}">{conf_emoji} {confidence}</span>
            {mult_html}
        </div>
        {reason_html}
    </div>
    """, unsafe_allow_html=True)


def render_context_card(prediction: dict) -> None:
    items = [
        ("🏟️", "Venue", prediction.get("venue", "N/A")),
        ("📅", "Date", prediction.get("date", "N/A")),
        ("🏏", "Format", prediction.get("format", "N/A")),
        ("🌤️", "Weather", prediction.get("weather", "N/A")),
    ]
    cells = ""
    for icon, label, value in items:
        cells += f'<div style="padding:1rem 1.25rem;background:rgba(255,255,255,0.015);border-radius:10px;border:1px solid {C["bdr_s"]}"><div style="font-size:0.7rem;color:{C["t3"]};font-family:{F_B};margin-bottom:0.25rem">{icon} {label}</div><div style="font-size:0.95rem;color:{C["t1"]};font-family:{F_H};font-weight:600">{value}</div></div>'

    pitch = prediction.get("pitch_assessment", "")
    pitch_html = f'<div style="grid-column:1/-1;padding:1rem 1.25rem;background:rgba(99,102,241,0.03);border-radius:10px;border:1px solid rgba(99,102,241,0.1)"><div style="font-size:0.7rem;color:{C["acc2"]};font-family:{F_B};margin-bottom:0.375rem;text-transform:uppercase;letter-spacing:0.05em">🏏 Pitch</div><div style="font-size:0.88rem;color:{C["t2"]};font-family:{F_B};line-height:1.6">{pitch}</div></div>' if pitch else ""

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:1.75rem;backdrop-filter:blur(10px)">
        <div style="font-family:{F_B};font-size:0.65rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1.25rem">📊 Match Context</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem">{cells}{pitch_html}</div>
    </div>
    """, unsafe_allow_html=True)


def render_ranking_table(rankings: list) -> None:
    if not rankings:
        st.info("No rankings available.")
        return
    rows = ""
    for p in rankings:
        rank = p.get("rank", 0)
        name = p.get("player_name", "Unknown")
        team = p.get("team", "")
        role = p.get("role", "")
        pts = p.get("predicted_fantasy_points", 0)
        runs = p.get("predicted_runs", "-")
        wkts = p.get("predicted_wickets", "-")
        conf = p.get("confidence", "Medium")
        reason = p.get("key_reason", "")
        ce = {"High": "🟢", "Medium": "🟡", "Low": "🔴"}.get(conf, "⚪")
        r_bg = "rgba(99,102,241,0.08)" if rank == 1 else "rgba(99,102,241,0.05)" if rank == 2 else "rgba(99,102,241,0.03)" if rank == 3 else "transparent"
        if rank <= 3:
            colors = ["", C['grad'], "rgba(139,92,246,0.2)", "rgba(168,85,247,0.15)"]
            text_c = ["", "white", C['acc2'], "#c084fc"]
            r_badge = f'<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:{colors[rank]};color:{text_c[rank]};font-family:{F_H};font-size:0.75rem;font-weight:700">{rank}</span>'
        else:
            r_badge = f'<span style="color:{C["t4"]};font-family:{F_H};font-size:0.8rem">{rank}</span>'

        rows += f'<tr style="background:{r_bg};border-bottom:1px solid {C["bdr_s"]}"><td style="padding:0.875rem 1rem;text-align:center">{r_badge}</td><td style="padding:0.875rem 0.75rem"><div style="font-family:{F_H};font-weight:600;color:{C["t1"]};font-size:0.9rem">{name}</div><div style="font-family:{F_B};color:{C["t4"]};font-size:0.72rem;margin-top:0.125rem">{team}</div></td><td style="padding:0.875rem 0.75rem"><span style="padding:0.2rem 0.6rem;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid {C["bdr_s"]};font-family:{F_B};font-size:0.75rem;color:{C["t2"]}">{role}</span></td><td style="padding:0.875rem 0.75rem;font-family:{F_H};font-weight:700;color:{C["acc"]};font-size:1rem">{pts}</td><td style="padding:0.875rem 0.75rem;font-family:{F_B};color:{C["t2"]};font-size:0.85rem">{runs}</td><td style="padding:0.875rem 0.75rem;font-family:{F_B};color:{C["t2"]};font-size:0.85rem">{wkts}</td><td style="padding:0.875rem 0.5rem;text-align:center">{ce}</td><td style="padding:0.875rem 0.75rem;font-family:{F_B};font-size:0.78rem;color:{C["t3"]};max-width:220px;line-height:1.4">{reason}</td></tr>'

    th = f"padding:0.875rem 0.75rem;text-align:left;color:{C['t4']};font-family:{F_B};font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:600"
    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;overflow:hidden">
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:{C['bg2']};border-bottom:1px solid {C['bdr']}">
                <th style="{th};text-align:center;width:50px">Rank</th><th style="{th}">Player</th><th style="{th}">Role</th><th style="{th}">Points</th><th style="{th}">Runs</th><th style="{th}">Wkts</th><th style="{th};text-align:center">Conf</th><th style="{th}">Insight</th>
            </tr></thead>
            <tbody>{rows}</tbody>
        </table></div>
    </div>
    """, unsafe_allow_html=True)


def render_value_picks_card(picks: list) -> None:
    items = ""
    for i, v in enumerate(picks[:3]):
        name = v.get("player", "Unknown")
        reason = v.get("reason", "")
        border = f"border-bottom:1px solid {C['bdr_s']};" if i < min(len(picks), 3) - 1 else ""
        items += f'<div style="padding:0.875rem 0;{border}"><div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);font-size:0.6rem;color:{C["ok"]}">💎</span><span style="font-family:{F_H};font-weight:600;color:{C["t1"]};font-size:0.9rem">{name}</span></div><div style="font-family:{F_B};font-size:0.75rem;color:{C["t3"]};line-height:1.5;margin-left:1.75rem">{reason}</div></div>'

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:2rem 1.5rem;height:100%">
        <div style="display:inline-flex;align-items:center;gap:0.375rem;padding:0.3rem 0.875rem;border-radius:9999px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);margin-bottom:1.25rem">
            <span style="font-size:0.75rem">💎</span>
            <span style="font-family:{F_B};font-size:0.6rem;font-weight:600;color:{C['ok']};text-transform:uppercase;letter-spacing:0.1em">Value Picks</span>
        </div>
        {items}
    </div>
    """, unsafe_allow_html=True)


def render_risky_picks(picks: list) -> None:
    items = ""
    for r in picks:
        name = r.get("player", "Unknown")
        reason = r.get("reason", "")
        items += f'<div style="display:flex;align-items:flex-start;gap:0.75rem;padding:1rem 1.25rem;background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.1);border-radius:10px;margin-bottom:0.75rem"><span style="font-size:1.1rem;flex-shrink:0">⚠️</span><div><div style="font-family:{F_H};font-weight:600;color:{C["t1"]};font-size:0.9rem">{name}</div><div style="font-family:{F_B};font-size:0.8rem;color:{C["t3"]};margin-top:0.25rem;line-height:1.5">{reason}</div></div></div>'
    st.markdown(f'<div class="cm-card">{items}</div>', unsafe_allow_html=True)


def render_disclaimer() -> None:
    st.markdown(f"""
    <div style="margin-top:3rem;padding:1rem 1.5rem;background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.08);border-radius:12px;text-align:center">
        <p style="color:#f87171 !important;font-family:{F_B};font-size:0.78rem;margin:0;line-height:1.6">
            ⚠️ <strong>Disclaimer:</strong> AI predictions are for entertainment only. Not financial advice.
        </p>
    </div>
    """, unsafe_allow_html=True)


def render_footer() -> None:
    st.markdown(f"""
    <div style="margin-top:2rem;padding:1.5rem 0;border-top:1px solid {C['bdr']};text-align:center">
        <p style="color:{C['t4']} !important;font-family:{F_B};font-size:0.78rem;margin:0;line-height:1.8">
            Powered by Sportmonks Cricket API + Gemini AI<br>
            <a href="https://cricsynthesis.in" target="_blank" style="color:{C['acc2']} !important">CricSynthesis</a> · © 2026
        </p>
    </div>
    """, unsafe_allow_html=True)
