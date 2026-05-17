from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.goal import GoalStatus, UoMType


class GoalBase(BaseModel):
    thrust_area: str
    title: str
    description: str | None = None
    uom_type: UoMType
    target_value: float | None = None
    target_date: date | None = None
    weightage: float = Field(ge=10, le=100)


class GoalCreate(GoalBase):
    cycle_id: UUID


class GoalUpdate(BaseModel):
    thrust_area: str | None = None
    title: str | None = None
    description: str | None = None
    uom_type: UoMType | None = None
    target_value: float | None = None
    target_date: date | None = None
    weightage: float | None = Field(default=None, ge=10, le=100)


class GoalResponse(GoalBase):
    id: UUID
    employee_id: UUID
    cycle_id: UUID
    status: GoalStatus
    is_shared: bool
    shared_by: UUID | None
    primary_shared_goal_id: UUID | None
    blockchain_tx_hash: str | None
    blockchain_verified: bool
    manager_return_comment: str | None
    created_at: datetime
    updated_at: datetime
    locked_at: datetime | None

    model_config = {"from_attributes": True}


class GoalSubmitResponse(BaseModel):
    submitted_count: int
    message: str


class ValidationErrorDetail(BaseModel):
    field: str
    message: str


class GoalValidationResponse(BaseModel):
    valid: bool
    total_weightage: float
    errors: list[ValidationErrorDetail]
