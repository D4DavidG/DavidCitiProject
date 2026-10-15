"""A person's in-app notifications (the bell).

Marking one read touches only the reader's own inbox, not business data, so it
is not audited (that would notify people about notifications).
"""

import psycopg
from psycopg import sql

from domain.errors import NotFound
from services.actors import Actor
from services.paging import paginate

_SELECT = (
    "SELECT n.notification_id, n.audit_id, n.is_read, n.read_at, n.created_at,"
    " a.summary, a.entity_type, a.entity_id"
    " FROM notifications n JOIN audit_log a ON a.audit_id = n.audit_id"
    " WHERE n.recipient_user_id = %(me)s"
)


def list_notifications(conn: psycopg.Connection, actor: Actor, unread_only: bool, page: int, page_size: int) -> dict:
    """Your own notifications, newest first."""
    query = sql.SQL(_SELECT + " AND NOT n.is_read") if unread_only else sql.SQL(_SELECT)
    return paginate(conn, query, {"me": actor.user_id}, sql.SQL("notification_id DESC"), page, page_size)


def unread_count(conn: psycopg.Connection, actor: Actor) -> int:
    """How many of your notifications are unread (the bell badge)."""
    return conn.execute("SELECT count(*) AS n FROM notifications WHERE recipient_user_id = %s AND NOT is_read",
                        (actor.user_id,)).fetchone()["n"]


def mark_read(conn: psycopg.Connection, actor: Actor, notification_id: int) -> dict:
    """Mark one of your notifications read. Someone else's answers 404, like a missing one."""
    row = conn.execute(
        "UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, now())"
        " WHERE notification_id = %s AND recipient_user_id = %s RETURNING notification_id",
        (notification_id, actor.user_id),
    ).fetchone()
    if row is None:
        raise NotFound("Notification not found.")
    return conn.execute(_SELECT + " AND n.notification_id = %(id)s",
                        {"me": actor.user_id, "id": notification_id}).fetchone()


def read_all(conn: psycopg.Connection, actor: Actor) -> int:
    """Mark all your notifications read; return how many changed."""
    return conn.execute(
        "UPDATE notifications SET is_read = TRUE, read_at = now() WHERE recipient_user_id = %s AND NOT is_read",
        (actor.user_id,),
    ).rowcount
