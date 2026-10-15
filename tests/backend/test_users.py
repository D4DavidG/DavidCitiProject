"""Accounts: creation, login, self-service, admin edits, capacity, archive.

Rule tests call the services directly and never import the api package.
"""

import datetime as dt
import hashlib
import re

import pytest

import factories as f
from domain import money
from domain.errors import AuthenticationError, Conflict, Forbidden, NotFound, OnProjects, ValidationError
from services import actors, assignments, projects, tasks, tokens, users

SECRET = "test-secret"
NOW = dt.datetime(2026, 10, 14, 15, 0, tzinfo=dt.timezone.utc)


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    boss, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    other_boss, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, alice_pw = f.person(conn, admin, manager=boss, first_name="Alice")
    return {"admin": admin, "boss": boss, "other_boss": other_boss, "alice": alice, "alice_pw": alice_pw}


# --- bootstrap and creation ----------------------------------------------

def test_bootstrap_admin_is_created_once(conn):
    users.bootstrap_admin(conn, "first-password")
    users.bootstrap_admin(conn, "second-password")
    rows = conn.execute("SELECT username, role, must_change_password FROM users").fetchall()
    assert rows == [{"username": "AD000001", "role": "ADMIN", "must_change_password": True}]


def test_bootstrap_admin_skips_the_hash_once_the_admin_exists(conn, monkeypatch):
    # Every Lambda cold start calls this inside the migration lock. On AWS (13 Oct) the
    # 600k-round hash made simultaneous cold starts queue about 1 s each, up to 11 s.
    users.bootstrap_admin(conn, "first-password")

    def no_hash(_password):
        raise AssertionError("hashed the bootstrap password although AD000001 exists")

    monkeypatch.setattr(users.passwords, "hash_password", no_hash)
    users.bootstrap_admin(conn, "first-password")


def test_admin_creates_a_user_with_generated_username_and_password(conn, org):
    row, password = users.create_user(conn, org["admin"], {
        "first_name": "David", "last_name": "Guamao", "email": "david@acme.test", "role": "EMPLOYEE",
        "annual_salary_cents": 5_000_000})
    assert re.fullmatch(r"DG\d{6}", row["username"])
    assert re.fullmatch(r"[A-Za-z0-9]{12}", password)
    assert row["must_change_password"] is True
    assert "password_hash" not in row


def test_only_admins_create_users(conn, org):
    with pytest.raises(Forbidden):
        users.create_user(conn, org["boss"], {"first_name": "A", "last_name": "B", "email": "a@acme.test",
                                              "role": "EMPLOYEE"})


def test_username_cannot_be_chosen_by_the_client(conn, org):
    with pytest.raises(ValidationError) as caught:
        users.create_user(conn, org["admin"], {"first_name": "A", "last_name": "B", "email": "a@acme.test",
                                               "role": "EMPLOYEE", "username": "AB123456"})
    assert caught.value.field == "username"


def test_line_manager_must_be_an_active_manager_or_admin(conn, org):
    with pytest.raises(ValidationError) as caught:
        users.create_user(conn, org["admin"], {"first_name": "A", "last_name": "B", "email": "a@acme.test",
                                               "role": "EMPLOYEE", "manager_id": org["alice"].user_id,
                                               "annual_salary_cents": 5_000_000})
    assert caught.value.field == "manager_id"


def test_duplicate_email_is_a_conflict(conn, org):
    with pytest.raises(Conflict, match="email"):
        users.create_user(conn, org["admin"], {"first_name": "A", "last_name": "B", "role": "EMPLOYEE",
                                               "annual_salary_cents": 5_000_000,
                                               "email": conn.execute("SELECT email FROM users WHERE user_id = %s",
                                                                     (org["alice"].user_id,)).fetchone()["email"].upper()})


# --- login and passwords --------------------------------------------------

def test_login_with_username_returns_a_token_for_that_user(conn, org):
    username = users.get_user(conn, org["alice"], org["alice"].user_id)["username"]
    result = users.login(conn, {"username": username.lower(), "password": org["alice_pw"]}, SECRET, NOW)
    assert tokens.verify(result["token"], SECRET, NOW).user_id == org["alice"].user_id
    assert result["refresh_token"]
    assert result["user"]["must_change_password"] is True


