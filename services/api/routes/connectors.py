"""
Connector Routes — §5.8

POST /v1/connectors/{kind}           — bind connector (gdrive only for runtime sync)
GET  /v1/connectors                  — list connectors with sync status
POST /v1/connectors/{id}/sync        — enqueue an immediate sync
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from packages.schemas.api_models import ConnectorResponse, CreateConnectorRequest
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

router = APIRouter(prefix="/v1/connectors", tags=["Connectors"])

# Only gdrive and upload are accepted; sharepoint/s3 rejected until adapters exist
SUPPORTED_KINDS = {"gdrive", "upload"}


def _status_from_config(config: dict | None) -> tuple[str, str | None, str | None]:
    cfg = config or {}
    last_error = cfg.get("last_error")
    last_sync_at = cfg.get("last_sync_at")
    if last_error:
        return "error", last_sync_at, last_error
    if last_sync_at:
        return "synced", last_sync_at, None
    return "configured", last_sync_at, None


@router.post("/{kind}", response_model=ConnectorResponse)
async def create_connector(
    kind: str,
    req: CreateConnectorRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Bind a connector to a search group. Runtime sync exists for gdrive only."""
    if kind not in SUPPORTED_KINDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported connector kind '{kind}'. "
                f"Supported: {sorted(SUPPORTED_KINDS)}. "
                "S3/SharePoint adapters are not implemented yet."
            ),
        )

    await require_group_access(user, req.group_id, required_role="editor")
    pool = await get_pool()
    source_id = uuid.uuid4()

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, tenant_id, group_id, kind, config) "
            "VALUES ($1, $2, $3, $4, $5)",
            source_id,
            user.tenant_id,
            req.group_id,
            kind,
            req.config,
        )

    status = "configured" if kind == "gdrive" else "active"
    return ConnectorResponse(
        id=source_id,
        group_id=req.group_id,
        kind=kind,
        status=status,
    )


@router.get("", response_model=list[ConnectorResponse])
async def list_connectors(
    group_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """List connectors with honest sync status (not always 'active')."""
    await require_group_access(user, group_id, required_role="viewer")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, group_id, kind, config FROM sources "
            "WHERE group_id = $1 AND tenant_id = $2",
            group_id,
            user.tenant_id,
        )

    results = []
    for r in rows:
        status, last_sync, last_error = _status_from_config(r["config"])
        if r["kind"] == "upload":
            status = "active"
        results.append(
            ConnectorResponse(
                id=r["id"],
                group_id=r["group_id"],
                kind=r["kind"],
                status=status,
                last_sync_at=last_sync,
                last_error=last_error,
            )
        )
    return results


@router.post("/{connector_id}/sync")
async def sync_connector(
    connector_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """Enqueue an immediate connector sync."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, group_id, kind, tenant_id FROM sources WHERE id = $1",
            connector_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    if row["tenant_id"] != user.tenant_id and not user.is_admin:
        raise HTTPException(status_code=403, detail="No access")

    await require_group_access(user, row["group_id"], required_role="editor")

    if row["kind"] != "gdrive":
        raise HTTPException(
            status_code=400,
            detail=f"Sync not available for kind '{row['kind']}'",
        )

    try:
        from services.workers.tasks.sync_connectors import sync_source

        sync_source.delay(str(connector_id))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not queue sync: {e}")

    return {"status": "queued", "queued": True, "connector_id": str(connector_id)}
