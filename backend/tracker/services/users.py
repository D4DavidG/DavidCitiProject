"""Accounts: creation, login, passwords, self-service, admin edits, capacity, archive.

- Only admins create accounts. The server generates the username (initials plus
  six digits, never changed) and a 12-character password, shown once.
- Login is by username; every login failure gets the same 401.
- A user edits only their own name and email. Nobody edits a username or
  changes their own role or salary.
- Pay is at least $20 an hour on every new account and every pay change.
- Archiving someone still on live projects asks the admin to confirm first.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import clock, money, values
from domain.errors import AuthenticationError, Conflict, Forbidden, NotFound, OnProjects, ValidationError
from services import audit, passwords, sessions
from services.actors import ADMIN, EMPLOYEE, MANAGER, Actor
from services.paging import paginate
from services.views import user_view
from store.postgres import atomic, columns, insert, update

BAD_LOGIN = "Username or password is incorrect."
ROLES = {ADMIN, MANAGER, EMPLOYEE}
# Every column except password_hash, so a password hash can't leak by accident.
COLUMNS = columns(["user_id", "username", "first_name", "last_name", "email", "job_title", "role", "manager_id",
                   "annual_salary_cents", "weekly_capacity_hours", "overtime_allowed", "task_limit", "must_change_password",
                   "is_archived", "archived_at", "archived_by", "created_at", "updated_at"])
_PROFILE_FIELDS = {"first_name", "last_name", "email"}
_ADMIN_FIELDS = _PROFILE_FIELDS | {"job_title", "role", "manager_id", "annual_salary_cents",
                                   "weekly_capacity_hours", "overtime_allowed", "task_limit"}
_CAPACITY_FIELDS = {"weekly_capacity_hours", "overtime_allowed", "task_limit"}
MAX_SALARY_CENTS = 10**12


def _row(conn: psycopg.Connection, user_id: int) -> dict | None:
    return conn.execute(sql.SQL("SELECT {} FROM users WHERE user_id = %s").format(COLUMNS), (user_id,)).fetchone()


def _snapshot(row: dict) -> dict:
    return user_view(row, include_salary=True)  # the audit log is admin-only, and admins may see salary


def _name(row: dict) -> str:
    return f"{row['first_name']} {row['last_name']}"


def _validate_fields(data: dict) -> dict:
    """Validate whichever account fields are present; return them cleaned."""
    clean = {}
    if "first_name" in data:
        clean["first_name"] = values.text(data, "first_name", max_length=80)
    if "last_name" in data:
        clean["last_name"] = values.text(data, "last_name", max_length=80)
    if "email" in data:
        clean["email"] = values.text(data, "email", max_length=255)
    if "job_title" in data:
        clean["job_title"] = values.text(data, "job_title", required=False, max_length=120)
    if "role" in data:
        clean["role"] = values.choice(data, "role", ROLES)
    if "manager_id" in data:
        clean["manager_id"] = values.integer(data, "manager_id", required=False)
    if "annual_salary_cents" in data:
        clean["annual_salary_cents"] = _salary(data)
    if "weekly_capacity_hours" in data:
        clean["weekly_capacity_hours"] = values.integer(data, "weekly_capacity_hours", minimum=1, maximum=60)
    if "overtime_allowed" in data:
        clean["overtime_allowed"] = values.boolean(data, "overtime_allowed")
    if "task_limit" in data:
        clean["task_limit"] = values.integer(data, "task_limit", minimum=1, maximum=10)
    return clean


def _salary(data: dict) -> int:
    """Yearly pay in whole cents: required, and at least $20 an hour (money.MIN_ANNUAL_SALARY_CENTS).

    Checked whenever pay is given, so a salary set before the rule stays until it is changed.
    """
    salary = data.get("annual_salary_cents")
    if salary is None:
        raise ValidationError("Pay is required.", field="annual_salary_cents")
    if isinstance(salary, bool) or not isinstance(salary, int):
        raise ValidationError("Pay must be a whole number of cents.", field="annual_salary_cents")
    if salary < money.MIN_ANNUAL_SALARY_CENTS:
        raise ValidationError(money.PAY_TOO_LOW, field="annual_salary_cents")
    if salary > MAX_SALARY_CENTS:
        raise ValidationError("Pay must be at most $10,000,000,000 a year.", field="annual_salary_cents")
    return salary


def _check_line_manager(conn: psycopg.Connection, manager_id: int | None, user_id: int | None) -> None:
    """The line manager must be a live manager or admin, and the chain must not loop."""
    if manager_id is None:
        return
    boss = conn.execute("SELECT role FROM users WHERE user_id = %s AND NOT is_archived", (manager_id,)).fetchone()
    if boss is None or boss["role"] not in (MANAGER, ADMIN):
        raise ValidationError("The line manager must be an active manager or admin.", field="manager_id")
    if user_id is None:
        return
    loops = conn.execute(
        "WITH RECURSIVE chain(user_id) AS (SELECT %(start)s::bigint UNION"
        " SELECT u.manager_id FROM users u JOIN chain c ON u.user_id = c.user_id WHERE u.manager_id IS NOT NULL)"
        " SELECT 1 FROM chain WHERE user_id = %(me)s",
        {"start": manager_id, "me": user_id},
    ).fetchone()
    if loops:
        raise ValidationError("That would make the management chain loop.", field="manager_id")


def _update(conn: psycopg.Connection, user_id: int, changes: dict) -> dict:
    return update(conn, "users", "user_id", user_id, changes, returning=COLUMNS)


def _target(conn: psycopg.Connection, user_id: int) -> dict:
    row = _row(conn, user_id)
    if row is None:
        raise NotFound("User not found.")
    return row


# --- creation ---

def bootstrap_admin(conn: psycopg.Connection, password: str) -> None:
    """Create the first admin, AD000001, unless it exists.

    When BOOTSTRAP_ADMIN_PASSWORD is set, every cold start calls this inside the
    migration lock, so the existence check comes before the deliberately slow hash;
    otherwise simultaneous cold starts would queue behind each other's hash
    (~0.5 s each at 512 MB).
    """
    if conn.execute("SELECT 1 FROM users WHERE username = 'AD000001'").fetchone():
        return
    with atomic(conn):
        row = conn.execute(
            sql.SQL("INSERT INTO users (username, first_name, last_name, email, role, password_hash)"
                    " VALUES ('AD000001', 'System', 'Administrator', 'admin@acme.local', 'ADMIN', %s)"
                    " ON CONFLICT (username) DO NOTHING RETURNING {}").format(COLUMNS),
            (passwords.hash_password(password),),
        ).fetchone()
        if row:
            audit.record_change(conn, None, "CREATE", "users", row["user_id"], None, _snapshot(row),
                                "System created the bootstrap administrator")


def create_user(conn: psycopg.Connection, actor: Actor, data: dict) -> tuple[dict, str]:
    """Admin only. Returns the new user and their one-time generated password."""
    if not actor.is_admin:
        raise Forbidden("Only admins create accounts.")
    values.only_allowed(data, _ADMIN_FIELDS)
    for required in ("first_name", "last_name", "email", "role"):
        values.text(data, required)  # presence check; the error names the right field
    _salary(data)  # every new account is paid at least $20 an hour
    clean = _validate_fields(data)
    password = passwords.generate_password()
    with atomic(conn):
        _check_line_manager(conn, clean.get("manager_id"), None)
        for _ in range(50):
            username = passwords.generate_username(clean["first_name"], clean["last_name"])
            if not conn.execute("SELECT 1 FROM users WHERE username = %s", (username,)).fetchone():
                break
        else:
            raise Conflict("Couldn't find a free username; try again.")
        clean.update(username=username, password_hash=passwords.hash_password(password))
        row = insert(conn, "users", clean, returning=COLUMNS)
        audit.record_change(conn, actor, "CREATE", "users", row["user_id"], None, _snapshot(row),
                            f"{actor.name} created an account for {_name(row)}")
    return row, password


# --- login and passwords ---

def login(conn: psycopg.Connection, data: dict, secret: str, now: dt.datetime) -> dict:
    """Check username and password; return a new session and the user. One 401 for every failure."""
    username = (values.text(data, "username", max_length=20) or "").upper()
    password = values.text(data, "password", max_length=200)
    row = conn.execute(sql.SQL("SELECT {}, password_hash FROM users WHERE username = %s AND NOT is_archived")
                       .format(COLUMNS),
                       (username,)).fetchone()
    if row is None:
        # Unknown username: do the same PBKDF2 work as a real check (one hash at the
        # current round count), so the response time doesn't reveal which usernames
        # exist. It runs here, not at import: a 600k-round hash at import would slow
        # every cold start.
        passwords.hash_password(password)
        raise AuthenticationError(BAD_LOGIN)
    if not passwords.verify_password(password, row["password_hash"]):
        raise AuthenticationError(BAD_LOGIN)
    del row["password_hash"]
    return {**sessions.start(conn, row["user_id"], secret, now), "user": row}


def change_password(conn: psycopg.Connection, actor: Actor, data: dict, secret: str,
                    now: dt.datetime) -> tuple[dict, dict]:
    """Change your own password; clears the forced change and ends every older session.

    Returns the user and a fresh session, so the caller's own tab stays signed in.
    """
    current = values.text(data, "current_password", max_length=200)
    new = values.text(data, "new_password", max_length=200)
    if len(new) < 8:
        raise ValidationError("New password must be at least 8 characters.", field="new_password")
    with atomic(conn):
        stored = conn.execute("SELECT password_hash FROM users WHERE user_id = %s FOR UPDATE",
                              (actor.user_id,)).fetchone()["password_hash"]
        if not passwords.verify_password(current, stored):
            raise ValidationError("Current password is incorrect.", field="current_password")
        if new == current:
            raise ValidationError("New password must differ from the current one.", field="new_password")
        before = _row(conn, actor.user_id)
        # bandit B105 takes the "must_change_password" flag for a hard-coded password; it is not one.
        row = _update(conn, actor.user_id, {"password_hash": passwords.hash_password(new),
                                            "must_change_password": False,
                                            "password_changed_at": now})  # nosec B105
        audit.record_change(conn, actor, "UPDATE", "users", actor.user_id, _snapshot(before), _snapshot(row),
                            f"{_name(row)} changed their password")
        sessions.revoke_all(conn, actor.user_id, now)
        session = sessions.start(conn, actor.user_id, secret, now)
    return row, session


def reset_password(conn: psycopg.Connection, actor: Actor, user_id: int, now: dt.datetime) -> str:
    """Admin only: a new generated password, shown once, a forced change at next login, old tokens ended."""
    if not actor.is_admin:
        raise Forbidden("Only admins reset passwords.")
    password = passwords.generate_password()
    with atomic(conn):
        before = _target(conn, user_id)
        # bandit B105 takes the "must_change_password" flag for a hard-coded password; it is not one.
        row = _update(conn, user_id, {"password_hash": passwords.hash_password(password),
                                      "must_change_password": True,
                                      "password_changed_at": now})  # nosec B105
        audit.record_change(conn, actor, "RESET_PASSWORD", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} reset the password for {_name(row)}")
        sessions.revoke_all(conn, user_id, now)
    return password


# --- edits ---

def update_self(conn: psycopg.Connection, actor: Actor, data: dict) -> dict:
    """Change your own first name, last name or email. Nothing else."""
    values.only_allowed(data, _PROFILE_FIELDS)
    clean = _validate_fields(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before = _row(conn, actor.user_id)
        row = _update(conn, actor.user_id, clean)
        audit.record_change(conn, actor, "UPDATE", "users", actor.user_id, _snapshot(before), _snapshot(row),
                            f"{_name(row)} updated their profile")
    return row


def admin_update(conn: psycopg.Connection, actor: Actor, user_id: int, data: dict) -> dict:
    """Admin only: edit any field except username and id; never your own role or salary."""
    if not actor.is_admin:
        raise Forbidden("Only admins edit other people's accounts.")
    values.only_allowed(data, _ADMIN_FIELDS)
    if user_id == actor.user_id and ({"role", "annual_salary_cents"} & data.keys()):
        raise Forbidden("Nobody changes their own role or salary.")
    clean = _validate_fields(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before = _target(conn, user_id)
        if "manager_id" in clean:
            _check_line_manager(conn, clean["manager_id"], user_id)
        if before["role"] == MANAGER and clean.get("role", MANAGER) != MANAGER and _manages_live_projects(conn, user_id):
            raise Conflict(f"{_name(before)} still manages live projects. Reassign them first.")
        row = _update(conn, user_id, clean)
        audit.record_change(conn, actor, "UPDATE", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} updated {_name(row)}'s account")
    return row


def set_capacity(conn: psycopg.Connection, actor: Actor, user_id: int, data: dict) -> dict:
    """The line manager or an admin sets weekly capacity and whether overtime is allowed."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins set capacity.")
    values.only_allowed(data, _CAPACITY_FIELDS)
    clean = _validate_fields(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before = _target(conn, user_id)
        if actor.is_manager and before["manager_id"] != actor.user_id:  # not your report: same 404 as a missing user
            raise NotFound("User not found.")
        row = _update(conn, user_id, clean)
        audit.record_change(conn, actor, "UPDATE", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} updated capacity, overtime and task limit settings for {_name(row)}")
    return row


# --- reading ---

def get_user(conn: psycopg.Connection, actor: Actor, user_id: int) -> dict:
    """Admins and managers see anyone; an employee sees only themselves."""
    if actor.is_employee and user_id != actor.user_id:
        raise NotFound("User not found.")
    return _target(conn, user_id)


def can_see_salary(actor: Actor, row: dict) -> bool:
    """Salary is visible to admins and to the person themselves."""
    return actor.is_admin or actor.user_id == row["user_id"]


def list_users(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """Admins and managers: search by name, username or email; filter by role; archived on request."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins list people.")
    where, params = ["TRUE"], {}
    if not values.boolean(filters, "include_archived", required=False):
        where.append("NOT is_archived")
    if pattern := values.search(filters):
        where.append("(first_name || ' ' || last_name ILIKE %(q)s OR username ILIKE %(q)s OR email ILIKE %(q)s)")
        params["q"] = pattern
    if role := values.choice(filters, "role", ROLES, required=False):
        where.append("role = %(role)s")
        params["role"] = role
    # WHERE fragments are fixed strings written above; every value is a parameter.
    query = sql.SQL("SELECT {} FROM users WHERE {}").format(COLUMNS, sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("last_name, first_name, user_id"), page, page_size)


# --- what a person is on now ---

# The live projects a person is on: a live booking that ends today or later, or an open (not
# DONE) task assigned to them, on a project that isn't archived. Hours and end date come from
# the bookings that cover today, so someone booked only from next month shows 0 h and no end.
_LIVE_PROJECTS = (
    "SELECT p.project_id, p.name, p.status, COALESCE(b.hours_per_week, 0) AS hours_per_week,"
    " b.booking_end_date, COALESCE(t.open_task_count, 0) AS open_task_count"
    " FROM projects p"
    " LEFT JOIN (SELECT project_id,"
    "                   sum(hours_per_week) FILTER (WHERE start_date <= %(today)s) AS hours_per_week,"
    "                   max(end_date) FILTER (WHERE start_date <= %(today)s) AS booking_end_date"
    "            FROM assignments WHERE user_id = %(uid)s AND NOT is_archived AND end_date >= %(today)s"
    "            GROUP BY project_id) b ON b.project_id = p.project_id"
    " LEFT JOIN (SELECT project_id, count(*) AS open_task_count FROM tasks"
    "            WHERE assignee_user_id = %(uid)s AND NOT is_archived AND status <> 'DONE'"
    "            GROUP BY project_id) t ON t.project_id = p.project_id"
    " WHERE NOT p.is_archived AND (b.project_id IS NOT NULL OR t.project_id IS NOT NULL)"
)


def live_projects(conn: psycopg.Connection, actor: Actor, user_id: int, page: int, page_size: int) -> dict:
    """The live projects a person is on now, by name: hours this week, booking end, open tasks.

    Admins, the person's line manager and the person themself may read it; anyone else gets
    the same 404 as a missing id. Archiving the person asks first when this list isn't empty.
    """
    row = conn.execute("SELECT manager_id FROM users WHERE user_id = %s", (user_id,)).fetchone()
    allowed = row is not None and (actor.is_admin or actor.user_id == user_id
                                   or (actor.is_manager and row["manager_id"] == actor.user_id))
    if not allowed:
        raise NotFound("User not found.")  # the same answer as a missing id (404, never 403)
    result = paginate(conn, sql.SQL(_LIVE_PROJECTS), {"uid": user_id, "today": clock.today()},
                      sql.SQL("name, project_id"), page, page_size)
    return {**result, "items": [{
        "project_id": r["project_id"], "name": r["name"], "status": r["status"],
        "hours_per_week": int(r["hours_per_week"]),
        "booking_end_date": r["booking_end_date"].isoformat() if r["booking_end_date"] else None,
        "open_task_count": int(r["open_task_count"]),
    } for r in result["items"]]}


# --- archive ---

def _manages_live_projects(conn: psycopg.Connection, user_id: int) -> bool:
    return bool(conn.execute("SELECT 1 FROM projects WHERE manager_id = %s AND NOT is_archived LIMIT 1",
                             (user_id,)).fetchone())


def _on_projects_text(row: dict, projects: list[dict]) -> str:
    count = f"{len(projects)} live project{'' if len(projects) == 1 else 's'}"
    return (f"{_name(row)} is still on {count}: {', '.join(p['name'] for p in projects)}."
            " Archiving ends their bookings there; their open tasks stay assigned to them.")


def archive_user(conn: psycopg.Connection, actor: Actor, user_id: int, now: dt.datetime,
                 data: dict | None = None) -> dict:
    """Admin only. Archives the person, their live bookings and their sessions, in one transaction.

    Someone still on live projects (see live_projects) is archived only when the body says
    confirm_on_projects: exactly true; otherwise OnProjects (409, code ON_PROJECTS) names the
    projects and nothing changes. Their open tasks stay assigned to them.
    """
    if not actor.is_admin:
        raise Forbidden("Only admins archive accounts.")
    data = data or {}
    values.only_allowed(data, {"confirm_on_projects"})
    if user_id == actor.user_id:
        raise Conflict("You can't archive yourself.")
    with atomic(conn):
        before = _target(conn, user_id)
        if before["is_archived"]:
            raise Conflict(f"{_name(before)} is already archived.")
        if conn.execute("SELECT 1 FROM users WHERE manager_id = %s AND NOT is_archived LIMIT 1", (user_id,)).fetchone():
            raise Conflict(f"{_name(before)} still has live reports. Give them another line manager first.")
        if _manages_live_projects(conn, user_id):
            raise Conflict(f"{_name(before)} still manages live projects. Reassign them first.")
        if data.get("confirm_on_projects") is not True:
            on = conn.execute(sql.SQL(_LIVE_PROJECTS) + sql.SQL(" ORDER BY name, project_id"),
                              {"uid": user_id, "today": clock.today()}).fetchall()
            if on:
                raise OnProjects(_on_projects_text(before, on))
        row = _update(conn, user_id, {"is_archived": True, "archived_at": now, "archived_by": actor.user_id})
        sessions.revoke_all(conn, user_id, now)
        audit.record_change(conn, actor, "ARCHIVE", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} archived {_name(row)}")
        for booking in conn.execute(
            "UPDATE assignments SET is_archived = TRUE, archived_at = %s, archived_by = %s, updated_at = now()"
            " WHERE user_id = %s AND NOT is_archived RETURNING assignment_id",
            (row["archived_at"], actor.user_id, user_id),
        ).fetchall():
            audit.record_change(conn, actor, "ARCHIVE", "assignments", booking["assignment_id"], None, None,
                                f"{actor.name} archived a booking of {_name(row)}")
    return row


def reactivate_user(conn: psycopg.Connection, actor: Actor, user_id: int) -> dict:
    """Admin only. Bookings stay archived; book the person again where needed."""
    if not actor.is_admin:
        raise Forbidden("Only admins reactivate accounts.")
    with atomic(conn):
        before = _target(conn, user_id)
        if not before["is_archived"]:
            raise Conflict(f"{_name(before)} is not archived.")
        row = _update(conn, user_id, {"is_archived": False, "archived_at": None, "archived_by": None})
        audit.record_change(conn, actor, "REACTIVATE", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} reactivated {_name(row)}")
    return row
