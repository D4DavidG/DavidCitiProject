"""Walk every read route once through HTTP, plus the API's remaining error paths.

The services have their own rule tests; this proves each GET route is wired to
the right service and answers in the agreed shape. test_api_audit_walk.py walks
the write routes. Add a route and forget to walk it, and one of the two fails.
"""

import pytest

import factories as f
from api import errors, routes
from services import milestones, notifications, requests, time_entries
from test_api import client_for, org  # noqa: F401  (org is a fixture used by name)

PAGE_KEYS = {"items", "page", "pageSize", "total", "totalPages"}


@pytest.fixture
def world(conn, org):  # noqa: F811
    """org plus one of everything a read route can show."""
    bob, alice, apollo = org["bob"], org["alice"], org["apollo"]
    design = f.deliverable(conn, bob, apollo, name="Design")
    build = f.deliverable(conn, bob, apollo, name="Build", due_date="2026-12-15")
    milestones.add_dependency(conn, bob, build["milestone_id"], design["milestone_id"])
    task = f.task(conn, bob, design, assignee=alice, title="Sketch")
    entry = time_entries.log_time(conn, alice, task["task_id"], {"work_date": "2026-10-13", "minutes": 90})
    request = requests.create_request(conn, bob, {"kind": "NEW_PROJECT", "name": "Hermes", "justification": "Growth"})
    return {**org, "design": design, "build": build, "task": task, "entry": entry, "request": request}


