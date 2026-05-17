"""Celery beat task for quarter-open check-in reminders (Section 5.2)."""
import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.services import reminder_service
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _run() -> dict:
    async with AsyncSessionLocal() as session:
        result = await reminder_service.send_checkin_reminders(session)
        await session.commit()
        return result


@celery_app.task(name="app.tasks.reminder_tasks.run_daily_checkin_reminders")
def run_daily_checkin_reminders() -> dict:
    """Runs daily; only sends on the actual open date of each quarter."""
    return asyncio.run(_run())
