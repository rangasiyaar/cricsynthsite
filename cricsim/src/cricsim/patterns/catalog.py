"""The pattern catalog: cricket folklore and analyst hunches, stated as testable comparisons.

Each pattern compares "exposed" balls with comparable unexposed balls inside the
same situation strata (format, gender, innings, stage of innings, wickets down,
how set the batter is …). A pattern never controls for the thing it is about
— e.g. the new-batter pattern drops the set-ness strata.

Fields
    population  SQL filter for the balls being compared (exposed + controls)
    exposed     SQL boolean: the pattern is "on" for this ball
    outcome     wicket | bowler_wicket | boundary | six | dot | wide
    folklore    the direction people expect: "up" or "down" (relative to comparable balls)
    strata      situation columns held equal
    needs       "attributes" if batting hand / bowling style data is required
"""
from __future__ import annotations

from dataclasses import dataclass, field

STRATA = ("format", "gender", "innings_no", "phase_bucket", "wk_bucket", "set_bucket")
NO_SET = ("format", "gender", "innings_no", "phase_bucket", "wk_bucket")
NO_PHASE = ("format", "gender", "innings_no", "wk_bucket", "set_bucket")
LEGAL = "is_legal"


@dataclass(frozen=True)
class Pattern:
    id: str
    title: str
    question: str
    exposed: str
    outcome: str = "wicket"
    folklore: str = "up"
    population: str = LEGAL
    strata: tuple[str, ...] = STRATA
    category: str = "wicket timing"
    needs: str | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)


