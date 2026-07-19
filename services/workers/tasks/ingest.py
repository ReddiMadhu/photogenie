"""
Asset Ingest Task — §5.5

The per-asset pipeline: idempotent, quota-aware.
Key: idempotency_key = hash(group_id, source_id, object_id, etag)
Retries never double-index. Quota reserved in Postgres BEFORE fetching bytes.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import uuid as uuid_lib

import httpx
import psycopg2

from services.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

ML_INFERENCE_URL = os.getenv("ML_INFERENCE_URL", "http://ml-inference:8001")
IDENTITY_SERVICE_URL = os.getenv("IDENTITY_SERVICE_URL", "http://identity:8002")
QUALITY_FLOOR = float(os.getenv("ML_QUALITY_FLOOR", "0.3"))


def _get_db_conn():
    """Get a synchronous Postgres connection for Celery tasks."""
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "photogenic"),
        user=os.getenv("POSTGRES_USER", "photogenic"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme_pg_password"),
    )


def _compute_idempotency_key(evt: dict) -> str:
    """§5.5: idempotency_key = hash(group_id, source_id, object_id, etag)"""
    parts = f"{evt.get('group_id')}:{evt.get('source_id')}:{evt.get('object_id')}:{evt.get('etag')}"
    return hashlib.sha256(parts.encode()).hexdigest()


@celery_app.task(bind=True, max_retries=5, acks_late=True, name="ingest.process_asset")
def process_asset(self, evt: dict) -> dict:
    """
    Process a single asset through the full ML pipeline (§5.5).

    evt keys: tenant_id, group_id, source_id, object_id, etag,
              file_path (or file_bytes_b64), filename
    """
    idempotency_key = _compute_idempotency_key(evt)
    tenant_id = evt["tenant_id"]
    group_id = evt["group_id"]

    conn = _get_db_conn()
    try:
        # ==================================================================
        # Step 1: Reserve quota (transactional, BEFORE fetching bytes)
        # ==================================================================
        with conn:
            with conn.cursor() as cur:
                # Check idempotency
                cur.execute(
                    "SELECT id, status FROM assets WHERE group_id = %s "
                    "AND source_id = %s AND source_object_id = %s AND etag = %s",
                    (group_id, evt.get("source_id"), evt.get("object_id"), evt.get("etag")),
                )
                existing = cur.fetchone()
                if existing and existing[1] == "ready":
                    logger.info(f"Asset already processed (idempotent): {idempotency_key[:12]}")
                    return {"status": "already_done", "asset_id": str(existing[0])}

                # Atomic quota reservation
                cur.execute(
                    "UPDATE search_groups "
                    "SET active_image_count = active_image_count + 1, updated_at = now() "
                    "WHERE id = %s AND active_image_count < max_active_images "
                    "RETURNING id",
                    (group_id,),
                )
                reserved = cur.fetchone()
                if not reserved:
                    logger.warning(f"Quota exceeded for group {group_id}")
                    return {"status": "quota_exceeded", "group_id": group_id}

                # Insert asset as 'reserved'
                asset_id = uuid_lib.uuid4()
                cur.execute(
                    "INSERT INTO assets (id, tenant_id, group_id, source_id, "
                    "source_object_id, etag, filename, status) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, 'reserved') "
                    "ON CONFLICT (group_id, source_id, source_object_id, etag) DO NOTHING "
                    "RETURNING id",
                    (str(asset_id), tenant_id, group_id,
                     evt.get("source_id"), evt.get("object_id"),
                     evt.get("etag"), evt.get("filename")),
                )
                row = cur.fetchone()
                if row:
                    asset_id = row[0]
                else:
                    # Conflict — already exists
                    return {"status": "already_exists"}

        # ==================================================================
        # Step 2: Fetch image bytes
        # ==================================================================
        file_path = evt.get("file_path")
        object_id = evt.get("object_id")
        file_bytes = None

        if file_path and os.path.exists(file_path):
            with open(file_path, "rb") as f:
                file_bytes = f.read()
        elif object_id:
            try:
                from minio import Minio
                minio_client = Minio(
                    os.getenv("MINIO_ENDPOINT", "minio:9000"),
                    access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
                    secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
                    secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
                )
                bucket = os.getenv("MINIO_BUCKET", "photogenic")
                response = minio_client.get_object(bucket, object_id)
                file_bytes = response.read()
                response.close()
                response.release_conn()
            except Exception as e:
                logger.error(f"Failed to fetch from MinIO: {e}")

        if not file_bytes:
            logger.warning(f"File not found or empty: path={file_path}, object={object_id}")
            _mark_failed(conn, asset_id, group_id)
            return {"status": "file_not_found"}

        # ==================================================================
        # Step 3: Hash + dedup
        # ==================================================================
        sha256 = hashlib.sha256(file_bytes).digest()
        import imagehash
        from PIL import Image

        img = Image.open(io.BytesIO(file_bytes))
        phash_val = int(str(imagehash.phash(img)), 16)
        if phash_val >= 2**63:
            phash_val -= 2**64
        phash = phash_val

        with conn:
            with conn.cursor() as cur:
                # Exact dedup (within group)
                cur.execute(
                    "SELECT id FROM assets WHERE group_id = %s AND sha256 = %s "
                    "AND status = 'ready' AND id != %s LIMIT 1",
                    (group_id, sha256, str(asset_id)),
                )
                if cur.fetchone():
                    logger.info(f"Exact duplicate found for asset {asset_id}")
                    _release_quota(conn, asset_id, group_id)
                    return {"status": "duplicate", "asset_id": str(asset_id)}

                # Update asset with hash data
                cur.execute(
                    "UPDATE assets SET sha256 = %s, phash = %s, "
                    "width = %s, height = %s WHERE id = %s",
                    (sha256, phash, img.width, img.height, str(asset_id)),
                )

        # ==================================================================
        # Step 4: EXIF extraction
        # ==================================================================
        exif_data = _extract_exif(file_bytes)
        if exif_data:
            taken_at = exif_data.pop("taken_at", None)
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE assets SET exif_data = %s, taken_at = %s WHERE id = %s",
                        (
                            json.dumps(exif_data),
                            taken_at,
                            str(asset_id),
                        ),
                    )

        # ==================================================================
        # Step 5: Face detection + embedding (via ML inference service)
        # ==================================================================
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                f"{ML_INFERENCE_URL}/embed",
                files={"file": ("image.jpg", file_bytes, "image/jpeg")},
            )
            if resp.status_code != 200:
                logger.error(f"ML inference failed: {resp.status_code}")
                _mark_failed(conn, asset_id, group_id)
                raise self.retry(exc=Exception(f"ML inference returned {resp.status_code}"))

            ml_result = resp.json()

        faces_data = ml_result.get("faces", [])
        logger.info(f"Asset {asset_id}: {len(faces_data)} faces detected")

        # ==================================================================
        # Step 6: Quality gate + index + assign
        # ==================================================================
        from qdrant_client import QdrantClient
        from qdrant_client.models import PointStruct

        qdrant = QdrantClient(
            host=os.getenv("QDRANT_HOST", "qdrant"),
            port=int(os.getenv("QDRANT_PORT", "6333")),
        )

        kept_faces = []
        for face in faces_data:
            quality = face.get("quality", 0)
            if quality < QUALITY_FLOOR:
                continue

            face_id = uuid_lib.uuid4()
            embedding_id = uuid_lib.uuid4()

            # Insert face record
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO faces (id, tenant_id, group_id, asset_id, "
                        "bbox_x, bbox_y, bbox_w, bbox_h, landmarks, "
                        "det_score, quality, model_id, model_version, embedding_id) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (
                            str(face_id), tenant_id, group_id, str(asset_id),
                            face["bbox"][0], face["bbox"][1],
                            face["bbox"][2], face["bbox"][3],
                            json.dumps(face.get("landmarks")),
                            face["det_score"], quality,
                            face.get("model_id", "arcface_r50"),
                            face.get("model_version", "w600k_r50_v1"),
                            str(embedding_id),
                        ),
                    )

            # Upsert to Qdrant with mandatory group_id payload
            qdrant.upsert(
                collection_name="faces_v1",
                points=[PointStruct(
                    id=str(embedding_id),
                    vector=face["embedding"],
                    payload={
                        "tenant_id": tenant_id,
                        "group_id": group_id,
                        "face_id": str(face_id),
                        "asset_id": str(asset_id),
                        "person_id": None,
                        "quality": quality,
                        "model_version": face.get("model_version", "w600k_r50_v1"),
                    },
                )],
            )

            kept_faces.append({
                "face_id": str(face_id),
                "embedding": face["embedding"],
                "quality": quality,
            })

        # ==================================================================
        # Step 7: Person assignment (via Identity service)
        # ==================================================================
        with httpx.Client(timeout=30.0) as client:
            for face in kept_faces:
                try:
                    resp = client.post(
                        f"{IDENTITY_SERVICE_URL}/assign",
                        json={
                            "face_id": face["face_id"],
                            "embedding": face["embedding"],
                            "quality": face["quality"],
                            "tenant_id": tenant_id,
                            "group_id": group_id,
                        },
                    )
                    if resp.status_code == 200:
                        result = resp.json()
                        if result.get("assigned") and result.get("person_id"):
                            # Update face with person_id
                            with conn:
                                with conn.cursor() as cur:
                                    cur.execute(
                                        "UPDATE faces SET person_id = %s WHERE id = %s",
                                        (result["person_id"], face["face_id"]),
                                    )
                except Exception as e:
                    logger.warning(f"Person assignment failed for {face['face_id']}: {e}")

        # ==================================================================
        # Step 8: Mark ready
        # ==================================================================
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE assets SET status = 'ready', updated_at = now() WHERE id = %s",
                    (str(asset_id),),
                )

        logger.info(f"Asset {asset_id} processed: {len(kept_faces)} faces indexed")
        return {
            "status": "ready",
            "asset_id": str(asset_id),
            "faces_detected": len(faces_data),
            "faces_indexed": len(kept_faces),
        }

    except Exception as e:
        logger.error(f"Asset processing failed: {e}")
        try:
            _mark_failed(conn, asset_id, group_id)
        except Exception:
            pass
        raise self.retry(exc=e)

    finally:
        conn.close()


def _mark_failed(conn, asset_id, group_id):
    """Mark asset as failed and release quota."""
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assets SET status = 'failed', updated_at = now() WHERE id = %s",
                (str(asset_id),),
            )
            cur.execute(
                "UPDATE search_groups SET active_image_count = "
                "GREATEST(0, active_image_count - 1), updated_at = now() "
                "WHERE id = %s",
                (group_id,),
            )


def _release_quota(conn, asset_id, group_id):
    """Release quota reservation for a duplicate/skipped asset."""
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assets SET status = 'deleted', deleted_at = now() WHERE id = %s",
                (str(asset_id),),
            )
            cur.execute(
                "UPDATE search_groups SET active_image_count = "
                "GREATEST(0, active_image_count - 1), updated_at = now() "
                "WHERE id = %s",
                (group_id,),
            )


def _extract_exif(file_bytes: bytes) -> dict:
    """Extract EXIF metadata from image bytes."""
    try:
        import exifread
        tags = exifread.process_file(io.BytesIO(file_bytes), details=False)
        result = {}
        for key, val in tags.items():
            result[key] = str(val)
        # Try to parse date – EXIF uses "YYYY:MM:DD HH:MM:SS" but
        # PostgreSQL expects "YYYY-MM-DD HH:MM:SS"
        date_tag = tags.get("EXIF DateTimeOriginal") or tags.get("Image DateTime")
        if date_tag:
            from datetime import datetime as _dt
            try:
                parsed = _dt.strptime(str(date_tag).strip(), "%Y:%m:%d %H:%M:%S")
                result["taken_at"] = parsed.isoformat()
            except (ValueError, TypeError):
                result["taken_at"] = None
        return result
    except Exception:
        return {}
