"""The OpenAPI file (docs/openapi.json) matches the route table.

tools/openapi.py builds the file from api/routes.py; these tests check what it
builds, and that the saved file is the same as a fresh build. No database.
"""

import importlib.util
import inspect
import json
from pathlib import Path

from api import routes

ROOT = Path(__file__).resolve().parents[2]

# tools/ is not on pytest's pythonpath, so load the script by its file path.
_spec = importlib.util.spec_from_file_location("openapi_tool", ROOT / "tools" / "openapi.py")
openapi_tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(openapi_tool)

ERROR = {"$ref": "#/components/responses/Error"}


def test_openapi_file_is_up_to_date():
    saved = json.loads(openapi_tool.OUT.read_text())
    assert saved == openapi_tool.build(), "docs/openapi.json is out of date: run .venv/bin/python tools/openapi.py"


def _op(doc, method, path):
    return doc["paths"][path][method.lower()]


def test_every_handler_has_a_one_line_docstring():
    missing = [r.handler.__name__ for r in routes.ROUTES if not inspect.getdoc(r.handler)]
    assert missing == []
    doc = openapi_tool.build()
    for route in routes.ROUTES:
        summary = inspect.getdoc(route.handler).splitlines()[0]
        assert _op(doc, route.method, route.path)["summary"] == summary


def test_every_route_is_documented_once():
    doc = openapi_tool.build()
    for route in routes.ROUTES:
        assert _op(doc, route.method, route.path)["operationId"] == route.handler.__name__
    operations = [op for item in doc["paths"].values() for op in item.values()]
    assert len(operations) == len(routes.ROUTES)
    ids = [op["operationId"] for op in operations]
    assert len(set(ids)) == len(ids)


