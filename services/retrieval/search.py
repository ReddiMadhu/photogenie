"""
Two-Stage Search Pipeline — §5.7

The product query, always group-scoped:
1. RBAC check (can_access)
2. Tiled detect + best-quality face from query image
3. ANN oversample (10×k) with mandatory tenant+group filter
4. Person set aggregation (quality-weighted, IJB-C style)
5. Verifier rerank (MLP on pair features)
6. RRF fusion slot (Phase 3: CLIP + OCR)
7. ACL filter
8. Evidence payload per result
"""

from __future__ import annotations

import logging
import time
import uuid as uuid_lib
from collections import defaultdict
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


async def search_person(
    query_embedding: list[float],
    query_quality: float,
    tenant_id: str,
    group_id: str,
    user_id: str,
    k: int = 50,
    qdrant_client=None,
    db_pool=None,
) -> dict:
    """
    Full two-stage face search within a group (§5.7).

    Returns ranked persons with evidence payloads.
    """
    start = time.time()

    # Step 1: RBAC check
    has_access = await _check_access(user_id, group_id, db_pool)
    if not has_access:
        return {"error": "Access denied", "results": []}

    if qdrant_client is None:
        return {"error": "Qdrant not available", "results": []}

    # Step 2: ANN oversample (10×k) with mandatory filters
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    oversample = min(10 * k, 500)
    query_resp = qdrant_client.query_points(
        collection_name="faces_v1",
        query=query_embedding,
        limit=oversample,
        query_filter=Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="group_id", match=MatchValue(value=group_id)),
            ]
        ),
    )
    candidates = query_resp.points

    if not candidates:
        return {
            "results": [],
            "total_candidates_scanned": 0,
            "search_time_ms": round((time.time() - start) * 1000, 1),
        }

    # Step 3: Person set aggregation (quality-weighted, IJB-C style)
    person_groups = _group_by_person(candidates)
    stage1 = _person_set_aggregation(
        query_embedding=np.array(query_embedding),
        query_quality=query_quality,
        person_groups=person_groups,
    )

    # Step 4: Verifier rerank
    stage2 = _verifier_rerank(stage1)

    # Step 5: RRF fusion slot (Phase 3 — currently passthrough)
    fused = _rrf_fusion(face_rank=stage2, clip_rank=None, ocr_rank=None)

    # Step 6: Fetch calibrated search threshold and filter results
    tau_search = await _get_tau_search(tenant_id, group_id, db_pool)

    # Step 7: Build evidence + format results
    results = []
    for item in fused[:k]:
        if item["score"] < tau_search:
            continue
        evidence = {
            "cosine_similarity": round(item["score"], 4),
            "quality_score": round(item.get("avg_quality", 0), 4),
            "verifier_score": round(item.get("verifier_score", item["score"]), 4),
            "group_id": group_id,
            "match_count": item.get("face_count", 0),
        }
        results.append({
            "person_id": item.get("person_id"),
            "person_name": item.get("person_name"),
            "score": round(item["score"], 4),
            "face_count": item.get("face_count", 0),
            "evidence": [evidence],
            "asset_ids": item.get("asset_ids", []),
        })

    search_time = round((time.time() - start) * 1000, 1)

    return {
        "results": results,
        "total_candidates_scanned": len(candidates),
        "search_time_ms": search_time,
    }


def _group_by_person(candidates) -> dict:
    """Group ANN candidates by person_id."""
    groups = defaultdict(list)
    for hit in candidates:
        pid = hit.payload.get("person_id")
        if not pid:
            # Treat each unassigned face as its own distinct item
            face_id = hit.payload.get("face_id") or str(uuid_lib.uuid4())
            pid = f"unknown_{face_id}"
        groups[pid].append({
            "face_id": hit.payload.get("face_id"),
            "score": hit.score,
            "quality": hit.payload.get("quality", 0.5),
            "asset_id": hit.payload.get("asset_id"),
            "person_name": hit.payload.get("person_name"),
        })
    return dict(groups)


def _person_set_aggregation(
    query_embedding: np.ndarray,
    query_quality: float,
    person_groups: dict,
    max_faces_per_person: int = 5,
) -> list[dict]:
    """
    Quality-weighted set aggregation per person (IJB-C template protocol).

    For each person, take top-m faces by score, compute quality-weighted
    mean similarity. This converts "top-k face similarity" into
    "find this person" — the actual use case.
    """
    results = []

    for person_id, faces in person_groups.items():
        # Take top-m by score
        top_faces = sorted(faces, key=lambda f: f["score"], reverse=True)
        top_faces = top_faces[:max_faces_per_person]

        # Quality-weighted mean
        weights = [f["quality"] for f in top_faces]
        total_weight = sum(weights) or 1.0
        weighted_score = sum(
            f["score"] * f["quality"] for f in top_faces
        ) / total_weight

        avg_quality = sum(weights) / len(weights) if weights else 0.0

        asset_ids = list(set(f.get("asset_id", "") for f in top_faces if f.get("asset_id")))

        is_unknown = person_id is None or person_id.startswith("unknown")

        results.append({
            "person_id": None if is_unknown else person_id,
            "person_name": top_faces[0].get("person_name") if (top_faces and not is_unknown) else None,
            "score": weighted_score,
            "avg_quality": avg_quality,
            "face_count": len(faces),
            "asset_ids": asset_ids,
        })

    return sorted(results, key=lambda r: r["score"], reverse=True)


def _verifier_rerank(stage1: list[dict]) -> list[dict]:
    """
    Verifier v1: MLP on pair features (§5.7 stage 2).

    For now, passthrough with score adjustment based on quality.
    Phase 2 will train a proper MLP on [cosine, Δquality, quality_product].
    """
    for item in stage1:
        # Simple quality-boosted score
        quality_factor = 0.7 + 0.3 * item.get("avg_quality", 0.5)
        item["verifier_score"] = item["score"] * quality_factor

    return sorted(stage1, key=lambda r: r["verifier_score"], reverse=True)


def _rrf_fusion(
    face_rank: list[dict],
    clip_rank: Optional[list] = None,
    ocr_rank: Optional[list] = None,
    k: int = 60,
) -> list[dict]:
    """
    Reciprocal Rank Fusion — Phase 3 hybrid slot.

    RRF(d) = Σ 1/(k + rank_i(d)) for each ranker.
    Currently only face rank is active.
    """
    # Phase 3: merge face, CLIP, and OCR rankings
    # For now, just return face rank
    return face_rank


async def _check_access(user_id: str, group_id: str, db_pool) -> bool:
    """Check if user has access to the search group."""
    if db_pool is None:
        return True  # dev mode

    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT role FROM search_group_members "
                "WHERE group_id = $1 AND user_id = $2",
                uuid_lib.UUID(group_id),
                uuid_lib.UUID(user_id),
            )
            return row is not None
    except Exception as e:
        logger.error(f"Access check failed: {e}")
        return False


async def _get_tau_search(
    tenant_id: str, group_id: str, db_pool
) -> float:
    """Get per-group calibrated search threshold."""
    if db_pool is None:
        return 0.4

    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT tau_search FROM calibration_thresholds "
                "WHERE tenant_id = $1 AND group_id = $2",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            if row:
                return float(row["tau_search"])
    except Exception as e:
        logger.warning(f"Failed to get calibrated search threshold: {e}")

    return 0.4
