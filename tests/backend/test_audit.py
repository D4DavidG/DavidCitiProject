"""Every change writes an audit row, and that row notifies everyone above the actor.

| Actor (stored role) | Notified                                  |
| Employee            | their line manager and every admin, plus  |
|                     | the project's manager for project work    |
| Manager             | every admin                               |
| Admin               | every other admin                         |
Whatever the actor's role, the person the record is about is told too (their account,
their booking, their task: old and new assignee, their logged time), never the actor.
Edge cases: no line manager -> admins only; a lone admin -> nobody; archived users
receive nothing; nobody is told twice about one change.
"""

import datetime as dt

import pytest

import factories as f
from domain.errors import NotFound
from services import audit, notifications, requests, tasks, time_entries, users

NOW = dt.datetime(2026, 10, 14, 12, 0, tzinfo=dt.timezone.utc)


def recipients_of_last_change(conn):
    rows = conn.execute("SELECT recipient_user_id FROM notifications WHERE audit_id ="
                        " (SELECT max(audit_id) FROM audit_log) ORDER BY 1").fetchall()
    return [r["recipient_user_id"] for r in rows]


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    admin2, _ = f.person(conn, admin, role="ADMIN", first_name="Ada")
    boss, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    alice, _ = f.person(conn, admin, manager=boss, first_name="Alice")
    loner, _ = f.person(conn, admin, first_name="Lone")
    return {"admin": admin, "admin2": admin2, "boss": boss, "alice": alice, "loner": loner}


