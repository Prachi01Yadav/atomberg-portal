from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class CycleBase(BaseModel):
    name: str
    goal_setting_open: date
    q1_open: date
    q2_open: date
    q3_open: date
    q4_open: date
    is_active: bool = False


class CycleCreate(CycleBase):
    pass


class CycleUpdate(BaseModel):
    name: str | None = None
    goal_setting_open: date | None = None
    q1_open: date | None = None
    q2_open: date | None = None
    q3_open: date | None = None
    q4_open: date | None = None
    is_active: bool | None = None


class CycleResponse(CycleBase):
    id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
