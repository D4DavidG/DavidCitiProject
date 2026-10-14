"""The one table mapping domain exceptions to HTTP status codes.

Order matters: subclasses come before their parents, or a 409 OverCapacity
would be answered as its parent's status. Every error body is { "error": "..." },
plus "field" (camelCase) when a specific input is at fault.
"""

from api.http import to_camel
from domain.errors import (AuthenticationError, Conflict, DependencyCycle, DomainError, Forbidden, MigrationError,
                           NotFound, OverCapacity, PasswordChangeRequired, StorageUnavailable, ValidationError)


class MethodNotAllowed(DomainError):
    """The path exists but not with this HTTP method (405)."""


STATUS = [
    (ValidationError, 400),         # malformed, or a value out of range
    (AuthenticationError, 401),     # not signed in, bad token, wrong password
    (PasswordChangeRequired, 403),  # signed in with a generated password; change it first
    (Forbidden, 403),               # signed in, but this role may never do this
    (NotFound, 404),                # doesn't exist, or exists and isn't yours
    (MethodNotAllowed, 405),
    (OverCapacity, 409),            # would take someone past capacity without overtime
    (DependencyCycle, 409),         # would make the dependency chain loop
    (Conflict, 409),                # well formed, but the current state refuses it
    (StorageUnavailable, 503),      # database unreachable; nothing changed
    (MigrationError, 503),
]

UNEXPECTED = "Something went wrong on our side. Nothing was changed."


def to_response(exc: DomainError) -> tuple[int, dict]:
    for error_class, status in STATUS:
        if isinstance(exc, error_class):
            body = {"error": str(exc)}
            if isinstance(exc, ValidationError) and exc.field:
                body["field"] = to_camel(exc.field)
            return status, body
    return 500, {"error": UNEXPECTED}