@pytest.mark.parametrize("case", ["wrong password", "unknown user", "archived user"])
def test_every_login_failure_gets_the_same_401(conn, org, case):
    username = users.get_user(conn, org["alice"], org["alice"].user_id)["username"]
    credentials = {"username": username, "password": org["alice_pw"]}
    if case == "wrong password":
        credentials["password"] = "nope-nope-nope"
    elif case == "unknown user":
        credentials["username"] = "ZZ999999"
    else:
        users.archive_user(conn, org["admin"], org["alice"].user_id, NOW)
    with pytest.raises(AuthenticationError) as caught:
        users.login(conn, credentials, SECRET, NOW)
    assert str(caught.value) == users.BAD_LOGIN


def test_unknown_username_costs_the_same_hashing_as_a_wrong_password(conn, org, monkeypatch):
    # The dummy check for an unknown username once ran at a fixed 1,000 rounds while real
    # hashes run at 600,000: about 1 s apart on AWS, enough to tell which usernames exist.
    # Any round count other than the suite's 1,000 exposes a dummy that doesn't follow ROUNDS.
    monkeypatch.setattr(users.passwords, "ROUNDS", 1234)
    bob, bob_pw = f.person(conn, org["admin"], first_name="Bob")
    username = users.get_user(conn, bob, bob.user_id)["username"]
    rounds_used = []
    real_pbkdf2 = hashlib.pbkdf2_hmac

    def spy(name, password, salt, rounds):
        rounds_used.append(rounds)
        return real_pbkdf2(name, password, salt, rounds)

    monkeypatch.setattr(hashlib, "pbkdf2_hmac", spy)
    for name in (username, "ZZ999999"):  # known user with a wrong password, then an unknown username
        with pytest.raises(AuthenticationError):
            users.login(conn, {"username": name, "password": "wrong-" + bob_pw}, SECRET, NOW)
    assert rounds_used == [1234, 1234]


def test_change_password_clears_the_forced_change(conn, org):
    users.change_password(conn, org["alice"], {"current_password": org["alice_pw"], "new_password": "brand-new-pw"}, SECRET, NOW)
    assert actors.load(conn, org["alice"].user_id).must_change_password is False
    username = users.get_user(conn, org["alice"], org["alice"].user_id)["username"]
    users.login(conn, {"username": username, "password": "brand-new-pw"}, SECRET, NOW)


@pytest.mark.parametrize("new,field", [("short", "new_password"), (None, "new_password")])
def test_new_password_rules(conn, org, new, field):
    with pytest.raises(ValidationError) as caught:
        users.change_password(conn, org["alice"], {"current_password": org["alice_pw"], "new_password": new}, SECRET, NOW)
    assert caught.value.field == field


def test_new_password_must_differ_from_the_current_one(conn, org):
    with pytest.raises(ValidationError, match="differ"):
        users.change_password(conn, org["alice"], {"current_password": org["alice_pw"],
                                                   "new_password": org["alice_pw"]}, SECRET, NOW)


def test_wrong_current_password_is_refused(conn, org):
    with pytest.raises(ValidationError) as caught:
        users.change_password(conn, org["alice"], {"current_password": "not-it-at-all", "new_password": "brand-new-pw"}, SECRET, NOW)
    assert caught.value.field == "current_password"


def test_admin_reset_generates_a_new_password_and_forces_a_change(conn, org):
    users.change_password(conn, org["alice"], {"current_password": org["alice_pw"], "new_password": "brand-new-pw"}, SECRET, NOW)
    new_password = users.reset_password(conn, org["admin"], org["alice"].user_id, NOW)
    assert actors.load(conn, org["alice"].user_id).must_change_password is True
    username = users.get_user(conn, org["alice"], org["alice"].user_id)["username"]
    users.login(conn, {"username": username, "password": new_password}, SECRET, NOW)


def test_only_admins_reset_passwords(conn, org):
    with pytest.raises(Forbidden):
        users.reset_password(conn, org["boss"], org["alice"].user_id, NOW)


# --- self-service and admin edits -----------------------------------------

def test_user_edits_own_name_and_email(conn, org):
    row = users.update_self(conn, org["alice"], {"first_name": "Alicia", "email": "alicia@acme.test"})
    assert (row["first_name"], row["email"]) == ("Alicia", "alicia@acme.test")


