"""The bowlers' blend: the tilt hits its targets, and a summary is adjusted consistently (or left alone)."""
import numpy as np

from cricsim import stack


def test_tilt_hits_mean_and_two_plus():
    pmf = np.array([0.35, 0.33, 0.19, 0.09, 0.03, 0.01])
    q = stack.tilt(pmf, mean=1.4, p2=0.42)
    assert abs(q.sum() - 1) < 1e-9 and (q >= 0).all()
    assert abs(q @ np.arange(6) - 1.4) < 1e-3 and abs(q[2:].sum() - 0.42) < 1e-3
    same = stack.tilt(pmf, mean=float(pmf @ np.arange(6)), p2=float(pmf[2:].sum()))
    assert np.allclose(same, pmf, atol=1e-4)                # targets equal to the sims: nothing changes


def _summary():
    bowling = {"p_bowls": 0.9, "overs": 3.6, "wickets": {"mean": 1.08, "q": {"50": 1.0}},
               "p_wickets": {"1": 0.63, "2": 0.30, "3": 0.12, "4": 0.03, "5": 0.01}}
    return {"teams": [{"players": [{"id": "b1", "bowling": dict(bowling)}, {"id": "bat", "batting": {}}]}]}


def _weights(shift):
    # mean: intercept + 1·(sim mean) ; 2+: intercept + 1·logit(sim 2+) -> only the intercepts move the forecast
    return {"T20": {stack.MEAN[0]: {stack.MEAN[1]: {"columns": [0, 1, 2, 3, 4, 5, 6], "weights": [shift, 1, 0, 0, 0, 0, 0]}},
                    stack.P2[0]: {stack.P2[1]: {"columns": [0, 1, 2, 4, 5], "weights": [shift, 1, 0, 0, 0]}}}}


FORM = {"b1": {"n": 12, "last5": 2.0, "last10": 1.8, "ewma": 1.9, "year": 1.7, "n_year": 10, "since": 6, "hit10": 0.6}}


def test_adjust_bowlers_moves_every_wicket_number_together(monkeypatch):
    monkeypatch.setattr(stack, "load_weights", lambda: _weights(0.3))
    s = _summary()
    assert stack.adjust_bowlers(s, FORM, "T20", 6) == 1
    bw = s["teams"][0]["players"][0]["bowling"]
    assert bw["method"] == "simulations + recent wickets"
    assert bw["wickets"]["mean"] > 1.08 and bw["p_wickets"]["2"] > 0.30      # pushed up by the positive intercepts
    p = [bw["p_wickets"][str(j)] for j in range(1, 6)]
    assert all(a >= b for a, b in zip(p, p[1:])) and p[0] <= bw["p_bowls"]   # still a proper distribution
    assert stack.families() == {"T20"}


def test_adjust_bowlers_needs_weights_form_and_format(monkeypatch):
    monkeypatch.setattr(stack, "load_weights", lambda: _weights(0.3))
    for form, fmt in ((None, "T20"), (FORM, "OD"), ({}, "T20")):
        s = _summary()
        assert stack.adjust_bowlers(s, form, fmt, 6) == 0
        assert s == _summary()
    monkeypatch.setattr(stack, "load_weights", lambda: {})
    assert stack.adjust_bowlers(_summary(), FORM, "T20", 6) == 0 and stack.families() == set()
