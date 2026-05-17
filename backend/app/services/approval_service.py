import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.goal import Goal, GoalStatus
from app.models.user import User, UserRole
from app.schemas.approval import GoalInlineEdit
from app.services import audit_service, event_service
from app.services.blockchain_service import hash_goal_state, publish_hash

logger = logging.getLogger(__name__)


async def _get_goal_for_manager(db: AsyncSession, goal_id: UUID, manager: User) -> Goal:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    employee = await db.get(User, goal.employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if manager.role == UserRole.admin:
        return goal

    if manager.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")

    if employee.manager_id != manager.id and goal.employee_id != manager.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a direct report")

    return goal


async def inline_edit_goal(
    db: AsyncSession, goal_id: UUID, manager: User, edits: GoalInlineEdit
) -> Goal:
    goal = await _get_goal_for_manager(db, goal_id, manager)

    if goal.status != GoalStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only submitted goals can be edited during approval",
        )
    if goal.is_shared:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shared goals cannot be inline-edited by manager",
        )

    changes: list[tuple[str, str, str]] = []
    for field, value in edits.model_dump(exclude_unset=True).items():
        old = getattr(goal, field)
        if old != value:
            changes.append((field, str(old), str(value)))
            setattr(goal, field, value)

    await db.flush()

    for field, old, new in changes:
        await audit_service.record_change(
            db,
            goal_id=goal.id,
            changed_by=manager.id,
            change_type="manager_inline_edit",
            field_changed=field,
            old_value=old,
            new_value=new,
        )

    await db.refresh(goal)
    return goal


async def _lock_and_publish(db: AsyncSession, goal: Goal) -> None:
    goal.status = GoalStatus.locked
    goal.locked_at = datetime.now(timezone.utc)
    goal.manager_return_comment = None

    data_hash = hash_goal_state(goal)
    try:
        tx_hash = await publish_hash(goal.id, data_hash)
        goal.blockchain_tx_hash = tx_hash
        goal.blockchain_verified = True
    except Exception as exc:
        logger.exception("Blockchain publish failed for goal %s: %s", goal.id, exc)
        goal.blockchain_verified = False

    await db.flush()


async def approve_goal(db: AsyncSession, goal_id: UUID, manager: User) -> Goal:
    goal = await _get_goal_for_manager(db, goal_id, manager)

    if goal.status != GoalStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only submitted goals can be approved",
        )

    # If the goal was previously locked then admin-unlocked, the new approval is a
    # post-lock event and must be audited per BRD section 4.
    was_unlocked = await db.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.goal_id == goal.id, AuditLog.change_type == "admin_unlock"
        )
    )

    await _lock_and_publish(db, goal)
    await db.refresh(goal)

    if was_unlocked:
        await audit_service.record_change(
            db,
            goal_id=goal.id,
            changed_by=manager.id,
            change_type="manager_re_approval",
            field_changed="status",
            old_value="submitted",
            new_value="locked",
        )

    employee = await db.get(User, goal.employee_id)
    if employee:
        await event_service.notify_goal_approved(goal, employee, manager)

    return goal


async def return_goal(
    db: AsyncSession, goal_id: UUID, manager: User, comment: str
) -> Goal:
    goal = await _get_goal_for_manager(db, goal_id, manager)

    if goal.status != GoalStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only submitted goals can be returned",
        )

    goal.status = GoalStatus.draft
    goal.manager_return_comment = comment

    await db.flush()
    await db.refresh(goal)

    employee = await db.get(User, goal.employee_id)
    if employee:
        await event_service.notify_goal_returned(goal, employee, manager, comment)

    return goal


async def approve_all_for_employee(
    db: AsyncSession, employee_id: UUID, cycle_id: UUID, manager: User
) -> list[Goal]:
    employee = await db.get(User, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if manager.role == UserRole.manager and employee.manager_id != manager.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a direct report")

    result = await db.execute(
        select(Goal).where(
            Goal.employee_id == employee_id,
            Goal.cycle_id == cycle_id,
            Goal.status == GoalStatus.submitted,
        )
    )
    goals = list(result.scalars().all())
    if not goals:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No submitted goals to approve")

    for goal in goals:
        await _lock_and_publish(db, goal)

    await db.flush()
    for goal in goals:
        await db.refresh(goal)

    await event_service.notify_goals_bulk_approved(employee, manager, len(goals), cycle_id)
    return goals


async def get_team_goals(
    db: AsyncSession, manager: User, cycle_id: UUID, status_filter: GoalStatus | None = None
) -> list[Goal]:
    reports_q = select(User.id).where(User.manager_id == manager.id)
    if manager.role == UserRole.admin:
        reports_q = select(User.id).where(User.role == UserRole.employee)

    result = await db.execute(reports_q)
    employee_ids = list(result.scalars().all())
    if not employee_ids:
        return []

    q = select(Goal).where(Goal.employee_id.in_(employee_ids), Goal.cycle_id == cycle_id)
    if status_filter:
        q = q.where(Goal.status == status_filter)
    goals_result = await db.execute(q.order_by(Goal.employee_id, Goal.created_at))
    return list(goals_result.scalars().all())
