"""
Pydantic API Request/Response Models — §5.8 API Surface

Shared DTOs used by the API gateway and consumed by frontend.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Search Groups
# ---------------------------------------------------------------------------
class CreateGroupRequest(BaseModel):
    name: str
    max_active_images: int = 15000


class GroupResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    owner_user_id: Optional[uuid.UUID] = None
    max_active_images: int
    active_image_count: int
    quota_remaining: int
    status: str
    created_at: datetime


class GroupListResponse(BaseModel):
    groups: list[GroupResponse]
    total: int


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------
class AssetUploadResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    filename: Optional[str] = None
    status: str
    message: str = "Asset queued for processing"


class AssetResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    taken_at: Optional[datetime] = None
    status: str
    face_count: int = 0
    thumbnail_url: Optional[str] = None


class AssetListResponse(BaseModel):
    assets: list[AssetResponse]
    total: int


# ---------------------------------------------------------------------------
# Faces & Search
# ---------------------------------------------------------------------------
class FaceDetection(BaseModel):
    """A detected face in a query image."""
    bbox: list[int]  # [x, y, w, h]
    det_score: float
    quality: Optional[float] = None


class EvidencePayload(BaseModel):
    """§5.7: Every result carries an evidence payload."""
    query_crop_url: Optional[str] = None
    matched_crop_url: Optional[str] = None
    cosine_similarity: float
    quality_score: Optional[float] = None
    verifier_score: Optional[float] = None
    source: Optional[str] = None
    acl_basis: Optional[str] = None
    group_id: uuid.UUID
    match_count: Optional[int] = None
    query_face_id: Optional[uuid.UUID] = None
    matched_face_id: Optional[uuid.UUID] = None


class SearchResult(BaseModel):
    """A single search result — one person match."""
    person_id: Optional[uuid.UUID] = None
    person_name: Optional[str] = None
    score: float
    face_count: int = 0
    evidence: list[EvidencePayload] = []
    assets: list[AssetResponse] = []
    asset_ids: list[str] = []


class SearchResponse(BaseModel):
    """Response from face search endpoint."""
    query_faces_detected: int
    query_face_used: Optional[FaceDetection] = None
    results: list[SearchResult]
    total_candidates_scanned: int
    search_time_ms: float


# ---------------------------------------------------------------------------
# Persons
# ---------------------------------------------------------------------------
class PersonResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    name: Optional[str] = None
    face_count: int
    rep_face_url: Optional[str] = None
    consent_state: str
    is_hidden: bool
    created_at: datetime


class PersonListResponse(BaseModel):
    persons: list[PersonResponse]
    total: int


class PersonFaceResponse(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    crop_url: Optional[str] = None
    quality: Optional[float] = None
    bbox: Optional[list[int]] = None


class PersonFaceListResponse(BaseModel):
    faces: list[PersonFaceResponse]
    total: int


class MergeRequest(BaseModel):
    source_person_ids: list[uuid.UUID]


class SplitRequest(BaseModel):
    face_ids: list[uuid.UUID]  # faces to split into a new person


class RenameRequest(BaseModel):
    name: str


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
class FeedbackRequest(BaseModel):
    """§5.6: User feedback for threshold calibration."""
    query_face: uuid.UUID
    cand_face: uuid.UUID
    label: bool  # true = same person, false = different


class FeedbackResponse(BaseModel):
    id: int
    message: str = "Feedback recorded"


# ---------------------------------------------------------------------------
# Connectors
# ---------------------------------------------------------------------------
class CreateConnectorRequest(BaseModel):
    group_id: uuid.UUID
    config: dict = Field(default_factory=dict)


class ConnectorResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    kind: str
    status: str = "configured"
    last_sync_at: Optional[str] = None
    last_error: Optional[str] = None


# ---------------------------------------------------------------------------
# Admin / Eval
# ---------------------------------------------------------------------------
class DETPoint(BaseModel):
    fmr: float
    fnmr: float


class EvalResponse(BaseModel):
    """§5.11: DET/ROC evaluation results per group."""
    group_id: uuid.UUID
    tau_assign: float
    tau_search: float
    pair_count: int
    det_curve: list[DETPoint] = []
    recall_at_50: Optional[float] = None
    cluster_purity: Optional[float] = None
    calibrated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserInfo(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    name: Optional[str] = None
    is_admin: bool = False
