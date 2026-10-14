"""One small function per route: read the request, call one service, shape the answer.

No business rules live here; they are in services/, where the tests reach them
without HTTP. Each handler takes a Context and returns the JSON payload.
"""

import datetime as dt
from dataclasses import dataclass

import psycopg

from api.http import Request, camelize
from domain.errors import ValidationError
from services import (assignments, audit, dashboard, milestones, notifications, projects, requests, tasks,
                      time_entries, tokens, users)
from services.actors import Actor
from services.views import (audit_view, booking_view, entry_view, holder_view, milestone_view, notification_view, project_view,
                            request_view, task_view, user_view)


@dataclass
class Context:
    conn: psycopg.Connection
    request: Request
    actor: Actor | None
    params: dict
    secret: str
    now: dt.datetime

    @property
    def id(self) -> int:
        return self.params["id"]

    @property
    def body(self) -> dict:
        return self.request.body

    @property
    def query(self) -> dict:
        return self.request.query

    def page_args(self) -> tuple[int, int]:
        return self.query.get("page", 1), self.query.get("page_size", 20)


def _page(result: dict, view) -> dict:
    return {"items": [view(r) for r in result["items"]], "page": result["page"], "pageSize": result["page_size"],
            "total": result["total"], "totalPages": result["total_pages"]}


def _whole(items: list, view) -> dict:
    """A short list that is never paginated, in the same envelope as paginated ones."""
    return {"items": [view(r) for r in items], "page": 1, "pageSize": len(items), "total": len(items),
            "totalPages": 1 if items else 0}


def _user(ctx: Context, row: dict) -> dict:
    return user_view(row, include_salary=users.can_see_salary(ctx.actor, row))


# --- health and auth --------------------------------------------------------------

def health(ctx: Context) -> dict:
    ctx.conn.execute("SELECT 1")
    return {"status": "ok"}


def login(ctx: Context) -> dict:
    result = users.login(ctx.conn, ctx.body, ctx.secret, ctx.now)
    return {"token": result["token"], "expiresAt": (ctx.now + tokens.LIFETIME).isoformat(),
            "user": user_view(result["user"], include_salary=True)}


def me(ctx: Context) -> dict:
    return user_view(users.get_user(ctx.conn, ctx.actor, ctx.actor.user_id), include_salary=True)


def change_password(ctx: Context) -> dict:
    return user_view(users.change_password(ctx.conn, ctx.actor, ctx.body, ctx.now), include_salary=True)


# --- users ----------------------------------------------------------------------

def list_users(ctx: Context) -> dict:
    return _page(users.list_users(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), lambda r: _user(ctx, r))


def create_user(ctx: Context) -> dict:
    row, password = users.create_user(ctx.conn, ctx.actor, ctx.body)
    return {"user": user_view(row, include_salary=True), "temporaryPassword": password}


def get_user(ctx: Context) -> dict:
    return _user(ctx, users.get_user(ctx.conn, ctx.actor, ctx.id))


def update_me(ctx: Context) -> dict:
    return user_view(users.update_self(ctx.conn, ctx.actor, ctx.body), include_salary=True)


def admin_update_user(ctx: Context) -> dict:
    return user_view(users.admin_update(ctx.conn, ctx.actor, ctx.id, ctx.body), include_salary=True)


def set_capacity(ctx: Context) -> dict:
    return _user(ctx, users.set_capacity(ctx.conn, ctx.actor, ctx.id, ctx.body))


def reset_password(ctx: Context) -> dict:
    return {"temporaryPassword": users.reset_password(ctx.conn, ctx.actor, ctx.id, ctx.now)}


def archive_user(ctx: Context) -> dict:
    return user_view(users.archive_user(ctx.conn, ctx.actor, ctx.id), include_salary=True)


def reactivate_user(ctx: Context) -> dict:
    return user_view(users.reactivate_user(ctx.conn, ctx.actor, ctx.id), include_salary=True)


# --- projects and bookings ----------------------------------------------------------

def list_projects(ctx: Context) -> dict:
    return _page(projects.list_projects(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), project_view)


def create_project(ctx: Context) -> dict:
    return project_view(projects.create_project(ctx.conn, ctx.actor, ctx.body))


def get_project(ctx: Context) -> dict:
    return project_view(projects.get_project(ctx.conn, ctx.actor, ctx.id))


def update_project(ctx: Context) -> dict:
    return project_view(projects.update_project(ctx.conn, ctx.actor, ctx.id, ctx.body))


def archive_project(ctx: Context) -> dict:
    return project_view(projects.archive_project(ctx.conn, ctx.actor, ctx.id))


def reactivate_project(ctx: Context) -> dict:
    return project_view(projects.reactivate_project(ctx.conn, ctx.actor, ctx.id))


def project_budget(ctx: Context) -> dict:
    return camelize(dashboard.project_budget(ctx.conn, ctx.actor, ctx.id))


def dependency_graph(ctx: Context) -> dict:
    graph = milestones.dependency_graph(ctx.conn, ctx.actor, ctx.id)
    return {"nodes": [milestone_view(n) for n in graph["nodes"]], "edges": graph["edges"]}


def list_bookings(ctx: Context) -> dict:
    return _whole(assignments.list_bookings(ctx.conn, ctx.actor, ctx.id), booking_view)


def create_booking(ctx: Context) -> dict:
    return booking_view(assignments.create_booking(ctx.conn, ctx.actor, ctx.id, ctx.body))


def update_booking(ctx: Context) -> dict:
    return booking_view(assignments.update_booking(ctx.conn, ctx.actor, ctx.id, ctx.body))


def archive_booking(ctx: Context) -> dict:
    return booking_view(assignments.archive_booking(ctx.conn, ctx.actor, ctx.id))


# --- deliverables and dependencies ------------------------------------------------------

def list_milestones(ctx: Context) -> dict:
    return _whole(milestones.list_milestones(ctx.conn, ctx.actor, ctx.id), milestone_view)


def create_milestone(ctx: Context) -> dict:
    return milestone_view(milestones.create_milestone(ctx.conn, ctx.actor, ctx.id, ctx.body))


def get_milestone(ctx: Context) -> dict:
    return milestone_view(milestones.get_milestone(ctx.conn, ctx.actor, ctx.id))


def update_milestone(ctx: Context) -> dict:
    return milestone_view(milestones.update_milestone(ctx.conn, ctx.actor, ctx.id, ctx.body))


def archive_milestone(ctx: Context) -> dict:
    return milestone_view(milestones.archive_milestone(ctx.conn, ctx.actor, ctx.id))


def reactivate_milestone(ctx: Context) -> dict:
    return milestone_view(milestones.reactivate_milestone(ctx.conn, ctx.actor, ctx.id))


def sign_off(ctx: Context) -> dict:
    return milestone_view(milestones.sign_off(ctx.conn, ctx.actor, ctx.id))


def reopen(ctx: Context) -> dict:
    return milestone_view(milestones.reopen_milestone(ctx.conn, ctx.actor, ctx.id))


def add_dependency(ctx: Context) -> dict:
    depends_on = ctx.body.get("depends_on_milestone_id")
    if isinstance(depends_on, bool) or not isinstance(depends_on, int):
        raise ValidationError("dependsOnMilestoneId must be a deliverable id.", field="depends_on_milestone_id")
    return milestone_view(milestones.add_dependency(ctx.conn, ctx.actor, ctx.id, depends_on))


def remove_dependency(ctx: Context) -> dict:
    return milestone_view(milestones.remove_dependency(ctx.conn, ctx.actor, ctx.id, ctx.params["other_id"]))


# --- tasks and time -------------------------------------------------------------------------

def list_tasks(ctx: Context) -> dict:
    return _whole(tasks.list_tasks(ctx.conn, ctx.actor, ctx.id), task_view)


def create_task(ctx: Context) -> dict:
    return task_view(tasks.create_task(ctx.conn, ctx.actor, ctx.id, ctx.body))


def update_task(ctx: Context) -> dict:
    return task_view(tasks.update_task(ctx.conn, ctx.actor, ctx.id, ctx.body))


def move_task(ctx: Context) -> dict:
    return task_view(tasks.move_task(ctx.conn, ctx.actor, ctx.id, ctx.body.get("status")))


def claim_task(ctx: Context) -> dict:
    return task_view(tasks.claim_task(ctx.conn, ctx.actor, ctx.id))


def release_task(ctx: Context) -> dict:
    return task_view(tasks.release_task(ctx.conn, ctx.actor, ctx.id))


def board(ctx: Context) -> dict:
    result = tasks.board(ctx.conn, ctx.actor, ctx.id)
    return {**_whole(result["items"], task_view), "people": [holder_view(p) for p in result["people"]]}


def ready_tasks(ctx: Context) -> dict:
    result = tasks.ready_tasks(ctx.conn, ctx.actor)
    return {**_whole(result["items"], task_view), "held": result["held"], "limit": result["limit"]}


def archive_task(ctx: Context) -> dict:
    return task_view(tasks.archive_task(ctx.conn, ctx.actor, ctx.id))


def reactivate_task(ctx: Context) -> dict:
    return task_view(tasks.reactivate_task(ctx.conn, ctx.actor, ctx.id))


def my_tasks(ctx: Context) -> dict:
    return _whole(tasks.my_tasks(ctx.conn, ctx.actor), task_view)


def log_time(ctx: Context) -> dict:
    return entry_view(time_entries.log_time(ctx.conn, ctx.actor, ctx.id, ctx.body))


def my_time(ctx: Context) -> dict:
    return _page(time_entries.my_entries(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), entry_view)


def edit_time(ctx: Context) -> dict:
    return entry_view(time_entries.edit_entry(ctx.conn, ctx.actor, ctx.id, ctx.body))


def approve_time(ctx: Context) -> dict:
    return entry_view(time_entries.decide_entry(ctx.conn, ctx.actor, ctx.id, approve=True))


def reject_time(ctx: Context) -> dict:
    return entry_view(time_entries.decide_entry(ctx.conn, ctx.actor, ctx.id, approve=False))


def pending_time(ctx: Context) -> dict:
    return _page(time_entries.pending_approvals(ctx.conn, ctx.actor, *ctx.page_args()), entry_view)


# --- project requests ---------------------------------------------------------------------

def list_requests(ctx: Context) -> dict:
    return _page(requests.list_requests(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), request_view)


def create_request(ctx: Context) -> dict:
    return request_view(requests.create_request(ctx.conn, ctx.actor, ctx.body))


def get_request(ctx: Context) -> dict:
    return request_view(requests.get_request(ctx.conn, ctx.actor, ctx.id))


def approve_request(ctx: Context) -> dict:
    result = requests.approve_request(ctx.conn, ctx.actor, ctx.id, ctx.body)
    project = result["project"]  # only a NEW_PROJECT request creates one
    return {"request": request_view(result["request"]), "project": project_view(project) if project else None}


def reject_request(ctx: Context) -> dict:
    return request_view(requests.reject_request(ctx.conn, ctx.actor, ctx.id, ctx.body))


# --- dashboard, admin, notifications --------------------------------------------------------

def project_cards(ctx: Context) -> dict:
    return _page(dashboard.project_cards(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), camelize)


def at_risk(ctx: Context) -> dict:
    return _whole(dashboard.at_risk(ctx.conn, ctx.actor), camelize)


def allocation(ctx: Context) -> dict:
    result = dashboard.allocation(ctx.conn, ctx.actor, ctx.query, *ctx.page_args())
    return {**_page(result, camelize), "weeks": result["weeks"]}


def integrity_check(ctx: Context) -> dict:
    return camelize(dashboard.integrity_check(ctx.conn, ctx.actor))


def audit_log(ctx: Context) -> dict:
    return _page(audit.list_audit(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), audit_view)


def list_notifications(ctx: Context) -> dict:
    result = notifications.list_notifications(ctx.conn, ctx.actor, ctx.query.get("unread", False), *ctx.page_args())
    return _page(result, notification_view)


def unread_count(ctx: Context) -> dict:
    return {"count": notifications.unread_count(ctx.conn, ctx.actor)}


def mark_read(ctx: Context) -> dict:
    return notification_view(notifications.mark_read(ctx.conn, ctx.actor, ctx.id))


def read_all(ctx: Context) -> dict:
    return {"updated": notifications.read_all(ctx.conn, ctx.actor)}
