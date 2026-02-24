"""CricketMind AI — Enterprise UI Components

Uses CSS classes defined in style.css for hero/animations.
NO HTML COMMENTS — Streamlit strips them and breaks rendering.
"""

import streamlit as st

# Design tokens
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
FONT_H = "'Space Grotesk', 'Inter', sans-serif"
FONT_B = "'Inter', -apple-system, sans-serif"


def render_hero() -> None:
    """Hero with gradient orbs using CSS classes from style.css."""
    st.markdown("""
    <div class="cm-hero-wrap">
        <div class="cm-grid-overlay"></div>
        <div class="cm-orb cm-orb-1"></div>
        <div class="cm-orb cm-orb-2"></div>
        <div class="cm-hero-content">
            <div class="cm-badge">
                <span class="cm-badge-dot"></span>
                <span class="cm-badge-text">AI-Powered Predictions</span>
            </div>
            <h1 class="cm-hero-title">
                CricketMind <span class="cm-gradient-text">AI</span>
            </h1>
            <p class="cm-hero-subtitle">
                Predict &amp; rank all 22 players before any cricket match.
                Captain picks. Fantasy points. Data-driven insights.
            </p>
            <div class="cm-metrics-bar">
                <div style="text-align:center">
                    <div class="cm-metric-value">4</div>
                    <div class="cm-metric-label">AI Agents</div>
                </div>
                <div class="cm-metric-divider"></div>
                <div style="text-align:center">
                    <div class="cm-metric-value">3</div>
                    <div class="cm-metric-label">Data Sources</div>
                </div>
                <div class="cm-metric-divider"></div>
                <div style="text-align:center">
                    <div class="cm-metric-value">22</div>
                    <div class="cm-metric-label">Players Ranked</div>
                </div>
                <div class="cm-metric-divider"></div>
                <div style="text-align:center">
                    <div class="cm-metric-value">$0</div>
                    <div class="cm-metric-label">Total Cost</div>
                </div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_section_header(title: str, subtitle: str = "") -> None:
    """Section header with accent line."""
    sub = f'<p style="font-family:{FONT_B};font-size:0.9rem;color:{C["t3"]};margin:0.25rem 0 0">{subtitle}</p>' if subtitle else ""
    st.markdown(f"""
    <div style="margin:2.5rem 0 1.5rem">
        <div style="width:32px;height:3px;border-radius:2px;background:{C['grad']};margin-bottom:0.75rem"></div>
        <h2 style="font-family:{FONT_H};font-size:1.5rem;font-weight:700;color:{C['t1']};letter-spacing:-0.02em;margin:0">{title}</h2>
        {sub}
    </div>
    """, unsafe_allow_html=True)


def render_player_card(player: dict, card_type: str = "value") -> None:
    """Glassmorphism player card. card_type: captain, vc, or value."""
    configs = {
        "captain": ("CAPTAIN PICK", "👑", "2×", True, "rgba(99,102,241,0.12)", "rgba(99,102,241,0.25)"),
        "vc":      ("VICE-CAPTAIN", "🥈", "1.5×", True, "rgba(139,92,246,0.12)", "rgba(139,92,246,0.25)"),
        "value":   ("VALUE PICK",   "💎", "",      False, "rgba(16,185,129,0.1)", "rgba(16,185,129,0.2)"),
    }
    label, icon, mult, glow, badge_bg, badge_bdr = configs.get(card_type, configs["value"])

    name = player.get("player_name", player.get("player", "Unknown"))
    team = player.get("team", "")
    role = player.get("role", "")
    points = player.get("predicted_fantasy_points", player.get("total_predicted_fantasy_points", 0))
    confidence = player.get("confidence", "Medium")
    reason = player.get("reason", player.get("key_reason", ""))

    conf_color = {"High": C["ok"], "Medium": C["warn"], "Low": C["err"]}.get(confidence, C["t3"])
    conf_emoji = {"High": "🟢", "Medium": "🟡", "Low": "🔴"}.get(confidence, "⚪")
    glow_css = f"box-shadow:0 0 60px {C['glow']},inset 0 1px 0 rgba(255,255,255,0.05);" if glow else ""
    mult_html = f'<span style="color:{C["t4"]}">·</span><span style="padding:0.15rem 0.5rem;background:rgba(99,102,241,0.1);border-radius:4px;color:{C["acc2"]};font-weight:600">{mult}</span>' if mult else ""
    reason_html = f'<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid {C["bdr_s"]};font-family:{FONT_B};font-size:0.78rem;color:{C["t3"]};line-height:1.5">{reason}</div>' if reason else ""

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:2rem 1.5rem;text-align:center;{glow_css}backdrop-filter:blur(10px)">
        <div style="display:inline-flex;align-items:center;gap:0.375rem;padding:0.3rem 0.875rem;border-radius:9999px;background:{badge_bg};border:1px solid {badge_bdr};margin-bottom:1.25rem">
            <span style="font-size:0.75rem">{icon}</span>
            <span style="font-family:{FONT_B};font-size:0.6rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em">{label}</span>
        </div>
        <div style="font-family:{FONT_H};font-size:1.375rem;font-weight:700;color:{C['t1']};letter-spacing:-0.02em;margin-bottom:0.25rem">{name}</div>
        <div style="font-family:{FONT_B};font-size:0.8rem;color:{C['t3']};margin-bottom:1.25rem">{team} · {role}</div>
        <div class="cm-gradient-text" style="font-family:{FONT_H};font-size:2.25rem;font-weight:700;margin-bottom:0.5rem;line-height:1">{points} <span style="font-size:0.9rem">pts</span></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:0.75rem;font-family:{FONT_B};font-size:0.75rem">
            <span style="color:{conf_color}">{conf_emoji} {confidence}</span>
            {mult_html}
        </div>
        {reason_html}
    </div>
    """, unsafe_allow_html=True)


