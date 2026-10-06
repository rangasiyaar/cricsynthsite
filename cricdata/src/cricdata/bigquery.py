"""Publish Parquet tables: upload to Cloud Storage, then load into BigQuery.

Load jobs from Cloud Storage are free in BigQuery (only queries and storage are
metered). Each table is replaced atomically with WRITE_TRUNCATE, so a weekly
full rebuild is idempotent.
"""
from __future__ import annotations

import logging
from pathlib import Path

from cricdata.schema import BQ_LAYOUT

log = logging.getLogger(__name__)


def upload_dir(local: Path, bucket: str, prefix: str, pattern: str = "*.parquet") -> list[str]:
    from google.cloud import storage

    client = storage.Client()
    b = client.bucket(bucket)
    for old in client.list_blobs(bucket, prefix=prefix + "/"):
        old.delete()
    uris = []
    for f in sorted(local.rglob(pattern)):
        name = f"{prefix}/{f.relative_to(local).as_posix()}"
        b.blob(name).upload_from_filename(str(f))
        uris.append(f"gs://{bucket}/{name}")
    log.info("Uploaded %d files to gs://%s/%s", len(uris), bucket, prefix)
    return uris


def load_config(table: str):
    from google.cloud import bigquery

    cfg = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.PARQUET,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    # Build the options first: the config's getter returns a copy, so mutating
    # cfg.parquet_options in place would be silently lost.
    opts = bigquery.ParquetOptions()
    opts.enable_list_inference = True        # load list<string> columns as ARRAY<STRING>
    cfg.parquet_options = opts
    layout = BQ_LAYOUT.get(table, {})
    if layout.get("partition"):
        cfg.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.MONTH, field=layout["partition"])
    if layout.get("cluster"):
        cfg.clustering_fields = layout["cluster"]
    return cfg


def load_tables(project: str, dataset: str, bucket: str, prefix: str, tables: list[str]) -> dict[str, int]:
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    rows = {}
    for t in tables:
        uri = f"gs://{bucket}/{prefix}/{t}/*.parquet"
        job = client.load_table_from_uri(uri, f"{project}.{dataset}.{t}", job_config=load_config(t))
        job.result()
        rows[t] = client.get_table(f"{project}.{dataset}.{t}").num_rows
        log.info("Loaded %s: %d rows", t, rows[t])
    return rows
