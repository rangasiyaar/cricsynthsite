# CricketMind AI

**Agentic AI-Powered Cricket Player Prediction System**

> A [CricSynthesis](https://cricsynthesis.com) Product

## 🏏 What is CricketMind AI?

CricketMind AI uses a crew of 4 specialized AI agents to predict and rank all 22 players before any cricket match — giving you Captain/VC picks, value picks, and confidence-rated fantasy point predictions.

## 🧠 Architecture

```
   Data Layer (3 Sources)        AI Agents (CrewAI)       Output
  ┌─────────────────────┐    ┌────────────────────────┐   ┌──────────┐
  │ CricketData.org API │    │ 1. Data Collector      │   │ JSON     │
  │ Cricsheet CSV Data  │───>│ 2. Context Analyzer    │──>│ Rankings │
  │ ESPN Scraper        │    │ 3. Performance Predictor│   │ #1-#22  │
  └─────────────────────┘    │ 4. Final Ranker        │   └──────────┘
                             └────────────────────────┘
```

**LLMs:** Gemini 2.5 Flash (primary) | Groq Llama 3.3 70B (fallback)

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

## 🔑 API Keys Needed (Free)

| Key | Get From | Required |
|-----|----------|----------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) | ✅ |
| `CRICDATA_API_KEY` | [CricketData.org](https://cricketdata.org/) | ✅ |
| `GROQ_API_KEY` | [Groq Cloud](https://console.groq.com/) | Optional |

## 📂 Project Structure

```
cricketmind-ai/
├── agents/          # 4 CrewAI agent definitions
├── data/            # Data clients (CricAPI, Cricsheet, ESPN)
├── database/        # SQLite persistence
├── frontend/        # Streamlit dashboard
├── models/          # Pydantic data models
├── orchestrator/    # Pipeline & auto-predict
├── scoring/         # Fantasy points calculator
├── tasks/           # Agent task definitions
└── utils/           # Config, logging, helpers
```

## ⚠️ Disclaimer

AI predictions are for entertainment and informational purposes only. Not financial or betting advice.
