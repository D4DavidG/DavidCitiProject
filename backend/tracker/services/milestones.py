"""Deliverables ("milestones" in the database) and the dependency chain between them.

A deliverable's status is computed, never typed in:
    DONE         signed off by the project's manager
    BLOCKED      otherwise, while anything it depends on isn't signed off
    IN_PROGRESS  otherwise, once any of its tasks has started
    NOT_STARTED  otherwise
Progress is the share of its live tasks' estimated minutes that are done.

Sign-off is refused while a task or dependency is unfinished. If that later
stops being true (a task added, reopened or reactivated; a new unfinished
dependency; the deliverable reactivated), the sign-off is cleared, and so are the
sign-offs of everything depending on it (integrity check 5 guards this). The
manager can also reopen a sign-off by hand.

Dependencies stay inside one project (the database enforces it too) and may
never loop: checked here under a lock on the project row, and again by
integrity check 1.
"""

import datetime as dt

import psycopg

from domain import values
from domain.errors import Conflict, DependencyCycle, NotFound, ValidationError
from services import audit
from services.access import managed_project, visible_project
from services.actors import Actor
from services.views import milestone_view
from store.postgres import atomic, insert, update

NOT_FOUND = "Deliverable not found."
_FIELDS = {"name", "description", "start_date", "due_date", "sort_order"}

_DECORATED = """
    SELECT m.*,
           COALESCE(t.total, 0) AS total_estimate_minutes,
           COALESCE(t.done, 0) AS done_estimate_minutes,
           COALESCE(t.task_count, 0) AS task_count,
           COALESCE(t.done_count, 0) AS done_task_count,
           COALESCE(t.started, FALSE) AS started,
           EXISTS (SELECT 1 FROM milestone_dependencies d
                   JOIN milestones dm ON dm.milestone_id = d.depends_on_milestone_id
                   WHERE d.milestone_id = m.milestone_id AND NOT d.is_archived
                     AND dm.completed_at IS NULL) AS blocked
    FROM milestones m
    LEFT JOIN (SELECT milestone_id,
                      sum(estimate_minutes) AS total,
                      sum(estimate_minutes) FILTER (WHERE status = 'DONE') AS done,
                      count(*) AS task_count,
                      count(*) FILTER (WHERE status = 'DONE') AS done_count,
                      bool_or(status <> 'TODO') AS started
               FROM tasks WHERE NOT is_archived GROUP BY milestone_id) t
           ON t.milestone_id = m.milestone_id
"""


def _decorate(row: dict) -> dict:
    """Add the computed status and progress to a row from _DECORATED."""
    if row["completed_at"] is not None:
        status = "DONE"
    elif row["blocked"]:
        status = "BLOCKED"
    elif row["started"]:
        status = "IN_PROGRESS"
    else:
        status = "NOT_STARTED"
    total = row["total_estimate_minutes"]
    if total:
        progress = row["done_estimate_minutes"] * 100 // total
    else:
        progress = 100 if status == "DONE" else 0
    return {**row, "status": status, "progress_percent": progress}


def decorated(conn: psycopg.Connection, where: str, params: dict) -> list[dict]:
    """Deliverables matching `where` (over alias m), each with status and progress."""
    rows = conn.execute(f"{_DECORATED} WHERE {where} ORDER BY m.sort_order, m.due_date, m.milestone_id",
                        params).fetchall()
    return [_decorate(r) for r in rows]


def _clean(data: dict) -> dict:
    clean = {}
    if "name" in data:
        clean["name"] = values.text(data, "name")
    if "description" in data:
        clean["description"] = values.text(data, "description", required=False, max_length=5000)
    if "start_date" in data:
        clean["start_date"] = values.date(data, "start_date")
    if "due_date" in data:
        clean["due_date"] = values.date(data, "due_date")
    if "sort_order" in data:
        clean["sort_order"] = values.integer(data, "sort_order", minimum=0, maximum=10_000)
    return clean


def _check_dates(merged: dict) -> None:
    if merged["due_date"] < merged["start_date"]:
        raise ValidationError("Due date can't be before start date.", field="due_date")


