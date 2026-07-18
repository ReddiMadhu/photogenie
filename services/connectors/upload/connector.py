"""
Upload Connector — local file upload handler.
"""

from __future__ import annotations

import logging
from typing import Optional

from services.connectors.base import BaseConnector, SyncItem

logger = logging.getLogger(__name__)


class UploadConnector(BaseConnector):
    """Direct upload connector — files are already stored in object store."""

    async def delta_sync(
        self, cursor: Optional[str] = None
    ) -> tuple[list[SyncItem], Optional[str]]:
        """Upload connector does not do delta sync — files arrive via API."""
        return [], cursor

    async def fetch_blob(self, object_id: str) -> bytes:
        """Fetch from MinIO/S3 object store."""
        import os
        from minio import Minio

        client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "changeme_minio_password"),
            secure=os.getenv("MINIO_USE_SSL", "false").lower() == "true",
        )

        bucket = os.getenv("MINIO_BUCKET", "photogenic")
        response = client.get_object(bucket, object_id)
        data = response.read()
        response.close()
        response.release_conn()
        return data

    async def mirror_acl(self, object_id: str) -> dict:
        """Upload connector — ACL is inherited from the search group."""
        return {"source": "upload", "inherited": True}
