"""
Pydantic Event Schemas — §5.6 Person Events + Ingest Events

Immutable event models for audit trail and replay.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Ingest Events
# ---------------------------------------------------------------------------
class IngestEvent(BaseModel):
    """Event dispatched when an asset is queued for processing."""
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    source_id: Optional[uuid.UUID] = None
    object_id: Optional[str] = None
    etag: Optional[str] = None
    filename: Optional[str] = None
    idempotency_key: Optional[str] = None  # hash(group_id, source_id, object_id, etag)

    def compute_idempotency_key(self) -> str:
        """§5.5: idempotency_key = hash(group_id, source_id, object_id, etag)"""
        import hashlib
        parts = f"{self.group_id}:{self.source_id}:{self.object_id}:{self.etag}"
        return hashlib.sha256(parts.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Assignment Events
# ---------------------------------------------------------------------------
class AssignmentResult(BaseModel):
    """Result from the identity service's online assignment."""
    face_id: uuid.UUID
    person_id: Optional[uuid.UUID] = None
    score: Optional[float] = None
    margin: Optional[float] = None
    is_new_person: bool = False


# ---------------------------------------------------------------------------
# Clustering Events
# ---------------------------------------------------------------------------
class ClusterJob(BaseModel):
    """Request to run HDBSCAN re-clustering on a group."""
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    triggered_by: str = "scheduled"  # 'scheduled' | 'on_demand' | 'feedback'
    min_cluster_size: int = 2


class ClusterResult(BaseModel):
    """Result from offline re-clustering."""
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    total_faces: int
    clusters_found: int
    singletons: int
    merges: int
    splits: int
    duration_seconds: float
    completed_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Calibration Events
# ---------------------------------------------------------------------------
class CalibrationResult(BaseModel):
    """Result from feedback → threshold calibration."""
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    tau_assign: float
    tau_search: float
    pair_count: int
    calibrated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Erasure Events
# ---------------------------------------------------------------------------
class ErasureRequest(BaseModel):
    """Request to erase a person or asset from a group."""
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    target_type: str  # 'person' | 'asset'
    target_id: uuid.UUID
    requested_by: str
    requested_at: datetime = Field(default_factory=datetime.utcnow)


class ErasureResult(BaseModel):
    """Result from erasure workflow."""
    tenant_id: uuid.UUID
    group_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    vectors_deleted: int
    faces_deleted: int
    cache_purged: bool
    audit_event_id: Optional[int] = None
    completed_at: datetime = Field(default_factory=datetime.utcnow)
