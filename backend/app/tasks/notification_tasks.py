import asyncio
import logging

from app.services import notification_service
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.notification_tasks.send_email_task")
def send_email_task(to: str, subject: str, body: str) -> bool:
    return asyncio.run(notification_service.send_email(to, subject, body))


@celery_app.task(name="app.tasks.notification_tasks.send_teams_task")
def send_teams_task(title: str, text: str, deep_link: str | None = None) -> bool:
    return asyncio.run(notification_service.send_teams_card(title, text, deep_link))
