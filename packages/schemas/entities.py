"""
Pydantic Entity Models — §5.4 Core Schema

Shared across all services: api, identity, retrieval, workers, connectors.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class GroupStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class AssetStatus(str, Enum):
    RESERVED = "reserved"
    READY = "ready"
    FAILED = "failed"
    DELETED = "deleted"


class GroupRole(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class SourceKind(str, Enum):
    GDRIVE = "gdrive"
    UPLOAD = "upload"
    SHAREPOINT = "sharepoint"
    S3 = "s3"


class ConsentState(str, Enum):
    UNKNOWN = "unknown"
    CONSENTED = "consented"
    WITHDRAWN = "withdrawn"


class PersonEventKind(str, Enum):
    ASSIGN = "assign"
    UNASSIGN = "unassign"
    MERGE = "merge"
    SPLIT = "split"
    RENAME = "rename"
    CONFIRM = "confirm"
    REJECT = "reject"
    ERASE = "erase"
    CLUSTER_CREATE = "cluster_create"
    CLUSTER_UPDATE = "cluster_update"


# ---------------------------------------------------------------------------
# Entity Models
# ---------------------------------------------------------------------------
class Tenant(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    kms_key_id: Optional[str] = None
    retention_days: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class User(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    tenant_id: uuid.UUID
    email: str
    oidc_sub: Optional[str] = None
    name: Optional[str] = None
    is_admin: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SearchGroup(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    tenant_id: uuid.UUID
    name: str
    owner_user_id: Optional[uuid.UUID] = None
    max_active_images: int = 15000
    active_image_count: int = 0
    status: GroupStatus = GroupStatus.ACTIVE
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def quota_remaining(self) -> int:
        return self.max_active_images - self.active_image_count


class SearchGroupMember(BaseModel):
    group_id: uuid.UUID
    user_id: uuid.UUID
    role: GroupRole


class Source(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    kind: SourceKind
    config: dict = Field(default_factory=dict)
    cursor: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Asset(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    source_id: Optional[uuid.UUID] = None
    source_object_id: Optional[str] = None
    etag: Optional[str] = None
    sha256: Optional[bytes] = None
    phash: Optional[int] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    taken_at: Optional[datetime] = None
    imported_at: datetime = Field(default_factory=datetime.utcnow)
    exif_data: Optional[dict] = None
    acl: Optional[dict] = None
    status: AssetStatus = AssetStatus.RESERVED
    deleted_at: Optional[datetime] = None
    caption: Optional[str] = None
    ocr_text: Optional[str] = None


class Face(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    asset_id: uuid.UUID
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    landmarks: Optional[list[dict]] = None  # [{x, y}, ...]
    align_matrix: Optional[list[float]] = None  # 2x3 affine (6 values)
    det_score: float
    quality: Optional[float] = None
    person_id: Optional[uuid.UUID] = None
    model_id: str
    model_version: str
    embedding_id: Optional[uuid.UUID] = None
    crop_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Person(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    name: Optional[str] = None
    centroid_model: Optional[str] = None
    rep_face_id: Optional[uuid.UUID] = None
    consent_state: ConsentState = ConsentState.UNKNOWN
    face_count: int = 0
    is_hidden: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PersonEvent(BaseModel):
    id: Optional[int] = None
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    person_id: Optional[uuid.UUID] = None
    kind: PersonEventKind
    payload: dict = Field(default_factory=dict)
    actor: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FeedbackPair(BaseModel):
    id: Optional[int] = None
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    query_face: uuid.UUID
    cand_face: uuid.UUID
    label: bool
    source: str = "user"
    created_at: datetime = Field(default_factory=datetime.utcnow)