def render_context_card(prediction: dict) -> None:
    """Match context card."""
    items = [
        ("🏟️", "Venue", prediction.get("venue", "N/A")),
        ("📅", "Date", prediction.get("date", "N/A")),
        ("🏏", "Format", prediction.get("format", "N/A")),
        ("🌤️", "Weather", prediction.get("weather", "N/A")),
    ]
    cells = ""
    for icon, label, value in items:
        cells += f'<div style="padding:1rem 1.25rem;background:rgba(255,255,255,0.015);border-radius:10px;border:1px solid {C["bdr_s"]}"><div style="font-size:0.7rem;color:{C["t3"]};font-family:{FONT_B};margin-bottom:0.25rem">{icon} {label}</div><div style="font-size:0.95rem;color:{C["t1"]};font-family:{FONT_H};font-weight:600">{value}</div></div>'

    pitch = prediction.get("pitch_assessment", "")
    pitch_html = ""
    if pitch:
        pitch_html = f'<div style="grid-column:1/-1;padding:1rem 1.25rem;background:rgba(99,102,241,0.03);border-radius:10px;border:1px solid rgba(99,102,241,0.1)"><div style="font-size:0.7rem;color:{C["acc2"]};font-family:{FONT_B};margin-bottom:0.375rem;text-transform:uppercase;letter-spacing:0.05em">🏏 Pitch Assessment</div><div style="font-size:0.88rem;color:{C["t2"]};font-family:{FONT_B};line-height:1.6">{pitch}</div></div>'

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:1.75rem;backdrop-filter:blur(10px)">
        <div style="font-family:{FONT_B};font-size:0.65rem;font-weight:600;color:{C['acc2']};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1.25rem">📊 Match Context</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem">
            {cells}
            {pitch_html}
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_ranking_table(rankings: list) -> None:
    """Premium ranking table."""
    if not rankings:
        st.info("No rankings available.")
        return

    rows = ""
    for p in rankings:
        rank = p.get("rank", 0)
        name = p.get("player_name", "Unknown")
        team = p.get("team", "")
        role = p.get("role", "")
        pts = p.get("predicted_fantasy_points", p.get("total_predicted_fantasy_points", 0))
        runs = p.get("predicted_runs", "-")
        wkts = p.get("predicted_wickets", "-")
        conf = p.get("confidence", "Medium")
        reason = p.get("key_reason", "")
        ce = {"High": "🟢", "Medium": "🟡", "Low": "🔴"}.get(conf, "⚪")

        if rank == 1:
            r_bg = "rgba(99,102,241,0.08)"
            r_badge = f'<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:{C["grad"]};color:white;font-family:{FONT_H};font-size:0.75rem;font-weight:700">1</span>'
        elif rank == 2:
            r_bg = "rgba(99,102,241,0.05)"
            r_badge = f'<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:rgba(139,92,246,0.2);color:{C["acc2"]};font-family:{FONT_H};font-size:0.75rem;font-weight:700">2</span>'
        elif rank == 3:
            r_bg = "rgba(99,102,241,0.03)"
            r_badge = f'<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:rgba(168,85,247,0.15);color:#c084fc;font-family:{FONT_H};font-size:0.75rem;font-weight:700">3</span>'
        else:
            r_bg = "transparent"
            r_badge = f'<span style="color:{C["t4"]};font-family:{FONT_H};font-size:0.8rem">{rank}</span>'

        rows += f'<tr style="background:{r_bg};border-bottom:1px solid {C["bdr_s"]}"><td style="padding:0.875rem 1rem;text-align:center">{r_badge}</td><td style="padding:0.875rem 0.75rem"><div style="font-family:{FONT_H};font-weight:600;color:{C["t1"]};font-size:0.9rem">{name}</div><div style="font-family:{FONT_B};color:{C["t4"]};font-size:0.72rem;margin-top:0.125rem">{team}</div></td><td style="padding:0.875rem 0.75rem"><span style="padding:0.2rem 0.6rem;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid {C["bdr_s"]};font-family:{FONT_B};font-size:0.75rem;color:{C["t2"]}">{role}</span></td><td style="padding:0.875rem 0.75rem;font-family:{FONT_H};font-weight:700;color:{C["acc"]};font-size:1rem">{pts}</td><td style="padding:0.875rem 0.75rem;font-family:{FONT_B};color:{C["t2"]};font-size:0.85rem">{runs}</td><td style="padding:0.875rem 0.75rem;font-family:{FONT_B};color:{C["t2"]};font-size:0.85rem">{wkts}</td><td style="padding:0.875rem 0.5rem;text-align:center">{ce}</td><td style="padding:0.875rem 0.75rem;font-family:{FONT_B};font-size:0.78rem;color:{C["t3"]};max-width:220px;line-height:1.4">{reason}</td></tr>'

    th = f"padding:0.875rem 0.75rem;text-align:left;color:{C['t4']};font-family:{FONT_B};font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:600"

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;overflow:hidden;backdrop-filter:blur(10px)">
        <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr style="background:{C['bg2']};border-bottom:1px solid {C['bdr']}">
                        <th style="{th};text-align:center;width:50px">Rank</th>
                        <th style="{th}">Player</th>
                        <th style="{th}">Role</th>
                        <th style="{th}">Points</th>
                        <th style="{th}">Runs</th>
                        <th style="{th}">Wkts</th>
                        <th style="{th};text-align:center">Conf</th>
                        <th style="{th}">Insight</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_value_picks_card(picks: list) -> None:
    """Value picks list card."""
    items = ""
    for i, v in enumerate(picks[:3]):
        name = v.get("player", "Unknown")
        reason = v.get("reason", "")
        border = f"border-bottom:1px solid {C['bdr_s']};" if i < min(len(picks), 3) - 1 else ""
        items += f'<div style="padding:0.875rem 0;{border}"><div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);font-size:0.6rem;color:{C["ok"]}">💎</span><span style="font-family:{FONT_H};font-weight:600;color:{C["t1"]};font-size:0.9rem">{name}</span></div><div style="font-family:{FONT_B};font-size:0.75rem;color:{C["t3"]};line-height:1.5;margin-left:1.75rem">{reason}</div></div>'

    st.markdown(f"""
    <div class="cm-card" style="background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;padding:2rem 1.5rem;backdrop-filter:blur(10px);height:100%">
        <div style="display:inline-flex;align-items:center;gap:0.375rem;padding:0.3rem 0.875rem;border-radius:9999px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);margin-bottom:1.25rem">
            <span style="font-size:0.75rem">💎</span>
            <span style="font-family:{FONT_B};font-size:0.6rem;font-weight:600;color:{C['ok']};text-transform:uppercase;letter-spacing:0.1em">Value Picks</span>
        </div>
        {items}
    </div>
    """, unsafe_allow_html=True)


