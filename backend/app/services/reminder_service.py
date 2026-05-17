"""Quarter-open check-in reminders (Section 5.2).

When a quarter window opens, email every employee who has at least one
locked goal in that cycle a reminder to log their actuals.  Each (employee,
cycle, quarter) is reminded at most once via a small JSONL log of sent
reminders that prevents duplicates across runs.

This module is additive — it does not touch the existing escalation engine.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.checkin import Quarter
from app.models.cycle import PerformanceCycle
from app.models.goal import Goal, GoalStatus
from app.models.user import User, UserRole
from app.services import notification_service
from app.services.cycle_service import get_quarter_windows

logger = logging.getLogger(__name__)

REMINDER_LOG = (
    Path(__file__).resolve().parent.parent.parent / "checkin_reminders.log.jsonl"
)


def _read_sent_keys() -> set[str]:
    if not REMINDER_LOG.exists():
        return set()
    keys: set[str] = set()
    for line in REMINDER_LOG.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
            keys.add(entry["key"])
        except (json.JSONDecodeError, KeyError):
            continue
    return keys


def _record_sent(key: str, payload: dict) -> None:
    payload["key"] = key
    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
    try:
        with REMINDER_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to record reminder log: %s", exc)


def _quarters_opening_today(cycle: PerformanceCycle, today: date) -> list[Quarter]:
    """Return any quarter whose window opened today (UTC)."""
    opens = {
        Quarter.Q1: cycle.q1_open,
        Quarter.Q2: cycle.q2_open,
        Quarter.Q3: cycle.q3_open,
        Quarter.Q4: cycle.q4_open,
    }
    return [q for q, d in opens.items() if d == today]


async def _employees_with_locked_goals(
    db: AsyncSession, cycle_id, employee_ids: Iterable[str] | None = None
) -> list[User]:
    q = (
        select(User)
        .join(Goal, Goal.employee_id == User.id)
        .where(
            User.role == UserRole.employee,
            Goal.cycle_id == cycle_id,
            Goal.status == GoalStatus.locked,
        )
        .group_by(User.id)
        .having(func.count(Goal.id) > 0)
    )
    if employee_ids:
        q = q.where(User.id.in_(list(employee_ids)))
    res = await db.execute(q)
    return list(res.scalars().all())


async def send_checkin_reminders(
    db: AsyncSession,
    *,
    as_of: date | None = None,
    force_quarter: Quarter | None = None,
    force: bool = False,
) -> dict:
    """Send check-in window-open reminders.

    - Default behaviour (called from Celery beat): fires only for quarters
      whose window opens *today*; each (employee, cycle, quarter) gets at
      most one reminder ever.
    - Admin-triggered demo behaviour: pass `force_quarter` to send for a
      specific quarter regardless of date; pass `force=True` to bypass the
      dedupe log.
    """
    today = as_of or datetime.now(timezone.utc).date()
    cycle = (
        await db.execute(select(PerformanceCycle).where(PerformanceCycle.is_active.is_(True)))
    ).scalar_one_or_none()
    if cycle is None:
        return {"sent": 0, "skipped": 0, "reason": "no active cycle"}

    if force_quarter is not None:
        quarters_today = [force_quarter]
    else:
        quarters_today = _quarters_opening_today(cycle, today)

    if not quarters_today:
        windows = get_quarter_windows(cycle)
        next_open = min(
            ((d, q) for q, (d, _) in windows.items() if d >= today),
            default=(None, None),
        )
        return {
            "sent": 0,
            "skipped": 0,
            "reason": "no quarter window opens today",
            "next_open": str(next_open[0]) if next_open[0] else None,
            "next_quarter": next_open[1].value if next_open[1] else None,
        }

    already_sent = set() if force else _read_sent_keys()
    sent = 0
    skipped = 0
    for quarter in quarters_today:
        recipients = await _employees_with_locked_goals(db, cycle.id)
        for emp in recipients:
            key = f"{emp.id}:{cycle.id}:{quarter.value}"
            if key in already_sent:
                skipped += 1
                continue
            try:
                await notification_service.notify_checkin_window_open(
                    emp.email, emp.full_name, quarter.value, cycle.name
                )
                _record_sent(
                    key,
                    {
                        "employee_email": emp.email,
                        "cycle_id": str(cycle.id),
                        "quarter": quarter.value,
                    },
                )
                sent += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception("Reminder send failed for %s: %s", emp.email, exc)
    return {
        "sent": sent,
        "skipped": skipped,
        "quarters": [q.value for q in quarters_today],
        "cycle": cycle.name,
    }


def read_reminder_log(limit: int = 100) -> list[dict]:
    if not REMINDER_LOG.exists():
        return []
    lines = REMINDER_LOG.read_text(encoding="utf-8").splitlines()[-limit:]
    out: list[dict] = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(out))
