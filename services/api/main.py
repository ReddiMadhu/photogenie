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

from services.api.database import close_pool, create_pool

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    await create_pool()
    logger.info("API Gateway ready")
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

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "service": "api-gateway"}


# Register all routers
from services.api.routes.admin import router as admin_router
from services.api.routes.assets import router as assets_router
from services.api.routes.connectors import router as connectors_router
from services.api.routes.feedback import router as feedback_router
from services.api.routes.groups import router as groups_router
from services.api.routes.persons import router as persons_router
from services.api.routes.search import router as search_router

app.include_router(groups_router)
app.include_router(assets_router)
app.include_router(search_router)
app.include_router(persons_router)
app.include_router(feedback_router)
app.include_router(connectors_router)
app.include_router(admin_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
