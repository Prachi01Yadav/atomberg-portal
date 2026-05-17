"""Microsoft Entra ID (Azure AD) helpers.

Live-mode SSO callback uses these helpers to:
  1. exchange the OAuth code for an access token,
  2. fetch the signed-in user's profile (`/me`), manager (`/me/manager`),
     and group memberships (`/me/memberOf`) from Microsoft Graph,
  3. derive the AtomQuest role from configured group object-IDs.

All behavior is additive: if `SSO_MODE != "live"` or required Azure env vars
are missing, the helpers are simply unused — the existing mock SSO path is
left untouched.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)
settings = get_settings()

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


@dataclass
class GraphProfile:
    email: str
    full_name: str
    department: Optional[str]
    manager_email: Optional[str]
    group_ids: list[str]


def _token_url() -> str:
    return f"https://login.microsoftonline.com/{settings.azure_tenant_id}/oauth2/v2.0/token"


async def exchange_code_for_token(code: str) -> str:
    """Exchange an OAuth authorization code for an access token."""
    data = {
        "client_id": settings.azure_client_id,
        "client_secret": settings.azure_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.azure_redirect_uri,
        "scope": "openid profile email User.Read User.Read.All",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(_token_url(), data=data)
    r.raise_for_status()
    payload = r.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Azure token response missing access_token")
    return token


async def fetch_graph_profile(access_token: str) -> GraphProfile:
    """Fetch /me, /me/manager and /me/memberOf from Microsoft Graph."""
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15, headers=headers) as client:
        me_resp = await client.get(f"{GRAPH_BASE}/me")
        me_resp.raise_for_status()
        me = me_resp.json()

        manager_email: Optional[str] = None
        try:
            mr = await client.get(f"{GRAPH_BASE}/me/manager")
            if mr.status_code == 200:
                mdata = mr.json()
                manager_email = mdata.get("mail") or mdata.get("userPrincipalName")
        except httpx.HTTPError as exc:
            logger.info("manager lookup failed: %s", exc)

        group_ids: list[str] = []
        try:
            gr = await client.get(f"{GRAPH_BASE}/me/memberOf?$select=id")
            if gr.status_code == 200:
                group_ids = [g["id"] for g in gr.json().get("value", []) if g.get("id")]
        except httpx.HTTPError as exc:
            logger.info("memberOf lookup failed: %s", exc)

    email = me.get("mail") or me.get("userPrincipalName")
    if not email:
        raise RuntimeError("Azure profile missing email/userPrincipalName")
    full_name = me.get("displayName") or email.split("@")[0]
    department = me.get("department")
    return GraphProfile(
        email=email.lower(),
        full_name=full_name,
        department=department,
        manager_email=manager_email.lower() if manager_email else None,
        group_ids=group_ids,
    )


def role_from_groups(group_ids: list[str], current_role: UserRole | None = None) -> UserRole:
    """Map AD group membership to AtomQuest role.

    Precedence: admin > manager > employee.  If no AD groups are configured,
    we keep the user's current role (or default to employee for new users).
    """
    if settings.azure_admin_group_id and settings.azure_admin_group_id in group_ids:
        return UserRole.admin
    if settings.azure_manager_group_id and settings.azure_manager_group_id in group_ids:
        return UserRole.manager
    if settings.azure_employee_group_id and settings.azure_employee_group_id in group_ids:
        return UserRole.employee
    return current_role or UserRole.employee


async def upsert_user_from_graph(db: AsyncSession, profile: GraphProfile) -> User:
    """Create or update a User row from a Graph profile + groups.

    - Auto-syncs `department`, `full_name`, `role` (if groups configured),
      and `manager_id` (looked up by manager email).
    - Existing local-only fields (e.g. hashed_password) are preserved.
    """
    result = await db.execute(select(User).where(User.email == profile.email))
    user = result.scalar_one_or_none()

    new_role = role_from_groups(profile.group_ids, user.role if user else None)

    manager_id: UUID | None = None
    if profile.manager_email:
        mres = await db.execute(select(User).where(User.email == profile.manager_email))
        mgr = mres.scalar_one_or_none()
        if mgr:
            manager_id = mgr.id

    if user is None:
        user = User(
            email=profile.email,
            hashed_password=get_password_hash(secrets.token_urlsafe(24)),
            full_name=profile.full_name,
            role=new_role,
            department=profile.department,
            manager_id=manager_id,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        logger.info("Created new SSO user %s (%s)", user.email, user.role.value)
        return user

    user.full_name = profile.full_name or user.full_name
    if profile.department:
        user.department = profile.department
    user.role = new_role
    if manager_id is not None:
        user.manager_id = manager_id
    await db.flush()
    await db.refresh(user)
    logger.info("Synced SSO user %s (role=%s, dept=%s)", user.email, user.role.value, user.department)
    return user
