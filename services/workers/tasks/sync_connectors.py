"""
Connector Sync Task — Google Drive delta sync → ingest pipeline.

Runs on demand (API) and on a Celery Beat schedule.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import uuid as uuid_lib

import psycopg2
import psycopg2.extras

from services.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

psycopg2.extras.register_uuid()


def _get_db_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "photogenic"),
        user=os.getenv("POSTGRES_USER", "photogenic"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme_pg_password"),
    )


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


@celery_app.task(bind=True, max_retries=3, name="connectors.sync_source")
def sync_source(self, source_id: str) -> dict:
    """
    Sync a single connector source. Currently supports kind='gdrive'.
    """
    conn = _get_db_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, tenant_id, group_id, kind, config, cursor "
                "FROM sources WHERE id = %s",
                (source_id,),
            )
            source = cur.fetchone()

        if not source:
            return {"status": "not_found", "source_id": source_id}

        kind = source["kind"]
        if kind != "gdrive":
            _set_source_error(conn, source_id, f"Unsupported connector kind: {kind}")
            return {"status": "unsupported", "kind": kind}

        config = source["config"] or {}
        if isinstance(config, str):
            import json
            config = json.loads(config)

        from services.connectors.gdrive.connector import GDriveConnector

        connector = GDriveConnector(
            source_id=str(source["id"]),
            group_id=str(source["group_id"]),
            tenant_id=str(source["tenant_id"]),
            config=config,
        )

        try:
            items, new_cursor = _run_async(connector.delta_sync(source.get("cursor")))
        except Exception as e:
            _set_source_error(conn, source_id, str(e))
            raise self.retry(exc=e)

        from minio import Minio
        from services.workers.tasks.ingest import process_asset

        minio_client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
            secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
        )
        bucket = os.getenv("MINIO_BUCKET", "photogenic")
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)

        queued = 0
        deleted = 0
        for item in items:
            if item.is_deleted:
                deleted += 1
                continue

            try:
                blob = _run_async(connector.fetch_blob(item.object_id))
            except Exception as e:
                logger.warning(f"Failed to fetch {item.object_id}: {e}")
                continue

            object_key = (
                f"{source['tenant_id']}/{source['group_id']}/gdrive/"
                f"{item.object_id}/{item.filename or 'image.jpg'}"
            )
            minio_client.put_object(
                bucket,
                object_key,
                io.BytesIO(blob),
                length=len(blob),
                content_type=item.mime_type or "image/jpeg",
            )

            asset_id = str(uuid_lib.uuid4())
            process_asset.delay({
                "tenant_id": str(source["tenant_id"]),
                "group_id": str(source["group_id"]),
                "source_id": str(source["id"]),
                "object_id": object_key,
                "etag": item.etag,
                "filename": item.filename,
                "asset_id": asset_id,
            })
            queued += 1

        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET cursor = %s, "
                    "config = COALESCE(config, '{}'::jsonb) || "
                    "%s::jsonb "
                    "WHERE id = %s",
                    (
                        new_cursor,
                        psycopg2.extras.Json({
                            "last_sync_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                            "last_error": None,
                            "last_queued": queued,
                        }),
                        source_id,
                    ),
                )

        logger.info(
            f"Connector {source_id} sync: queued={queued}, deleted_markers={deleted}"
        )
        return {
            "status": "ok",
            "source_id": source_id,
            "queued": queued,
            "deleted_markers": deleted,
            "cursor": new_cursor,
        }

    except Exception as e:
        logger.error(f"Connector sync failed: {e}")
        try:
            _set_source_error(conn, source_id, str(e))
        except Exception:
            pass
        raise
    finally:
        conn.close()


@celery_app.task(name="connectors.sync_all_gdrive")
def sync_all_gdrive() -> dict:
    """Beat-scheduled: enqueue sync for every gdrive source."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM sources WHERE kind = 'gdrive'")
            ids = [str(r[0]) for r in cur.fetchall()]
        for sid in ids:
            sync_source.delay(sid)
        return {"enqueued": len(ids)}
    finally:
        conn.close()


def _set_source_error(conn, source_id: str, error: str) -> None:
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE sources SET config = COALESCE(config, '{}'::jsonb) || %s::jsonb "
                "WHERE id = %s",
                (
                    psycopg2.extras.Json({"last_error": error}),
                    source_id,
                ),
            )
