"""Raw-SQL builders for schema tests. Each makes one valid row; tests then break one thing."""

from conftest import insert

_counter = iter(range(100_000, 999_999))


def user(conn, role="EMPLOYEE", **overrides):
    n = next(_counter)
    values = {
        "username": f"TT{n:06d}",
        "first_name": "Test",
        "last_name": "User",
        "email": f"user{n}@acme.test",
        "role": role,
        "password_hash": "x",
    }
    values.update(overrides)
    return insert(conn, "users", **values)


def project(conn, manager, **overrides):
    values = {
        "name": "Apollo",
        "manager_id": manager["user_id"],
        "start_date": "2026-10-01",
        "predicted_end_date": "2026-12-31",
        "created_by": manager["user_id"],
    }
    values.update(overrides)
    return insert(conn, "projects", **values)


def booking(conn, proj, person, **overrides):
    values = {
        "project_id": proj["project_id"],
        "user_id": person["user_id"],
        "hours_per_week": 20,
        "start_date": "2026-10-01",
        "end_date": "2026-10-31",
    }
    values.update(overrides)
    return insert(conn, "assignments", **values)


def milestone(conn, proj, **overrides):
    values = {
        "project_id": proj["project_id"],
        "name": "Design",
        "start_date": "2026-10-01",
        "due_date": "2026-10-31",
    }
    values.update(overrides)
    return insert(conn, "milestones", **values)


def task(conn, ms, creator, **overrides):
    values = {
        "milestone_id": ms["milestone_id"],
        "project_id": ms["project_id"],
        "title": "Write it",
        "estimate_minutes": 240,
        "created_by": creator["user_id"],
    }
    values.update(overrides)
    return insert(conn, "tasks", **values)


def entry(conn, tk, person, **overrides):
    values = {
        "task_id": tk["task_id"],
        "project_id": tk["project_id"],
        "user_id": person["user_id"],
        "work_date": "2026-10-13",
        "minutes": 120,
        "hourly_rate_cents": 4807,
    }
    values.update(overrides)
    return insert(conn, "time_entries", **values)


def audit_create(conn, entity_type, entity_id):
    insert(conn, "audit_log", action="CREATE", entity_type=entity_type, entity_id=entity_id, summary="test")


def refresh_token(conn, person, **overrides):
    values = {
        "user_id": person["user_id"],
        "token_hash": "a" * 64,
        "created_at": "2026-10-13 12:00+00",
        "expires_at": "2026-10-13 20:00+00",
    }
    values.update(overrides)
    return insert(conn, "refresh_tokens", **values)
