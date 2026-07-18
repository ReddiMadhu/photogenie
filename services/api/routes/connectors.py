"""
Connector Routes — §5.8

POST /v1/connectors/{kind} — bind connector to a group; delta sync begins
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from packages.schemas.api_models import ConnectorResponse, CreateConnectorRequest
from services.api.auth import UserInfo, get_current_user
from services.api.database import get_pool

router = APIRouter(prefix="/v1/connectors", tags=["Connectors"])


@router.post("/{kind}", response_model=ConnectorResponse)
async def create_connector(
    kind: str,
    req: CreateConnectorRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Bind a connector (gdrive, upload, sharepoint, s3) to a search group."""
    valid_kinds = {"gdrive", "upload", "sharepoint", "s3"}
    if kind not in valid_kinds:
        raise HTTPException(status_code=400, detail=f"Invalid kind. Must be one of: {valid_kinds}")

    pool = await get_pool()
    source_id = uuid.uuid4()

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, tenant_id, group_id, kind, config) "
            "VALUES ($1, $2, $3, $4, $5)",
            source_id, user.tenant_id, req.group_id, kind, req.config,
        )

    return ConnectorResponse(
        id=source_id, group_id=req.group_id, kind=kind, status="active"
    )
