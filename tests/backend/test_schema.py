"""Postgres itself refuses bad rows (spec section 4).

One test per rule. Each builds valid rows, breaks exactly one thing, and checks
which named constraint refused it.
"""

import pytest

import schema_rows as rows
from conftest import refused

pytestmark = pytest.mark.schema


@pytest.fixture
def world(conn):
    manager = rows.user(conn, role="MANAGER")
    alice = rows.user(conn, manager_id=manager["user_id"])
    apollo = rows.project(conn, manager)
    zeus = rows.project(conn, manager, name="Zeus")
    ms = rows.milestone(conn, apollo)
    other_ms = rows.milestone(conn, zeus)
    tk = rows.task(conn, ms, manager, assignee_user_id=alice["user_id"])
    rows.booking(conn, apollo, alice)
    return {"manager": manager, "alice": alice, "apollo": apollo, "zeus": zeus,
            "ms": ms, "other_ms": other_ms, "task": tk}


# --- users ---------------------------------------------------------------

@pytest.mark.parametrize("username", ["dg482913", "DG48291", "D1482913", "D-482913", ""])
def test_username_must_be_two_capitals_and_six_digits(conn, username):
    assert refused(conn, "INSERT INTO users (username, first_name, last_name, email, role, password_hash)"
                         " VALUES (%s, 'A', 'B', 'a@acme.test', 'EMPLOYEE', 'x')", (username,)) == "users_username_format"


def test_username_longer_than_8_is_refused(conn):
    assert refused(conn, "INSERT INTO users (username, first_name, last_name, email, role, password_hash)"
                         " VALUES ('DGX482913', 'A', 'B', 'a@acme.test', 'EMPLOYEE', 'x')") == "StringDataRightTruncation"


def test_username_is_unique(conn):
    rows.user(conn, username="DG482913")
    assert refused(conn, "INSERT INTO users (username, first_name, last_name, email, role, password_hash)"
                         " VALUES ('DG482913', 'A', 'B', 'other@acme.test', 'EMPLOYEE', 'x')") == "users_username_unique"


def test_email_is_unique_ignoring_case(conn):
    rows.user(conn, email="ana@acme.test")
    assert refused(conn, "INSERT INTO users (username, first_name, last_name, email, role, password_hash)"
                         " VALUES ('AB000001', 'A', 'B', 'ANA@ACME.TEST', 'EMPLOYEE', 'x')") == "users_email_unique"


def test_names_must_not_be_blank(conn):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET first_name = '  ' WHERE user_id = %s", (person["user_id"],)) == "users_names_present"


def test_role_must_be_known(conn):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET role = 'BOSS' WHERE user_id = %s", (person["user_id"],)) == "users_role_valid"


def test_nobody_is_their_own_manager(conn):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET manager_id = user_id WHERE user_id = %s",
                   (person["user_id"],)) == "users_not_own_manager"


def test_salary_cannot_be_negative(conn):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET annual_salary_cents = -1 WHERE user_id = %s",
                   (person["user_id"],)) == "users_salary_positive"


@pytest.mark.parametrize("hours", [0, 61])
def test_capacity_is_1_to_60_hours(conn, hours):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET weekly_capacity_hours = %s WHERE user_id = %s",
                   (hours, person["user_id"])) == "users_capacity_range"


def test_task_limit_defaults_to_2(conn):
    assert rows.user(conn)["task_limit"] == 2


@pytest.mark.parametrize("limit", [0, 11])
def test_task_limit_is_1_to_10(conn, limit):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET task_limit = %s WHERE user_id = %s",
                   (limit, person["user_id"])) == "users_task_limit_range"


def test_new_users_default_to_40_hours_no_overtime_and_must_change_password(conn):
    person = rows.user(conn)
    assert (person["weekly_capacity_hours"], person["overtime_allowed"], person["must_change_password"]) == (40, False, True)


def test_archive_flag_and_timestamp_agree(conn):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET is_archived = TRUE WHERE user_id = %s",
                   (person["user_id"],)) == "users_archive_consistent"


# --- projects, bookings, requests ----------------------------------------

def test_project_end_cannot_precede_start(conn, world):
    assert refused(conn, "UPDATE projects SET predicted_end_date = '2026-09-01' WHERE project_id = %s",
                   (world["apollo"]["project_id"],)) == "projects_dates_ordered"


