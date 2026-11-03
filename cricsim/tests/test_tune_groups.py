from datetime import date

from cricsim.engine.tune import compare_report


def _row(d, g, t, p, y):
    return {"date": d, "gender": g, "team_type": t, "comp": "x", "p": p, "y": y}


def test_compare_report_groups_and_direction():
    cur = {"win_rows": [_row("2026-07-10", "male", "international", 0.6, 1.0),
                        _row("2026-10-01", "female", "club", 0.4, 1.0)]}
    tun = {"win_rows": [_row("2026-07-10", "male", "international", 0.7, 1.0),
                        _row("2026-10-01", "female", "club", 0.3, 1.0)]}
    groups, md = compare_report(cur, tun, date(2026, 7, 1), date(2026, 11, 1))
    assert groups["All"]["n"] == 2
    assert groups["Men"]["tuned"] < groups["Men"]["current"]          # 0.09 v 0.16
    assert groups["Women"]["tuned"] > groups["Women"]["current"]      # 0.49 v 0.36
    assert groups["Internationals"]["n"] == 1 and groups["Leagues and domestic"]["n"] == 1
    assert {"Before 2026-08-31", "From 2026-08-31"} <= set(groups)
    assert any("worse" in line for line in md) and any("better" in line for line in md)