@pytest.mark.parametrize("field", ["username", "role", "annual_salary_cents", "manager_id", "user_id"])
def test_user_cannot_edit_anything_else_about_themselves(conn, org, field):
    with pytest.raises(ValidationError) as caught:
        users.update_self(conn, org["alice"], {field: 1})
    assert caught.value.field == field


def test_admin_edits_salary_role_and_manager(conn, org):
    row = users.admin_update(conn, org["admin"], org["alice"].user_id,
                             {"annual_salary_cents": 12_000_000, "manager_id": org["other_boss"].user_id})
    assert (row["annual_salary_cents"], row["manager_id"]) == (12_000_000, org["other_boss"].user_id)


def test_nobody_edits_a_username(conn, org):
    with pytest.raises(ValidationError) as caught:
        users.admin_update(conn, org["admin"], org["alice"].user_id, {"username": "AB000000"})
    assert caught.value.field == "username"


def test_admin_cannot_change_their_own_role_or_salary(conn, org):
    for change in ({"role": "EMPLOYEE"}, {"annual_salary_cents": 1}):
        with pytest.raises(Forbidden):
            users.admin_update(conn, org["admin"], org["admin"].user_id, change)


def test_managers_cannot_use_admin_edits(conn, org):
    with pytest.raises(Forbidden):
        users.admin_update(conn, org["boss"], org["alice"].user_id, {"job_title": "Lead"})


def test_manager_chain_cannot_loop(conn, org):
    users.admin_update(conn, org["admin"], org["boss"].user_id, {"manager_id": org["other_boss"].user_id})
    with pytest.raises(ValidationError, match="loop"):
        users.admin_update(conn, org["admin"], org["other_boss"].user_id, {"manager_id": org["boss"].user_id})


# --- capacity and overtime ---------------------------------------------------

def test_line_manager_sets_capacity_and_overtime(conn, org):
    row = users.set_capacity(conn, org["boss"], org["alice"].user_id,
                             {"weekly_capacity_hours": 30, "overtime_allowed": True})
    assert (row["weekly_capacity_hours"], row["overtime_allowed"]) == (30, True)


def test_line_manager_sets_the_task_limit(conn, org):
    row = users.set_capacity(conn, org["boss"], org["alice"].user_id, {"task_limit": 3})
    assert row["task_limit"] == 3


@pytest.mark.parametrize("limit, message", [(0, "between 1 and 10"), (11, "between 1 and 10"),
                                            ("3", "a whole number"), (2.5, "a whole number")])
def test_task_limit_must_be_1_to_10(conn, org, limit, message):
    # The message matters: before Task 2, only_allowed already raises a ValidationError on
    # field task_limit ("Task limit can't be changed here."), so checking the field alone passes early.
    with pytest.raises(ValidationError, match=f"^Task limit must be {message}.$") as caught:
        users.set_capacity(conn, org["boss"], org["alice"].user_id, {"task_limit": limit})
    assert caught.value.field == "task_limit"


def test_a_new_persons_task_limit_is_2(conn, org):
    assert users.get_user(conn, org["admin"], org["alice"].user_id)["task_limit"] == 2


def test_an_admin_sets_the_task_limit_through_the_account_edit(conn, org):
    assert users.admin_update(conn, org["admin"], org["alice"].user_id, {"task_limit": 4})["task_limit"] == 4


def test_another_manager_cannot_set_capacity(conn, org):
    with pytest.raises(NotFound):
        users.set_capacity(conn, org["other_boss"], org["alice"].user_id, {"overtime_allowed": True})


def test_employee_cannot_set_their_own_capacity(conn, org):
    with pytest.raises(Forbidden):
        users.set_capacity(conn, org["alice"], org["alice"].user_id, {"overtime_allowed": True})


# --- visibility -----------------------------------------------------------

def test_employee_sees_only_themselves(conn, org):
    with pytest.raises(NotFound):
        users.get_user(conn, org["alice"], org["boss"].user_id)


def test_salary_visible_to_admin_and_self_only(conn, org):
    alice_row = users.get_user(conn, org["alice"], org["alice"].user_id)
    assert users.can_see_salary(org["alice"], alice_row)
    assert users.can_see_salary(org["admin"], alice_row)
    assert not users.can_see_salary(org["boss"], alice_row)


