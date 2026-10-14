"""Domain exceptions.

Services raise these; they never know about HTTP. The API maps each class to a
status code in one table (api/errors.py). Subclasses come before their parents
there, so a specific error is never answered with its parent's status.
"""


class DomainError(Exception):
    """Base class for every error the app reports to a caller."""


class ValidationError(DomainError):
    """The request is malformed or a value is out of range (400)."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


class AuthenticationError(DomainError):
    """Not signed in, or the credentials or token are bad (401)."""


class PasswordChangeRequired(DomainError):
    """Signed in with a generated password that must be changed first (403)."""


class Forbidden(DomainError):
    """Signed in, but this role may never do this (403)."""


class NotFound(DomainError):
    """It doesn't exist, or it exists and isn't yours (404)."""


class Conflict(DomainError):
    """Well formed, but the current state refuses it (409)."""


class OverCapacity(Conflict):
    """Logging this time would take the person past their weekly capacity."""


class DependencyCycle(Conflict):
    """The dependency would make a deliverable depend on itself."""


class StorageUnavailable(DomainError):
    """The database can't be reached; nothing was changed (503)."""


class MigrationError(DomainError):
    """The migration files are inconsistent; the database was not changed."""
