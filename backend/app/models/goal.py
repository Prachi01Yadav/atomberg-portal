import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Index, String, Text
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UoMType(str, enum.Enum):
    numeric_min = "numeric_min"
    numeric_max = "numeric_max"
    timeline = "timeline"
    zero = "zero"


class GoalStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    returned = "returned"
    locked = "locked"


class Goal(Base):
    __tablename__ = "goals"
    __table_args__ = (Index("ix_goals_employee_cycle", "employee_id", "cycle_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("performance_cycles.id"), nullable=False
    )
    thrust_area: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    uom_type: Mapped[UoMType] = mapped_column(Enum(UoMType, native_enum=False), nullable=False)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    weightage: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[GoalStatus] = mapped_column(Enum(GoalStatus, native_enum=False), default=GoalStatus.draft)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    shared_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    primary_shared_goal_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("goals.id"), nullable=True
    )
    blockchain_tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    blockchain_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_return_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee: Mapped["User"] = relationship("User", back_populates="goals", foreign_keys=[employee_id])
    cycle: Mapped["PerformanceCycle"] = relationship("PerformanceCycle", back_populates="goals")
    checkins: Mapped[list["QuarterlyCheckin"]] = relationship(
        "QuarterlyCheckin", back_populates="goal", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="goal")

