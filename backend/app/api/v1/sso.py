"""Azure Entra ID (Azure AD) SSO endpoints.

If `SSO_MODE=mock`, returns a one-click demo login URL that mimics the
Microsoft flow. This keeps the architecture honest while allowing the
hackathon demo to work without a real Azure tenant.
"""
from typing import Annotated
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token
from app.models.user import User
from app.services import azure_ad_service

router = APIRouter(prefix="/sso", tags=["sso"])
settings = get_settings()


class SSOConfigResponse(BaseModel):
    mode: str
    tenant_configured: bool
    client_configured: bool
    group_mapping: dict


@router.get("/config", response_model=SSOConfigResponse)
async def sso_config() -> SSOConfigResponse:
    """Diagnostic: shows what Entra ID config is in place (no secrets returned)."""
    return SSOConfigResponse(
        mode=settings.sso_mode,
        tenant_configured=bool(settings.azure_tenant_id),
        client_configured=bool(settings.azure_client_id and settings.azure_client_secret),
        group_mapping={
            "admin": bool(settings.azure_admin_group_id),
            "manager": bool(settings.azure_manager_group_id),
            "employee": bool(settings.azure_employee_group_id),
        },
    )


class SSOInitiateResponse(BaseModel):
    url: str
    mode: str


class SSOCallbackRequest(BaseModel):
    code: str
    state: str | None = None


class SSOTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


@router.get("/initiate", response_model=SSOInitiateResponse)
async def sso_initiate() -> SSOInitiateResponse:
    if settings.sso_mode == "mock":
        # Return a frontend deep-link to the mock-picker page
        return SSOInitiateResponse(
            url="/sso/mock?state=" + uuid4().hex,
            mode="mock",
        )

    if not settings.azure_client_id or not settings.azure_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure SSO not configured",
        )

    params = {
        "client_id": settings.azure_client_id,
        "response_type": "code",
        "redirect_uri": settings.azure_redirect_uri,
        "response_mode": "query",
        "scope": "openid profile email User.Read",
        "state": uuid4().hex,
    }
    url = f"https://login.microsoftonline.com/{settings.azure_tenant_id}/oauth2/v2.0/authorize?" + urlencode(
        params
    )
    return SSOInitiateResponse(url=url, mode="live")


@router.post("/callback", response_model=SSOTokenResponse)
async def sso_callback(
    body: SSOCallbackRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SSOTokenResponse:
    """Mock callback that accepts an email as the 'code' value.

    In live mode this would exchange the code for an access token, then
    fetch the user from MS Graph and upsert.
    """
    if settings.sso_mode == "mock":
        # The 'code' here is the chosen demo user's email.
        result = await db.execute(select(User).where(User.email == body.code))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo user not found")

        access = create_access_token(str(user.id), user.role.value)
        refresh = create_refresh_token(str(user.id), user.role.value)
        return SSOTokenResponse(
            access_token=access,
            refresh_token=refresh,
            user={
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
                "department": user.department,
            },
        )

    if not (settings.azure_tenant_id and settings.azure_client_id and settings.azure_client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure SSO not configured (set AZURE_TENANT_ID / CLIENT_ID / CLIENT_SECRET).",
        )

    try:
        access = await azure_ad_service.exchange_code_for_token(body.code)
        profile = await azure_ad_service.fetch_graph_profile(access)
        user = await azure_ad_service.upsert_user_from_graph(db, profile)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Azure SSO exchange failed: {exc}",
        )

    return SSOTokenResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id), user.role.value),
        user={
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "department": user.department,
        },
    )
