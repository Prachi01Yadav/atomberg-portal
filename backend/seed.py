"""Seed demo data. Run: python -m seed (from backend/ with DATABASE_URL set)."""
import asyncio
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, Base, engine
import app.models  # noqa: F401
from app.core.security import get_password_hash
from app.models.checkin import CheckinGoalStatus, Quarter, QuarterlyCheckin
from app.models.cycle import PerformanceCycle
from app.models.escalation import (
    EscalationRule,
    EscalationRuleType,
    NotificationTarget,
)
from app.models.goal import Goal, GoalStatus, UoMType
from app.models.shared_goal import SharedGoalLink
from app.models.user import User, UserRole
from app.services.blockchain_service import hash_goal_state, publish_hash


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == "admin@demo.com"))
        if existing.scalar_one_or_none():
            print("Seed data already exists, skipping.")
            return

        admin = User(
            email="admin@demo.com",
            hashed_password=get_password_hash("Admin@123"),
            full_name="Demo Admin",
            role=UserRole.admin,
            department="HR",
        )
        m1 = User(
            email="manager1@demo.com",
            hashed_password=get_password_hash("Mgr@123"),
            full_name="Manager One",
            role=UserRole.manager,
            department="Operations",
        )
        m2 = User(
            email="manager2@demo.com",
            hashed_password=get_password_hash("Mgr@123"),
            full_name="Manager Two",
            role=UserRole.manager,
            department="Sales",
        )
        db.add_all([admin, m1, m2])
        await db.flush()

        employees = []
        for i, mgr in enumerate([m1, m1, m2, m2], start=1):
            emp = User(
                email=f"emp{i}@demo.com",
                hashed_password=get_password_hash("Emp@123"),
                full_name=f"Employee {i}",
                role=UserRole.employee,
                manager_id=mgr.id,
                department=mgr.department,
            )
            employees.append(emp)
            db.add(emp)
        await db.flush()

        cycle = PerformanceCycle(
            name="FY2025-26",
            goal_setting_open=date(2025, 5, 1),
            q1_open=date(2025, 7, 1),
            q2_open=date(2025, 10, 1),
            q3_open=date(2026, 1, 1),
            q4_open=date(2026, 4, 1),
            is_active=True,
        )
        db.add(cycle)
        await db.flush()

        emp1 = employees[0]
        goals_data = [
            ("Revenue", "Increase sales 15%", UoMType.numeric_min, 15.0, 30.0),
            ("Quality", "Reduce defects", UoMType.numeric_max, 2.0, 30.0),
            ("Delivery", "On-time delivery", UoMType.timeline, None, 30.0),
        ]
        created_goals: list[Goal] = []
        for thrust, title, uom, target, weight in goals_data:
            g = Goal(
                employee_id=emp1.id,
                cycle_id=cycle.id,
                thrust_area=thrust,
                title=title,
                description=f"Demo goal: {title}",
                uom_type=uom,
                target_value=target if uom != UoMType.timeline else None,
                target_date=date(2026, 3, 31) if uom == UoMType.timeline else None,
                weightage=weight,
                status=GoalStatus.locked,
                locked_at=datetime.now(timezone.utc),
                blockchain_verified=False,
            )
            db.add(g)
            created_goals.append(g)
        await db.flush()

        for g in created_goals:
            tx = await publish_hash(g.id, hash_goal_state(g))
            g.blockchain_tx_hash = tx
            g.blockchain_verified = True

        for g in created_goals[:2]:
            db.add(
                QuarterlyCheckin(
                    goal_id=g.id,
                    quarter=Quarter.Q1,
                    actual_value=10.0 if g.uom_type == UoMType.numeric_min else 1.5,
                    goal_status=CheckinGoalStatus.on_track,
                    computed_score=0.67,
                    employee_notes="Q1 progress on track",
                )
            )

        shared_primary = Goal(
            employee_id=emp1.id,
            cycle_id=cycle.id,
            thrust_area="Customer",
            title="Improve NPS score",
            description="Shared customer goal — primary owner",
            uom_type=UoMType.numeric_min,
            target_value=70.0,
            weightage=10.0,
            status=GoalStatus.locked,
            is_shared=False,
            locked_at=datetime.now(timezone.utc),
            blockchain_verified=False,
        )
        db.add(shared_primary)
        await db.flush()
        tx = await publish_hash(shared_primary.id, hash_goal_state(shared_primary))
        shared_primary.blockchain_tx_hash = tx
        shared_primary.blockchain_verified = True

        emp2_copy = Goal(
            employee_id=employees[1].id,
            cycle_id=cycle.id,
            thrust_area=shared_primary.thrust_area,
            title=shared_primary.title,
            description=shared_primary.description,
            uom_type=shared_primary.uom_type,
            target_value=shared_primary.target_value,
            weightage=15.0,
            status=GoalStatus.draft,
            is_shared=True,
            shared_by=admin.id,
            primary_shared_goal_id=shared_primary.id,
        )
        db.add(emp2_copy)
        await db.flush()
        db.add(SharedGoalLink(primary_goal_id=shared_primary.id, recipient_goal_id=emp2_copy.id))

        # Default escalation rules
        db.add_all([
            EscalationRule(
                rule_type=EscalationRuleType.goal_not_submitted,
                threshold_days=7,
                notification_target=NotificationTarget.employee,
                is_active=True,
            ),
            EscalationRule(
                rule_type=EscalationRuleType.goal_not_submitted,
                threshold_days=10,
                notification_target=NotificationTarget.manager,
                is_active=True,
            ),
            EscalationRule(
                rule_type=EscalationRuleType.goal_not_approved,
                threshold_days=5,
                notification_target=NotificationTarget.manager,
                is_active=True,
            ),
            EscalationRule(
                rule_type=EscalationRuleType.goal_not_approved,
                threshold_days=10,
                notification_target=NotificationTarget.hr,
                is_active=True,
            ),
            EscalationRule(
                rule_type=EscalationRuleType.checkin_not_done,
                threshold_days=14,
                notification_target=NotificationTarget.employee,
                is_active=True,
            ),
            EscalationRule(
                rule_type=EscalationRuleType.checkin_not_done,
                threshold_days=21,
                notification_target=NotificationTarget.manager,
                is_active=True,
            ),
        ])

        await db.commit()
        print("Seed completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
