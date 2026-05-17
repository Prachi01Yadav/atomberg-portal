import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EscalationRuleType(str, enum.Enum):
    goal_not_submitted = "goal_not_submitted"
    goal_not_approved = "goal_not_approved"
    checkin_not_done = "checkin_not_done"


class NotificationTarget(str, enum.Enum):
    employee = "employee"
    manager = "manager"
    hr = "hr"


class EscalationRule(Base):
    __tablename__ = "escalation_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_type: Mapped[EscalationRuleType] = mapped_column(Enum(EscalationRuleType, native_enum=False), nullable=False)
    threshold_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    notification_target: Mapped[NotificationTarget] = mapped_column(
        Enum(NotificationTarget, native_enum=False), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class EscalationLog(Base):
    __tablename__ = "escalation_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("escalation_rules.id"))
    target_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

