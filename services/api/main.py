"""
API Gateway — FastAPI Main Application (§5.8)

All 16 endpoints from the build plan, OIDC auth, CORS, health check.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.api.config import settings
from services.api.database import close_pool, create_pool

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    await create_pool()
    logger.info("API Gateway ready (env=%s)", settings.environment)
    yield
    # Shutdown
    await close_pool()
    logger.info("API Gateway shut down")


app = FastAPI(
    title="PhotoGenic — Enterprise Face Search Platform",
    description=(
        "Search group-scoped face search with quality gating, "
        "person identity management, and auditable evidence. §5.8"
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — explicit origins; wildcard only in development
_cors_origins = settings.cors_origin_list
if settings.is_development and not _cors_origins:
    _cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "healthy",
        "service": "api-gateway",
        "environment": settings.environment,
    }


@app.get("/health/deps", tags=["Health"])
async def health_deps():
    """Probe dependency services for the Settings page."""
    import httpx

    deps = {
        "api": {"status": "operational", "type": "Core Router"},
        "postgres": {"status": "unknown", "type": "Relational DB"},
        "redis": {"status": "unknown", "type": "Cache / Broker"},
        "qdrant": {"status": "unknown", "type": "Vector Index"},
        "minio": {"status": "unknown", "type": "Object Store"},
        "ml_inference": {"status": "unknown", "type": "ML Inference"},
        "identity": {"status": "unknown", "type": "Identity Service"},
        "retrieval": {"status": "unknown", "type": "Retrieval Service"},
    }

    # Postgres
    try:
        from services.api.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        deps["postgres"]["status"] = "operational"
    except Exception as e:
        deps["postgres"]["status"] = "degraded"
        deps["postgres"]["detail"] = str(e)

    # Redis
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        deps["redis"]["status"] = "operational"
    except Exception as e:
        deps["redis"]["status"] = "degraded"
        deps["redis"]["detail"] = str(e)

    # Qdrant
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"http://{settings.qdrant_host}:{settings.qdrant_port}/readyz"
            )
            deps["qdrant"]["status"] = (
                "operational" if resp.status_code == 200 else "degraded"
            )
    except Exception as e:
        deps["qdrant"]["status"] = "degraded"
        deps["qdrant"]["detail"] = str(e)

    # MinIO
    try:
        from minio import Minio
        Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        ).bucket_exists(settings.minio_bucket)
        deps["minio"]["status"] = "operational"
    except Exception as e:
        deps["minio"]["status"] = "degraded"
        deps["minio"]["detail"] = str(e)

    # Sibling HTTP services
    for key, url in (
        ("ml_inference", f"{settings.ml_inference_url}/health"),
        ("identity", f"{settings.identity_service_url}/health"),
        ("retrieval", f"{settings.retrieval_service_url}/health"),
    ):
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url)
                deps[key]["status"] = (
                    "operational" if resp.status_code == 200 else "degraded"
                )
        except Exception as e:
            deps[key]["status"] = "degraded"
            deps[key]["detail"] = str(e)

    overall = "operational"
    if any(d["status"] == "degraded" for d in deps.values()):
        overall = "degraded"

    return {"status": overall, "dependencies": deps}


# Register all routers
from services.api.routes.admin import router as admin_router
from services.api.routes.assets import router as assets_router
from services.api.routes.auth_routes import router as auth_router
from services.api.routes.connectors import router as connectors_router
from services.api.routes.feedback import router as feedback_router
from services.api.routes.groups import router as groups_router
from services.api.routes.images import assets_router as images_router
from services.api.routes.images import faces_router
from services.api.routes.persons import router as persons_router
from services.api.routes.search import router as search_router

app.include_router(auth_router)
app.include_router(groups_router)
app.include_router(assets_router)
app.include_router(images_router)
app.include_router(faces_router)
app.include_router(search_router)
app.include_router(persons_router)
app.include_router(feedback_router)
app.include_router(connectors_router)
app.include_router(admin_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
