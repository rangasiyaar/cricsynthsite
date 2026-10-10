import os
from pathlib import Path

# A synthetic published match (two made-up sides), as cricsim.publish writes it.
DATA = Path(__file__).resolve().parent / "fixtures"
os.environ["CRICSYNTHESIS_DATA_URL"] = str(DATA)
os.environ.pop("CRICSYNTHESIS_API_KEY", None)
