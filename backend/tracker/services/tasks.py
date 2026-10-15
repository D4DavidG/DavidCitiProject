"""Tasks: the pieces of a deliverable that employees tick off (the Kanban pull pattern).

The project's manager (or an admin) creates and estimates a task. With no
assignee it is Ready: an employee booked on the project takes it ("Take this",
claim_task) up to their task limit, and can put it back (release_task). The
manager can still assign it to anyone booked, even past their limit. Only the
assignee moves its status (TODO, IN_PROGRESS, DONE). Adding a task, or moving
one out of DONE, under a signed-off deliverable clears that sign-off.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import values
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import audit, milestones
from services.access import managed_project, visible_project
from services.actors import Actor
from services.views import task_view
from store.postgres import atomic, insert, update

NOT_FOUND = "Task not found."
STATUSES = {"TODO", "IN_PROGRESS", "DONE"}
_FIELDS = {"title", "description", "estimate_minutes", "assignee_user_id"}


def _clean(data: dict) -> dict:
    clean = {}
    if "title" in data:
        clean["title"] = values.text(data, "title")
    if "description" in data:
        clean["description"] = values.text(data, "description", required=False, max_length=5000)
    if "estimate_minutes" in data:
        clean["estimate_minutes"] = values.integer(data, "estimate_minutes", minimum=1, maximum=60_000)
    if "assignee_user_id" in data:
        clean["assignee_user_id"] = values.integer(data, "assignee_user_id", required=False)
    return clean


def _check_assignee(conn: psycopg.Connection, project_id: int, user_id: int | None) -> None:
    """An assignee must have a live booking on the task's project (None means unassigned)."""
    if user_id is None:
        return
    booked = conn.execute("SELECT 1 FROM assignments a JOIN users u ON u.user_id = a.user_id"
                          " WHERE a.project_id = %s AND a.user_id = %s AND NOT a.is_archived AND NOT u.is_archived"
                          " LIMIT 1", (project_id, user_id)).fetchone()
    if not booked:
        raise ValidationError("The assignee must be booked on this project.", field="assignee_user_id")


def _load(conn: psycopg.Connection, actor: Actor, task_id: int, manage: bool) -> tuple[dict, dict]:
    """Lock the task row (FOR UPDATE) and check project access; a task you can't reach is the same 404 as a missing one."""
    row = conn.execute("SELECT * FROM tasks WHERE task_id = %s FOR UPDATE", (task_id,)).fetchone()
    if row is None:
        raise NotFound(NOT_FOUND)
    try:
        project = (managed_project if manage else visible_project)(conn, actor, row["project_id"])
    except NotFound:
        raise NotFound(NOT_FOUND) from None
    return row, project


def _signed_off(conn: psycopg.Connection, milestone_id: int) -> bool:
    """True if the deliverable has been signed off."""
    return conn.execute("SELECT completed_at IS NOT NULL AS done FROM milestones WHERE milestone_id = %s",
                        (milestone_id,)).fetchone()["done"]


def create_task(conn: psycopg.Connection, actor: Actor, milestone_id: int, data: dict) -> dict:
    """Add a task to a deliverable. The project's manager or an admin."""
    values.only_allowed(data, _FIELDS)
    for required in ("title", "estimate_minutes"):
        if required not in data:
            raise ValidationError(f"{required.replace('_', ' ').capitalize()} is required.", field=required)
    clean = _clean(data)
    with atomic(conn):
        ms, project = milestones._load(conn, actor, milestone_id, manage=True)
        if ms["is_archived"]:
            raise Conflict("This deliverable is archived.")
        _check_assignee(conn, ms["project_id"], clean.get("assignee_user_id"))
        clean.update(milestone_id=milestone_id, project_id=ms["project_id"], created_by=actor.user_id)
        row = insert(conn, "tasks", clean)
        audit.record_change(conn, actor, "CREATE", "tasks", row["task_id"], None, task_view(row),
                            f"{actor.name} added task {row['title']} to deliverable {ms['name']}")
        if ms["completed_at"] is not None:
            milestones.clear_sign_off(conn, actor, milestone_id, f"task {row['title']} was added")
    return row


def update_task(conn: psycopg.Connection, actor: Actor, task_id: int, data: dict) -> dict:
    """The project's manager or an admin: title, description, estimate, assignee."""
    values.only_allowed(data, _FIELDS)
    clean = _clean(data)
    if not clean:
        raise ValidationError("Nothing to change.")
    with atomic(conn):
        before, project = _load(conn, actor, task_id, manage=True)
        if "assignee_user_id" in clean:
            _check_assignee(conn, before["project_id"], clean["assignee_user_id"])
        row = update(conn, "tasks", "task_id", task_id, clean)
        audit.record_change(conn, actor, "UPDATE", "tasks", task_id, task_view(before), task_view(row),
                            f"{actor.name} updated task {row['title']}")
    return row


