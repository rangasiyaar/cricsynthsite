"""CricketMind AI — Cricket App (ESPNCricinfo-style)

Auto-fetches data on load. Click any fixture to expand details.
Tabs: Upcoming (5) | Live | Recent (10) | AI Predict | History
No sidebar. CricSynthesis theme.

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
#  AUTO-FETCH: load data on app startup
# ═══════════════════════════════════════════════════════════

@st.cache_data(ttl=300)  # Cache 5 minutes
def fetch_upcoming():
    from data.sportmonks_client import SportmonksClient
    return SportmonksClient().get_upcoming_fixtures()


@st.cache_data(ttl=300)
def fetch_live():
    from data.sportmonks_client import SportmonksClient
    return SportmonksClient().get_live_fixtures()


@st.cache_data(ttl=300)
def fetch_recent():
    from data.sportmonks_client import SportmonksClient
    return SportmonksClient().get_recent_fixtures(limit=10)


@st.cache_data(ttl=120)
def fetch_fixture_detail(fixture_id: int):
    from data.sportmonks_client import SportmonksClient
    return SportmonksClient().get_fixture_detail(fixture_id)


@st.cache_data(ttl=120)
def fetch_scorecard(fixture_id: int):
    from data.sportmonks_client import SportmonksClient
    return SportmonksClient().get_fixture_scorecard(fixture_id)


@st.cache_data(ttl=300)
def fetch_squads(fixture_id: int):
    from data.sportmonks_client import SportmonksClient
    sm = SportmonksClient()
    lineups = sm.get_fixture_lineups(fixture_id)
    if not lineups:
        lineups = sm.get_fixture_squads(fixture_id)
    return lineups


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
#  FIXTURE DETAIL (click-to-expand)
# ═══════════════════════════════════════════════════════════

def show_fixture_expanded(match: dict, tab_type: str) -> None:
    """Show full details when a fixture is clicked."""
    fix_id = int(match["id"])

    # Match info
    detail = fetch_fixture_detail(fix_id)
    if detail:
        render_match_detail(detail)

    if tab_type == "upcoming":
        render_section_header("Squad", "Season squad for both teams")
        squads = fetch_squads(fix_id)
        if squads:
            render_squad_list(squads)
        else:
            st.info("Squad data not available yet.")

    elif tab_type in ("live", "recent"):
        render_section_header("Scorecard")
        sc = fetch_scorecard(fix_id)
        if sc:
            render_scorecard(sc)
        else:
            st.info("Scorecard not available.")

        lineups = fetch_squads(fix_id)
        if lineups:
            render_section_header("Playing XI")
            render_squad_list(lineups)


# ═══════════════════════════════════════════════════════════
#  RENDER PREDICTION
# ═══════════════════════════════════════════════════════════

def render_prediction(prediction: dict) -> None:
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

    render_section_header("Complete Rankings", f"{len(rankings)} players ranked")
    render_ranking_table(rankings)

    risky = prediction.get("risky_picks", [])
    if risky:
        render_section_header("Risky Picks", "High variance")
        render_risky_picks(risky)

    with st.expander("📄 Raw JSON"):
        st.json(prediction)


# ═══════════════════════════════════════════════════════════
#  FIXTURE TAB RENDERER
# ═══════════════════════════════════════════════════════════

def render_fixtures_tab(fixtures: list, tab_type: str, limit: int = 0, empty_msg: str = "No matches available.") -> None:
    """Render a list of fixtures with click-to-expand."""
    if not fixtures:
        render_no_fixtures(empty_msg)
        return

    if limit > 0:
        fixtures = fixtures[:limit]

    section_titles = {
        "upcoming": ("Upcoming Fixtures", f"{len(fixtures)} matches scheduled"),
        "live": ("Live Matches", f"{len(fixtures)} in progress"),
        "recent": ("Recent Results", f"{len(fixtures)} completed"),
    }
    title, sub = section_titles.get(tab_type, ("Fixtures", ""))
    render_section_header(title, sub)

    # Render each fixture as a clickable card
    for i, m in enumerate(fixtures):
        render_fixture_card(m, tab_type if tab_type != "recent" else "finished")

        # Click to expand — use a button styled subtly
        key = f"detail_{tab_type}_{m['id']}_{i}"
        if st.button(
            f"📋 View Details — {m['name']}",
            key=key,
            use_container_width=True,
        ):
            st.session_state[f"selected_{tab_type}"] = m["id"]

    # Show expanded detail for selected fixture
    selected_id = st.session_state.get(f"selected_{tab_type}")
    if selected_id:
        selected = next((m for m in fixtures if m["id"] == str(selected_id)), None)
        if selected:
            st.divider()
            render_section_header(
                selected["name"],
                f'{selected.get("matchType", "")} · {selected.get("venue", "")}'
            )
            show_fixture_expanded(selected, tab_type)


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════

def main():
    render_hero()

    sportmonks_ok = bool(SPORTMONKS_API_KEY)
    gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")
    cached = load_cached_predictions()

    # Main tabs (no Demo)
    tab_upcoming, tab_live, tab_recent, tab_predict, tab_history = st.tabs([
        "📅 Upcoming",
        "🔴 Live",
        "✅ Recent",
        "🔮 AI Predict",
        f"📁 History ({len(cached)})",
    ])

    # ─── UPCOMING ─── auto-fetch, limited to 5
    with tab_upcoming:
        if not sportmonks_ok:
            st.warning("Add `SPORTMONKS_API_KEY` to `.env` to see fixtures.")
        else:
            upcoming = fetch_upcoming()
            render_fixtures_tab(upcoming, "upcoming", limit=5, empty_msg="No upcoming matches found.")

    # ─── LIVE ─── auto-fetch
    with tab_live:
        if not sportmonks_ok:
            st.warning("Add `SPORTMONKS_API_KEY` to `.env`.")
        else:
            live = fetch_live()
            render_fixtures_tab(live, "live", empty_msg="No live matches right now.")

    # ─── RECENT ─── auto-fetch, limited to 10
    with tab_recent:
        if not sportmonks_ok:
            st.warning("Add `SPORTMONKS_API_KEY` to `.env`.")
        else:
            recent = fetch_recent()
            render_fixtures_tab(recent, "recent", limit=10, empty_msg="No recent results.")

    # ─── AI PREDICT ───
    with tab_predict:
        if not gemini_ok or not sportmonks_ok:
            missing = []
            if not gemini_ok:
                missing.append("Gemini API Key")
            if not sportmonks_ok:
                missing.append("Sportmonks API Key")
            st.html(
                f'<div style="text-align:center;padding:3rem 2rem;background:{C["card"]};border:1px solid {C["bdr"]};border-radius:16px;margin:1rem 0">'
                f'<div style="font-size:2.5rem;margin-bottom:1rem">🔑</div>'
                f'<div style="font-family:{FONT_H};font-size:1.25rem;font-weight:700;color:{C["t1"]};margin-bottom:0.5rem">API Keys Required</div>'
                f'<div style="font-family:{FONT_B};font-size:0.9rem;color:{C["t3"]};max-width:450px;margin:0 auto;line-height:1.7">'
                f'Missing: <strong style="color:{C["t1"]}">{", ".join(missing)}</strong><br>'
                f'Add to <code>.env</code> file.</div></div>'
            )
        else:
            render_section_header("AI Player Rankings", "Select a match for prediction")

            upcoming = fetch_upcoming()
            if upcoming:
                options = {
                    f'{m["name"]} — {m["matchType"]} — {m["date"]}': m
                    for m in upcoming[:10]
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
                    with st.spinner("🧠 Running AI pipeline... (1-2 minutes)"):
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
                st.info("No upcoming matches available.")

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
            render_no_fixtures("No predictions yet. Run a live prediction first.")

    render_disclaimer()
    render_footer()


if __name__ == "__main__":
    main()
