"""
Online Person Assignment — §5.6 Identity Layer (The Moat)

Per new face, after indexing:
1. ANN search in Qdrant with mandatory tenant_id + group_id filter
2. Group top-k by person
3. Quality-weighted mean score per person
4. Compare best against per-group calibrated tau_assign
5. Margin check for confidence
6. Cold-start: create a new person when no match exists
7. Emit person_events on assignment
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
    embedding_id: Optional[str] = None,
) -> Optional[uuid_lib.UUID]:
    """
    Online assignment of a face to a person (§5.6).

    Returns the assigned person_id. Creates a new person on cold-start
    when no existing person matches above threshold.
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

    # Cold-start: no existing persons in the neighborhood → create new person
    if not by_person:
        return await _create_person_and_assign(
            face_id=face_id,
            tenant_id=tenant_id,
            group_id=group_id,
            db_pool=db_pool,
            qdrant_client=qdrant_client,
            embedding_id=embedding_id,
            reason="cold_start",
        )

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
        # Keep Qdrant payload in sync
        await _sync_qdrant_person(
            face_id=face_id,
            person_id=best_pid,
            embedding_id=embedding_id,
            qdrant_client=qdrant_client,
            db_pool=db_pool,
        )
        # Bump face_count
        await _increment_face_count(best_pid, db_pool)

        logger.info(
            f"Assigned face {face_id} to person {best_pid} "
            f"(score={best_score:.3f}, margin={margin:.3f})"
        )
        return uuid_lib.UUID(best_pid)

    # Below threshold → create a new person rather than leaving unassigned forever
    return await _create_person_and_assign(
        face_id=face_id,
        tenant_id=tenant_id,
        group_id=group_id,
        db_pool=db_pool,
        qdrant_client=qdrant_client,
        embedding_id=embedding_id,
        reason="below_threshold",
        score=best_score,
        tau=tau,
    )


async def _create_person_and_assign(
    face_id: uuid_lib.UUID,
    tenant_id: str,
    group_id: str,
    db_pool,
    qdrant_client,
    embedding_id: Optional[str],
    reason: str,
    score: float = 0.0,
    tau: float = 0.0,
) -> Optional[uuid_lib.UUID]:
    """Create a new person and assign this face to it (cold-start)."""
    if db_pool is None:
        logger.warning("No DB pool — cannot create person for cold-start")
        return None

    new_person_id = uuid_lib.uuid4()
    try:
        async with db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO persons (id, tenant_id, group_id, face_count, "
                "rep_face_id, created_by) VALUES ($1, $2, $3, 1, $4, $5)",
                new_person_id,
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
                face_id,
                "system:assignment",
            )
            await conn.execute(
                "UPDATE faces SET person_id = $1 WHERE id = $2",
                new_person_id,
                face_id,
            )

        await _emit_event(
            tenant_id=tenant_id,
            group_id=group_id,
            person_id=str(new_person_id),
            face_id=str(face_id),
            kind="assign",
            payload={
                "reason": reason,
                "score": round(score, 4),
                "tau": round(tau, 4),
                "new_person": True,
            },
            db_pool=db_pool,
        )

        await _sync_qdrant_person(
            face_id=face_id,
            person_id=str(new_person_id),
            embedding_id=embedding_id,
            qdrant_client=qdrant_client,
            db_pool=db_pool,
        )

        logger.info(
            f"Cold-start: created person {new_person_id} for face {face_id} ({reason})"
        )
        return new_person_id
    except Exception as e:
        logger.error(f"Failed to create person for face {face_id}: {e}")
        return None


async def _sync_qdrant_person(
    face_id: uuid_lib.UUID,
    person_id: str,
    embedding_id: Optional[str],
    qdrant_client,
    db_pool,
) -> None:
    """Update Qdrant person_id payload for this face."""
    try:
        from packages.common.qdrant_identity import set_person_payload

        eid = embedding_id
        if not eid and db_pool is not None:
            async with db_pool.acquire() as conn:
                eid = await conn.fetchval(
                    "SELECT embedding_id FROM faces WHERE id = $1",
                    face_id,
                )
                eid = str(eid) if eid else None

        if eid:
            set_person_payload([eid], person_id, qdrant_client=qdrant_client)
    except Exception as e:
        logger.error(f"Qdrant person_id sync failed for face {face_id}: {e}")


async def _increment_face_count(person_id: str, db_pool) -> None:
    if db_pool is None:
        return
    try:
        async with db_pool.acquire() as conn:
            await conn.execute(
                "UPDATE persons SET face_count = face_count + 1, "
                "updated_at = now() WHERE id = $1",
                uuid_lib.UUID(person_id),
            )
    except Exception as e:
        logger.warning(f"Failed to increment face_count: {e}")


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
                "system:assignment",
            )
    except Exception as e:
        logger.error(f"Failed to emit person event: {e}")
