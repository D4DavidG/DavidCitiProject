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
        params += [{"name": "page", "in": "query", "schema": {"type": "integer"}},
                   {"name": "pageSize", "in": "query", "schema": {"type": "integer"}}]
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
