"""Engine v3 on a synthetic world with known truth: fit → simulate → summarise → scenarios → backtest."""
from __future__ import annotations

import json
from datetime import date

import duckdb
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from cricdata.build import build
from cricsim.engine import states as S
from cricsim.engine.backtest import run_backtest, write_report
from cricsim.engine.fit import FitConfig, fit
from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine.simulate import simulate
from cricsim.engine.spec import MatchSpec, Scenario, StartState, TeamSpec
from cricsim.engine.summary import masks, summarize

from .synthetic_world import pick_xi, write_world


def _rank_corr(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("world")
    w, zp, ap = write_world(tmp)
    out = tmp / "parquet"
    build(zp, out)
    (out / "attributes").mkdir()
    pq.write_table(pa.Table.from_pylist(json.loads(ap.read_text())), out / "attributes" / "attributes.parquet")
    model = fit(out, FitConfig())
    model.save(tmp / "model")
    return {"world": w, "parquet": out, "model": Model.load(tmp / "model"), "tmp": tmp}


def _spec(w, a="Premier 0", b="Premier 1", fmt="T20", **kw):
    xa = [p.pid for p in pick_xi(w["teams"][a])]
    xb = [p.pid for p in pick_xi(w["teams"][b])]
    return MatchSpec(fmt, "male", (TeamSpec(a, xa), TeamSpec(b, xb)), venue_id="premier-oval",
                     comp_key="premier-league", **kw)


def test_fit_recovers_hidden_skills(world):
    m, truth = world["model"], world["world"]["players"]
    bat = [(p.bat, m.factors["bat"][m.pid(pid), S.WKT] - m.factors["bat"][m.pid(pid), S.DOT])
           for pid, p in truth.items() if m.knows(pid)]
    assert _rank_corr(*zip(*bat)) < -0.6                     # better batters → fewer wickets
    bowl = [(p.bowl, m.factors["bowl"][m.pid(pid), S.WKT] - m.factors["bowl"][m.pid(pid), S.DOT])
            for pid, p in truth.items() if m.knows(pid) and p.role == "bowl"]
    assert _rank_corr(*zip(*bowl)) > 0.45                    # better bowlers → more wickets
    assert m.meta["fit"]["conditions_sd"]["boundary"] >= 0


def test_cross_league_debutants_are_rated_from_their_other_league(world):
    m = world["model"]
    for pid in world["world"]["debutants"]:
        assert m.knows(pid)                                  # rated from Shield balls before the Premier debut
        assert m.balls_faced[m.pid(pid), 0] > 50
    assert not m.knows("never-played") and m.pid("never-played") == 0


def test_simulator_is_calibrated_in_sample(world):
    con = duckdb.connect()
    p = world["parquet"].as_posix()
    ms = con.execute(f"""SELECT match_id, team1, team2, venue_id, competition_id FROM read_parquet('{p}/matches/*.parquet')
                         WHERE season = '2023' ORDER BY match_id LIMIT 30""").fetchall()
    sim, act = [], []
    for mid, t1, t2, v, c in ms:
        xi = {t: [r[0] for r in con.execute(f"""SELECT player_id FROM read_parquet('{p}/match_players/*.parquet')
                  WHERE match_id = ? AND team = ? ORDER BY list_order""", [mid, t]).fetchall()] for t in (t1, t2)}
        spec = MatchSpec("T20", "male", (TeamSpec(t1, xi[t1]), TeamSpec(t2, xi[t2])), venue_id=v, comp_key=c,
                         batting_first=0)
        sim.append(simulate(world["model"], spec, n=300, seed=1).parts[0].innings[0].runs.mean())
        act.append(con.execute(f"""SELECT runs FROM read_parquet('{p}/innings/*.parquet')
                                   WHERE match_id = ? AND innings_no = 1""", [mid]).fetchone()[0])
    assert abs(np.mean(sim) / np.mean(act) - 1) < 0.06


def test_summary_shape_and_consistency(world):
    m = world["model"]
    sims = simulate(m, _spec(world["world"]), n=3000, seed=3)
    s = summarize(sims, m)
    assert s["meta"]["simulations"] == 3000
    assert abs(sum(s["result"]["win"].values()) - 1) < 1e-6
    bat = s["teams"][0]["batting"]
    assert len(bat["per_over"]) == 20 and len(bat["phases"]) == 3
    assert abs(sum(h["p"] for h in bat["score"]["hist"]) - 1) < 0.02
    ps = [f["p"] for f in bat["fall_of_wickets"]]
    assert all(a >= b for a, b in zip(ps, ps[1:]))            # k-th wicket at least as likely as (k+1)-th
    assert bat["fall_of_wickets"][0]["bowler"] and bat["fall_of_wickets"][0]["batter"]
    opener = s["teams"][0]["players"][0]["batting"]
    pal = list(opener["p_at_least"].values())
    assert all(a >= b for a, b in zip(pal, pal[1:]))
    assert opener["dismissed_by"] and s["matchups"]
    bowlers = [p for p in s["teams"][1]["players"] if p.get("bowling", {}).get("p_bowls", 0) > 0.9]
    assert len(bowlers) >= 4
    json.dumps(s)                                             # JSON-able


def test_rules_and_quotas_hold_for_every_format(world):
    m = world["model"]
    for fmt, balls, quota_balls in (("T20", 120, 24), ("OD", 300, 60), ("HUNDRED", 100, 20), ("T10", 60, 12)):
        sims = simulate(m, _spec(world["world"], fmt=fmt, batting_first=0), n=400, seed=4)
        for lg in sims.parts[0].innings:
            assert lg.legal.max() <= balls
            assert lg.bowl_balls.max() <= quota_balls
            assert (lg.wkts <= 10).all()
            assert (lg.bat_runs.sum(1) + lg.extras.sum(1) == lg.runs).all()     # scorecards add up


def test_scenarios_move_the_numbers(world):
    m, w = world["model"], world["world"]
    base = summarize(simulate(m, _spec(w), n=3000, seed=5), m)["teams"][0]["batting"]["score"]["mean"]
    flat = summarize(simulate(m, _spec(w), n=3000, seed=5, scenario=Scenario(boundary_mult=1.3)), m)
    assert flat["teams"][0]["batting"]["score"]["mean"] > base + 5
    # chase from a set position
    spec = _spec(w, batting_first=0)
    easy = Scenario(start=StartState(innings=2, runs=120, wickets=1, balls=90, first_innings_total=140))
    hard = Scenario(start=StartState(innings=2, runs=40, wickets=6, balls=90, first_innings_total=200))
    team2 = spec.teams[1].name
    assert summarize(simulate(m, spec, n=1000, seed=6, scenario=easy), m)["result"]["win"][team2] > 0.9
    assert summarize(simulate(m, spec, n=1000, seed=6, scenario=hard), m)["result"]["win"][team2] < 0.05
    # conditioning: a big first score lifts that team's chances
    sims = simulate(m, _spec(w), n=4000, seed=7)
    t0 = sims.spec.teams[0].name
    all_ = summarize(sims, m)["result"]["win"][t0]
    big = summarize(sims, m, masks.team_score(sims, 0, at_least=170))["result"]["win"][t0]
    assert big > all_ + 0.1
    # a bowler can be ruled out
    out = sims.spec.teams[1].players[7]
    s = simulate(m, _spec(w), n=500, seed=8, scenario=Scenario(exclude_bowlers=[out]))
    lg = next(x for x in s.parts[0].innings if x.batting == 0)
    assert lg.bowl_balls[:, lg.bowlers.index(out)].sum() == 0


def test_unknown_players_and_json_specs(world):
    m, w = world["model"], world["world"]
    spec = _spec(w)
    d = {"format": "T20", "gender": "male", "venue_id": "premier-oval",
         "teams": [{"name": spec.teams[0].name, "players": spec.teams[0].players[:10] + ["brand-new-kid"]},
                   {"name": spec.teams[1].name, "players": spec.teams[1].players}],
         "attributes": {"brand-new-kid": {"hand": "left", "kind": "leg_spin"}},
         "scenario": {"boundary_mult": 1.1, "start": None}}
    sp, sc = spec_from_dict(d)
    s = summarize(simulate(m, sp, n=500, seed=9, scenario=sc), m)
    kid = next(p for p in s["teams"][0]["players"] if p["id"] == "brand-new-kid")
    assert kid["known"] is False and "newcomer" in kid["profile"]["source"]
    with pytest.raises(ValueError):
        spec_from_dict({**d, "teams": d["teams"][:1]})


def test_backtest_runs_and_reports(world, tmp_path):
    rep = run_backtest(world["parquet"], date(2024, 1, 1), limit=12, n_sims=200, insample=8)
    assert rep["matches"] > 0 and "result" in rep and "first_innings_total" in rep
    assert "established" in rep["player_runs"]
    assert "competition: seen" in rep["first_innings_by_split"]
    assert rep["insample"]["team_innings"]["1"]["n"] > 0
    write_report(rep, tmp_path / "bt")
    text = (tmp_path / "bt.md").read_text()
    assert "Backtest" in text and "In-sample check" in text
