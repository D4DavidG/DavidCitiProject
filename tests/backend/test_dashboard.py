"""The answers to the client's questions: progress, risk, allocation, budget, integrity.

Today is frozen on Wednesday 14 Oct 2026.
"""

import pytest

import factories as f
from domain.errors import Forbidden, NotFound
from services import assignments, dashboard, milestones, projects, tasks, time_entries, users


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


# --- questions 1, 2 and 7 on one screen: the manager's project cards --------------------------------

def cards(conn, actor, filters=None):
    return dashboard.project_cards(conn, actor, filters or {}, 1, 20)["items"]


def test_project_card_combines_status_progress_risk_and_money(conn, org):
    approved = log(conn, org["alice"], org["task"], "2026-10-12", 2)
    log(conn, org["alice"], org["task"], "2026-10-13", 1)
    time_entries.decide_entry(conn, org["bob"], approved["entry_id"], approve=True)
    [card] = cards(conn, org["bob"])
    budget = dashboard.project_budget(conn, org["bob"], org["apollo"]["project_id"])
    assert (card["name"], card["status"], card["progress_percent"]) == ("Apollo", "PLANNING", 0)
    assert card["manager_name"] == "Bob Tester"
    # Design is 13 of 60 days in (22%) with 0% of its work done: more than 15 points behind.
    assert card["at_risk"] is True
    assert [r["code"] for r in card["risk_reasons"]] == ["DELIVERABLE_BEHIND"]
    for key in ("budget_cents", "planned_cents", "consumed_cents", "pending_cents", "consumed_percent",
                "planned_percent", "pending_percent"):
        assert card[key] == budget[key], key  # the card and the budget screen never disagree
    assert (card["consumed_cents"], card["pending_cents"]) == (9_614, 4_807)


def test_planned_and_pending_percent_are_whole_numbers_rounded_down(conn, org):
    approved = log(conn, org["alice"], org["task"], "2026-10-12", 2)
    log(conn, org["alice"], org["task"], "2026-10-13", 1)  # 4,807 c stays pending
    time_entries.decide_entry(conn, org["bob"], approved["entry_id"], approve=True)
    pid = org["apollo"]["project_id"]
    budget = dashboard.project_budget(conn, org["bob"], pid)
    assert (budget["planned_percent"], budget["pending_percent"]) == (25, 0)  # 1,263,554 of 5,000,000
    projects.update_project(conn, org["admin"], pid, {"budget_cents": 900_000})
    budget = dashboard.project_budget(conn, org["bob"], pid)
    assert budget["pending_percent"] == 0     # 0.53%: rounded down, not to nearest
    assert budget["planned_percent"] == 140   # bookings cost more than the budget: past 100


def test_no_budget_gives_no_percentages(conn, org):
    projects.update_project(conn, org["admin"], org["zeus"]["project_id"], {"budget_cents": 0})
    budget = dashboard.project_budget(conn, org["carol"], org["zeus"]["project_id"])
    assert (budget["consumed_percent"], budget["planned_percent"], budget["pending_percent"]) == (None, None, None)


def test_at_risk_projects_come_first_with_their_reasons(conn, org):
    f.project(conn, org["admin"], org["bob"], name="Aardvark")  # healthy, and first by name
    f.project(conn, org["admin"], org["bob"], name="Old", start_date="2026-08-01", predicted_end_date="2026-10-01")
    listed = [(c["name"], c["at_risk"]) for c in cards(conn, org["bob"])]
    assert listed == [("Apollo", True), ("Old", True), ("Aardvark", False)]
    old = next(c for c in cards(conn, org["bob"]) if c["name"] == "Old")
    assert [r["code"] for r in old["risk_reasons"]] == ["PAST_END_DATE"]
    assert next(c for c in cards(conn, org["bob"]) if c["name"] == "Aardvark")["risk_reasons"] == []


def test_managers_get_their_own_cards_and_admins_every_live_project(conn, org):
    assert [c["name"] for c in cards(conn, org["bob"])] == ["Apollo"]
    assert [c["name"] for c in cards(conn, org["admin"])] == ["Apollo", "Zeus"]
    projects.archive_project(conn, org["admin"], org["zeus"]["project_id"])
    assert [c["name"] for c in cards(conn, org["admin"])] == ["Apollo"]


