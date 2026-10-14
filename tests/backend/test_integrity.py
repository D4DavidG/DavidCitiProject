"""Each integrity query is empty on clean data and catches a planted violation."""

import pytest

import schema_rows as rows
from store import integrity

pytestmark = pytest.mark.no_integrity_check


@pytest.fixture
def clean(conn):
    """A small consistent world with every creation audited."""
    manager = rows.user(conn, role="MANAGER")
    alice = rows.user(conn, manager_id=manager["user_id"])
    apollo = rows.project(conn, manager)
    rows.booking(conn, apollo, alice)
    a, b, c = (rows.milestone(conn, apollo, name=n) for n in "ABC")
    conn.execute("INSERT INTO milestone_dependencies VALUES (%s, %s, %s), (%s, %s, %s)",
                 (a["milestone_id"], b["milestone_id"], apollo["project_id"],
                  b["milestone_id"], c["milestone_id"], apollo["project_id"]))
    tk = rows.task(conn, c, manager, assignee_user_id=alice["user_id"])
    rows.entry(conn, tk, alice)
    for table, key in [("users", "user_id"), ("projects", "project_id"), ("assignments", "assignment_id"),
                       ("milestones", "milestone_id"), ("tasks", "task_id"), ("time_entries", "entry_id")]:
        for row in conn.execute(f"SELECT {key} AS id FROM {table}").fetchall():
            rows.audit_create(conn, table, row["id"])
    return {"apollo": apollo, "a": a, "b": b, "c": c, "task": tk, "alice": alice}


def test_clean_data_has_no_violations(conn, clean):
    assert integrity.find_violations(conn) == {}


def test_catches_a_dependency_loop(conn, clean):
    conn.execute("INSERT INTO milestone_dependencies VALUES (%s, %s, %s)",
                 (clean["c"]["milestone_id"], clean["a"]["milestone_id"], clean["apollo"]["project_id"]))
    assert set(integrity.find_violations(conn)) == {"dependency_loops"}


def test_ignores_an_archived_link_that_would_close_a_loop(conn, clean):
    conn.execute("INSERT INTO milestone_dependencies VALUES (%s, %s, %s, TRUE, now())",
                 (clean["c"]["milestone_id"], clean["a"]["milestone_id"], clean["apollo"]["project_id"]))
    assert integrity.find_violations(conn) == {}


def test_catches_live_work_under_an_archived_project(conn, clean):
    conn.execute("UPDATE projects SET is_archived = TRUE, archived_at = now()")
    assert set(integrity.find_violations(conn)) == {"live_under_archived"}


def test_catches_a_record_without_its_audit_row(conn, clean):
    rows.task(conn, clean["a"], clean["alice"], title="Unaudited")
    assert set(integrity.find_violations(conn)) == {"audit"}


def test_catches_time_logged_outside_a_booking(conn, clean):
    e = rows.entry(conn, clean["task"], clean["alice"], work_date="2026-11-02")
    rows.audit_create(conn, "time_entries", e["entry_id"])
    assert set(integrity.find_violations(conn)) == {"time_outside_booking"}


def test_rejected_time_outside_a_booking_is_fine(conn, clean):
    manager_id = clean["apollo"]["manager_id"]
    e = rows.entry(conn, clean["task"], clean["alice"], work_date="2026-11-02", status="REJECTED",
                   decided_by=manager_id, decided_at="2026-11-03")
    rows.audit_create(conn, "time_entries", e["entry_id"])
    assert integrity.find_violations(conn) == {}


def test_catches_sign_off_with_an_unfinished_task(conn, clean):
    conn.execute("UPDATE milestones SET completed_at = now(), completed_by = %s WHERE milestone_id = %s",
                 (clean["apollo"]["manager_id"], clean["c"]["milestone_id"]))
    assert set(integrity.find_violations(conn)) == {"signed_off_unfinished"}


def test_catches_sign_off_while_a_dependency_is_open(conn, clean):
    conn.execute("UPDATE milestones SET completed_at = now(), completed_by = %s WHERE milestone_id = %s",
                 (clean["apollo"]["manager_id"], clean["b"]["milestone_id"]))
    assert set(integrity.find_violations(conn)) == {"signed_off_unfinished"}


def test_skip_leaves_out_the_named_check(conn, clean):
    rows.task(conn, clean["a"], clean["alice"], title="Unaudited")
    assert integrity.find_violations(conn, skip={"audit"}) == {}
