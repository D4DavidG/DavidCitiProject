"""The route table: every endpoint, who may call it, and what it returns.

This list is the whole authorisation configuration, readable at a glance and
read by one function (app.authorise). Roles here are the coarse gate ("this
role can never do this", 403). The services add the fine rules ("only your own
projects", 404).

There is no DELETE anywhere: records are archived and reactivated.
tests/backend/test_api.py checks that, checks every non-public route demands a
token, and test_api_audit_walk.py checks every write route leaves an audit row.
"""

import re
from dataclasses import dataclass, field
from typing import Callable

from api import handlers as h
from api.errors import MethodNotAllowed
from domain.errors import NotFound

ADMIN, MANAGER, EMPLOYEE = "ADMIN", "MANAGER", "EMPLOYEE"
STAFF = frozenset({ADMIN, MANAGER})
ANY = None  # any signed-in user


@dataclass(frozen=True)
class Route:
    method: str
    path: str
    handler: Callable
    roles: frozenset | None = ANY
    status: int = 200
    public: bool = False
    allowed_before_password_change: bool = False
    pattern: re.Pattern = field(init=False, compare=False)

    def __post_init__(self):
        regex = re.sub(r"\{(\w+)\}", r"(?P<\1>\\d+)", self.path)
        object.__setattr__(self, "pattern", re.compile(f"^{regex}$"))


def _r(method, path, handler, roles=ANY, **kw):
    return Route(method, path, handler, frozenset(roles) if roles else ANY, **kw)


ROUTES = [
    _r("GET", "/health", h.health, public=True),
    _r("POST", "/auth/login", h.login, public=True),
    _r("GET", "/auth/me", h.me, allowed_before_password_change=True),
    _r("POST", "/auth/change-password", h.change_password, allowed_before_password_change=True),

    _r("GET", "/users", h.list_users, STAFF),
    _r("POST", "/users", h.create_user, {ADMIN}, status=201),
    _r("PATCH", "/users/me", h.update_me),
    _r("GET", "/users/{id}", h.get_user),
    _r("PATCH", "/users/{id}", h.admin_update_user, {ADMIN}),
    _r("PATCH", "/users/{id}/capacity", h.set_capacity, STAFF),
    _r("POST", "/users/{id}/reset-password", h.reset_password, {ADMIN}),
    _r("POST", "/users/{id}/archive", h.archive_user, {ADMIN}),
    _r("POST", "/users/{id}/reactivate", h.reactivate_user, {ADMIN}),

    _r("GET", "/projects", h.list_projects),
    _r("POST", "/projects", h.create_project, {ADMIN}, status=201),
    _r("GET", "/projects/{id}", h.get_project),
    _r("PATCH", "/projects/{id}", h.update_project, STAFF),
    _r("POST", "/projects/{id}/archive", h.archive_project, {ADMIN}),
    _r("POST", "/projects/{id}/reactivate", h.reactivate_project, {ADMIN}),
    _r("GET", "/projects/{id}/budget", h.project_budget, STAFF),
    _r("GET", "/projects/{id}/dependency-graph", h.dependency_graph),
    _r("GET", "/projects/{id}/board", h.board),

    _r("GET", "/projects/{id}/assignments", h.list_bookings),
    _r("POST", "/projects/{id}/assignments", h.create_booking, STAFF, status=201),
    _r("PATCH", "/assignments/{id}", h.update_booking, STAFF),
    _r("POST", "/assignments/{id}/archive", h.archive_booking, STAFF),

    _r("GET", "/projects/{id}/milestones", h.list_milestones),
    _r("POST", "/projects/{id}/milestones", h.create_milestone, STAFF, status=201),
    _r("GET", "/milestones/{id}", h.get_milestone),
    _r("PATCH", "/milestones/{id}", h.update_milestone, STAFF),
    _r("POST", "/milestones/{id}/archive", h.archive_milestone, STAFF),
    _r("POST", "/milestones/{id}/reactivate", h.reactivate_milestone, STAFF),
    _r("POST", "/milestones/{id}/sign-off", h.sign_off, STAFF),
    _r("POST", "/milestones/{id}/reopen", h.reopen, STAFF),
    _r("POST", "/milestones/{id}/dependencies", h.add_dependency, STAFF),
    _r("POST", "/milestones/{id}/dependencies/{other_id}/archive", h.remove_dependency, STAFF),

    _r("GET", "/milestones/{id}/tasks", h.list_tasks),
    _r("POST", "/milestones/{id}/tasks", h.create_task, STAFF, status=201),
    _r("PATCH", "/tasks/{id}", h.update_task, STAFF),
    _r("POST", "/tasks/{id}/status", h.move_task, {EMPLOYEE}),
    _r("POST", "/tasks/{id}/claim", h.claim_task, {EMPLOYEE}),
    _r("POST", "/tasks/{id}/release", h.release_task, {EMPLOYEE}),
    _r("POST", "/tasks/{id}/archive", h.archive_task, STAFF),
    _r("POST", "/tasks/{id}/reactivate", h.reactivate_task, STAFF),
    _r("GET", "/me/tasks", h.my_tasks),
    _r("GET", "/me/ready-tasks", h.ready_tasks, {EMPLOYEE}),

    _r("POST", "/tasks/{id}/time-entries", h.log_time, {EMPLOYEE}, status=201),
    _r("GET", "/me/time-entries", h.my_time),
    _r("PATCH", "/time-entries/{id}", h.edit_time, {EMPLOYEE}),
    _r("POST", "/time-entries/{id}/approve", h.approve_time, STAFF),
    _r("POST", "/time-entries/{id}/reject", h.reject_time, STAFF),
    _r("GET", "/approvals/time-entries", h.pending_time, STAFF),

    # Requests of every kind; the service says which kinds a role sends and who decides.
    _r("GET", "/project-requests", h.list_requests),
    _r("POST", "/project-requests", h.create_request, status=201),
    _r("GET", "/project-requests/{id}", h.get_request),
    _r("POST", "/project-requests/{id}/approve", h.approve_request, STAFF),
    _r("POST", "/project-requests/{id}/reject", h.reject_request, STAFF),

    _r("GET", "/dashboard/projects", h.project_cards, STAFF),
    _r("GET", "/dashboard/at-risk", h.at_risk, STAFF),
    _r("GET", "/dashboard/allocation", h.allocation, STAFF),
    _r("GET", "/admin/integrity-check", h.integrity_check, {ADMIN}),
    _r("GET", "/admin/audit-log", h.audit_log, {ADMIN}),

    _r("GET", "/notifications", h.list_notifications),
    _r("GET", "/notifications/unread-count", h.unread_count),
    _r("POST", "/notifications/read-all", h.read_all),
    _r("POST", "/notifications/{id}/read", h.mark_read),
]


def match(method: str, path: str) -> tuple[Route, dict]:
    """Find the route for this method and path; 404 if no path matches, 405 if only the method is wrong."""
    path_matched = False
    for route in ROUTES:
        found = route.pattern.match(path)
        if found:
            path_matched = True
            if route.method == method:
                return route, {k: int(v) for k, v in found.groupdict().items()}
    if path_matched:
        raise MethodNotAllowed(f"{method} is not allowed on {path}.")
    raise NotFound("No such endpoint.")
