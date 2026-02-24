"""CricketMind AI — Global Configuration"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
PREDICTIONS_DIR = BASE_DIR / "output" / "predictions"
CACHE_DIR = BASE_DIR / "data" / "cache"
DB_PATH = BASE_DIR / "database" / "predictions.db"

PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SPORTMONKS_API_KEY = os.getenv("SPORTMONKS_API_KEY", "")

# LLM Configuration
LLM_PRIMARY = "gemini/gemini-2.5-flash"
LLM_FALLBACK = "groq/llama-3.3-70b-versatile"
MAX_LLM_RETRIES = int(os.getenv("MAX_LLM_RETRIES", "3"))

# Data Configuration
PREDICTION_CACHE_HOURS = int(os.getenv("PREDICTION_CACHE_HOURS", "6"))
SPORTMONKS_BASE_URL = "https://cricket.sportmonks.com/api/v2.0"

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
