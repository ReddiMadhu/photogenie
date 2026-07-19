"""
Online Person Assignment — §5.6 Identity Layer (The Moat)

Per new face, after indexing:
1. ANN search in Qdrant with mandatory tenant_id + group_id filter
2. Group top-k by person
3. Quality-weighted mean score per person
4. Compare best against per-group calibrated tau_assign
5. Margin check for confidence
6. Emit person_events on assignment

This is the gap Immich fills with single-pass NN majority vote (§2.1.2)
and PhotoPrism fills with fixed-threshold euclidean merge (§2.2.2).
"""

from __future__ import annotations

import logging
import uuid as uuid_lib
from collections import defaultdict
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Defaults (overridden by per-group calibration)
DEFAULT_TAU_ASSIGN = 0.5
MARGIN_MIN = 0.05


async def assign_person(
    face_id: uuid_lib.UUID,
    face_embedding: list[float],
    face_quality: float,
    tenant_id: str,
    group_id: str,
    qdrant_client=None,
    db_pool=None,
) -> Optional[uuid_lib.UUID]:
    """
    Online assignment of a face to a person (§5.6).

    Returns the assigned person_id, or None if the face stays unknown.
    """
    if qdrant_client is None:
        logger.warning("No Qdrant client — skipping assignment")
        return None

    # Step 1: ANN search with mandatory group filter
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    query_resp = qdrant_client.query_points(
        collection_name="faces_v1",
        query=face_embedding,
        limit=32,
        query_filter=Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="group_id", match=MatchValue(value=group_id)),
            ]
        ),
    )
    search_result = query_resp.points

    if not search_result:
        logger.debug(f"No candidates found for face {face_id} in group {group_id}")
        return None

    # Step 2: Group top-k by person_id
    by_person: dict[str, list[dict]] = defaultdict(list)
    for hit in search_result:
        pid = hit.payload.get("person_id")
        if pid:
            by_person[pid].append({
                "score": hit.score,
                "quality": hit.payload.get("quality", 0.5),
                "face_id": hit.payload.get("face_id"),
            })

    if not by_person:
        return None

    # Step 3: Quality-weighted mean score per person (max 5 faces per person)
    scores = {}
    for person_id, faces in by_person.items():
        top_faces = sorted(faces, key=lambda f: f["score"], reverse=True)[:5]
        weights = [f["quality"] for f in top_faces]
        total_weight = sum(weights) or 1.0
        weighted_score = sum(
            f["score"] * f["quality"] for f in top_faces
        ) / total_weight
        scores[person_id] = weighted_score

    # Step 4: Get per-group threshold
    tau = await _get_tau_assign(tenant_id, group_id, db_pool)

    # Step 5: Top-1 with margin check
    sorted_persons = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    best_pid, best_score = sorted_persons[0]

    margin = (
        best_score - sorted_persons[1][1]
        if len(sorted_persons) > 1
        else best_score
    )

    if best_score >= tau and margin >= MARGIN_MIN:
        # Step 6: Emit assignment event
        await _emit_event(
            tenant_id=tenant_id,
            group_id=group_id,
            person_id=best_pid,
            face_id=str(face_id),
            kind="assign",
            payload={
                "score": round(best_score, 4),
                "margin": round(margin, 4),
                "candidates": len(by_person),
            },
            db_pool=db_pool,
        )
        logger.info(
            f"Assigned face {face_id} to person {best_pid} "
            f"(score={best_score:.3f}, margin={margin:.3f})"
        )
        return uuid_lib.UUID(best_pid)

    logger.debug(
        f"Face {face_id} stays unknown (best={best_score:.3f}, "
        f"tau={tau:.3f}, margin={margin:.3f})"
    )
    return None


async def _get_tau_assign(
    tenant_id: str, group_id: str, db_pool
) -> float:
    """Get per-group calibrated assignment threshold."""
    if db_pool is None:
        return DEFAULT_TAU_ASSIGN

    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT tau_assign FROM calibration_thresholds "
                "WHERE tenant_id = $1 AND group_id = $2",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            if row:
                return float(row["tau_assign"])
    except Exception as e:
        logger.warning(f"Failed to get calibrated threshold: {e}")

    return DEFAULT_TAU_ASSIGN


async def _emit_event(
    tenant_id: str,
    group_id: str,
    person_id: str,
    face_id: str,
    kind: str,
    payload: dict,
    db_pool,
) -> None:
    """Write a person_event to Postgres."""
    if db_pool is None:
        return

    try:
        async with db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO person_events "
                "(tenant_id, group_id, person_id, kind, payload, actor) "
                "VALUES ($1, $2, $3, $4, $5, $6)",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
                uuid_lib.UUID(person_id) if person_id else None,
                kind,
                payload,
                f"system:assignment",
            )
    except Exception as e:
        logger.error(f"Failed to emit person event: {e}")