def test_list_users_searches_filters_and_paginates(conn, org):
    page = users.list_users(conn, org["admin"], {"search": "ali", "role": "EMPLOYEE"}, page=1, page_size=10)
    assert [u["first_name"] for u in page["items"]] == ["Alice"]
    assert (page["total"], page["page"], page["page_size"], page["total_pages"]) == (1, 1, 10, 1)


def test_list_users_takes_q_like_every_other_list(conn, org):
    page = users.list_users(conn, org["admin"], {"q": "ALI"}, page=1, page_size=10)
    assert [u["first_name"] for u in page["items"]] == ["Alice"]


def test_employees_cannot_list_users(conn, org):
    with pytest.raises(Forbidden):
        users.list_users(conn, org["alice"], {}, page=1, page_size=10)


# --- archive ----------------------------------------------------------------

def test_archiving_a_person_archives_their_live_bookings(conn, org):
    proj = f.project(conn, org["admin"], org["boss"])
    f.booking(conn, org["admin"], proj, org["alice"])
    users.archive_user(conn, org["admin"], org["alice"].user_id, NOW, {"confirm_on_projects": True})
    live = conn.execute("SELECT count(*) AS n FROM assignments WHERE user_id = %s AND NOT is_archived",
                        (org["alice"].user_id,)).fetchone()["n"]
    assert live == 0


def test_archiving_a_manager_with_live_projects_or_reports_is_refused(conn, org):
    with pytest.raises(Conflict, match="report"):
        users.archive_user(conn, org["admin"], org["boss"].user_id, NOW)
    f.project(conn, org["admin"], org["other_boss"])
    with pytest.raises(Conflict, match="project"):
        users.archive_user(conn, org["admin"], org["other_boss"].user_id, NOW)


def test_admin_cannot_archive_themselves(conn, org):
    with pytest.raises(Conflict):
        users.archive_user(conn, org["admin"], org["admin"].user_id, NOW)


def test_reactivate_brings_a_person_back(conn, org):
    users.archive_user(conn, org["admin"], org["alice"].user_id, NOW)
    row = users.reactivate_user(conn, org["admin"], org["alice"].user_id)
    assert row["is_archived"] is False


# --- what a person is on now (GET /users/{id}/projects) and the archive question ----------

def _project(conn, org, name):
    return f.project(conn, org["admin"], org["boss"], name=name, start_date="2026-09-01")


@pytest.fixture
def involved(conn, org):
    """Alice's projects on Wednesday 14 Oct: four she is on now, four she isn't."""
    admin, boss, alice = org["admin"], org["boss"], org["alice"]
    apollo = _project(conn, org, "Apollo")  # booked now (20 h until 31 Oct), and again from November
    f.booking(conn, boss, apollo, alice, hours_per_week=20, start_date="2026-10-01", end_date="2026-10-31")
    f.booking(conn, boss, apollo, alice, hours_per_week=10, start_date="2026-11-01", end_date="2026-12-31")
    juno = _project(conn, org, "Juno")  # a booking that ends today still counts
    f.booking(conn, boss, juno, alice, hours_per_week=5, start_date="2026-10-01", end_date="2026-10-14")
    hermes = _project(conn, org, "Hermes")  # booked from November only: on it, 0 h this week
    f.booking(conn, boss, hermes, alice, hours_per_week=8, start_date="2026-11-02", end_date="2026-11-30")
    zeus = _project(conn, org, "Zeus")  # her booking ended in September, but two tasks are still open
    f.booking(conn, boss, zeus, alice, start_date="2026-09-01", end_date="2026-09-30")
    zeus_work = f.deliverable(conn, boss, zeus)
    f.task(conn, boss, zeus_work, assignee=alice)
    tasks.move_task(conn, alice, f.task(conn, boss, zeus_work, assignee=alice)["task_id"], "IN_PROGRESS")
    # Not on these: a booking that ended yesterday and a task that is done; an archived booking;
    # an archived task; an archived project.
    old = _project(conn, org, "Old")
    f.booking(conn, boss, old, alice, start_date="2026-09-01", end_date="2026-10-13")
    tasks.move_task(conn, alice, f.task(conn, boss, f.deliverable(conn, boss, old), assignee=alice)["task_id"], "DONE")
    vesta = _project(conn, org, "Vesta")
    assignments.archive_booking(conn, boss, f.booking(conn, boss, vesta, alice)["assignment_id"])
    mars = _project(conn, org, "Mars")
    f.booking(conn, boss, mars, alice, start_date="2026-09-01", end_date="2026-09-30")
    tasks.archive_task(conn, boss, f.task(conn, boss, f.deliverable(conn, boss, mars), assignee=alice)["task_id"])
    pluto = _project(conn, org, "Pluto")
    f.booking(conn, boss, pluto, alice)
    f.task(conn, boss, f.deliverable(conn, boss, pluto), assignee=alice)
    projects.archive_project(conn, admin, pluto["project_id"])
    return {"apollo": apollo, "juno": juno, "hermes": hermes, "zeus": zeus}


