"""
Admin Routes — §5.8 / §5.11

GET  /v1/admin/eval/det?group=… — per-group DET/ROC, threshold report
POST /v1/admin/calibrate?group=… — proxy to Identity /calibrate
"""

from __future__ import annotations

import os
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from packages.schemas.api_models import DETPoint, EvalResponse
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

router = APIRouter(prefix="/v1/admin", tags=["Admin"])

IDENTITY_SERVICE_URL = os.getenv("IDENTITY_SERVICE_URL", "http://identity:8002")


@router.get("/eval/det", response_model=EvalResponse)
async def get_det_curve(
    group: uuid.UUID = Query(..., description="Group ID to evaluate"),
    user: UserInfo = Depends(get_current_user),
):
    """
    Per-group DET/ROC evaluation results and threshold report (§5.11).
    """
    await require_group_access(user, group, required_role="viewer")
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
            det_curve=[],
            calibrated_at=cal["calibrated_at"],
        )

    return EvalResponse(
        group_id=group,
        tau_assign=0.5,
        tau_search=0.4,
        pair_count=pair_count or 0,
        det_curve=[],
    )


@router.post("/calibrate")
async def calibrate_group(
    group: uuid.UUID = Query(..., description="Group ID to calibrate"),
    user: UserInfo = Depends(get_current_user),
):
    """
    Proxy to Identity service /calibrate — updates per-group thresholds
    from feedback pairs and merge events.
    """
    await require_group_access(user, group, required_role="editor")
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT tenant_id FROM search_groups WHERE id = $1",
            group,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")

    tenant_id = str(row["tenant_id"])

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{IDENTITY_SERVICE_URL}/calibrate",
                json={"tenant_id": tenant_id, "group_id": str(group)},
            )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Identity service unreachable: {e}",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Calibration failed: {resp.text}",
        )

    result = resp.json()

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO audit_log (tenant_id, user_id, action, resource, details) "
            "VALUES ($1, $2, 'calibrate', $3, $4)",
            user.tenant_id,
            user.id,
            f"group:{group}",
            {
                "tau_assign": result.get("tau_assign"),
                "tau_search": result.get("tau_search"),
                "pair_count": result.get("pair_count"),
            },
        )

    return {
        "group_id": str(group),
        "tau_assign": result.get("tau_assign", 0.5),
        "tau_search": result.get("tau_search", 0.4),
        "pair_count": result.get("pair_count", 0),
        "message": result.get("message", "Calibration completed"),
        "det_curve": [
            DETPoint(**p) for p in result.get("det_curve", []) if isinstance(p, dict)
        ],
    }
