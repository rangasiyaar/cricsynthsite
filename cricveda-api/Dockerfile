# Slim production image — no XGBoost/pandas/scikit-learn.
# ML inference runs in GitHub Actions; this image only serves the API.
FROM python:3.12-slim

WORKDIR /app

# Only copy what the API needs
COPY cricveda-api/requirements-prod.txt ./
COPY cricveda-core/src/ ./cricveda-core/src/
COPY cricveda-ingest/src/cricveda_ingest/db.py ./cricveda-ingest/src/cricveda_ingest/db.py
COPY cricveda-ingest/src/cricveda_ingest/__init__.py ./cricveda-ingest/src/cricveda_ingest/__init__.py
COPY cricveda-api/src/ ./cricveda-api/src/

# Install production deps only
RUN pip install --no-cache-dir -r requirements-prod.txt && \
    pip install --no-cache-dir -e cricveda-core -e cricveda-api && \
    pip install --no-cache-dir supabase python-dotenv

ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV PYTHONPATH="/app/cricveda-ingest/src:/app/cricveda-core/src:/app/cricveda-api/src"

EXPOSE 8000

CMD ["uvicorn", "cricveda_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
