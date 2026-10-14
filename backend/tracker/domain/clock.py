"""Whose "today". Lambda and Aurora run in UTC; ACME's day is Eastern time.

Services call clock.today() through the module, so tests can replace it.
"""

import datetime as dt
from zoneinfo import ZoneInfo

ZONE = ZoneInfo("America/New_York")


def now() -> dt.datetime:
    """The current moment, timezone-aware."""
    return dt.datetime.now(dt.timezone.utc)


def today(now: dt.datetime | None = None) -> dt.date:
    """The calendar date in New York."""
    return (now or globals()["now"]()).astimezone(ZONE).date()


def week_start(day: dt.date) -> dt.date:
    """The Monday of the week containing `day`."""
    return day - dt.timedelta(days=day.weekday())
