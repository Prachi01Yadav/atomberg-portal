from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "atomquest",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.escalation_tasks",
        "app.tasks.notification_tasks",
        "app.tasks.reminder_tasks",
    ],
)

celery_app.conf.beat_schedule = {
    "daily-escalation-check": {
        "task": "app.tasks.escalation_tasks.run_daily_escalations",
        "schedule": crontab(hour=0, minute=0),
    },
    "daily-checkin-reminders": {
        "task": "app.tasks.reminder_tasks.run_daily_checkin_reminders",
        "schedule": crontab(hour=6, minute=0),
    },
}
