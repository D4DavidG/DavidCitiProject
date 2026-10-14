"""Time logged on tasks (Jira's "log work", OpenProject's time entries).

- Only a task's assignee logs time on it: a date, a number of minutes, a note.
- The date can't be in the future and must fall inside one of their bookings on
  that project. At most 24 hours per person per day.
- Capacity: logging that takes the person's Monday-to-Sunday week past their
  weekly capacity asks first (409, code OVER_CAPACITY) unless their manager
  allowed overtime. Resent with confirm_over_capacity, it is saved, marked
  over_capacity, and the notification says by how much. The user's row is
  locked first, so an unconfirmed entry can never slip past.
- The hourly rate is frozen on the entry when it's logged, so a later raise
  never rewrites past costs. Only approved time counts as consumed budget.
- The line manager or any admin approves or rejects. Nobody approves their own.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import clock, money, values
from domain.errors import Conflict, Forbidden, NotFound, OverCapacity, ValidationError
from services import audit
from services.access import visible_project
from services.actors import Actor
from services.paging import paginate
from services.views import entry_view
from store.postgres import atomic, insert, update

NOT_FOUND = "Time entry not found."
_FIELDS = {"work_date", "minutes", "note", "confirm_over_capacity"}


def hours_text(minutes: int) -> str:
    """'2 h', '1 h 30 min', '45 min'."""
    h, m = divmod(minutes, 60)
    return " ".join(part for part in (f"{h} h" if h else "", f"{m} min" if m else "") if part) or "0 min"


def _confirmed(data: dict) -> bool:
    """Did the person say "Log anyway"? Read it, then drop it: it is not a column."""
    return values.boolean(data, "confirm_over_capacity", required=False) or False


def _over_text(over: int) -> str:
    return f" ({hours_text(over)} over capacity)" if over else ""


def _clean(data: dict, partial: bool) -> dict:
    data = {k: v for k, v in data.items() if k != "confirm_over_capacity"}
    clean = {}
    if not partial or "work_date" in data:
        clean["work_date"] = values.date(data, "work_date")
        if clean["work_date"] > clock.today():
            raise ValidationError("You can't log time in the future.", field="work_date")
    if not partial or "minutes" in data:
        clean["minutes"] = values.integer(data, "minutes", minimum=1, maximum=1440)
    if "note" in data:
        clean["note"] = values.text(data, "note", required=False, max_length=1000)
    return clean


def _check_limits(conn: psycopg.Connection, user_id: int, project_id: int, work_date: dt.date,
                  minutes: int, ignore_entry: int | None, confirmed: bool) -> int:
    """Booked that day and at most 24 h that day (always refused). Past capacity without
    overtime asks first; once confirmed, returns the minutes past capacity (else 0)."""
    person = conn.execute("SELECT weekly_capacity_hours, overtime_allowed FROM users WHERE user_id = %s FOR UPDATE",
                          (user_id,)).fetchone()
    booked = conn.execute("SELECT 1 FROM assignments WHERE user_id = %s AND project_id = %s AND NOT is_archived"
                          " AND %s BETWEEN start_date AND end_date LIMIT 1", (user_id, project_id, work_date)).fetchone()
    if not booked:
        raise Conflict("You weren't booked on this project on that date.")
    other = {"me": user_id, "ignore": ignore_entry or 0}
    day = conn.execute("SELECT COALESCE(sum(minutes), 0) AS n FROM time_entries WHERE user_id = %(me)s"
                       " AND work_date = %(d)s AND status <> 'REJECTED' AND entry_id <> %(ignore)s",
                       {**other, "d": work_date}).fetchone()["n"]
    if day + minutes > 1440:
        raise Conflict(f"That would be more than 24 hours logged on {work_date.isoformat()}.")
    start = clock.week_start(work_date)
    week = conn.execute("SELECT COALESCE(sum(minutes), 0) AS n FROM time_entries WHERE user_id = %(me)s"
                        " AND work_date BETWEEN %(s)s AND %(e)s AND status <> 'REJECTED' AND entry_id <> %(ignore)s",
                        {**other, "s": start, "e": start + dt.timedelta(days=6)}).fetchone()["n"]
    capacity = person["weekly_capacity_hours"]
    over = week + minutes - capacity * 60
    if over <= 0 or person["overtime_allowed"]:
        return 0
    if not confirmed:
        raise OverCapacity(f"This puts you {hours_text(over)} over your {capacity} h week."
                           " Log anyway? Your manager will be told.")
    return over


def log_time(conn: psycopg.Connection, actor: Actor, task_id: int, data: dict) -> dict:
    values.only_allowed(data, _FIELDS)
    confirmed = _confirmed(data)
    clean = _clean(data, partial=False)
    with atomic(conn):
        task = conn.execute("SELECT * FROM tasks WHERE task_id = %s", (task_id,)).fetchone()
        if task is None:
            raise NotFound("Task not found.")
        try:
            visible_project(conn, actor, task["project_id"])
        except NotFound:
            raise NotFound("Task not found.") from None
        if task["assignee_user_id"] != actor.user_id:
            raise Forbidden("Only the task's assignee logs time on it.")
        if task["is_archived"]:
            raise Conflict("This task is archived.")
        over = _check_limits(conn, actor.user_id, task["project_id"], clean["work_date"], clean["minutes"], None,
                             confirmed)
        salary = conn.execute("SELECT annual_salary_cents FROM users WHERE user_id = %s",
                              (actor.user_id,)).fetchone()["annual_salary_cents"]
        clean.update(task_id=task_id, project_id=task["project_id"], user_id=actor.user_id,
                     hourly_rate_cents=money.hourly_rate_cents(salary), over_capacity=over > 0)
        row = insert(conn, "time_entries", clean)
        audit.record_change(conn, actor, "CREATE", "time_entries", row["entry_id"], None, entry_view(row),
                            f"{actor.name} logged {hours_text(row['minutes'])} for {row['work_date'].isoformat()}"
                            f" on task {task['title']}{_over_text(over)}")
    return row


def edit_entry(conn: psycopg.Connection, actor: Actor, entry_id: int, data: dict) -> dict:
    """Change your own entry. It goes back to pending approval. A change of hours or date, or any
    edit of a rejected entry, rechecks the limits and the over-capacity mark."""
    values.only_allowed(data, _FIELDS)
    confirmed = _confirmed(data)
    clean = _clean(data, partial=True)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before = conn.execute("SELECT * FROM time_entries WHERE entry_id = %s AND user_id = %s FOR UPDATE",
                              (entry_id, actor.user_id)).fetchone()
        if before is None:
            raise NotFound(NOT_FOUND)
        merged = {**before, **clean}
        over, mark = 0, before["over_capacity"]  # a note-only edit checks nothing and keeps its mark
        # A rejected entry isn't in the totals; going back to pending brings it in, so it is new work.
        rejoining = before["status"] == "REJECTED"
        if rejoining or "minutes" in clean or "work_date" in clean:
            less = (not rejoining and merged["work_date"] == before["work_date"]
                    and merged["minutes"] <= before["minutes"])
            # Logging less never asks, and never marks an entry that was inside capacity.
            over = _check_limits(conn, actor.user_id, before["project_id"], merged["work_date"], merged["minutes"],
                                 entry_id, confirmed or less)
            if less and not before["over_capacity"]:
                over = 0
            mark = over > 0
        # An edited entry goes back to pending: clear the old decision along with the change.
        row = update(conn, "time_entries", "entry_id", entry_id,
                     {**clean, "over_capacity": mark, "status": "PENDING", "decided_by": None, "decided_at": None})
        audit.record_change(conn, actor, "UPDATE", "time_entries", entry_id, entry_view(before), entry_view(row),
                            f"{actor.name} edited a time entry ({hours_text(row['minutes'])}"
                            f" on {row['work_date'].isoformat()}){_over_text(over)}")
    return row


def decide_entry(conn: psycopg.Connection, actor: Actor, entry_id: int, approve: bool) -> dict:
    """The entry author's line manager or any admin approves or rejects it."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins approve time.")
    with atomic(conn):
        before = conn.execute("SELECT e.*, u.manager_id, u.first_name || ' ' || u.last_name AS person_name"
                              " FROM time_entries e JOIN users u ON u.user_id = e.user_id"
                              " WHERE e.entry_id = %s FOR UPDATE OF e", (entry_id,)).fetchone()
        if before is None or not (actor.is_admin or before["manager_id"] == actor.user_id):
            raise NotFound(NOT_FOUND)
        status = "APPROVED" if approve else "REJECTED"
        row = conn.execute("UPDATE time_entries SET status = %s, decided_by = %s, decided_at = now(),"
                           " updated_at = now() WHERE entry_id = %s RETURNING *",
                           (status, actor.user_id, entry_id)).fetchone()
        # `before` carries the author's name for the summary; the snapshot is the entry alone.
        snapshot = {k: v for k, v in before.items() if k != "person_name"}
        audit.record_change(conn, actor, status[:-1] if approve else "REJECT", "time_entries", entry_id,
                            entry_view(snapshot), entry_view(row),
                            f"{actor.name} {status.lower()} {hours_text(row['minutes'])} logged by"
                            f" {before['person_name']} on {row['work_date'].isoformat()}")
    return row


