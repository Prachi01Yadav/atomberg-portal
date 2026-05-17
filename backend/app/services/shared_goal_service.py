import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Goal, GoalStatus
from app.models.shared_goal import SharedGoalLink
from app.models.user import User, UserRole
from app.schemas.shared_goal import SharedGoalPush

logger = logging.getLogger(__name__)


async def push_shared_goal(
    db: AsyncSession, pusher: User, payload: SharedGoalPush
) -> tuple[Goal, list[Goal]]:
    if pusher.role not in (UserRole.admin, UserRole.manager):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    primary: Goal | None = None
    copies: list[Goal] = []

    for emp_id in payload.employee_ids:
        emp = await db.get(User, emp_id)
        if emp is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Employee {emp_id} not found")
        if pusher.role == UserRole.manager and emp.manager_id != pusher.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your direct report")

        copy = Goal(
            employee_id=emp_id,
            cycle_id=payload.cycle_id,
            thrust_area=payload.thrust_area,
            title=payload.title,
            description=payload.description,
            uom_type=payload.uom_type,
            target_value=payload.target_value,
            target_date=payload.target_date,
            weightage=payload.weightage,
            status=GoalStatus.draft,
            is_shared=True,
            shared_by=pusher.id,
        )
        db.add(copy)
        await db.flush()
        copies.append(copy)

        if primary is None:
            primary = copy
            primary.is_shared = False
            primary.shared_by = None
        else:
            copy.primary_shared_goal_id = primary.id
            db.add(SharedGoalLink(primary_goal_id=primary.id, recipient_goal_id=copy.id))

    if primary is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No employees provided")

    await db.flush()
    return primary, copies
