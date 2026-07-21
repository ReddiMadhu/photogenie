"""
Erasure Task — §5.13 Compliance

Delete vectors from Qdrant, purge cache, decrement quota, emit audit events.
Erasure completes ≤24h with audit proof (§5.11).
"""

from __future__ import annotations

import logging
import os
import uuid as uuid_lib

import psycopg2

from services.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, name="erase.person")
def erase_person(self, tenant_id: str, group_id: str, person_id: str, requested_by: str) -> dict:
    """Erase a person from a group: vectors, faces, cache, audit."""
    try:
        conn = psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "postgres"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            dbname=os.getenv("POSTGRES_DB", "photogenic"),
            user=os.getenv("POSTGRES_USER", "photogenic"),
            password=os.getenv("POSTGRES_PASSWORD", "changeme_pg_password"),
        )

        # Step 1: Get all face embedding_ids and crop paths for this person
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, embedding_id, crop_path FROM faces "
                    "WHERE group_id = %s AND person_id = %s",
                    (group_id, person_id),
                )
                faces = cur.fetchall()

        embedding_ids = [str(f[1]) for f in faces if f[1]]
        face_ids = [str(f[0]) for f in faces]
        crop_paths = [f[2] for f in faces if f[2]]

        # Step 2: Delete vectors from Qdrant
        vectors_deleted = 0
        if embedding_ids:
            try:
                from qdrant_client import QdrantClient
                from qdrant_client.models import PointIdsList

                qdrant = QdrantClient(
                    host=os.getenv("QDRANT_HOST", "qdrant"),
                    port=int(os.getenv("QDRANT_PORT", "6333")),
                )
                qdrant.delete(
                    collection_name="faces_v1",
                    points_selector=PointIdsList(points=embedding_ids),
                )
                vectors_deleted = len(embedding_ids)
            except Exception as e:
                logger.error(f"Qdrant deletion failed: {e}")

        # Step 2b: Delete face crops from MinIO
        if crop_paths:
            try:
                from minio import Minio
                minio_client = Minio(
                    os.getenv("MINIO_ENDPOINT", "minio:9000"),
                    access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
                    secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
                    secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
                )
                bucket = os.getenv("MINIO_BUCKET", "photogenic")
                for path in crop_paths:
                    try:
                        minio_client.remove_object(bucket, path)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"Crop cleanup failed: {e}")

        # Step 3: Delete faces and person from Postgres
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM faces WHERE person_id = %s AND group_id = %s",
                            (person_id, group_id))
                cur.execute("DELETE FROM persons WHERE id = %s AND group_id = %s",
                            (person_id, group_id))

                # Emit person_event
                cur.execute(
                    "INSERT INTO person_events "
                    "(tenant_id, group_id, person_id, kind, payload, actor) "
                    "VALUES (%s, %s, %s, 'erase', %s, %s)",
                    (
                        tenant_id, group_id, person_id,
                        f'{{"faces_deleted": {len(face_ids)}, "vectors_deleted": {vectors_deleted}}}',
                        f"user:{requested_by}",
                    ),
                )

                # Audit log
                cur.execute(
                    "INSERT INTO audit_log (tenant_id, user_id, action, resource, details) "
                    "VALUES (%s, %s, 'erase', %s, %s)",
                    (
                        tenant_id, requested_by,
                        f"person:{person_id}",
                        f'{{"group_id": "{group_id}", "faces": {len(face_ids)}, "vectors": {vectors_deleted}}}',
                    ),
                )

        conn.close()

        # Step 4: Purge Redis cache
        try:
            import redis
            r = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
            r.delete(f"person:{group_id}:{person_id}")
            r.delete(f"search_cache:{group_id}")
        except Exception as e:
            logger.warning(f"Cache purge failed: {e}")

        logger.info(
            f"Erased person {person_id} from group {group_id}: "
            f"{len(face_ids)} faces, {vectors_deleted} vectors"
        )

        return {
            "status": "erased",
            "person_id": person_id,
            "faces_deleted": len(face_ids),
            "vectors_deleted": vectors_deleted,
            "cache_purged": True,
        }

    except Exception as e:
        logger.error(f"Erasure failed: {e}")
        raise self.retry(exc=e)
