"""CricketMind AI — CrewAI Pipeline Configuration

Configures the LLM engines and the multi-agent crew
for the prediction pipeline.
"""

import os
from crewai import Crew, Process
from langchain_google_genai import ChatGoogleGenerativeAI

from agents.data_collector import create_data_collector_agent
from agents.context_analyzer import create_context_analyzer_agent
from agents.predictor import create_predictor_agent
from agents.ranker import create_ranker_agent
from utils.config import GEMINI_API_KEY, GROQ_API_KEY, MAX_LLM_RETRIES
from utils.logger import get_logger

logger = get_logger(__name__)


def get_primary_llm():
    """Get the primary LLM (Google Gemini 2.5 Flash)."""
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, using fallback LLM")
        return get_fallback_llm()

    os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY

    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=GEMINI_API_KEY,
        temperature=0.3,
        max_output_tokens=8192,
    )


def get_fallback_llm():
    """Get fallback LLM (Groq Llama 3.3 70B)."""
    if not GROQ_API_KEY:
        raise ValueError(
            "Neither GEMINI_API_KEY nor GROQ_API_KEY is set. "
            "Please set at least one API key in your .env file."
        )

    os.environ["GROQ_API_KEY"] = GROQ_API_KEY

    # Use Groq via LangChain
    from langchain_groq import ChatGroq

    return ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=GROQ_API_KEY,
        temperature=0.3,
        max_tokens=8192,
    )


def get_llm_with_fallback():
    """Get LLM with automatic fallback chain."""
    try:
        llm = get_primary_llm()
        logger.info("Using primary LLM: Gemini 2.5 Flash")
        return llm
    except Exception as e:
        logger.warning("Primary LLM failed: %s. Trying fallback...", e)
        try:
            llm = get_fallback_llm()
            logger.info("Using fallback LLM: Groq Llama 3.3 70B")
            return llm
        except Exception as e2:
            logger.error("All LLMs failed: %s", e2)
            raise


def create_prediction_crew(
    player_data_summary: str,
    match_context: str,
    match_id: str,
    match_name: str,
    match_format: str,
    venue: str,
    date: str,
) -> Crew:
    """Create the full prediction crew with all 4 agents.

    Args:
        player_data_summary: Formatted player stats string.
        match_context: Formatted match context string.
        match_id: Match identifier.
        match_name: Match name (e.g., "India vs Australia").
        match_format: T20I, ODI, Test, etc.
        venue: Venue name.
        date: Match date string.

    Returns:
        Configured CrewAI Crew ready to execute.
    """
    from tasks.data_collection_task import create_data_collection_task
    from tasks.context_analysis_task import create_context_analysis_task
    from tasks.prediction_task import create_prediction_task
    from tasks.ranking_task import create_ranking_task

    llm = get_llm_with_fallback()

    # Create agents
    data_collector = create_data_collector_agent(llm)
    context_analyzer = create_context_analyzer_agent(llm)
    predictor = create_predictor_agent(llm)
    ranker = create_ranker_agent(llm)

    # Create tasks (sequential pipeline)
    task1 = create_data_collection_task(data_collector, player_data_summary)
    task2 = create_context_analysis_task(context_analyzer, match_context)
    task3 = create_prediction_task(predictor)
    task4 = create_ranking_task(ranker, match_id, match_name, match_format, venue, date)

    # Build crew
    crew = Crew(
        agents=[data_collector, context_analyzer, predictor, ranker],
        tasks=[task1, task2, task3, task4],
        process=Process.sequential,
        verbose=True,
        max_rpm=30,  # Rate limit for LLM calls
    )

    logger.info(
        "Created prediction crew for %s with %d agents and %d tasks",
        match_name,
        len(crew.agents),
        len(crew.tasks),
    )
    return crew
