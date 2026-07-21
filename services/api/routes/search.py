"""
Search Routes — §5.7 / §5.8

POST /v1/groups/{id}/search/face   — proxies to retrieval service
POST /v1/groups/{id}/search/hybrid — Phase 3 placeholder (501)
"""

from __future__ import annotations

import os
import uuid

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from packages.schemas.api_models import SearchResponse
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

router = APIRouter(prefix="/v1/groups/{group_id}/search", tags=["Search"])

ML_INFERENCE_URL = os.getenv("ML_INFERENCE_URL", "http://ml-inference:8001")
RETRIEVAL_SERVICE_URL = os.getenv("RETRIEVAL_SERVICE_URL", "http://retrieval:8003")


@router.post("/face", response_model=SearchResponse)
async def search_face(
    group_id: uuid.UUID,
    file: UploadFile = File(...),
    k: int = 50,
    user: UserInfo = Depends(get_current_user),
):
    """
    Face search within a group (§5.7).

    Accepts a query image, detects + embeds the best-quality face,
    then runs two-stage retrieval via the retrieval service.
    """
    await require_group_access(user, group_id, required_role="viewer")

    file_bytes = await file.read()

    # Step 1: Detect + embed query face via ML service
    async with httpx.AsyncClient(timeout=120.0) as client:
        ml_resp = await client.post(
            f"{ML_INFERENCE_URL}/embed",
            files={"file": ("query.jpg", file_bytes, "image/jpeg")},
        )

        if ml_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="ML inference service error")

        ml_result = ml_resp.json()
        faces = ml_result.get("faces", [])

    if not faces:
        return SearchResponse(
            query_faces_detected=0,
            query_face_used=None,
            results=[],
            total_candidates_scanned=0,
            search_time_ms=0,
        )

    # Select best-quality face for the query
    best_face = max(faces, key=lambda f: f.get("quality", 0))

    # Step 2: Search via retrieval service
    async with httpx.AsyncClient(timeout=30.0) as client:
        search_resp = await client.post(
            f"{RETRIEVAL_SERVICE_URL}/search",
            json={
                "query_embedding": best_face["embedding"],
                "query_quality": best_face.get("quality", 0.5),
                "tenant_id": str(user.tenant_id),
                "group_id": str(group_id),
                "user_id": str(user.id),
                "k": k,
            },
        )

        if search_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Retrieval service error")

        search_result = search_resp.json()

    # Persist query face + embedding so feedback/calibration can resolve scores
    query_face_id: uuid.UUID | None = None
    try:
        import base64
        import io
        from minio import Minio
        from qdrant_client import QdrantClient
        from qdrant_client.models import PointStruct

        crop_b64 = best_face.get("crop_jpeg_b64")
        crop_bytes = base64.b64decode(crop_b64) if crop_b64 else None
        pool = await get_pool()
        query_face_id = uuid.uuid4()
        embedding_id = uuid.uuid4()
        crop_path = None
        if crop_bytes:
            object_key = f"{user.tenant_id}/{group_id}/query_crops/{query_face_id}.jpg"
            minio_client = Minio(
                os.getenv("MINIO_ENDPOINT", "minio:9000"),
                access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
                secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
            )
            bucket = os.getenv("MINIO_BUCKET", "photogenic")
            minio_client.put_object(
                bucket,
                object_key,
                io.BytesIO(crop_bytes),
                length=len(crop_bytes),
                content_type="image/jpeg",
            )
            crop_path = object_key

        bbox = best_face.get("bbox") or [0, 0, 0, 0]
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO faces (id, tenant_id, group_id, asset_id, "
                "bbox_x, bbox_y, bbox_w, bbox_h, det_score, quality, "
                "model_id, model_version, embedding_id, crop_path) "
                "VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
                query_face_id,
                user.tenant_id,
                group_id,
                bbox[0],
                bbox[1],
                bbox[2],
                bbox[3],
                best_face.get("det_score"),
                best_face.get("quality"),
                best_face.get("model_id", "arcface_r50"),
                best_face.get("model_version", "w600k_r50_v1"),
                embedding_id,
                crop_path,
            )

        qdrant = QdrantClient(
            host=os.getenv("QDRANT_HOST", "qdrant"),
            port=int(os.getenv("QDRANT_PORT", "6333")),
        )
        qdrant.upsert(
            collection_name="faces_v1",
            points=[
                PointStruct(
                    id=str(embedding_id),
                    vector=best_face["embedding"],
                    payload={
                        "tenant_id": str(user.tenant_id),
                        "group_id": str(group_id),
                        "face_id": str(query_face_id),
                        "asset_id": None,
                        "person_id": None,
                        "quality": best_face.get("quality", 0.5),
                        "is_query": True,
                    },
                )
            ],
        )
    except Exception:
        query_face_id = None

    # Annotate evidence with query face / crop URLs
    query_crop_url = (
        f"/v1/faces/{query_face_id}/crop" if query_face_id else None
    )
    for item in results:
        for ev in item.get("evidence") or []:
            if isinstance(ev, dict):
                ev["query_face_id"] = str(query_face_id) if query_face_id else None
                ev["query_crop_url"] = query_crop_url

    # Audit — do not store biometric payloads or image bytes
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO audit_log (tenant_id, user_id, action, resource, details) "
                "VALUES ($1, $2, 'search', $3, $4)",
                user.tenant_id,
                user.id,
                f"group:{group_id}",
                {
                    "query_faces_detected": len(faces),
                    "query_face_id": str(query_face_id) if query_face_id else None,
                    "results_count": len(results),
                    "candidates_scanned": search_result.get("total_candidates_scanned", 0),
                    "search_time_ms": search_result.get("search_time_ms", 0),
                },
            )
    except Exception:
        pass  # search must succeed even if audit write fails

    return SearchResponse(
        query_faces_detected=len(faces),
        query_face_used={
            "bbox": best_face["bbox"],
            "det_score": best_face["det_score"],
            "quality": best_face.get("quality"),
        },
        results=results,
        total_candidates_scanned=search_result.get("total_candidates_scanned", 0),
        search_time_ms=search_result.get("search_time_ms", 0),
    )


@router.post("/hybrid", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def search_hybrid(
    group_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """Hybrid search (face + CLIP + OCR + metadata, RRF-fused) — Phase 3."""
    return {"detail": "Hybrid search is planned for Phase 3"}
