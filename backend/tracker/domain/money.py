"""Money is an integer number of cents everywhere except on screen.

This is the only module that turns time and salaries into money. Each formula
rounds down exactly once, at the end, so no fraction of a cent is ever carried.
"""

from domain.errors import ValidationError

HOURS_PER_YEAR = 2080  # 40 hours x 52 weeks


def cents(data: dict, key: str, required: bool = True) -> int | None:
    """An amount of money sent as a non-negative integer number of cents.

    Refuses 12.5 and "100": in an API that speaks cents, guessing what a
    fractional or quoted amount meant is a hundredfold error waiting to happen.
    """
    value = data.get(key)
    if value is None:
        if required:
            raise ValidationError(f"{key.replace('_', ' ').capitalize()} is required.", field=key)
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValidationError("Amounts are a whole, non-negative number of cents.", field=key)
    return value


def hourly_rate_cents(annual_salary_cents: int) -> int:
    """Hourly cost of a person: annual salary / 2080, rounded down."""
    return annual_salary_cents // HOURS_PER_YEAR


def cost_cents(minutes: int, hourly_rate_cents: int) -> int:
    """Cost of logged time."""
    return minutes * hourly_rate_cents // 60


def planned_cost_cents(hours_per_week: int, days: int, hourly_rate_cents: int) -> int:
    """Planned cost of a booking: hours per week prorated by days, times the rate."""
    return hours_per_week * days * hourly_rate_cents // 7
