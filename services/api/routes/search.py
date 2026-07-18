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
    async with httpx.AsyncClient(timeout=30.0) as client:
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

    return SearchResponse(
        query_faces_detected=len(faces),
        query_face_used={
            "bbox": best_face["bbox"],
            "det_score": best_face["det_score"],
            "quality": best_face.get("quality"),
        },
        results=search_result.get("results", []),
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
