"""Requests: managers and employees ask, the people above them decide.

Five kinds (the `kind` column of project_requests, migration 003):

    NEW_PROJECT, ARCHIVE_PROJECT  sent by managers, decided by admins
    TASK_LIMIT, OVERTIME          sent by employees, decided by their line manager or an admin
    OTHER                         free text from either; deciding it changes nothing else

Whoever may decide is whoever is notified when it is sent. Approving applies the
change through the existing service in the same transaction, so the same rules
and audit rows apply as if the decider had done it by hand.
"""

import psycopg
from psycopg import sql

from domain import money, values
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import audit, projects, users
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


# Who may decide: never the asker; an admin decides any; a line manager decides
# requests from employees who report to them (a manager's go to the admins only).
# One condition shared by list and get.
_MAY_DECIDE = "(r.requested_by <> %(me)s AND (%(admin)s OR (u.role = 'EMPLOYEE' AND u.manager_id = %(me)s)))"
_MAY_SEE = f"(r.requested_by = %(me)s OR {_MAY_DECIDE})"
# The Requests page's two tabs. MINE and TO_DECIDE are the names the website sent before
# 15 Oct; they still work, so a page loaded before a deploy keeps working.
_SCOPES = {"sent": "r.requested_by = %(me)s", "decide": _MAY_DECIDE}
_OLD_SCOPES = {"MINE": "sent", "TO_DECIDE": "decide"}
_SELECT = ("SELECT r.*, u.first_name || ' ' || u.last_name AS requester_name"
           " FROM project_requests r JOIN users u ON u.user_id = r.requested_by")


def list_requests(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """Your own requests (scope `sent`), the ones you may decide (`decide`), or both (no scope).

    `q` searches the request's name and the asker's name.
    """
    scope = filters.get("scope")
    scope = values.choice({"scope": _OLD_SCOPES.get(scope, scope)}, "scope", set(_SCOPES), required=False)
    where, params = [_SCOPES[scope] if scope else _MAY_SEE], {"me": actor.user_id, "admin": actor.is_admin}
    if pattern := values.search(filters):
        where.append("(r.name ILIKE %(q)s OR u.first_name || ' ' || u.last_name ILIKE %(q)s)")
        params["q"] = pattern
    if status := values.choice(filters, "status", STATUSES, required=False):
        where.append("r.status = %(status)s")
        params["status"] = status
    if kind := values.choice(filters, "kind", set(SENDERS), required=False):
        where.append("r.kind = %(kind)s")
        params["kind"] = kind
    # WHERE fragments are fixed strings from this module; every value is a parameter.
    query = sql.SQL(_SELECT + " WHERE {}").format(sql.SQL(" AND ").join(map(sql.SQL, where)))
    return paginate(conn, query, params, sql.SQL("r.request_id DESC"), page, page_size)


def get_request(conn: psycopg.Connection, actor: Actor, request_id: int) -> dict:
    """The request if you asked it or may decide it; otherwise 404."""
    return _find(conn, actor, request_id, _MAY_SEE)


def _find(conn: psycopg.Connection, actor: Actor, request_id: int, condition: str, lock: bool = False) -> dict:
    query = _SELECT + " WHERE r.request_id = %(id)s AND " + condition + (" FOR UPDATE OF r" if lock else "")
    row = conn.execute(query, {"id": request_id, "me": actor.user_id, "admin": actor.is_admin}).fetchone()
    if row is None:
        raise NotFound(NOT_FOUND)
    return row


def _pending(conn: psycopg.Connection, actor: Actor, request_id: int) -> dict:
    """Lock a request the actor may decide (404 otherwise); 409 unless it is still pending."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins decide requests.")
    row = _find(conn, actor, request_id, _MAY_DECIDE, lock=True)
    if row["status"] != "PENDING":
        raise Conflict(f"This request was already {row['status'].lower()}.")
    return row


def approve_request(conn: psycopg.Connection, actor: Actor, request_id: int, data: dict) -> dict:
    """Apply the change the request asks for, mark it approved and tell the asker."""
    with atomic(conn):
        before = _pending(conn, actor, request_id)
        values.only_allowed(data, {"start_date", "predicted_end_date", "budget_cents", "decision_note"}
                            if before["kind"] == "NEW_PROJECT" else {"decision_note"})
        project = _apply(conn, actor, before, data)
        row = _decide(conn, actor, before, "APPROVED", data, project["project_id"] if project else None)
    return {"request": row, "project": project}


def reject_request(conn: psycopg.Connection, actor: Actor, request_id: int, data: dict) -> dict:
    """Mark the request rejected, with an optional note, and tell the asker. Nothing else changes."""
    values.only_allowed(data, {"decision_note"})
    with atomic(conn):
        return _decide(conn, actor, _pending(conn, actor, request_id), "REJECTED", data)


def _apply(conn: psycopg.Connection, actor: Actor, req: dict, data: dict) -> dict | None:
    """Make the change through the existing service; return the new project for NEW_PROJECT."""
    kind, asker = req["kind"], req["requested_by"]
    if kind == "NEW_PROJECT":
        return _create_project(conn, actor, req, data)
    if kind == "ARCHIVE_PROJECT":
        projects.archive_project(conn, actor, req["project_id"])
    elif kind == "TASK_LIMIT":
        current = conn.execute("SELECT task_limit FROM users WHERE user_id = %s", (asker,)).fetchone()["task_limit"]
        if current >= req["task_limit"]:  # limit was raised since; approving must never lower it
            raise Conflict(f"{req['requester_name']}'s task limit is already {current}.")
        users.set_capacity(conn, actor, asker, {"task_limit": req["task_limit"]})
    elif kind == "OVERTIME":
        users.set_capacity(conn, actor, asker, {"overtime_allowed": True})
    return None  # OTHER: the decision is the answer


def _create_project(conn: psycopg.Connection, actor: Actor, req: dict, data: dict) -> dict:
    """The project a NEW_PROJECT request asks for, managed by the asker; dates default to the proposed ones."""
    start = values.date(data, "start_date", required=False) or req["proposed_start"]
    end = values.date(data, "predicted_end_date", required=False) or req["proposed_end"]
    if start is None:
        raise ValidationError("A start date is required to approve.", field="start_date")
    if end is None:
        raise ValidationError("An end date is required to approve.", field="predicted_end_date")
    clean = {"name": req["name"], "description": req["description"], "manager_id": req["requested_by"],
             "start_date": start, "predicted_end_date": end,
             "budget_cents": money.cents(data, "budget_cents", required=False) or 0}
    projects._check(conn, clean)
    return projects._insert(conn, actor, clean)


def _decide(conn: psycopg.Connection, actor: Actor, before: dict, status: str, data: dict,
            project_id: int | None = None) -> dict:
    """Record the decision and its audit row; `also_notify` tells the asker."""
    row = conn.execute("UPDATE project_requests SET status = %s, decided_by = %s, decided_at = now(),"
                       " decision_note = %s, created_project_id = %s WHERE request_id = %s RETURNING *",
                       (status, actor.user_id, values.text(data, "decision_note", required=False, max_length=2000),
                        project_id, before["request_id"])).fetchone()
    action = "APPROVE" if status == "APPROVED" else "REJECT"
    audit.record_change(conn, actor, action, "project_requests", row["request_id"], request_view(before),
                        request_view(row),
                        f"{actor.name} {status.lower()} {before['requester_name']}'s request: {row['name']}",
                        also_notify=row["requested_by"])
    return row