def test_project_cards_can_be_searched_and_paginated(conn, org):
    assert [c["name"] for c in cards(conn, org["admin"], {"search": "zeu"})] == ["Zeus"]
    projects.update_project(conn, org["admin"], org["zeus"]["project_id"], {"status": "ACTIVE"})
    assert [c["name"] for c in cards(conn, org["admin"], {"status": "ACTIVE"})] == ["Zeus"]
    page = dashboard.project_cards(conn, org["admin"], {}, 2, 1)
    assert (page["total"], page["total_pages"], [c["name"] for c in page["items"]]) == (2, 2, ["Zeus"])


def test_at_risk_total_counts_every_page_not_just_this_one(conn, org):
    f.project(conn, org["admin"], org["carol"], name="Old", start_date="2026-08-01", predicted_end_date="2026-10-01")
    first = dashboard.project_cards(conn, org["admin"], {}, 1, 1)
    assert ([c["name"] for c in first["items"]], first["total"], first["at_risk_total"]) == (["Apollo"], 3, 2)
    last = dashboard.project_cards(conn, org["admin"], {}, 3, 1)
    assert ([c["name"] for c in last["items"]], last["at_risk_total"]) == (["Zeus"], 2)  # healthy page, still 2
    zeus = dashboard.project_cards(conn, org["admin"], {"search": "zeu"}, 1, 1)
    assert (zeus["total"], zeus["at_risk_total"]) == (1, 0)
    assert dashboard.project_cards(conn, org["admin"], {"search": "old"}, 1, 1)["at_risk_total"] == 1


def test_at_risk_total_follows_the_managers_scope(conn, org):
    f.project(conn, org["admin"], org["carol"], name="Old", start_date="2026-08-01", predicted_end_date="2026-10-01")
    for who, expected in (("bob", (1, 1)), ("carol", (2, 1))):
        page = dashboard.project_cards(conn, org[who], {}, 1, 20)
        assert (page["total"], page["at_risk_total"]) == expected, who


def test_employees_do_not_get_project_cards(conn, org):
    with pytest.raises(Forbidden):
        dashboard.project_cards(conn, org["alice"], {}, 1, 20)


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

def row_for(grid, who):
    return next(r for r in grid["items"] if r["user_id"] == who.user_id)


def test_allocation_grid_flags_people_booked_past_capacity(conn, org):
    f.booking(conn, org["carol"], org["zeus"], org["alice"], hours_per_week=25,
              start_date="2026-10-12", end_date="2026-10-25")
    grid = dashboard.allocation(conn, org["bob"], {"week_from": "2026-10-12", "weeks": 3})
    alice = row_for(grid, org["alice"])
    first, _, third = alice["weeks"]
    assert (first["booked_hours"], first["project_count"], first["over_allocated"]) == (45, 2, True)
    assert first["over_by_hours"] == 5
    assert (third["booked_hours"], third["over_allocated"], third["over_by_hours"]) == (20, False, 0)
    assert grid["weeks"] == ["2026-10-12", "2026-10-19", "2026-10-26"]
    assert (alice["peak_over_by_hours"], alice["status"], alice["capacity_hours"]) == (5, "OVER_ALLOCATED", 40)


def test_allocation_shows_which_projects_make_up_each_week(conn, org):
    f.booking(conn, org["carol"], org["zeus"], org["alice"], hours_per_week=25,
              start_date="2026-10-12", end_date="2026-10-18")
    alice = row_for(dashboard.allocation(conn, org["bob"], {"week_from": "2026-10-12", "weeks": 2}), org["alice"])
    zeus, apollo = org["zeus"]["project_id"], org["apollo"]["project_id"]
    assert alice["weeks"][0]["projects"] == [{"project_id": zeus, "name": "Zeus", "hours": 25},
                                             {"project_id": apollo, "name": "Apollo", "hours": 20}]
    assert alice["weeks"][1]["projects"] == [{"project_id": apollo, "name": "Apollo", "hours": 20}]


def test_allocation_names_each_persons_job_title(conn, org):
    dan, _ = f.person(conn, org["admin"], first_name="Dan", job_title="Analyst")
    assert row_for(dashboard.allocation(conn, org["bob"], {"weeks": 1}), dan)["job_title"] == "Analyst"


