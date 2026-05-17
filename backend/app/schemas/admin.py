from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.goal import GoalResponse


class UnlockGoalRequest(BaseModel):
    reason: str = Field(min_length=5)


class UnlockGoalResponse(BaseModel):
    goal: GoalResponse
    audit_log_id: UUID
    blockchain_tx_hash: str | None
