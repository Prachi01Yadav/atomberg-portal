from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.goal import UoMType
from app.schemas.goal import GoalResponse


class SharedGoalPush(BaseModel):
    cycle_id: UUID
    thrust_area: str
    title: str
    description: str | None = None
    uom_type: UoMType
    target_value: float | None = None
    target_date: date | None = None
    weightage: float = Field(ge=10, le=100)
    employee_ids: list[UUID] = Field(min_length=1)


class SharedGoalPushResponse(BaseModel):
    primary_goal_id: UUID
    goals: list[GoalResponse]