def test_budget_cannot_be_negative(conn, world):
    assert refused(conn, "UPDATE projects SET budget_cents = -1 WHERE project_id = %s",
                   (world["apollo"]["project_id"],)) == "projects_budget_positive"


def test_project_status_must_be_known(conn, world):
    assert refused(conn, "UPDATE projects SET status = 'DONE' WHERE project_id = %s",
                   (world["apollo"]["project_id"],)) == "projects_status_valid"


@pytest.mark.parametrize("hours", [0, 41])
def test_booking_is_1_to_40_hours(conn, world, hours):
    with pytest.raises(Exception) as caught:
        with conn.transaction():
            rows.booking(conn, world["apollo"], world["alice"], hours_per_week=hours)
    assert caught.value.diag.constraint_name == "assignments_hours_range"


def test_overlapping_live_bookings_on_one_project_are_refused(conn, world):
    with pytest.raises(Exception) as caught:
        with conn.transaction():
            rows.booking(conn, world["apollo"], world["alice"], start_date="2026-10-20", end_date="2026-11-20")
    assert caught.value.diag.constraint_name == "assignments_no_overlap"


def test_an_archived_booking_does_not_block_a_new_one(conn, world):
    conn.execute("UPDATE assignments SET is_archived = TRUE, archived_at = now()")
    rows.booking(conn, world["apollo"], world["alice"])


def test_overlapping_bookings_on_different_projects_are_fine(conn, world):
    rows.booking(conn, world["zeus"], world["alice"])


def test_request_decision_fields_agree(conn, world):
    assert refused(conn, "INSERT INTO project_requests (requested_by, name, justification, status)"
                         " VALUES (%s, 'X', 'Because', 'REJECTED')",
                   (world["manager"]["user_id"],)) == "requests_decision_consistent"


def test_one_project_per_request(conn, world):
    sql = ("INSERT INTO project_requests (requested_by, name, justification, status, decided_by,"
           " decided_at, created_project_id) VALUES (%(m)s, 'X', 'Because', 'APPROVED', %(a)s, now(), %(p)s)")
    params = {"m": world["manager"]["user_id"], "a": world["alice"]["user_id"], "p": world["apollo"]["project_id"]}
    conn.execute(sql, params)
    assert refused(conn, sql, params) == "requests_one_project"


# Requests of every kind (migration 003)
NEW_REQUEST = ("INSERT INTO project_requests (requested_by, name, justification, kind, project_id, task_limit,"
               " proposed_start) VALUES (%(m)s, 'X', 'Because', %(kind)s, %(p)s, %(limit)s, %(start)s)")


def ask(world, kind, project=None, limit=None, start=None):
    """Parameters for NEW_REQUEST: one request of this kind from the manager."""
    return {"m": world["manager"]["user_id"], "kind": kind, "p": project, "limit": limit, "start": start}


def test_request_kind_must_be_known(conn, world):
    assert refused(conn, NEW_REQUEST, ask(world, "RAISE")) == "requests_kind_valid"


def test_archive_request_needs_a_project(conn, world):
    assert refused(conn, NEW_REQUEST, ask(world, "ARCHIVE_PROJECT")) == "requests_project_iff_archive"
    assert refused(conn, NEW_REQUEST, ask(world, "NEW_PROJECT", project=world["apollo"]["project_id"])) \
        == "requests_project_iff_archive"


@pytest.mark.parametrize("kind, limit", [("TASK_LIMIT", None), ("TASK_LIMIT", 11), ("OVERTIME", 3)])
def test_task_limit_request_needs_a_limit_in_range(conn, world, kind, limit):
    assert refused(conn, NEW_REQUEST, ask(world, kind, limit=limit)) == "requests_limit_iff_task_limit"


def test_only_new_project_requests_have_dates(conn, world):
    assert refused(conn, NEW_REQUEST, ask(world, "OTHER", start="2026-11-01")) == "requests_dates_only_new_project"


def test_nobody_decides_their_own_request(conn, world):
    assert refused(conn, "INSERT INTO project_requests (requested_by, name, justification, kind, status,"
                         " decided_by, decided_at) VALUES (%(m)s, 'X', 'Because', 'OTHER', 'REJECTED', %(m)s, now())",
                   {"m": world["manager"]["user_id"]}) == "requests_not_self_decided"


