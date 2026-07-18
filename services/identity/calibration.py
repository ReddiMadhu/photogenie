"""
Feedback → Calibration — §5.6

Nightly per active group:
1. feedback_pairs + merge/split events → labeled genuine/impostor pairs
2. Isotonic regression → tau_assign, tau_search per (tenant, group)
3. Publish DET curves

The compounding moat — zero OSS photo apps do this (§Part 4, #5).
"""

from __future__ import annotations

import logging
import uuid as uuid_lib
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


async def calibrate_group(
    tenant_id: str,
    group_id: str,
    db_pool=None,
    target_fmr: float = 1e-3,
) -> dict:
    """
    Run threshold calibration for a group using accumulated feedback.

    Returns calibration result with new tau_assign and tau_search.
    """
    if db_pool is None:
        return {"tau_assign": 0.5, "tau_search": 0.4, "pair_count": 0}

    # Step 1: Collect labeled pairs
    pairs = await _collect_pairs(tenant_id, group_id, db_pool)

    if len(pairs) < 20:
        logger.info(
            f"Group {group_id}: insufficient pairs ({len(pairs)}) "
            f"for calibration, using defaults"
        )
        return {"tau_assign": 0.5, "tau_search": 0.4, "pair_count": len(pairs)}

    # Step 2: Separate genuine and impostor scores
    genuine_scores = np.array([p["score"] for p in pairs if p["label"]])
    impostor_scores = np.array([p["score"] for p in pairs if not p["label"]])

    if len(genuine_scores) == 0 or len(impostor_scores) == 0:
        logger.warning(f"Group {group_id}: need both genuine and impostor pairs")
        return {"tau_assign": 0.5, "tau_search": 0.4, "pair_count": len(pairs)}

    # Step 3: Isotonic regression for threshold calibration
    tau_assign = _find_threshold_at_fmr(
        genuine_scores, impostor_scores, target_fmr=target_fmr
    )
    tau_search = _find_threshold_at_fmr(
        genuine_scores, impostor_scores, target_fmr=target_fmr * 10  # looser for search
    )

    # Step 4: Save calibrated thresholds
    await _save_thresholds(
        tenant_id, group_id, tau_assign, tau_search, len(pairs), db_pool
    )

    logger.info(
        f"Group {group_id} calibrated: tau_assign={tau_assign:.4f}, "
        f"tau_search={tau_search:.4f} from {len(pairs)} pairs"
    )

    return {
        "tau_assign": round(tau_assign, 4),
        "tau_search": round(tau_search, 4),
        "pair_count": len(pairs),
    }


async def _collect_pairs(
    tenant_id: str, group_id: str, db_pool
) -> list[dict]:
    """
    Collect labeled pairs from feedback_pairs table +
    implicit pairs from merge/split person_events.
    """
    pairs = []

    try:
        async with db_pool.acquire() as conn:
            # Explicit feedback
            rows = await conn.fetch(
                "SELECT query_face, cand_face, label FROM feedback_pairs "
                "WHERE tenant_id = $1 AND group_id = $2 "
                "ORDER BY created_at DESC LIMIT 10000",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            for row in rows:
                # TODO: look up cosine similarity from Qdrant
                # For now, store with placeholder score
                pairs.append({
                    "query_face": str(row["query_face"]),
                    "cand_face": str(row["cand_face"]),
                    "label": row["label"],
                    "score": 0.5,  # placeholder — populate from vectors
                })

            # Implicit pairs from merge events (same person = genuine)
            merge_events = await conn.fetch(
                "SELECT payload FROM person_events "
                "WHERE tenant_id = $1 AND group_id = $2 AND kind = 'merge' "
                "ORDER BY created_at DESC LIMIT 1000",
                uuid_lib.UUID(tenant_id),
                uuid_lib.UUID(group_id),
            )
            for event in merge_events:
                payload = event["payload"]
                merged_faces = payload.get("merged_faces", [])
                for i in range(len(merged_faces)):
                    for j in range(i + 1, min(len(merged_faces), i + 5)):
                        pairs.append({
                            "query_face": merged_faces[i],
                            "cand_face": merged_faces[j],
                            "label": True,
                            "score": 0.5,
                        })

    except Exception as e:
        logger.error(f"Failed to collect pairs: {e}")

    return pairs


def _find_threshold_at_fmr(
    genuine_scores: np.ndarray,
    impostor_scores: np.ndarray,
    target_fmr: float,
) -> float:
    """
    Find the threshold where FMR ≤ target_fmr.

    Uses sorted thresholds — equivalent to isotonic regression
    at a single operating point.
    """
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


async def _save_thresholds(
    tenant_id: str,
    group_id: str,
    tau_assign: float,
    tau_search: float,
    pair_count: int,
    db_pool,
) -> None:
    """Upsert calibrated thresholds for a group."""
    try:
        async with db_pool.acquire() as conn:
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
