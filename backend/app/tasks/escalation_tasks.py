"""Daily escalation evaluator. Run via Celery beat at midnight UTC."""
import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.services.escalation_service import run_all_escalations
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _run() -> dict:
    async with AsyncSessionLocal() as db:
        results = await run_all_escalations(db)
        await db.commit()
        return results


@celery_app.task(name="app.tasks.escalation_tasks.run_daily_escalations")
def run_daily_escalations() -> dict:
    """Daily escalation check (also callable on demand)."""
    try:
        results = asyncio.run(_run())
        logger.info("Daily escalations completed: %s", results)
        return results
    except Exception as exc:
        logger.exception("Escalation task failed: %s", exc)
        return {"error": str(exc)}
