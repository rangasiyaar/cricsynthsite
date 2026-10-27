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
    st = fz["strategies"]
    assert st["portfolio_20"]["points"] >= st["portfolio_10"]["points"] >= st["portfolio_5"]["points"]
    assert st["portfolio_cap_20"]["points"] >= st["portfolio_cap_5"]["points"] >= st["mean"]["points"]
    assert rep["matches"] > 0 and "result" in rep and "first_innings_total" in rep
    assert "established" in rep["player_runs"]
    assert "competition: seen" in rep["first_innings_by_split"]
    assert rep["insample"]["team_innings"]["1"]["n"] > 0
    write_report(rep, tmp_path / "bt")
    text = (tmp_path / "bt.md").read_text()
    assert "Backtest" in text and "In-sample check" in text and "Captain candidates" in text
    rep_f = run_backtest(world["parquet"], date(2024, 1, 1), limit=6, n_sims=100, sim_overrides={"fielding": True})
    assert rep_f["fantasy"]["best_possible"] > 0
    rep_l = run_backtest(world["parquet"], None, latest=3, n_sims=100, sim_overrides={"fielding": True})
    assert len(rep_l["fantasy"]["per_match"]) == 3
    write_report(rep_l, tmp_path / "latest")
    assert "Per match" in (tmp_path / "latest.md").read_text()
    rep_t = run_backtest(world["parquet"], None, latest=2, n_sims=100, latest_teams=["Premier 0", "Premier 1"])
    assert all("Premier 0 v Premier 1" in r["match"] or "Premier 1 v Premier 0" in r["match"]
               for r in rep_t["fantasy"]["per_match"])


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


def test_format_audit_runs(world):
    from cricsim.engine.format_audit import run as format_audit
    text = format_audit(world["parquet"], date(2024, 1, 1), window=365, memory="2GB")
    for part in ("1. How much should format-specific evidence count", "**Batting**", "2. Does recent form carry",
                 "| same family | 0.25 |", "Production-like", "prior 8100", "3. Batters coming into a format"):
        assert part in text


def test_level_audit_runs(world):
    from cricsim.engine.level_audit import run as level_audit
    text = level_audit(world["parquet"], date(2024, 1, 1), memory="2GB")
    for part in ("Level audit", "Projecting the season level", "trend, 4 seasons (today) | +0.000", "Where the one-day gap", "By innings and chase pressure", "by competition"):
        assert part in text


def test_era_wickets_latest_only_moves_dismissals(world):
    from cricsim.engine.model import era_vector
    m = world["model"]
    a = era_vector(m, 0)
    m.meta["sim"] = {"era_wickets": "latest"}
    try:
        b = era_vector(m, 0)
    finally:
        m.meta.pop("sim")
    keep = np.arange(S.K) != S.WKT
    assert np.allclose(a[keep], b[keep])


def test_era_gender_gives_each_gender_its_own_trend(world):
    from cricsim.engine.model import era_vector
    m = fit(world["parquet"], FitConfig(era_gender=True))
    assert "era_g" in m.factors and len(m.meta["fit"]["era_balls_g"]) == 4
    assert np.allclose(era_vector(m, 0), era_vector(world["model"], 0), atol=0.05)   # shared trend still there
    assert era_vector(m, 0, 0).shape == (S.K,)
    s = simulate(m, _spec(world["world"]), n=200, seed=1)
    assert s is not None


def test_team_day_splits_conditions(world):
    sd = world["model"].meta["fit"]["conditions_sd"]
    assert {"boundary_shared", "boundary_innings", "wicket_shared", "wicket_innings"} <= set(sd)
    m = world["model"]
    m.meta["sim"] = {"team_day": True}
    try:
        s = simulate(m, _spec(world["world"]), n=300, seed=3)
    finally:
        m.meta.pop("sim")
    assert np.isfinite(s.parts[0].innings[1].runs).all()


def test_chase_wickets_factor(world):
    from cricsim.engine.model import N_CHASE_W, chase_w_bucket
    assert chase_w_bucket(1, 50, 60, 3) == 0
    assert chase_w_bucket(2, 10, 60, 2) == 1 and chase_w_bucket(2, 300, 6, 9) == N_CHASE_W - 1
    m = fit(world["parquet"], FitConfig(chase_wickets=True))
    assert m.factors["chase_w"].shape == (2 * N_CHASE_W, S.K)
    s = simulate(m, _spec(world["world"]), n=300, seed=2)
    assert np.isfinite(s.parts[0].innings[1].runs).all()


