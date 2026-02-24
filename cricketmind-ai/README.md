# CricketMind AI

**Agentic AI-Powered Cricket Player Prediction System**

> A [CricSynthesis](https://cricsynthesis.in) Product

## 🏏 What is CricketMind AI?

CricketMind AI uses a crew of 4 specialized AI agents to predict and rank all 22 players before any cricket match — giving you Captain/VC picks, value picks, and confidence-rated fantasy point predictions.

## 🧠 Architecture

```
   Sportmonks API             AI Agents (CrewAI)       Output
  ┌─────────────────────┐    ┌────────────────────────┐   ┌──────────┐
  │ Fixtures & Squads   │    │ 1. Data Collector      │   │ JSON     │
  │ Scorecards          │───>│ 2. Context Analyzer    │──>│ Rankings │
  │ Player Careers      │    │ 3. Performance Predictor│   │ #1-#22  │
  └─────────────────────┘    │ 4. Final Ranker        │   └──────────┘
                             └────────────────────────┘
```

**LLMs:** Gemini 2.0 Flash (primary) | Groq Llama 3.3 70B (fallback)

## 🚀 Quick Start

```bash
# 1. Install
cd cricketmind-ai
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Add your API keys to .env

# 3. Run Dashboard
streamlit run frontend/app.py

# 4. Or run CLI prediction
python -m orchestrator.auto_predict
```

## 🔑 API Keys Needed

| Key | Get From | Required |
|-----|----------|----------|
| `SPORTMONKS_API_KEY` | [Sportmonks](https://www.sportmonks.com/) | ✅ |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) | ✅ |
| `GROQ_API_KEY` | [Groq Cloud](https://console.groq.com/) | Optional |

## 📂 Project Structure

```
cricketmind-ai/
├── agents/          # 4 CrewAI agent definitions
├── data/            # Sportmonks API client & player profile builder
├── database/        # SQLite persistence
├── frontend/        # Streamlit dashboard (CricSynthesis theme)
├── models/          # Pydantic data models
├── orchestrator/    # Pipeline & auto-predict
├── scoring/         # Fantasy points calculator
├── tasks/           # Agent task definitions
└── utils/           # Config, logging, helpers
```

## ⚠️ Disclaimer

AI predictions are for entertainment and informational purposes only. Not financial or betting advice.