def test_every_read_route_answers_in_shape(conn, world):
    a, b, e = (client_for(conn, world, who) for who in ("admin", "bob", "alice"))
    pid = world["apollo"]["project_id"]
    design, task, entry = world["design"]["milestone_id"], world["task"]["task_id"], world["entry"]["entry_id"]
    called = set()

    def get(client, template, path, query=None):
        status, payload = client.call("GET", path, query=query)
        assert status == 200, (template, status, payload)
        called.add(("GET", template))
        return payload

    assert get(a, "/health", "/health")["status"] == "ok"
    assert get(e, "/auth/me", "/auth/me")["userId"] == world["alice"].user_id
    assert PAGE_KEYS <= get(a, "/users", "/users").keys()
    assert get(a, "/users/{id}", f"/users/{world['alice'].user_id}")["firstName"] == "Alice"
    history = get(b, "/users/{id}/history", f"/users/{world['alice'].user_id}/history")
    assert PAGE_KEYS <= history.keys() and history["items"][0]["actorName"]

    assert PAGE_KEYS <= get(b, "/projects", "/projects").keys()
    assert get(b, "/projects/{id}", f"/projects/{pid}")["name"] == "Apollo"
    budget = get(b, "/projects/{id}/budget", f"/projects/{pid}/budget")
    assert {"budgetCents", "plannedCents", "consumedCents", "pendingCents", "remainingCents"} <= budget.keys()
    assert {"consumedPercent", "plannedPercent", "pendingPercent"} <= budget.keys()
    assert not any("_" in k for k in budget)  # every key reaches the website in camelCase
    assert budget["pendingCents"] > 0  # Alice's 90 minutes, not yet approved
    graph = get(e, "/projects/{id}/dependency-graph", f"/projects/{pid}/dependency-graph")
    assert len(graph["nodes"]) == 2 and len(graph["edges"]) == 1

    bookings = get(b, "/projects/{id}/assignments", f"/projects/{pid}/assignments")
    assert PAGE_KEYS <= bookings.keys() and bookings["items"][0]["personName"].startswith("Alice")
    deliverables = get(b, "/projects/{id}/milestones", f"/projects/{pid}/milestones")
    assert [d["name"] for d in deliverables["items"]] == ["Design", "Build"]
    # Status comes from the tasks, not from logged time: Alice's task is still To Do.
    assert get(e, "/milestones/{id}", f"/milestones/{design}")["status"] == "NOT_STARTED"
    assert [t["taskId"] for t in get(e, "/milestones/{id}/tasks", f"/milestones/{design}/tasks")["items"]] == [task]
    assert [t["taskId"] for t in get(e, "/me/tasks", "/me/tasks")["items"]] == [task]

    mine = get(e, "/me/time-entries", "/me/time-entries", {"dateFrom": "2026-10-13", "dateTo": "2026-10-13"})
    assert [x["entryId"] for x in mine["items"]] == [entry]
    assert "hourlyRateCents" not in mine["items"][0]  # the rate would reveal salary
    later = e.call("GET", "/me/time-entries", query={"dateFrom": "2026-10-14"})[1]
    assert later["total"] == 0
    assert [x["entryId"] for x in get(b, "/approvals/time-entries", "/approvals/time-entries")["items"]] == [entry]

    rid = world["request"]["request_id"]
    assert get(b, "/project-requests", "/project-requests", {"status": "PENDING"})["total"] == 1
    one = get(b, "/project-requests/{id}", f"/project-requests/{rid}")
    assert (one["name"], one["kind"], one["requesterName"]) == ("Hermes", "NEW_PROJECT", "Bob Tester")
    assert get(e, "/project-requests", "/project-requests", {"scope": "MINE"})["total"] == 0

    assert PAGE_KEYS <= get(a, "/dashboard/at-risk", "/dashboard/at-risk").keys()
    board = get(b, "/dashboard/projects", "/dashboard/projects")
    assert PAGE_KEYS <= board.keys() and [c["name"] for c in board["items"]] == ["Apollo"]
    assert {"atRisk", "riskReasons", "progressPercent", "budgetCents", "plannedCents", "consumedCents",
            "pendingCents", "managerName", "plannedPercent", "pendingPercent"} <= board["items"][0].keys()
    one = get(a, "/dashboard/projects", "/dashboard/projects", {"pageSize": "1"})  # atRiskTotal counts every page
    every = get(a, "/dashboard/projects", "/dashboard/projects")["items"]
    assert PAGE_KEYS <= one.keys() and one["total"] >= 1
    assert one["atRiskTotal"] == sum(c["atRisk"] for c in every)
    grid = get(b, "/dashboard/allocation", "/dashboard/allocation", {"weekFrom": "2026-10-12", "weeks": "2"})
    assert PAGE_KEYS <= grid.keys() and grid["weeks"] == ["2026-10-12", "2026-10-19"]
    alice_row = next(p for p in grid["items"] if p["userId"] == world["alice"].user_id)
    assert (alice_row["status"], alice_row["peakOverByHours"], alice_row["capacityHours"]) == ("OK", 0, 40)
    week = alice_row["weeks"][0]
    assert week["bookedHours"] == 20 and week["loggedMinutes"] == 90 and week["overByHours"] == 0
    assert week["projects"] == [{"projectId": pid, "name": "Apollo", "hours": 20}]
    assert b.call("GET", "/dashboard/allocation", query={"overOnly": "true"})[1]["total"] == 0
    # The dashboard's workload chart: one week, a short page, and the total of everyone for its note.
    status, one = b.call("GET", "/dashboard/allocation", query={"weekFrom": "2026-10-12", "weeks": "1", "pageSize": "1"})
    assert status == 200 and one["weeks"] == ["2026-10-12"] and len(one["items"]) == 1
    assert (one["pageSize"], one["total"]) == (1, grid["total"])
    # The home pages' timeline: ten projects a page unless asked, field names exactly as the spec lists them.
    home = get(e, "/dashboard/timeline", "/dashboard/timeline")
    assert PAGE_KEYS <= home.keys() and (home["pageSize"], home["total"]) == (10, 1)
    [row] = home["items"]
    assert set(row) == {"projectId", "name", "status", "startDate", "endDate", "atRisk", "deliverables", "bookings"}
    assert [d["name"] for d in row["deliverables"]] == ["Design", "Build"]
    assert set(row["deliverables"][0]) == {"milestoneId", "name", "dueDate", "status"}
    assert row["bookings"] == [{"userId": world["alice"].user_id, "name": "Alice Tester", "startDate": "2026-10-01",
                                "endDate": "2026-12-31", "hoursPerWeek": 20}]
    assert b.call("GET", "/dashboard/timeline", query={"pageSize": "1"})[1]["pageSize"] == 1
    check = get(a, "/admin/integrity-check", "/admin/integrity-check")
    assert check["checks"] == 5 and all(rows == [] for rows in check["violations"].values())
    assert get(a, "/admin/audit-log", "/admin/audit-log")["total"] > 0

    inbox = get(b, "/notifications", "/notifications", {"unread": "true"})
    assert inbox["total"] >= 1 and all(not n["isRead"] for n in inbox["items"])
    assert get(b, "/notifications/unread-count", "/notifications/unread-count")["count"] == inbox["total"]

    status, one = b.call("POST", f"/notifications/{inbox['items'][0]['notificationId']}/read")
    assert status == 200 and one["isRead"] is True
    called.add(("POST", "/notifications/{id}/read"))
    status, done = b.call("POST", "/notifications/read-all")
    assert status == 200 and done["updated"] == inbox["total"] - 1
    called.add(("POST", "/notifications/read-all"))
    assert b.call("GET", "/notifications/unread-count")[1]["count"] == 0

    # `board` is taken above by /dashboard/projects; only Alice is booked on Apollo and Sketch is hers (TODO).
    pull = get(b, "/projects/{id}/board", f"/projects/{pid}/board")
    assert PAGE_KEYS <= pull.keys() and [t["title"] for t in pull["items"]] == ["Sketch"]
    assert pull["people"] == [{"userId": world["alice"].user_id, "name": "Alice Tester", "held": 1, "limit": 2}]
    ready = get(e, "/me/ready-tasks", "/me/ready-tasks")
    assert (ready["total"], ready["held"], ready["limit"]) == (0, 1, 2)

    reads = {(r.method, r.path) for r in routes.ROUTES if r.method == "GET"}
    inbox_writes = {("POST", "/notifications/{id}/read"), ("POST", "/notifications/read-all")}
    assert (reads | inbox_writes) - called == set(), "read routes not exercised by this walk"