def test_roles_and_auth_follow_the_route_table():
    doc = openapi_tool.build()
    assert doc["security"] == [{"bearerAuth": []}]
    assert doc["components"]["securitySchemes"]["bearerAuth"] == {
        "type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
    for route in routes.ROUTES:
        op = _op(doc, route.method, route.path)
        if route.public:
            assert op["security"] == []
        else:
            assert "security" not in op
        expected_roles = sorted(route.roles) if route.roles is not None else None
        assert op.get("x-roles") == expected_roles


def test_status_codes_follow_the_route_table():
    doc = openapi_tool.build()
    assert "201" in _op(doc, "POST", "/users")["responses"]
    logout = _op(doc, "POST", "/auth/logout")["responses"]["204"]
    assert "content" not in logout
    projects = _op(doc, "GET", "/projects")
    schema = projects["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/Page"}
    query = {p["name"] for p in projects["parameters"] if p["in"] == "query"}
    assert {"page", "pageSize"} <= query
    user_id = _op(doc, "GET", "/users/{id}")["parameters"][0]
    assert user_id == {"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}
    dependency = _op(doc, "POST", "/milestones/{id}/dependencies/{other_id}/archive")
    assert [p["name"] for p in dependency["parameters"] if p["in"] == "path"] == ["id", "other_id"]
    for route in routes.ROUTES:
        responses = _op(doc, route.method, route.path)["responses"]
        assert responses["400"] == ERROR
        if not route.public:
            assert responses["401"] == responses["403"] == responses["404"] == ERROR
        if route.method != "GET":
            assert responses["409"] == ERROR


def _refs(value):
    """Every $ref string anywhere in the document."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "$ref":
                yield item
            else:
                yield from _refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from _refs(item)


def test_every_ref_resolves():
    doc = openapi_tool.build()
    assert doc["openapi"] == "3.0.3"
    refs = set(_refs(doc))
    assert refs  # the walk found something
    for ref in refs:
        _, section, kind, name = ref.split("/")
        assert name in doc[section][kind], ref


def _body_fields(doc, route) -> dict:
    body = _op(doc, route.method, route.path)["requestBody"]
    assert body["required"] is (route.handler.__name__ not in openapi_tool.OPTIONAL_BODIES)
    return body["content"]["application/json"]["schema"]["properties"]


def test_the_archive_confirmation_and_the_dashboard_columns_are_documented():
    doc = openapi_tool.build()
    archive = _op(doc, "POST", "/users/{id}/archive")["requestBody"]
    assert archive["required"] is False
    assert archive["content"]["application/json"]["schema"]["properties"] == {"confirmOnProjects": {"type": "boolean"}}
    query = {p["name"]: p["schema"] for p in _op(doc, "GET", "/dashboard/projects")["parameters"] if p["in"] == "query"}
    assert query["atRisk"] == {"type": "boolean"} and query["sort"]["enum"] == ["risk", "updated"]
    assert "page" in {p["name"] for p in _op(doc, "GET", "/users/{id}/projects")["parameters"]}


def test_bodies_are_listed_for_exactly_the_handlers_that_read_one():
    reads_body = {r.handler.__name__ for r in routes.ROUTES if "ctx.body" in inspect.getsource(r.handler)}
    assert reads_body == set(openapi_tool.BODIES)
    doc = openapi_tool.build()
    for route in routes.ROUTES:
        op = _op(doc, route.method, route.path)
        if route.handler.__name__ in reads_body:
            assert _body_fields(doc, route) == openapi_tool.BODIES[route.handler.__name__]
        else:
            assert "requestBody" not in op


def test_body_fields_match_the_service_allow_lists():
    from api.http import to_camel
    from services import assignments, milestones, projects, requests, tasks, time_entries, users

    allowed = {
        "create_user": users._ADMIN_FIELDS, "admin_update_user": users._ADMIN_FIELDS,
        "update_me": users._PROFILE_FIELDS, "set_capacity": users._CAPACITY_FIELDS,
        "create_project": projects._ADMIN_FIELDS, "update_project": projects._ADMIN_FIELDS,
        "create_booking": assignments._FIELDS, "update_booking": assignments._FIELDS - {"user_id"},
        "create_milestone": milestones._FIELDS, "update_milestone": milestones._FIELDS,
        "create_task": tasks._FIELDS, "update_task": tasks._FIELDS,
        "log_time": time_entries._FIELDS, "edit_time": time_entries._FIELDS,
        "create_request": {"kind"}.union(*requests._FIELDS.values()),
    }
    for handler, fields in allowed.items():
        assert set(openapi_tool.BODIES[handler]) == {to_camel(f) for f in fields}, handler


def test_types_follow_the_validators():
    bodies, date = openapi_tool.BODIES, {"type": "string", "format": "date"}
    assert bodies["create_booking"]["hoursPerWeek"] == {"type": "integer"}
    assert bodies["log_time"]["workDate"] == date
    assert bodies["set_capacity"]["overtimeAllowed"] == {"type": "boolean"}
    assert bodies["create_project"]["budgetCents"] == {"type": "integer"}
    assert bodies["approve_request"]["budgetCents"] == {"type": "integer"}
    assert bodies["update_task"]["assigneeUserId"] == {"type": "integer"}


def test_filters_are_documented():
    from api.http import BOOL_QUERY_KEYS, INT_QUERY_KEYS, to_camel

    doc = openapi_tool.build()

    def query(method, path):
        params = _op(doc, method, path).get("parameters", [])
        return {p["name"]: p["schema"] for p in params if p["in"] == "query"}

    assert {"search", "status", "includeArchived"} <= set(query("GET", "/projects"))
    assert "unread" in query("GET", "/notifications")
    assert {"overOnly", "weekFrom", "weeks", "projectIds"} <= set(query("GET", "/dashboard/allocation"))
    assert query("GET", "/dashboard/allocation")["projectIds"]["pattern"] == "^[0-9]+(,[0-9]+)*$"
    for path in ("/me/tasks", "/me/ready-tasks", "/approvals/time-entries", "/project-requests", "/notifications",
                 "/admin/audit-log", "/users", "/projects", "/dashboard/projects", "/dashboard/allocation"):
        assert query("GET", path)["q"] == {"type": "string"}, path  # the search box on every list
    assert query("GET", "/project-requests")["scope"] == {"type": "string", "enum": ["sent", "decide"]}
    # A query key api/http.py parses as a number or as true/false is documented with that type.
    ints, bools = {to_camel(k) for k in INT_QUERY_KEYS}, {to_camel(k) for k in BOOL_QUERY_KEYS}
    for route in routes.ROUTES:
        for name, schema in query(route.method, route.path).items():
            if name in ints:
                assert schema == {"type": "integer"}, (route.path, name)
            if name in bools:
                assert schema == {"type": "boolean"}, (route.path, name)