def test_live_projects_are_bookings_from_today_on_and_open_tasks(conn, org, involved):
    page = users.live_projects(conn, org["admin"], org["alice"].user_id, 1, 20)

    def item(name, hours, end, open_tasks):
        p = involved[name.lower()]
        return {"project_id": p["project_id"], "name": name, "status": p["status"], "hours_per_week": hours,
                "booking_end_date": end, "open_task_count": open_tasks}

    # By name. Hours and end date come from the bookings that cover today.
    assert page["items"] == [item("Apollo", 20, "2026-10-31", 0), item("Hermes", 0, None, 0),
                             item("Juno", 5, "2026-10-14", 0), item("Zeus", 0, None, 2)]
    assert (page["total"], page["page"], page["page_size"], page["total_pages"]) == (4, 1, 20, 1)


def test_live_projects_are_paginated(conn, org, involved):
    page = users.live_projects(conn, org["admin"], org["alice"].user_id, 2, 3)
    assert [p["name"] for p in page["items"]] == ["Zeus"]
    assert (page["total"], page["page"], page["page_size"], page["total_pages"]) == (4, 2, 3, 2)


@pytest.mark.parametrize("reader", ["admin", "boss", "alice"])
def test_admins_the_line_manager_and_the_person_read_their_live_projects(conn, org, involved, reader):
    assert users.live_projects(conn, org[reader], org["alice"].user_id, 1, 20)["total"] == 4


def test_anyone_else_gets_the_same_404_as_a_missing_person(conn, org):
    bea, _ = f.person(conn, org["admin"], manager=org["boss"], first_name="Bea")
    missing = conn.execute("SELECT max(user_id) + 1 AS n FROM users").fetchone()["n"]
    messages = []
    for reader, target in ((org["other_boss"], org["alice"].user_id), (bea, org["alice"].user_id),
                           (org["alice"], org["boss"].user_id), (org["admin"], missing)):
        with pytest.raises(NotFound) as caught:
            users.live_projects(conn, reader, target, 1, 20)
        messages.append(str(caught.value))
    assert messages == ["User not found."] * 4


def _audit_rows(conn):
    return conn.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"]


def test_archiving_someone_on_live_projects_asks_first_and_changes_nothing(conn, org, involved):
    rows = _audit_rows(conn)
    for data in (None, {}, {"confirm_on_projects": False}, {"confirm_on_projects": "true"}, {"confirm_on_projects": 1}):
        with pytest.raises(OnProjects) as caught:
            users.archive_user(conn, org["admin"], org["alice"].user_id, NOW, data)
        assert caught.value.code == "ON_PROJECTS"
        assert str(caught.value) == ("Alice Tester is still on 4 live projects: Apollo, Hermes, Juno, Zeus."
                                     " Archiving ends their bookings there; their open tasks stay assigned to them.")
    assert users.get_user(conn, org["admin"], org["alice"].user_id)["is_archived"] is False
    assert _audit_rows(conn) == rows
    assert users.live_projects(conn, org["admin"], org["alice"].user_id, 1, 20)["total"] == 4


def test_the_archive_question_names_one_live_project_in_the_singular(conn, org):
    f.booking(conn, org["boss"], _project(conn, org, "Apollo"), org["alice"])
    with pytest.raises(OnProjects, match=r"^Alice Tester is still on 1 live project: Apollo\. Archiving"):
        users.archive_user(conn, org["admin"], org["alice"].user_id, NOW)


