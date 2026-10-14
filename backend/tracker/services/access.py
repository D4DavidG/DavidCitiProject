"""Who may see and who may manage a project. Every project-scoped service goes through here.

- Admins see every project, archived ones included.
- Managers see the live projects they manage.
- Employees see live projects they have a live booking on.

Anything you can't see answers 404 with the same message as a project that
doesn't exist, so ids can't be probed. Seeing a project but not being allowed
to change it answers 403.
"""

import psycopg

from domain.errors import Conflict, Forbidden, NotFound
from services.actors import Actor

PROJECT_NOT_FOUND = "Project not found."


def visible_project(conn: psycopg.Connection, actor: Actor, project_id: int, lock: bool = False) -> dict:
    """The project if `actor` may see it; otherwise 404."""
    query = "SELECT * FROM projects WHERE project_id = %s FOR UPDATE" if lock else \
        "SELECT * FROM projects WHERE project_id = %s"
    row = conn.execute(query, (project_id,)).fetchone()
    if row is None or not can_see(conn, actor, row):
        raise NotFound(PROJECT_NOT_FOUND)
    return row


def can_see(conn: psycopg.Connection, actor: Actor, project: dict) -> bool:
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
    """The project if `actor` is an admin or its manager, and it's live; otherwise 404/403/409."""
    row = visible_project(conn, actor, project_id, lock=lock)
    if not (actor.is_admin or row["manager_id"] == actor.user_id):
        raise Forbidden("Only the project's manager or an admin can change this.")
    if row["is_archived"]:
        raise Conflict("This project is archived. Reactivate it first.")
    return row
