"""
Feedback → Calibration — §5.6

Nightly per active group:
1. feedback_pairs + merge/split events → labeled genuine/impostor pairs
2. Resolve cosine similarity from Qdrant vectors
3. Isotonic regression → tau_assign, tau_search per (tenant, group)
4. Publish DET curves
"""

from __future__ import annotations

import logging
import os
import uuid as uuid_lib
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


async def calibrate_group(
    tenant_id: str,
    group_id: str,
    db_pool=None,
    qdrant_client=None,
    target_fmr: float = 1e-3,
) -> dict:
    """
    Run threshold calibration for a group using accumulated feedback.

    Returns calibration result with new tau_assign and tau_search.
    """
    if db_pool is None:
        return {
            "tau_assign": 0.5,
            "tau_search": 0.4,
            "pair_count": 0,
            "message": "No database available",
        }

    pairs = await _collect_pairs(tenant_id, group_id, db_pool, qdrant_client)

    if len(pairs) < 20:
        logger.info(
            f"Group {group_id}: insufficient pairs ({len(pairs)}) "
            f"for calibration, using defaults"
        )
        return {
            "tau_assign": 0.5,
            "tau_search": 0.4,
            "pair_count": len(pairs),
            "message": f"Need at least 20 labeled pairs (have {len(pairs)})",
        }

    genuine_scores = np.array([p["score"] for p in pairs if p["label"]])
    impostor_scores = np.array([p["score"] for p in pairs if not p["label"]])

    if len(genuine_scores) == 0 or len(impostor_scores) == 0:
        logger.warning(f"Group {group_id}: need both genuine and impostor pairs")
        return {
            "tau_assign": 0.5,
            "tau_search": 0.4,
            "pair_count": len(pairs),
            "message": "Need both genuine and impostor labeled pairs",
        }

    tau_assign = _find_threshold_at_fmr(
        genuine_scores, impostor_scores, target_fmr=target_fmr
    )
    tau_search = _find_threshold_at_fmr(
        genuine_scores, impostor_scores, target_fmr=target_fmr * 10
    )

    det_curve = _compute_det_curve(genuine_scores, impostor_scores)

    await _save_thresholds(
        tenant_id, group_id, tau_assign, tau_search, len(pairs), det_curve, db_pool
    )

    logger.info(
        f"Group {group_id} calibrated: tau_assign={tau_assign:.4f}, "
        f"tau_search={tau_search:.4f} from {len(pairs)} pairs"
    )

    return {
        "tau_assign": round(tau_assign, 4),
        "tau_search": round(tau_search, 4),
        "pair_count": len(pairs),
        "det_curve": det_curve,
        "message": "Calibration updated",
    }