def render_risky_picks(picks: list) -> None:
    """Risky picks section."""
    items = ""
    for r in picks:
        name = r.get("player", "Unknown")
        reason = r.get("reason", "")
        items += f'<div style="display:flex;align-items:flex-start;gap:0.75rem;padding:1rem 1.25rem;background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.1);border-radius:10px;margin-bottom:0.75rem"><span style="font-size:1.1rem;flex-shrink:0">⚠️</span><div><div style="font-family:{FONT_H};font-weight:600;color:{C["t1"]};font-size:0.9rem">{name}</div><div style="font-family:{FONT_B};font-size:0.8rem;color:{C["t3"]};margin-top:0.25rem;line-height:1.5">{reason}</div></div></div>'

    st.markdown(f'<div class="cm-card">{items}</div>', unsafe_allow_html=True)


def render_disclaimer() -> None:
    """Disclaimer."""
    st.markdown(f"""
    <div style="margin-top:3rem;padding:1rem 1.5rem;background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.08);border-radius:12px;text-align:center">
        <p style="color:#f87171 !important;font-family:{FONT_B};font-size:0.78rem;margin:0;line-height:1.6">
            ⚠️ <strong>Disclaimer:</strong> AI predictions are for entertainment and informational purposes only. Not financial or betting advice.
        </p>
    </div>
    """, unsafe_allow_html=True)


def render_footer() -> None:
    """Footer."""
    st.markdown(f"""
    <div style="margin-top:2rem;padding:1.5rem 0;border-top:1px solid {C['bdr']};text-align:center">
        <p style="color:{C['t4']} !important;font-family:{FONT_B};font-size:0.78rem;margin:0;line-height:1.8">
            Powered by CrewAI + Gemini · Three-Source Data Fusion<br>
            <a href="https://cricsynthesis.in" target="_blank" style="color:{C['acc2']} !important">CricSynthesis</a> · © 2026 All rights reserved.
        </p>
    </div>
    """, unsafe_allow_html=True)
