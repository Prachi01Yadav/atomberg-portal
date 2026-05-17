"""Rule-based escalation evaluator.

Runs daily via Celery beat; can also be triggered manually by Admin.
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.checkin import QuarterlyCheckin
from app.models.cycle import PerformanceCycle
from app.models.escalation import (
    EscalationLog,
    EscalationRule,
    EscalationRuleType,
    NotificationTarget,
)
from app.models.goal import Goal, GoalStatus
from app.models.user import User, UserRole
from app.services import event_service, notification_service
from app.services.cycle_service import get_active_quarter

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _has_recent_log(db: AsyncSession, rule_id: UUID, user_id: UUID, hours: int = 20) -> bool:
    since = _now() - timedelta(hours=hours)
    res = await db.execute(
        select(func.count(EscalationLog.id)).where(
            EscalationLog.rule_id == rule_id,
            EscalationLog.target_user_id == user_id,
            EscalationLog.sent_at >= since,
        )
    )
    return (res.scalar() or 0) > 0


async def _log_and_notify(
    db: AsyncSession, rule: EscalationRule, target: User, message: str
) -> None:
    log = EscalationLog(rule_id=rule.id, target_user_id=target.id, message=message)
    db.add(log)
    await db.flush()
    await notification_service.notify_escalation(target.email, message)

    admins = await db.execute(select(User).where(User.role == UserRole.admin))
    for admin in admins.scalars().all():
        await event_service.notify_escalation_triggered(admin.id, message, rule.rule_type.value)


async def _evaluate_goal_not_submitted(
    db: AsyncSession, rule: EscalationRule, cycle: PerformanceCycle
) -> int:
    cutoff = cycle.goal_setting_open + timedelta(days=rule.threshold_days)
    if _now().date() < cutoff:
        return 0

    employees = await db.execute(select(User).where(User.role == UserRole.employee))
    count = 0
    for emp in employees.scalars().all():
        goals = await db.scalar(
            select(func.count(Goal.id)).where(
                Goal.employee_id == emp.id,
                Goal.cycle_id == cycle.id,
                Goal.status.in_([GoalStatus.submitted, GoalStatus.locked]),
            )
        )
        if (goals or 0) > 0:
            continue
        if await _has_recent_log(db, rule.id, emp.id):
            continue

        target = emp
        if rule.notification_target == NotificationTarget.manager and emp.manager_id:
            target = await db.get(User, emp.manager_id) or emp
        elif rule.notification_target == NotificationTarget.hr:
            hr = await db.execute(select(User).where(User.role == UserRole.admin).limit(1))
            target = hr.scalar_one_or_none() or emp

        msg = f"{emp.full_name} has not submitted goals for cycle {cycle.name} ({rule.threshold_days}+ days overdue)."
        await _log_and_notify(db, rule, target, msg)
        count += 1
    return count


async def _evaluate_goal_not_approved(
    db: AsyncSession, rule: EscalationRule, cycle: PerformanceCycle
) -> int:
    cutoff = _now() - timedelta(days=rule.threshold_days)
    pending = await db.execute(
        select(Goal).where(
            Goal.cycle_id == cycle.id,
            Goal.status == GoalStatus.submitted,
            Goal.updated_at <= cutoff,
        )
    )
    count = 0
    for goal in pending.scalars().all():
        emp = await db.get(User, goal.employee_id)
        if emp is None or emp.manager_id is None:
            continue
        manager = await db.get(User, emp.manager_id)
        if manager is None:
            continue

        target = manager
        if rule.notification_target == NotificationTarget.hr:
            hr = await db.execute(select(User).where(User.role == UserRole.admin).limit(1))
            target = hr.scalar_one_or_none() or manager

        if await _has_recent_log(db, rule.id, target.id):
            continue
        msg = f"Goal '{goal.title}' submitted by {emp.full_name} is pending approval for {rule.threshold_days}+ days."
        await _log_and_notify(db, rule, target, msg)
        count += 1
    return count


async def _evaluate_checkin_not_done(
    db: AsyncSession, rule: EscalationRule, cycle: PerformanceCycle
) -> int:
    active_q = get_active_quarter(cycle)
    if active_q is None:
        return 0

    employees = await db.execute(select(User).where(User.role == UserRole.employee))
    count = 0
    for emp in employees.scalars().all():
        # any locked goal?
        locked = await db.scalar(
            select(func.count(Goal.id)).where(
                Goal.employee_id == emp.id,
                Goal.cycle_id == cycle.id,
                Goal.status == GoalStatus.locked,
            )
        )
        if not locked:
            continue
        # any checkin for active quarter?
        done = await db.scalar(
            select(func.count(QuarterlyCheckin.id))
            .join(Goal, Goal.id == QuarterlyCheckin.goal_id)
            .where(
                Goal.employee_id == emp.id,
                Goal.cycle_id == cycle.id,
                QuarterlyCheckin.quarter == active_q,
            )
        )
        if (done or 0) > 0:
            continue
        if await _has_recent_log(db, rule.id, emp.id):
            continue

        target = emp
        if rule.notification_target == NotificationTarget.manager and emp.manager_id:
            target = await db.get(User, emp.manager_id) or emp
        elif rule.notification_target == NotificationTarget.hr:
            hr = await db.execute(select(User).where(User.role == UserRole.admin).limit(1))
            target = hr.scalar_one_or_none() or emp

        msg = f"{emp.full_name} has not completed {active_q.value} check-in."
        await _log_and_notify(db, rule, target, msg)
        count += 1
    return count


async def run_all_escalations(db: AsyncSession) -> dict[str, int]:
    cycle_q = await db.execute(select(PerformanceCycle).where(PerformanceCycle.is_active.is_(True)))
    cycle = cycle_q.scalar_one_or_none()
    if cycle is None:
        return {"error": "no active cycle"}

    rules_q = await db.execute(select(EscalationRule).where(EscalationRule.is_active.is_(True)))
    rules = list(rules_q.scalars().all())

    results: dict[str, int] = {}
    for rule in rules:
        try:
            if rule.rule_type == EscalationRuleType.goal_not_submitted:
                results[f"{rule.rule_type.value}_{rule.threshold_days}d"] = await _evaluate_goal_not_submitted(
                    db, rule, cycle
                )
            elif rule.rule_type == EscalationRuleType.goal_not_approved:
                results[f"{rule.rule_type.value}_{rule.threshold_days}d"] = await _evaluate_goal_not_approved(
                    db, rule, cycle
                )
            elif rule.rule_type == EscalationRuleType.checkin_not_done:
                results[f"{rule.rule_type.value}_{rule.threshold_days}d"] = await _evaluate_checkin_not_done(
                    db, rule, cycle
                )
        except Exception as exc:
            logger.exception("Escalation rule %s failed: %s", rule.id, exc)
    return results
