# CricSynthesis API — Cloud Run (scale to zero; sizes in infra/limits.env)
FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
COPY cricsim ./cricsim
COPY cricapi ./cricapi
RUN pip install --no-cache-dir ./cricsim ./cricapi
# The model and published docs are mounted / synced from Cloud Storage at deploy time.
ENV CRICAPI_MODEL_DIR=/srv/data/models/latest CRICAPI_PUBLISH_DIR=/srv/data/publish
CMD ["cricapi"]
