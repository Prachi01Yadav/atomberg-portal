import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, String
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PerformanceCycle(Base):
    __tablename__ = "performance_cycles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    goal_setting_open: Mapped[date] = mapped_column(Date, nullable=False)
    q1_open: Mapped[date] = mapped_column(Date, nullable=False)
    q2_open: Mapped[date] = mapped_column(Date, nullable=False)
    q3_open: Mapped[date] = mapped_column(Date, nullable=False)
    q4_open: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    goals: Mapped[list["Goal"]] = relationship("Goal", back_populates="cycle")