def test_a_confirmed_archive_ends_the_bookings_and_leaves_open_tasks_assigned(conn, org, involved):
    row = users.archive_user(conn, org["admin"], org["alice"].user_id, NOW, {"confirm_on_projects": True})
    assert row["is_archived"] is True
    counts = conn.execute(
        "SELECT (SELECT count(*) FROM assignments WHERE user_id = %(me)s AND NOT is_archived) AS bookings,"
        " (SELECT count(*) FROM tasks WHERE assignee_user_id = %(me)s AND NOT is_archived AND status <> 'DONE') AS open",
        {"me": org["alice"].user_id}).fetchone()
    assert (counts["bookings"], counts["open"]) == (0, 2)


def test_archiving_someone_on_no_live_project_needs_no_confirmation(conn, org):
    f.booking(conn, org["boss"], _project(conn, org, "Old"), org["alice"], start_date="2026-09-01",
              end_date="2026-10-13")
    assert users.archive_user(conn, org["admin"], org["alice"].user_id, NOW)["is_archived"] is True


def test_the_archive_body_takes_only_the_confirmation(conn, org):
    with pytest.raises(ValidationError) as caught:
        users.archive_user(conn, org["admin"], org["alice"].user_id, NOW, {"confirm_on_project": True})
    assert caught.value.field == "confirm_on_project"


# --- minimum pay: $20 an hour ---------------------------------------------------------

def test_minimum_pay_is_20_dollars_an_hour_for_2080_hours():
    assert money.MIN_ANNUAL_SALARY_CENTS == 20_00 * money.HOURS_PER_YEAR == 4_160_000
    assert money.PAY_TOO_LOW == "Pay must be at least $20 an hour ($41,600 a year)."


NEW_PERSON = {"first_name": "Dana", "last_name": "Diaz", "email": "dana@acme.test", "role": "EMPLOYEE"}


def test_a_new_account_needs_pay(conn, org):
    for data in (NEW_PERSON, {**NEW_PERSON, "annual_salary_cents": None}):
        with pytest.raises(ValidationError) as caught:
            users.create_user(conn, org["admin"], data)
        assert (str(caught.value), caught.value.field) == ("Pay is required.", "annual_salary_cents")


@pytest.mark.parametrize("low", [100, 4_159_999, 0, -5])
def test_a_new_account_paid_under_20_dollars_an_hour_is_refused(conn, org, low):
    with pytest.raises(ValidationError) as caught:
        users.create_user(conn, org["admin"], {**NEW_PERSON, "annual_salary_cents": low})
    assert (str(caught.value), caught.value.field) == (money.PAY_TOO_LOW, "annual_salary_cents")
    assert conn.execute("SELECT 1 FROM users WHERE email = 'dana@acme.test'").fetchone() is None


@pytest.mark.parametrize("bad", ["4160000", 4_160_000.0, True, 10**12 + 1])
def test_pay_must_be_whole_cents_within_reason(conn, org, bad):
    with pytest.raises(ValidationError) as caught:
        users.create_user(conn, org["admin"], {**NEW_PERSON, "annual_salary_cents": bad})
    assert caught.value.field == "annual_salary_cents"


def test_exactly_20_dollars_an_hour_is_allowed(conn, org):
    row, _ = users.create_user(conn, org["admin"], {**NEW_PERSON, "annual_salary_cents": 4_160_000})
    assert row["annual_salary_cents"] == 4_160_000


def test_a_pay_change_under_the_minimum_is_refused_and_an_older_low_salary_stays(conn, org):
    alice = org["alice"].user_id
    conn.execute("UPDATE users SET annual_salary_cents = 3000000 WHERE user_id = %s", (alice,))  # set before the rule
    with pytest.raises(ValidationError) as caught:
        users.admin_update(conn, org["admin"], alice, {"annual_salary_cents": 4_000_000})
    assert (str(caught.value), caught.value.field) == (money.PAY_TOO_LOW, "annual_salary_cents")
    row = users.admin_update(conn, org["admin"], alice, {"job_title": "Analyst"})  # other edits still work
    assert (row["job_title"], row["annual_salary_cents"]) == ("Analyst", 3_000_000)
    assert users.admin_update(conn, org["admin"], alice, {"annual_salary_cents": 5_000_000})["annual_salary_cents"] == 5_000_000


def test_the_bootstrap_admin_is_created_without_pay(conn):
    users.bootstrap_admin(conn, "first-password")
    assert conn.execute("SELECT annual_salary_cents FROM users WHERE username = 'AD000001'").fetchone() == {
        "annual_salary_cents": 0}
