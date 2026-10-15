"""Walk every mutating route once and prove each one writes at least one audit row.

Add a route and forget record_change(), or forget to add the route here, and
this fails. The only exemptions are login, refresh and logout (sessions, not
business records) and marking your own notifications read (inbox state).
"""

import json

import factories as f
from api import routes
from test_api import Client, username_of

EXEMPT = {("POST", "/auth/login"), ("POST", "/notifications/{id}/read"), ("POST", "/notifications/read-all"),
          ("POST", "/auth/refresh"), ("POST", "/auth/logout")}  # sessions, not business records


def test_every_mutating_route_writes_an_audit_row(conn):
    admin = f.admin(conn)
    bob, bob_pw = f.person(conn, admin, role="MANAGER", first_name="Bob")
    alice, alice_pw = f.person(conn, admin, manager=bob, first_name="Alice")
    carol, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    for who in (admin, bob, alice):
        conn.execute("UPDATE users SET must_change_password = FALSE WHERE user_id = %s", (who.user_id,))
    a, b, e = Client(conn), Client(conn), Client(conn)
    a.login("AD000001", "Bootstrap-pass-1")
    b.login(username_of(conn, bob), bob_pw)
    e.login(username_of(conn, alice), alice_pw)

    called = set()

    def hit(client, method, template, path, body=None, expect=(200, 201)):
        before = conn.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"]
        status, payload = client.call(method, path, body)
        assert status in expect, (method, path, status, payload)
        after = conn.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"]
        assert after > before, f"{method} {template} wrote no audit row"
        called.add((method, template))
        return payload

    new_user = hit(a, "POST", "/users", "/users", {"firstName": "New", "lastName": "Person",
                                                   "email": "new@acme.test", "role": "EMPLOYEE"})["user"]
    uid = new_user["userId"]
    hit(a, "PATCH", "/users/{id}", f"/users/{uid}", {"jobTitle": "Analyst"})
    hit(b, "PATCH", "/users/me", "/users/me", {"firstName": "Robert"})
    hit(a, "PATCH", "/users/{id}/capacity", f"/users/{uid}/capacity", {"weeklyCapacityHours": 30})
    hit(a, "POST", "/users/{id}/reset-password", f"/users/{uid}/reset-password")
    hit(a, "POST", "/users/{id}/archive", f"/users/{uid}/archive")
    hit(a, "POST", "/users/{id}/reactivate", f"/users/{uid}/reactivate")
    hit(e, "POST", "/auth/change-password", "/auth/change-password",
        {"currentPassword": alice_pw, "newPassword": "alice-new-password"})

    proj = hit(a, "POST", "/projects", "/projects", {"name": "Walk", "managerId": bob.user_id,
                                                     "startDate": "2026-10-01", "predictedEndDate": "2026-12-31",
                                                     "budgetCents": 1_000_000})
    pid = proj["projectId"]
    hit(b, "PATCH", "/projects/{id}", f"/projects/{pid}", {"status": "ACTIVE"})
    booking = hit(b, "POST", "/projects/{id}/assignments", f"/projects/{pid}/assignments",
                  {"userId": alice.user_id, "hoursPerWeek": 20, "startDate": "2026-10-01", "endDate": "2026-12-31"})
    hit(b, "PATCH", "/assignments/{id}", f"/assignments/{booking['assignmentId']}", {"hoursPerWeek": 25})
    m1 = hit(b, "POST", "/projects/{id}/milestones", f"/projects/{pid}/milestones",
             {"name": "Design", "startDate": "2026-10-01", "dueDate": "2026-11-30"})
    m2 = hit(b, "POST", "/projects/{id}/milestones", f"/projects/{pid}/milestones",
             {"name": "Build", "startDate": "2026-10-01", "dueDate": "2026-12-15"})
    hit(b, "PATCH", "/milestones/{id}", f"/milestones/{m1['milestoneId']}", {"description": "First"})
    hit(b, "POST", "/milestones/{id}/dependencies", f"/milestones/{m2['milestoneId']}/dependencies",
        {"dependsOnMilestoneId": m1["milestoneId"]})
    hit(b, "POST", "/milestones/{id}/dependencies/{other_id}/archive",
        f"/milestones/{m2['milestoneId']}/dependencies/{m1['milestoneId']}/archive")
    task = hit(b, "POST", "/milestones/{id}/tasks", f"/milestones/{m1['milestoneId']}/tasks",
               {"title": "Sketch", "estimateMinutes": 120, "assigneeUserId": alice.user_id})
    tid = task["taskId"]
    hit(b, "PATCH", "/tasks/{id}", f"/tasks/{tid}", {"estimateMinutes": 180})
    entry = hit(e, "POST", "/tasks/{id}/time-entries", f"/tasks/{tid}/time-entries",
                {"workDate": "2026-10-13", "minutes": 60, "note": "Started"})
    eid = entry["entryId"]
    hit(e, "PATCH", "/time-entries/{id}", f"/time-entries/{eid}", {"minutes": 90})
    hit(b, "POST", "/time-entries/{id}/reject", f"/time-entries/{eid}/reject")
    hit(e, "PATCH", "/time-entries/{id}", f"/time-entries/{eid}", {"minutes": 60})
    hit(b, "POST", "/time-entries/{id}/approve", f"/time-entries/{eid}/approve")
    hit(e, "POST", "/tasks/{id}/status", f"/tasks/{tid}/status", {"status": "DONE"})
    hit(b, "POST", "/milestones/{id}/sign-off", f"/milestones/{m1['milestoneId']}/sign-off")
    hit(b, "POST", "/milestones/{id}/reopen", f"/milestones/{m1['milestoneId']}/reopen")
    other = hit(b, "POST", "/milestones/{id}/tasks", f"/milestones/{m2['milestoneId']}/tasks",
                {"title": "Spare", "estimateMinutes": 60})
    hit(e, "POST", "/tasks/{id}/claim", f"/tasks/{other['taskId']}/claim")
    hit(e, "POST", "/tasks/{id}/release", f"/tasks/{other['taskId']}/release")
    hit(b, "POST", "/tasks/{id}/archive", f"/tasks/{other['taskId']}/archive")
    hit(b, "POST", "/tasks/{id}/reactivate", f"/tasks/{other['taskId']}/reactivate")
    hit(b, "POST", "/milestones/{id}/archive", f"/milestones/{m2['milestoneId']}/archive")
    hit(b, "POST", "/milestones/{id}/reactivate", f"/milestones/{m2['milestoneId']}/reactivate")
    hit(b, "POST", "/assignments/{id}/archive", f"/assignments/{booking['assignmentId']}/archive")

    req = hit(b, "POST", "/project-requests", "/project-requests",
              {"kind": "NEW_PROJECT", "name": "Hermes", "justification": "Growth", "proposedStart": "2026-11-01", "proposedEnd": "2027-01-31"})
    hit(a, "POST", "/project-requests/{id}/approve", f"/project-requests/{req['requestId']}/approve", {})
    req2 = hit(b, "POST", "/project-requests", "/project-requests",
               {"kind": "NEW_PROJECT", "name": "Iris", "justification": "Maybe"})
    hit(a, "POST", "/project-requests/{id}/reject", f"/project-requests/{req2['requestId']}/reject",
        {"decisionNote": "Later"})
    # An employee asks their line manager, who approves: overtime turns on (two audit rows).
    req3 = hit(e, "POST", "/project-requests", "/project-requests", {"kind": "OVERTIME", "justification": "Launch week"})
    hit(b, "POST", "/project-requests/{id}/approve", f"/project-requests/{req3['requestId']}/approve", {})
    assert conn.execute("SELECT overtime_allowed FROM users WHERE user_id = %s",
                        (alice.user_id,)).fetchone()["overtime_allowed"]
    hit(a, "POST", "/projects/{id}/archive", f"/projects/{pid}/archive")
    hit(a, "POST", "/projects/{id}/reactivate", f"/projects/{pid}/reactivate")

    mutating = {(r.method, r.path) for r in routes.ROUTES if r.method in ("POST", "PATCH")}
    assert mutating - EXEMPT - called == set(), "mutating routes not exercised by this walk"
    assert json.dumps(sorted(called - mutating)) == "[]"
