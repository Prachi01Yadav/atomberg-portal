import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.checkin import Quarter, QuarterlyCheckin
from app.models.cycle import PerformanceCycle
from app.models.goal import Goal, GoalStatus
from app.models.shared_goal import SharedGoalLink
from app.models.user import User, UserRole
from app.schemas.checkin import (
    CheckinCreate,
    CheckinResponse,
    CheckinUpdate,
    ManagerCheckinComment,
    QuarterWindowStatus,
)
from app.services import event_service
from app.services.cycle_service import get_active_quarter, get_quarter_window_status
from app.services.goal_service import cap_score_for_display, compute_checkin_score

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.get("/window", response_model=QuarterWindowStatus)
async def checkin_window(
    cycle_id: UUID,
    quarter: Quarter,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    force_open: bool = Query(default=False),
) -> QuarterWindowStatus:
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    allow_force = force_open and current_user.role == UserRole.admin
    is_open, message, days = get_quarter_window_status(cycle, quarter, force_open=allow_force)
    return QuarterWindowStatus(
        quarter=quarter,
        is_open=is_open,
        message=message,
        days_until_open=days,
    )


@router.get("/goal/{goal_id}", response_model=list[CheckinResponse])
async def list_goal_checkins(
    goal_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[QuarterlyCheckin]:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if current_user.role == UserRole.employee and goal.employee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(
        select(QuarterlyCheckin).where(QuarterlyCheckin.goal_id == goal_id).order_by(QuarterlyCheckin.quarter)
    )
    return list(result.scalars().all())


@router.post("/goal/{goal_id}", response_model=CheckinResponse, status_code=status.HTTP_201_CREATED)
async def log_checkin(
    goal_id: UUID,
    body: CheckinCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    force_open: bool = Query(default=False),
) -> QuarterlyCheckin:
    result = await db.execute(
        select(Goal).options(selectinload(Goal.cycle)).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if goal.employee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your goal")
    if goal.status != GoalStatus.locked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only locked goals accept check-ins")

    allow_force = force_open and current_user.role == UserRole.admin
    is_open, message, _ = get_quarter_window_status(goal.cycle, body.quarter, force_open=allow_force)
    if not is_open:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    existing = await db.execute(
        select(QuarterlyCheckin).where(
            QuarterlyCheckin.goal_id == goal_id, QuarterlyCheckin.quarter == body.quarter
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Check-in already exists; use PATCH")

    score = compute_checkin_score(
        goal.uom_type,
        goal.target_value,
        goal.target_date,
        body.actual_value,
        body.completion_date,
    )
    checkin = QuarterlyCheckin(
        goal_id=goal_id,
        quarter=body.quarter,
        actual_value=body.actual_value,
        completion_date=body.completion_date,
        goal_status=body.goal_status,
        employee_notes=body.employee_notes,
        computed_score=score,
    )
    db.add(checkin)
    await db.flush()

    await _sync_shared_checkins(db, goal, checkin)
    await db.flush()

    employee = await db.get(User, goal.employee_id)
    if employee and employee.manager_id:
        await event_service.notify_checkin_logged(goal, employee, body.quarter.value)

    await db.refresh(checkin)
    return checkin


async def _sync_shared_checkins(
    db: AsyncSession, primary_goal: Goal, source: QuarterlyCheckin
) -> None:
    links = await db.execute(
        select(SharedGoalLink).where(SharedGoalLink.primary_goal_id == primary_goal.id)
    )
    for link in links.scalars().all():
        recipient = await db.get(Goal, link.recipient_goal_id)
        if recipient is None:
            continue
        existing = await db.execute(
            select(QuarterlyCheckin).where(
                QuarterlyCheckin.goal_id == recipient.id,
                QuarterlyCheckin.quarter == source.quarter,
            )
        )
        checkin = existing.scalar_one_or_none()
        if checkin is None:
            checkin = QuarterlyCheckin(
                goal_id=recipient.id,
                quarter=source.quarter,
                actual_value=source.actual_value,
                completion_date=source.completion_date,
                goal_status=source.goal_status,
                employee_notes=f"Synced from shared goal owner",
                computed_score=source.computed_score,
            )
            db.add(checkin)
        else:
            checkin.actual_value = source.actual_value
            checkin.completion_date = source.completion_date
            checkin.computed_score = source.computed_score


@router.patch("/{checkin_id}", response_model=CheckinResponse)
async def update_checkin(
    checkin_id: UUID,
    body: CheckinUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuarterlyCheckin:
    checkin = await db.get(QuarterlyCheckin, checkin_id)
    if checkin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    goal = await db.get(Goal, checkin.goal_id)
    if goal is None or goal.employee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(checkin, field, value)

    checkin.computed_score = compute_checkin_score(
        goal.uom_type,
        goal.target_value,
        goal.target_date,
        checkin.actual_value,
        checkin.completion_date,
    )
    await db.flush()
    await _sync_shared_checkins(db, goal, checkin)
    await db.refresh(checkin)
    return checkin


@router.post("/{checkin_id}/manager-comment", response_model=CheckinResponse)
async def add_manager_comment(
    checkin_id: UUID,
    body: ManagerCheckinComment,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuarterlyCheckin:
    checkin = await db.get(QuarterlyCheckin, checkin_id)
    if checkin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    goal = await db.get(Goal, checkin.goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    employee = await db.get(User, goal.employee_id)
    if current_user.role == UserRole.manager and employee and employee.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a direct report")

    checkin.manager_comment = body.manager_comment
    await db.flush()
    await db.refresh(checkin)
    return checkin
