"""Projects: created by admins, run by one manager each, archived rather than deleted.

A project's manager may change its description, dates, budget and status. Its
name and its manager are admin-only. Archiving a project archives its bookings,
deliverables and tasks with the same timestamp, and reactivating restores
exactly those.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import money, values
from domain.errors import Conflict, Forbidden, ValidationError
from services import audit
from services.access import managed_project, visible_project
from services.actors import MANAGER, Actor
from services.paging import paginate
from services.views import project_view
from store.postgres import atomic, insert, update

STATUSES = {"PLANNING", "ACTIVE", "ON_HOLD", "COMPLETE"}
_ADMIN_FIELDS = {"name", "description", "manager_id", "start_date", "predicted_end_date", "budget_cents", "status"}
_ADMIN_ONLY = {"name", "manager_id"}
CHILDREN = ("assignments", "milestones", "tasks")

# Question 1: a project's progress is the share of its live tasks' estimated minutes that are done.
_WITH_PROGRESS = (
    "SELECT p.*, COALESCE(pr.progress_percent, 0) AS progress_percent FROM projects p"
    " LEFT JOIN (SELECT project_id, (COALESCE(sum(estimate_minutes) FILTER (WHERE status = 'DONE'), 0) * 100"
    "                               / sum(estimate_minutes))::int AS progress_percent"
    "            FROM tasks WHERE NOT is_archived GROUP BY project_id) pr ON pr.project_id = p.project_id"
)
_CHILD_KEYS = {"assignments": "assignment_id", "milestones": "milestone_id", "tasks": "task_id"}


def _clean(data: dict) -> dict:
    clean = {}
    if "name" in data:
        clean["name"] = values.text(data, "name")
    if "description" in data:
        clean["description"] = values.text(data, "description", required=False, max_length=5000)
    if "manager_id" in data:
        clean["manager_id"] = values.integer(data, "manager_id")
    if "start_date" in data:
        clean["start_date"] = values.date(data, "start_date")
    if "predicted_end_date" in data:
        clean["predicted_end_date"] = values.date(data, "predicted_end_date")
    if "budget_cents" in data:
        clean["budget_cents"] = money.cents(data, "budget_cents")
    if "status" in data:
        clean["status"] = values.choice(data, "status", STATUSES)
    return clean


def _check(conn: psycopg.Connection, merged: dict) -> None:
    if merged["predicted_end_date"] < merged["start_date"]:
        raise ValidationError("End date can't be before start date.", field="predicted_end_date")
    boss = conn.execute("SELECT role FROM users WHERE user_id = %s AND NOT is_archived",
                        (merged["manager_id"],)).fetchone()
    if boss is None or boss["role"] != MANAGER:
        raise ValidationError("The project manager must be an active manager.", field="manager_id")


def create_project(conn: psycopg.Connection, actor: Actor, data: dict) -> dict:
    """Admin only."""
    if not actor.is_admin:
        raise Forbidden("Only admins create projects. Managers can file a project request.")
    values.only_allowed(data, _ADMIN_FIELDS)
    for required in ("name", "manager_id", "start_date", "predicted_end_date"):
        if required not in data:
            raise ValidationError(f"{required.replace('_', ' ').capitalize()} is required.", field=required)
    clean = _clean(data)
    with atomic(conn):
        _check(conn, clean)
        return _insert(conn, actor, clean)


def _insert(conn: psycopg.Connection, actor: Actor, clean: dict) -> dict:
    """Insert and audit a project (also used when a project request is approved)."""
    clean = {**clean, "created_by": actor.user_id}
    row = insert(conn, "projects", clean)
    audit.record_change(conn, actor, "CREATE", "projects", row["project_id"], None, project_view(row),
                        f"{actor.name} created project {row['name']}")
    return row


def get_project(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """The project with its progress, if `actor` may see it."""
    visible_project(conn, actor, project_id)
    return conn.execute(_WITH_PROGRESS + " WHERE p.project_id = %s", (project_id,)).fetchone()


def list_projects(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """The projects `actor` may see, searchable by name and filterable by status."""
    where, params = ["TRUE"], {"me": actor.user_id}
    if actor.is_manager:
        where.append("p.manager_id = %(me)s")
    elif actor.is_employee:
        where.append("EXISTS (SELECT 1 FROM assignments a WHERE a.project_id = p.project_id"
                     " AND a.user_id = %(me)s AND NOT a.is_archived)")
    if not (actor.is_admin and values.boolean(filters, "include_archived", required=False)):
        where.append("NOT p.is_archived")
    if search := values.text(filters, "search", required=False, max_length=100):
        where.append("p.name ILIKE %(q)s")
        params["q"] = f"%{search}%"
    if status := values.choice(filters, "status", STATUSES, required=False):
        where.append("p.status = %(status)s")
        params["status"] = status
    # The WHERE fragments are fixed strings from this function; every value is a parameter.
    query = sql.SQL("{} WHERE {}").format(sql.SQL(_WITH_PROGRESS), sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("p.name, p.project_id"), page, page_size)


def update_project(conn: psycopg.Connection, actor: Actor, project_id: int, data: dict) -> dict:
    """Admin: any field. The project's manager: description, dates, budget, status."""
    values.only_allowed(data, _ADMIN_FIELDS)
    clean = _clean(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before = managed_project(conn, actor, project_id, lock=True)
        if not actor.is_admin and (_ADMIN_ONLY & clean.keys()):
            raise Forbidden("Only an admin can rename a project or change its manager.")
        _check(conn, {**before, **clean})
        row = update(conn, "projects", "project_id", project_id, clean)
        audit.record_change(conn, actor, "UPDATE", "projects", project_id, project_view(before), project_view(row),
                            f"{actor.name} updated project {row['name']}")
    return row


def archive_project(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """Admin only. Archives the project and its live bookings, deliverables and tasks."""
    if not actor.is_admin:
        raise Forbidden("Only admins archive projects.")
    with atomic(conn):
        before = visible_project(conn, actor, project_id, lock=True)
        if before["is_archived"]:
            raise Conflict("This project is already archived.")
        stamp = dt.datetime.now(dt.timezone.utc)
        row = conn.execute("UPDATE projects SET is_archived = TRUE, archived_at = %s, archived_by = %s,"
                           " updated_at = now() WHERE project_id = %s RETURNING *",
                           (stamp, actor.user_id, project_id)).fetchone()
        audit.record_change(conn, actor, "ARCHIVE", "projects", project_id, project_view(before), project_view(row),
                            f"{actor.name} archived project {row['name']}")
        for table in CHILDREN:
            _set_children(conn, actor, table, project_id, row["name"], archive=True, stamp=stamp)
    return row


def reactivate_project(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """Admin only. Restores the children archived together with the project, and only those."""
    if not actor.is_admin:
        raise Forbidden("Only admins reactivate projects.")
    with atomic(conn):
        before = visible_project(conn, actor, project_id, lock=True)
        if not before["is_archived"]:
            raise Conflict("This project is not archived.")
        row = conn.execute("UPDATE projects SET is_archived = FALSE, archived_at = NULL, archived_by = NULL,"
                           " updated_at = now() WHERE project_id = %s RETURNING *", (project_id,)).fetchone()
        audit.record_change(conn, actor, "REACTIVATE", "projects", project_id, project_view(before),
                            project_view(row), f"{actor.name} reactivated project {row['name']}")
        for table in CHILDREN:
            _set_children(conn, actor, table, project_id, row["name"], archive=False, stamp=before["archived_at"])
    return row


def _set_children(conn: psycopg.Connection, actor: Actor, table: str, project_id: int, name: str,
                  archive: bool, stamp: dt.datetime) -> None:
    key = _CHILD_KEYS[table]
    names = (sql.Identifier(table), sql.Identifier(key))
    if archive:
        changed = conn.execute(sql.SQL(
            "UPDATE {} SET is_archived = TRUE, archived_at = %s, archived_by = %s, updated_at = now()"
            " WHERE project_id = %s AND NOT is_archived RETURNING {}").format(*names),
            (stamp, actor.user_id, project_id)).fetchall()
    else:
        changed = conn.execute(sql.SQL(
            "UPDATE {} SET is_archived = FALSE, archived_at = NULL, archived_by = NULL, updated_at = now()"
            " WHERE project_id = %s AND archived_at = %s RETURNING {}").format(*names),
            (project_id, stamp)).fetchall()
    action, verb = ("ARCHIVE", "archived") if archive else ("REACTIVATE", "reactivated")
    for child in changed:
        audit.record_change(conn, actor, action, table, child[key], None, None,
                            f"{actor.name} {verb} a {table[:-1].replace('_', ' ')} of project {name}"
                            f" with the project")
