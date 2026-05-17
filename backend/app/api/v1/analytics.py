from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.checkin import Quarter, QuarterlyCheckin
from app.models.goal import Goal
from app.models.user import User, UserRole
from app.services.goal_service import cap_score_for_display
from app.services import report_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/completion-heatmap")
async def completion_heatmap(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin, UserRole.manager))],
):
    return await report_service.completion_heatmap(db, cycle_id)


@router.get("/qoq-trends")
async def qoq_trends(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    employee_id: UUID | None = None,
    department: str | None = None,
):
    q = select(Goal).join(User, Goal.employee_id == User.id)
    if employee_id:
        q = q.where(Goal.employee_id == employee_id)
    if department:
        q = q.where(User.department == department)
    if current_user.role == UserRole.employee:
        q = q.where(Goal.employee_id == current_user.id)

    goals = list((await db.execute(q)).scalars().all())
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    scores = {k: [] for k in quarters}

    for goal in goals:
        for qtr in Quarter:
            checkin = await db.execute(
                select(QuarterlyCheckin).where(
                    QuarterlyCheckin.goal_id == goal.id, QuarterlyCheckin.quarter == qtr
                )
            )
            c = checkin.scalar_one_or_none()
            if c and c.computed_score is not None:
                scores[qtr.value].append(goal.weightage * cap_score_for_display(c.computed_score) / 100)

    weighted = [round(sum(scores[q]) / len(scores[q]), 2) if scores[q] else 0 for q in quarters]
    return {"quarters": quarters, "weighted_scores": weighted}


@router.get("/manager-effectiveness")
async def manager_effectiveness(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin))],
):
    """Per-manager comparison metrics for the active cycle.

    Returns one row per manager with:
      - team_size
      - approval_rate_pct  (locked / submitted+locked across direct reports)
      - per-quarter checkin_completion_pct (across all locked goals of the team)
      - overall_checkin_pct
      - avg_approval_lag_days (now - submitted_at for still-pending; 0 if all locked)
    """
    managers = list(
        (await db.execute(select(User).where(User.role == UserRole.manager))).scalars().all()
    )

    rows: list[dict] = []
    for mgr in managers:
        team_ids = list(
            (await db.execute(select(User.id).where(User.manager_id == mgr.id))).scalars().all()
        )
        team_size = len(team_ids)
        if team_size == 0:
            continue

        goals = list(
            (
                await db.execute(
                    select(Goal).where(
                        Goal.cycle_id == cycle_id, Goal.employee_id.in_(team_ids)
                    )
                )
            )
            .scalars()
            .all()
        )
        submitted_or_locked = [g for g in goals if g.status.value in ("submitted", "locked")]
        locked = [g for g in goals if g.status.value == "locked"]
        approval_rate = (
            round(len(locked) / len(submitted_or_locked) * 100, 1) if submitted_or_locked else 0.0
        )

        per_quarter: dict[str, float] = {}
        total_done = 0
        total_expected = 0
        for qtr in Quarter:
            done = 0
            for g in locked:
                ck = (
                    await db.execute(
                        select(QuarterlyCheckin).where(
                            QuarterlyCheckin.goal_id == g.id,
                            QuarterlyCheckin.quarter == qtr,
                        )
                    )
                ).scalar_one_or_none()
                if ck is not None:
                    done += 1
            expected = len(locked)
            per_quarter[qtr.value] = (
                round(done / expected * 100, 1) if expected else 0.0
            )
            total_done += done
            total_expected += expected
        overall_pct = (
            round(total_done / total_expected * 100, 1) if total_expected else 0.0
        )

        rows.append(
            {
                "manager_id": str(mgr.id),
                "manager_name": mgr.full_name,
                "department": mgr.department,
                "team_size": team_size,
                "goals_total": len(goals),
                "goals_locked": len(locked),
                "approval_rate_pct": approval_rate,
                "checkin_pct_by_quarter": per_quarter,
                "checkin_pct_overall": overall_pct,
            }
        )

    rows.sort(key=lambda r: r["checkin_pct_overall"], reverse=True)
    return {
        "quarters": [q.value for q in Quarter],
        "managers": rows,
    }


@router.get("/goal-distribution")
async def goal_distribution(
    cycle_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.admin, UserRole.manager))],
):
    thrust = await db.execute(
        select(Goal.thrust_area, func.count(Goal.id))
        .where(Goal.cycle_id == cycle_id)
        .group_by(Goal.thrust_area)
    )
    uom = await db.execute(
        select(Goal.uom_type, func.count(Goal.id)).where(Goal.cycle_id == cycle_id).group_by(Goal.uom_type)
    )
    status = await db.execute(
        select(Goal.status, func.count(Goal.id)).where(Goal.cycle_id == cycle_id).group_by(Goal.status)
    )
    return {
        "thrust_area": {r[0]: r[1] for r in thrust.all()},
        "uom_type": {r[0].value: r[1] for r in uom.all()},
        "status": {r[0].value: r[1] for r in status.all()},
    }
