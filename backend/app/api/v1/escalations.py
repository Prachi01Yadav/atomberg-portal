from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.escalation import EscalationLog, EscalationRule
from app.models.user import User, UserRole
from app.schemas.escalation import (
    EscalationLogResponse,
    EscalationRuleCreate,
    EscalationRuleResponse,
)
from app.services.escalation_service import run_all_escalations

router = APIRouter(prefix="/escalations", tags=["escalations"])


@router.get("/rules", response_model=list[EscalationRuleResponse])
async def list_rules(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    res = await db.execute(select(EscalationRule).order_by(EscalationRule.rule_type))
    return list(res.scalars().all())


@router.post("/rules", response_model=EscalationRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: EscalationRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    rule = EscalationRule(**body.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=EscalationRuleResponse)
async def update_rule(
    rule_id: UUID,
    body: EscalationRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    rule = await db.get(EscalationRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    for k, v in body.model_dump().items():
        setattr(rule, k, v)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    rule = await db.get(EscalationRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    await db.delete(rule)


@router.get("/logs", response_model=list[EscalationLogResponse])
async def list_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
    limit: int = 100,
):
    res = await db.execute(
        select(EscalationLog).order_by(EscalationLog.sent_at.desc()).limit(limit)
    )
    logs = list(res.scalars().all())
    out: list[EscalationLogResponse] = []
    for log in logs:
        target = await db.get(User, log.target_user_id)
        out.append(
            EscalationLogResponse(
                id=log.id,
                rule_id=log.rule_id,
                target_user_id=log.target_user_id,
                target_user_name=target.full_name if target else None,
                message=log.message,
                sent_at=log.sent_at,
                resolved_at=log.resolved_at,
            )
        )
    return out


@router.post("/logs/{log_id}/resolve", response_model=EscalationLogResponse)
async def resolve_log(
    log_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    from datetime import datetime, timezone

    log = await db.get(EscalationLog, log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    log.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    target = await db.get(User, log.target_user_id)
    return EscalationLogResponse(
        id=log.id,
        rule_id=log.rule_id,
        target_user_id=log.target_user_id,
        target_user_name=target.full_name if target else None,
        message=log.message,
        sent_at=log.sent_at,
        resolved_at=log.resolved_at,
    )


@router.post("/run", response_model=dict)
async def run_now(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    """Manually trigger escalation evaluation (for demo)."""
    return await run_all_escalations(db)