def _load(conn: psycopg.Connection, actor: Actor, milestone_id: int, manage: bool) -> tuple[dict, dict]:
    """The deliverable and its project if visible (manage=True: manageable, project row locked); else 404, 403 or 409 (archived project)."""
    row = conn.execute("SELECT * FROM milestones WHERE milestone_id = %s", (milestone_id,)).fetchone()
    if row is None:
        raise NotFound(NOT_FOUND)
    try:
        check = managed_project if manage else visible_project
        project = check(conn, actor, row["project_id"], lock=manage)
    except NotFound:
        raise NotFound(NOT_FOUND) from None
    return row, project


# --- create, read, update, archive ---

def create_milestone(conn: psycopg.Connection, actor: Actor, project_id: int, data: dict) -> dict:
    values.only_allowed(data, _FIELDS)
    for required in ("name", "start_date", "due_date"):
        if required not in data:
            raise ValidationError(f"{required.replace('_', ' ').capitalize()} is required.", field=required)
    clean = _clean(data)
    _check_dates(clean)
    with atomic(conn):
        project = managed_project(conn, actor, project_id)
        clean["project_id"] = project_id
        row = insert(conn, "milestones", clean)
        audit.record_change(conn, actor, "CREATE", "milestones", row["milestone_id"], None, milestone_view(row),
                            f"{actor.name} added deliverable {row['name']} to {project['name']}")
    return row


def get_milestone(conn: psycopg.Connection, actor: Actor, milestone_id: int) -> dict:
    _load(conn, actor, milestone_id, manage=False)
    return decorated(conn, "m.milestone_id = %(id)s", {"id": milestone_id})[0]


def list_milestones(conn: psycopg.Connection, actor: Actor, project_id: int) -> list[dict]:
    """A project's live deliverables, in order, with status and progress."""
    visible_project(conn, actor, project_id)
    return decorated(conn, "m.project_id = %(p)s AND NOT m.is_archived", {"p": project_id})


