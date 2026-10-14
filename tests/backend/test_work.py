"""Deliverables, dependencies, tasks and logged time: how the work gets tracked.

The clock is frozen on Wednesday 14 Oct 2026 (week of Mon 12 to Sun 18 Oct).
"""

import pytest

import factories as f
from domain.errors import Conflict, DependencyCycle, Forbidden, NotFound, OverCapacity, ValidationError
from services import assignments, milestones, notifications, projects, tasks, time_entries, users


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    bob, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    carol, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, _ = f.person(conn, admin, manager=bob, first_name="Alice")   # $100,000 a year -> 4807 c/h
    eve, _ = f.person(conn, admin, manager=carol, first_name="Eve")
    apollo = f.project(conn, admin, bob, name="Apollo")
    zeus = f.project(conn, admin, carol, name="Zeus")
    f.booking(conn, bob, apollo, alice)
    f.booking(conn, bob, apollo, eve)
    design = f.deliverable(conn, bob, apollo, name="Design")
    build = f.deliverable(conn, bob, apollo, name="Build")
    return {"admin": admin, "bob": bob, "carol": carol, "alice": alice, "eve": eve,
            "apollo": apollo, "zeus": zeus, "design": design, "build": build}


def status_of(conn, actor, ms):
    return milestones.get_milestone(conn, actor, ms["milestone_id"])["status"]


def log(conn, who, task, day, hours, **extra):
    return time_entries.log_time(conn, who, task["task_id"],
                                 {"work_date": day, "minutes": int(hours * 60), **extra})


# --- deliverables ------------------------------------------------------------------

def test_manager_creates_deliverables_on_own_project_only(conn, org):
    with pytest.raises(NotFound):
        f.deliverable(conn, org["carol"], org["apollo"])
    with pytest.raises(Forbidden):
        f.deliverable(conn, org["alice"], org["apollo"])


def test_status_is_computed_from_tasks(conn, org):
    assert status_of(conn, org["bob"], org["design"]) == "NOT_STARTED"
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    tasks.move_task(conn, org["alice"], t["task_id"], "IN_PROGRESS")
    assert status_of(conn, org["bob"], org["design"]) == "IN_PROGRESS"


def test_progress_is_done_estimate_over_total_estimate(conn, org):
    small = f.task(conn, org["bob"], org["design"], assignee=org["alice"], estimate_minutes=60)
    f.task(conn, org["bob"], org["design"], assignee=org["alice"], estimate_minutes=180)
    tasks.move_task(conn, org["alice"], small["task_id"], "DONE")
    got = milestones.get_milestone(conn, org["bob"], org["design"]["milestone_id"])
    assert (got["progress_percent"], got["done_estimate_minutes"], got["total_estimate_minutes"]) == (25, 60, 240)