_LISTED = ("SELECT e.*, t.title AS task_title, p.name AS project_name,"
           " u.first_name || ' ' || u.last_name AS person_name FROM time_entries e"
           " JOIN tasks t ON t.task_id = e.task_id JOIN projects p ON p.project_id = e.project_id"
           " JOIN users u ON u.user_id = e.user_id")


def my_entries(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """Your own entries, newest first, optionally between two dates."""
    where, params = ["e.user_id = %(me)s"], {"me": actor.user_id}
    if date_from := values.date(filters, "date_from", required=False):
        where.append("e.work_date >= %(from)s")
        params["from"] = date_from
    if date_to := values.date(filters, "date_to", required=False):
        where.append("e.work_date <= %(to)s")
        params["to"] = date_to
    query = sql.SQL("{} WHERE {}").format(sql.SQL(_LISTED), sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("e.work_date DESC, e.entry_id DESC"), page, page_size)


def pending_approvals(conn: psycopg.Connection, actor: Actor, page: int, page_size: int) -> dict:
    """Entries waiting for `actor`: their reports' (managers) or everyone's (admins)."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins approve time.")
    mine = "TRUE" if actor.is_admin else "u.manager_id = %(me)s"
    query = sql.SQL("{} WHERE e.status = 'PENDING' AND {}").format(sql.SQL(_LISTED), sql.SQL(mine))
    return paginate(conn, query, {"me": actor.user_id}, sql.SQL("e.work_date, e.entry_id"), page, page_size)