def test_gap_variants_fit_and_simulate(world):
    m = fit(world["parquet"], FitConfig(collapse=True, bat_switch=True, era_team_type=True))
    for name in ("collapse", "bat_switch", "era_tt"):
        assert name in m.factors
    assert m.last_fam is not None and len(m.meta["fit"]["era_balls_tt"]) == 4
    m.meta["sim"] = {"era_ahead": 1.0}
    s = simulate(m, _spec(world["world"]), n=300, seed=4)
    assert np.isfinite(s.parts[0].innings[0].runs).all()


def test_dynamic_batting_order(world):
    m = fit(world["parquet"], FitConfig())
    assert m.entry_frac is not None and m.pos_entry.shape == (2, 11)
    assert (np.diff(m.pos_entry[0][2:]) >= -0.05).all()            # later positions walk in later
    m.meta["sim"] = {"dyn_order": 0.1}
    s = simulate(m, _spec(world["world"]), n=400, seed=5)
    assert np.isfinite(s.parts[0].innings[0].runs).all()


def test_rule_split_runs(world):
    m = fit(world["parquet"], FitConfig(rule_split=True))
    assert m.meta["rule_split"] is True


def test_impact_xis_bat_and_field_eleven(world):
    from cricsim.engine.backtest import impact_xis
    m = world["model"]
    spec = _spec(world["world"])
    squad = list(spec.teams[0].players) + [spec.teams[1].players[-1]]
    t = impact_xis(m, spec.teams[0], squad, "T20")
    assert len(t.players) == 11 and len(t.bowling_xi) == 11
    s = simulate(m, MatchSpec("T20", "male", (t, spec.teams[1]), venue_id="premier-oval",
                              comp_key="premier-league"), n=200, seed=6)
    assert np.isfinite(s.parts[0].innings[0].runs).all()
    from cricsim.fantasy import sim_points
    pids, pts = sim_points(s)
    assert set(t.bowling_xi) <= set(pids) and np.isfinite(pts).all()
    summarize(s, m)


def test_impact_xis_leaves_an_eleven_alone(world):
    from cricsim.engine.backtest import impact_xis
    m = world["model"]
    spec = _spec(world["world"])
    other = spec.teams[1]
    t = impact_xis(m, other, list(other.players), "T20")
    assert t is other and len(t.players) == 11
    twelve = impact_xis(m, spec.teams[0], list(spec.teams[0].players) + [other.players[-1]], "T20")
    s = simulate(m, MatchSpec("T20", "male", (twelve, t), venue_id="premier-oval",
                              comp_key="premier-league"), n=100, seed=8)
    assert np.isfinite(s.parts[0].innings[1].runs).all()


def test_backtest_paths_with_a_fielding_only_player(world):
    from cricsim.engine.backtest import impact_xis
    from cricsim.fantasy import pick_xi, sim_points
    m = world["model"]
    spec = _spec(world["world"])
    squad = list(spec.teams[0].players) + [spec.teams[1].players[-1]]
    t = impact_xis(m, spec.teams[0], squad, "T20")
    sp = MatchSpec("T20", "male", (t, spec.teams[1]), venue_id="premier-oval", comp_key="premier-league")
    s = simulate(m, sp, n=200, seed=7)
    pids, pts = sim_points(s)
    team_of = {p: k for k, tm in enumerate(sp.teams) for p in tm.everyone}
    pick_xi(dict(zip(pids, pts.mean(0))), team_of)
    summarize(s, m)


def test_fielding_points_from_dismissals():
    from cricsim.fantasy import fielding_points
    ev = [("caught", ["a"], "b"), ("caught", ["a"], "b"), ("caught", ["a"], "c"), ("caught and bowled", [], "b"),
          ("stumped", ["k"], "c"), ("run out", ["a", "k"], None), ("run out", ["d"], None), ("bowled", [], "b")]
    assert fielding_points(ev) == {"a": 3 * 8 + 4 + 6, "b": 8, "k": 12 + 6, "d": 12}


