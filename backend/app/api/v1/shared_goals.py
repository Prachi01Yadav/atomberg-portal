from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.shared_goal import SharedGoalPush, SharedGoalPushResponse
from app.services.shared_goal_service import push_shared_goal

router = APIRouter(prefix="/shared-goals", tags=["shared-goals"])


@router.post("/push", response_model=SharedGoalPushResponse)
async def push_shared_goal_endpoint(
    body: SharedGoalPush,
    current_user: Annotated[User, Depends(require_roles(UserRole.admin, UserRole.manager))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SharedGoalPushResponse:
    primary, copies = await push_shared_goal(db, current_user, body)
    return SharedGoalPushResponse(primary_goal_id=primary.id, goals=[primary, *copies])
