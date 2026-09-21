from school_intel.services.profile_metrics import compute_enrollment_trends, students_per_teacher


def test_enrollment_decline_himalyan_series() -> None:
    series = [
        ("2019-20", 444),
        ("2020-21", 413),
        ("2021-22", 395),
        ("2022-23", 316),
        ("2023-24", 286),
        ("2024-25", 240),
        ("2025-26", 222),
    ]
    trend = compute_enrollment_trends(series)
    assert trend.starting_enrollment == 444
    assert trend.latest_enrollment == 222
    assert trend.absolute_change == -222
    assert trend.percentage_change == -50.0
    assert trend.consecutive_declines == 6


def test_teacher_student_ratio() -> None:
    assert students_per_teacher(222, 13) == 17.08
    assert students_per_teacher(444, 11) == 40.36
    assert students_per_teacher(None, 13) is None
    assert students_per_teacher(100, 0) is None


def test_null_enrollment_preserved_in_trend() -> None:
    series = [("2019-20", None), ("2020-21", 100)]
    trend = compute_enrollment_trends(series)
    assert trend.starting_enrollment is None
    assert trend.latest_enrollment == 100
