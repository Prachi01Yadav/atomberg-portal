"""Admin endpoints for the quarter-open check-in reminder system (Section 5.2)."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.checkin import Quarter
from app.models.user import User, UserRole
from app.services import reminder_service

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("/checkins/run")
async def run_checkin_reminders(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
    quarter: Quarter | None = Query(None, description="Force-send for this quarter (demo)"),
    force: bool = Query(False, description="Bypass the dedupe log"),
):
    """Manual trigger for the quarter-open check-in reminder job."""
    return await reminder_service.send_checkin_reminders(
        db, force_quarter=quarter, force=force
    )


@router.get("/checkins/log")
async def reminder_log(
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
    limit: int = 100,
):
    return reminder_service.read_reminder_log(limit=limit)
