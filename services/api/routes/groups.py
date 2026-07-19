"""
Search Groups Routes — §5.8

POST   /v1/groups       — create search group (max_active_images=15000)
GET    /v1/groups       — list groups for caller
GET    /v1/groups/{id}  — includes active_image_count / quota remaining
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from packages.schemas.api_models import (
    CreateGroupRequest,
    GroupListResponse,
    GroupResponse,
)
from services.api.auth import UserInfo, get_current_user
from services.api.database import get_pool

router = APIRouter(prefix="/v1/groups", tags=["Groups"])


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    req: CreateGroupRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Create a new search group with transactional 15K quota."""
    pool = await get_pool()
    group_id = uuid.uuid4()

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO search_groups (id, tenant_id, name, owner_user_id, max_active_images) "
            "VALUES ($1, $2, $3, $4, $5)",
            group_id, user.tenant_id, req.name, user.id, req.max_active_images,
        )
        # Add creator as owner
        await conn.execute(
            "INSERT INTO search_group_members (group_id, user_id, role) "
            "VALUES ($1, $2, 'owner')",
            group_id, user.id,
        )

    return GroupResponse(
        id=group_id,
        tenant_id=user.tenant_id,
        name=req.name,
        owner_user_id=user.id,
        max_active_images=req.max_active_images,
        active_image_count=0,
        quota_remaining=req.max_active_images,
        status="active",
        created_at=datetime.utcnow(),
    )


@router.get("", response_model=GroupListResponse)
async def list_groups(user: UserInfo = Depends(get_current_user)):
    """List all groups the caller has access to."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT g.* FROM search_groups g "
            "JOIN search_group_members m ON g.id = m.group_id "
            "WHERE m.user_id = $1 AND g.status = 'active' "
            "ORDER BY g.created_at DESC",
            user.id,
        )

    groups = [
        GroupResponse(
            id=r["id"],
            tenant_id=r["tenant_id"],
            name=r["name"],
            owner_user_id=r["owner_user_id"],
            max_active_images=r["max_active_images"],
            active_image_count=r["active_image_count"],
            quota_remaining=r["max_active_images"] - r["active_image_count"],
            status=r["status"],
            created_at=r["created_at"],
        )
        for r in rows
    ]

    return GroupListResponse(groups=groups, total=len(groups))


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(group_id: uuid.UUID, user: UserInfo = Depends(get_current_user)):
    """Get group details including quota status."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT g.* FROM search_groups g "
            "JOIN search_group_members m ON g.id = m.group_id "
            "WHERE g.id = $1 AND m.user_id = $2",
            group_id, user.id,
        )

    if not row:
        raise HTTPException(status_code=404, detail="Group not found")

    return GroupResponse(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        owner_user_id=row["owner_user_id"],
        max_active_images=row["max_active_images"],
        active_image_count=row["active_image_count"],
        quota_remaining=row["max_active_images"] - row["active_image_count"],
        status=row["status"],
        created_at=row["created_at"],
    )
