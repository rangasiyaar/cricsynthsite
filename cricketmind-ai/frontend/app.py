"""CricketMind AI — Cricket App

Main app: Upcoming/Live/Recent fixture tabs with full detail,
plus AI player ranking predictions. No sidebar.

Launch: streamlit run frontend/app.py
"""

import sys
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

st.set_page_config(
    page_title="CricketMind AI | by CricSynthesis",
    page_icon="🏏",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Load CSS
css_path = Path(__file__).parent / "assets" / "style.css"
if css_path.exists():
    st.markdown(f"<style>{css_path.read_text()}</style>", unsafe_allow_html=True)

from frontend.components import (
    render_hero, render_section_header, render_fixture_card,
    render_no_fixtures, render_match_detail, render_squad_list,
    render_scorecard, render_player_card, render_context_card,
    render_ranking_table, render_value_picks_card, render_risky_picks,
    render_disclaimer, render_footer, C, FONT_H, FONT_B,
)
from utils.config import PREDICTIONS_DIR, GEMINI_API_KEY, SPORTMONKS_API_KEY


# ═══════════════════════════════════════════════════════════
#  DEMO DATA
# ═══════════════════════════════════════════════════════════

DEMO_PREDICTION = {
    "match": "New Zealand vs South Africa — 1st T20I",
    "venue": "Bay Oval",
    "date": "Mar 15, 2026",
    "format": "T20I",
    "weather": "Partly Cloudy, 22°C",
    "pitch_assessment": "Good batting surface with even bounce. Pace-friendly early on.",
    "captain_pick": {"player": "Kane Williamson", "reason": "Home advantage at Bay Oval. Consistent T20I average of 42."},
    "vice_captain_pick": {"player": "Quinton de Kock", "reason": "Explosive opener. 4 fifties in last 8 T20I innings."},
    "rankings": [
        {"rank": 1, "player_name": "Kane Williamson", "team": "NZ", "role": "Batsman", "predicted_fantasy_points": 88, "predicted_runs": "48-65", "predicted_wickets": "-", "confidence": "High", "key_reason": "Home ground. Anchors the innings."},
        {"rank": 2, "player_name": "Quinton de Kock", "team": "SA", "role": "WK-Bat", "predicted_fantasy_points": 82, "predicted_runs": "40-58", "predicted_wickets": "-", "confidence": "High", "key_reason": "Aggressive opener. WK bonus points."},
        {"rank": 3, "player_name": "Lockie Ferguson", "team": "NZ", "role": "Bowler", "predicted_fantasy_points": 78, "predicted_runs": "5-10", "predicted_wickets": "2-3", "confidence": "High", "key_reason": "Express pace. Death overs specialist."},
        {"rank": 4, "player_name": "Lungi Ngidi", "team": "SA", "role": "Bowler", "predicted_fantasy_points": 72, "predicted_runs": "3-8", "predicted_wickets": "2-3", "confidence": "Medium", "key_reason": "Tall pacer. NZ conditions suit seam."},
        {"rank": 5, "player_name": "David Miller", "team": "SA", "role": "Batsman", "predicted_fantasy_points": 68, "predicted_runs": "30-48", "predicted_wickets": "-", "confidence": "Medium", "key_reason": "Finisher. SR 150+ in death overs."},
    ],
    "top_value_picks": [
        {"player": "Lockie Ferguson", "reason": "Express pace suits NZ conditions. Under-owned."},
        {"player": "David Miller", "reason": "Finisher role. High ceiling in 15-20 overs."},
    ],
    "risky_picks": [
        {"player": "Tim Southee", "reason": "Experienced but losing pace. Could go for runs."},
    ],
}


def load_cached_predictions() -> dict:
    predictions = {}
    if PREDICTIONS_DIR.exists():
        for f in PREDICTIONS_DIR.glob("*.json"):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    predictions[data.get("match", f.stem)] = data
            except Exception:
                continue
    return predictions


# ═══════════════════════════════════════════════════════════
#  FIXTURE DETAIL PANEL
# ═══════════════════════════════════════════════════════════

def show_fixture_detail(match: dict, tab_type: str) -> None:
    """Show full detail for a selected fixture."""
    from data.sportmonks_client import SportmonksClient
    sm = SportmonksClient()
    fix_id = int(match["id"])

    # Always get full detail
    with st.spinner("Loading match details..."):
        detail = sm.get_fixture_detail(fix_id)

    if detail:
        render_match_detail(detail)

    # TAB-SPECIFIC DATA
    if tab_type == "upcoming":
        # Show squad
        render_section_header("Squads", "Season squad for both teams")
        with st.spinner("Loading squads..."):
            lineups = sm.get_fixture_lineups(fix_id)
            if not lineups:
                squads = sm.get_fixture_squads(fix_id)
                if squads:
                    render_squad_list(squads)
                else:
                    st.info("Squad data not available yet.")
            else:
                render_squad_list(lineups)

    elif tab_type == "live":
        # Show scorecard
        render_section_header("Live Scorecard", "Ball-by-ball data")
        with st.spinner("Loading scorecard..."):
            sc = sm.get_fixture_scorecard(fix_id)
            if sc:
                render_scorecard(sc)
            else:
                st.info("Scorecard data not available yet.")

        # Also show lineup if available
        lineups = sm.get_fixture_lineups(fix_id)
        if lineups:
            render_section_header("Playing XI")
            render_squad_list(lineups)

    elif tab_type == "recent":
        # Show full scorecard
        render_section_header("Full Scorecard")
        with st.spinner("Loading scorecard..."):
            sc = sm.get_fixture_scorecard(fix_id)
            if sc:
                render_scorecard(sc)
            else:
                st.info("Scorecard data not available.")

        # Lineup
        lineups = sm.get_fixture_lineups(fix_id)
        if lineups:
            render_section_header("Playing XI")
            render_squad_list(lineups)


# ═══════════════════════════════════════════════════════════
#  RENDER PREDICTION
# ═══════════════════════════════════════════════════════════

def render_prediction(prediction: dict, is_demo: bool = False) -> None:
    if is_demo:
        st.markdown(f"""
        <div style="padding:0.5rem 1rem;border-radius:8px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);margin-bottom:1.5rem;text-align:center">
            <span style="font-family:{FONT_B};font-size:0.8rem;color:{C['acc2']}">
                ✨ Demo Preview — Run a live prediction for real data
            </span>
        </div>
        """, unsafe_allow_html=True)

    render_context_card(prediction)
    render_section_header("Top Picks", "AI-recommended selections")

    col1, col2, col3 = st.columns(3)
    captain = prediction.get("captain_pick", {})
    vc = prediction.get("vice_captain_pick", {})
    rankings = prediction.get("rankings", [])

    captain_data = next((dict(p) for p in rankings if p.get("player_name", "").lower() == captain.get("player", "").lower()), captain)
    vc_data = next((dict(p) for p in rankings if p.get("player_name", "").lower() == vc.get("player", "").lower()), vc)
    captain_data["reason"] = captain.get("reason", "")
    vc_data["reason"] = vc.get("reason", "")

    with col1:
        render_player_card(captain_data, card_type="captain")
    with col2:
        render_player_card(vc_data, card_type="vc")
    with col3:
        render_value_picks_card(prediction.get("top_value_picks", []))

    render_section_header("Complete Rankings", f"{len(rankings)} players ranked by predicted fantasy points")
    render_ranking_table(rankings)

    risky = prediction.get("risky_picks", [])
    if risky:
        render_section_header("Risky Picks", "High variance — proceed with caution")
        render_risky_picks(risky)

    with st.expander("📄 Raw Prediction JSON"):
        st.json(prediction)


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════

def main():
    render_hero()

    gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")
    sportmonks_ok = bool(SPORTMONKS_API_KEY)

    cached = load_cached_predictions()

    # Main tabs
    tab_upcoming, tab_live, tab_recent, tab_predict, tab_history, tab_demo = st.tabs([
        "📅 Upcoming",
        "🔴 Live",
        "✅ Recent",
        "🔮 AI Predict",
        f"📁 History ({len(cached)})",
        "✨ Demo",
    ])

    # ─── UPCOMING ───
    with tab_upcoming:
        if not sportmonks_ok:
            st.warning("Add `SPORTMONKS_API_KEY` to `.env` to see fixtures.")
        else:
            if st.button("🔄 Refresh Upcoming", key="ref_upcoming", use_container_width=True):
                with st.spinner("Fetching upcoming fixtures..."):
                    from data.sportmonks_client import SportmonksClient
                    sm = SportmonksClient()
                    st.session_state["upcoming"] = sm.get_upcoming_fixtures()

            fixtures = st.session_state.get("upcoming", [])
            if fixtures:
                render_section_header("Upcoming Fixtures", f"{len(fixtures)} matches scheduled")
                for m in fixtures:
                    render_fixture_card(m, "upcoming")

                # Select a fixture for detail
                options = {f'{m["name"]} — {m["date"]}': m for m in fixtures}
                selected = st.selectbox("Select a match for details:", list(options.keys()), key="sel_upcoming")
                if selected:
                    show_fixture_detail(options[selected], "upcoming")
            else:
                render_no_fixtures("Click Refresh to load upcoming matches")

    # ─── LIVE ───
    with tab_live:
        if not sportmonks_ok:
            st.warning("Add `SPORTMONKS_API_KEY` to `.env` to see live matches.")
        else:
            if st.button("🔄 Refresh Live", key="ref_live", use_container_width=True):
                with st.spinner("Checking for live matches..."):
                    from data.sportmonks_client import SportmonksClient
                    sm = SportmonksClient()
                    st.session_state["live"] = sm.get_live_fixtures()

            fixtures = st.session_state.get("live", [])
            if fixtures:
                render_section_header("Live Matches", f"{len(fixtures)} matches in progress")
                for m in fixtures:
                    render_fixture_card(m, "live")

                options = {f'{m["name"]} — {m["status"]}': m for m in fixtures}
                selected = st.selectbox("Select a live match:", list(options.keys()), key="sel_live")
                if selected:
                    show_fixture_detail(options[selected], "live")
            else:
                render_no_fixtures("No live matches right now. Click Refresh to check.")

    # ─── RECENT ───
    with tab_recent:
        if not sportmonks_ok:
            st.warning("Add `SPORTMONKS_API_KEY` to `.env` to see recent results.")
        else:
            if st.button("🔄 Refresh Recent", key="ref_recent", use_container_width=True):
                with st.spinner("Fetching recent results..."):
                    from data.sportmonks_client import SportmonksClient
                    sm = SportmonksClient()
                    st.session_state["recent"] = sm.get_recent_fixtures()

            fixtures = st.session_state.get("recent", [])
            if fixtures:
                render_section_header("Recent Results", f"{len(fixtures)} completed matches")
                for m in fixtures:
                    render_fixture_card(m, "finished")

                options = {f'{m["name"]} — {m["date"]}': m for m in fixtures}
                selected = st.selectbox("Select a match for scorecard:", list(options.keys()), key="sel_recent")
                if selected:
                    show_fixture_detail(options[selected], "recent")
            else:
                render_no_fixtures("Click Refresh to load recent results")

    # ─── AI PREDICT ───
    with tab_predict:
        if not gemini_ok or not sportmonks_ok:
            missing = []
            if not gemini_ok:
                missing.append("Gemini API Key")
            if not sportmonks_ok:
                missing.append("Sportmonks API Key")

            st.markdown(f"""
            <div style="text-align:center;padding:3rem 2rem;background:{C['card']};border:1px solid {C['bdr']};border-radius:16px;margin:1rem 0">
                <div style="font-size:2.5rem;margin-bottom:1rem">🔑</div>
                <div style="font-family:{FONT_H};font-size:1.25rem;font-weight:700;color:{C['t1']};margin-bottom:0.5rem">API Keys Required</div>
                <div style="font-family:{FONT_B};font-size:0.9rem;color:{C['t3']};max-width:450px;margin:0 auto;line-height:1.7">
                    Missing: <strong style="color:{C['t1']}">{', '.join(missing)}</strong><br>
                    Add to <code>.env</code> file. Check <strong>✨ Demo</strong> tab for preview.
                </div>
            </div>
            """, unsafe_allow_html=True)
        else:
            render_section_header("AI Player Rankings", "Select a match for AI-powered prediction")

            # Load upcoming matches if not already loaded
            if "upcoming" not in st.session_state:
                if st.button("📥 Load Matches", key="load_predict", use_container_width=True):
                    with st.spinner("Fetching matches..."):
                        from data.sportmonks_client import SportmonksClient
                        sm = SportmonksClient()
                        st.session_state["upcoming"] = sm.get_upcoming_fixtures()

            matches = st.session_state.get("upcoming", [])
            if matches:
                options = {
                    f'{m["name"]} — {m["matchType"]} — {m["date"]}': m
                    for m in matches
                }
                selected = st.selectbox("🏏 Select Match", list(options.keys()), key="sel_predict")
                selected_match = options[selected]

                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Format", selected_match.get("matchType", "N/A"))
                with col2:
                    st.metric("Venue", selected_match.get("venue", "N/A")[:30])
                with col3:
                    st.metric("Date", selected_match.get("date", "N/A")[:20])

                if st.button("🔮 Predict & Rank Players", type="primary", use_container_width=True):
                    match_id = selected_match["id"]
                    with st.spinner("🧠 Running 4-agent AI pipeline... This may take 1-2 minutes."):
                        try:
                            from orchestrator.pipeline import run_prediction
                            fmt = {"t20": "t20", "t20i": "t20", "odi": "odi", "test": "test"}.get(
                                selected_match.get("matchType", "t20").lower(), "t20"
                            )
                            result = run_prediction(match_id, format_type=fmt)
                            if result:
                                st.session_state["current_prediction"] = result
                                st.success("✅ Prediction complete!")
                            else:
                                st.error("❌ Prediction failed.")
                        except Exception as e:
                            st.error(f"Pipeline error: {e}")
            else:
                st.info("Click **Load Matches** to fetch upcoming fixtures.")

        prediction = st.session_state.get("current_prediction")
        if prediction:
            render_prediction(prediction)

    # ─── HISTORY ───
    with tab_history:
        if cached:
            render_section_header("Prediction History", f"{len(cached)} predictions")
            selected = st.selectbox("Select prediction", list(cached.keys()))
            if selected:
                render_prediction(cached[selected])
        else:
            render_no_fixtures("No cached predictions yet. Run a live prediction first.")

    # ─── DEMO ───
    with tab_demo:
        render_prediction(DEMO_PREDICTION, is_demo=True)

    render_disclaimer()
    render_footer()


if __name__ == "__main__":
    main()
