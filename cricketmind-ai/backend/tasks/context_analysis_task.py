"""CricVeda AI 1.0 — Task: Context Analysis

Defines the task for Agent 2 (Context Analyzer) to analyze
all external factors influencing the match.
"""

from crewai import Task


def create_context_analysis_task(agent, match_context: str) -> Task:
    """Create the context analysis task.

    Args:
        agent: The Context Analyzer agent.
        match_context: Match metadata and venue/weather info.

    Returns:
        CrewAI Task object.
    """
    return Task(
        description=f"""
Analyze all contextual factors for this upcoming cricket match and produce
a comprehensive context report that will help predict player performance.

## Match Information:
{match_context}

## Analyze These Factors:

1. **Pitch Assessment**: Based on the venue and historical data, classify the pitch:
   - Batting-friendly / Bowling-friendly / Balanced / Spin-friendly / Pace-friendly
   - Expected scoring range (projected first innings total)
   - How the pitch might change as the match progresses

2. **Weather Impact**:
   - Temperature and its effect on player stamina
   - Humidity and its effect on swing/spin
   - Dew factor (especially for evening/night matches)
   - Rain probability and its impact

3. **Venue History**:
   - Average scores at this ground (both innings)
   - Does batting first or second have an advantage?
   - Which types of players tend to dominate here? (pace/spin/batting)

4. **Match Format Considerations**:
   - Adjust expectations based on T20/ODI/Test format
   - Powerplay vs middle overs vs death overs dynamics

5. **Team Dynamics**:
   - Current form of both teams
   - Head-to-head record at this venue
   - Any player matchups to watch

## Output Format:
Provide a structured context report with clear sections for each factor,
and a summary of how these conditions affect different player types.
""",
        expected_output="""
A comprehensive match context report containing:
- Pitch classification with reasoning
- Weather impact assessment
- Venue scoring history and trends
- Key factors that will boost or hinder specific player types
- Summary of conditions favoring batsmen vs bowlers
""",
        agent=agent,
    )
