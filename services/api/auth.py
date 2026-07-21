"""
Auth — JWT validation + RBAC on search_group_members (§5.8).

Development may fall back to a mock admin user when no token is present.
Production (ENVIRONMENT != development) fails closed with 401.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from packages.schemas.api_models import UserInfo
from services.api.config import settings
from services.api.database import get_pool

security = HTTPBearer(auto_error=False)

DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEV_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def create_dev_token(
    user_id: str | None = None,
    tenant_id: str | None = None,
    email: str = "dev@photogenic.local",
    name: str = "Dev User",
    is_admin: bool = True,
) -> str:
    """Create a JWT for development/testing."""
    payload = {
        "sub": user_id or str(DEV_USER_ID),
        "tenant_id": tenant_id or str(DEV_TENANT_ID),
        "email": email,
        "name": name,
        "is_admin": is_admin,
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expiry_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _dev_user() -> UserInfo:
    return UserInfo(
        id=DEV_USER_ID,
        tenant_id=DEV_TENANT_ID,
        email="dev@photogenic.local",
        name="Dev User",
        is_admin=True,
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> UserInfo:
    """
    Validate JWT and return current user info.

    Missing credentials:
      - development → mock admin user
      - otherwise → 401 Unauthorized
    """
    if credentials is None:
        if settings.is_development:
            return _dev_user()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return UserInfo(
            id=uuid.UUID(payload["sub"]),
            tenant_id=uuid.UUID(payload["tenant_id"]),
            email=payload.get("email", ""),
            name=payload.get("name"),
            is_admin=payload.get("is_admin", False),
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_group_access(
    user: UserInfo,
    group_id: uuid.UUID,
    required_role: str = "viewer",
) -> str:
    """
    Check RBAC on search_group_members.

    Roles: owner > editor > viewer
    Returns the user's role if authorized, raises 403 otherwise.
    """
    if user.is_admin:
        return "admin"

    role_hierarchy = {"owner": 3, "editor": 2, "viewer": 1}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT role FROM search_group_members "
                "WHERE group_id = $1 AND user_id = $2",
                group_id,
                user.id,
            )

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No access to this search group",
            )

        user_role = row["role"]
        if role_hierarchy.get(user_role, 0) < role_hierarchy.get(required_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {required_role} role, you have {user_role}",
            )

        return user_role

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Access check failed: {e}",
        )


async def require_asset_access(
    user: UserInfo,
    asset_id: uuid.UUID,
    required_role: str = "viewer",
) -> dict:
    """
    Resolve an asset and enforce group membership for the owning group.
    Returns the asset row dict on success.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, tenant_id, group_id, source_object_id, filename, status, mime_type "
            "FROM assets WHERE id = $1",
            asset_id,
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if row["status"] == "deleted":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Asset has been deleted")

    if not user.is_admin and row["tenant_id"] != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this asset",
        )

    await require_group_access(user, row["group_id"], required_role=required_role)
    return dict(row)


async def require_face_access(
    user: UserInfo,
    face_id: uuid.UUID,
    required_role: str = "viewer",
) -> dict:
    """Resolve a face and enforce group membership for the owning group."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, tenant_id, group_id, asset_id, crop_path, person_id "
            "FROM faces WHERE id = $1",
            face_id,
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face not found")

    if not user.is_admin and row["tenant_id"] != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this face",
        )

    await require_group_access(user, row["group_id"], required_role=required_role)
    return dict(row)