def test_sim_fielding_points_add_up(world):
    from cricsim.fantasy import CAUGHT, CAUGHT_BOWLED, RUN_OUT, STUMPED, sim_points
    m = world["model"]
    assert m.fielding is not None and m.fielding.shape == (len(m.players), 3)
    assert np.all((m.fielding > 0) & (m.fielding < 1))
    s = simulate(m, _spec(world["world"]), n=100, seed=9)
    _, base = sim_points(s)
    _, withf = sim_points(s, model=m, fielding=True)
    want = []
    for part in s.parts:
        w = 0
        for lg in part.innings:
            k, out = lg.bat_kind, lg.bat_out
            w = w + 8 * (out & np.isin(k, (CAUGHT, CAUGHT_BOWLED))).sum(1) + 12 * (out & np.isin(k, (STUMPED, RUN_OUT))).sum(1)
        want.append(w)
    assert np.allclose((withf - base).sum(1), np.concatenate(want), atol=1e-3)


def test_decisive_mean_leans_to_the_favourite():
    from cricsim.fantasy import decisive_mean
    win = np.array([0] * 70 + [1] * 30)
    pts = np.stack([np.where(win == 0, 100.0, 0.0), np.where(win == 1, 100.0, 0.0)], 1)
    m = decisive_mean(pts, win, 1.2)
    assert m[0] > 70 and m[1] < 30 and abs(m.sum() - 100) < 1e-6
    assert np.allclose(decisive_mean(pts, win, 1.0), pts.mean(0))


def test_fantasy_check_scores_a_result_file(world):
    from cricsim.fantasy_check import check
    spec = _spec(world["world"])
    a, b = spec.teams
    cov = {"format": "T20", "gender": "male", "venue_id": spec.venue_id, "comp_key": spec.comp_key,
           "teams": [{"name": t.name, "players": list(t.players)} for t in spec.teams]}
    fixture = {"teams": [{"name": t.name, "players": [f"Player {p}" for p in t.players],
                          "roles": ["WK"] + ["BAT"] * 4 + ["AR"] * 2 + ["BOWL"] * 4} for t in spec.teams]}
    card = {"innings": [{"batting": [
        {"name": f"Player {a.players[0]}", "dismissal": f"c Player {b.players[0]} b Player {b.players[-1]}",
         "runs": 60, "balls": 30, "fours": 6, "sixes": 3},
        {"name": f"Player {a.players[1]}", "dismissal": f"run out (Player {b.players[2]})", "runs": 5, "balls": 6,
         "fours": 0, "sixes": 0}],
        "bowling": [{"name": f"Player {b.players[-1]}", "overs": "4", "runs": 20, "wickets": 1}]}]}
    r = check(world["model"], cov, fixture, card, n=300)
    real = r["real"]
    assert real[a.players[0]] == 4 + 60 + 24 + 18 + 8 + 6 and real[b.players[0]] == 4 + 8
    assert real[b.players[2]] == 16 and real[b.players[-1]] == 4 + 30 + 4
    assert r["best"]["points"] >= r["ours"]["points"] > 0 and r["sets"][20] >= r["sets"][5]


def test_publish_adds_fantasy_picks(world, tmp_path):
    from cricsim.publish import publish_match
    spec = _spec(world["world"])
    roles = ["WK"] + ["BAT"] * 4 + ["AR"] * 2 + ["BOWL"] * 4
    cov = {"id": "fx", "format": "T20", "gender": "male", "venue_id": spec.venue_id, "comp_key": spec.comp_key,
           "teams": [{"name": t.name, "players": list(t.players), "roles": roles} for t in spec.teams]}
    publish_match(world["model"], cov, tmp_path, n=400)
    f = json.loads((tmp_path / "matches" / "fx.json").read_text())["fantasy"]
    assert len(f["players"]) == 22 and len(f["teams"]) == 5 and f["fielding"]
    one = f["single"]
    assert len(one["players"]) == 11 and one["captain"] in one["players"] and one["vice_captain"] in one["players"]
    assert all(f["players"][p]["name"] for p in one["players"])
    assert sum(f["players"][p]["role"] == "WK" for p in one["players"]) >= 1
    pack = json.loads((tmp_path / "matches" / "fx.pack.json").read_text())
    assert all(len(r["fielding"]) == 3 and r["role"] for r in pack["players"].values())


def test_one_day_points_table():
    from cricsim.fantasy import batting_points, bowling_points
    assert batting_points(130, 100, 10, 2, True, od=True) == 130 + 40 + 12 + 20 + 4     # 125 bonus, strike rate 130
    assert batting_points(0, 5, 0, 0, True, od=True) == -3
    assert bowling_points(60, 40, 4, 1, od=True) == 100 + 8 + 4 + 2                    # economy 4.0
    assert bowling_points(24, 40, 1, 0, od=True) == 25                                 # under 5 overs: no band


