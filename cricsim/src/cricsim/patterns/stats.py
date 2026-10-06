"""Statistics for the Pattern Lab.

Effect size: Mantel–Haenszel risk ratio across situation strata — the outcome
rate on exposed balls relative to comparable unexposed balls *in the same
situation*, pooled over situations. Confidence interval from the
Greenland–Robins variance. Multiple testing: Benjamini–Hochberg.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class Effect:
    rr: float | None              # risk ratio (exposed v comparable unexposed)
    lo: float | None
    hi: float | None
    p: float | None
    exposed_balls: int
    exposed_events: int
    expected_events: float        # what the exposed balls "should" have produced, situation-for-situation

    @property
    def exposed_rate(self) -> float:
        return self.exposed_events / self.exposed_balls if self.exposed_balls else float("nan")

    @property
    def expected_rate(self) -> float:
        return self.expected_events / self.exposed_balls if self.exposed_balls else float("nan")


def mantel_haenszel(strata: list[tuple[int, int, int, int]]) -> Effect:
    """strata: (a, n1, b, n0) = exposed events, exposed balls, unexposed events, unexposed balls."""
    R = S = V = expected = 0.0
    a_tot = n1_tot = 0
    for a, n1, b, n0 in strata:
        if n1 == 0 or n0 == 0:
            continue
        N = n1 + n0
        R += a * n0 / N
        S += b * n1 / N
        V += (n1 * n0 * (a + b) - a * b * N) / (N * N)
        expected += n1 * b / n0
        a_tot += a
        n1_tot += n1
    if R == 0 or S == 0:
        rr = 0.0 if (R == 0 and S > 0) else None
        return Effect(rr, None, None, None, n1_tot, a_tot, expected)
    rr = R / S
    se = math.sqrt(V / (R * S)) if V > 0 else 0.0
    if se == 0:
        return Effect(rr, rr, rr, None, n1_tot, a_tot, expected)
    z = math.log(rr) / se
    p = math.erfc(abs(z) / math.sqrt(2))
    return Effect(rr, math.exp(math.log(rr) - 1.96 * se), math.exp(math.log(rr) + 1.96 * se), p,
                  n1_tot, a_tot, expected)


def benjamini_hochberg(pvalues: list[float | None]) -> list[float | None]:
    """Adjusted q-values; None stays None."""
    idx = [i for i, p in enumerate(pvalues) if p is not None]
    m = len(idx)
    q: list[float | None] = [None] * len(pvalues)
    running = 1.0
    for rank, i in reversed(list(enumerate(sorted(idx, key=lambda i: pvalues[i]), start=1))):
        running = min(running, pvalues[i] * m / rank)
        q[i] = running
    return q


# Verdict thresholds
MIN_EXPOSED_BALLS = 500
MIN_EVENTS = 30
MEANINGFUL = 0.05          # an effect must move the rate by at least 5% to count as real
NULL_BAND = (0.92, 1.087)  # a confident "no meaningful effect" CI must sit inside this band


def verdict(folklore: str, disc: Effect, valid: Effect, full: Effect, q_disc: float | None) -> tuple[str, str]:
    """(verdict, explanation). verdict ∈ real · reversed · weak · myth · inconclusive · insufficient data."""
    for e in (disc, valid):
        if e.exposed_balls < MIN_EXPOSED_BALLS or e.exposed_events + e.expected_events < MIN_EVENTS:
            return "insufficient data", "Too few exposed balls or events in one of the two periods."
    if disc.rr is None or valid.rr is None or full.rr is None:
        return "insufficient data", "No comparable balls."

    up = folklore == "up"
    disc_sig = q_disc is not None and q_disc < 0.05
    valid_excludes_1 = valid.lo is not None and (valid.lo > 1 or valid.hi < 1)
    same_dir = (disc.rr > 1) == (valid.rr > 1)
    size_ok = abs(full.rr - 1) >= MEANINGFUL

    if disc_sig and valid_excludes_1 and same_dir and size_ok:
        agrees = (full.rr > 1) == up
        return ("real", "Holds in both periods, in the direction people expect.") if agrees else \
               ("reversed", "Holds in both periods — but the opposite way to the folklore.")
    if full.lo is not None and NULL_BAND[0] <= full.lo and full.hi <= NULL_BAND[1]:
        return "myth", "Measured precisely and there is no meaningful effect."
    if disc_sig or valid_excludes_1:
        return "weak", "Shows up in one period but not convincingly in both, or the effect is tiny."
    return "inconclusive", "Not enough evidence either way."