CATALOG: list[Pattern] = [
    # ── the six you asked about ───────────────────────────────────────────────
    Pattern("spell_first_ball", "First ball of a new spell",
            "Is a bowler more likely to strike with the first ball of a new spell?",
            exposed="spell_first_ball", population=f"{LEGAL} AND spell_start IS NOT NULL"),
    Pattern("after_six_batter", "Batter out straight after hitting a six",
            "After a batter hits a six, is he more likely to get out next ball?",
            exposed="batter_prev_six", population=f"{LEGAL} AND batter_prev_six IS NOT NULL"),
    Pattern("after_six_bowler", "Bowler strikes back after conceding a six",
            "After a bowler concedes a six, is his next ball more likely to take a wicket?",
            exposed="bowler_prev_six", population=f"{LEGAL} AND bowler_prev_six IS NOT NULL"),
    Pattern("new_batter_first5", "New batter in his first 5 balls",
            "Are new batters more likely to fall in their first 5 balls than once they have faced 5–29?",
            exposed="batter_balls_before < 5", population=f"{LEGAL} AND batter_balls_before < 30",
            strata=NO_SET),
    Pattern("after_powerplay", "First over after the powerplay",
            "Do wickets come just after fielding restrictions are lifted?",
            exposed='"over" = pp_overs',
            population=f'{LEGAL} AND "over" BETWEEN pp_overs - 2 AND pp_overs + 2', strata=NO_PHASE),
    Pattern("bowler_change_partnership", "Bowling change breaks a set partnership",
            "When a partnership has lasted 24+ balls, does a new spell break it?",
            exposed="spell_start", population=f"{LEGAL} AND part_balls >= 24 AND spell_start IS NOT NULL"),
    Pattern("left_arm_pace_rhb_early", "Left-arm pace v right-handers early",
            "Early on, do right-handers fall more often to left-arm pace than to right-arm pace?",
            exposed="bowling_arm = 'left'",
            population=f"{LEGAL} AND batting_hand = 'right' AND bowling_kind = 'pace' AND \"over\" < pp_overs",
            category="matchups", needs="attributes"),

    # ── pressure ─────────────────────────────────────────────────────────────
    Pattern("dots_3", "After 3+ dot balls in a row", "Does dot-ball pressure bring wickets?",
            exposed="dots_before >= 3", category="pressure"),
    Pattern("dots_5", "After 5+ dot balls in a row", "Does sustained dot-ball pressure bring wickets?",
            exposed="dots_before >= 5", category="pressure"),
    Pattern("stuck_on_zero", "Batter stuck on 0 after 3+ balls", "Is a batter still on 0 after 3 balls in danger?",
            exposed="batter_runs_before = 0 AND batter_balls_before >= 3",
            # same balls faced, 0 runs v some runs — so it isn't just the new-batter effect again
            population=f"{LEGAL} AND batter_balls_before BETWEEN 3 AND 15", category="pressure"),
    Pattern("steep_chase", "Chasing at 10+ an over", "Does a steep required rate cause wickets?",
            exposed="rrr >= 10", population=f"{LEGAL} AND innings_no = 2 AND rrr IS NOT NULL", category="pressure"),
    Pattern("easy_chase", "Chasing at under 6 an over", "Do batters play safer in an easy chase?",
            exposed="rrr < 6", folklore="down", population=f"{LEGAL} AND innings_no = 2 AND rrr IS NOT NULL",
            category="pressure"),

    # ── momentum & clustering ────────────────────────────────────────────────
    Pattern("wickets_in_pairs", "Wickets come in pairs", "Is a wicket more likely within 12 balls of the last one?",
            exposed="wkts_last12 >= 1", category="momentum"),
    Pattern("collapse", "Collapse in progress (2+ wickets in 18 balls)",
            "Once two wickets have fallen quickly, does a collapse continue?",
            exposed="wkts_last18 >= 2", category="momentum"),
    Pattern("after_two_boundaries", "Batter out after back-to-back boundaries",
            "After two boundaries in a row, is the batter more likely to get out?",
            exposed="batter_prev_boundary AND batter_prev2_boundary",
            population=f"{LEGAL} AND batter_prev2_boundary IS NOT NULL", category="momentum"),
    Pattern("long_partnership", "Partnership of 36+ balls", "Do long partnerships get harder to break?",
            exposed="part_balls >= 36", folklore="down", population=LEGAL, category="partnerships"),

    # ── milestones ───────────────────────────────────────────────────────────
    Pattern("nervous_40s", "Batter in the 40s", "Do batters get out more in the 40s, approaching a fifty?",
            exposed="batter_runs_before BETWEEN 40 AND 49",
            population=f"{LEGAL} AND batter_runs_before BETWEEN 30 AND 59", category="milestones"),
    Pattern("after_fifty", "Just after reaching fifty", "Do batters relax and get out just after reaching 50?",
            exposed="batter_runs_before BETWEEN 50 AND 55",
            population=f"{LEGAL} AND batter_runs_before BETWEEN 44 AND 61", category="milestones"),

    # ── bowling ──────────────────────────────────────────────────────────────
    Pattern("new_bowler_first_over", "Bowler's first over of the match", "Does a new bowler strike in his first over?",
            exposed="bowler_first_over", population=f"{LEGAL} AND bowler_first_over IS NOT NULL", category="bowling"),
    Pattern("bowler_last_over_t20", "Bowler's 4th (last) over in a T20", "Is a bowler more dangerous — or tired — in his final over?",
            exposed="bowler_overs_before = 3", folklore="down",
            population=f"{LEGAL} AND format = 'T20' AND bowler_overs_before IS NOT NULL", category="bowling"),
    Pattern("after_wide", "Ball after a wide", "Does a bowler who has just bowled a wide lose rhythm?",
            exposed="prev_wides > 0", folklore="down", population=f"{LEGAL} AND prev_wides IS NOT NULL",
            category="bowling"),
    Pattern("free_hit_sanity", "Free hit (sanity check)", "Free hits can only produce run-outs — bowler wickets should be ~0.",
            exposed="free_hit", outcome="bowler_wicket", folklore="down",
            population=f"{LEGAL} AND free_hit IS NOT NULL", category="sanity check"),

    # ── position in the over ─────────────────────────────────────────────────
    Pattern("first_ball_of_over", "First ball of an over", "Is the first ball of an over more dangerous?",
            exposed="legal_ball_in_over = 1", category="over position"),
    Pattern("last_ball_of_over", "Last ball of an over", "Do batters take risks on the last ball (strike, run-outs)?",
            exposed="legal_ball_in_over = balls_per_over", category="over position"),

    # ── scoring patterns (for the simulator, not just wickets) ───────────────
    Pattern("release_boundary", "Boundary after 3+ dots", "Do batters release pressure with a boundary?",
            exposed="dots_before >= 3", outcome="boundary", category="scoring"),
    Pattern("boundary_momentum", "Boundary after a boundary", "Does a boundary make the next one more likely?",
            exposed="batter_prev_boundary", outcome="boundary", population=f"{LEGAL} AND batter_prev_boundary IS NOT NULL",
            category="scoring"),
    Pattern("six_after_six", "Six after a six", "Does a six make another six more likely?",
            exposed="batter_prev_six", outcome="six", population=f"{LEGAL} AND batter_prev_six IS NOT NULL",
            category="scoring"),
    Pattern("new_batter_scoring", "New batter's boundary rate", "Do new batters hit fewer boundaries in their first 5 balls?",
            exposed="batter_balls_before < 5", outcome="boundary", folklore="down",
            population=f"{LEGAL} AND batter_balls_before < 30", strata=NO_SET, category="scoring"),

    # ── extras ───────────────────────────────────────────────────────────────
    Pattern("wides_new_spell", "Wides in a spell's first over", "Do bowlers bowl more wides when starting a spell?",
            exposed="spell_start", outcome="wide", population="spell_start IS NOT NULL", category="extras"),
    Pattern("wides_death", "Wides at the death", "Do wides rise in the last 20% of the innings?",
            exposed="phase_bucket >= 8", outcome="wide", population="TRUE", strata=NO_PHASE, category="extras"),

    # ── matchups needing batting-hand / bowling-style data ───────────────────
    Pattern("offspin_v_lhb", "Off-spin v left-handers", "Do left-handers fall more often to off-spin than right-handers do?",
            exposed="batting_hand = 'left'",
            population=f"{LEGAL} AND bowling_kind = 'off_spin' AND batting_hand IS NOT NULL",
            category="matchups", needs="attributes"),
    Pattern("mixed_hand_partnership", "Left–right batting pair", "Is a left/right pair harder to dismiss?",
            exposed="batting_hand <> non_striker_hand", folklore="down",
            population=f"{LEGAL} AND batting_hand IS NOT NULL AND non_striker_hand IS NOT NULL",
            category="matchups", needs="attributes"),
]

OUTCOMES = {
    "wicket": "is_wicket",
    "bowler_wicket": "is_bowler_wicket",
    "boundary": "is_boundary",
    "six": "is_six",
    "dot": "is_dot",
    "wide": "wides > 0",
}
