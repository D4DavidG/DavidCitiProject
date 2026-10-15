"""Turn a Lambda Function URL event into a Request, and a payload into a response.

The same request arrives with two path shapes:
    local:  the proxy on :3001 strips /api/tracker -> "/projects/7" (sometimes "//projects/7")
    AWS:    CloudFront passes the path through -> "/api/tracker/projects/7"
normalise_path() turns both into "/projects/7".

JSON on the wire is camelCase; Python and Postgres use snake_case. The only
conversion points are this module and services/views.py.
"""

import base64
import json
import re
from dataclasses import dataclass, field

from domain.errors import ValidationError

PREFIX = "/api/tracker"
INT_QUERY_KEYS = {"page", "page_size", "actor_id", "entity_id", "weeks"}
BOOL_QUERY_KEYS = {"include_archived", "unread", "over_only"}


@dataclass
class Request:
    method: str
    path: str
    headers: dict
    query: dict = field(default_factory=dict)
    body: dict = field(default_factory=dict)


def to_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def to_camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest)


def camelize(value):
    """camelCase every dict key, recursively (computed results; records go through views.py)."""
    if isinstance(value, dict):
        return {to_camel(k): camelize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [camelize(v) for v in value]
    return value


def normalise_path(raw: str) -> str:
    path = re.sub(r"/{2,}", "/", raw or "/")
    if path == PREFIX or path.startswith(PREFIX + "/"):
        path = path[len(PREFIX):] or "/"
    return path.rstrip("/") or "/"


def _query(raw: dict | None) -> dict:
    out = {}
    for key, value in (raw or {}).items():
        key = to_snake(key)
        if key in INT_QUERY_KEYS:
            if not re.fullmatch(r"-?\d+", value or ""):
                raise ValidationError(f"{to_camel(key)} must be a whole number.", field=key)
            out[key] = int(value)
        elif key in BOOL_QUERY_KEYS:
            if value not in ("true", "false"):
                raise ValidationError(f"{to_camel(key)} must be true or false.", field=key)
            out[key] = value == "true"
        else:
            out[key] = value
    return out


def _body(event: dict) -> dict:
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise ValidationError("The request body is not valid JSON.") from None
    if not isinstance(data, dict):
        raise ValidationError("The request body must be a JSON object.")
    return {to_snake(k): v for k, v in data.items()}


def parse(event: dict) -> Request:
    """Build a Request from a Function URL event (payload format 2.0)."""
    return Request(
        method=event["requestContext"]["http"]["method"].upper(),
        path=normalise_path(event.get("rawPath", "/")),
        headers={k.lower(): v for k, v in (event.get("headers") or {}).items()},
        query=_query(event.get("queryStringParameters")),
        body=_body(event),
    )


def respond(status: int, payload) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(payload, default=str) if payload is not None else "",
    }
