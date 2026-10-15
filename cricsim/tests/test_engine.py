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
    rep = run_backtest(world["parquet"], date(2024, 1, 1), limit=12, n_sims=200, insample=8, fantasy_bowlers=True)
    fz = rep["fantasy"]
    assert fz["best_possible"] >= fz["strategies"]["mean"]["points"] > 0
    assert fz["strategies"]["mean"]["points"] > fz["strategies"]["random"]["points"] * 0.8
    assert fz["strategies"]["portfolio_5"]["points"] >= fz["strategies"]["mean"]["points"]
    assert rep["matches"] > 0 and "result" in rep and "first_innings_total" in rep
    assert "established" in rep["player_runs"]
    assert "competition: seen" in rep["first_innings_by_split"]
    assert rep["insample"]["team_innings"]["1"]["n"] > 0
    write_report(rep, tmp_path / "bt")
    text = (tmp_path / "bt.md").read_text()
    assert "Backtest" in text and "In-sample check" in text


def test_sample_a_simulated_match(world, tmp_path):
    from click.testing import CliRunner
    from cricsim.sample import main as sample_main
    m = world["model"]
    spec = _spec(world["world"], batting_first=0)
    roles = ["BAT", "WK", "BAT", "BAT", "AR", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL"]
    cov = {"id": "t", "format": "T20", "gender": "male", "venue_id": spec.venue_id, "comp_key": spec.comp_key,
           "batting_first": 0, "teams": [{"name": t.name, "players": list(t.players), "roles": roles}
                                         for t in spec.teams]}
    f = tmp_path / "cov.json"
    f.write_text(json.dumps(cov))
    star = m.names[m.pid(spec.teams[0].players[0])]
    res = CliRunner().invoke(sample_main, ["--model", str(world["tmp"] / "model"), "--coverage", str(f),
                                           "--top-scorer", star, "--n", "500"])
    assert res.exit_code == 0, res.output
    card = json.loads(res.output.split("\n", 1)[1])
    first = card["innings"][0]["batting"][0]
    assert first["runs"] == max(b.get("runs", 0) for inn in card["innings"] for b in inn["batting"])
    xi = card["fantasy_xi"]["players"]
    assert len(xi) == 11 and {p["role"] for p in xi} == {"WK", "BAT", "AR", "BOWL"}


def test_venue_diagnostic_runs(world):
    from cricsim.engine.venue_diag import run as venue_diag
    text = venue_diag(world["parquet"], date(2024, 1, 1), years=3.0, min_balls=200, memory="2GB")
    for part in ("Ground level", "Within-ground splits", "| phase | runs |", "Busiest grounds"):
        assert part in text


def test_venue_audit_runs(world, tmp_path):
    from cricsim.engine.venue_audit import run as venue_audit
    (tmp_path / "fx.json").write_text(json.dumps({"venue_search": "ground"}))
    text = venue_audit(world["parquet"], date(2024, 1, 1), years=3.0, min_matches=2, memory="2GB", fixtures=tmp_path)
    for part in ("1. Identity", "2. Fixture venue lookups", "3. Ground history",
                 "4. Does a league", "5. Drift", "6. Volatility", "7. Fixture grounds"):
        assert part in text


def test_city_prior_leans_on_neighbours():
    from cricsim.engine.fit import city_prior
    f = np.zeros((4, S.K), dtype=np.float32)
    f[1, S.SIX] = 0.3                                     # a big-hitting ground with lots of history
    balls = np.array([0.0, 50000, 100, 100])
    p = city_prior(f, balls, np.array([-1, 0, 0, 1]))     # ground 2 shares ground 1's city; ground 3 is alone
    assert 0.25 < p[2, S.SIX] < 0.3 and p[1, S.SIX] == 0 and not p[3].any() and not p[0].any()


def test_venue_split_factors_move_runs_not_wickets(world):
    f = world["model"].factors
    for name in ("venue_g", "venue_ph", "venue_kind"):
        assert not f[name][:, S.WKT].any() and np.abs(f[name]).max() > 0
    vp = world["model"].venue_phase("premier-oval", "T20")
    assert vp.shape == (50, S.K) and (vp[0] == vp[5]).all() and (vp[16] == vp[19]).all()


def test_competition_groups(world):
    from cricsim.engine.fit import GROUP_KEYS
    m = fit(world["parquet"], FitConfig(comp_groups="club"))
    f = m.factors
    assert f["comp_group"].shape == (len(GROUP_KEYS), S.K) and m.meta["comp_groups"] == GROUP_KEYS
    known = m.comp_factor("premier-league", "T20", "male")
    assert (known == f["comp"][m.comp("premier-league")]).all()
    # a league the model has never seen gets the club T20 men's level: between its leagues and the global average
    new = m.comp_factor("a-brand-new-league", "T20", "male")
    two = f["comp"][[m.comp("premier-league"), m.comp("shield-league")]]
    assert np.abs(new).max() > 0
    assert (new >= np.minimum(two.min(0), 0) - 1e-6).all() and (new <= np.maximum(two.max(0), 0) + 1e-6).all()
    assert not m.comp_factor("a-brand-new-league", "OD", "female").any()     # no such group in this world: average
    assert not m.comp_factor("a-new-tour", "T20", "male", team_type="international").any()   # club only
    spec = _spec(world["world"], team_type="club")
    spec.comp_key = "a-brand-new-league"
    assert simulate(m, spec, n=200, seed=1).n == 200


def test_newcomers_bowl_like_their_team_sheet_slot(world):
    from cricsim.engine.simulate import _Tables
    m = world["model"]
    assert m.usage_slot.shape == (2, 11, 10) and (m.usage_slot >= 0).all()
    late, early = m.usage_slot[0, 7:].sum(), m.usage_slot[0, :3].sum()
    assert late > early                                            # the tail bowls more than the top order
    spec = _spec(world["world"])
    bowlers = list(spec.teams[1].players)
    bowlers[9] = "never-seen-before"
    on = _Tables(m, spec, Scenario(), 0, list(spec.teams[0].players), bowlers)      # the default
    m.meta["sim"] = {"slot_usage": False}
    try:
        off = _Tables(m, spec, Scenario(), 0, list(spec.teams[0].players), bowlers)
    finally:
        m.meta.pop("sim")
    assert on.bowl_weights[9].sum() > 10 * off.bowl_weights[9].sum()


def test_experience_factor_and_recent_role(world):
    from cricsim.engine.model import N_EXP, exp_bucket
    from cricsim.engine.simulate import _Tables
    m = fit(world["parquet"], FitConfig(experience=True))
    f = m.factors
    assert f["bat_exp"].shape == (2 * N_EXP, S.K) and f["bowl_exp"].shape == (2 * N_EXP, S.K)
    assert np.abs(f["bat_exp"]).max() > 0 and m.meta["experience"]
    assert (m.career_balls >= 0).all() and m.career_balls[1:].sum() > 0 and list(exp_bucket([0, 60, 1000])) == [0, 1, 3]
    assert m.recent_n.max() == 5 and (m.usage_recent >= 0).all() and m.bat_pos_recent.max() > 0
    spec = _spec(world["world"])
    assert simulate(m, spec, n=200, seed=1).n == 200
    # recent role moves the bowling shares towards the last five matches
    base = _Tables(m, spec, Scenario(), 0, list(spec.teams[0].players), list(spec.teams[1].players))
    m.meta["sim"] = {"recent_role": 1.0}
    try:
        recent = _Tables(m, spec, Scenario(), 0, list(spec.teams[0].players), list(spec.teams[1].players))
    finally:
        m.meta.pop("sim")
    assert recent.bowl_weights.shape == base.bowl_weights.shape and not np.allclose(recent.bowl_weights, base.bowl_weights)


def test_home_team_rule_and_home_fit_runs(world):
    m = fit(world["parquet"], FitConfig(home=True))
    assert isinstance(m.meta["home_counts"], dict)
    m.meta["home_counts"] = {"ground": {"Hosts": 9, "Visitors": 2, "Regulars": 6}}
    assert m.home_team("ground", ["Visitors", "Hosts"]) == 1
    assert m.home_team("ground", ["Hosts", "Regulars"]) is None          # 9 v 6: both at home here, neutral
    assert m.home_team("elsewhere", ["Hosts", "Visitors"]) is None
    assert simulate(m, _spec(world["world"]), n=100, seed=1).n == 100


def test_phase_skill_and_recent_form(world):
    from cricsim.engine.model import N_PHASE3, phase3
    from cricsim.engine.simulate import _Tables
    assert list(phase3([0, 5, 6, 15, 16, 19], 20)) == [0, 0, 1, 1, 2, 2]
    m = fit(world["parquet"], FitConfig(phase_skill=True))
    f = m.factors
    assert f["bat_phase"].shape == (len(m.players) * N_PHASE3, S.K) and np.abs(f["bat_phase"]).max() > 0
    assert f["form_bat"].shape == (len(m.players), 2) and np.abs(f["form_bat"]).max() > 0 and not f["form_bat"][0].any()
    spec = _spec(world["world"])
    T = _Tables(m, spec, Scenario(), 0, list(spec.teams[0].players), list(spec.teams[1].players))
    assert T.bat_phase.shape == (11, N_PHASE3, S.K) and len(T.over_phase) == 20
    m.meta["sim"] = {"form": 1.0}
    try:
        Tf = _Tables(m, spec, Scenario(), 0, list(spec.teams[0].players), list(spec.teams[1].players))
    finally:
        m.meta.pop("sim")
    assert not np.allclose(Tf.pair, T.pair)
    assert simulate(m, spec, n=200, seed=1).n == 200


def test_new_ground_level_and_venue_half_life(world):
    m = fit(world["parquet"], FitConfig(new_ground=True, venue_half_life=1.5))
    ng = m.meta["fit"]["new_ground"]
    assert "balls" in ng
    assert np.isfinite(m.factors["venue"][0]).all()
    base = fit(world["parquet"], FitConfig())
    assert not base.factors["venue"][0].any()                       # default: unseen ground = global average
    assert not np.allclose(m.factors["venue"][1:], base.factors["venue"][1:])   # shorter memory moves ground factors