def move_task(conn: psycopg.Connection, actor: Actor, task_id: int, status: str) -> dict:
    """Only the assignee moves their task between TODO, IN_PROGRESS and DONE."""
    status = values.choice({"status": status}, "status", STATUSES)
    with atomic(conn):
        before, project = _load(conn, actor, task_id, manage=False)
        if before["assignee_user_id"] != actor.user_id:
            raise Forbidden("Only the task's assignee can change its status.")
        if before["is_archived"]:
            raise Conflict("This task is archived.")
        completed_at = (before["completed_at"] or dt.datetime.now(dt.timezone.utc)) if status == "DONE" else None
        row = conn.execute("UPDATE tasks SET status = %s, completed_at = %s, updated_at = now()"
                           " WHERE task_id = %s RETURNING *", (status, completed_at, task_id)).fetchone()
        audit.record_change(conn, actor, "MOVE", "tasks", task_id, task_view(before), task_view(row),
                            f"{actor.name} moved task {row['title']} to {status.replace('_', ' ').lower()}")
        if status != "DONE" and _signed_off(conn, row["milestone_id"]):
            milestones.clear_sign_off(conn, actor, row["milestone_id"], f"task {row['title']} was reopened")
    return row


# The one definition of "held": unfinished, live tasks on live projects, across all projects.
# It reads the outer alias `u` (a users row), so it works for one person or a list.
HELD = sql.SQL("(SELECT count(*) FROM tasks t JOIN projects p ON p.project_id = t.project_id"
               " WHERE t.assignee_user_id = u.user_id AND t.status IN ('TODO', 'IN_PROGRESS')"
               " AND NOT t.is_archived AND NOT p.is_archived)")


def held_count(conn: psycopg.Connection, user_id: int) -> int:
    """How many unfinished tasks this person holds right now."""
    return conn.execute(sql.SQL("SELECT {} AS held FROM users u WHERE u.user_id = %s").format(HELD),
                        (user_id,)).fetchone()["held"]


def _limit_message(held: int, limit: int) -> str:
    """The refusal text for Take this; "over" when a manager assigned past the limit."""
    tail = " Finish one first, or ask your manager to raise it."
    if held > limit:
        return f"You already hold {held} unfinished tasks, over your limit of {limit}.{tail}"
    noun = "task" if held == 1 else "tasks"
    return f"You already hold {held} unfinished {noun}, your limit.{tail}"


def claim_task(conn: psycopg.Connection, actor: Actor, task_id: int) -> dict:
    """Take this: an employee booked on the project takes a Ready task, up to their limit."""
    if not actor.is_employee:
        raise Forbidden("Only employees take tasks.")
    with atomic(conn):
        before, _ = _load(conn, actor, task_id, manage=False)  # locks the task row first
        if before["is_archived"]:
            raise Conflict("This task is archived.")
        if before["status"] == "DONE":
            raise Conflict("This task is already done.")
        if before["assignee_user_id"] is not None:
            raise Conflict("This task is already taken.")
        # Lock order is task, then person. The count runs after the lock so it sees any
        # claim that committed while we waited (two concurrent claims can't both fit).
        limit = conn.execute("SELECT task_limit FROM users WHERE user_id = %s FOR UPDATE",
                             (actor.user_id,)).fetchone()["task_limit"]
        held = held_count(conn, actor.user_id)
        if held >= limit:
            raise Conflict(_limit_message(held, limit))
        row = conn.execute("UPDATE tasks SET assignee_user_id = %s, status = 'IN_PROGRESS', updated_at = now()"
                           " WHERE task_id = %s RETURNING *", (actor.user_id, task_id)).fetchone()
        audit.record_change(conn, actor, "CLAIM", "tasks", task_id, task_view(before), task_view(row),
                            f"{actor.name} took task {row['title']}")
    return row


def release_task(conn: psycopg.Connection, actor: Actor, task_id: int) -> dict:
    """Put back: the holder returns an unfinished task to Ready."""
    with atomic(conn):
        before, _ = _load(conn, actor, task_id, manage=False)  # locks the task row first
        if before["assignee_user_id"] != actor.user_id:
            raise Forbidden("Only the task's assignee can put it back.")
        if before["is_archived"]:
            raise Conflict("This task is archived.")
        if before["status"] == "DONE":
            raise Conflict("This task is done. Move it back to In progress first.")
        # Same lock order as claim_task (task, then person), so the two can't deadlock (pull-board spec, section 7).
        conn.execute("SELECT 1 FROM users WHERE user_id = %s FOR UPDATE", (actor.user_id,))
        row = conn.execute("UPDATE tasks SET assignee_user_id = NULL, status = 'TODO', updated_at = now()"
                           " WHERE task_id = %s RETURNING *", (task_id,)).fetchone()
        audit.record_change(conn, actor, "RELEASE", "tasks", task_id, task_view(before), task_view(row),
                            f"{actor.name} put back task {row['title']}")
    return row


