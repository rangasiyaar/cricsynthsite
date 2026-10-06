"""GraphSynth renderer and data shaping."""
from __future__ import annotations

import xml.etree.ElementTree as ET

import pytest

from cricveda_core.graphsynth import data, render

WP = [{"innings": i, "balls": b, "home_win": 0.5 + (b - 60) / 300 * (1 if i == 2 else -1)}
      for i in (1, 2) for b in range(0, 121, 12)]
INN = [{"team": "MI", "runs": [6, 9, 12, 4] * 5, "wickets": [0, 1, 0, 0] * 5},
       {"team": "CSK", "runs": [8, 7, 10, 2] * 5, "wickets": [1, 0, 0, 0] * 5}]


def graphics(theme):
    t = render.theme_for(theme)
    return {
        "wp": render.win_probability(WP, "MI", "CSK", 20, t, projection={"score": 186, "band": 9}),
        "proj": render.score_projection("CSK", 142, 4, "16.2", {"p10": 171, "median": 184, "p90": 197}, t, target=190),
        "man": render.manhattan(INN, t),
        "worm": render.run_worm(INN, t),
        "phases": render.phase_breakdown(data.phase_rows(INN), t),
        "form": render.player_form("Virat <Kohli> & Co", [{"label": "v CSK", "points": 64.0}], t),
    }


@pytest.mark.parametrize("theme", list(render.THEMES))
def test_every_graphic_is_valid_svg(theme):
    for name, svg in graphics(theme).items():
        root = ET.fromstring(svg)                       # well-formed XML (text is escaped)
        assert root.attrib["viewBox"] == "0 0 1600 900", name
        assert root.attrib["width"] == "1920" and root.attrib["role"] == "img"
        has_bg = 'width="1600" height="900" fill=' in svg
        assert has_bg == (theme != "transparent"), (theme, name)


def test_content_and_escaping():
    g = graphics("broadcast_dark")
    assert ">MI 70%<" in g["wp"]                          # last point: home on 70%
    assert "Projected 186 ± 9" in g["wp"]
    assert "142/4" in g["proj"] and "TARGET 190" in g["proj"]
    assert ">VIRAT &lt;KOHLI&gt; &amp; CO<" in g["form"]    # titles are upper-cased, then escaped


def test_team_colours_and_validation():
    t = render.theme_for("broadcast_dark", home_color="1f6feb", away_color="#ff0000")
    assert t.home == "#1f6feb" and t.away == "#ff0000"
    assert 'fill="#1f6feb"' in render.manhattan(INN, t)
    with pytest.raises(ValueError):
        render.theme_for("neon")
    with pytest.raises(ValueError):
        render.theme_for("broadcast_dark", home_color="red;stroke:url(evil)")


def test_png_output_uses_bundled_fonts():
    png = render.to_png(graphics("broadcast_light")["proj"], 640, 360)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    width = int.from_bytes(png[16:20], "big")
    height = int.from_bytes(png[20:24], "big")
    assert (width, height) == (640, 360)
    assert sorted(p.name for p in render.FONT_DIR.glob("*.ttf")) == [
        "Barlow-Medium.ttf", "Barlow-SemiBold.ttf", "BarlowCondensed-SemiBold.ttf"]
    assert (render.FONT_DIR / "OFL.txt").exists()


def test_data_shaping():
    assert data.batting_order("MI", "CSK", "CSK", "field") == ("MI", "CSK")
    assert data.batting_order("MI", "CSK", "CSK", "bat") == ("CSK", "MI")
    assert data.batting_order("MI", "CSK", None, None) == ("MI", "CSK")
    dels = [{"innings": 1, "over_ball": 0.1, "runs_total": 4}, {"innings": 1, "over_ball": 0.2, "runs_total": 0,
            "wicket_type": "bowled"}, {"innings": 1, "over_ball": 1.1, "runs_total": 6},
            {"innings": 2, "over_ball": 0.1, "runs_total": 1}]
    inns = data.innings_by_over(dels, ("MI", "CSK"), 20)
    assert inns == [{"team": "MI", "runs": [4, 6], "wickets": [1, 0]}, {"team": "CSK", "runs": [1], "wickets": [0]}]
    ph = data.phase_rows([{"team": "MI", "runs": [10] * 20, "wickets": [0] * 20}])
    assert [p["runs"] for p in ph[0]["phases"]] == [60, 90, 50]
    assert data.overs_text(98) == "16.2" and data.overs_text(96) == "16"
    form = data.form_rows([{"match_id": 2, "match_date": "2026-04-02", "total_points": 40},
                           {"match_id": 1, "match_date": "2026-03-30", "total_points": 10}], {1: "RCB"})
    assert form == [{"label": "v RCB", "points": 10.0}, {"label": "04-02", "points": 40.0}]