def test_publish_keeps_a_live_forecast_with_the_same_inputs(world, tmp_path, monkeypatch):
    from cricsim import publish as P
    spec = _spec(world["world"])
    cov = {"id": "fx", "format": "T20", "gender": "male", "venue_id": spec.venue_id, "comp_key": spec.comp_key,
           "title": "A v B", "teams": [{"name": t.name, "players": list(t.players)} for t in spec.teams]}
    (tmp_path / "cov" / "matches").mkdir(parents=True)
    (tmp_path / "cov" / "matches" / "fx.json").write_text(json.dumps(cov))
    P.publish_all(world["model"], tmp_path / "cov", tmp_path / "live", n=300, model_id="m1")
    live = {p.relative_to(tmp_path / "live").as_posix(): json.loads(p.read_text())
            for p in (tmp_path / "live").rglob("*.json")}
    fetch = lambda path, sites=None: json.loads(json.dumps(live[path])) if path in live else None  # noqa: E731

    calls = []
    real = P.simulate
    monkeypatch.setattr(P, "simulate", lambda *a, **k: calls.append(1) or real(*a, **k))
    cov["title"] = "A v B (XIs confirmed)"                              # details only: keep the simulations
    (tmp_path / "cov" / "matches" / "fx.json").write_text(json.dumps(cov))
    cards = P.publish_all(world["model"], tmp_path / "cov", tmp_path / "out", n=300, fetch=fetch, model_id="m1")
    doc = json.loads((tmp_path / "out" / "matches" / "fx.json").read_text())
    assert not calls and doc["summary"] == live["matches/fx.json"]["summary"] and doc["match"]["title"].endswith("confirmed)")
    assert cards[0]["win"] == live["matches/fx.json"]["summary"]["result"]["win"]

    cov["teams"][0]["players"] = cov["teams"][0]["players"][::-1]      # a different XI: simulate again
    (tmp_path / "cov" / "matches" / "fx.json").write_text(json.dumps(cov))
    P.publish_all(world["model"], tmp_path / "cov", tmp_path / "out", n=300, fetch=fetch, model_id="m1")
    assert calls == [1]
    P.publish_all(world["model"], tmp_path / "cov", tmp_path / "out", n=300, fetch=fetch, model_id="m2")  # new model
    assert calls == [1, 1]


def test_fantasy_rows_and_lab(world, tmp_path):
    """Backtest rows carry predictions, recent real form and real points; the lab scores strategies on them."""
    import json

    from cricsim.fantasy_lab import default_strategies, evaluate, report
    rep = run_backtest(world["parquet"], date(2024, 1, 1), limit=12, n_sims=100, fantasy_rows=True)
    rows = rep["fantasy_rows"]
    assert len(rows) == rep["fantasy"]["n"] > 0
    ps = rows[-1]["players"]
    assert len(ps) == 22 and max(p["real"] for p in ps) > 4 and all("dmean" in p for p in ps)
    assert any(p["n"] > 0 and p["last10"] is not None for p in ps)    # real form from earlier matches
    res = evaluate(json.loads(json.dumps(rows, default=str)), default_strategies(), min_train=4)
    n = len(rows) - 4
    assert len(res["best"]) == n and all(len(v) == n for v in res.values())
    assert all(b >= v for k, vs in res.items() if k not in ("best", "label") for v, b in zip(vs, res["best"]))
    assert "simulations (live rule)" in report(res, "t")


def test_learned_fantasy_pick_uses_recent_form(world, monkeypatch):
    """With form and learned weights, expected points follow the weights (here: all on recent form)."""
    from cricsim import fantasy
    from cricsim.engine.simulate import simulate
    from cricsim.fantasy import STACK_FEATURES, fantasy_picks, stack_features
    spec = _spec(world["world"])
    sims = simulate(world["model"], spec, n=300, seed=1)
    pids = [p for t in spec.teams for p in t.everyone]
    star = pids[-1]                                        # a tail-ender, never picked on the simulations alone
    form = {p: {"n": 10, "last5": 20.0, "last10": 20.0, "ewma": 20.0, "year": 20.0, "n_year": 10, "since": 5}
            for p in pids}
    form[star] = {**form[star], "last10": 500.0}
    w = [0.0] * len(STACK_FEATURES)
    w[STACK_FEATURES.index("last10")] = 1.0
    assert len(stack_features({"dmean": 1, "sd": 1, "p_top": 0, "win": .5, "bowl": 0, "slot": 1, "known": True,
                               **form[star]})) == len(STACK_FEATURES)
    monkeypatch.setattr(fantasy, "load_weights", lambda: {"T20": {"weights": w}})
    f = fantasy_picks(world["model"], sims, form=form)
    assert f["method"] == "simulations + recent form" and f["single"]["captain"] == star
    assert star in f["teams"][0]["players"]                # the set starts from the single pick
    monkeypatch.setattr(fantasy, "load_weights", lambda: {})
    assert fantasy_picks(world["model"], sims, form=form)["method"] == "simulations"


