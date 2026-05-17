from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.checkin import CheckinGoalStatus, Quarter


class CheckinCreate(BaseModel):
    quarter: Quarter
    actual_value: float | None = None
    completion_date: date | None = None
    goal_status: CheckinGoalStatus = CheckinGoalStatus.on_track
    employee_notes: str | None = None


class CheckinUpdate(BaseModel):
    actual_value: float | None = None
    completion_date: date | None = None
    goal_status: CheckinGoalStatus | None = None
    employee_notes: str | None = None


class ManagerCheckinComment(BaseModel):
    manager_comment: str = Field(min_length=1)


class CheckinResponse(BaseModel):
    id: UUID
    goal_id: UUID
    quarter: Quarter
    actual_value: float | None
    completion_date: date | None
    goal_status: CheckinGoalStatus
    employee_notes: str | None
    manager_comment: str | None
    computed_score: float | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuarterWindowStatus(BaseModel):
    quarter: Quarter | None
    is_open: bool
    message: str
    days_until_open: int | None = None
