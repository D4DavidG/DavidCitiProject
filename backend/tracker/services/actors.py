"""Who is making the request, read from the database.

The token only says which user id signed in. Role, manager and the
password-change flag are re-read from Postgres on every request, so a demoted
user's old token loses its powers at once.
"""

from dataclasses import dataclass

import psycopg

from domain.errors import AuthenticationError
from services.tokens import INVALID_MESSAGE

ADMIN, MANAGER, EMPLOYEE = "ADMIN", "MANAGER", "EMPLOYEE"


@dataclass(frozen=True)
class Actor:
    """The signed-in user, as stored right now."""

    user_id: int
    role: str
    manager_id: int | None
    first_name: str
    last_name: str
    must_change_password: bool

    @property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN

    @property
    def is_manager(self) -> bool:
        return self.role == MANAGER

    @property
    def is_employee(self) -> bool:
        return self.role == EMPLOYEE


def load(conn: psycopg.Connection, user_id: int) -> Actor:
    """The live (not archived) user with this id; otherwise the standard 401."""
    row = conn.execute(
        "SELECT user_id, role, manager_id, first_name, last_name, must_change_password"
        " FROM users WHERE user_id = %s AND NOT is_archived",
        (user_id,),
    ).fetchone()
    if row is None:
        raise AuthenticationError(INVALID_MESSAGE)
    return Actor(**row)