def test_blocked_while_a_dependency_is_not_signed_off(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    assert status_of(conn, org["bob"], org["build"]) == "BLOCKED"


def test_sign_off_refused_while_a_task_is_unfinished(conn, org):
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    with pytest.raises(Conflict, match="task"):
        milestones.sign_off(conn, org["bob"], org["design"]["milestone_id"])


def test_sign_off_refused_while_a_dependency_is_open(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    with pytest.raises(Conflict, match="depends"):
        milestones.sign_off(conn, org["bob"], org["build"]["milestone_id"])


def test_sign_off_when_everything_is_done(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    tasks.move_task(conn, org["alice"], t["task_id"], "DONE")
    milestones.sign_off(conn, org["bob"], org["design"]["milestone_id"])
    assert status_of(conn, org["bob"], org["design"]) == "DONE"


def test_reopening_a_task_clears_sign_off_down_the_chain(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    tasks.move_task(conn, org["alice"], t["task_id"], "DONE")
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    milestones.sign_off(conn, org["bob"], org["design"]["milestone_id"])
    milestones.sign_off(conn, org["bob"], org["build"]["milestone_id"])
    tasks.move_task(conn, org["alice"], t["task_id"], "IN_PROGRESS")
    assert status_of(conn, org["bob"], org["design"]) == "IN_PROGRESS"
    assert status_of(conn, org["bob"], org["build"]) == "BLOCKED"


def test_adding_a_task_to_a_signed_off_deliverable_clears_the_sign_off(conn, org):
    milestones.sign_off(conn, org["bob"], org["design"]["milestone_id"])
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    assert status_of(conn, org["bob"], org["design"]) == "NOT_STARTED"


def test_archiving_a_deliverable_archives_its_tasks(conn, org):
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    milestones.archive_milestone(conn, org["bob"], org["design"]["milestone_id"])
    assert tasks.list_tasks(conn, org["bob"], org["design"]["milestone_id"]) == []


# --- dependencies ---------------------------------------------------------------

def test_dependency_loop_is_refused(conn, org):
    test = f.deliverable(conn, org["bob"], org["apollo"], name="Test")
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    milestones.add_dependency(conn, org["bob"], test["milestone_id"], org["build"]["milestone_id"])
    with pytest.raises(DependencyCycle):
        milestones.add_dependency(conn, org["bob"], org["design"]["milestone_id"], test["milestone_id"])


def test_dependency_across_projects_is_refused(conn, org):
    other = f.deliverable(conn, org["carol"], org["zeus"])
    with pytest.raises(ValidationError, match="same project"):
        milestones.add_dependency(conn, org["admin"], org["design"]["milestone_id"], other["milestone_id"])


def test_duplicate_dependency_is_a_conflict(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    with pytest.raises(Conflict):
        milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])


def test_removing_and_readding_a_dependency(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    milestones.remove_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    assert status_of(conn, org["bob"], org["build"]) == "NOT_STARTED"
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    assert status_of(conn, org["bob"], org["build"]) == "BLOCKED"


def test_dependency_graph_has_nodes_and_edges(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    graph = milestones.dependency_graph(conn, org["alice"], org["apollo"]["project_id"])
    assert {n["name"] for n in graph["nodes"]} == {"Design", "Build"}
    assert graph["edges"] == [{"from": org["build"]["milestone_id"], "to": org["design"]["milestone_id"]}]


# --- tasks ---------------------------------------------------------------------

def test_assignee_must_be_booked_on_the_project(conn, org):
    outsider, _ = f.person(conn, org["admin"], manager=org["bob"])
    with pytest.raises(ValidationError) as caught:
        f.task(conn, org["bob"], org["design"], assignee=outsider)
    assert caught.value.field == "assignee_user_id"


def test_only_the_assignee_moves_a_task(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    with pytest.raises(Forbidden):
        tasks.move_task(conn, org["eve"], t["task_id"], "DONE")
    with pytest.raises(Forbidden):
        tasks.move_task(conn, org["bob"], t["task_id"], "DONE")


def test_done_sets_and_reopening_clears_completed_at(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    assert tasks.move_task(conn, org["alice"], t["task_id"], "DONE")["completed_at"] is not None
    assert tasks.move_task(conn, org["alice"], t["task_id"], "TODO")["completed_at"] is None


def test_my_tasks_lists_open_tasks_assigned_to_me(conn, org):
    mine = f.task(conn, org["bob"], org["design"], assignee=org["alice"], title="Mine")
    f.task(conn, org["bob"], org["design"], assignee=org["eve"], title="Not mine")
    done = f.task(conn, org["bob"], org["design"], assignee=org["alice"], title="Finished")
    tasks.move_task(conn, org["alice"], done["task_id"], "DONE")
    assert [t["title"] for t in tasks.my_tasks(conn, org["alice"])] == [mine["title"]]


def test_manager_reassigns_and_re_estimates(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    row = tasks.update_task(conn, org["bob"], t["task_id"], {"assignee_user_id": org["eve"].user_id,
                                                             "estimate_minutes": 480})
    assert (row["assignee_user_id"], row["estimate_minutes"]) == (org["eve"].user_id, 480)


# --- logging time ------------------------------------------------------------------

def test_assignee_logs_time_at_their_frozen_rate(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    entry = log(conn, org["alice"], t, "2026-10-13", 2, note="Sketches")
    assert (entry["minutes"], entry["hourly_rate_cents"], entry["status"]) == (120, 4807, "PENDING")
    users.admin_update(conn, org["admin"], org["alice"].user_id, {"annual_salary_cents": 20_000_000})
    still = conn.execute("SELECT hourly_rate_cents FROM time_entries WHERE entry_id = %s",
                         (entry["entry_id"],)).fetchone()["hourly_rate_cents"]
    assert still == 4807  # a raise doesn't rewrite logged costs


def test_only_the_assignee_logs_time_on_a_task(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    with pytest.raises(Forbidden):
        log(conn, org["eve"], t, "2026-10-13", 1)


def test_future_dates_are_refused(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    with pytest.raises(ValidationError) as caught:
        log(conn, org["alice"], t, "2026-10-15", 1)
    assert caught.value.field == "work_date"


def test_dates_outside_the_booking_are_refused(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    with pytest.raises(Conflict, match="booked"):
        log(conn, org["alice"], t, "2026-09-30", 1)


def test_more_than_24_hours_in_a_day_is_refused(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"overtime_allowed": True})
    log(conn, org["alice"], t, "2026-10-13", 20)
    with pytest.raises(Conflict, match="24"):
        log(conn, org["alice"], t, "2026-10-13", 5)


def week_of_16_hours(conn, org, capacity=20):
    """Alice at `capacity` h with overtime off, 8 h logged Mon and 8 h Tue; returns the task."""
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": capacity})
    log(conn, org["alice"], t, "2026-10-12", 8)
    log(conn, org["alice"], t, "2026-10-13", 8)
    return t


def week_minutes(conn, org):
    return conn.execute("SELECT sum(minutes) AS n FROM time_entries WHERE user_id = %s",
                        (org["alice"].user_id,)).fetchone()["n"]


def newest_summary(conn, person):
    return notifications.list_notifications(conn, person, unread_only=False, page=1, page_size=1)["items"][0]["summary"]


def test_logging_past_capacity_asks_first_without_overtime(conn, org):
    t = week_of_16_hours(conn, org)
    with pytest.raises(OverCapacity) as caught:
        log(conn, org["alice"], t, "2026-10-14", 5)
    assert str(caught.value) == "This puts you 1 h over your 20 h week. Log anyway? Your manager will be told."
    assert caught.value.code == "OVER_CAPACITY"
    assert week_minutes(conn, org) == 16 * 60  # nothing saved


def test_confirmed_overtime_is_saved_and_marked(conn, org):
    t = week_of_16_hours(conn, org)
    row = log(conn, org["alice"], t, "2026-10-14", 5, confirm_over_capacity=True)
    assert (row["minutes"], row["over_capacity"]) == (300, True)


def test_confirmed_overtime_tells_the_line_manager(conn, org):
    t = week_of_16_hours(conn, org)
    log(conn, org["alice"], t, "2026-10-14", 5, confirm_over_capacity=True)
    assert newest_summary(conn, org["bob"]).endswith("(1 h over capacity)")


def test_editing_past_capacity_asks_first(conn, org):
    week_of_16_hours(conn, org)
    second = time_entries.my_entries(conn, org["alice"], {}, 1, 1)["items"][0]  # Tuesday's 8 h
    with pytest.raises(OverCapacity, match="2 h over"):
        time_entries.edit_entry(conn, org["alice"], second["entry_id"], {"minutes": 14 * 60})
    assert week_minutes(conn, org) == 16 * 60


def test_confirmed_edit_is_marked_and_an_edit_back_clears_it(conn, org):
    week_of_16_hours(conn, org)
    second = time_entries.my_entries(conn, org["alice"], {}, 1, 1)["items"][0]
    row = time_entries.edit_entry(conn, org["alice"], second["entry_id"],
                                  {"minutes": 14 * 60, "confirm_over_capacity": True})
    assert row["over_capacity"] is True
    assert newest_summary(conn, org["bob"]).endswith("(2 h over capacity)")
    row = time_entries.edit_entry(conn, org["alice"], second["entry_id"], {"minutes": 4 * 60})
    assert row["over_capacity"] is False


def over_week(conn, org):
    """Mon 8 h and Tue 8 h inside a 20 h week, then Wed 5 h confirmed (1 h over); returns Mon and Wed."""
    t = week_of_16_hours(conn, org)
    wed = log(conn, org["alice"], t, "2026-10-14", 5, confirm_over_capacity=True)
    mon = time_entries.my_entries(conn, org["alice"], {}, 1, 3)["items"][2]
    return mon, wed


def test_note_only_edit_in_an_over_week_does_not_ask_or_mark(conn, org):
    mon, wed = over_week(conn, org)
    row = time_entries.edit_entry(conn, org["alice"], mon["entry_id"], {"note": "typo fixed"})
    assert (row["note"], row["over_capacity"]) == ("typo fixed", False)
    assert "over capacity" not in newest_summary(conn, org["bob"])
    row = time_entries.edit_entry(conn, org["alice"], wed["entry_id"], {"note": "late night"})
    assert row["over_capacity"] is True  # its mark is kept


def test_logging_less_never_asks(conn, org):
    mon, wed = over_week(conn, org)
    row = time_entries.edit_entry(conn, org["alice"], wed["entry_id"], {"minutes": 270})  # 4.5 h: still over
    assert row["over_capacity"] is True
    row = time_entries.edit_entry(conn, org["alice"], mon["entry_id"], {"minutes": 7 * 60 + 45})  # week still over
    assert row["over_capacity"] is False  # Monday was inside capacity, and trimming it doesn't mark it
    row = time_entries.edit_entry(conn, org["alice"], wed["entry_id"], {"minutes": 180})  # 3 h: back under
    assert row["over_capacity"] is False


def test_allowed_overtime_is_not_marked(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": 20, "overtime_allowed": True})
    rows = [log(conn, org["alice"], t, "2026-10-12", 12), log(conn, org["alice"], t, "2026-10-13", 12)]
    assert [r["over_capacity"] for r in rows] == [False, False]


def test_confirm_within_capacity_is_ignored(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    row = log(conn, org["alice"], t, "2026-10-13", 2, confirm_over_capacity=True)
    assert row["over_capacity"] is False
    assert "over capacity" not in newest_summary(conn, org["bob"])


def test_confirm_does_not_override_the_24_hour_day(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": 20})
    log(conn, org["alice"], t, "2026-10-12", 20, confirm_over_capacity=True)
    with pytest.raises(Conflict, match="24") as caught:
        log(conn, org["alice"], t, "2026-10-12", 5, confirm_over_capacity=True)
    assert not isinstance(caught.value, OverCapacity)


def test_confirm_must_be_true_or_false(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    with pytest.raises(ValidationError) as caught:
        log(conn, org["alice"], t, "2026-10-13", 1, confirm_over_capacity="yes")
    assert caught.value.field == "confirm_over_capacity"


def test_logging_past_capacity_is_allowed_when_overtime_is_on(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": 20, "overtime_allowed": True})
    log(conn, org["alice"], t, "2026-10-12", 12)
    log(conn, org["alice"], t, "2026-10-13", 12)


def test_rejected_time_does_not_count_toward_capacity(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": 10})
    wrong = log(conn, org["alice"], t, "2026-10-12", 9)
    time_entries.decide_entry(conn, org["bob"], wrong["entry_id"], approve=False)
    log(conn, org["alice"], t, "2026-10-13", 9)


def test_line_manager_or_admin_approves(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    first = log(conn, org["alice"], t, "2026-10-12", 1)
    second = log(conn, org["alice"], t, "2026-10-13", 1)
    assert time_entries.decide_entry(conn, org["bob"], first["entry_id"], approve=True)["status"] == "APPROVED"
    assert time_entries.decide_entry(conn, org["admin"], second["entry_id"], approve=False)["status"] == "REJECTED"


def test_other_managers_and_employees_cannot_approve(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    entry = log(conn, org["alice"], t, "2026-10-12", 1)
    with pytest.raises(NotFound):
        time_entries.decide_entry(conn, org["carol"], entry["entry_id"], approve=True)
    with pytest.raises(Forbidden):
        time_entries.decide_entry(conn, org["eve"], entry["entry_id"], approve=True)


def test_editing_a_decided_entry_sends_it_back_to_pending(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    entry = log(conn, org["alice"], t, "2026-10-12", 1)
    time_entries.decide_entry(conn, org["bob"], entry["entry_id"], approve=True)
    row = time_entries.edit_entry(conn, org["alice"], entry["entry_id"], {"minutes": 90})
    assert (row["status"], row["decided_by"], row["minutes"]) == ("PENDING", None, 90)


def test_someone_elses_entry_is_not_found(conn, org):
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    entry = log(conn, org["alice"], t, "2026-10-12", 1)
    with pytest.raises(NotFound):
        time_entries.edit_entry(conn, org["eve"], entry["entry_id"], {"minutes": 90})


def test_pending_approvals_show_only_my_reports(conn, org):
    a_task = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    e_task = f.task(conn, org["bob"], org["design"], assignee=org["eve"])
    log(conn, org["alice"], a_task, "2026-10-12", 1)
    log(conn, org["eve"], e_task, "2026-10-12", 1)
    bob_queue = time_entries.pending_approvals(conn, org["bob"], 1, 50)["items"]
    assert [e["user_id"] for e in bob_queue] == [org["alice"].user_id]
    assert len(time_entries.pending_approvals(conn, org["admin"], 1, 50)["items"]) == 2


def test_shrinking_a_booking_past_logged_time_is_refused(conn, org):
    from services import assignments
    t = f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    log(conn, org["alice"], t, "2026-10-12", 1)
    booking = assignments.list_bookings(conn, org["bob"], org["apollo"]["project_id"])[0]
    with pytest.raises(Conflict, match="outside"):
        assignments.update_booking(conn, org["bob"], booking["assignment_id"], {"start_date": "2026-10-13"})


# --- the pull board ----------------------------------------------------------------

LIMIT_TAIL = " Finish one first, or ask your manager to raise it."


def ready(conn, org, ms="design", **kw):
    """A Ready task: no assignee, TODO, on one of Apollo's deliverables."""
    return f.task(conn, org["bob"], org[ms], title="Ready one", **kw)


def newest_audit(conn):
    return conn.execute("SELECT audit_id, action, entity_type, summary FROM audit_log"
                        " ORDER BY audit_id DESC LIMIT 1").fetchone()


def audit_count(conn):
    return conn.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"]


def test_take_this_assigns_me_and_starts_the_task(conn, org):
    row = tasks.claim_task(conn, org["alice"], ready(conn, org)["task_id"])
    assert (row["assignee_user_id"], row["status"]) == (org["alice"].user_id, "IN_PROGRESS")
    assert row["completed_at"] is None


def test_only_employees_take_tasks(conn, org):
    t = ready(conn, org)
    with pytest.raises(Forbidden, match="^Only employees take tasks.$"):
        tasks.claim_task(conn, org["bob"], t["task_id"])


def test_a_task_on_a_project_you_are_not_booked_on_is_not_found(conn, org):
    outsider, _ = f.person(conn, org["admin"], manager=org["bob"])
    t = ready(conn, org)
    with pytest.raises(NotFound, match="^Task not found.$"):
        tasks.claim_task(conn, outsider, t["task_id"])


def test_an_archived_task_cannot_be_taken(conn, org):
    t = ready(conn, org)
    tasks.archive_task(conn, org["bob"], t["task_id"])
    with pytest.raises(Conflict, match="^This task is archived.$"):
        tasks.claim_task(conn, org["alice"], t["task_id"])


def test_a_done_task_cannot_be_taken(conn, org):
    t = ready(conn, org, assignee=org["alice"])
    tasks.move_task(conn, org["alice"], t["task_id"], "DONE")
    tasks.update_task(conn, org["bob"], t["task_id"], {"assignee_user_id": None})
    with pytest.raises(Conflict, match="^This task is already done.$"):
        tasks.claim_task(conn, org["eve"], t["task_id"])


def test_a_taken_task_cannot_be_taken_again_even_by_its_holder(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    with pytest.raises(Conflict, match="^This task is already taken.$"):
        tasks.claim_task(conn, org["eve"], t["task_id"])
    with pytest.raises(Conflict, match="^This task is already taken.$"):
        tasks.claim_task(conn, org["alice"], t["task_id"])


def test_the_limit_refuses_a_third_task(conn, org):
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    t = ready(conn, org)
    with pytest.raises(Conflict) as caught:
        tasks.claim_task(conn, org["alice"], t["task_id"])
    assert str(caught.value) == "You already hold 2 unfinished tasks, your limit." + LIMIT_TAIL


def test_the_limit_message_is_singular_at_a_limit_of_1(conn, org):
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"task_limit": 1})
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    t = ready(conn, org)
    with pytest.raises(Conflict) as caught:
        tasks.claim_task(conn, org["alice"], t["task_id"])
    assert str(caught.value) == "You already hold 1 unfinished task, your limit." + LIMIT_TAIL


def test_held_counts_only_unfinished_live_tasks_on_live_projects(conn, org):
    alice = org["alice"]
    f.task(conn, org["bob"], org["design"], assignee=alice)                    # TODO: counts
    done = f.task(conn, org["bob"], org["design"], assignee=alice)
    tasks.move_task(conn, alice, done["task_id"], "DONE")                      # done: doesn't
    gone = f.task(conn, org["bob"], org["design"], assignee=alice)
    tasks.archive_task(conn, org["bob"], gone["task_id"])                      # archived: doesn't
    f.booking(conn, org["carol"], org["zeus"], alice)
    f.task(conn, org["carol"], f.deliverable(conn, org["carol"], org["zeus"]), assignee=alice)
    projects.archive_project(conn, org["admin"], org["zeus"]["project_id"])    # archived project: doesn't
    assert tasks.held_count(conn, alice.user_id) == 1


def test_a_manager_can_assign_past_the_limit(conn, org):
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    third = ready(conn, org)
    tasks.update_task(conn, org["bob"], third["task_id"], {"assignee_user_id": org["alice"].user_id})
    assert tasks.held_count(conn, org["alice"].user_id) == 3


def test_put_back_returns_the_task_to_ready(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    row = tasks.release_task(conn, org["alice"], t["task_id"])
    assert (row["assignee_user_id"], row["status"]) == (None, "TODO")


def test_only_the_holder_puts_a_task_back(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    with pytest.raises(Forbidden, match="^Only the task's assignee can put it back.$"):
        tasks.release_task(conn, org["eve"], t["task_id"])


def test_an_archived_task_cannot_be_put_back(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    tasks.archive_task(conn, org["bob"], t["task_id"])
    with pytest.raises(Conflict, match="^This task is archived.$"):
        tasks.release_task(conn, org["alice"], t["task_id"])


def test_a_done_task_cannot_be_put_back(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    tasks.move_task(conn, org["alice"], t["task_id"], "DONE")
    with pytest.raises(Conflict, match="^This task is done. Move it back to In progress first.$"):
        tasks.release_task(conn, org["alice"], t["task_id"])


def test_take_and_put_back_each_write_one_audit_row_and_notify_the_line_manager(conn, org):
    t = ready(conn, org)

    def recipients(audit_id):
        rows = conn.execute("SELECT recipient_user_id FROM notifications WHERE audit_id = %s"
                            " ORDER BY recipient_user_id", (audit_id,)).fetchall()
        return [r["recipient_user_id"] for r in rows]

    expected = sorted([org["bob"].user_id, org["admin"].user_id])
    before = audit_count(conn)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    assert audit_count(conn) == before + 1
    took = newest_audit(conn)
    assert (took["action"], took["entity_type"], took["summary"]) == ("CLAIM", "tasks", "Alice Tester took task Ready one")
    assert recipients(took["audit_id"]) == expected

    tasks.release_task(conn, org["alice"], t["task_id"])
    assert audit_count(conn) == before + 2
    put = newest_audit(conn)
    assert (put["action"], put["entity_type"], put["summary"]) == ("RELEASE", "tasks",
                                                                   "Alice Tester put back task Ready one")
    assert recipients(put["audit_id"]) == expected


def test_a_task_on_a_blocked_deliverable_can_still_be_taken(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    assert status_of(conn, org["bob"], org["build"]) == "BLOCKED"
    assert tasks.claim_task(conn, org["alice"], ready(conn, org, ms="build")["task_id"])["status"] == "IN_PROGRESS"


def test_lowering_the_limit_below_what_someone_holds_then_refuses_claims(conn, org):
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    f.task(conn, org["bob"], org["design"], assignee=org["alice"])
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"task_limit": 1})
    t = ready(conn, org)
    with pytest.raises(Conflict) as caught:
        tasks.claim_task(conn, org["alice"], t["task_id"])
    assert str(caught.value) == "You already hold 2 unfinished tasks, over your limit of 1." + LIMIT_TAIL


def test_put_back_keeps_logged_time_and_stops_further_logging(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    entry = log(conn, org["alice"], t, "2026-10-13", 1)
    tasks.release_task(conn, org["alice"], t["task_id"])
    owner = conn.execute("SELECT user_id FROM time_entries WHERE entry_id = %s",
                         (entry["entry_id"],)).fetchone()["user_id"]
    assert owner == org["alice"].user_id
    with pytest.raises(Forbidden, match=r"^Only the task's assignee logs time on it\.$"):
        log(conn, org["alice"], t, "2026-10-13", 1)


# --- board and Ready to take --------------------------------------------------------

def test_board_lists_every_live_task_and_each_booked_persons_load(conn, org):
    ready(conn, org)
    f.task(conn, org["bob"], org["build"], assignee=org["alice"], title="Mine")
    gone = f.task(conn, org["bob"], org["design"], title="Gone")
    tasks.archive_task(conn, org["bob"], gone["task_id"])
    result = tasks.board(conn, org["alice"], org["apollo"]["project_id"])
    assert {t["title"] for t in result["items"]} == {"Ready one", "Mine"}
    by_title = {t["title"]: t for t in result["items"]}
    assert (by_title["Mine"]["milestone_name"], by_title["Mine"]["assignee_name"]) == ("Build", "Alice Tester")
    assert result["people"] == [
        {"user_id": org["alice"].user_id, "name": "Alice Tester", "held": 1, "task_limit": 2},
        {"user_id": org["eve"].user_id, "name": "Eve Tester", "held": 0, "task_limit": 2}]


def test_two_bookings_on_one_project_list_a_person_and_a_task_once(conn, org):
    f.booking(conn, org["bob"], org["apollo"], org["alice"], start_date="2027-01-01", end_date="2027-03-31")
    ready(conn, org)
    assert [p["name"] for p in tasks.board(conn, org["bob"], org["apollo"]["project_id"])["people"]] == [
        "Alice Tester", "Eve Tester"]
    assert [t["title"] for t in tasks.ready_tasks(conn, org["alice"])["items"]] == ["Ready one"]


def test_board_of_a_project_you_cannot_see_is_not_found(conn, org):
    with pytest.raises(NotFound, match="^Project not found.$"):
        tasks.board(conn, org["carol"], org["apollo"]["project_id"])


def test_ready_tasks_are_unassigned_unfinished_live_tasks_on_my_booked_projects(conn, org):
    ready(conn, org)
    f.task(conn, org["bob"], org["design"], assignee=org["eve"], title="Assigned")
    finished = f.task(conn, org["bob"], org["design"], assignee=org["eve"], title="Finished")
    tasks.move_task(conn, org["eve"], finished["task_id"], "DONE")
    tasks.update_task(conn, org["bob"], finished["task_id"], {"assignee_user_id": None})
    archived = f.task(conn, org["bob"], org["design"], title="Archived")
    tasks.archive_task(conn, org["bob"], archived["task_id"])
    zeus_ms = f.deliverable(conn, org["carol"], org["zeus"], name="Zeus work")
    f.task(conn, org["carol"], zeus_ms, title="Elsewhere")
    result = tasks.ready_tasks(conn, org["alice"])
    assert ([t["title"] for t in result["items"]], result["held"], result["limit"]) == (["Ready one"], 0, 2)


# Review Focus 4
def test_manager_clears_a_task_held_by_someone_no_longer_booked(conn, org):
    t = ready(conn, org)
    tasks.claim_task(conn, org["alice"], t["task_id"])
    booking_id = conn.execute("SELECT assignment_id FROM assignments WHERE user_id = %s AND project_id = %s",
                              (org["alice"].user_id, org["apollo"]["project_id"])).fetchone()["assignment_id"]
    assignments.archive_booking(conn, org["bob"], booking_id)
    with pytest.raises(NotFound, match="^Task not found.$"):
        tasks.release_task(conn, org["alice"], t["task_id"])
    tasks.update_task(conn, org["bob"], t["task_id"], {"assignee_user_id": None})
    assert tasks.held_count(conn, org["alice"].user_id) == 0
    assert [x["task_id"] for x in tasks.ready_tasks(conn, org["eve"])["items"]] == [t["task_id"]]


# --- findings on Task 5: archived projects, and the "one query" claims measured ---------

class CountingConn:
    """Wraps a connection and counts execute() calls, so 'one query' is measured, not read off the diff."""

    def __init__(self, inner):
        self.inner = inner
        self.count = 0

    def execute(self, *args, **kwargs):
        self.count += 1
        return self.inner.execute(*args, **kwargs)


def test_board_of_an_archived_project_is_hidden_from_everyone_but_admins(conn, org):
    ready(conn, org)
    projects.archive_project(conn, org["admin"], org["apollo"]["project_id"])
    for who in ("bob", "alice"):
        with pytest.raises(NotFound, match="^Project not found.$"):
            tasks.board(conn, org[who], org["apollo"]["project_id"])


def test_board_runs_one_query_for_tasks_and_one_for_people_however_many_there_are(conn, org):
    def board_queries():
        counter = CountingConn(conn)
        tasks.board(counter, org["admin"], org["apollo"]["project_id"])
        return counter.count
    before = board_queries()
    for n in range(5):
        f.task(conn, org["bob"], org["design"], title=f"Extra {n}")
    assert (before, board_queries()) == (3, 3)   # project lookup + tasks + people


def test_ready_tasks_runs_one_query_for_tasks_and_one_for_held_and_limit(conn, org):
    def ready_queries():
        counter = CountingConn(conn)
        tasks.ready_tasks(counter, org["alice"])
        return counter.count
    ready(conn, org)
    before = ready_queries()
    for n in range(5):
        f.task(conn, org["bob"], org["design"], title=f"Extra {n}")
    assert (before, ready_queries()) == (2, 2)
