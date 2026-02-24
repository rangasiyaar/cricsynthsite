"""CricketMind AI — Global Configuration"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
PREDICTIONS_DIR = BASE_DIR / "output" / "predictions"
CACHE_DIR = BASE_DIR / "data" / "cache"
DB_PATH = BASE_DIR / "database" / "predictions.db"

# Ensure directories exist
PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
CRICDATA_API_KEY = os.getenv("CRICDATA_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# LLM Configuration
LLM_PRIMARY = "gemini/gemini-2.5-flash"
LLM_FALLBACK = "groq/llama-3.3-70b-versatile"
MAX_LLM_RETRIES = int(os.getenv("MAX_LLM_RETRIES", "3"))

# Data Configuration
PREDICTION_CACHE_HOURS = int(os.getenv("PREDICTION_CACHE_HOURS", "6"))
CRICDATA_BASE_URL = "https://api.cricapi.com/v1"
ESPN_DELAY_SECONDS = 2

# ESPN Public API — League IDs (no API key needed)
ESPN_LEAGUE_IDS = {
    "international": "8039",
    "ipl": "8048",
    "bbl": "8044",
    "psl": "8038",
    "cpl": "8049",
    "t20_blast": "8051",
    "the_hundred": "8171",
    "sa20": "8198",
    "bpl": "8131",
    "lpl": "8173",
}

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
