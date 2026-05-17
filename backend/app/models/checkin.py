import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Index, String, Text
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Quarter(str, enum.Enum):
    Q1 = "Q1"
    Q2 = "Q2"
    Q3 = "Q3"
    Q4 = "Q4"


class CheckinGoalStatus(str, enum.Enum):
    not_started = "not_started"
    on_track = "on_track"
    completed = "completed"


class QuarterlyCheckin(Base):
    __tablename__ = "quarterly_checkins"
    __table_args__ = (Index("ix_checkins_goal_quarter", "goal_id", "quarter"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("goals.id"), nullable=False)
    quarter: Mapped[Quarter] = mapped_column(Enum(Quarter, native_enum=False), nullable=False)
    actual_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    goal_status: Mapped[CheckinGoalStatus] = mapped_column(
        Enum(CheckinGoalStatus, native_enum=False), default=CheckinGoalStatus.not_started
    )
    employee_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    computed_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    goal: Mapped["Goal"] = relationship("Goal", back_populates="checkins")

