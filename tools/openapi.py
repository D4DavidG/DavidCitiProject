"""Build docs/openapi.json, the API file Postman and SwaggerHub import, from the route table.

Every operation comes from backend/tracker/api/routes.py: its path, method, roles,
status code and (from the handler's docstring) its one-line summary. Request bodies
and filters are listed by hand below; tests/backend/test_openapi.py checks them
against the services and fails when the saved file differs from a fresh build.

Run after any route change:  .venv/bin/python tools/openapi.py
"""

import inspect
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "tracker"))

from api import routes  # noqa: E402  (needs the path above)

OUT = ROOT / "docs" / "openapi.json"

SERVERS = [
    {"url": "http://localhost:3001/api/tracker", "description": "Local: the proxy started by bin/start-dev.sh"},
    {"url": "https://d1gov8jpsxhwer.cloudfront.net/api/tracker", "description": "AWS: CloudFront"},
]

ERROR = {"$ref": "#/components/responses/Error"}

# Field types, as each service validates them (values.integer, values.boolean, values.date, values.text).
INT, BOOL, TEXT, DATE = {"type": "integer"}, {"type": "boolean"}, {"type": "string"}, {"type": "string", "format": "date"}

_PROFILE = {"firstName": TEXT, "lastName": TEXT, "email": TEXT}
_CAPACITY = {"weeklyCapacityHours": INT, "overtimeAllowed": BOOL, "taskLimit": INT}
_USER = {**_PROFILE, "jobTitle": TEXT, "role": TEXT, "managerId": INT, "annualSalaryCents": INT, **_CAPACITY}
_PROJECT = {"name": TEXT, "description": TEXT, "managerId": INT, "startDate": DATE, "predictedEndDate": DATE,
            "budgetCents": INT, "status": TEXT}
_BOOKING = {"hoursPerWeek": INT, "startDate": DATE, "endDate": DATE}
_MILESTONE = {"name": TEXT, "description": TEXT, "startDate": DATE, "dueDate": DATE, "sortOrder": INT}
_TASK = {"title": TEXT, "description": TEXT, "estimateMinutes": INT, "assigneeUserId": INT}
_TIME = {"workDate": DATE, "minutes": INT, "note": TEXT, "confirmOverCapacity": BOOL}

# Request bodies: handler name -> {camelCase field: type}. A test checks this list against
# the handlers that read ctx.body and against the services' allow-lists.
BODIES = {
    "login": {"username": TEXT, "password": TEXT},
    "refresh": {"refreshToken": TEXT},
    "logout": {"refreshToken": TEXT},
    "change_password": {"currentPassword": TEXT, "newPassword": TEXT},
    "create_user": _USER,
    "update_me": _PROFILE,
    "admin_update_user": _USER,
    "set_capacity": _CAPACITY,
    "create_project": _PROJECT,
    "update_project": _PROJECT,
    "create_booking": {"userId": INT, **_BOOKING},
    "update_booking": _BOOKING,
    "create_milestone": _MILESTONE,
    "update_milestone": _MILESTONE,
    "add_dependency": {"dependsOnMilestoneId": INT},
    "create_task": _TASK,
    "update_task": _TASK,
    "move_task": {"status": TEXT},
    "log_time": _TIME,
    "edit_time": _TIME,
    "create_request": {"kind": TEXT, "name": TEXT, "description": TEXT, "justification": TEXT,
                       "proposedStart": DATE, "proposedEnd": DATE, "projectId": INT, "taskLimit": INT},
    "approve_request": {"startDate": DATE, "predictedEndDate": DATE, "budgetCents": INT, "decisionNote": TEXT},
    "reject_request": {"decisionNote": TEXT},
}

# Query filters beyond page and pageSize: handler name -> {query name: type}. `q` is the
# search box on every list; `search` is its older name on the three lists that had one.
FILTERS = {
    "list_users": {"q": TEXT, "search": TEXT, "role": TEXT, "includeArchived": BOOL},
    "user_history": {"action": TEXT, "dateFrom": DATE, "dateTo": DATE},
    "list_projects": {"q": TEXT, "search": TEXT, "status": TEXT, "includeArchived": BOOL},
    "my_tasks": {"q": TEXT},
    "ready_tasks": {"q": TEXT},
    "my_time": {"dateFrom": DATE, "dateTo": DATE},
    "pending_time": {"q": TEXT},
    "list_requests": {"q": TEXT, "scope": {"type": "string", "enum": ["sent", "decide"]}, "status": TEXT,
                      "kind": TEXT},
    "project_cards": {"q": TEXT, "search": TEXT, "status": TEXT},
    "allocation": {"weekFrom": DATE, "weeks": INT, "overOnly": BOOL, "q": TEXT,
                   "projectIds": {"type": "string", "pattern": "^[0-9]+(,[0-9]+)*$",
                                  "description": "Project ids separated by commas, such as 3,7: each week's"
                                                 " projects and shownHours list only those projects, and people"
                                                 " with none in the shown weeks drop out. Over capacity still"
                                                 " counts every booking. At most 100."}},
    "audit_log": {"q": TEXT, "actorId": INT, "entityType": TEXT, "entityId": INT, "dateFrom": DATE, "dateTo": DATE},
    "list_notifications": {"q": TEXT, "unread": BOOL},
}

