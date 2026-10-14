"""The audit log and who it notifies.

record_change() is called inside the same transaction as the change it records,
so the change, its audit row and its notifications commit together or not at
all. Recipients come from the actor's role as stored right now, never from a
token or a stale session:

    Employee -> their line manager, every admin, and, when the change is to a
                project's work (a task, logged time, ...), that project's manager
    Manager  -> every admin
    Admin    -> every other admin

A caller may name one more recipient (`also_notify`), used to tell an asker
their request was decided. Archived users receive nothing. A lone admin's change notifies nobody but is
still recorded. The notification text is the one-line summary, never the
before/after state, so nobody sees a salary through a notification.
"""

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from domain import values
from domain.errors import Forbidden
from services.actors import Actor
from services.paging import paginate


def record_change(conn: psycopg.Connection, actor: Actor | None, action: str, entity_type: str,
                  entity_id: int | None, before: dict | None, after: dict | None, summary: str,
                  also_notify: int | None = None) -> int:
    """Write one audit row plus its notifications; return the audit id."""
    role = None
    if actor is not None:
        role = conn.execute("SELECT role FROM users WHERE user_id = %s", (actor.user_id,)).fetchone()["role"]
    audit_id = conn.execute(
        "INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id,"
        " before_state, after_state, summary) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING audit_id",
        (actor.user_id if actor else None, role, action, entity_type, entity_id,
         Jsonb(before) if before is not None else None, Jsonb(after) if after is not None else None, summary),
    ).fetchone()["audit_id"]
    if actor is not None:
        conn.execute(
            "INSERT INTO notifications (recipient_user_id, audit_id)"
            " SELECT u.user_id, %(audit)s FROM users u, users me"
            " WHERE me.user_id = %(me)s AND u.user_id <> me.user_id AND NOT u.is_archived"
            "   AND (u.role = 'ADMIN' OR u.user_id = %(also)s"
            "        OR (me.role = 'EMPLOYEE' AND u.user_id IN (me.manager_id, %(pm)s)))",
            {"audit": audit_id, "me": actor.user_id, "also": also_notify,
             "pm": _project_manager(conn, entity_type, entity_id)},
        )
    return audit_id


# Tables whose rows belong to one project, by their key column. Each has a project_id.
_PROJECT_ROWS = {"projects": "project_id", "assignments": "assignment_id", "milestones": "milestone_id",
                 "tasks": "task_id", "time_entries": "entry_id"}


def _project_manager(conn: psycopg.Connection, entity_type: str, entity_id: int | None) -> int | None:
    """The manager of the project a changed row belongs to, or None (users, requests, ...)."""
    key = _PROJECT_ROWS.get(entity_type)
    if key is None or entity_id is None:
        return None
    row = conn.execute(
        sql.SQL("SELECT p.manager_id FROM {} t JOIN projects p ON p.project_id = t.project_id"
                " WHERE t.{} = %s").format(sql.Identifier(entity_type), sql.Identifier(key)),
        (entity_id,),
    ).fetchone()
    return row["manager_id"] if row else None


def list_audit(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """Admin only: the audit log, newest first, filtered by actor, entity and date."""
    if not actor.is_admin:
        raise Forbidden("Only admins can read the audit log.")
    where, params = ["TRUE"], {}
    if (actor_id := values.integer(filters, "actor_id", required=False)) is not None:
        where.append("actor_user_id = %(actor_id)s")
        params["actor_id"] = actor_id
    if entity_type := values.text(filters, "entity_type", required=False, max_length=64):
        where.append("entity_type = %(entity_type)s")
        params["entity_type"] = entity_type
    if (entity_id := values.integer(filters, "entity_id", required=False)) is not None:
        where.append("entity_id = %(entity_id)s")
        params["entity_id"] = entity_id
    if date_from := values.date(filters, "date_from", required=False):
        where.append("created_at >= %(date_from)s")
        params["date_from"] = date_from
    if date_to := values.date(filters, "date_to", required=False):
        where.append("created_at < %(date_to)s::date + 1")
        params["date_to"] = date_to
    # The WHERE fragments are fixed strings from this function; every value is a parameter.
    query = sql.SQL("SELECT * FROM audit_log WHERE {}").format(sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("audit_id DESC"), page, page_size)
