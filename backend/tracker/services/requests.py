"""Requests: managers and employees ask, the people above them decide.

Five kinds (the `kind` column of project_requests, migration 003):

    NEW_PROJECT, ARCHIVE_PROJECT  sent by managers, decided by admins
    TASK_LIMIT, OVERTIME          sent by employees, decided by their line manager or an admin
    OTHER                         free text from either; deciding it changes nothing else

Who decides is who `record_change` notifies when the request is sent. Approving
applies the change through the existing service in the same transaction, so the
same rules and audit rows apply as if the decider had done it by hand.
"""

import psycopg
from psycopg import sql

from domain import money, values
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import audit, projects
from services.access import PROJECT_NOT_FOUND
from services.actors import Actor
from services.paging import paginate
from services.views import request_view
from store.postgres import atomic, insert

NOT_FOUND = "Request not found."
STATUSES = {"PENDING", "APPROVED", "REJECTED"}
SENDERS = {"NEW_PROJECT": {"MANAGER"}, "ARCHIVE_PROJECT": {"MANAGER"},
           "TASK_LIMIT": {"EMPLOYEE"}, "OVERTIME": {"EMPLOYEE"}, "OTHER": {"MANAGER", "EMPLOYEE"}}
_FIELDS = {"NEW_PROJECT": {"name", "description", "justification", "proposed_start", "proposed_end"},
           "ARCHIVE_PROJECT": {"project_id", "justification"}, "TASK_LIMIT": {"task_limit", "justification"},
           "OVERTIME": {"justification"}, "OTHER": {"name", "justification"}}


def create_request(conn: psycopg.Connection, actor: Actor, data: dict) -> dict:
    """Send a request of a kind your role may send (SENDERS). The note is always required."""
    kind = values.choice(data, "kind", set(SENDERS))
    if actor.role not in SENDERS[kind]:
        raise Forbidden("Your role can't send this kind of request.")
    values.only_allowed(data, _FIELDS[kind] | {"kind"})
    clean = {"kind": kind, "requested_by": actor.user_id,
             "justification": values.text(data, "justification", max_length=5000)}
    with atomic(conn):
        clean.update(_kind_fields(conn, actor, kind, data))
        row = insert(conn, "project_requests", clean)
        summary = f"{actor.name} requested a new project: {row['name']}" if kind == "NEW_PROJECT" else \
            f"{actor.name} sent a request: {row['name']}"
        audit.record_change(conn, actor, "CREATE", "project_requests", row["request_id"], None, request_view(row),
                            summary)
    return row


def _kind_fields(conn: psycopg.Connection, actor: Actor, kind: str, data: dict) -> dict:
    """The columns only this kind fills; `name` is the request's title for every kind."""
    if kind == "NEW_PROJECT":
        clean = {"name": values.text(data, "name"),
                 "description": values.text(data, "description", required=False, max_length=5000),
                 "proposed_start": values.date(data, "proposed_start", required=False),
                 "proposed_end": values.date(data, "proposed_end", required=False)}
        if clean["proposed_start"] and clean["proposed_end"] and clean["proposed_end"] < clean["proposed_start"]:
            raise ValidationError("End date can't be before start date.", field="proposed_end")
        return clean
    if kind == "ARCHIVE_PROJECT":
        project_id = values.integer(data, "project_id")
        project = conn.execute("SELECT * FROM projects WHERE project_id = %s AND manager_id = %s",
                               (project_id, actor.user_id)).fetchone()
        if project is None:
            raise NotFound(PROJECT_NOT_FOUND)
        if project["is_archived"]:
            raise Conflict("This project is already archived.")
        return {"name": f"Archive {project['name']}", "project_id": project_id}
    me = conn.execute("SELECT task_limit, overtime_allowed FROM users WHERE user_id = %s",
                      (actor.user_id,)).fetchone()
    if kind == "TASK_LIMIT":
        limit = values.integer(data, "task_limit", minimum=1, maximum=10)
        if limit <= me["task_limit"]:
            raise ValidationError(f"Ask for more than your current limit of {me['task_limit']}.", field="task_limit")
        return {"name": f"Raise my task limit to {limit}", "task_limit": limit}
    if kind == "OVERTIME":
        if me["overtime_allowed"]:
            raise Conflict("Overtime is already allowed for you.")
        return {"name": "Allow overtime"}
    return {"name": values.text(data, "name")}  # OTHER: the subject


