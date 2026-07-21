"""
Asset & Face Image Serving — streams images from MinIO storage.

GET /v1/assets/{asset_id}/image — stream original image (ACL-protected)
GET /v1/faces/{face_id}/crop    — stream face crop (ACL-protected)
"""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from services.api.auth import (
    UserInfo,
    get_current_user,
    require_asset_access,
    require_face_access,
)

assets_router = APIRouter(prefix="/v1/assets", tags=["Asset Images"])
faces_router = APIRouter(prefix="/v1/faces", tags=["Face Crops"])


def _minio_client():
    from minio import Minio

    return Minio(
        os.getenv("MINIO_ENDPOINT", "minio:9000"),
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
        secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
    )


def _stream_object(object_key: str, content_type: str, filename: str):
    minio_client = _minio_client()
    bucket = os.getenv("MINIO_BUCKET", "photogenic")
    response = minio_client.get_object(bucket, object_key)

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
            "Cache-Control": "private, max-age=86400",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@assets_router.get("/{asset_id}/image")
async def get_asset_image(
    asset_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """Stream the original image for an asset from MinIO."""
    row = await require_asset_access(user, asset_id, required_role="viewer")

    object_key = row["source_object_id"]
    if not object_key:
        object_key = (
            f"{row['tenant_id']}/{row['group_id']}/originals/"
            f"{asset_id}/{row['filename']}"
        )

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
    content_type = row.get("mime_type") or content_types.get(ext, "image/jpeg")

    try:
        return _stream_object(object_key, content_type, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not retrieve image: {e}")


@faces_router.get("/{face_id}/crop")
async def get_face_crop(
    face_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """Stream a persisted face crop from MinIO."""
    row = await require_face_access(user, face_id, required_role="viewer")

    crop_path = row.get("crop_path")
    if not crop_path:
        raise HTTPException(
            status_code=404,
            detail="Face crop not available",
        )

    try:
        return _stream_object(crop_path, "image/jpeg", f"{face_id}.jpg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not retrieve crop: {e}")


# Backwards-compatible alias used by main.py
router = assets_router
