"""
Identity Service — §5.6

FastAPI microservice for person assignment, clustering, and calibration.
The "moat" — runs as its own service.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient

from services.identity.assignment import assign_person
from services.identity.calibration import calibrate_group
from services.identity.clustering import recluster_group

logger = logging.getLogger(__name__)

db_pool: asyncpg.Pool | None = None
qdrant: QdrantClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, qdrant

    # Postgres
    db_pool = await asyncpg.create_pool(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=os.getenv("POSTGRES_DB", "photogenic"),
        user=os.getenv("POSTGRES_USER", "photogenic"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme_pg_password"),
        min_size=2,
        max_size=10,
    )

    # Qdrant
    qdrant = QdrantClient(
        host=os.getenv("QDRANT_HOST", "qdrant"),
        port=int(os.getenv("QDRANT_PORT", "6333")),
    )

    logger.info("Identity service ready")
    yield

    if db_pool:
        await db_pool.close()
    logger.info("Identity service shut down")


app = FastAPI(
    title="PhotoGenic Identity Service",
    description="Person assignment, clustering, and calibration (§5.6)",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "identity"}


# ---- Assignment ----

class AssignRequest(BaseModel):
    face_id: str
    embedding: list[float]
    quality: float
    tenant_id: str
    group_id: str


@app.post("/assign")
async def assign_endpoint(req: AssignRequest):
    """Online assignment of a face to a person."""
    import uuid
    person_id = await assign_person(
        face_id=uuid.UUID(req.face_id),
        face_embedding=req.embedding,
        face_quality=req.quality,
        tenant_id=req.tenant_id,
        group_id=req.group_id,
        qdrant_client=qdrant,
        db_pool=db_pool,
    )
    return {
        "face_id": req.face_id,
        "person_id": str(person_id) if person_id else None,
        "assigned": person_id is not None,
    }


# ---- Clustering ----

class ClusterRequest(BaseModel):
    tenant_id: str
    group_id: str
    min_cluster_size: int = 2


@app.post("/cluster")
async def cluster_endpoint(req: ClusterRequest):
    """Trigger HDBSCAN re-clustering for a group."""
    result = await recluster_group(
        tenant_id=req.tenant_id,
        group_id=req.group_id,
        qdrant_client=qdrant,
        db_pool=db_pool,
        min_cluster_size=req.min_cluster_size,
    )
    return result


# ---- Calibration ----

class CalibrateRequest(BaseModel):
    tenant_id: str
    group_id: str


@app.post("/calibrate")
async def calibrate_endpoint(req: CalibrateRequest):
    """Run threshold calibration for a group."""
    result = await calibrate_group(
        tenant_id=req.tenant_id,
        group_id=req.group_id,
        db_pool=db_pool,
    )
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("IDENTITY_PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
