import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import publish_event
from app.core.websocket_manager import ws_manager
from app.models.goal import Goal
from app.models.user import User
from app.services import notification_service

logger = logging.getLogger(__name__)


async def _dispatch(user_id: UUID, message: dict[str, Any]) -> None:
    uid = str(user_id)
    await ws_manager.send_to_user(uid, message)
    await publish_event(f"ws:user:{uid}", message)


async def notify_goal_submitted(goal: Goal, employee: User, db: AsyncSession | None = None) -> None:
    payload = {
        "type": "goal_submitted",
        "goal_id": str(goal.id),
        "employee_id": str(employee.id),
        "employee_name": employee.full_name,
        "title": goal.title,
        "cycle_id": str(goal.cycle_id),
    }
    if employee.manager_id:
        await _dispatch(employee.manager_id, payload)

        if db is not None:
            manager = await db.get(User, employee.manager_id)
            if manager:
                await notification_service.notify_goal_submitted_email(
                    employee.full_name,
                    manager.email,
                    goal.title,
                    employee_id=str(employee.id),
                    goal_id=str(goal.id),
                )
    logger.info("goal_submitted employee=%s goal=%s", employee.id, goal.id)


async def notify_goal_approved(goal: Goal, employee: User, manager: User) -> None:
    await _dispatch(
        employee.id,
        {
            "type": "goal_approved",
            "goal_id": str(goal.id),
            "title": goal.title,
            "manager_name": manager.full_name,
            "blockchain_tx_hash": goal.blockchain_tx_hash,
        },
    )
    await notification_service.notify_goal_approved_email(
        employee.email, goal.title, manager.full_name, goal_id=str(goal.id)
    )


async def notify_goal_returned(goal: Goal, employee: User, manager: User, comment: str) -> None:
    await _dispatch(
        employee.id,
        {
            "type": "goal_returned",
            "goal_id": str(goal.id),
            "title": goal.title,
            "manager_name": manager.full_name,
            "comment": comment,
        },
    )
    await notification_service.notify_goal_returned_email(
        employee.email, goal.title, comment, goal_id=str(goal.id)
    )


async def notify_goals_bulk_approved(
    employee: User, manager: User, count: int, cycle_id: UUID
) -> None:
    await _dispatch(
        employee.id,
        {
            "type": "goals_bulk_approved",
            "count": count,
            "manager_name": manager.full_name,
            "cycle_id": str(cycle_id),
        },
    )


async def notify_checkin_logged(goal: Goal, employee: User, quarter: str) -> None:
    if not employee.manager_id:
        return
    await _dispatch(
        employee.manager_id,
        {
            "type": "checkin_logged",
            "goal_id": str(goal.id),
            "employee_id": str(employee.id),
            "employee_name": employee.full_name,
            "title": goal.title,
            "quarter": quarter,
        },
    )


async def notify_escalation_triggered(admin_id: UUID, message: str, rule_type: str) -> None:
    await _dispatch(
        admin_id,
        {"type": "escalation_triggered", "message": message, "rule_type": rule_type},
    )
