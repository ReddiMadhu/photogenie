"""
Auth — OIDC JWT validation + RBAC on search_group_members (§5.8).
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


def create_dev_token(
    user_id: str,
    tenant_id: str,
    email: str = "dev@photogenic.local",
    is_admin: bool = True,
) -> str:
    """Create a JWT for development/testing."""
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "email": email,
        "is_admin": is_admin,
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expiry_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> UserInfo:
    """
    Validate JWT and return current user info.
    In dev mode (no token), returns a dev user.
    """
    if credentials is None:
        # Dev mode — return a default user
        return UserInfo(
            id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            email="dev@photogenic.local",
            name="Dev User",
            is_admin=True,
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
