"""Bookings ("Resources" on screen): a person on a project for N hours a week.

Bookings are the plan. They drive the allocation grid (question 3), the
over-allocation flags (question 5) and planned cost (question 7). Only
employees are booked. A booking may push someone past their weekly capacity:
that is allowed and flagged, because a manager needs to see it to fix it.
"""

import datetime as dt

import psycopg

from domain import values
from domain.errors import Conflict, NotFound, ValidationError
from services import audit
from services.access import managed_project, visible_project
from services.actors import EMPLOYEE, Actor
from services.views import booking_view
from store.postgres import atomic, update

_FIELDS = {"user_id", "hours_per_week", "start_date", "end_date"}
NOT_FOUND = "Booking not found."


def _clean(data: dict) -> dict:
    clean = {}
    if "user_id" in data:
        clean["user_id"] = values.integer(data, "user_id")
    if "hours_per_week" in data:
        clean["hours_per_week"] = values.integer(data, "hours_per_week", minimum=1, maximum=40)
    if "start_date" in data:
        clean["start_date"] = values.date(data, "start_date")
    if "end_date" in data:
        clean["end_date"] = values.date(data, "end_date")
    return clean


def _check_dates(merged: dict) -> None:
    if merged["end_date"] < merged["start_date"]:
        raise ValidationError("End date can't be before start date.", field="end_date")


def _person_name(conn: psycopg.Connection, user_id: int) -> str:
    row = conn.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (user_id,)).fetchone()
    return f"{row['first_name']} {row['last_name']}"


def create_booking(conn: psycopg.Connection, actor: Actor, project_id: int, data: dict) -> dict:
    """Book an employee on a project. The project's manager or an admin."""
    values.only_allowed(data, _FIELDS)
    for required in _FIELDS:
        if required not in data:
            raise ValidationError(f"{required.replace('_', ' ').capitalize()} is required.", field=required)
    clean = _clean(data)
    _check_dates(clean)
    with atomic(conn):
        project = managed_project(conn, actor, project_id)
        person = conn.execute("SELECT role FROM users WHERE user_id = %s AND NOT is_archived",
                              (clean["user_id"],)).fetchone()
        if person is None or person["role"] != EMPLOYEE:
            raise ValidationError("Only active employees are booked on projects.", field="user_id")
        row = conn.execute(
            "INSERT INTO assignments (project_id, user_id, hours_per_week, start_date, end_date)"
            " VALUES (%(project_id)s, %(user_id)s, %(hours_per_week)s, %(start_date)s, %(end_date)s) RETURNING *",
            {**clean, "project_id": project_id}).fetchone()
        audit.record_change(conn, actor, "CREATE", "assignments", row["assignment_id"], None, booking_view(row),
                            f"{actor.name} booked {_person_name(conn, row['user_id'])} on {project['name']}"
                            f" for {row['hours_per_week']} h/week")
    return row


def list_bookings(conn: psycopg.Connection, actor: Actor, project_id: int) -> list[dict]:
    """A project's live bookings, with each person's name."""
    visible_project(conn, actor, project_id)
    return conn.execute(
        "SELECT a.*, u.first_name || ' ' || u.last_name AS person_name FROM assignments a"
        " JOIN users u ON u.user_id = a.user_id WHERE a.project_id = %s AND NOT a.is_archived"
        " ORDER BY a.start_date, a.assignment_id", (project_id,)).fetchall()


def _booking_to_manage(conn: psycopg.Connection, actor: Actor, booking_id: int) -> tuple[dict, dict]:
    row = conn.execute("SELECT * FROM assignments WHERE assignment_id = %s FOR UPDATE", (booking_id,)).fetchone()
    if row is None:
        raise NotFound(NOT_FOUND)
    try:
        project = managed_project(conn, actor, row["project_id"])
    except NotFound:
        raise NotFound(NOT_FOUND) from None
    return row, project


def update_booking(conn: psycopg.Connection, actor: Actor, booking_id: int, data: dict) -> dict:
    """Change hours or dates. Refused if it would leave logged time outside the booking."""
    values.only_allowed(data, _FIELDS - {"user_id"})
    clean = _clean(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before, project = _booking_to_manage(conn, actor, booking_id)
        if before["is_archived"]:
            raise Conflict("This booking is archived.")
        merged = {**before, **clean}
        _check_dates(merged)
        stranded = conn.execute(
            "SELECT count(*) AS n FROM time_entries WHERE user_id = %s AND project_id = %s"
            " AND status <> 'REJECTED' AND work_date BETWEEN %s AND %s"
            " AND work_date NOT BETWEEN %s AND %s"
            " AND NOT EXISTS (SELECT 1 FROM assignments o WHERE o.user_id = time_entries.user_id"
            "   AND o.project_id = time_entries.project_id AND o.assignment_id <> %s"
            "   AND time_entries.work_date BETWEEN o.start_date AND o.end_date)",
            (before["user_id"], before["project_id"], before["start_date"], before["end_date"],
             merged["start_date"], merged["end_date"], booking_id)).fetchone()["n"]
        if stranded:
            raise Conflict(f"{stranded} time entr{'y' if stranded == 1 else 'ies'} would fall outside the booking.")
        row = update(conn, "assignments", "assignment_id", booking_id, clean)
        audit.record_change(conn, actor, "UPDATE", "assignments", booking_id, booking_view(before), booking_view(row),
                            f"{actor.name} changed {_person_name(conn, row['user_id'])}'s booking on {project['name']}")
    return row


def archive_booking(conn: psycopg.Connection, actor: Actor, booking_id: int) -> dict:
    """Take someone off a project. Their logged time stays on record."""
    with atomic(conn):
        before, project = _booking_to_manage(conn, actor, booking_id)
        if before["is_archived"]:
            raise Conflict("This booking is already archived.")
        row = conn.execute("UPDATE assignments SET is_archived = TRUE, archived_at = %s, archived_by = %s,"
                           " updated_at = now() WHERE assignment_id = %s RETURNING *",
                           (dt.datetime.now(dt.timezone.utc), actor.user_id, booking_id)).fetchone()
        audit.record_change(conn, actor, "ARCHIVE", "assignments", booking_id, booking_view(before), booking_view(row),
                            f"{actor.name} took {_person_name(conn, row['user_id'])} off {project['name']}")
    return row