def update_milestone(conn: psycopg.Connection, actor: Actor, milestone_id: int, data: dict) -> dict:
    values.only_allowed(data, _FIELDS)
    clean = _clean(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before, project = _load(conn, actor, milestone_id, manage=True)
        _check_dates({**before, **clean})
        row = update(conn, "milestones", "milestone_id", milestone_id, clean)
        audit.record_change(conn, actor, "UPDATE", "milestones", milestone_id, milestone_view(before),
                            milestone_view(row), f"{actor.name} updated deliverable {row['name']}")
    return row


def archive_milestone(conn: psycopg.Connection, actor: Actor, milestone_id: int) -> dict:
    """Archive a deliverable, its live tasks, and every live dependency link touching it."""
    with atomic(conn):
        before, project = _load(conn, actor, milestone_id, manage=True)
        if before["is_archived"]:
            raise Conflict("This deliverable is already archived.")
        stamp = dt.datetime.now(dt.timezone.utc)
        row = conn.execute("UPDATE milestones SET is_archived = TRUE, archived_at = %s, archived_by = %s,"
                           " updated_at = now() WHERE milestone_id = %s RETURNING *",
                           (stamp, actor.user_id, milestone_id)).fetchone()
        audit.record_change(conn, actor, "ARCHIVE", "milestones", milestone_id, milestone_view(before),
                            milestone_view(row), f"{actor.name} archived deliverable {row['name']}")
        for t in conn.execute("UPDATE tasks SET is_archived = TRUE, archived_at = %s, archived_by = %s,"
                              " updated_at = now() WHERE milestone_id = %s AND NOT is_archived RETURNING task_id, title",
                              (stamp, actor.user_id, milestone_id)).fetchall():
            audit.record_change(conn, actor, "ARCHIVE", "tasks", t["task_id"], None, None,
                                f"{actor.name} archived task {t['title']} with deliverable {row['name']}")
        conn.execute("UPDATE milestone_dependencies SET is_archived = TRUE, archived_at = %s"
                     " WHERE NOT is_archived AND (milestone_id = %s OR depends_on_milestone_id = %s)",
                     (stamp, milestone_id, milestone_id))
    return row


def reactivate_milestone(conn: psycopg.Connection, actor: Actor, milestone_id: int) -> dict:
    """Restore a deliverable and the tasks archived with it. Dependency links are re-added by hand."""
    with atomic(conn):
        before, project = _load(conn, actor, milestone_id, manage=True)
        if not before["is_archived"]:
            raise Conflict("This deliverable is not archived.")
        row = conn.execute("UPDATE milestones SET is_archived = FALSE, archived_at = NULL, archived_by = NULL,"
                           " updated_at = now() WHERE milestone_id = %s RETURNING *", (milestone_id,)).fetchone()
        audit.record_change(conn, actor, "REACTIVATE", "milestones", milestone_id, milestone_view(before),
                            milestone_view(row), f"{actor.name} reactivated deliverable {row['name']}")
        for t in conn.execute("UPDATE tasks SET is_archived = FALSE, archived_at = NULL, archived_by = NULL,"
                              " updated_at = now() WHERE milestone_id = %s AND archived_at = %s RETURNING task_id, title",
                              (milestone_id, before["archived_at"])).fetchall():
            audit.record_change(conn, actor, "REACTIVATE", "tasks", t["task_id"], None, None,
                                f"{actor.name} reactivated task {t['title']} with deliverable {row['name']}")
        if row["completed_at"] is not None:
            clear_sign_off(conn, actor, milestone_id, "it was reactivated")
    return row


# --- sign-off ---

def sign_off(conn: psycopg.Connection, actor: Actor, milestone_id: int) -> dict:
    """The project's manager (or an admin) marks a deliverable done, once all its work is done."""
    with atomic(conn):
        before, project = _load(conn, actor, milestone_id, manage=True)
        if before["is_archived"]:
            raise Conflict("This deliverable is archived.")
        if before["completed_at"] is not None:
            raise Conflict("This deliverable is already signed off.")
        open_tasks = conn.execute("SELECT count(*) AS n FROM tasks WHERE milestone_id = %s AND NOT is_archived"
                                  " AND status <> 'DONE'", (milestone_id,)).fetchone()["n"]
        if open_tasks:
            raise Conflict(f"{open_tasks} task{'s are' if open_tasks > 1 else ' is'} not done yet.")
        waiting = conn.execute(
            "SELECT dm.name FROM milestone_dependencies d JOIN milestones dm ON dm.milestone_id = d.depends_on_milestone_id"
            " WHERE d.milestone_id = %s AND NOT d.is_archived AND dm.completed_at IS NULL ORDER BY dm.name",
            (milestone_id,)).fetchall()
        if waiting:
            raise Conflict(f"It depends on {', '.join(w['name'] for w in waiting)}, which isn't signed off yet.")
        row = conn.execute("UPDATE milestones SET completed_at = now(), completed_by = %s, updated_at = now()"
                           " WHERE milestone_id = %s RETURNING *", (actor.user_id, milestone_id)).fetchone()
        audit.record_change(conn, actor, "SIGN_OFF", "milestones", milestone_id, milestone_view(before),
                            milestone_view(row), f"{actor.name} signed off deliverable {row['name']}")
    return row


def reopen_milestone(conn: psycopg.Connection, actor: Actor, milestone_id: int) -> dict:
    """Undo a sign-off (and the sign-offs of everything depending on it)."""
    with atomic(conn):
        before, project = _load(conn, actor, milestone_id, manage=True)
        if before["completed_at"] is None:
            raise Conflict("This deliverable isn't signed off.")
        clear_sign_off(conn, actor, milestone_id, f"{actor.name} reopened it")
    return conn.execute("SELECT * FROM milestones WHERE milestone_id = %s", (milestone_id,)).fetchone()


def clear_sign_off(conn: psycopg.Connection, actor: Actor, milestone_id: int, reason: str) -> None:
    """Clear the sign-off of a deliverable and of every deliverable that depends on it, transitively."""
    cleared = conn.execute(
        "WITH RECURSIVE affected(milestone_id) AS ("
        "   SELECT %(start)s::bigint"
        "   UNION SELECT d.milestone_id FROM milestone_dependencies d"
        "         JOIN affected a ON d.depends_on_milestone_id = a.milestone_id WHERE NOT d.is_archived)"
        " UPDATE milestones SET completed_at = NULL, completed_by = NULL, updated_at = now()"
        " WHERE milestone_id IN (SELECT milestone_id FROM affected) AND completed_at IS NOT NULL"
        " RETURNING milestone_id, name", {"start": milestone_id}).fetchall()
    for m in cleared:
        audit.record_change(conn, actor, "REOPEN", "milestones", m["milestone_id"], None, None,
                            f"Sign-off of deliverable {m['name']} was cleared because {reason}")


# --- dependencies ---

def add_dependency(conn: psycopg.Connection, actor: Actor, milestone_id: int, depends_on_id: int) -> dict:
    """Record that `milestone_id` can't finish before `depends_on_id`. Same project, no loops."""
    with atomic(conn):
        row, project = _load(conn, actor, milestone_id, manage=True)  # locks the project row
        target = conn.execute("SELECT * FROM milestones WHERE milestone_id = %s", (depends_on_id,)).fetchone()
        if target is None or not _visible_to(conn, actor, target):
            raise NotFound(NOT_FOUND)
        if target["project_id"] != row["project_id"]:
            raise ValidationError("A deliverable can only depend on one in the same project.",
                                  field="depends_on_milestone_id")
        if depends_on_id == milestone_id:
            raise ValidationError("A deliverable can't depend on itself.", field="depends_on_milestone_id")
        if row["is_archived"] or target["is_archived"]:
            raise Conflict("Archived deliverables can't take part in dependencies.")
        loops = conn.execute(
            "WITH RECURSIVE reach(milestone_id) AS ("
            "   SELECT %(target)s::bigint"
            "   UNION SELECT d.depends_on_milestone_id FROM milestone_dependencies d"
            "         JOIN reach r ON d.milestone_id = r.milestone_id WHERE NOT d.is_archived)"
            " SELECT 1 FROM reach WHERE milestone_id = %(me)s", {"target": depends_on_id, "me": milestone_id}).fetchone()
        if loops:
            raise DependencyCycle(f"{target['name']} already depends on {row['name']}, so this would make a loop.")
        existing = conn.execute("SELECT is_archived FROM milestone_dependencies WHERE milestone_id = %s"
                                " AND depends_on_milestone_id = %s", (milestone_id, depends_on_id)).fetchone()
        if existing and not existing["is_archived"]:
            raise Conflict("That dependency already exists.")
        if existing:
            conn.execute("UPDATE milestone_dependencies SET is_archived = FALSE, archived_at = NULL"
                         " WHERE milestone_id = %s AND depends_on_milestone_id = %s", (milestone_id, depends_on_id))
        else:
            conn.execute("INSERT INTO milestone_dependencies (milestone_id, depends_on_milestone_id, project_id)"
                         " VALUES (%s, %s, %s)", (milestone_id, depends_on_id, row["project_id"]))
        audit.record_change(conn, actor, "ADD_DEPENDENCY", "milestones", milestone_id, None,
                            {"dependsOnMilestoneId": depends_on_id},
                            f"{actor.name} made {row['name']} depend on {target['name']}")
        if row["completed_at"] is not None and target["completed_at"] is None:
            clear_sign_off(conn, actor, milestone_id, f"it now depends on {target['name']}")
    return get_milestone(conn, actor, milestone_id)


def remove_dependency(conn: psycopg.Connection, actor: Actor, milestone_id: int, depends_on_id: int) -> dict:
    """Archive a dependency link (links are never deleted)."""
    with atomic(conn):
        row, project = _load(conn, actor, milestone_id, manage=True)
        changed = conn.execute("UPDATE milestone_dependencies SET is_archived = TRUE, archived_at = now()"
                               " WHERE milestone_id = %s AND depends_on_milestone_id = %s AND NOT is_archived"
                               " RETURNING milestone_id", (milestone_id, depends_on_id)).fetchone()
        if changed is None:
            raise NotFound("Dependency not found.")
        audit.record_change(conn, actor, "REMOVE_DEPENDENCY", "milestones", milestone_id,
                            {"dependsOnMilestoneId": depends_on_id}, None,
                            f"{actor.name} removed a dependency from {row['name']}")
    return get_milestone(conn, actor, milestone_id)


def _visible_to(conn: psycopg.Connection, actor: Actor, milestone: dict) -> bool:
    try:
        visible_project(conn, actor, milestone["project_id"])
        return True
    except NotFound:
        return False


def dependency_graph(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """Question 6: the project's live deliverables (nodes) and live dependency links (edges)."""
    visible_project(conn, actor, project_id)
    nodes = decorated(conn, "m.project_id = %(p)s AND NOT m.is_archived", {"p": project_id})
    edges = conn.execute("SELECT milestone_id AS from, depends_on_milestone_id AS to FROM milestone_dependencies"
                         " WHERE project_id = %s AND NOT is_archived ORDER BY 1, 2", (project_id,)).fetchall()
    return {"nodes": nodes, "edges": [{"from": e["from"], "to": e["to"]} for e in edges]}
