from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.goal import GoalStatus
from app.schemas.goal import GoalResponse


class GoalInlineEdit(BaseModel):
    target_value: float | None = None
    target_date: date | None = None
    weightage: float | None = Field(default=None, ge=10, le=100)


class ReturnGoalRequest(BaseModel):
    comment: str = Field(min_length=1)


class TeamMemberSummary(BaseModel):
    employee_id: UUID
    full_name: str
    department: str | None
    total_goals: int
    submitted_count: int
    locked_count: int
    draft_count: int
    returned_count: int
    pending_approval: int


class ApproveAllResponse(BaseModel):
    approved_count: int
    goals: list[GoalResponse]