@pytest.fixture
def crowd(conn, org):
    """Dan over by 10 (week 1), Alice over by 5 (week 2 only), Eve within capacity."""
    admin = org["admin"]
    dan, _ = f.person(conn, admin, first_name="Dan")
    eve, _ = f.person(conn, admin, first_name="Eve")
    users.set_capacity(conn, admin, dan.user_id, {"weekly_capacity_hours": 20})
    f.booking(conn, admin, org["apollo"], dan, hours_per_week=30, start_date="2026-10-12", end_date="2026-10-18")
    f.booking(conn, admin, org["zeus"], org["alice"], hours_per_week=25, start_date="2026-10-19",
              end_date="2026-10-25")
    f.booking(conn, admin, org["zeus"], eve, hours_per_week=10)
    return {"dan": dan, "eve": eve}


def test_allocation_puts_the_most_over_allocated_first(conn, org, crowd):
    grid = dashboard.allocation(conn, org["admin"], {"week_from": "2026-10-12", "weeks": 2})
    order = [r["user_id"] for r in grid["items"]]
    assert order[:2] == [crowd["dan"].user_id, org["alice"].user_id]
    assert row_for(grid, crowd["eve"])["status"] == "OK"


def test_allocation_over_only_keeps_anyone_over_in_any_shown_week(conn, org, crowd):
    grid = dashboard.allocation(conn, org["admin"], {"week_from": "2026-10-12", "weeks": 2, "over_only": True})
    assert [r["user_id"] for r in grid["items"]] == [crowd["dan"].user_id, org["alice"].user_id]
    one_week = dashboard.allocation(conn, org["admin"], {"week_from": "2026-10-12", "weeks": 1, "over_only": True})
    assert [r["user_id"] for r in one_week["items"]] == [crowd["dan"].user_id]


def test_allocation_is_paginated_by_person(conn, org, crowd):
    page = dashboard.allocation(conn, org["admin"], {"week_from": "2026-10-12", "weeks": 2, "over_only": True},
                                page=2, page_size=1)
    assert (page["total"], page["total_pages"], page["page"]) == (2, 2, 2)
    assert [r["user_id"] for r in page["items"]] == [org["alice"].user_id]


def test_allocation_for_one_week_ranks_by_that_week_and_counts_everyone(conn, org, crowd):
    """The dashboard's workload chart asks for weeks=1 and the 8 worst: its "Showing 8 of 12" note needs both."""
    admin, this_week = org["admin"], {"week_from": "2026-10-12", "weeks": 1}
    everyone = dashboard.allocation(conn, admin, this_week, page_size=100)
    top = dashboard.allocation(conn, admin, this_week, page=1, page_size=1)
    assert [r["user_id"] for r in top["items"]] == [crowd["dan"].user_id]
    assert top["total"] == len(everyone["items"]) > 1
    peaks = [r["peak_over_by_hours"] for r in everyone["items"]]
    assert peaks == sorted(peaks, reverse=True) and all(len(r["weeks"]) == 1 for r in everyone["items"])
    # Alice is over only next week, so this week she ranks as within capacity.
    assert (row_for(everyone, org["alice"])["peak_over_by_hours"], row_for(everyone, org["alice"])["status"]) == (0, "OK")


def test_allocation_grid_flags_overtime_worked(conn, org):
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"weekly_capacity_hours": 10, "overtime_allowed": True})
    log(conn, org["alice"], org["task"], "2026-10-12", 6)
    log(conn, org["alice"], org["task"], "2026-10-13", 6)
    grid = dashboard.allocation(conn, org["admin"], {"week_from": "2026-10-12", "weeks": 1})
    week = row_for(grid, org["alice"])["weeks"][0]
    assert (week["logged_hours"], week["overtime"]) == (12, True)


def test_employees_do_not_get_the_allocation_grid(conn, org):
    with pytest.raises(Forbidden):
        dashboard.allocation(conn, org["alice"], {})


# --- home pages: a timeline of your projects (redesign spec, section 3) -----------------------------

def timeline_names(conn, actor):
    return [p["name"] for p in dashboard.timeline(conn, actor, 1, 10)["items"]]


def test_timeline_row_holds_the_projects_span_deliverables_and_bookings(conn, org):
    apollo = dashboard.timeline(conn, org["bob"], 1, 10)["items"][0]
    assert apollo == {
        "project_id": org["apollo"]["project_id"], "name": "Apollo", "status": "PLANNING",
        "start_date": "2026-10-01", "end_date": "2026-12-31", "at_risk": True,  # Design: 21% of its time gone, 0% done
        "deliverables": [{"milestone_id": org["design"]["milestone_id"], "name": "Design", "due_date": "2026-11-30",
                          "status": "NOT_STARTED"}],
        "bookings": [{"user_id": org["alice"].user_id, "name": "Alice Tester", "start_date": "2026-10-01",
                      "end_date": "2026-12-31", "hours_per_week": 20}],
    }


