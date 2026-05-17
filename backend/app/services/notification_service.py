"""Email + Microsoft Teams notification dispatcher.

In development (when SMTP / Teams webhook are unset), notifications are
logged to a JSON file the admin UI can read. This keeps demos working
without configuring real SMTP/Teams.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

NOTIFICATION_LOG = Path(__file__).resolve().parent.parent.parent / "notifications.log.jsonl"


def _log_to_file(payload: dict[str, Any]) -> None:
    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
    try:
        with NOTIFICATION_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as exc:
        logger.warning("Failed to log notification: %s", exc)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send email via SMTP if configured, else log to file."""
    if not settings.mail_username or not settings.mail_password:
        _log_to_file({"channel": "email", "to": to, "subject": subject, "body": body})
        logger.info("[email mock] %s -> %s", subject, to)
        return True

    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart()
        msg["From"] = f"{settings.mail_from_name} <{settings.mail_from}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))

        with smtplib.SMTP(settings.mail_server, settings.mail_port) as server:
            if settings.mail_starttls:
                server.starttls()
            server.login(settings.mail_username, settings.mail_password)
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.exception("Email send failed: %s", exc)
        _log_to_file({"channel": "email", "to": to, "subject": subject, "body": body, "error": str(exc)})
        return False


async def send_teams_card(title: str, text: str, deep_link: str | None = None) -> bool:
    """Send Microsoft Teams adaptive card via webhook if configured."""
    if not settings.teams_webhook_url:
        _log_to_file({"channel": "teams", "title": title, "text": text, "deep_link": deep_link})
        logger.info("[teams mock] %s", title)
        return True

    card: dict[str, Any] = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "themeColor": "2563EB",
        "summary": title,
        "title": title,
        "text": text,
    }
    if deep_link:
        card["potentialAction"] = [
            {
                "@type": "OpenUri",
                "name": "Open in AtomQuest",
                "targets": [{"os": "default", "uri": deep_link}],
            }
        ]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(settings.teams_webhook_url, json=card)
            r.raise_for_status()
        return True
    except Exception as exc:
        logger.exception("Teams send failed: %s", exc)
        _log_to_file({"channel": "teams", "title": title, "text": text, "error": str(exc)})
        return False


def read_notification_log(limit: int = 100) -> list[dict[str, Any]]:
    if not NOTIFICATION_LOG.exists():
        return []
    lines = NOTIFICATION_LOG.read_text(encoding="utf-8").splitlines()[-limit:]
    out: list[dict[str, Any]] = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(out))


# --- Deep-link helpers (Section 5.2) ----------------------------------------

def _base() -> str:
    return (settings.app_base_url or "http://localhost:5174").rstrip("/")


def manager_review_link(employee_id: str | None = None) -> str:
    if employee_id:
        return f"{_base()}/manager/approve/{employee_id}"
    return f"{_base()}/manager"


def employee_goal_link(goal_id: str | None = None) -> str:
    if goal_id:
        return f"{_base()}/goals#goal-{goal_id}"
    return f"{_base()}/goals"


def employee_checkin_link(quarter: str | None = None) -> str:
    if quarter:
        return f"{_base()}/checkins?quarter={quarter}"
    return f"{_base()}/checkins"


def manager_checkin_link(employee_id: str | None = None) -> str:
    if employee_id:
        return f"{_base()}/manager/checkins?employee={employee_id}"
    return f"{_base()}/manager/checkins"


# --- High-level event helpers ----------------------------------------------


async def notify_goal_submitted_email(
    employee_name: str,
    manager_email: str,
    goal_title: str,
    *,
    employee_id: str | None = None,
    goal_id: str | None = None,
) -> None:
    link = manager_review_link(employee_id)
    await send_email(
        manager_email,
        f"[AtomQuest] {employee_name} submitted a goal",
        f"<p><strong>{employee_name}</strong> just submitted goal: <em>{goal_title}</em></p>"
        f"<p><a href='{link}'>Review &amp; approve in AtomQuest</a></p>",
    )
    await send_teams_card(
        f"Goal submitted by {employee_name}",
        f"Goal: {goal_title}",
        deep_link=link,
    )


async def notify_goal_approved_email(
    employee_email: str,
    goal_title: str,
    manager_name: str,
    *,
    goal_id: str | None = None,
) -> None:
    link = employee_goal_link(goal_id)
    await send_email(
        employee_email,
        f"[AtomQuest] Goal approved: {goal_title}",
        f"<p>Your goal <strong>{goal_title}</strong> has been approved by {manager_name} "
        f"and locked on the blockchain audit trail.</p>"
        f"<p><a href='{link}'>Open in AtomQuest</a></p>",
    )
    await send_teams_card(
        f"Goal approved: {goal_title}",
        f"Approved by {manager_name}",
        deep_link=link,
    )


async def notify_goal_returned_email(
    employee_email: str,
    goal_title: str,
    comment: str,
    *,
    goal_id: str | None = None,
) -> None:
    link = employee_goal_link(goal_id)
    await send_email(
        employee_email,
        f"[AtomQuest] Goal returned for rework: {goal_title}",
        f"<p>Your goal <strong>{goal_title}</strong> was returned with comment:</p>"
        f"<blockquote>{comment}</blockquote>"
        f"<p><a href='{link}'>Open and revise</a></p>",
    )
    await send_teams_card(
        f"Goal returned: {goal_title}",
        comment,
        deep_link=link,
    )


async def notify_escalation(
    target_email: str,
    message: str,
    *,
    deep_link: str | None = None,
) -> None:
    link = deep_link or _base()
    await send_email(
        target_email,
        "[AtomQuest] Action required",
        f"<p>{message}</p><p><a href='{link}'>Open AtomQuest</a></p>",
    )
    await send_teams_card("AtomQuest escalation", message, deep_link=link)


async def notify_checkin_window_open(
    employee_email: str,
    employee_name: str,
    quarter: str,
    cycle_name: str,
) -> None:
    link = employee_checkin_link(quarter)
    await send_email(
        employee_email,
        f"[AtomQuest] {quarter} check-in window is now open",
        f"<p>Hi {employee_name},</p>"
        f"<p>The {quarter} check-in window for <strong>{cycle_name}</strong> is now open. "
        f"Please log your actual achievement against each of your locked goals.</p>"
        f"<p><a href='{link}'>Open {quarter} check-in</a></p>",
    )
    await send_teams_card(
        f"{quarter} check-in window opened",
        f"{cycle_name} — log your actuals for {quarter}.",
        deep_link=link,
    )
