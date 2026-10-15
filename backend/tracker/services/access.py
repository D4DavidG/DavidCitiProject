"""Who may see and who may manage a project; every project-scoped service goes through here.

- Admins see every project, archived ones included.
- Managers see the live projects they manage.
- Employees see live projects they have a live booking on.

A project you can't see answers 404 with the same message as one that doesn't
exist, so ids can't be probed. Seeing it but not being allowed to change it is 403.
"""

import psycopg

from domain.errors import Conflict, Forbidden, NotFound
from services.actors import Actor

PROJECT_NOT_FOUND = "Project not found."


def visible_project(conn: psycopg.Connection, actor: Actor, project_id: int, lock: bool = False) -> dict:
    """The project if `actor` may see it; otherwise 404. `lock=True` takes FOR UPDATE on the row."""
    query = "SELECT * FROM projects WHERE project_id = %s FOR UPDATE" if lock else \
        "SELECT * FROM projects WHERE project_id = %s"
    row = conn.execute(query, (project_id,)).fetchone()
    if row is None or not can_see(conn, actor, row):
        raise NotFound(PROJECT_NOT_FOUND)
    return row


def can_see(conn: psycopg.Connection, actor: Actor, project: dict) -> bool:
    """Apply the visibility rules in the module docstring to one project row."""
    if actor.is_admin:
        return True
    if project["is_archived"]:
        return False
    if actor.is_manager:
        return project["manager_id"] == actor.user_id
    return bool(conn.execute(
        "SELECT 1 FROM assignments WHERE project_id = %s AND user_id = %s AND NOT is_archived LIMIT 1",
        (project["project_id"], actor.user_id),
    ).fetchone())


def managed_project(conn: psycopg.Connection, actor: Actor, project_id: int, lock: bool = False) -> dict:
    """The project if `actor` is an admin or its manager and it is live; otherwise 404 (cannot see), 403 (not theirs) or 409 (archived)."""
    row = visible_project(conn, actor, project_id, lock=lock)
    if not (actor.is_admin or row["manager_id"] == actor.user_id):
        raise Forbidden("Only the project's manager or an admin can change this.")
    if row["is_archived"]:
        raise Conflict("This project is archived. Reactivate it first.")
    return row
