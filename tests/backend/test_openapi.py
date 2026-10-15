"""The OpenAPI file (docs/openapi.json) matches the route table.

tools/openapi.py builds the file from api/routes.py; these tests check what it
builds, and that the saved file is the same as a fresh build. No database.
"""

import importlib.util
import inspect
from pathlib import Path

from api import routes

ROOT = Path(__file__).resolve().parents[2]

# tools/ is not on pytest's pythonpath, so load the script by its file path.
_spec = importlib.util.spec_from_file_location("openapi_tool", ROOT / "tools" / "openapi.py")
openapi_tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(openapi_tool)

ERROR = {"$ref": "#/components/responses/Error"}


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
