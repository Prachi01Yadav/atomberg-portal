from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User, UserRole
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/achievement")
async def achievement_export(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin, UserRole.manager))],
    department: str | None = None,
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
):
    rows = await report_service.build_achievement_rows(db, cycle_id, department)
    if format == "xlsx":
        content = report_service.to_xlsx(rows)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=achievement.xlsx"},
        )
    return Response(
        content=report_service.to_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=achievement.csv"},
    )


@router.get("/completion-dashboard")
async def completion_dashboard(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    return await report_service.completion_dashboard(db, cycle_id)


@router.get("/employee-checkin-matrix")
async def employee_checkin_matrix(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin, UserRole.manager))],
):
    return await report_service.employee_checkin_matrix(db, cycle_id)
