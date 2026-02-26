"""CricVeda AI 1.0 — Task: Data Collection

Defines the task for Agent 1 (Data Collector) to gather
and structure player statistics for all 22 players.
"""

from crewai import Task


def create_data_collection_task(agent, player_data_summary: str) -> Task:
    """Create the data collection task.

    Args:
        agent: The Data Collector agent.
        player_data_summary: Pre-fetched player data as a formatted string.

    Returns:
        CrewAI Task object.
    """
    return Task(
        description=f"""
You are given pre-fetched data for all 22 players in an upcoming cricket match.
Your job is to validate, structure, and summarize this data into a clear,
comprehensive table format that downstream agents can use.

## Player Data:
{player_data_summary}

## Your Task:
1. For each player, confirm the following data points are present:
   - Name, Team, Role (Batsman/Bowler/All-rounder/WK-Batsman)
   - Batting: Matches, Innings, Runs, Average, Strike Rate, 50s, 100s
   - Bowling: Wickets, Average, Economy, Best Figures
   - Recent Form: Scores and wickets from last 5 matches
   - Fielding: Catches (estimate if not available)

2. Flag any players with missing or incomplete data.

3. For each player, assign a "data confidence" rating:
   - HIGH: All major stats available
   - MEDIUM: Some stats missing but enough for prediction
   - LOW: Significant data gaps

4. Output a structured summary of all 22 players in a clear tabular format.
""",
        expected_output="""
A structured summary of all 22 players with:
- Complete stat profiles for each player
- Data confidence ratings (HIGH/MEDIUM/LOW)
- Any flags for missing data or anomalies
- Players grouped by team
""",
        agent=agent,
    )
