from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.checkin import QuarterlyCheckin
from app.models.goal import Goal
from app.models.user import User, UserRole
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class ScoreGoalRequest(BaseModel):
    title: str
    description: str | None = None
    thrust_area: str
    uom_type: str
    target_value: float | None = None
    weightage: float


class ParseNLRequest(BaseModel):
    text: str = Field(min_length=5)


class RiskAnalysisRequest(BaseModel):
    employee_id: UUID
    cycle_id: UUID


@router.post("/score-goal")
async def score_goal(
    body: ScoreGoalRequest,
    _: Annotated[User, Depends(get_current_user)],
) -> dict:
    return await ai_service.score_goal(body.model_dump())


@router.post("/parse-natural-language")
async def parse_nl(
    body: ParseNLRequest,
    _: Annotated[User, Depends(get_current_user)],
) -> dict:
    return await ai_service.parse_natural_language(body.text)


@router.post("/risk-analysis")
async def risk_analysis(
    body: RiskAnalysisRequest,
    current_user: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    result = await db.execute(
        select(Goal).where(Goal.employee_id == body.employee_id, Goal.cycle_id == body.cycle_id)
    )
    goals = list(result.scalars().all())
    payload = []
    for g in goals:
        checkins = await db.execute(select(QuarterlyCheckin).where(QuarterlyCheckin.goal_id == g.id))
        payload.append(
            {
                "title": g.title,
                "target": g.target_value,
                "checkins": [
                    {"quarter": c.quarter.value, "actual": c.actual_value}
                    for c in checkins.scalars()
                ],
            }
        )
    return await ai_service.risk_analysis(payload)


@router.post("/checkin-insights/{checkin_id}")
async def checkin_insights(
    checkin_id: UUID,
    _: Annotated[User, Depends(require_roles(UserRole.manager, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    checkin = await db.get(QuarterlyCheckin, checkin_id)
    if checkin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    goal = await db.get(Goal, checkin.goal_id)
    return await ai_service.checkin_insights(
        {
            "notes": checkin.employee_notes,
            "actual": checkin.actual_value,
            "target": goal.target_value if goal else None,
            "manager_comment": checkin.manager_comment,
        }
    )
