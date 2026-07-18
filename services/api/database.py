"""
Database — async PostgreSQL connection pool (asyncpg).
"""

from __future__ import annotations

import asyncpg
from services.api.config import settings

pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    """Create the async connection pool."""
    global pool
    pool = await asyncpg.create_pool(
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        min_size=5,
        max_size=20,
    )
    return pool


async def close_pool() -> None:
    """Close the connection pool."""
    global pool
    if pool:
        await pool.close()
        pool = None


async def get_pool() -> asyncpg.Pool:
    """Get the connection pool."""
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool
