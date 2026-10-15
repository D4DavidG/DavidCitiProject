"""One small function per route: read the request, call one service, shape the answer.

No business rules live here; they are in services/, where the tests reach them
without HTTP. Each handler takes a Context and returns the JSON payload.
"""

import datetime as dt
from dataclasses import dataclass

import psycopg

from api.http import Request, camelize
from domain.errors import ValidationError
from services import (assignments, audit, dashboard, milestones, notifications, projects, requests, sessions,
                      tasks, time_entries, tokens, users)
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

    def page_args(self, default_size: int = 20) -> tuple[int, int]:
        return self.query.get("page", 1), self.query.get("page_size", default_size)


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
    """Check the API and the database are up."""
    ctx.conn.execute("SELECT 1")
    return {"status": "ok"}


def _session_view(ctx: Context, session: dict, row: dict | None = None) -> dict:
    """The answer to login, refresh and change-password: both tokens, and the user if given."""
    view = {"token": session["token"], "expiresAt": (ctx.now + tokens.LIFETIME).isoformat(),
            "refreshToken": session["refresh_token"]}
    if row is not None:
        view["user"] = user_view(row, include_salary=True)
    return view


def login(ctx: Context) -> dict:
    """Log in with username and password; get a 15-minute token and a refresh token."""
    result = users.login(ctx.conn, ctx.body, ctx.secret, ctx.now)
    return _session_view(ctx, result, result["user"])


def refresh(ctx: Context) -> dict:
    """Trade a refresh token for a new token pair."""
    return _session_view(ctx, sessions.rotate(ctx.conn, ctx.body.get("refresh_token"), ctx.secret, ctx.now))


def logout(ctx: Context) -> None:
    """End the session that owns this refresh token."""
    sessions.end(ctx.conn, ctx.body.get("refresh_token"), ctx.now)


def me(ctx: Context) -> dict:
    """Get your own account."""
    return user_view(users.get_user(ctx.conn, ctx.actor, ctx.actor.user_id), include_salary=True)


def change_password(ctx: Context) -> dict:
    """Change your password (required on first login); get a new token pair."""
    row, session = users.change_password(ctx.conn, ctx.actor, ctx.body, ctx.secret, ctx.now)
    return _session_view(ctx, session, row)


# --- users ----------------------------------------------------------------------

def list_users(ctx: Context) -> dict:
    """List people, with search and filters."""
    return _page(users.list_users(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), lambda r: _user(ctx, r))


def create_user(ctx: Context) -> dict:
    """Create an account; the answer shows the generated password once."""
    row, password = users.create_user(ctx.conn, ctx.actor, ctx.body)
    return {"user": user_view(row, include_salary=True), "temporaryPassword": password}


def get_user(ctx: Context) -> dict:
    """Get one person."""
    return _user(ctx, users.get_user(ctx.conn, ctx.actor, ctx.id))


def user_history(ctx: Context) -> dict:
    """One person's trail; only admins get the before/after state."""
    return _page(audit.person_history(ctx.conn, ctx.actor, ctx.id, ctx.query, *ctx.page_args()),
                 lambda r: audit_view(r, include_states=ctx.actor.is_admin))


def update_me(ctx: Context) -> dict:
    """Change your own name or email."""
    return user_view(users.update_self(ctx.conn, ctx.actor, ctx.body), include_salary=True)


def admin_update_user(ctx: Context) -> dict:
    """Change a person's account details (admin)."""
    return user_view(users.admin_update(ctx.conn, ctx.actor, ctx.id, ctx.body), include_salary=True)


def set_capacity(ctx: Context) -> dict:
    """Set a person's weekly capacity, overtime and task limit."""
    return _user(ctx, users.set_capacity(ctx.conn, ctx.actor, ctx.id, ctx.body))


def reset_password(ctx: Context) -> dict:
    """Reset a person's password; the answer shows the new one once."""
    return {"temporaryPassword": users.reset_password(ctx.conn, ctx.actor, ctx.id, ctx.now)}


def archive_user(ctx: Context) -> dict:
    """Archive a person (there is no delete)."""
    return user_view(users.archive_user(ctx.conn, ctx.actor, ctx.id, ctx.now), include_salary=True)


def reactivate_user(ctx: Context) -> dict:
    """Reactivate an archived person."""
    return user_view(users.reactivate_user(ctx.conn, ctx.actor, ctx.id), include_salary=True)


# --- projects and bookings ----------------------------------------------------------

def list_projects(ctx: Context) -> dict:
    """List projects, with search and filters."""
    return _page(projects.list_projects(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), project_view)


def create_project(ctx: Context) -> dict:
    """Create a project."""
    return project_view(projects.create_project(ctx.conn, ctx.actor, ctx.body))


def get_project(ctx: Context) -> dict:
    """Get one project."""
    return project_view(projects.get_project(ctx.conn, ctx.actor, ctx.id))


def update_project(ctx: Context) -> dict:
    """Change a project's details or budget."""
    return project_view(projects.update_project(ctx.conn, ctx.actor, ctx.id, ctx.body))


def archive_project(ctx: Context) -> dict:
    """Archive a project (there is no delete)."""
    return project_view(projects.archive_project(ctx.conn, ctx.actor, ctx.id))


def reactivate_project(ctx: Context) -> dict:
    """Reactivate an archived project."""
    return project_view(projects.reactivate_project(ctx.conn, ctx.actor, ctx.id))


def project_budget(ctx: Context) -> dict:
    """Get a project's budget: planned and consumed cost against the budget."""
    return camelize(dashboard.project_budget(ctx.conn, ctx.actor, ctx.id))


def dependency_graph(ctx: Context) -> dict:
    """Get a project's Deliverables and the dependencies between them."""
    graph = milestones.dependency_graph(ctx.conn, ctx.actor, ctx.id)
    return {"nodes": [milestone_view(n) for n in graph["nodes"]], "edges": graph["edges"]}


def list_bookings(ctx: Context) -> dict:
    """List a project's Resources (bookings: person x hours per week)."""
    return _whole(assignments.list_bookings(ctx.conn, ctx.actor, ctx.id), booking_view)


def create_booking(ctx: Context) -> dict:
    """Book a person onto a project (a Resource)."""
    return booking_view(assignments.create_booking(ctx.conn, ctx.actor, ctx.id, ctx.body))


def update_booking(ctx: Context) -> dict:
    """Change a booking's hours or dates."""
    return booking_view(assignments.update_booking(ctx.conn, ctx.actor, ctx.id, ctx.body))


def archive_booking(ctx: Context) -> dict:
    """Archive a booking (there is no delete)."""
    return booking_view(assignments.archive_booking(ctx.conn, ctx.actor, ctx.id))


# --- deliverables and dependencies ------------------------------------------------------

def list_milestones(ctx: Context) -> dict:
    """List a project's Deliverables."""
    return _whole(milestones.list_milestones(ctx.conn, ctx.actor, ctx.id), milestone_view)


def create_milestone(ctx: Context) -> dict:
    """Add a Deliverable to a project."""
    return milestone_view(milestones.create_milestone(ctx.conn, ctx.actor, ctx.id, ctx.body))


def get_milestone(ctx: Context) -> dict:
    """Get one Deliverable."""
    return milestone_view(milestones.get_milestone(ctx.conn, ctx.actor, ctx.id))


def update_milestone(ctx: Context) -> dict:
    """Change a Deliverable's details."""
    return milestone_view(milestones.update_milestone(ctx.conn, ctx.actor, ctx.id, ctx.body))


def archive_milestone(ctx: Context) -> dict:
    """Archive a Deliverable (there is no delete)."""
    return milestone_view(milestones.archive_milestone(ctx.conn, ctx.actor, ctx.id))


def reactivate_milestone(ctx: Context) -> dict:
    """Reactivate an archived Deliverable."""
    return milestone_view(milestones.reactivate_milestone(ctx.conn, ctx.actor, ctx.id))


def sign_off(ctx: Context) -> dict:
    """Sign off a Deliverable (refused until its tasks and dependencies are done)."""
    return milestone_view(milestones.sign_off(ctx.conn, ctx.actor, ctx.id))


def reopen(ctx: Context) -> dict:
    """Reopen a signed-off Deliverable."""
    return milestone_view(milestones.reopen_milestone(ctx.conn, ctx.actor, ctx.id))


def add_dependency(ctx: Context) -> dict:
    """Make a Deliverable depend on another one (loops are refused)."""
    depends_on = ctx.body.get("depends_on_milestone_id")
    if isinstance(depends_on, bool) or not isinstance(depends_on, int):
        raise ValidationError("dependsOnMilestoneId must be a deliverable id.", field="depends_on_milestone_id")
    return milestone_view(milestones.add_dependency(ctx.conn, ctx.actor, ctx.id, depends_on))


def remove_dependency(ctx: Context) -> dict:
    """Remove a dependency between two Deliverables."""
    return milestone_view(milestones.remove_dependency(ctx.conn, ctx.actor, ctx.id, ctx.params["other_id"]))


# --- tasks and time -------------------------------------------------------------------------

def list_tasks(ctx: Context) -> dict:
    """List a Deliverable's tasks."""
    return _whole(tasks.list_tasks(ctx.conn, ctx.actor, ctx.id), task_view)


def create_task(ctx: Context) -> dict:
    """Add a task to a Deliverable."""
    return task_view(tasks.create_task(ctx.conn, ctx.actor, ctx.id, ctx.body))


def update_task(ctx: Context) -> dict:
    """Change a task's title, description, estimate or assignee."""
    return task_view(tasks.update_task(ctx.conn, ctx.actor, ctx.id, ctx.body))


def move_task(ctx: Context) -> dict:
    """Move your task to To Do, In Progress or Done."""
    return task_view(tasks.move_task(ctx.conn, ctx.actor, ctx.id, ctx.body.get("status")))


def claim_task(ctx: Context) -> dict:
    """Take a Ready task from the pull board (up to your task limit)."""
    return task_view(tasks.claim_task(ctx.conn, ctx.actor, ctx.id))


def release_task(ctx: Context) -> dict:
    """Put your task back on the pull board."""
    return task_view(tasks.release_task(ctx.conn, ctx.actor, ctx.id))


def board(ctx: Context) -> dict:
    """Get a project's pull board: its tasks and who holds them."""
    result = tasks.board(ctx.conn, ctx.actor, ctx.id)
    return {**_whole(result["items"], task_view), "people": [holder_view(p) for p in result["people"]]}


def ready_tasks(ctx: Context) -> dict:
    """List the Ready tasks you can take, with how many you hold and your limit."""
    result = tasks.ready_tasks(ctx.conn, ctx.actor, ctx.query)
    return {**_whole(result["items"], task_view), "held": result["held"], "limit": result["limit"]}


def archive_task(ctx: Context) -> dict:
    """Archive a task (there is no delete)."""
    return task_view(tasks.archive_task(ctx.conn, ctx.actor, ctx.id))


def reactivate_task(ctx: Context) -> dict:
    """Reactivate an archived task."""
    return task_view(tasks.reactivate_task(ctx.conn, ctx.actor, ctx.id))


def my_tasks(ctx: Context) -> dict:
    """List the tasks assigned to you."""
    return _whole(tasks.my_tasks(ctx.conn, ctx.actor, ctx.query), task_view)


def log_time(ctx: Context) -> dict:
    """Log time on your task."""
    return entry_view(time_entries.log_time(ctx.conn, ctx.actor, ctx.id, ctx.body))


def my_time(ctx: Context) -> dict:
    """List the time you have logged."""
    return _page(time_entries.my_entries(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), entry_view)