def archive_task(conn: psycopg.Connection, actor: Actor, task_id: int) -> dict:
    """Archive a task. The project's manager or an admin."""
    with atomic(conn):
        before, project = _load(conn, actor, task_id, manage=True)
        if before["is_archived"]:
            raise Conflict("This task is already archived.")
        row = conn.execute("UPDATE tasks SET is_archived = TRUE, archived_at = now(), archived_by = %s,"
                           " updated_at = now() WHERE task_id = %s RETURNING *", (actor.user_id, task_id)).fetchone()
        audit.record_change(conn, actor, "ARCHIVE", "tasks", task_id, task_view(before), task_view(row),
                            f"{actor.name} archived task {row['title']}")
    return row


def reactivate_task(conn: psycopg.Connection, actor: Actor, task_id: int) -> dict:
    """Restore a task (its deliverable must be live); reopens the sign-off if the task is unfinished."""
    with atomic(conn):
        before, project = _load(conn, actor, task_id, manage=True)
        if not before["is_archived"]:
            raise Conflict("This task is not archived.")
        ms = conn.execute("SELECT is_archived FROM milestones WHERE milestone_id = %s",
                          (before["milestone_id"],)).fetchone()
        if ms["is_archived"]:
            raise Conflict("Its deliverable is archived. Reactivate the deliverable first.")
        row = conn.execute("UPDATE tasks SET is_archived = FALSE, archived_at = NULL, archived_by = NULL,"
                           " updated_at = now() WHERE task_id = %s RETURNING *", (task_id,)).fetchone()
        audit.record_change(conn, actor, "REACTIVATE", "tasks", task_id, task_view(before), task_view(row),
                            f"{actor.name} reactivated task {row['title']}")
        if row["status"] != "DONE" and _signed_off(conn, row["milestone_id"]):
            milestones.clear_sign_off(conn, actor, row["milestone_id"], f"task {row['title']} was reactivated")
    return row


_WITH_NAMES = ("SELECT t.*, u.first_name || ' ' || u.last_name AS assignee_name, m.name AS milestone_name,"
               " p.name AS project_name FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id"
               " JOIN projects p ON p.project_id = t.project_id LEFT JOIN users u ON u.user_id = t.assignee_user_id")


def list_tasks(conn: psycopg.Connection, actor: Actor, milestone_id: int) -> list[dict]:
    """A deliverable's live tasks."""
    milestones._load(conn, actor, milestone_id, manage=False)
    return conn.execute(f"{_WITH_NAMES} WHERE t.milestone_id = %s AND NOT t.is_archived ORDER BY t.task_id",
                        (milestone_id,)).fetchall()


def my_tasks(conn: psycopg.Connection, actor: Actor) -> list[dict]:
    """Your open tasks on live projects, oldest first."""
    return conn.execute(f"{_WITH_NAMES} WHERE t.assignee_user_id = %s AND t.status <> 'DONE' AND NOT t.is_archived"
                        " AND NOT p.is_archived ORDER BY m.due_date, t.task_id", (actor.user_id,)).fetchall()


def board(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """A project's board: every live task, and each booked person's held count and limit."""
    visible_project(conn, actor, project_id)  # 404 if it isn't yours
    items = conn.execute(f"{_WITH_NAMES} WHERE t.project_id = %s AND NOT t.is_archived"
                         " ORDER BY m.due_date, t.task_id", (project_id,)).fetchall()
    # EXISTS, not a join, so someone with two live bookings on the project is listed once.
    people = conn.execute(
        sql.SQL("SELECT u.user_id, u.first_name || ' ' || u.last_name AS name, {} AS held, u.task_limit"
                " FROM users u WHERE NOT u.is_archived AND EXISTS (SELECT 1 FROM assignments a"
                " WHERE a.user_id = u.user_id AND a.project_id = %s AND NOT a.is_archived)"
                " ORDER BY u.last_name, u.first_name").format(HELD), (project_id,)).fetchall()
    return {"items": items, "people": people}


def ready_tasks(conn: psycopg.Connection, actor: Actor) -> dict:
    """Ready to take: unassigned, unfinished tasks on projects you are booked on, plus your held count and limit."""
    items = conn.execute(
        sql.SQL("{} WHERE t.assignee_user_id IS NULL AND t.status <> 'DONE' AND NOT t.is_archived"
                " AND NOT p.is_archived AND EXISTS (SELECT 1 FROM assignments a"
                " WHERE a.project_id = t.project_id AND a.user_id = %s AND NOT a.is_archived)"
                " ORDER BY m.due_date, t.task_id").format(sql.SQL(_WITH_NAMES)), (actor.user_id,)).fetchall()
    me = conn.execute(sql.SQL("SELECT {} AS held, u.task_limit FROM users u WHERE u.user_id = %s").format(HELD),
                      (actor.user_id,)).fetchone()
    return {"items": items, "held": me["held"], "limit": me["task_limit"]}