def test_timeline_at_risk_is_the_dashboards_own_rule(conn, org):
    f.project(conn, org["admin"], org["carol"], name="Old", start_date="2026-08-01", predicted_end_date="2026-10-01")
    risk = {c["name"]: c["at_risk"] for c in cards(conn, org["admin"])}
    timeline = {p["name"]: p["at_risk"] for p in dashboard.timeline(conn, org["admin"], 1, 10)["items"]}
    assert timeline == risk == {"Apollo": True, "Old": True, "Zeus": False}


def test_timeline_shows_each_role_its_own_projects(conn, org):
    assert timeline_names(conn, org["admin"]) == ["Apollo", "Zeus"]
    assert timeline_names(conn, org["bob"]) == ["Apollo"]
    assert timeline_names(conn, org["carol"]) == ["Zeus"]
    assert timeline_names(conn, org["alice"]) == ["Apollo"]  # booked on Apollo only


def test_employee_timeline_has_projects_with_a_task_but_only_their_own_bookings(conn, org):
    bea, _ = f.person(conn, org["admin"], manager=org["bob"], first_name="Bea")
    f.booking(conn, org["bob"], org["apollo"], bea, hours_per_week=10)
    # Alice keeps a task on Zeus after her booking there is archived.
    zeus_booking = f.booking(conn, org["carol"], org["zeus"], org["alice"])
    f.task(conn, org["carol"], f.deliverable(conn, org["carol"], org["zeus"]), assignee=org["alice"])
    assignments.archive_booking(conn, org["carol"], zeus_booking["assignment_id"])
    rows = {p["name"]: p for p in dashboard.timeline(conn, org["alice"], 1, 10)["items"]}
    assert list(rows) == ["Apollo", "Zeus"]
    assert [b["user_id"] for b in rows["Apollo"]["bookings"]] == [org["alice"].user_id]  # not Bea's
    assert rows["Zeus"]["bookings"] == []
    manager_view = dashboard.timeline(conn, org["bob"], 1, 10)["items"][0]
    assert sorted(b["name"] for b in manager_view["bookings"]) == ["Alice Tester", "Bea Tester"]


def test_timeline_leaves_out_archived_projects_deliverables_and_bookings(conn, org):
    extra = f.deliverable(conn, org["bob"], org["apollo"], name="Dropped")
    milestones.archive_milestone(conn, org["bob"], extra["milestone_id"])
    bea, _ = f.person(conn, org["admin"], manager=org["bob"], first_name="Bea")
    gone = f.booking(conn, org["bob"], org["apollo"], bea)
    assignments.archive_booking(conn, org["bob"], gone["assignment_id"])
    projects.archive_project(conn, org["admin"], org["zeus"]["project_id"])
    [apollo] = dashboard.timeline(conn, org["admin"], 1, 10)["items"]
    assert [d["name"] for d in apollo["deliverables"]] == ["Design"]
    assert [b["name"] for b in apollo["bookings"]] == ["Alice Tester"]


def test_timeline_is_paginated(conn, org):
    page = dashboard.timeline(conn, org["admin"], 2, 1)
    assert (page["total"], page["total_pages"], page["page_size"]) == (2, 2, 1)
    assert [p["name"] for p in page["items"]] == ["Zeus"]


def test_timeline_runs_the_same_queries_whatever_the_page_size(conn, org):
    from test_work import CountingConn

    def queries(page_size):
        counter = CountingConn(conn)
        dashboard.timeline(counter, org["admin"], 1, page_size)
        return counter.count
    before = queries(10)
    for n in range(5):
        proj = f.project(conn, org["admin"], org["bob"], name=f"Extra {n}")
        f.deliverable(conn, org["bob"], proj)
        f.booking(conn, org["bob"], proj, org["alice"], hours_per_week=1)
    assert (before, queries(10), queries(1)) == (6, 6, 6)  # page + count, money, risk, deliverables, bookings


# --- the invariant ------------------------------------------------------------------------------

def test_integrity_check_is_clean_and_admin_only(conn, org):
    assert dashboard.integrity_check(conn, org["admin"]) == {"violations": {}, "checks": 5}
    with pytest.raises(Forbidden):
        dashboard.integrity_check(conn, org["bob"])