def test_stack_rows_and_lab(world, tmp_path):
    """Backtest rows carry win chances, players' runs/wickets predictions and real recent form; the stacking lab
    scores the simulations against learned blends on later matches."""
    import json

    from cricsim.stack_lab import TARGETS, evaluate, fit_all, report
    rep = run_backtest(world["parquet"], date(2024, 1, 1), limit=12, n_sims=100, stack_rows=True)
    rows = json.loads(json.dumps(rep["stack_rows"], default=str))
    assert len(rows) == 12 and sum(m["win"] is not None for m in rows) > 0
    bat = [r for m in rows for r in m["bat"]]
    assert bat and any(r["form"]["n"] > 0 and r["form"]["hit10"] is not None for r in bat)
    assert all(0 <= r["p30"] <= 1 for r in bat) and any(m["bowl"] for m in rows)
    assert all(len(r["x"]) == len(bat[0]["x"]) and np.isfinite(list(r["x"].values())).all() for r in bat)
    assert any(r["x"]["known"] and r["x"]["avg"] > 0 for r in bat)          # a record from earlier matches
    assert all("bat_avg_d" in m["win"]["x"] for m in rows if m["win"])
    rows[5]["win"] = None                                  # a no-result match has no win-chance row
    for name, spec in TARGETS.items():
        res = evaluate(rows, name, spec, min_train=4, refit=2)
        assert res["_n"] and all(len(v[m]) == len(res["_n"]) for k, v in res.items() if k != "_n" for m in v)
        assert "simulations (live)" in report(res, name, spec["kind"])
        assert "direct (linear)" in res and "blend: simulations + direct (boosted trees)" in res
        w = fit_all(rows, spec)
        assert all(len(v["weights"]) == len(v["columns"]) for v in w.values() if isinstance(v, dict) and "columns" in v)
        assert len(w["direct (linear)"]["weights"]) == len(w["direct_inputs"]) + 1


def test_bowling_form_for_a_fixture_matches_the_full_history(world):
    """resolve reads only the fixture's players' wickets: the same form as from everyone's history."""
    from datetime import date as _date

    from cricsim.fantasy_history import build_stats, form
    con = duckdb.connect()
    full = build_stats(con, world["parquet"], "T20")
    pid = next(p for p in full["wkts"].dates if len(full["wkts"].dates[p]) > 3)
    some = build_stats(con, world["parquet"], "T20", players={pid})
    day = _date(2030, 1, 1)
    assert form(some["wkts"], pid, day, hit=2) == form(full["wkts"], pid, day, hit=2)
    assert set(some["wkts"].dates) == {pid}


def test_fantasy_teams_table(world):
    """Many teams from simulated match stories: every team has one captain and one vice-captain, eleven players."""
    from cricsim.fantasy_teams import markdown, teams
    spec = _spec(world["world"])
    cov = {"id": "t", "title": "A v B", "format": "T20", "gender": "male", "comp_key": spec.comp_key,
           "venue_id": spec.venue_id, "teams": [{"name": t.name, "players": list(t.players)} for t in spec.teams]}
    fixture = {"teams": [{"players": [f"Player {p}" for p in t.players]} for t in spec.teams]}
    res = teams(world["model"], cov, n_teams=20, n_sims=300, fixture=fixture)
    assert sum(r["captain"] for r in res["rows"]) == 20 == sum(r["vice_captain"] for r in res["rows"])
    assert sum(r["in_xi"] for r in res["rows"]) == 20 * 11
    assert abs(sum(r["top_scorer"] for r in res["rows"]) - 100) < 1
    assert res["rows"][0]["player"].startswith("Player ") and "| captain |" in markdown(res)