def test_only_an_approved_new_project_links_a_project(conn, world):
    alice = world["alice"]["user_id"]
    assert refused(conn, "INSERT INTO project_requests (requested_by, name, justification, kind, project_id, status,"
                         " decided_by, decided_at, created_project_id) VALUES (%(m)s, 'X', 'Because',"
                         " 'ARCHIVE_PROJECT', %(p)s, 'APPROVED', %(a)s, now(), %(p)s)",
                   {"m": world["manager"]["user_id"], "a": alice, "p": world["zeus"]["project_id"]}) \
        == "requests_project_iff_approved"


def test_old_shaped_request_is_still_a_project_request(conn, world):
    row = conn.execute("INSERT INTO project_requests (requested_by, name, justification) VALUES (%s, 'X', 'Because')"
                       " RETURNING kind", (world["manager"]["user_id"],)).fetchone()
    assert row["kind"] == "NEW_PROJECT"


# --- deliverables, dependencies, tasks, time -----------------------------

def test_sign_off_needs_who_and_when(conn, world):
    assert refused(conn, "UPDATE milestones SET completed_at = now() WHERE milestone_id = %s",
                   (world["ms"]["milestone_id"],)) == "milestones_signoff_consistent"


def test_deliverable_cannot_depend_on_itself(conn, world):
    ms = world["ms"]
    assert refused(conn, "INSERT INTO milestone_dependencies VALUES (%s, %s, %s)",
                   (ms["milestone_id"], ms["milestone_id"], ms["project_id"])) == "dependencies_not_self"


def test_dependencies_stay_within_one_project(conn, world):
    ms, other = world["ms"], world["other_ms"]
    assert refused(conn, "INSERT INTO milestone_dependencies VALUES (%s, %s, %s)",
                   (ms["milestone_id"], other["milestone_id"], ms["project_id"])) == "dependencies_same_project_to"


def test_task_must_be_on_its_deliverables_project(conn, world):
    assert refused(conn, "INSERT INTO tasks (milestone_id, project_id, title, estimate_minutes, created_by)"
                         " VALUES (%s, %s, 'X', 60, %s)",
                   (world["other_ms"]["milestone_id"], world["apollo"]["project_id"],
                    world["manager"]["user_id"])) == "tasks_on_project_milestone"


def test_task_done_iff_completed_timestamp(conn, world):
    assert refused(conn, "UPDATE tasks SET status = 'DONE' WHERE task_id = %s",
                   (world["task"]["task_id"],)) == "tasks_done_consistent"


@pytest.mark.parametrize("minutes", [0, 60001])
def test_task_estimate_range(conn, world, minutes):
    assert refused(conn, "UPDATE tasks SET estimate_minutes = %s WHERE task_id = %s",
                   (minutes, world["task"]["task_id"])) == "tasks_estimate_range"


def test_time_entry_must_be_on_its_tasks_project(conn, world):
    assert refused(conn, "INSERT INTO time_entries (task_id, project_id, user_id, work_date, minutes, hourly_rate_cents)"
                         " VALUES (%s, %s, %s, '2026-10-13', 60, 100)",
                   (world["task"]["task_id"], world["zeus"]["project_id"],
                    world["alice"]["user_id"])) == "time_entries_on_project_task"


@pytest.mark.parametrize("minutes", [0, 1441])
def test_time_entry_is_1_minute_to_24_hours(conn, world, minutes):
    with pytest.raises(Exception) as caught:
        with conn.transaction():
            rows.entry(conn, world["task"], world["alice"], minutes=minutes)
    assert caught.value.diag.constraint_name == "time_entries_minutes_range"


def test_nobody_approves_their_own_time(conn, world):
    e = rows.entry(conn, world["task"], world["alice"])
    assert refused(conn, "UPDATE time_entries SET status = 'APPROVED', decided_by = user_id, decided_at = now()"
                         " WHERE entry_id = %s", (e["entry_id"],)) == "time_entries_not_own_approval"


def test_decision_needs_who_and_when(conn, world):
    e = rows.entry(conn, world["task"], world["alice"])
    assert refused(conn, "UPDATE time_entries SET status = 'APPROVED', decided_by = %s WHERE entry_id = %s",
                   (world["manager"]["user_id"], e["entry_id"])) == "time_entries_decision_consistent"


def test_line_manager_can_approve(conn, world):
    e = rows.entry(conn, world["task"], world["alice"])
    conn.execute("UPDATE time_entries SET status = 'APPROVED', decided_by = %s, decided_at = now()"
                 " WHERE entry_id = %s", (world["manager"]["user_id"], e["entry_id"]))
