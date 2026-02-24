"""CricketMind AI — Enterprise Dashboard

Main Streamlit application with enterprise-grade UI.
Launch: streamlit run frontend/app.py
"""

import sys
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

# ─── Page config MUST be first ───
st.set_page_config(
    page_title="CricketMind AI | Player Predictions",
    page_icon="🏏",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Load enterprise CSS ───
css_path = Path(__file__).parent / "assets" / "style.css"
if css_path.exists():
    st.markdown(f"<style>{css_path.read_text()}</style>", unsafe_allow_html=True)

from frontend.components import (
    render_hero, render_section_header, render_player_card,
    render_context_card, render_ranking_table, render_value_picks_card,
    render_risky_picks, render_disclaimer, render_footer, C, FONT_H, FONT_B,
)
from utils.config import PREDICTIONS_DIR, GEMINI_API_KEY, ESPN_LEAGUE_IDS

# ═══════════════════════════════════════════════════════════════
#  DEMO DATA — Makes the app look alive without API keys
# ═══════════════════════════════════════════════════════════════

DEMO_PREDICTION = {
    "match": "India vs Australia — 1st T20I",
    "venue": "Melbourne Cricket Ground",
    "date": "Feb 25, 2026",
    "format": "T20I",
    "weather": "Partly Cloudy, 24°C",
    "pitch_assessment": "Good batting surface with even bounce. Pacers may get early assistance due to overcast conditions. Expect 170-185 first innings scores.",
    "captain_pick": {
        "player": "Virat Kohli",
        "reason": "Exceptional record at MCG with 3 fifties in last 5 T20Is. Form rating at 92. Consistent against pace-heavy attacks."
    },
    "vice_captain_pick": {
        "player": "Pat Cummins",
        "reason": "Leads the bowling attack on home soil. Averages 18.3 in T20Is at MCG. Will bowl in powerplay and death overs."
    },
    "rankings": [
        {"rank": 1, "player_name": "Virat Kohli", "team": "India", "role": "Batsman", "predicted_fantasy_points": 92, "predicted_runs": "52-68", "predicted_wickets": "-", "confidence": "High", "key_reason": "Dominant MCG record. 3 fifties in 5 T20Is here."},
        {"rank": 2, "player_name": "Pat Cummins", "team": "Australia", "role": "Bowler", "predicted_fantasy_points": 85, "predicted_runs": "8-15", "predicted_wickets": "2-3", "confidence": "High", "key_reason": "Home conditions. Leads attack in PP and death."},
        {"rank": 3, "player_name": "Suryakumar Yadav", "team": "India", "role": "Batsman", "predicted_fantasy_points": 78, "predicted_runs": "38-55", "predicted_wickets": "-", "confidence": "High", "key_reason": "360° shot-making. SR 165+ in T20Is this year."},
        {"rank": 4, "player_name": "Mitchell Starc", "team": "Australia", "role": "Bowler", "predicted_fantasy_points": 74, "predicted_runs": "5-12", "predicted_wickets": "2-3", "confidence": "Medium", "key_reason": "Left-arm angle suits MCG. PP specialist."},
        {"rank": 5, "player_name": "Jasprit Bumrah", "team": "India", "role": "Bowler", "predicted_fantasy_points": 72, "predicted_runs": "3-8", "predicted_wickets": "2-3", "confidence": "High", "key_reason": "World's best death bowler. Econ 6.2 in death."},
        {"rank": 6, "player_name": "Travis Head", "team": "Australia", "role": "Batsman", "predicted_fantasy_points": 68, "predicted_runs": "32-48", "predicted_wickets": "-", "confidence": "Medium", "key_reason": "Aggressive opener averaging 42 at home this season."},
        {"rank": 7, "player_name": "Hardik Pandya", "team": "India", "role": "All-Rounder", "predicted_fantasy_points": 65, "predicted_runs": "25-38", "predicted_wickets": "1-2", "confidence": "Medium", "key_reason": "Dual threat. Bats 5-6 and bowls 3-4 overs."},
        {"rank": 8, "player_name": "Glenn Maxwell", "team": "Australia", "role": "All-Rounder", "predicted_fantasy_points": 62, "predicted_runs": "22-40", "predicted_wickets": "0-1", "confidence": "Medium", "key_reason": "MCG is his home ground. Can change games in 15 balls."},
        {"rank": 9, "player_name": "Rohit Sharma", "team": "India", "role": "Batsman", "predicted_fantasy_points": 58, "predicted_runs": "28-42", "predicted_wickets": "-", "confidence": "Medium", "key_reason": "Senior opener. Slower start but can accelerate."},
        {"rank": 10, "player_name": "Adam Zampa", "team": "Australia", "role": "Bowler", "predicted_fantasy_points": 55, "predicted_runs": "2-6", "predicted_wickets": "1-2", "confidence": "Medium", "key_reason": "Lead spinner. Middle overs economy of 6.8."},
        {"rank": 11, "player_name": "Ravindra Jadeja", "team": "India", "role": "All-Rounder", "predicted_fantasy_points": 52, "predicted_runs": "15-25", "predicted_wickets": "1-2", "confidence": "Medium", "key_reason": "Batting depth + tight spin. Fielding bonus likely."},
    ],
    "top_value_picks": [
        {"player": "Hardik Pandya", "reason": "All-rounder double points pool — bats, bowls, and fields at a premium position."},
        {"player": "Adam Zampa", "reason": "Under-owned spinner. Indian batsmen sometimes struggle against quality leg-spin."},
        {"player": "Travis Head", "reason": "Low ownership despite strong home record. Value at his price point."},
    ],
    "risky_picks": [
        {"player": "Glenn Maxwell", "reason": "Inconsistent — scored 3 ducks in last 8 innings. High ceiling but low floor."},
        {"player": "Rohit Sharma", "reason": "Form concerns — 3 single-digit scores in recent matches. May bat slowly on this pitch."},
    ],
}


def load_cached_predictions() -> dict:
    """Load all cached prediction JSON files."""
    predictions = {}
    if PREDICTIONS_DIR.exists():
        for f in PREDICTIONS_DIR.glob("*.json"):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    match_key = data.get("match", f.stem)
                    predictions[match_key] = data
            except Exception:
                continue
    return predictions


# ═════════════════════════════════════════════════════════════
#  SIDEBAR
# ═════════════════════════════════════════════════════════════

def render_sidebar() -> None:
    """Enterprise sidebar with branding and status."""
    with st.sidebar:
        # Logo
        st.markdown(f"""
        <div style="text-align:center; padding:0.5rem 0 1.5rem; border-bottom:1px solid {C['bdr']}; margin-bottom:1.5rem;">
            <div style="font-family:{FONT_H}; font-size:1.35rem; font-weight:700; color:{C['t1']}; letter-spacing:-0.03em;">
                🏏 CricketMind
            </div>
            <div style="font-family:{FONT_B}; font-size:0.7rem; color:{C['t4']}; margin-top:0.25rem; letter-spacing:0.05em; text-transform:uppercase;">
                by CricSynthesis
            </div>
        </div>
        """, unsafe_allow_html=True)

        # System Status
        gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")

        st.markdown(f"""
        <div style="
            font-family:{FONT_B}; font-size:0.6rem; font-weight:600;
            color:{C['acc2']}; text-transform:uppercase; letter-spacing:0.1em;
            margin-bottom:0.75rem;
        ">System Status</div>

        <div style="
            background:{C['card']}; border:1px solid {C['bdr']};
            border-radius:10px; padding:0.875rem 1rem;
            margin-bottom:1.5rem;
        ">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                <span style="width:7px; height:7px; border-radius:50%; background:{'#10b981' if gemini_ok else '#ef4444'}; display:inline-block;"></span>
                <span style="font-family:{FONT_B}; font-size:0.8rem; color:{C['t2']};">Gemini LLM</span>
                <span style="margin-left:auto; font-family:{FONT_B}; font-size:0.7rem; color:{C['t4']};">{'Active' if gemini_ok else 'No Key'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                <span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block;"></span>
                <span style="font-family:{FONT_B}; font-size:0.8rem; color:{C['t2']};">ESPN Data</span>
                <span style="margin-left:auto; font-family:{FONT_B}; font-size:0.7rem; color:{C['t4']};">Active</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block;"></span>
                <span style="font-family:{FONT_B}; font-size:0.8rem; color:{C['t2']};">Scoring Engine</span>
                <span style="margin-left:auto; font-family:{FONT_B}; font-size:0.7rem; color:{C['t4']};">Active</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Pipeline Steps
        st.markdown(f"""
        <div style="
            font-family:{FONT_B}; font-size:0.6rem; font-weight:600;
            color:{C['acc2']}; text-transform:uppercase; letter-spacing:0.1em;
            margin-bottom:0.75rem;
        ">AI Pipeline</div>
        """, unsafe_allow_html=True)

        steps = [
            ("01", "Collect", "3-source data fusion", "#6366f1"),
            ("02", "Analyze", "Pitch, weather & toss", "#7c3aed"),
            ("03", "Predict", "Fantasy points per player", "#8b5cf6"),
            ("04", "Rank", "Final #1-#22 rankings", "#a855f7"),
        ]

        for num, title, desc, color in steps:
            st.markdown(f"""
            <div style="
                display:flex; align-items:flex-start; gap:0.75rem;
                padding:0.625rem 0; border-bottom:1px solid {C['bdr_s']};
            ">
                <span style="
                    display:inline-flex; align-items:center; justify-content:center;
                    min-width:24px; height:24px; border-radius:6px;
                    background:rgba({int(color[1:3],16)},{int(color[3:5],16)},{int(color[5:7],16)},0.15);
                    font-family:{FONT_H}; font-size:0.65rem; font-weight:700; color:{color};
                ">{num}</span>
                <div>
                    <div style="font-family:{FONT_H}; font-weight:600; color:{C['t1']}; font-size:0.85rem;">{title}</div>
                    <div style="font-family:{FONT_B}; color:{C['t4']}; font-size:0.72rem; margin-top:0.1rem;">{desc}</div>
                </div>
            </div>
            """, unsafe_allow_html=True)

        # Tech Stack
        st.markdown(f"""
        <div style="
            margin-top:1.5rem;
            font-family:{FONT_B}; font-size:0.6rem; font-weight:600;
            color:{C['acc2']}; text-transform:uppercase; letter-spacing:0.1em;
            margin-bottom:0.75rem;
        ">Tech Stack</div>

        <div style="display:flex; flex-wrap:wrap; gap:0.375rem; margin-bottom:1.5rem;">
            <span style="padding:0.2rem 0.6rem; border-radius:6px; background:{C['card']}; border:1px solid {C['bdr_s']}; font-family:{FONT_B}; font-size:0.7rem; color:{C['t3']};">CrewAI</span>
            <span style="padding:0.2rem 0.6rem; border-radius:6px; background:{C['card']}; border:1px solid {C['bdr_s']}; font-family:{FONT_B}; font-size:0.7rem; color:{C['t3']};">Gemini 2.5</span>
            <span style="padding:0.2rem 0.6rem; border-radius:6px; background:{C['card']}; border:1px solid {C['bdr_s']}; font-family:{FONT_B}; font-size:0.7rem; color:{C['t3']};">Groq</span>
            <span style="padding:0.2rem 0.6rem; border-radius:6px; background:{C['card']}; border:1px solid {C['bdr_s']}; font-family:{FONT_B}; font-size:0.7rem; color:{C['t3']};">Pydantic</span>
            <span style="padding:0.2rem 0.6rem; border-radius:6px; background:{C['card']}; border:1px solid {C['bdr_s']}; font-family:{FONT_B}; font-size:0.7rem; color:{C['t3']};">Pandas</span>
        </div>
        """, unsafe_allow_html=True)

        # CTA
        st.markdown(f"""
        <a href="https://cricsynthesis.in" target="_blank" style="
            display:block; text-align:center;
            padding:0.7rem 1.25rem;
            background: {C['grad']}; border-radius:8px;
            color:{C['t1']} !important; font-family:{FONT_B};
            font-weight:600; font-size:0.8rem;
            text-decoration:none !important;
            box-shadow:0 4px 15px rgba(99,102,241,0.2);
            transition:all 250ms ease;
        ">Visit CricSynthesis.in →</a>
        """, unsafe_allow_html=True)


# ═════════════════════════════════════════════════════════════
#  RENDER PREDICTION
# ═════════════════════════════════════════════════════════════

def render_prediction(prediction: dict, is_demo: bool = False) -> None:
    """Render a complete prediction result."""

    if is_demo:
        st.markdown(f"""
        <div style="
            padding:0.5rem 1rem; border-radius:8px;
            background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.15);
            margin-bottom:1.5rem; text-align:center;
        ">
            <span style="font-family:{FONT_B}; font-size:0.8rem; color:{C['acc2']};">
                ✨ Demo Preview — Add API keys and run a live prediction for real data
            </span>
        </div>
        """, unsafe_allow_html=True)

    # Context
    render_context_card(prediction)

    # Captain / VC / Value Picks
    render_section_header("Top Picks", "AI-recommended selections for maximum fantasy impact")

    col1, col2, col3 = st.columns(3)

    captain = prediction.get("captain_pick", {})
    vc = prediction.get("vice_captain_pick", {})
    values = prediction.get("top_value_picks", [])
    rankings = prediction.get("rankings", [])

    # Find full player data from rankings
    captain_data = _find_player(rankings, captain.get("player", ""))
    vc_data = _find_player(rankings, vc.get("player", ""))

    if captain_data:
        captain_data["reason"] = captain.get("reason", "")
    else:
        captain_data = captain

    if vc_data:
        vc_data["reason"] = vc.get("reason", "")
    else:
        vc_data = vc

    with col1:
        render_player_card(captain_data, card_type="captain")
    with col2:
        render_player_card(vc_data, card_type="vc")
    with col3:
        render_value_picks_card(values)

    # Full Rankings
    render_section_header("Complete Rankings", f"All {len(rankings)} players ranked by predicted fantasy points")
    render_ranking_table(rankings)

    # Risky Picks
    risky = prediction.get("risky_picks", [])
    if risky:
        render_section_header("Risky Picks", "High variance players — proceed with caution")
        render_risky_picks(risky)

    # Raw JSON
    with st.expander("📄 View Raw Prediction JSON"):
        st.json(prediction)


def _find_player(rankings: list, name: str) -> dict:
    """Find a player in rankings by name."""
    for p in rankings:
        if p.get("player_name", "").lower() == name.lower():
            return dict(p)
    return {}


# ═════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════

def main():
    """Main app entry point."""

    # Hero
    render_hero()

    # Sidebar
    render_sidebar()

    # Tabs
    cached = load_cached_predictions()
    tab_live, tab_cached, tab_demo = st.tabs([
        "🔮 Live Prediction",
        f"📁 History ({len(cached)})",
        "✨ Demo Preview",
    ])

    # ─── Live Prediction Tab ───
    with tab_live:
        gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")

        if not gemini_ok:
            st.markdown(f"""
            <div style="
                text-align:center; padding:3rem 2rem;
                background:{C['card']}; border:1px solid {C['bdr']};
                border-radius:16px; margin:1rem 0;
            ">
                <div style="font-size:2.5rem; margin-bottom:1rem;">🔑</div>
                <div style="font-family:{FONT_H}; font-size:1.25rem; font-weight:700; color:{C['t1']}; margin-bottom:0.5rem;">
                    Gemini API Key Required
                </div>
                <div style="font-family:{FONT_B}; font-size:0.9rem; color:{C['t3']}; max-width:450px; margin:0 auto 1.5rem; line-height:1.7;">
                    Add your free Gemini API key to enable live match predictions.
                    Match data is powered by ESPN (no key needed).
                    Check the <strong style="color:{C['t2']} !important;">✨ Demo Preview</strong> tab to see the app in action.
                </div>

                <div style="display:inline-flex; flex-direction:column; gap:0.75rem; text-align:left;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <span style="width:7px; height:7px; border-radius:50%; background:#ef4444; display:inline-block;"></span>
                        <span style="font-family:{FONT_B}; font-size:0.85rem; color:{C['t2']};">Gemini API Key</span>
                        <a href="https://aistudio.google.com/" target="_blank" style="font-size:0.75rem; color:{C['acc2']} !important; margin-left:auto;">Get Free →</a>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block;"></span>
                        <span style="font-family:{FONT_B}; font-size:0.85rem; color:{C['t2']};">ESPN Data</span>
                        <span style="font-size:0.75rem; color:{C['t4']}; margin-left:auto;">Active ✓</span>
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)
        else:
            # Fetch matches from ESPN
            render_section_header("Select Match", "Choose a match for AI prediction")

            if st.button("🔄 Refresh Matches (All Leagues)", use_container_width=True):
                with st.spinner("Fetching from ESPN across all leagues..."):
                    try:
                        from data.espn_client import ESPNClient
                        client = ESPNClient()
                        matches = client.get_all_matches()
                        st.session_state["matches"] = matches
                    except Exception as e:
                        st.error(f"Failed to fetch matches: {e}")

            matches = st.session_state.get("matches", [])

            if matches:
                match_options = {
                    f"[{m.get('league', '?')}] {m.get('name', 'Unknown')} — {m.get('matchType', '?')} — {m.get('status', '')} — {m.get('date', '')}": m
                    for m in matches
                }

                selected_label = st.selectbox(
                    "🏏 Available Matches",
                    options=list(match_options.keys()),
                )

                selected_match = match_options[selected_label]

                col1, col2, col3, col4 = st.columns(4)
                with col1:
                    st.metric("League", selected_match.get("league", "N/A"))
                with col2:
                    st.metric("Format", selected_match.get("matchType", "N/A"))
                with col3:
                    st.metric("Venue", selected_match.get("venue", "N/A")[:25])
                with col4:
                    st.metric("Status", selected_match.get("status", "N/A"))

                if st.button("🔮 Predict & Rank Players", type="primary", use_container_width=True):
                    match_id = selected_match.get("id", "")
                    league_id = selected_match.get("league_id", "8039")
                    with st.spinner("🧠 Running 4-agent AI pipeline... This may take 1-2 minutes."):
                        try:
                            from orchestrator.pipeline import run_prediction
                            fmt = {"t20": "t20", "t20i": "t20", "odi": "odi", "test": "test"}.get(
                                selected_match.get("matchType", "t20").lower(), "t20"
                            )
                            result = run_prediction(match_id, format_type=fmt, league_id=league_id)
                            if result:
                                st.session_state["current_prediction"] = result
                                st.success("✅ Prediction complete!")
                            else:
                                st.error("❌ Prediction failed. Check logs.")
                            else:
                                st.error("❌ Prediction failed. Check logs.")
                        except Exception as e:
                            st.error(f"Pipeline error: {e}")
            else:
                st.info("Select a league and click **Refresh Upcoming Matches** to load live cricket data from ESPN.")

        prediction = st.session_state.get("current_prediction")
        if prediction:
            render_prediction(prediction)

    # ─── Cached Predictions Tab ───
    with tab_cached:
        if cached:
            render_section_header("Prediction History", f"{len(cached)} predictions available")
            selected_cache = st.selectbox("Select a prediction", options=list(cached.keys()))
            if selected_cache:
                render_prediction(cached[selected_cache])
        else:
            st.markdown(f"""
            <div style="
                text-align:center; padding:3rem 2rem;
                background:{C['card']}; border:1px solid {C['bdr']};
                border-radius:16px;
            ">
                <div style="font-size:2rem; margin-bottom:0.75rem;">📭</div>
                <div style="font-family:{FONT_H}; font-size:1rem; font-weight:600; color:{C['t2']};">No cached predictions yet</div>
                <div style="font-family:{FONT_B}; font-size:0.85rem; color:{C['t4']}; margin-top:0.25rem;">Run a live prediction or check the Demo tab.</div>
            </div>
            """, unsafe_allow_html=True)

    # ─── Demo Tab ───
    with tab_demo:
        render_prediction(DEMO_PREDICTION, is_demo=True)

    # Footer
    render_disclaimer()
    render_footer()


if __name__ == "__main__":
    main()
