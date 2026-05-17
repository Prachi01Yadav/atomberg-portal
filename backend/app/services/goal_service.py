import logging
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Goal, GoalStatus, UoMType
from app.schemas.goal import ValidationErrorDetail

logger = logging.getLogger(__name__)

MIN_WEIGHTAGE = 10.0
MAX_GOALS = 8
REQUIRED_TOTAL_WEIGHTAGE = 100.0


async def get_employee_goals(
    db: AsyncSession, employee_id: UUID, cycle_id: UUID, statuses: list[GoalStatus] | None = None
) -> list[Goal]:
    q = select(Goal).where(Goal.employee_id == employee_id, Goal.cycle_id == cycle_id)
    if statuses:
        q = q.where(Goal.status.in_(statuses))
    result = await db.execute(q.order_by(Goal.created_at))
    return list(result.scalars().all())


async def validate_goals_for_submission(
    db: AsyncSession, employee_id: UUID, cycle_id: UUID
) -> tuple[bool, float, list[ValidationErrorDetail]]:
    goals = await get_employee_goals(db, employee_id, cycle_id, statuses=[GoalStatus.draft])
    all_goals = await get_employee_goals(db, employee_id, cycle_id)
    errors: list[ValidationErrorDetail] = []

    if not all_goals:
        errors.append(ValidationErrorDetail(field="goals", message="At least one goal is required to submit"))

    if len(all_goals) > MAX_GOALS:
        errors.append(
            ValidationErrorDetail(
                field="goals", message=f"Maximum {MAX_GOALS} goals allowed per cycle (found {len(all_goals)})"
            )
        )

    total = sum(g.weightage for g in all_goals)
    if abs(total - REQUIRED_TOTAL_WEIGHTAGE) > 0.01:
        errors.append(
            ValidationErrorDetail(
                field="weightage",
                message=f"Total weightage must be exactly 100% (current: {total}%)",
            )
        )

    for goal in all_goals:
        if goal.weightage < MIN_WEIGHTAGE:
            errors.append(
                ValidationErrorDetail(
                    field=f"goal.{goal.id}.weightage",
                    message=f"Goal '{goal.title}' weightage must be at least {MIN_WEIGHTAGE}%",
                )
            )

    draft_goals = [g for g in all_goals if g.status == GoalStatus.draft]
    if not draft_goals and all_goals:
        errors.append(ValidationErrorDetail(field="status", message="No draft goals available to submit"))

    return len(errors) == 0, total, errors


def compute_checkin_score(
    uom_type: UoMType,
    target_value: float | None,
    target_date: date | None,
    actual_value: float | None,
    completion_date: date | None,
    as_of: date | None = None,
) -> float:
    as_of = as_of or datetime.now(timezone.utc).date()

    if uom_type == UoMType.numeric_min:
        if target_value is None or target_value == 0 or actual_value is None:
            return 0.0
        return actual_value / target_value

    if uom_type == UoMType.numeric_max:
        if target_value is None or actual_value is None:
            return 0.0
        if actual_value == 0:
            return 1.0
        return target_value / actual_value

    if uom_type == UoMType.timeline:
        if completion_date is None or target_date is None:
            return 0.0
        if completion_date <= target_date:
            return 1.0
        days_late = (completion_date - target_date).days
        return max(0.0, 1.0 - days_late / 30.0)

    if uom_type == UoMType.zero:
        if actual_value is None:
            return 0.0
        return 1.0 if actual_value == 0 else 0.0

    return 0.0


def cap_score_for_display(score: float) -> float:
    return min(score, 1.0)


def compute_weighted_total(goals: list[Goal], checkins_by_goal: dict[UUID, list]) -> float:
    total = 0.0
    for goal in goals:
        checkins = checkins_by_goal.get(goal.id, [])
        if not checkins:
            continue
        latest = max(checkins, key=lambda c: c.updated_at)
        if latest.computed_score is not None:
            total += goal.weightage * cap_score_for_display(latest.computed_score)
    return total / 100.0
