"""
Auth Routes — development token bootstrap.

POST /v1/auth/dev-token — issue a short-lived JWT (development only)
GET  /v1/auth/me        — current user info
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from packages.schemas.api_models import TokenResponse, UserInfo
from services.api.auth import create_dev_token, get_current_user
from services.api.config import settings

router = APIRouter(prefix="/v1/auth", tags=["Auth"])


@router.post("/dev-token", response_model=TokenResponse)
async def issue_dev_token():
    """Issue a development JWT. Disabled outside development."""
    if not settings.is_development:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev tokens are only available in development",
        )

    token = create_dev_token()
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.jwt_expiry_minutes * 60,
    )


@router.get("/me", response_model=UserInfo)
async def me(user: UserInfo = Depends(get_current_user)):
    """Return the authenticated user."""
    return user