# --- names the screens need -------------------------------------------------------------------

def test_my_tasks_name_their_project_and_deliverable(conn, world):
    items = client_for(conn, world, "alice").call("GET", "/me/tasks")[1]["items"]
    assert (items[0]["projectName"], items[0]["milestoneName"]) == ("Apollo", "Design")


def test_logged_time_names_the_person_task_and_project(conn, world):
    queue = client_for(conn, world, "bob").call("GET", "/approvals/time-entries")[1]["items"]
    assert (queue[0]["personName"], queue[0]["taskTitle"], queue[0]["projectName"]) == ("Alice Tester", "Sketch", "Apollo")
    mine = client_for(conn, world, "alice").call("GET", "/me/time-entries")[1]["items"]
    assert (mine[0]["taskTitle"], mine[0]["projectName"]) == ("Sketch", "Apollo")


def test_logging_time_says_which_day_it_was_for(conn, world):
    # Without the day, a week logged in one sitting reads as five identical notifications.
    summary = conn.execute("SELECT summary FROM audit_log WHERE entity_type = 'time_entries' AND action = 'CREATE'"
                           " AND entity_id = %s", (world["entry"]["entry_id"],)).fetchone()["summary"]
    assert "2026-10-13" in summary and "Sketch" in summary


def test_approving_time_snapshots_only_the_entry_not_the_joined_names(conn, world):
    # The approval reads the entry joined to its author's name; that name must not leak
    # into the audit snapshot, or every approval would show a fake "personName" change.
    entry = world["entry"]["entry_id"]
    status, _ = client_for(conn, world, "bob").call("POST", f"/time-entries/{entry}/approve")
    assert status == 200
    row = conn.execute("SELECT before_state, after_state FROM audit_log WHERE entity_type = 'time_entries'"
                       " AND entity_id = %s AND action = 'APPROVE'", (entry,)).fetchone()
    assert "personName" not in row["before_state"] and "personName" not in row["after_state"]
    changed = {k for k in row["before_state"] if row["before_state"][k] != row["after_state"].get(k)}
    # updatedAt only differs outside a test, where the two steps aren't one transaction.
    assert {"status", "decidedBy", "decidedAt"} <= changed <= {"status", "decidedBy", "decidedAt", "updatedAt"}


