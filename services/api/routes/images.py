"""
Asset Image Serving — serves images from MinIO storage.

GET /v1/assets/{asset_id}/image — stream original image from object store
"""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from services.api.auth import UserInfo, get_current_user
from services.api.database import get_pool

router = APIRouter(prefix="/v1/assets", tags=["Asset Images"])


@router.get("/{asset_id}/image")
async def get_asset_image(
    asset_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """Stream the original image for an asset from MinIO."""
    pool = await get_pool()

    # Look up asset to get the object key
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT tenant_id, group_id, source_object_id, filename, status "
            "FROM assets WHERE id = $1",
            asset_id,
        )

    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")

    if row["status"] == "deleted":
        raise HTTPException(status_code=410, detail="Asset has been deleted")

    # Build the object key — matches the upload pattern in assets.py
    object_key = row["source_object_id"]
    if not object_key:
        # Fallback: reconstruct from known pattern
        object_key = f"{row['tenant_id']}/{row['group_id']}/originals/{asset_id}/{row['filename']}"

    try:
        from minio import Minio

        minio_client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
            secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
        )

        bucket = os.getenv("MINIO_BUCKET", "photogenic")
        response = minio_client.get_object(bucket, object_key)

        # Guess content type from filename
        filename = row["filename"] or "image.jpg"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        content_types = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
            "gif": "image/gif",
            "heic": "image/heic",
        }
        content_type = content_types.get(ext, "image/jpeg")

        def stream():
            try:
                for chunk in response.stream(8192):
                    yield chunk
            finally:
                response.close()
                response.release_conn()

        return StreamingResponse(
            stream(),
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": f'inline; filename="{filename}"',
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not retrieve image: {e}")
