"""
Feedback Route — §5.6 / §5.8

POST /v1/groups/{id}/feedback — {query_face, cand_face, label}
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from packages.schemas.api_models import FeedbackRequest, FeedbackResponse
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

router = APIRouter(prefix="/v1/groups/{group_id}", tags=["Feedback"])


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    group_id: uuid.UUID,
    req: FeedbackRequest,
    user: UserInfo = Depends(get_current_user),
):
    """
    Submit feedback for threshold calibration (§5.6).
    Accumulates labeled pairs for per-group isotonic regression.
    """
    await require_group_access(user, group_id, required_role="editor")
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO feedback_pairs "
            "(tenant_id, group_id, query_face, cand_face, label, source) "
            "VALUES ($1, $2, $3, $4, $5, 'user') "
            "RETURNING id",
            user.tenant_id, group_id, req.query_face, req.cand_face, req.label,
        )

    return FeedbackResponse(id=row["id"], message="Feedback recorded")
