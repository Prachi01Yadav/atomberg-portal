from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.goal import Goal
from app.models.user import User
from app.services.blockchain_service import hash_goal_state, verify_goal_on_chain
from pydantic import BaseModel

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


class VerifyResponse(BaseModel):
    verified: bool
    tx_hash: str | None
    polygon_scan_url: str | None
    error: str | None = None


@router.get("/verify/{goal_id}", response_model=VerifyResponse)
async def verify_goal(
    goal_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VerifyResponse:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    expected = hash_goal_state(goal)
    result = await verify_goal_on_chain(goal.id, expected, goal.blockchain_tx_hash)
    if goal.blockchain_verified and result.get("verified"):
        goal.blockchain_verified = True
    await db.flush()

    return VerifyResponse(
        verified=result.get("verified", False),
        tx_hash=result.get("tx_hash") or goal.blockchain_tx_hash,
        polygon_scan_url=result.get("polygon_scan_url"),
        error=result.get("error"),
    )
