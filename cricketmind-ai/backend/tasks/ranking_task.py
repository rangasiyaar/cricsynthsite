"""CricVeda AI 1.0 — Task: Final Ranking

Defines the task for Agent 4 (Final Ranker) to compile all
predictions into a ranked JSON output with Captain/VC picks.
"""

from crewai import Task


def create_ranking_task(agent, match_id: str, match_name: str, match_format: str, venue: str, date: str) -> Task:
    """Create the final ranking task.

    Args:
        agent: The Ranker agent.
        match_id: Unique match identifier.
        match_name: Match name (e.g., "India vs Australia").
        match_format: T20I, ODI, Test, etc.
        venue: Venue name.
        date: Match date string.

    Returns:
        CrewAI Task object.
    """
    return Task(
        description=f"""
Using ALL the data, context, and predictions from the previous agents,
produce the FINAL ranked output for this match.

Match: {match_name}
Match ID: {match_id}
Format: {match_format}
Venue: {venue}
Date: {date}

## Your Task:

1. **RANK all 22 players** from #1 (highest total_predicted_fantasy_points)
   to #22 (lowest). Break ties using confidence level (High > Medium > Low).

2. **Select CAPTAIN PICK**: The player you recommend as Captain (2x multiplier).
   - Must be a High confidence prediction
   - Should have the highest expected points
   - Provide clear reasoning

3. **Select VICE-CAPTAIN PICK**: The player you recommend as Vice-Captain (1.5x).
   - Second-highest expected points with High confidence
   - Provide clear reasoning

4. **Identify TOP 3 VALUE PICKS**: Players who are likely undervalued but could
   deliver strong points. These are typically:
   - All-rounders who contribute in multiple areas
   - Players with strong venue records but low ownership
   - In-form players who haven't been in the spotlight

5. **Identify TOP 2 RISKY PICKS**: Players to AVOID or be cautious with:
   - Inconsistent recent form
   - Poor venue/opposition record
   - Coming back from injury

6. **Output must be valid JSON** matching this exact schema:

```json
{{
    "match_id": "{match_id}",
    "match": "{match_name}",
    "format": "{match_format}",
    "venue": "{venue}",
    "date": "{date}",
    "prediction_generated_at": "<current UTC timestamp>",
    "pitch_assessment": "<from context analysis>",
    "weather": "<from context analysis>",
    "rankings": [
        {{
            "rank": 1,
            "player_name": "<name>",
            "team": "<team>",
            "role": "<role>",
            "predicted_fantasy_points": <number>,
            "predicted_runs": <number>,
            "predicted_wickets": <number>,
            "predicted_catches": <number>,
            "confidence": "<High|Medium|Low>",
            "form_rating": <1.0-10.0>,
            "key_reason": "<one sentence>"
        }}
        // ... all 22 players
    ],
    "captain_pick": {{
        "player": "<name>",
        "reason": "<reasoning>"
    }},
    "vice_captain_pick": {{
        "player": "<name>",
        "reason": "<reasoning>"
    }},
    "top_value_picks": [
        {{"player": "<name>", "reason": "<reasoning>"}}
    ],
    "risky_picks": [
        {{"player": "<name>", "reason": "<reasoning>"}}
    ]
}}
```

CRITICAL: Output ONLY the JSON object. No markdown, no code blocks, no explanation.
Just pure valid JSON.
""",
        expected_output="""
A valid JSON object containing:
- match metadata (match_id, match, format, venue, date)
- rankings array with all 22 players ranked #1 to #22
- captain_pick and vice_captain_pick objects
- top_value_picks array (3 players)
- risky_picks array (2 players)
""",
        agent=agent,
    )
