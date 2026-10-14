"""Nothing is deleted, and the audit log is append-only: Postgres itself refuses."""

import pytest

import schema_rows as rows
from conftest import insert, refused

pytestmark = pytest.mark.schema

TABLES = ["users", "projects", "assignments", "milestones", "milestone_dependencies",
          "tasks", "time_entries", "project_requests", "notifications", "audit_log"]


@pytest.fixture
def one_of_everything(conn):
    """A row in every table: a row-level trigger only fires when there is a row to delete."""
    manager = rows.user(conn, role="MANAGER")
    alice = rows.user(conn, manager_id=manager["user_id"])
    proj = rows.project(conn, manager)
    rows.booking(conn, proj, alice)
    a, b = rows.milestone(conn, proj), rows.milestone(conn, proj, name="B")
    conn.execute("INSERT INTO milestone_dependencies VALUES (%s, %s, %s)",
                 (a["milestone_id"], b["milestone_id"], proj["project_id"]))
    rows.entry(conn, rows.task(conn, a, manager), alice)
    insert(conn, "project_requests", requested_by=manager["user_id"], name="X", justification="Y")
    insert(conn, "audit_log", action="CREATE", entity_type="x", entity_id=1, summary="s")
    conn.execute("INSERT INTO notifications (recipient_user_id, audit_id) SELECT %s, max(audit_id) FROM audit_log",
                 (manager["user_id"],))


@pytest.mark.parametrize("table", TABLES)
def test_delete_is_refused_on_every_table(conn, one_of_everything, table):
    assert conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"] > 0
    assert refused(conn, f"DELETE FROM {table}") == "RestrictViolation"


def test_audit_rows_cannot_be_edited(conn):
    insert(conn, "audit_log", action="CREATE", entity_type="x", entity_id=1, summary="s")
    assert refused(conn, "UPDATE audit_log SET summary = 'changed'") == "RestrictViolation"


def test_every_table_in_the_schema_is_covered(conn):
    found = conn.execute("SELECT table_name FROM information_schema.tables"
                        " WHERE table_schema = 'public' AND table_name <> 'schema_migrations'").fetchall()
    assert {r["table_name"] for r in found} == set(TABLES)
