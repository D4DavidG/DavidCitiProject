"""Accounts: creation, login, passwords, self-service, admin edits, capacity, archive.

- Only admins create accounts. The server generates the username (initials plus
  six digits, never changed) and a 12-character password shown once.
- Login is by username. Every login failure gets the same 401.
- A user edits only their own name and email. Nobody edits a username, and
  nobody changes their own role or salary.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import values
from domain.errors import AuthenticationError, Conflict, Forbidden, NotFound, ValidationError
from services import audit, passwords, tokens
from services.actors import ADMIN, EMPLOYEE, MANAGER, Actor
from services.paging import paginate
from services.views import user_view
from store.postgres import atomic, columns, insert, update

BAD_LOGIN = "Username or password is incorrect."
ROLES = {ADMIN, MANAGER, EMPLOYEE}
# Every column except password_hash, which never leaves the database layer.
COLUMNS = columns(["user_id", "username", "first_name", "last_name", "email", "job_title", "role", "manager_id",
                   "annual_salary_cents", "weekly_capacity_hours", "overtime_allowed", "task_limit", "must_change_password",
                   "is_archived", "archived_at", "archived_by", "created_at", "updated_at"])
_PROFILE_FIELDS = {"first_name", "last_name", "email"}
_ADMIN_FIELDS = _PROFILE_FIELDS | {"job_title", "role", "manager_id", "annual_salary_cents",
                                   "weekly_capacity_hours", "overtime_allowed", "task_limit"}
_CAPACITY_FIELDS = {"weekly_capacity_hours", "overtime_allowed", "task_limit"}


def _row(conn: psycopg.Connection, user_id: int) -> dict | None:
    return conn.execute(sql.SQL("SELECT {} FROM users WHERE user_id = %s").format(COLUMNS), (user_id,)).fetchone()


def _snapshot(row: dict) -> dict:
    return user_view(row, include_salary=True)  # audit log is admin-only, and admins see salary


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
        clean["annual_salary_cents"] = values.integer(data, "annual_salary_cents", minimum=0, maximum=10**12)
    if "weekly_capacity_hours" in data:
        clean["weekly_capacity_hours"] = values.integer(data, "weekly_capacity_hours", minimum=1, maximum=60)
    if "overtime_allowed" in data:
        clean["overtime_allowed"] = values.boolean(data, "overtime_allowed")
    if "task_limit" in data:
        clean["task_limit"] = values.integer(data, "task_limit", minimum=1, maximum=10)
    return clean


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


# --- creation ---------------------------------------------------------------

def bootstrap_admin(conn: psycopg.Connection, password: str) -> None:
    """Create the first admin, AD000001, unless it exists. Run once by the migration step.

    Every cold start calls this inside the migration lock, so the existence check comes
    before the deliberately slow hash: otherwise simultaneous cold starts queue for
    about a second each.
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
        values.text(data, required)  # presence check with the right field name
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


# --- login and passwords ------------------------------------------------------

def login(conn: psycopg.Connection, data: dict, secret: str, now: dt.datetime) -> dict:
    """Check username and password; return a token and the user. One 401 for every failure."""
    username = (values.text(data, "username", max_length=20) or "").upper()
    password = values.text(data, "password", max_length=200)
    row = conn.execute(sql.SQL("SELECT {}, password_hash FROM users WHERE username = %s AND NOT is_archived")
                       .format(COLUMNS),
                       (username,)).fetchone()
    if row is None:
        # Do the same hashing work as a real check (one PBKDF2 at the current round count),
        # so the reply time doesn't reveal which usernames exist. Nothing is hashed at import:
        # a 600k-round dummy there would slow every cold start by as long as a login takes.
        passwords.hash_password(password)
        raise AuthenticationError(BAD_LOGIN)
    if not passwords.verify_password(password, row["password_hash"]):
        raise AuthenticationError(BAD_LOGIN)
    del row["password_hash"]
    return {"token": tokens.issue(row["user_id"], secret, now), "user": row}


def change_password(conn: psycopg.Connection, actor: Actor, data: dict) -> dict:
    """Change your own password; clears the forced change after first login or a reset."""
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
        # bandit B105 mistakes the "must_change_password" flag for a hard-coded password.
        row = _update(conn, actor.user_id, {"password_hash": passwords.hash_password(new),
                                            "must_change_password": False})  # nosec B105
        audit.record_change(conn, actor, "UPDATE", "users", actor.user_id, _snapshot(before), _snapshot(row),
                            f"{_name(row)} changed their password")
    return row


def reset_password(conn: psycopg.Connection, actor: Actor, user_id: int) -> str:
    """Admin only: a new generated password, shown once, and a forced change at next login."""
    if not actor.is_admin:
        raise Forbidden("Only admins reset passwords.")
    password = passwords.generate_password()
    with atomic(conn):
        before = _target(conn, user_id)
        # bandit B105 mistakes the "must_change_password" flag for a hard-coded password.
        row = _update(conn, user_id, {"password_hash": passwords.hash_password(password),
                                      "must_change_password": True})  # nosec B105
        audit.record_change(conn, actor, "RESET_PASSWORD", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} reset the password for {_name(row)}")
    return password


# --- edits ----------------------------------------------------------------------

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
        if actor.is_manager and before["manager_id"] != actor.user_id:
            raise NotFound("User not found.")
        row = _update(conn, user_id, clean)
        audit.record_change(conn, actor, "UPDATE", "users", user_id, _snapshot(before), _snapshot(row),
                            f"{actor.name} updated capacity, overtime and task limit settings for {_name(row)}")
    return row


# --- reading ----------------------------------------------------------------------

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
    if search := values.text(filters, "search", required=False, max_length=100):
        where.append("(first_name || ' ' || last_name ILIKE %(q)s OR username ILIKE %(q)s OR email ILIKE %(q)s)")
        params["q"] = f"%{search}%"
    if role := values.choice(filters, "role", ROLES, required=False):
        where.append("role = %(role)s")
        params["role"] = role
    # The WHERE fragments are fixed strings from this function; every value is a parameter.
    query = sql.SQL("SELECT {} FROM users WHERE {}").format(COLUMNS, sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("last_name, first_name, user_id"), page, page_size)


# --- archive ------------------------------------------------------------------------

def _manages_live_projects(conn: psycopg.Connection, user_id: int) -> bool:
    return bool(conn.execute("SELECT 1 FROM projects WHERE manager_id = %s AND NOT is_archived LIMIT 1",
                             (user_id,)).fetchone())


def archive_user(conn: psycopg.Connection, actor: Actor, user_id: int) -> dict:
    """Admin only. Archives the person and their live bookings, in one transaction."""
    if not actor.is_admin:
        raise Forbidden("Only admins archive accounts.")
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
        row = _update(conn, user_id, {"is_archived": True, "archived_at": dt.datetime.now(dt.timezone.utc),
                                      "archived_by": actor.user_id})
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