def edit_time(ctx: Context) -> dict:
    """Change your own time entry; it goes back to pending approval."""
    return entry_view(time_entries.edit_entry(ctx.conn, ctx.actor, ctx.id, ctx.body))


def approve_time(ctx: Context) -> dict:
    """Approve a time entry (never your own)."""
    return entry_view(time_entries.decide_entry(ctx.conn, ctx.actor, ctx.id, approve=True))


def reject_time(ctx: Context) -> dict:
    """Reject a time entry (never your own)."""
    return entry_view(time_entries.decide_entry(ctx.conn, ctx.actor, ctx.id, approve=False))


def pending_time(ctx: Context) -> dict:
    """List the time entries waiting for your approval."""
    return _page(time_entries.pending_approvals(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), entry_view)


# --- project requests ---------------------------------------------------------------------

def list_requests(ctx: Context) -> dict:
    """List the requests you sent or may decide."""
    return _page(requests.list_requests(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), request_view)


def create_request(ctx: Context) -> dict:
    """Send a request (new project, archive, task limit, overtime or other)."""
    return request_view(requests.create_request(ctx.conn, ctx.actor, ctx.body))


def get_request(ctx: Context) -> dict:
    """Get one request."""
    return request_view(requests.get_request(ctx.conn, ctx.actor, ctx.id))


def approve_request(ctx: Context) -> dict:
    """Approve a request; the change it asks for is applied at once."""
    result = requests.approve_request(ctx.conn, ctx.actor, ctx.id, ctx.body)
    project = result["project"]  # only a NEW_PROJECT request creates one
    return {"request": request_view(result["request"]), "project": project_view(project) if project else None}


def reject_request(ctx: Context) -> dict:
    """Reject a request, with an optional note."""
    return request_view(requests.reject_request(ctx.conn, ctx.actor, ctx.id, ctx.body))


# --- dashboard, admin, notifications --------------------------------------------------------

def project_cards(ctx: Context) -> dict:
    """Get the dashboard: each project's status, risk and budget, at risk first."""
    result = dashboard.project_cards(ctx.conn, ctx.actor, ctx.query, *ctx.page_args())
    return {**_page(result, camelize), "atRiskTotal": result["at_risk_total"]}


def at_risk(ctx: Context) -> dict:
    """List the projects at risk of missing a deadline."""
    return _whole(dashboard.at_risk(ctx.conn, ctx.actor), camelize)


def allocation(ctx: Context) -> dict:
    """Get the allocation grid: people x weeks, flagged past capacity."""
    result = dashboard.allocation(ctx.conn, ctx.actor, ctx.query, *ctx.page_args())
    return {**_page(result, camelize), "weeks": result["weeks"]}


def timeline(ctx: Context) -> dict:
    """Get a timeline of your projects: their dates, Deliverables and bookings."""
    return _page(dashboard.timeline(ctx.conn, ctx.actor, *ctx.page_args(default_size=10)), camelize)


def integrity_check(ctx: Context) -> dict:
    """Run the integrity queries; every list must be empty."""
    return camelize(dashboard.integrity_check(ctx.conn, ctx.actor))


def audit_log(ctx: Context) -> dict:
    """List the audit log, with filters by actor, entity and date."""
    return _page(audit.list_audit(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), audit_view)


def list_notifications(ctx: Context) -> dict:
    """List your notifications."""
    return _page(notifications.list_notifications(ctx.conn, ctx.actor, ctx.query, *ctx.page_args()), notification_view)


def unread_count(ctx: Context) -> dict:
    """Count your unread notifications."""
    return {"count": notifications.unread_count(ctx.conn, ctx.actor)}


def mark_read(ctx: Context) -> dict:
    """Mark one of your notifications as read."""
    return notification_view(notifications.mark_read(ctx.conn, ctx.actor, ctx.id))


def read_all(ctx: Context) -> dict:
    """Mark all your notifications as read."""
    return {"updated": notifications.read_all(ctx.conn, ctx.actor)}
