"""Pure domain helpers: input validation, money, the clock. No database."""

import datetime as dt

import pytest

from domain import clock, money, values
from domain.errors import ValidationError


# --- values ---------------------------------------------------------------

def test_text_trims_and_returns_the_value():
    assert values.text({"name": "  Apollo "}, "name") == "Apollo"


def test_required_text_missing_names_the_field():
    with pytest.raises(ValidationError) as caught:
        values.text({}, "name")
    assert caught.value.field == "name"


def test_blank_required_text_is_refused():
    with pytest.raises(ValidationError):
        values.text({"name": "   "}, "name")


def test_optional_text_may_be_absent_or_null():
    assert values.text({}, "description", required=False) is None
    assert values.text({"description": None}, "description", required=False) is None


def test_text_longer_than_the_limit_is_refused():
    with pytest.raises(ValidationError, match="200"):
        values.text({"name": "x" * 201}, "name", max_length=200)


def test_text_must_be_a_string():
    with pytest.raises(ValidationError):
        values.text({"name": 5}, "name")


def test_search_box_reads_q_or_the_older_search_as_a_pattern():
    assert values.search({"q": " Ali "}) == "%Ali%"
    assert values.search({"search": "Ali"}) == "%Ali%"
    assert values.search({"q": "new", "search": "old"}) == "%new%"
    assert values.search({}) is None
    assert values.search({"q": "   "}) is None  # a blank box is no search, not a search for spaces


def test_search_longer_than_100_characters_is_refused_naming_q():
    with pytest.raises(ValidationError) as refused:
        values.search({"q": "x" * 101})
    assert refused.value.field == "q"


def test_date_parses_iso_format():
    assert values.date({"start_date": "2026-10-13"}, "start_date") == dt.date(2026, 10, 13)


@pytest.mark.parametrize("raw", ["13/10/2026", "2026-13-01", 20261013, ""])
def test_bad_dates_are_refused(raw):
    with pytest.raises(ValidationError):
        values.date({"start_date": raw}, "start_date")


def test_integer_refuses_floats_strings_and_booleans():
    for raw in (1.5, "3", True):
        with pytest.raises(ValidationError):
            values.integer({"n": raw}, "n")


def test_integer_enforces_bounds():
    with pytest.raises(ValidationError, match="between 1 and 40"):
        values.integer({"n": 41}, "n", minimum=1, maximum=40)


def test_boolean_must_be_a_real_boolean():
    assert values.boolean({"b": False}, "b") is False
    with pytest.raises(ValidationError):
        values.boolean({"b": "false"}, "b")


def test_choice_must_be_one_of_the_options():
    assert values.choice({"s": "ACTIVE"}, "s", {"ACTIVE", "PLANNING"}) == "ACTIVE"
    with pytest.raises(ValidationError):
        values.choice({"s": "active"}, "s", {"ACTIVE", "PLANNING"})


def test_only_allowed_fields_names_the_first_extra_one():
    with pytest.raises(ValidationError) as caught:
        values.only_allowed({"first_name": "A", "username": "X"}, {"first_name"})
    assert caught.value.field == "username"


def test_require_names_the_first_missing_field():
    with pytest.raises(ValidationError) as caught:
        values.require({"name": "x"}, ("name", "start_date", "due_date"))
    assert (str(caught.value), caught.value.field) == ("Start date is required.", "start_date")


def test_require_passes_when_every_key_is_there():
    assert values.require({"a": 1, "b": None}, ("a", "b")) is None  # presence only


# --- money ----------------------------------------------------------------

def test_cents_accepts_a_non_negative_integer():
    assert money.cents({"budget_cents": 123456}, "budget_cents") == 123456


@pytest.mark.parametrize("raw", [12.5, "100", -1, True, None])
def test_cents_refuses_anything_but_a_non_negative_integer(raw):
    with pytest.raises(ValidationError):
        money.cents({"budget_cents": raw}, "budget_cents")


def test_hourly_rate_is_salary_over_2080_rounded_down():
    assert money.hourly_rate_cents(10_000_000) == 4807  # $100,000 a year -> $48.07 an hour


def test_cost_of_minutes_rounds_down_once():
    assert money.cost_cents(minutes=90, hourly_rate_cents=4807) == 7210  # 1.5 h x $48.07 = $72.105


def test_planned_cost_of_a_booking_prorates_by_days():
    # 20 h/week for 14 days at $48.07/h = 40 h = $1,922.80
    assert money.planned_cost_cents(hours_per_week=20, days=14, hourly_rate_cents=4807) == 192280


# --- clock ----------------------------------------------------------------

def test_today_is_eastern_time():
    late_utc = dt.datetime(2026, 10, 14, 2, 30, tzinfo=dt.timezone.utc)  # 22:30 on the 13th in New York
    assert clock.today(now=late_utc) == dt.date(2026, 10, 13)


def test_week_start_is_monday():
    assert clock.week_start(dt.date(2026, 10, 18)) == dt.date(2026, 10, 12)  # Sunday -> Monday
    assert clock.week_start(dt.date(2026, 10, 12)) == dt.date(2026, 10, 12)