COMPONENTS = {
    "schemas": {
        "Error": {
            "type": "object",
            "required": ["error"],
            "properties": {"error": {"type": "string"}, "field": {"type": "string"}, "code": {"type": "string"}},
        },
        "Page": {
            "type": "object",
            "required": ["items", "page", "pageSize", "total", "totalPages"],
            "properties": {
                "items": {"type": "array", "items": {"type": "object"}},
                "page": {"type": "integer"},
                "pageSize": {"type": "integer"},
                "total": {"type": "integer"},
                "totalPages": {"type": "integer"},
            },
        },
    },
    "responses": {
        "Error": {
            "description": "The standard error",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}},
        },
    },
    "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
}


def _is_list(handler) -> bool:
    """A list answers the shared Page envelope (paginated or not)."""
    source = inspect.getsource(handler)
    return "_page(" in source or "_whole(" in source


def _is_paged(handler) -> bool:
    return "_page(" in inspect.getsource(handler)


def _who(route) -> str:
    if route.public:
        text = "Public: no token."
    elif route.roles is None:
        text = "Any signed-in user."
    else:
        text = "Roles: " + ", ".join(sorted(route.roles)) + "."
    if route.allowed_before_password_change:
        text += " Allowed before the first password change."
    return text


def _parameters(route) -> list:
    params = [{"name": name, "in": "path", "required": True, "schema": {"type": "integer"}}
              for name in re.findall(r"\{(\w+)\}", route.path)]
    if _is_paged(route.handler):
        params += [{"name": "page", "in": "query", "schema": INT}, {"name": "pageSize", "in": "query", "schema": INT}]
    for name, schema in FILTERS.get(route.handler.__name__, {}).items():
        params.append({"name": name, "in": "query", "schema": schema})
    return params


def _responses(route) -> dict:
    if route.status == 204:
        success = {"description": "Done; no body"}
    else:
        schema = {"$ref": "#/components/schemas/Page"} if _is_list(route.handler) else {"type": "object"}
        success = {"description": "OK", "content": {"application/json": {"schema": schema}}}
    responses = {str(route.status): success, "400": ERROR}
    if not route.public:
        responses.update({"401": ERROR, "403": ERROR, "404": ERROR})
    if route.method != "GET":
        responses["409"] = ERROR
    return responses


def _operation(route) -> dict:
    op = {
        "operationId": route.handler.__name__,
        "summary": inspect.getdoc(route.handler).splitlines()[0],
        "description": _who(route),
        "tags": [route.path.split("/")[1]],
    }
    if route.roles is not None:
        op["x-roles"] = sorted(route.roles)
    if route.public:
        op["security"] = []
    params = _parameters(route)
    if params:
        op["parameters"] = params
    if route.handler.__name__ in BODIES:
        schema = {"type": "object", "properties": BODIES[route.handler.__name__]}
        op["requestBody"] = {"required": True, "content": {"application/json": {"schema": schema}}}
    op["responses"] = _responses(route)
    return op


def build() -> dict:
    """The whole OpenAPI 3.0.3 document, in route-table order."""
    paths, tags = {}, []
    for route in routes.ROUTES:
        paths.setdefault(route.path, {})[route.method.lower()] = _operation(route)
        tag = route.path.split("/")[1]
        if tag not in tags:
            tags.append(tag)
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "ACME Project Tracker API",
            "version": "1.0.0",
            "description": "Generated from backend/tracker/api/routes.py by tools/openapi.py. "
                           "Log in with POST /auth/login, then send the token as a Bearer token.",
        },
        "servers": SERVERS,
        "security": [{"bearerAuth": []}],
        "tags": [{"name": tag} for tag in tags],
        "paths": paths,
        "components": COMPONENTS,
    }


def write() -> None:
    """Save the document to docs/openapi.json."""
    doc = build()
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    count = sum(len(item) for item in doc["paths"].values())
    print(f"Wrote docs/openapi.json: {count} operations")


if __name__ == "__main__":
    write()
