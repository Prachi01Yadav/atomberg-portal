from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/system", tags=["system"])
settings = get_settings()


@router.get("/info")
async def system_info() -> dict:
    """Surface live/mock state so the UI can show clear demo-mode badges."""
    return {
        "app_name": settings.app_name,
        "environment": settings.environment,
        "ai_mode": "live" if settings.anthropic_api_key else "mock",
        "blockchain_mode": settings.blockchain_mode,
        "sso_mode": settings.sso_mode,
        "email_mode": "live" if settings.mail_username and settings.mail_password else "mock",
        "teams_mode": "live" if settings.teams_webhook_url else "mock",
    }