# --- search: q on every list (redesign spec, section 2) ----------------------------------------

@pytest.mark.parametrize("who, path, q", [
    ("alice", "/me/tasks", "SKETCH"),                  # task title
    ("alice", "/me/ready-tasks", "spare"),             # task title
    ("bob", "/approvals/time-entries", "alice"),       # person's name
    ("bob", "/project-requests", "hermes"),            # request name
    ("bob", "/notifications", "sketch"),               # message text
    ("admin", "/admin/audit-log", "TIME_ENTRIES"),     # entity type
    ("admin", "/users", "ali"),                        # the older lists take q too
    ("bob", "/projects", "apol"),
    ("bob", "/dashboard/projects", "apol"),
])
def test_q_searches_each_list_on_the_server(conn, world, who, path, q):
    f.task(conn, world["bob"], world["build"], title="Spare")  # a Ready task for Alice's board
    client = client_for(conn, world, who)
    status, found = client.call("GET", path, query={"q": q})
    assert status == 200 and found["total"] >= 1, found
    status, missed = client.call("GET", path, query={"q": "no such thing"})
    assert status == 200 and (missed["total"], missed["items"]) == (0, [])


def test_request_scope_is_sent_or_decide_and_anything_else_is_400(conn, world):
    b = client_for(conn, world, "bob")
    assert [r["name"] for r in b.call("GET", "/project-requests", query={"scope": "sent"})[1]["items"]] == ["Hermes"]
    assert b.call("GET", "/project-requests", query={"scope": "decide"})[1]["total"] == 0
    status, payload = b.call("GET", "/project-requests", query={"scope": "everyone"})
    assert status == 400 and payload["field"] == "scope"


# --- the audit log's filters ----------------------------------------------------------------

def test_audit_log_filters_by_actor_entity_and_date(conn, world):
    a = client_for(conn, world, "admin")
    task = world["task"]["task_id"]
    alice = world["alice"].user_id

    by_entity = a.call("GET", "/admin/audit-log", query={"entityType": "tasks", "entityId": str(task)})[1]
    assert by_entity["total"] >= 1
    assert {(x["entityType"], x["entityId"]) for x in by_entity["items"]} == {("tasks", task)}

    by_actor = a.call("GET", "/admin/audit-log", query={"actorId": str(alice)})[1]
    assert by_actor["total"] >= 1 and {x["actorUserId"] for x in by_actor["items"]} == {alice}

    everything = a.call("GET", "/admin/audit-log")[1]["total"]
    wide = a.call("GET", "/admin/audit-log", query={"dateFrom": "2000-01-01", "dateTo": "2999-12-31"})[1]
    assert wide["total"] == everything
    assert a.call("GET", "/admin/audit-log", query={"dateFrom": "2999-01-01"})[1]["total"] == 0


def test_audit_log_is_admin_only(conn, world):
    status, payload = client_for(conn, world, "bob").call("GET", "/admin/audit-log")
    assert status == 403 and set(payload) == {"error"}


# --- refusals on read routes ----------------------------------------------------------------

def test_employee_is_refused_the_budget_and_the_approval_queue(conn, world):
    e = client_for(conn, world, "alice")
    assert e.call("GET", f"/projects/{world['apollo']['project_id']}/budget")[0] == 403
    assert e.call("GET", "/approvals/time-entries")[0] == 403
    assert e.call("GET", "/dashboard/allocation")[0] == 403
    assert e.call("GET", "/dashboard/projects")[0] == 403


