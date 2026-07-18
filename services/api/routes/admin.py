"""
Admin Routes — §5.8 / §5.11

GET /v1/admin/eval/det?group=… — per-group DET/ROC, threshold report
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from packages.schemas.api_models import EvalResponse
from services.api.auth import UserInfo, get_current_user
from services.api.database import get_pool

router = APIRouter(prefix="/v1/admin", tags=["Admin"])


@router.get("/eval/det", response_model=EvalResponse)
async def get_det_curve(
    group: uuid.UUID = Query(..., description="Group ID to evaluate"),
    user: UserInfo = Depends(get_current_user),
):
    """
    Per-group DET/ROC evaluation results and threshold report (§5.11).

    Returns calibrated thresholds, pair counts, and DET curve data.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        cal = await conn.fetchrow(
            "SELECT * FROM calibration_thresholds WHERE group_id = $1",
            group,
        )
        pair_count = await conn.fetchval(
            "SELECT COUNT(*) FROM feedback_pairs WHERE group_id = $1",
            group,
        )

    if cal:
        return EvalResponse(
            group_id=group,
            tau_assign=cal["tau_assign"],
            tau_search=cal["tau_search"],
            pair_count=cal["pair_count"],
            calibrated_at=cal["calibrated_at"],
        )

    return EvalResponse(
        group_id=group,
        tau_assign=0.5,
        tau_search=0.4,
        pair_count=pair_count or 0,
    )
