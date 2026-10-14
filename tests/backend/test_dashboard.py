"""The answers to the client's questions: progress, risk, allocation, budget, integrity.

Today is frozen on Wednesday 14 Oct 2026.
"""

import pytest

import factories as f
from domain.errors import Forbidden, NotFound
from services import dashboard, projects, tasks, time_entries, users


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    bob, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    carol, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, _ = f.person(conn, admin, manager=bob, first_name="Alice")  # 4807 c/h
    apollo = f.project(conn, admin, bob, name="Apollo", budget_cents=5_000_000)
    zeus = f.project(conn, admin, carol, name="Zeus")
    f.booking(conn, bob, apollo, alice, hours_per_week=20, start_date="2026-10-01", end_date="2026-12-31")
    design = f.deliverable(conn, bob, apollo, name="Design", start_date="2026-10-01", due_date="2026-11-30")
    task = f.task(conn, bob, design, assignee=alice, estimate_minutes=600)
    return {"admin": admin, "bob": bob, "carol": carol, "alice": alice, "apollo": apollo, "zeus": zeus,
            "design": design, "task": task}


def log(conn, who, task, day, hours):
    return time_entries.log_time(conn, who, task["task_id"], {"work_date": day, "minutes": int(hours * 60)})


# --- question 7: budget -----------------------------------------------------------------

def test_budget_planned_from_bookings_and_consumed_from_approved_time(conn, org):
    approved = log(conn, org["alice"], org["task"], "2026-10-12", 2)
    log(conn, org["alice"], org["task"], "2026-10-13", 1)  # stays pending
    time_entries.decide_entry(conn, org["bob"], approved["entry_id"], approve=True)
    budget = dashboard.project_budget(conn, org["bob"], org["apollo"]["project_id"])
    # 20 h/week x 92 days (1 Oct to 31 Dec) at 4807 c/h, prorated: 20 * 92 * 4807 // 7
    assert budget["planned_cents"] == 1_263_554
    assert budget["consumed_cents"] == 9_614   # 2 h x 4807
    assert budget["pending_cents"] == 4_807    # 1 h waiting for approval
    assert budget["budget_cents"] == 5_000_000


def test_budget_is_for_admins_and_the_projects_manager(conn, org):
    with pytest.raises(Forbidden):
        dashboard.project_budget(conn, org["alice"], org["apollo"]["project_id"])
    with pytest.raises(NotFound):
        dashboard.project_budget(conn, org["carol"], org["apollo"]["project_id"])


# --- questions 1 and 4: status and progress -------------------------------------------------

def test_project_list_carries_progress_from_tasks(conn, org):
    second = f.task(conn, org["bob"], org["design"], assignee=org["alice"], estimate_minutes=600)
    tasks.move_task(conn, org["alice"], second["task_id"], "DONE")
    listed = projects.list_projects(conn, org["bob"], {}, 1, 10)["items"][0]
    assert (listed["name"], listed["progress_percent"]) == ("Apollo", 50)


# --- question 2: at risk ---------------------------------------------------------------------

def reasons(conn, actor, name):
    for p in dashboard.at_risk(conn, actor):
        if p["name"] == name:
            return {r["code"] for r in p["reasons"]}
    return set()


def test_deliverable_behind_schedule_puts_the_project_at_risk(conn, org):
    f.deliverable(conn, org["bob"], org["apollo"], name="Late start", start_date="2026-10-01", due_date="2026-10-21")
    late = conn.execute("SELECT milestone_id FROM milestones WHERE name = 'Late start'").fetchone()
    f.task(conn, org["bob"], {"milestone_id": late["milestone_id"]}, assignee=org["alice"])
    # 13 of 20 days gone (65%) with 0% done: more than 15 points behind
    assert "DELIVERABLE_BEHIND" in reasons(conn, org["bob"], "Apollo")


def test_overdue_deliverable_and_past_end_date(conn, org):
    proj = f.project(conn, org["admin"], org["bob"], name="Old", start_date="2026-08-01",
                     predicted_end_date="2026-10-01")
    f.deliverable(conn, org["bob"], proj, start_date="2026-08-01", due_date="2026-09-15")
    assert reasons(conn, org["admin"], "Old") == {"PAST_END_DATE", "DELIVERABLE_OVERDUE"}


def test_budget_burning_faster_than_schedule(conn, org):
    projects.update_project(conn, org["admin"], org["apollo"]["project_id"], {"budget_cents": 20_000})
    entry = log(conn, org["alice"], org["task"], "2026-10-12", 3)  # 14,421 c = 72% of budget, ~15% of time
    time_entries.decide_entry(conn, org["bob"], entry["entry_id"], approve=True)
    assert "BUDGET_BURN" in reasons(conn, org["bob"], "Apollo")


def test_healthy_project_is_not_listed(conn, org):
    assert reasons(conn, org["admin"], "Zeus") == set()


def test_employees_do_not_get_the_risk_panel(conn, org):
    with pytest.raises(Forbidden):
        dashboard.at_risk(conn, org["alice"])


# --- questions 3 and 5: allocation and over-allocation -------------------------------------------

def test_allocation_grid_flags_people_booked_past_capacity(conn, org):
    f.booking(conn, org["carol"], org["zeus"], org["alice"], hours_per_week=25,
              start_date="2026-10-12", end_date="2026-10-25")
    grid = dashboard.allocation(conn, org["bob"], {"week_from": "2026-10-12", "weeks": 3})
    alice = next(r for r in grid["people"] if r["user_id"] == org["alice"].user_id)
    first, _, third = alice["weeks"]
    assert (first["booked_hours"], first["project_count"], first["over_allocated"]) == (45, 2, True)
    assert (third["booked_hours"], third["over_allocated"]) == (20, False)
    assert grid["weeks"] == ["2026-10-12", "2026-10-19", "2026-10-26"]


def test_allocation_grid_flags_overtime_worked(conn, org):
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": 10, "overtime_allowed": True})
    log(conn, org["alice"], org["task"], "2026-10-12", 6)
    log(conn, org["alice"], org["task"], "2026-10-13", 6)
    grid = dashboard.allocation(conn, org["admin"], {"week_from": "2026-10-12", "weeks": 1})
    week = next(r for r in grid["people"] if r["user_id"] == org["alice"].user_id)["weeks"][0]
    assert (week["logged_hours"], week["overtime"]) == (12, True)


def test_employees_do_not_get_the_allocation_grid(conn, org):
    with pytest.raises(Forbidden):
        dashboard.allocation(conn, org["alice"], {})


# --- the invariant ------------------------------------------------------------------------------

def test_integrity_check_is_clean_and_admin_only(conn, org):
    assert dashboard.integrity_check(conn, org["admin"]) == {"violations": {}, "checks": 5}
    with pytest.raises(Forbidden):
        dashboard.integrity_check(conn, org["bob"])
