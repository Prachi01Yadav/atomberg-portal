import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.audit import AuditLog
from app.models.goal import Goal, GoalStatus
from app.models.user import User, UserRole
from app.schemas.admin import UnlockGoalRequest, UnlockGoalResponse
from app.schemas.goal import GoalResponse
from app.services.blockchain_service import hash_audit_payload, publish_hash
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


class AuditLogOut(BaseModel):
    id: UUID
    goal_id: UUID
    goal_title: str | None
    employee_name: str | None
    changed_by_name: str | None
    change_type: str
    field_changed: str | None
    old_value: str | None
    new_value: str | None
    timestamp: datetime
    blockchain_tx_hash: str | None

    model_config = {"from_attributes": True}


@router.get("/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
    limit: int = 100,
):
    result = await db.execute(
        select(AuditLog)
        .options(selectinload(AuditLog.goal).selectinload(Goal.employee), selectinload(AuditLog.user))
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
    )
    logs = []
    for entry in result.scalars().all():
        logs.append(
            AuditLogOut(
                id=entry.id,
                goal_id=entry.goal_id,
                goal_title=entry.goal.title if entry.goal else None,
                employee_name=entry.goal.employee.full_name if entry.goal and entry.goal.employee else None,
                changed_by_name=entry.user.full_name if entry.user else None,
                change_type=entry.change_type,
                field_changed=entry.field_changed,
                old_value=entry.old_value,
                new_value=entry.new_value,
                timestamp=entry.timestamp,
                blockchain_tx_hash=entry.blockchain_tx_hash,
            )
        )
    return logs


class LockedGoalSummary(BaseModel):
    goal_id: UUID
    title: str
    employee_name: str
    department: str | None
    weightage: float
    locked_at: datetime | None


@router.get("/goals/locked", response_model=list[LockedGoalSummary])
async def list_locked_goals(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
    cycle_id: UUID | None = None,
):
    q = (
        select(Goal)
        .options(selectinload(Goal.employee))
        .where(Goal.status == GoalStatus.locked)
        .order_by(Goal.locked_at.desc())
    )
    if cycle_id:
        q = q.where(Goal.cycle_id == cycle_id)
    rows = list((await db.execute(q)).scalars().all())
    return [
        LockedGoalSummary(
            goal_id=g.id,
            title=g.title,
            employee_name=g.employee.full_name if g.employee else "",
            department=g.employee.department if g.employee else None,
            weightage=g.weightage,
            locked_at=g.locked_at,
        )
        for g in rows
    ]


@router.post("/goals/{goal_id}/unlock", response_model=UnlockGoalResponse)
async def unlock_goal(
    goal_id: UUID,
    body: UnlockGoalRequest,
    current_user: Annotated[User, Depends(require_roles(UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UnlockGoalResponse:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if goal.status != GoalStatus.locked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Goal is not locked")

    old_status = goal.status.value
    goal.status = GoalStatus.draft
    goal.locked_at = None
    goal.blockchain_verified = False

    audit = AuditLog(
        goal_id=goal.id,
        changed_by=current_user.id,
        change_type="admin_unlock",
        field_changed="status",
        old_value=old_status,
        new_value=f"draft (reason: {body.reason})",
    )
    db.add(audit)
    await db.flush()

    audit_hash = hash_audit_payload(
        {
            "goal_id": str(goal.id),
            "change_type": "admin_unlock",
            "reason": body.reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    try:
        tx_hash = await publish_hash(goal.id, audit_hash)
        audit.blockchain_tx_hash = tx_hash
    except Exception as exc:
        logger.exception("Audit blockchain publish failed: %s", exc)
        tx_hash = None

    await db.flush()
    await db.refresh(goal)
    await db.refresh(audit)

    return UnlockGoalResponse(goal=goal, audit_log_id=audit.id, blockchain_tx_hash=tx_hash)
