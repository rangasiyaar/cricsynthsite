"""CricSynthesis simulation engine (v3).

    fit.py       Parquet → Model (ball-outcome factors, player ratings, usage, dismissal kinds)
    model.py     Model container, save/load, per-match tables
    states.py    situation buckets shared by fitting and simulation (one definition, no drift)
    simulate.py  vectorised Monte Carlo with per-iteration event logs
    summary.py   simulations → match-centre outputs
    spec.py      MatchSpec / Scenario inputs
"""
