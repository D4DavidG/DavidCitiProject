"""Build test data through the real services, so every row has its audit trail.

Loading a world this way is itself a test: if a service breaks a rule, the
integrity check after the test fails.
"""

import datetime as dt
import itertools

from services import actors, users

_n = itertools.count(1)


def admin(conn):
    """The bootstrap admin (AD000001), created if needed."""
    users.bootstrap_admin(conn, "Bootstrap-pass-1")
    row = conn.execute("SELECT user_id FROM users WHERE username = 'AD000001'").fetchone()
    return actors.load(conn, row["user_id"])


def person(conn, by, role="EMPLOYEE", manager=None, first_name=None, last_name="Tester", **extra):
    """Create a user through the service; return (actor, generated password)."""
    n = next(_n)
    data = {
        "first_name": first_name or f"Person{n}",
        "last_name": last_name,
        "email": f"person{n}@acme.test",
        "role": role,
        "annual_salary_cents": 10_000_000,
    }
    if manager is not None:
        data["manager_id"] = manager.user_id
    data.update(extra)
    row, password = users.create_user(conn, by, data)
    return actors.load(conn, row["user_id"]), password


def project(conn, by, manager, **extra):
    data = {
        "name": f"Project {next(_n)}",
        "manager_id": manager.user_id,
        "start_date": "2026-10-01",
        "predicted_end_date": "2026-12-31",
        "budget_cents": 5_000_000,
    }
    data.update(extra)
    from services import projects
    return projects.create_project(conn, by, data)


def booking(conn, by, proj, who, **extra):
    data = {"user_id": who.user_id, "hours_per_week": 20, "start_date": "2026-10-01", "end_date": "2026-12-31"}
    data.update(extra)
    from services import assignments
    return assignments.create_booking(conn, by, proj["project_id"], data)


def deliverable(conn, by, proj, **extra):
    data = {"name": f"Deliverable {next(_n)}", "start_date": "2026-10-01", "due_date": "2026-11-30"}
    data.update(extra)
    from services import milestones
    return milestones.create_milestone(conn, by, proj["project_id"], data)


def task(conn, by, ms, assignee=None, **extra):
    data = {"title": f"Task {next(_n)}", "estimate_minutes": 240}
    if assignee is not None:
        data["assignee_user_id"] = assignee.user_id
    data.update(extra)
    from services import tasks
    return tasks.create_task(conn, by, ms["milestone_id"], data)


TODAY = dt.date(2026, 10, 14)  # a Wednesday; tests freeze the clock here
