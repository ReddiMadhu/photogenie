"""
Connector Base — §5.3

Abstract connector for delta sync + ACL mirroring from external sources.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Optional


@dataclass
class SyncItem:
    """An item discovered during delta sync."""
    object_id: str
    etag: Optional[str] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    acl: Optional[dict] = None
    is_deleted: bool = False


class BaseConnector(abc.ABC):
    """Abstract connector for external image sources."""

    def __init__(self, source_id: str, group_id: str, tenant_id: str, config: dict):
        self.source_id = source_id
        self.group_id = group_id
        self.tenant_id = tenant_id
        self.config = config

    @abc.abstractmethod
    async def delta_sync(self, cursor: Optional[str] = None) -> tuple[list[SyncItem], Optional[str]]:
        """
        Fetch changes since the last cursor.

        Returns:
            (items, new_cursor) — items to process, and the new cursor to save.
        """
        ...

    @abc.abstractmethod
    async def fetch_blob(self, object_id: str) -> bytes:
        """Fetch the raw image bytes for a specific object."""
        ...

    @abc.abstractmethod
    async def mirror_acl(self, object_id: str) -> dict:
        """Fetch and return the ACL for a specific object."""
        ...
