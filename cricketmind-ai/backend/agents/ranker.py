"""CricVeda AI 1.0 — Agent 4: Final Ranker

Specialized AI agent that compiles all predictions into a final
ranked list (#1-#22) with Captain/VC picks and value analysis.
"""

from crewai import Agent


def create_ranker_agent(llm) -> Agent:
    """Create the Final Ranker agent.

    This agent is responsible for:
    - Ranking all 22 players from #1 to #22
    - Selecting Captain and Vice-Captain picks
    - Identifying value picks (undervalued players)
    - Flagging risky picks (inconsistent players)
    - Producing the final structured JSON output
    """
    return Agent(
        role="Fantasy Cricket Ranking Expert",
        goal=(
            "Compile all player predictions and match context into a final, "
            "definitive ranking of all 22 players from #1 (highest predicted "
            "fantasy points) to #22 (lowest). Select the optimal Captain pick "
            "(2x multiplier) and Vice-Captain pick (1.5x multiplier). Identify "
            "3 value picks and 2 risky picks. Output everything as a structured "
            "JSON object matching the required schema."
        ),
        backstory=(
            "You are a fantasy cricket legend — a 5-time Dream11 Mega Contest "
            "winner who has turned player analysis into an art form. You don't "
            "just look at raw predicted points; you factor in ceiling vs floor, "
            "ownership percentage, differential picks, and risk-reward balance. "
            "Your Captain picks hit at a 38% success rate (top 3 in actuals), "
            "which is industry-leading. You know that the best fantasy teams "
            "aren't just about picking the most obvious stars — it's about "
            "finding the right balance of safe picks and differentials. Your "
            "rankings always include clear, data-backed reasoning that any "
            "cricket fan can understand."
        ),
        verbose=True,
        allow_delegation=False,
        llm=llm,
    )
