# Cricsheet ingest job — runs on Cloud Run Jobs (weekly via Cloud Scheduler).
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY cricdata/ ./cricdata/
RUN pip install "./cricdata[gcp,attributes]"
ENTRYPOINT ["cricdata"]
