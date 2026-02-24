"""CricketMind AI — Task: Performance Prediction

Defines the task for Agent 3 (Predictor) to predict individual
player performance and calculate fantasy points.
"""

from crewai import Task


SCORING_RULES = """
FANTASY SCORING SYSTEM:
━━━━━━━━━━━━━━━━━━━━━━
BATTING: +1/run, +1 bonus/four, +2 bonus/six, +4 for 30 runs, +8 for 50, +16 for 100, -2 for duck
BOWLING: +25/wicket, +4 for 3W haul, +8 for 5W haul, +12/maiden
ECONOMY: <5 = +6, 5-6 = +4, 6-7 = +2, 10-11 = -2, 11-12 = -4, >12 = -6 (min 2 overs)
FIELDING: +8/catch, +12/stumping, +12/direct runout, +6/indirect runout
BONUS: +25 for Man of Match
"""


def create_prediction_task(agent, scoring_rules: str = SCORING_RULES) -> Task:
    """Create the performance prediction task.

    Args:
        agent: The Predictor agent.
        scoring_rules: Fantasy scoring system description.

    Returns:
        CrewAI Task object.
    """
    return Task(
        description=f"""
Using the player data from Agent 1 and the match context from Agent 2,
predict the performance of ALL 22 players in this match.

{scoring_rules}

## For EACH of the 22 players, predict:

1. **Predicted Runs**: Estimated runs scored (0 for pure bowlers is acceptable)
2. **Predicted Wickets**: Estimated wickets taken (0 for pure batsmen)
3. **Predicted Catches**: Estimated catches (1 for most fielders, 2+ for keeper)
4. **Batting Fantasy Points**: Calculate using the scoring system above
5. **Bowling Fantasy Points**: Calculate using the scoring system above
6. **Fielding Fantasy Points**: Calculate using the scoring system above
7. **Total Predicted Fantasy Points**: Sum of all categories
8. **Confidence Level**: HIGH / MEDIUM / LOW
   - HIGH: Strong data, consistent player, predictable conditions
   - MEDIUM: Decent data, some variability in performance
   - LOW: Limited data, unpredictable player, or volatile conditions
9. **Key Reason**: One sentence explaining the prediction

## Prediction Guidelines:
- Base predictions on career stats ADJUSTED by:
  a) Recent form (weight last 5 matches heavily)
  b) Venue performance (boost/reduce based on ground history)
  c) Opposition strength (strong vs weak bowling/batting)
  d) Match context (pitch, weather, format)
- Be realistic: Not everyone scores 50+ or takes 3+ wickets
- T20: Top batsmen aim 25-50 runs, bowlers aim 1-2 wickets
- ODI: Top batsmen aim 40-80 runs, bowlers aim 2-3 wickets
- Consider batting order impact (openers vs middle order vs lower)

## Output Format:
Provide predictions for ALL 22 players in a structured format with
all the fields listed above.
""",
        expected_output="""
Predictions for all 22 players, each containing:
- player_name, team, role
- predicted_runs, predicted_wickets, predicted_catches
- predicted_batting_points, predicted_bowling_points, predicted_fielding_points
- total_predicted_fantasy_points
- confidence (High/Medium/Low)
- key_reason (one sentence)
""",
        agent=agent,
    )
