from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.cycle import PerformanceCycle
from app.models.user import User, UserRole
from app.schemas.cycle import CycleCreate, CycleResponse, CycleUpdate

router = APIRouter(prefix="/cycles", tags=["cycles"])


@router.get("/active", response_model=CycleResponse | None)
async def get_active_cycle(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> PerformanceCycle | None:
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.is_active.is_(True)))
    return result.scalar_one_or_none()


@router.get("", response_model=list[CycleResponse])
async def list_cycles(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
) -> list[PerformanceCycle]:
    result = await db.execute(select(PerformanceCycle).order_by(PerformanceCycle.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{cycle_id}", response_model=CycleResponse)
async def get_cycle(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> PerformanceCycle:
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    return cycle


@router.post("", response_model=CycleResponse, status_code=status.HTTP_201_CREATED)
async def create_cycle(
    body: CycleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
) -> PerformanceCycle:
    if body.is_active:
        active = await db.execute(select(PerformanceCycle).where(PerformanceCycle.is_active.is_(True)))
        for c in active.scalars().all():
            c.is_active = False
    cycle = PerformanceCycle(**body.model_dump())
    db.add(cycle)
    await db.flush()
    await db.refresh(cycle)
    return cycle


@router.patch("/{cycle_id}", response_model=CycleResponse)
async def update_cycle(
    cycle_id: UUID,
    body: CycleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
) -> PerformanceCycle:
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("is_active"):
        active = await db.execute(select(PerformanceCycle).where(PerformanceCycle.is_active.is_(True)))
        for c in active.scalars().all():
            if c.id != cycle.id:
                c.is_active = False
    for k, v in data.items():
        setattr(cycle, k, v)
    await db.flush()
    await db.refresh(cycle)
    return cycle


@router.post("/{cycle_id}/activate", response_model=CycleResponse)
async def activate_cycle(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
) -> PerformanceCycle:
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    active = await db.execute(select(PerformanceCycle).where(PerformanceCycle.is_active.is_(True)))
    for c in active.scalars().all():
        c.is_active = False
    cycle.is_active = True
    await db.flush()
    await db.refresh(cycle)
    return cycle
