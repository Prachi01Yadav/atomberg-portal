from datetime import date, datetime, timedelta, timezone

from app.models.checkin import Quarter
from app.models.cycle import PerformanceCycle


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def get_quarter_windows(cycle: PerformanceCycle) -> dict[Quarter, tuple[date, date]]:
    """Each quarter window is [start, end) in UTC."""
    return {
        Quarter.Q1: (cycle.q1_open, cycle.q2_open - timedelta(days=1)),
        Quarter.Q2: (cycle.q2_open, cycle.q3_open - timedelta(days=1)),
        Quarter.Q3: (cycle.q3_open, cycle.q4_open - timedelta(days=1)),
        Quarter.Q4: (cycle.q4_open, cycle.q4_open + timedelta(days=89)),
    }


def get_active_quarter(cycle: PerformanceCycle, as_of: date | None = None) -> Quarter | None:
    as_of = as_of or _utc_today()
    for quarter, (start, end) in get_quarter_windows(cycle).items():
        if start <= as_of <= end:
            return quarter
    return None


def get_quarter_window_status(
    cycle: PerformanceCycle, quarter: Quarter, force_open: bool = False
) -> tuple[bool, str, int | None]:
    if force_open:
        return True, f"{quarter.value} window force-opened by admin", None

    as_of = _utc_today()
    start, end = get_quarter_windows(cycle)[quarter]
    if start <= as_of <= end:
        return True, f"{quarter.value} check-in window is open", None
    if as_of < start:
        days = (start - as_of).days
        return False, f"Window closed — opens in {days} days", days
    return False, f"{quarter.value} window has closed", None
