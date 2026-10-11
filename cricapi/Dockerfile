# CricSynthesis API — Cloud Run (scale to zero; sizes in infra/limits.env)
FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
COPY cricsim ./cricsim
COPY cricapi ./cricapi
RUN pip install --no-cache-dir ./cricsim "./cricapi[cloud]"
# The model and published docs are mounted / synced from Cloud Storage at deploy time.
ENV CRICAPI_MODEL_DIR=/srv/data/models/latest CRICAPI_PUBLISH_DIR=/srv/data/publish
# Run unprivileged; only the data folder is writable.
RUN useradd --system --uid 10001 --home /srv app && mkdir -p /srv/data && chown -R app /srv/data
USER app
CMD ["cricapi"]
