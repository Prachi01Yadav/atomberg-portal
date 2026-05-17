import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.goal import Goal, GoalStatus
from app.models.user import User, UserRole
from app.schemas.approval import (
    ApproveAllResponse,
    GoalInlineEdit,
    ReturnGoalRequest,
    TeamMemberSummary,
)
from app.schemas.goal import GoalResponse
from app.services import approval_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/team", response_model=list[GoalResponse])
async def list_team_goals(
    cycle_id: UUID,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: GoalStatus | None = None,
) -> list[Goal]:
    return await approval_service.get_team_goals(db, current_user, cycle_id, status)


@router.get("/team/summary", response_model=list[TeamMemberSummary])
async def team_summary(
    cycle_id: UUID,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamMemberSummary]:
    if current_user.role == UserRole.admin:
        reports_q = select(User).where(User.role == UserRole.employee)
    else:
        reports_q = select(User).where(User.manager_id == current_user.id)

    reports = list((await db.execute(reports_q)).scalars().all())
    summaries: list[TeamMemberSummary] = []

    for emp in reports:
        stats = await db.execute(
            select(Goal.status, func.count(Goal.id))
            .where(Goal.employee_id == emp.id, Goal.cycle_id == cycle_id)
            .group_by(Goal.status)
        )
        counts = {row[0]: row[1] for row in stats.all()}
        total = sum(counts.values())
        summaries.append(
            TeamMemberSummary(
                employee_id=emp.id,
                full_name=emp.full_name,
                department=emp.department,
                total_goals=total,
                submitted_count=counts.get(GoalStatus.submitted, 0),
                locked_count=counts.get(GoalStatus.locked, 0),
                draft_count=counts.get(GoalStatus.draft, 0),
                returned_count=counts.get(GoalStatus.returned, 0),
                pending_approval=counts.get(GoalStatus.submitted, 0),
            )
        )
    return summaries


@router.get("/employee/{employee_id}", response_model=list[GoalResponse])
async def employee_goals_for_approval(
    employee_id: UUID,
    cycle_id: UUID,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Goal]:
    employee = await db.get(User, employee_id)
    if employee is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if current_user.role == UserRole.manager and employee.manager_id != current_user.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a direct report")

    result = await db.execute(
        select(Goal)
        .where(Goal.employee_id == employee_id, Goal.cycle_id == cycle_id)
        .order_by(Goal.created_at)
    )
    return list(result.scalars().all())


@router.patch("/{goal_id}", response_model=GoalResponse)
async def inline_edit_goal(
    goal_id: UUID,
    body: GoalInlineEdit,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Goal:
    return await approval_service.inline_edit_goal(db, goal_id, current_user, body)


@router.post("/{goal_id}/approve", response_model=GoalResponse)
async def approve_goal(
    goal_id: UUID,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Goal:
    return await approval_service.approve_goal(db, goal_id, current_user)


@router.post("/{goal_id}/return", response_model=GoalResponse)
async def return_goal(
    goal_id: UUID,
    body: ReturnGoalRequest,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Goal:
    return await approval_service.return_goal(db, goal_id, current_user, body.comment)


@router.post(
    "/employee/{employee_id}/approve-all",
    response_model=ApproveAllResponse,
)
async def approve_all_goals(
    employee_id: UUID,
    cycle_id: UUID,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApproveAllResponse:
    goals = await approval_service.approve_all_for_employee(
        db, employee_id, cycle_id, current_user
    )
    return ApproveAllResponse(approved_count=len(goals), goals=goals)
