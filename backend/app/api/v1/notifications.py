from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import require_roles
from app.models.user import User, UserRole
from app.services.notification_service import read_notification_log

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/log")
async def get_notification_log(
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
    limit: int = 100,
):
    return read_notification_log(limit=limit)
