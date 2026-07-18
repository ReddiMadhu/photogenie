"""
Retrieval Service — §5.7

FastAPI microservice for two-stage face search.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient

from services.retrieval.search import search_person

logger = logging.getLogger(__name__)

db_pool: asyncpg.Pool | None = None
qdrant: QdrantClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, qdrant

    db_pool = await asyncpg.create_pool(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=os.getenv("POSTGRES_DB", "photogenic"),
        user=os.getenv("POSTGRES_USER", "photogenic"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme_pg_password"),
        min_size=2,
        max_size=10,
    )

    qdrant = QdrantClient(
        host=os.getenv("QDRANT_HOST", "qdrant"),
        port=int(os.getenv("QDRANT_PORT", "6333")),
    )

    logger.info("Retrieval service ready")
    yield

    if db_pool:
        await db_pool.close()
    logger.info("Retrieval service shut down")


app = FastAPI(
    title="PhotoGenic Retrieval Service",
    description="Two-stage face search with set aggregation and reranking (§5.7)",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "retrieval"}


class SearchRequest(BaseModel):
    query_embedding: list[float]
    query_quality: float
    tenant_id: str
    group_id: str
    user_id: str
    k: int = 50


@app.post("/search")
async def search_endpoint(req: SearchRequest):
    """Two-stage face search within a group."""
    result = await search_person(
        query_embedding=req.query_embedding,
        query_quality=req.query_quality,
        tenant_id=req.tenant_id,
        group_id=req.group_id,
        user_id=req.user_id,
        k=req.k,
        qdrant_client=qdrant,
        db_pool=db_pool,
    )
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("RETRIEVAL_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
