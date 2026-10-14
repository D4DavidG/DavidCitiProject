"""Project requests (intake): a manager asks for a project, an admin approves or rejects.

Approval creates the project, managed by the manager who asked for it, in the
same transaction. That writes two audit rows: the request was decided, and a
project was created.
"""

import psycopg
from psycopg import sql

from domain import money, values
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import audit, projects
from services.actors import Actor
from services.paging import paginate
from services.views import request_view
from store.postgres import atomic, insert

NOT_FOUND = "Request not found."
STATUSES = {"PENDING", "APPROVED", "REJECTED"}
_FIELDS = {"name", "description", "justification", "proposed_start", "proposed_end"}


def create_request(conn: psycopg.Connection, actor: Actor, data: dict) -> dict:
    """Managers only (admins simply create the project)."""
    if not actor.is_manager:
        raise Forbidden("Only managers file project requests.")
    values.only_allowed(data, _FIELDS)
    clean = {
        "name": values.text(data, "name"),
        "description": values.text(data, "description", required=False, max_length=5000),
        "justification": values.text(data, "justification", max_length=5000),
        "proposed_start": values.date(data, "proposed_start", required=False),
        "proposed_end": values.date(data, "proposed_end", required=False),
        "requested_by": actor.user_id,
    }
    if clean["proposed_start"] and clean["proposed_end"] and clean["proposed_end"] < clean["proposed_start"]:
        raise ValidationError("End date can't be before start date.", field="proposed_end")
    with atomic(conn):
        row = insert(conn, "project_requests", clean)
        audit.record_change(conn, actor, "CREATE", "project_requests", row["request_id"], None, request_view(row),
                            f"{actor.name} requested a new project: {row['name']}")
    return row


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
