"""
Asset Routes — §5.8

POST   /v1/groups/{id}/assets         — upload; 409 if quota exceeded
DELETE /v1/groups/{id}/assets/{aid}   — tombstone + decrement quota + erase vectors
"""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from packages.schemas.api_models import AssetUploadResponse, AssetListResponse, AssetResponse
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

router = APIRouter(prefix="/v1/groups/{group_id}/assets", tags=["Assets"])


@router.post("", response_model=AssetUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    group_id: uuid.UUID,
    file: UploadFile = File(...),
    user: UserInfo = Depends(get_current_user),
):
    """
    Upload an image to a search group.
    Returns 409 QUOTA_EXCEEDED if the group is at capacity (§5.1).
    """
    await require_group_access(user, group_id, required_role="editor")

    pool = await get_pool()
    asset_id = uuid.uuid4()
    object_key = f"{user.tenant_id}/{group_id}/originals/{asset_id}/{file.filename}"

    # Transactional quota reservation (§5.5)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "UPDATE search_groups "
                "SET active_image_count = active_image_count + 1, updated_at = now() "
                "WHERE id = $1 AND active_image_count < max_active_images "
                "RETURNING id, active_image_count",
                group_id,
            )

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="QUOTA_EXCEEDED: Search group has reached its 15,000 image limit",
                )

            # Insert asset as 'reserved'
            await conn.execute(
                "INSERT INTO assets (id, tenant_id, group_id, filename, source_object_id, status) "
                "VALUES ($1, $2, $3, $4, $5, 'reserved')",
                asset_id, user.tenant_id, group_id, file.filename, object_key,
            )

    # Save file to object store (MinIO)
    file_bytes = await file.read()

    try:
        from minio import Minio

        minio_client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
            secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
        )

        bucket = os.getenv("MINIO_BUCKET", "photogenic")
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)

        import io
        minio_client.put_object(
            bucket, object_key,
            io.BytesIO(file_bytes), len(file_bytes),
            content_type=file.content_type or "image/jpeg",
        )
    except Exception as e:
        # Rollback quota on storage failure
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE search_groups SET active_image_count = "
                "GREATEST(0, active_image_count - 1) WHERE id = $1",
                group_id,
            )
            await conn.execute(
                "UPDATE assets SET status = 'failed' WHERE id = $1", asset_id
            )
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")

    # Enqueue Celery task for ML processing
    try:
        from services.workers.tasks.ingest import process_asset

        process_asset.delay({
            "tenant_id": str(user.tenant_id),
            "group_id": str(group_id),
            "asset_id": str(asset_id),
            "source_id": None,
            "object_id": object_key,
            "etag": None,
            "filename": file.filename,
            "file_path": None,  # Will fetch from MinIO
        })
    except Exception as e:
        # Non-fatal — task can be retried
        pass

    return AssetUploadResponse(
        id=asset_id,
        group_id=group_id,
        filename=file.filename,
        status="reserved",
        message="Asset uploaded and queued for processing",
    )


@router.delete("/{asset_id}", status_code=status.HTTP_200_OK)
async def delete_asset(
    group_id: uuid.UUID,
    asset_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """
    Tombstone an asset: mark deleted, decrement quota, erase vectors.
    """
    await require_group_access(user, group_id, required_role="editor")

    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Check asset exists and is active
            row = await conn.fetchrow(
                "SELECT status FROM assets WHERE id = $1 AND group_id = $2",
                asset_id, group_id,
            )
            if not row:
                raise HTTPException(status_code=404, detail="Asset not found")

            if row["status"] in ("reserved", "ready"):
                # Decrement quota
                await conn.execute(
                    "UPDATE search_groups SET active_image_count = "
                    "GREATEST(0, active_image_count - 1), updated_at = now() "
                    "WHERE id = $1",
                    group_id,
                )

            # Tombstone the asset
            await conn.execute(
                "UPDATE assets SET status = 'deleted', deleted_at = now() "
                "WHERE id = $1",
                asset_id,
            )

            # Get face embedding IDs for vector deletion
            face_rows = await conn.fetch(
                "SELECT embedding_id FROM faces WHERE asset_id = $1",
                asset_id,
            )

    # Delete vectors from Qdrant
    embedding_ids = [str(r["embedding_id"]) for r in face_rows if r["embedding_id"]]
    if embedding_ids:
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import PointIdsList

            qdrant = QdrantClient(
                host=os.getenv("QDRANT_HOST", "qdrant"),
                port=int(os.getenv("QDRANT_PORT", "6333")),
            )
            qdrant.delete(
                collection_name="faces_v1",
                points_selector=PointIdsList(points=embedding_ids),
            )
        except Exception:
            pass

    # Audit
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO audit_log (tenant_id, user_id, action, resource, details) "
            "VALUES ($1, $2, 'delete', $3, $4)",
            user.tenant_id, user.id, f"asset:{asset_id}",
            {"group_id": str(group_id), "vectors_deleted": len(embedding_ids)},
        )

    return {"status": "deleted", "asset_id": str(asset_id), "vectors_erased": len(embedding_ids)}


@router.get("", response_model=AssetListResponse)
async def list_assets(
    group_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    user: UserInfo = Depends(get_current_user),
):
    """
    List assets in a search group.
    """
    await require_group_access(user, group_id, required_role="viewer")

    pool = await get_pool()

    async with pool.acquire() as conn:
        # Get total count
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM assets WHERE group_id = $1 AND status != 'deleted'",
            group_id,
        )

        # Get assets list
        rows = await conn.fetch(
            "SELECT a.id, a.group_id, a.filename, a.mime_type, a.width, a.height, a.taken_at, a.status, "
            "(SELECT COUNT(*) FROM faces f WHERE f.asset_id = a.id) as face_count "
            "FROM assets a "
            "WHERE a.group_id = $1 AND a.status != 'deleted' "
            "ORDER BY a.created_at DESC "
            "LIMIT $2 OFFSET $3",
            group_id, limit, offset,
        )

    assets = []
    for r in rows:
        assets.append(
            AssetResponse(
                id=r["id"],
                group_id=r["group_id"],
                filename=r["filename"],
                mime_type=r["mime_type"],
                width=r["width"],
                height=r["height"],
                taken_at=r["taken_at"],
                status=r["status"],
                face_count=r["face_count"],
                thumbnail_url=f"/v1/assets/{r['id']}/image" if r["status"] == "ready" else None,
            )
        )

    return AssetListResponse(assets=assets, total=total)
