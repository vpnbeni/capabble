from __future__ import annotations

from dataclasses import dataclass


@dataclass
class EnrollmentTrendMetrics:
    starting_enrollment: int | None
    latest_enrollment: int | None
    absolute_change: int | None
    percentage_change: float | None
    consecutive_declines: int
    years: list[str]
    totals: list[int | None]


def compute_enrollment_trends(
    series: list[tuple[str, int | None]],
) -> EnrollmentTrendMetrics:
    """Compute derived enrollment metrics from ordered (year, total) pairs."""
    years = [y for y, _ in series]
    totals = [t for _, t in series]
    valid = [(y, t) for y, t in series if t is not None]

    start_val = totals[0] if totals else None
    end_val = totals[-1] if totals else None

    if len(valid) < 1:
        return EnrollmentTrendMetrics(None, end_val, None, None, 0, years, totals)

    first_valid = valid[0][1]
    last_valid = valid[-1][1]
    abs_change = end_val - start_val if start_val is not None and end_val is not None else None
    pct_change = None
    if first_valid and first_valid != 0 and len(valid) >= 2:
        pct_change = round(((last_valid - first_valid) / first_valid) * 100, 1)

    trailing = 0
    for i in range(len(valid) - 1, 0, -1):
        prev, curr = valid[i - 1][1], valid[i][1]
        if prev is not None and curr is not None and curr < prev:
            trailing += 1
        else:
            break

    return EnrollmentTrendMetrics(
        starting_enrollment=start_val,
        latest_enrollment=end_val,
        absolute_change=abs_change,
        percentage_change=pct_change,
        consecutive_declines=trailing,
        years=years,
        totals=totals,
    )


def students_per_teacher(students: int | None, teachers: int | None) -> float | None:
    if students is None or teachers is None or teachers == 0:
        return None
    return round(students / teachers, 2)