def list_requests(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """Admins see every request; managers see their own."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins see project requests.")
    where, params = ["TRUE"], {"me": actor.user_id}
    if actor.is_manager:
        where.append("requested_by = %(me)s")
    if status := values.choice(filters, "status", STATUSES, required=False):
        where.append("status = %(status)s")
        params["status"] = status
    query = sql.SQL("SELECT * FROM project_requests WHERE {}").format(sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("request_id DESC"), page, page_size)


def get_request(conn: psycopg.Connection, actor: Actor, request_id: int, lock: bool = False) -> dict:
    if actor.is_employee:
        raise Forbidden("Only managers and admins see project requests.")
    query = "SELECT * FROM project_requests WHERE request_id = %s FOR UPDATE" if lock else \
        "SELECT * FROM project_requests WHERE request_id = %s"
    row = conn.execute(query, (request_id,)).fetchone()
    if row is None or (actor.is_manager and row["requested_by"] != actor.user_id):
        raise NotFound(NOT_FOUND)
    return row


def _pending(conn: psycopg.Connection, actor: Actor, request_id: int) -> dict:
    if not actor.is_admin:
        raise Forbidden("Only admins decide project requests.")
    row = get_request(conn, actor, request_id, lock=True)
    if row["status"] != "PENDING":
        raise Conflict(f"This request was already {row['status'].lower()}.")
    return row


def approve_request(conn: psycopg.Connection, actor: Actor, request_id: int, data: dict) -> dict:
    """Admin only. Creates the project (dates default to the proposed ones) and links it."""
    values.only_allowed(data, {"start_date", "predicted_end_date", "budget_cents", "decision_note"})
    with atomic(conn):
        before = _pending(conn, actor, request_id)
        start = values.date(data, "start_date", required=False) or before["proposed_start"]
        end = values.date(data, "predicted_end_date", required=False) or before["proposed_end"]
        if start is None:
            raise ValidationError("A start date is required to approve.", field="start_date")
        if end is None:
            raise ValidationError("An end date is required to approve.", field="predicted_end_date")
        clean = {"name": before["name"], "description": before["description"], "manager_id": before["requested_by"],
                 "start_date": start, "predicted_end_date": end,
                 "budget_cents": money.cents(data, "budget_cents", required=False) or 0}
        projects._check(conn, clean)
        project = projects._insert(conn, actor, clean)
        row = conn.execute("UPDATE project_requests SET status = 'APPROVED', decided_by = %s, decided_at = now(),"
                           " decision_note = %s, created_project_id = %s WHERE request_id = %s RETURNING *",
                           (actor.user_id, values.text(data, "decision_note", required=False, max_length=2000),
                            project["project_id"], request_id)).fetchone()
        audit.record_change(conn, actor, "APPROVE", "project_requests", request_id, request_view(before),
                            request_view(row), f"{actor.name} approved the request for {row['name']}")
    return {"request": row, "project": project}


def reject_request(conn: psycopg.Connection, actor: Actor, request_id: int, data: dict) -> dict:
    """Admin only, with an optional note to the manager."""
    values.only_allowed(data, {"decision_note"})
    with atomic(conn):
        before = _pending(conn, actor, request_id)
        row = conn.execute("UPDATE project_requests SET status = 'REJECTED', decided_by = %s, decided_at = now(),"
                           " decision_note = %s WHERE request_id = %s RETURNING *",
                           (actor.user_id, values.text(data, "decision_note", required=False, max_length=2000),
                            request_id)).fetchone()
        audit.record_change(conn, actor, "REJECT", "project_requests", request_id, request_view(before),
                            request_view(row), f"{actor.name} rejected the request for {row['name']}")
    return row