def test_another_managers_request_is_404_not_403(conn, world):
    carol = client_for(conn, world, "carol")
    rid = world["request"]["request_id"]
    mine = carol.call("GET", f"/project-requests/{rid}")
    missing = carol.call("GET", "/project-requests/999999")
    assert mine == missing and mine[0] == 404


def test_another_managers_report_request_is_404_not_403(conn, world):
    req = requests.create_request(conn, world["alice"], {"kind": "OVERTIME", "justification": "Launch week"})
    bob, carol = client_for(conn, world, "bob"), client_for(conn, world, "carol")
    assert bob.call("GET", f"/project-requests/{req['request_id']}")[1]["requesterName"] == "Alice Tester"
    theirs = carol.call("GET", f"/project-requests/{req['request_id']}")
    assert theirs == carol.call("GET", "/project-requests/999999") and theirs[0] == 404


def test_employee_cannot_decide_requests(conn, world):
    e = client_for(conn, world, "alice")
    req = requests.create_request(conn, world["alice"], {"kind": "OTHER", "name": "A desk", "justification": "Back"})
    assert e.call("POST", f"/project-requests/{req['request_id']}/approve", {})[0] == 403
    assert e.call("POST", f"/project-requests/{req['request_id']}/reject", {})[0] == 403


def test_someone_elses_notification_is_404_like_a_missing_one(conn, world):
    b, e = client_for(conn, world, "bob"), client_for(conn, world, "alice")
    bobs = b.call("GET", "/notifications")[1]["items"][0]["notificationId"]
    assert e.call("POST", f"/notifications/{bobs}/read") == e.call("POST", "/notifications/999999/read")
    assert e.call("POST", f"/notifications/{bobs}/read")[0] == 404


# --- malformed requests -----------------------------------------------------------------------

@pytest.mark.parametrize("query, field", [({"page": "two"}, "page"), ({"pageSize": "1.5"}, "pageSize"),
                                          ({"unread": "yes"}, "unread"), ({"overOnly": "1"}, "overOnly")])
def test_malformed_query_values_are_400_with_the_field(conn, world, query, field):
    status, payload = client_for(conn, world, "bob").call("GET", "/notifications", query=query)
    assert status == 400 and payload["field"] == field


@pytest.mark.parametrize("raw", ["[1, 2]", "\"text\"", "42"])
def test_a_body_that_is_not_a_json_object_is_400(conn, world, raw):
    status, payload = client_for(conn, world, "bob").call("PATCH", "/users/me", raw_body=raw)
    assert status == 400 and payload == {"error": "The request body must be a JSON object."}


def test_dependency_target_must_be_an_id(conn, world):
    b = client_for(conn, world, "bob")
    status, payload = b.call("POST", f"/milestones/{world['build']['milestone_id']}/dependencies",
                             {"dependsOnMilestoneId": "Design"})
    assert status == 400 and payload["field"] == "dependsOnMilestoneId"


# --- unexpected failures ----------------------------------------------------------------------

def test_an_unexpected_crash_is_a_bare_500_that_reveals_nothing(conn, world, monkeypatch):
    def boom(*_args, **_kw):
        raise RuntimeError("password_hash column exploded at /var/task/services")

    monkeypatch.setattr(notifications, "unread_count", boom)
    status, payload = client_for(conn, world, "bob").call("GET", "/notifications/unread-count")
    assert status == 500 and payload == {"error": errors.UNEXPECTED}


def test_a_domain_error_missing_from_the_status_table_is_a_500(conn, world, monkeypatch):
    from domain.errors import DomainError

    def unmapped(*_args, **_kw):
        raise DomainError("internal detail")

    monkeypatch.setattr(notifications, "unread_count", unmapped)
    status, payload = client_for(conn, world, "bob").call("GET", "/notifications/unread-count")
    assert status == 500 and payload == {"error": errors.UNEXPECTED}