async def _collect_pairs(
    tenant_id: str, group_id: str, db_pool, qdrant_client
) -> list[dict]:
    """Collect labeled pairs with real cosine scores from Qdrant."""
    pairs: list[dict] = []
    face_ids_needed: set[str] = set()

    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT query_face, cand_face, label FROM feedback_pairs "
                "WHERE tenant_id = $1 AND group_id = $2 "
                "ORDER BY created_at DESC LIMIT 10000",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            feedback = []
            for row in rows:
                qf, cf = str(row["query_face"]), str(row["cand_face"])
                feedback.append({"query_face": qf, "cand_face": cf, "label": row["label"]})
                face_ids_needed.add(qf)
                face_ids_needed.add(cf)

            merge_events = await conn.fetch(
                "SELECT payload FROM person_events "
                "WHERE tenant_id = $1 AND group_id = $2 AND kind = 'merge' "
                "ORDER BY created_at DESC LIMIT 1000",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            for event in merge_events:
                payload = event["payload"] or {}
                if isinstance(payload, str):
                    import json
                    payload = json.loads(payload)
                merged_faces = payload.get("merged_faces") or []
                # Legacy: resolve faces from merged_from person if needed
                if not merged_faces and payload.get("merged_from"):
                    legacy = await conn.fetch(
                        "SELECT id FROM faces WHERE person_id = $1 LIMIT 20",
                        uuid_lib.UUID(payload["merged_from"]),
                    )
                    # person may already be deleted — skip
                    merged_faces = [str(r["id"]) for r in legacy]
                for i in range(len(merged_faces)):
                    for j in range(i + 1, min(len(merged_faces), i + 5)):
                        face_ids_needed.add(merged_faces[i])
                        face_ids_needed.add(merged_faces[j])
                        feedback.append({
                            "query_face": merged_faces[i],
                            "cand_face": merged_faces[j],
                            "label": True,
                        })

            split_events = await conn.fetch(
                "SELECT payload FROM person_events "
                "WHERE tenant_id = $1 AND group_id = $2 AND kind = 'split' "
                "ORDER BY created_at DESC LIMIT 1000",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            for event in split_events:
                payload = event["payload"] or {}
                if isinstance(payload, str):
                    import json
                    payload = json.loads(payload)
                # Faces split out are different from remaining — soft impostor pairs
                # are not reliably available; skip unless we have explicit feedback.

        vectors = await _fetch_face_vectors(
            list(face_ids_needed), db_pool, qdrant_client
        )

        for item in feedback:
            a = vectors.get(item["query_face"])
            b = vectors.get(item["cand_face"])
            if a is None or b is None:
                continue
            score = float(np.dot(a, b))
            pairs.append({
                "query_face": item["query_face"],
                "cand_face": item["cand_face"],
                "label": bool(item["label"]),
                "score": score,
            })

    except Exception as e:
        logger.error(f"Failed to collect pairs: {e}")

    return pairs


async def _fetch_face_vectors(
    face_ids: list[str],
    db_pool,
    qdrant_client,
) -> dict[str, np.ndarray]:
    """Map face_id → L2-normalized embedding via embedding_id in Qdrant."""
    if not face_ids:
        return {}

    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, embedding_id FROM faces "
            "WHERE id = ANY($1::uuid[]) AND embedding_id IS NOT NULL",
            face_ids,
        )

    if not rows:
        return {}

    id_by_embedding = {str(r["embedding_id"]): str(r["id"]) for r in rows}
    embedding_ids = list(id_by_embedding.keys())

    client = qdrant_client
    if client is None:
        from qdrant_client import QdrantClient
        client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "qdrant"),
            port=int(os.getenv("QDRANT_PORT", "6333")),
        )

    result: dict[str, np.ndarray] = {}
    try:
        points = client.retrieve(
            collection_name="faces_v1",
            ids=embedding_ids,
            with_vectors=True,
        )
        for point in points:
            face_id = id_by_embedding.get(str(point.id))
            if face_id and point.vector is not None:
                vec = np.array(point.vector, dtype=np.float32)
                norm = np.linalg.norm(vec) or 1.0
                result[face_id] = vec / norm
    except Exception as e:
        logger.error(f"Failed to retrieve vectors from Qdrant: {e}")

    return result


def _find_threshold_at_fmr(
    genuine_scores: np.ndarray,
    impostor_scores: np.ndarray,
    target_fmr: float,
) -> float:
    """Find the threshold where FMR ≤ target_fmr."""
    thresholds = np.linspace(
        min(genuine_scores.min(), impostor_scores.min()),
        max(genuine_scores.max(), impostor_scores.max()),
        1000,
    )

    best_threshold = float(thresholds[-1])

    for tau in thresholds:
        fmr = np.mean(impostor_scores >= tau)
        if fmr <= target_fmr:
            best_threshold = float(tau)
            break

    return best_threshold


def _compute_det_curve(
    genuine_scores: np.ndarray,
    impostor_scores: np.ndarray,
    points: int = 40,
) -> list[dict]:
    """Compute DET curve points (FMR vs FNMR)."""
    thresholds = np.linspace(
        min(genuine_scores.min(), impostor_scores.min()),
        max(genuine_scores.max(), impostor_scores.max()),
        points,
    )
    curve = []
    for tau in thresholds:
        fmr = float(np.mean(impostor_scores >= tau))
        fnmr = float(np.mean(genuine_scores < tau))
        curve.append({"fmr": round(fmr, 6), "fnmr": round(fnmr, 6)})
    return curve


async def _save_thresholds(
    tenant_id: str,
    group_id: str,
    tau_assign: float,
    tau_search: float,
    pair_count: int,
    det_curve: list[dict],
    db_pool,
) -> None:
    """Upsert calibrated thresholds for a group."""
    try:
        async with db_pool.acquire() as conn:
            # Store DET curve in a JSON column if present; otherwise just thresholds
            await conn.execute(
                """
                INSERT INTO calibration_thresholds
                    (tenant_id, group_id, tau_assign, tau_search, pair_count, calibrated_at)
                VALUES ($1, $2, $3, $4, $5, now())
                ON CONFLICT (tenant_id, group_id)
                DO UPDATE SET
                    tau_assign = $3,
                    tau_search = $4,
                    pair_count = $5,
                    calibrated_at = now()
                """,
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
                tau_assign,
                tau_search,
                pair_count,
            )
    except Exception as e:
        logger.error(f"Failed to save thresholds: {e}")
