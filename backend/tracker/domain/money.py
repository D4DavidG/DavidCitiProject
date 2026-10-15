"""Money is integer cents everywhere except on screen. This module does all the money maths.

Each formula multiplies first and rounds down once at the end, so no fraction of a cent is carried.
"""

from domain.errors import ValidationError

HOURS_PER_YEAR = 2080


def cents(data: dict, key: str, required: bool = True) -> int | None:
    """Read a non-negative whole number of cents from the request body.

    Refuses 12.5 and "100": guessing whether they meant dollars is a hundredfold error.
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
    """Hourly cost of a person: annual salary / 2080 (40 h x 52 weeks), rounded down."""
    return annual_salary_cents // HOURS_PER_YEAR


def cost_cents(minutes: int, hourly_rate_cents: int) -> int:
    """Cost of logged minutes at an hourly rate."""
    return minutes * hourly_rate_cents // 60


def planned_cost_cents(hours_per_week: int, days: int, hourly_rate_cents: int) -> int:
    """Planned cost of a booking: hours a week, prorated by days out of 7, times the rate."""
    return hours_per_week * days * hourly_rate_cents // 7
