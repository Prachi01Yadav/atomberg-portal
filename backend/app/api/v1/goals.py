import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.cycle import PerformanceCycle
from app.models.goal import Goal, GoalStatus
from app.models.user import User, UserRole
from app.schemas.goal import (
    GoalCreate,
    GoalResponse,
    GoalSubmitResponse,
    GoalUpdate,
    GoalValidationResponse,
)
from app.services import audit_service, event_service
from app.models.audit import AuditLog
from sqlalchemy import select as sa_select, func
from app.services.goal_service import get_employee_goals, validate_goals_for_submission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/goals", tags=["goals"])


def _ensure_editable(goal: Goal, user: User) -> None:
    if goal.employee_id != user.id and user.role == UserRole.employee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your goal")
    if goal.status in (GoalStatus.locked, GoalStatus.approved):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Goal is locked")


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    cycle_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    employee_id: UUID | None = None,
) -> list[Goal]:
    target_id = employee_id or current_user.id
    if current_user.role == UserRole.employee and target_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.manager:
        if target_id != current_user.id:
            report = await db.get(User, target_id)
            if report is None or report.manager_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a direct report")
    goals = await get_employee_goals(db, target_id, cycle_id)
    return goals


@router.get("/validate", response_model=GoalValidationResponse)
async def validate_goals(
    cycle_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GoalValidationResponse:
    valid, total, errors = await validate_goals_for_submission(db, current_user.id, cycle_id)
    return GoalValidationResponse(valid=valid, total_weightage=total, errors=errors)


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: GoalCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Goal:
    if current_user.role not in (UserRole.employee, UserRole.manager, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create goals")

    cycle = await db.get(PerformanceCycle, body.cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")

    existing = await get_employee_goals(db, current_user.id, body.cycle_id)
    if len(existing) >= 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 8 goals per cycle")

    goal = Goal(
        employee_id=current_user.id,
        cycle_id=body.cycle_id,
        thrust_area=body.thrust_area,
        title=body.title,
        description=body.description,
        uom_type=body.uom_type,
        target_value=body.target_value,
        target_date=body.target_date,
        weightage=body.weightage,
        status=GoalStatus.draft,
    )
    db.add(goal)
    await db.flush()
    await db.refresh(goal)
    return goal


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    body: GoalUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Goal:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if goal.employee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your goal")

    if goal.is_shared:
        if body.model_dump(exclude_unset=True).keys() - {"weightage"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Shared goals: only weightage can be changed",
            )
        if body.weightage is not None:
            goal.weightage = body.weightage
        await db.flush()
        await db.refresh(goal)
        return goal

    _ensure_editable(goal, current_user)

    # If this goal has ever been locked (admin unlocked it), audit every change
    was_ever_locked = await db.scalar(
        sa_select(func.count(AuditLog.id)).where(
            AuditLog.goal_id == goal.id, AuditLog.change_type == "admin_unlock"
        )
    )

    changes: list[tuple[str, str, str]] = []
    for field, value in body.model_dump(exclude_unset=True).items():
        old = getattr(goal, field)
        if old != value:
            if was_ever_locked:
                changes.append((field, str(old), str(value)))
            setattr(goal, field, value)
    await db.flush()

    for field, old, new in changes:
        await audit_service.record_change(
            db,
            goal_id=goal.id,
            changed_by=current_user.id,
            change_type="employee_edit_after_unlock",
            field_changed=field,
            old_value=old,
            new_value=new,
        )

    await db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if goal.employee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your goal")
    _ensure_editable(goal, current_user)
    await db.delete(goal)


@router.post("/submit", response_model=GoalSubmitResponse)
async def submit_all_goals(
    cycle_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GoalSubmitResponse:
    valid, _, errors = await validate_goals_for_submission(db, current_user.id, cycle_id)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Validation failed", "errors": [e.model_dump() for e in errors]},
        )
    goals = await get_employee_goals(db, current_user.id, cycle_id, statuses=[GoalStatus.draft])
    for goal in goals:
        goal.status = GoalStatus.submitted
    await db.flush()

    for goal in goals:
        await event_service.notify_goal_submitted(goal, current_user, db=db)

    return GoalSubmitResponse(
        submitted_count=len(goals),
        message=f"Successfully submitted {len(goals)} goal(s)",
    )