def test_employee_change_notifies_line_manager_and_admins(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    assert recipients_of_last_change(conn) == sorted([org["boss"].user_id, org["admin"].user_id, org["admin2"].user_id])


def test_employee_without_manager_notifies_admins_only(conn, org):
    users.update_self(conn, org["loner"], {"first_name": "Solo"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


def test_manager_change_notifies_every_admin(conn, org):
    users.update_self(conn, org["boss"], {"first_name": "Robert"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


def test_admin_change_notifies_other_admins_only(conn, org):
    users.update_self(conn, org["admin"], {"first_name": "Root"})
    assert recipients_of_last_change(conn) == [org["admin2"].user_id]


def test_lone_admin_notifies_nobody_but_is_still_audited(conn):
    admin = f.admin(conn)
    users.update_self(conn, admin, {"first_name": "Root"})
    last = conn.execute("SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1").fetchone()
    assert last["entity_type"] == "users" and last["actor_role"] == "ADMIN"
    assert recipients_of_last_change(conn) == []


@pytest.fixture
def work(conn, org):
    """Alice (line manager Bob) booked on a project that Pam manages, with a task of hers."""
    pam, _ = f.person(conn, org["admin"], role="MANAGER", first_name="Pam")
    proj = f.project(conn, org["admin"], pam)
    f.booking(conn, pam, proj, org["alice"])
    task = f.task(conn, pam, f.deliverable(conn, pam, proj), assignee=org["alice"])
    return {"pam": pam, "proj": proj, "task": task}


def test_employee_project_change_also_notifies_the_project_manager(conn, org, work):
    tasks.move_task(conn, org["alice"], work["task"]["task_id"], "IN_PROGRESS")
    assert recipients_of_last_change(conn) == sorted(
        [org["boss"].user_id, work["pam"].user_id, org["admin"].user_id, org["admin2"].user_id])


def test_employee_logging_time_notifies_the_project_manager(conn, org, work):
    time_entries.log_time(conn, org["alice"], work["task"]["task_id"], {"work_date": "2026-10-13", "minutes": 90})
    assert work["pam"].user_id in recipients_of_last_change(conn)


def test_project_manager_who_is_also_the_line_manager_is_notified_once(conn, org):
    proj = f.project(conn, org["admin"], org["boss"])
    f.booking(conn, org["boss"], proj, org["alice"])
    task = f.task(conn, org["boss"], f.deliverable(conn, org["boss"], proj), assignee=org["alice"])
    tasks.move_task(conn, org["alice"], task["task_id"], "IN_PROGRESS")
    assert recipients_of_last_change(conn) == sorted([org["boss"].user_id, org["admin"].user_id, org["admin2"].user_id])


def test_manager_project_change_notifies_admins_and_the_assignee(conn, org, work):
    # Not Alice's line manager (Bob): a manager's change goes up to the admins, and to the person it is about.
    tasks.update_task(conn, work["pam"], work["task"]["task_id"], {"title": "Renamed"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id,
                                                      org["alice"].user_id])


def test_archived_users_receive_nothing(conn, org):
    users.archive_user(conn, org["admin"], org["admin2"].user_id, NOW)
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    assert recipients_of_last_change(conn) == sorted([org["boss"].user_id, org["admin"].user_id])


# --- the person a change is about (redesign spec, section 4) ----------------------------

def admins_and(org, *people):
    return sorted([org["admin"].user_id, org["admin2"].user_id, *(p.user_id for p in people)])


def test_a_change_to_your_account_tells_you(conn, org):
    users.set_capacity(conn, org["boss"], org["alice"].user_id, {"weekly_capacity_hours": 30})
    assert recipients_of_last_change(conn) == admins_and(org, org["alice"])


def test_a_new_account_is_not_told_it_was_created(conn, org):
    # Creation isn't a change to someone who already exists, and it would leave a stray first bell.
    newcomer, _ = f.person(conn, org["admin"], manager=org["boss"])
    assert newcomer.user_id not in recipients_of_last_change(conn)


def test_being_booked_on_a_project_tells_you(conn, org, work):
    other = f.project(conn, org["admin"], work["pam"])
    f.booking(conn, work["pam"], other, org["alice"])
    assert recipients_of_last_change(conn) == admins_and(org, org["alice"])


def test_being_given_a_task_tells_you(conn, org, work):
    f.task(conn, work["pam"], f.deliverable(conn, work["pam"], work["proj"]), assignee=org["alice"])
    assert recipients_of_last_change(conn) == admins_and(org, org["alice"])


def test_a_reassignment_tells_the_old_and_the_new_assignee(conn, org, work):
    bea, _ = f.person(conn, org["admin"], manager=org["boss"], first_name="Bea")
    f.booking(conn, work["pam"], work["proj"], bea)
    tasks.update_task(conn, work["pam"], work["task"]["task_id"], {"assignee_user_id": bea.user_id})
    assert recipients_of_last_change(conn) == admins_and(org, org["alice"], bea)


def test_a_decision_on_your_logged_time_tells_you(conn, org, work):
    entry = time_entries.log_time(conn, org["alice"], work["task"]["task_id"], {"work_date": "2026-10-13", "minutes": 90})
    time_entries.decide_entry(conn, org["boss"], entry["entry_id"], approve=True)
    assert recipients_of_last_change(conn) == admins_and(org, org["alice"])


def test_you_are_not_told_about_your_own_change(conn, org, work):
    tasks.move_task(conn, org["alice"], work["task"]["task_id"], "IN_PROGRESS")
    assert org["alice"].user_id not in recipients_of_last_change(conn)


def test_an_archived_subject_is_told_nothing(conn, org, work):
    users.archive_user(conn, org["admin"], org["alice"].user_id, NOW)  # her task stays assigned to her
    tasks.update_task(conn, work["pam"], work["task"]["task_id"], {"title": "Renamed"})
    assert recipients_of_last_change(conn) == admins_and(org)


def test_a_subject_who_is_already_told_gets_one_notification(conn, org):
    users.admin_update(conn, org["admin"], org["admin2"].user_id, {"job_title": "Head of Operations"})
    assert recipients_of_last_change(conn) == [org["admin2"].user_id]


def manager_change(conn, org, also_notify):
    """A manager's change (Bob edits himself) that also tells one more person."""
    boss = org["boss"]
    audit.record_change(conn, boss, "UPDATE", "users", boss.user_id, None, None, "Bob decided", also_notify=also_notify)


def test_also_notify_adds_one_recipient(conn, org):
    manager_change(conn, org, org["loner"].user_id)
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id, org["loner"].user_id])


def test_also_notify_never_reaches_the_actor_or_an_archived_user(conn, org):
    manager_change(conn, org, org["boss"].user_id)
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])
    users.archive_user(conn, org["admin"], org["loner"].user_id, NOW)
    manager_change(conn, org, org["loner"].user_id)
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


def test_audit_row_records_before_and_after_without_password_hash(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    last = conn.execute("SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1").fetchone()
    assert (last["before_state"]["firstName"], last["after_state"]["firstName"]) == ("Alice", "Alicia")
    assert "passwordHash" not in last["after_state"] and "password_hash" not in last["after_state"]


def test_notification_text_is_a_summary_without_salary(conn, org):
    users.admin_update(conn, org["admin"], org["alice"].user_id, {"annual_salary_cents": 99_000_00})
    last = conn.execute("SELECT summary FROM audit_log ORDER BY audit_id DESC LIMIT 1").fetchone()["summary"]
    assert "99" not in last and "Alice" in last


def test_role_used_for_recipients_is_the_stored_one(conn, org):
    """Promote Alice; her next change is a manager's change, whatever her old session said."""
    users.admin_update(conn, org["admin"], org["alice"].user_id, {"role": "MANAGER"})
    stale_alice = org["alice"]  # an Actor loaded while she was an employee
    users.update_self(conn, stale_alice, {"first_name": "Alicia"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


# --- reading notifications -------------------------------------------------

def test_user_lists_and_counts_their_unread_notifications(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    assert notifications.unread_count(conn, org["boss"]) == 1
    page = notifications.list_notifications(conn, org["boss"], {"unread": True}, page=1, page_size=10)
    assert page["items"][0]["summary"].startswith("Alicia")


def test_mark_read_only_works_on_your_own(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    note = notifications.list_notifications(conn, org["boss"], {"unread": True}, page=1, page_size=10)["items"][0]
    with pytest.raises(Exception) as caught:
        notifications.mark_read(conn, org["loner"], note["notification_id"])
    assert type(caught.value).__name__ == "NotFound"
    notifications.mark_read(conn, org["boss"], note["notification_id"])
    assert notifications.unread_count(conn, org["boss"]) == 0


def test_read_all_clears_the_count(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "A1"})
    users.update_self(conn, org["alice"], {"first_name": "A2"})
    notifications.read_all(conn, org["boss"])
    assert notifications.unread_count(conn, org["boss"]) == 0


def test_notifications_search_the_message_ignoring_case(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    users.update_self(conn, org["loner"], {"first_name": "Solo"})

    def found(**filters):
        return [n["summary"] for n in notifications.list_notifications(conn, org["admin"], filters, 1, 10)["items"]]
    assert found(q="ALICIA") == ["Alicia Tester updated their profile"]
    assert found(q="nobody") == []
    notifications.read_all(conn, org["admin"])
    assert found(q="solo", unread=True) == []  # both filters apply


def test_audit_log_search_actor_name_entity_type_and_action_ignoring_case(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    requests.create_request(conn, org["alice"], {"kind": "OVERTIME", "justification": "Launch week"})
    alice = org["alice"].user_id

    def found(q):
        rows = audit.list_audit(conn, org["admin"], {"q": q}, page=1, page_size=50)["items"]
        return {(r["actor_user_id"], r["entity_type"], r["action"]) for r in rows}
    assert found("ALICIA") == {(alice, "users", "UPDATE"), (alice, "project_requests", "CREATE")}  # actor's name
    assert found("project_req") == {(alice, "project_requests", "CREATE")}                       # entity type
    assert found("upDATE") == {(alice, "users", "UPDATE")}                                       # action
    assert found("nothing like this") == set()


def test_audit_log_search_finds_the_words_the_page_shows(conn, org):
    apollo = f.project(conn, org["admin"], org["boss"], name="Apollo")
    f.deliverable(conn, org["boss"], apollo, name="Design")
    f.booking(conn, org["boss"], apollo, org["alice"])
    users.reset_password(conn, org["admin"], org["loner"].user_id, NOW)

    def found(q):
        rows = audit.list_audit(conn, org["admin"], {"q": q}, page=1, page_size=50)["items"]
        return {(r["entity_type"], r["action"]) for r in rows}
    # The summary line names the project.
    assert found("apollo") == {("projects", "CREATE"), ("milestones", "CREATE"), ("assignments", "CREATE")}
    # Record types in the page's words (Person, Deliverable, Resource booking), and actions as words.
    assert found("Resource booking") == {("assignments", "CREATE")}
    assert {t for t, _ in found("Deliverable")} == {"milestones"}
    assert {t for t, _ in found("person")} == {"users"} and ("users", "RESET_PASSWORD") in found("person")
    assert found("reset password") == {("users", "RESET_PASSWORD")}


def test_admin_filters_the_audit_log(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    page = audit.list_audit(conn, org["admin"], {"actor_id": org["alice"].user_id}, page=1, page_size=10)
    assert [r["summary"] for r in page["items"]] == ["Alicia Tester updated their profile"]


def test_only_admins_read_the_audit_log(conn, org):
    with pytest.raises(Exception) as caught:
        audit.list_audit(conn, org["boss"], {}, page=1, page_size=10)
    assert type(caught.value).__name__ == "Forbidden"


# --- one person's history -----------------------------------------------------------

@pytest.fixture
def trail(conn, org):
    """Alice's trail: her account created by the admin, her own edit, her capacity set by Bob,
    and a request she sent (her change to something that isn't her account)."""
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    users.set_capacity(conn, org["boss"], org["alice"].user_id, {"weekly_capacity_hours": 30})
    requests.create_request(conn, org["alice"], {"kind": "OVERTIME", "justification": "Launch week"})
    users.update_self(conn, org["loner"], {"first_name": "Solo"})  # someone else's change
    # Not about Alice: a project whose id happens to equal her user id.
    audit.record_change(conn, org["admin"], "UPDATE", "projects", org["alice"].user_id, None, None,
                        "Project with Alice's id changed")
    return org["alice"].user_id


def test_history_holds_changes_by_and_to_the_person(conn, org, trail):
    page = audit.person_history(conn, org["admin"], trail, {}, page=1, page_size=10)
    assert page["total"] == 4
    ids = [r["audit_id"] for r in page["items"]]
    assert ids == sorted(ids, reverse=True)
    assert not any("Solo" in r["summary"] or "Lone" in r["summary"] for r in page["items"])
    kinds = {(r["actor_user_id"], r["entity_type"]) for r in page["items"]}
    assert (trail, "project_requests") in kinds  # a change she made to something else
    assert not any(r["entity_type"] == "projects" for r in page["items"])  # same id, not her


def test_line_manager_admin_and_self_may_read_history(conn, org, trail):
    for who in ("boss", "admin", "alice"):
        assert audit.person_history(conn, org[who], trail, {}, page=1, page_size=10)["total"] == 4


def test_others_get_404_like_a_missing_user(conn, org, trail):
    other_manager, _ = f.person(conn, org["admin"], role="MANAGER")
    for actor, user_id in ((org["loner"], trail), (other_manager, trail), (org["admin"], 999999)):
        with pytest.raises(NotFound) as caught:
            audit.person_history(conn, actor, user_id, {}, page=1, page_size=10)
        assert str(caught.value) == "User not found."


def test_history_filters_by_action_and_date(conn, org, trail):
    updates = audit.person_history(conn, org["admin"], trail, {"action": "update"}, page=1, page_size=10)
    assert updates["total"] == 2 and {r["action"] for r in updates["items"]} == {"UPDATE"}
    today = conn.execute("SELECT current_date AS d").fetchone()["d"]
    before = {"date_to": (today - dt.timedelta(days=1)).isoformat()}
    assert audit.person_history(conn, org["admin"], trail, before, page=1, page_size=10)["total"] == 0
    since = {"date_from": today.isoformat()}
    assert audit.person_history(conn, org["admin"], trail, since, page=1, page_size=10)["total"] == 4


def test_history_is_paginated(conn, org, trail):
    page = audit.person_history(conn, org["admin"], trail, {}, page=1, page_size=1)
    assert (page["total"], page["total_pages"], len(page["items"])) == (4, 4, 1)
