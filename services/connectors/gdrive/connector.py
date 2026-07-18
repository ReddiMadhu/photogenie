"""
Google Drive Connector — §5.3

Delta sync using Google Drive Changes API with page token cursor.
ACL mirroring from Drive permissions.
"""

from __future__ import annotations

import logging
from typing import Optional

from services.connectors.base import BaseConnector, SyncItem

logger = logging.getLogger(__name__)

# Supported image MIME types
IMAGE_MIMES = {
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "image/heif", "image/tiff", "image/bmp", "image/gif",
}


class GDriveConnector(BaseConnector):
    """
    Google Drive connector using the Changes API for delta sync.

    Config expected:
    {
        "folder_id": "...",
        "credentials": {...},  # or path to service account JSON
    }
    """

    def __init__(self, source_id: str, group_id: str, tenant_id: str, config: dict):
        super().__init__(source_id, group_id, tenant_id, config)
        self._service = None

    def _get_service(self):
        """Lazily initialize the Google Drive API client."""
        if self._service is not None:
            return self._service

        try:
            from googleapiclient.discovery import build
            from google.oauth2.service_account import Credentials

            creds_info = self.config.get("credentials", {})
            if creds_info:
                creds = Credentials.from_service_account_info(
                    creds_info,
                    scopes=["https://www.googleapis.com/auth/drive.readonly"],
                )
                self._service = build("drive", "v3", credentials=creds)
            else:
                logger.error("No credentials provided for GDrive connector")

        except ImportError:
            logger.error(
                "google-api-python-client not installed. "
                "Install with: pip install google-api-python-client google-auth"
            )

        return self._service

    async def delta_sync(
        self, cursor: Optional[str] = None
    ) -> tuple[list[SyncItem], Optional[str]]:
        """
        Fetch changes from Google Drive using the Changes API.

        Uses page tokens for incremental sync — only fetches what changed
        since the last sync.
        """
        service = self._get_service()
        if service is None:
            return [], cursor

        items = []

        try:
            if cursor is None:
                # Initial sync: list all files in the folder
                cursor = service.changes().getStartPageToken().execute().get("startPageToken")

                query = f"'{self.config['folder_id']}' in parents and trashed = false"
                page_token = None

                while True:
                    response = service.files().list(
                        q=query,
                        fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum)",
                        pageSize=100,
                        pageToken=page_token,
                    ).execute()

                    for f in response.get("files", []):
                        if f.get("mimeType") in IMAGE_MIMES:
                            items.append(SyncItem(
                                object_id=f["id"],
                                etag=f.get("md5Checksum"),
                                filename=f.get("name"),
                                mime_type=f.get("mimeType"),
                                size_bytes=int(f["size"]) if f.get("size") else None,
                            ))

                    page_token = response.get("nextPageToken")
                    if not page_token:
                        break
            else:
                # Delta sync: use Changes API
                page_token = cursor
                while page_token:
                    response = service.changes().list(
                        pageToken=page_token,
                        fields="nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, size, modifiedTime, md5Checksum, parents))",
                        pageSize=100,
                    ).execute()

                    for change in response.get("changes", []):
                        file_data = change.get("file", {})
                        parents = file_data.get("parents", [])

                        if self.config["folder_id"] not in parents and not change.get("removed"):
                            continue

                        if change.get("removed"):
                            items.append(SyncItem(
                                object_id=change["fileId"],
                                is_deleted=True,
                            ))
                        elif file_data.get("mimeType") in IMAGE_MIMES:
                            items.append(SyncItem(
                                object_id=file_data["id"],
                                etag=file_data.get("md5Checksum"),
                                filename=file_data.get("name"),
                                mime_type=file_data.get("mimeType"),
                                size_bytes=int(file_data["size"]) if file_data.get("size") else None,
                            ))

                    page_token = response.get("nextPageToken")
                    new_cursor = response.get("newStartPageToken", page_token)

                cursor = new_cursor

        except Exception as e:
            logger.error(f"GDrive delta sync failed: {e}")

        logger.info(f"GDrive sync: {len(items)} items")
        return items, cursor

    async def fetch_blob(self, object_id: str) -> bytes:
        """Download file content from Google Drive."""
        service = self._get_service()
        if service is None:
            raise RuntimeError("GDrive service not initialized")

        from io import BytesIO
        from googleapiclient.http import MediaIoBaseDownload

        request = service.files().get_media(fileId=object_id)
        buffer = BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)

        done = False
        while not done:
            _, done = downloader.next_chunk()

        return buffer.getvalue()

    async def mirror_acl(self, object_id: str) -> dict:
        """Fetch permissions for a file from Google Drive."""
        service = self._get_service()
        if service is None:
            return {}

        try:
            perms = service.permissions().list(
                fileId=object_id,
                fields="permissions(id, type, role, emailAddress)",
            ).execute()

            return {
                "source": "gdrive",
                "permissions": perms.get("permissions", []),
            }
        except Exception as e:
            logger.warning(f"ACL mirror failed for {object_id}: {e}")
            return {}
