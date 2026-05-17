from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.escalation import EscalationRuleType, NotificationTarget


class EscalationRuleCreate(BaseModel):
    rule_type: EscalationRuleType
    threshold_days: int = Field(ge=1, le=365)
    notification_target: NotificationTarget
    is_active: bool = True


class EscalationRuleResponse(EscalationRuleCreate):
    id: UUID

    model_config = {"from_attributes": True}


class EscalationLogResponse(BaseModel):
    id: UUID
    rule_id: UUID
    target_user_id: UUID
    target_user_name: str | None = None
    message: str | None
    sent_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}
