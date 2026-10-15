"""The HTTP layer: routing, authentication, authorisation, error mapping, response shapes.

Requests are real Lambda Function URL events (payload format 2.0) passed to the
same dispatch() that function.py uses, inside the test's rolled-back transaction.
"""

import base64
import datetime as dt
import json

import pytest

import factories as f
from api import app, routes
from api.errors import to_response
from domain.errors import Conflict, OverCapacity, ValidationError
from services import tokens

SECRET = "api-test-secret"
NOW = dt.datetime(2026, 10, 14, 15, 0, tzinfo=dt.timezone.utc)
LATER, LATER2 = NOW + dt.timedelta(seconds=1), NOW + dt.timedelta(seconds=2)  # tokens compare whole seconds


def event(method, path, body=None, token=None, query=None, raw_body=None, b64=False):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    text = raw_body if raw_body is not None else (json.dumps(body) if body is not None else None)
    if b64 and text is not None:
        text = base64.b64encode(text.encode()).decode()
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
            "queryStringParameters": query, "body": text, "isBase64Encoded": b64}


class Client:
    def __init__(self, conn):
        self.conn = conn
        self.token = self.refresh_token = None

    def call(self, method, path, body=None, query=None, token="default", now=NOW, **kw):
        response = app.dispatch(event(method, path, body, self.token if token == "default" else token, query, **kw),
                                self.conn, SECRET, now)
        payload = json.loads(response["body"]) if response["body"] else None
        return response["statusCode"], payload

    def login(self, username, password):
        status, payload = self.call("POST", "/auth/login", {"username": username, "password": password}, token=None)
        assert status == 200, payload
        self.token, self.refresh_token = payload["token"], payload.get("refreshToken")
        return payload


def username_of(conn, actor):
    return conn.execute("SELECT username FROM users WHERE user_id = %s", (actor.user_id,)).fetchone()["username"]


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    bob, bob_pw = f.person(conn, admin, role="MANAGER", first_name="Bob")
    carol, carol_pw = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, alice_pw = f.person(conn, admin, manager=bob, first_name="Alice")
    apollo = f.project(conn, admin, bob, name="Apollo")
    zeus = f.project(conn, admin, carol, name="Zeus")
    f.booking(conn, admin, apollo, alice)
    for who in (admin, bob, carol, alice):  # skip the forced password change for these fixtures
        conn.execute("UPDATE users SET must_change_password = FALSE WHERE user_id = %s", (who.user_id,))
    return {"admin": admin, "bob": bob, "carol": carol, "alice": alice, "apollo": apollo, "zeus": zeus,
            "pw": {"admin": "Bootstrap-pass-1", "bob": bob_pw, "carol": carol_pw, "alice": alice_pw}}


def client_for(conn, org, who):
    c = Client(conn)
    c.login(username_of(conn, org[who]), org["pw"][who])
    return c


# --- routing ------------------------------------------------------------------

@pytest.mark.parametrize("path", ["/projects", "//projects", "/api/tracker/projects", "/api/tracker//projects/"])
def test_local_and_cloudfront_path_shapes_reach_the_same_route(conn, org, path):
    c = client_for(conn, org, "admin")
    status, payload = c.call("GET", path)
    assert status == 200 and "items" in payload


def test_unknown_route_is_404_with_error_shape(conn, org):
    status, payload = client_for(conn, org, "admin").call("GET", "/nope")
    assert (status, list(payload)) == (404, ["error"])


def test_wrong_method_is_405(conn, org):
    status, payload = client_for(conn, org, "admin").call("PUT", "/projects")
    assert status == 405 and "error" in payload


def test_health_is_public(conn):
    status, payload = Client(conn).call("GET", "/health", token=None)
    assert (status, payload) == (200, {"status": "ok"})


# --- authentication -------------------------------------------------------------

def test_login_returns_token_and_user_with_camel_case_fields(conn, org):
    payload = Client(conn).login(username_of(conn, org["alice"]), org["pw"]["alice"])
    assert payload["user"]["firstName"] == "Alice" and "passwordHash" not in payload["user"]


def test_bad_login_is_401(conn, org):
    status, payload = Client(conn).call("POST", "/auth/login", {"username": "AD000001", "password": "wrong"}, token=None)
    assert (status, payload) == (401, {"error": "Username or password is incorrect."})


@pytest.mark.parametrize("route", [r for r in routes.ROUTES if not r.public], ids=lambda r: f"{r.method} {r.path}")
def test_every_route_except_public_ones_requires_a_token(conn, route):
    path = route.path.replace("{id}", "1").replace("{other_id}", "2")
    status, payload = Client(conn).call(route.method, path, {}, token=None)
    assert status == 401, payload


def test_public_routes_are_exactly_login_refresh_logout_and_health():
    assert {(r.method, r.path) for r in routes.ROUTES if r.public} == {
        ("POST", "/auth/login"), ("POST", "/auth/refresh"), ("POST", "/auth/logout"), ("GET", "/health")}


def test_forged_token_is_401(conn, org):
    status, _ = Client(conn).call("GET", "/auth/me", token="a.b.c")
    assert status == 401


def test_archived_users_token_stops_working(conn, org):
    c = client_for(conn, org, "alice")
    client_for(conn, org, "admin").call("POST", f"/users/{org['alice'].user_id}/archive")
    status, _ = c.call("GET", "/auth/me")
    assert status == 401


# --- sessions: refresh and logout ----------------------------------------------------

def test_login_returns_a_refresh_token(conn, org):
    payload = Client(conn).login(username_of(conn, org["alice"]), org["pw"]["alice"])
    assert len(payload["refreshToken"]) >= 40 and payload["expiresAt"] == (NOW + tokens.LIFETIME).isoformat()


def test_refresh_round_trip(conn, org):
    c = client_for(conn, org, "alice")
    first = c.refresh_token
    status, payload = c.call("POST", "/auth/refresh", {"refreshToken": first}, token=None, now=LATER)
    assert status == 200 and set(payload) == {"token", "expiresAt", "refreshToken"}
    assert payload["expiresAt"] == (LATER + tokens.LIFETIME).isoformat()
    assert c.call("GET", "/auth/me", token=payload["token"], now=LATER)[0] == 200
    assert c.call("POST", "/auth/refresh", {"refreshToken": first}, token=None, now=LATER)[0] == 401  # reuse
    second = payload["refreshToken"]
    assert c.call("POST", "/auth/refresh", {"refreshToken": second}, token=None, now=LATER)[0] == 401  # all ended


def test_logout_revokes_and_answers_204(conn, org):
    c = client_for(conn, org, "alice")
    assert c.call("POST", "/auth/logout", {"refreshToken": c.refresh_token}, token=None) == (204, None)
    assert c.call("POST", "/auth/refresh", {"refreshToken": c.refresh_token}, token=None)[0] == 401
    assert c.call("POST", "/auth/logout", {"refreshToken": c.refresh_token}, token=None) == (204, None)
    assert c.call("POST", "/auth/logout", {}, token=None) == (204, None)


def test_change_password_returns_a_working_session(conn, org):
    c = client_for(conn, org, "alice")
    old_refresh = c.refresh_token
    status, payload = c.call("POST", "/auth/change-password",
                             {"currentPassword": org["pw"]["alice"], "newPassword": "a-new-password"}, now=LATER)
    assert status == 200 and {"token", "expiresAt", "refreshToken", "user"} <= set(payload)
    assert payload["user"]["mustChangePassword"] is False
    assert c.call("GET", "/auth/me", token=payload["token"], now=LATER2)[0] == 200
    assert c.call("POST", "/auth/refresh", {"refreshToken": old_refresh}, token=None, now=LATER2)[0] == 401
    # The old token was revoked, not rotated: presenting it must not end the new session.
    assert c.call("POST", "/auth/refresh", {"refreshToken": payload["refreshToken"]}, token=None,
                  now=LATER2)[0] == 200


@pytest.mark.parametrize("action", ["reset-password", "archive"])
def test_reset_and_archive_end_the_targets_refresh_tokens(conn, org, action):
    alice = client_for(conn, org, "alice")
    status, _ = client_for(conn, org, "admin").call("POST", f"/users/{org['alice'].user_id}/{action}")
    assert status == 200
    live = conn.execute("SELECT count(*) AS n FROM refresh_tokens WHERE user_id = %s AND revoked_at IS NULL",
                        (org["alice"].user_id,)).fetchone()["n"]
    assert live == 0
    assert alice.call("POST", "/auth/refresh", {"refreshToken": alice.refresh_token}, token=None)[0] == 401


def test_token_from_before_a_password_change_is_refused(conn, org):
    first, second = client_for(conn, org, "alice"), client_for(conn, org, "alice")  # two tabs, same person
    status, _ = first.call("POST", "/auth/change-password",
                           {"currentPassword": org["pw"]["alice"], "newPassword": "a-new-password"}, now=LATER)
    assert status == 200
    assert second.call("GET", "/auth/me", now=LATER) == (401, {"error": tokens.INVALID_MESSAGE})


def test_admin_reset_ends_the_targets_access_tokens(conn, org):
    alice = client_for(conn, org, "alice")
    status, _ = client_for(conn, org, "admin").call("POST", f"/users/{org['alice'].user_id}/reset-password", now=LATER)
    assert status == 200
    assert alice.call("GET", "/auth/me", now=LATER) == (401, {"error": tokens.INVALID_MESSAGE})


def test_token_issued_after_the_change_works(conn, org):
    alice = client_for(conn, org, "alice")
    alice.call("POST", "/auth/change-password",
               {"currentPassword": org["pw"]["alice"], "newPassword": "a-new-password"}, now=LATER)
    status, payload = alice.call("POST", "/auth/login", {"username": username_of(conn, org["alice"]),
                                                         "password": "a-new-password"}, token=None, now=LATER2)
    assert alice.call("GET", "/auth/me", token=payload["token"], now=LATER2)[0] == 200


def test_forced_password_change_blocks_everything_else(conn, org):
    conn.execute("UPDATE users SET must_change_password = TRUE WHERE user_id = %s", (org["alice"].user_id,))
    c = client_for(conn, org, "alice")
    assert c.call("GET", "/projects")[0] == 403
    assert c.call("GET", "/auth/me")[0] == 200
    status, _ = c.call("POST", "/auth/change-password",
                       {"currentPassword": org["pw"]["alice"], "newPassword": "a-new-password"})
    assert status == 200
    assert c.call("GET", "/projects")[0] == 200


def test_role_comes_from_the_database_not_the_token(conn, org):
    dan, dan_pw = f.person(conn, org["admin"], role="MANAGER", first_name="Dan")  # manages no projects
    conn.execute("UPDATE users SET must_change_password = FALSE WHERE user_id = %s", (dan.user_id,))
    c = Client(conn)
    c.login(username_of(conn, dan), dan_pw)
    assert c.call("GET", "/users")[0] == 200
    status, _ = client_for(conn, org, "admin").call("PATCH", f"/users/{dan.user_id}", {"role": "EMPLOYEE"})
    assert status == 200
    assert c.call("GET", "/users")[0] == 403  # same token, demoted in the database


# --- authorisation and errors -------------------------------------------------------

def test_employee_cannot_create_users(conn, org):
    status, payload = client_for(conn, org, "alice").call(
        "POST", "/users", {"firstName": "A", "lastName": "B", "email": "a@acme.test", "role": "EMPLOYEE"})
    assert status == 403 and "error" in payload


def test_another_managers_project_is_byte_identical_to_a_missing_one(conn, org):
    c = client_for(conn, org, "bob")
    _, not_yours = c.call("GET", f"/projects/{org['zeus']['project_id']}")
    status, missing = c.call("GET", "/projects/999999")
    assert status == 404 and json.dumps(not_yours) == json.dumps(missing)


def test_validation_error_names_the_field_in_camel_case(conn, org):
    status, payload = client_for(conn, org, "admin").call("POST", "/projects", {
        "name": "X", "managerId": org["bob"].user_id, "startDate": "2026-10-01",
        "predictedEndDate": "2026-12-31", "budgetCents": 10.5})
    assert (status, payload["field"]) == (400, "budgetCents")


@pytest.mark.parametrize("path, body, message, field", [
    ("/projects", {}, "Name is required.", "name"),
    ("/projects/{apollo}/milestones", {"startDate": "2026-10-05", "dueDate": "2026-10-20"},
     "Name is required.", "name"),
    ("/milestones/{deliverable}/tasks", {"estimateMinutes": 60}, "Title is required.", "title"),
    ("/projects/{apollo}/assignments", {"userId": "{alice}", "startDate": "2026-10-05", "endDate": "2026-10-30"},
     "Hours per week is required.", "hoursPerWeek"),
])
def test_each_create_names_its_missing_field(conn, org, path, body, message, field):
    ids = {"apollo": org["apollo"]["project_id"], "alice": org["alice"].user_id,
           "deliverable": f.deliverable(conn, org["admin"], org["apollo"])["milestone_id"]}
    body = {k: ids["alice"] if v == "{alice}" else v for k, v in body.items()}
    status, payload = client_for(conn, org, "admin").call("POST", path.format(**ids), body)
    assert (status, payload["error"], payload["field"]) == (400, message, field)


def test_malformed_json_is_400(conn, org):
    status, payload = client_for(conn, org, "admin").call("POST", "/projects", raw_body="{not json")
    assert status == 400 and "JSON" in payload["error"]


def test_base64_bodies_are_decoded(conn, org):
    c = client_for(conn, org, "admin")
    status, payload = c.call("PATCH", f"/projects/{org['apollo']['project_id']}", {"description": "b64"}, b64=True)
    assert (status, payload["description"]) == (200, "b64")


def alice_at_2_hours(conn, org):
    """Bob gives Alice a task and a 2 h week; returns (bob, alice, task path)."""
    bob = client_for(conn, org, "bob")
    ms = bob.call("POST", f"/projects/{org['apollo']['project_id']}/milestones",
                  {"name": "D", "startDate": "2026-10-01", "dueDate": "2026-11-30"})[1]
    task = bob.call("POST", f"/milestones/{ms['milestoneId']}/tasks",
                    {"title": "T", "estimateMinutes": 600, "assigneeUserId": org["alice"].user_id})[1]
    bob.call("PATCH", f"/users/{org['alice'].user_id}/capacity", {"weeklyCapacityHours": 2})
    return bob, client_for(conn, org, "alice"), f"/tasks/{task['taskId']}/time-entries"


def test_over_capacity_is_409(conn, org):
    _, alice, path = alice_at_2_hours(conn, org)
    status, payload = alice.call("POST", path, {"workDate": "2026-10-13", "minutes": 180})
    assert status == 409
    assert payload == {"error": "This puts you 1 h over your 2 h week. Log anyway? Your manager will be told.",
                       "code": "OVER_CAPACITY"}


def test_confirmed_over_capacity_is_201_and_marked(conn, org):
    bob, alice, path = alice_at_2_hours(conn, org)
    status, payload = alice.call("POST", path, {"workDate": "2026-10-13", "minutes": 180, "confirmOverCapacity": True})
    assert status == 201 and payload["overCapacity"] is True
    queue = bob.call("GET", "/approvals/time-entries")[1]["items"]
    assert [e["overCapacity"] for e in queue] == [True]


def test_approvals_queue_marks_time_past_the_tasks_estimate(conn, org):
    bob = client_for(conn, org, "bob")
    ms = bob.call("POST", f"/projects/{org['apollo']['project_id']}/milestones",
                  {"name": "D", "startDate": "2026-10-01", "dueDate": "2026-11-30"})[1]
    task = bob.call("POST", f"/milestones/{ms['milestoneId']}/tasks",
                    {"title": "T", "estimateMinutes": 60, "assigneeUserId": org["alice"].user_id})[1]
    alice = client_for(conn, org, "alice")
    status, entry = alice.call("POST", f"/tasks/{task['taskId']}/time-entries",
                               {"workDate": "2026-10-13", "minutes": 90})
    assert status == 201 and "overEstimate" not in entry
    [queued] = bob.call("GET", "/approvals/time-entries")[1]["items"]
    assert (queued["taskEstimateMinutes"], queued["taskLoggedMinutes"], queued["overEstimate"]) == (60, 90, True)
    [mine] = alice.call("GET", "/me/time-entries")[1]["items"]
    assert "overEstimate" not in mine


def test_allocation_takes_a_name_search_and_a_project_list(conn, org):
    bob = client_for(conn, org, "bob")
    apollo, zeus = org["apollo"]["project_id"], org["zeus"]["project_id"]
    status, grid = bob.call("GET", "/dashboard/allocation", query={"q": "ALICE", "projectIds": f"{zeus},{apollo}"})
    assert status == 200 and [p["name"] for p in grid["items"]] == ["Alice Tester"]
    assert grid["items"][0]["weeks"][0]["projects"] == [{"projectId": apollo, "name": "Apollo", "hours": 20}]
    assert (grid["items"][0]["weeks"][0]["shownHours"], grid["items"][0]["weeks"][0]["bookedHours"]) == (20, 20)
    assert bob.call("GET", "/dashboard/allocation", query={"projectIds": str(zeus)})[1]["total"] == 0
    assert bob.call("GET", "/dashboard/allocation", query={"q": "nobody"})[1]["total"] == 0


@pytest.mark.parametrize("raw", ["abc", "1,,2", "-1", "1.5"])
def test_allocation_refuses_a_bad_project_list_with_400_naming_project_ids(conn, org, raw):
    status, payload = client_for(conn, org, "bob").call("GET", "/dashboard/allocation", query={"projectIds": raw})
    assert (status, payload) == (400, {"error": "Project ids must be whole numbers separated by commas.",
                                       "field": "projectIds"})


def test_over_capacity_answer_carries_its_code():
    assert to_response(OverCapacity("x")) == (409, {"error": "x", "code": "OVER_CAPACITY"})


def test_other_errors_have_no_code():
    assert to_response(Conflict("x")) == (409, {"error": "x"})
    assert to_response(ValidationError("x", field="work_date")) == (400, {"error": "x", "field": "workDate"})


# --- shapes ---------------------------------------------------------------------------

def test_lists_use_the_pagination_envelope(conn, org):
    status, payload = client_for(conn, org, "admin").call("GET", "/users", query={"page": "1", "pageSize": "2"})
    assert set(payload) == {"items", "page", "pageSize", "total", "totalPages"}
    assert (payload["page"], payload["pageSize"], len(payload["items"])) == (1, 2, 2)


def test_create_returns_201_and_the_new_resource(conn, org):
    status, payload = client_for(conn, org, "admin").call("POST", "/users", {
        "firstName": "David", "lastName": "Guamao", "email": "david@acme.test", "role": "EMPLOYEE"})
    assert status == 201
    assert payload["user"]["username"].startswith("DG") and len(payload["temporaryPassword"]) == 12


def test_salary_is_hidden_from_managers(conn, org):
    _, as_bob = client_for(conn, org, "bob").call("GET", f"/users/{org['alice'].user_id}")
    _, as_admin = client_for(conn, org, "admin").call("GET", f"/users/{org['alice'].user_id}")
    assert "annualSalaryCents" not in as_bob and as_admin["annualSalaryCents"] == 10_000_000


def test_responses_are_json(conn, org):
    response = app.dispatch(event("GET", "/health"), conn, SECRET, NOW)
    assert response["headers"]["content-type"] == "application/json"


# --- the route table itself ---------------------------------------------------------------

def test_there_is_no_delete_route_anywhere():
    assert [r for r in routes.ROUTES if r.method == "DELETE" or "delete" in r.path.lower()] == []


def test_no_service_has_a_delete_function():
    import importlib
    import pkgutil
    import services
    names = []
    for module in pkgutil.iter_modules(services.__path__):
        mod = importlib.import_module(f"services.{module.name}")
        names += [f"{module.name}.{n}" for n in dir(mod) if "delete" in n.lower()]
    assert names == []


def test_capacity_takes_task_limit_and_names_the_field_when_out_of_range(conn, org):
    b = client_for(conn, org, "bob")
    uid = org["alice"].user_id
    status, payload = b.call("PATCH", f"/users/{uid}/capacity", {"taskLimit": 11})
    assert (status, payload) == (400, {"error": "Task limit must be between 1 and 10.", "field": "taskLimit"})
    status, payload = b.call("PATCH", f"/users/{uid}/capacity", {"taskLimit": 3})
    assert (status, payload["taskLimit"]) == (200, 3)


# --- the pull board ---------------------------------------------------------------

def test_only_employees_take_tasks_from_the_board(conn, org):
    ms = f.deliverable(conn, org["bob"], org["apollo"])
    bob, alice = client_for(conn, org, "bob"), client_for(conn, org, "alice")
    status, made = bob.call("POST", f"/milestones/{ms['milestone_id']}/tasks", {"title": "Free", "estimateMinutes": 60})
    assert status == 201
    assert bob.call("POST", f"/tasks/{made['taskId']}/claim")[0] == 403
    status, taken = alice.call("POST", f"/tasks/{made['taskId']}/claim")
    assert status == 200
    assert taken["status"] == "IN_PROGRESS" and taken["assigneeUserId"] == org["alice"].user_id


@pytest.mark.parametrize("who", ["bob", "admin"])
def test_managers_and_admins_have_no_ready_list_and_cannot_put_back(conn, org, who):
    ms = f.deliverable(conn, org["bob"], org["apollo"])
    mine = f.task(conn, org["bob"], ms, assignee=org["alice"])
    c = client_for(conn, org, who)
    assert c.call("GET", "/me/ready-tasks")[0] == 403
    assert c.call("POST", f"/tasks/{mine['task_id']}/release")[0] == 403


def test_the_limit_refusal_is_409_with_the_server_message(conn, org):
    ms = f.deliverable(conn, org["bob"], org["apollo"])
    f.task(conn, org["bob"], ms, assignee=org["alice"])
    f.task(conn, org["bob"], ms, assignee=org["alice"])
    third = f.task(conn, org["bob"], ms)
    status, payload = client_for(conn, org, "alice").call("POST", f"/tasks/{third['task_id']}/claim")
    assert (status, payload) == (409, {"error": "You already hold 2 unfinished tasks, your limit. "
                                                "Finish one first, or ask your manager to raise it."})


def test_another_managers_board_is_byte_identical_to_a_missing_one(conn, org):
    carol = client_for(conn, org, "carol")
    other = carol.call("GET", f"/projects/{org['apollo']['project_id']}/board")
    missing = carol.call("GET", "/projects/999999/board")
    assert other == missing and other[0] == 404


def test_an_employee_not_booked_on_the_project_gets_the_same_404_for_its_board(conn, org):
    alice = client_for(conn, org, "alice")  # booked on Apollo, not on Zeus
    other = alice.call("GET", f"/projects/{org['zeus']['project_id']}/board")
    missing = alice.call("GET", "/projects/999999/board")
    assert other == missing and other[0] == 404
    assert alice.call("GET", f"/projects/{org['apollo']['project_id']}/board")[0] == 200


# --- one person's history -----------------------------------------------------

def test_history_never_shows_salary_to_a_manager(conn, org):
    alice = org["alice"].user_id
    admin = client_for(conn, org, "admin")
    assert admin.call("PATCH", f"/users/{alice}", {"annualSalaryCents": 12_345_600})[0] == 200
    status, payload = client_for(conn, org, "bob").call("GET", f"/users/{alice}/history")
    assert status == 200
    text = json.dumps(payload)
    assert "12345600" not in text and "annualSalaryCents" not in text
    assert not any("beforeState" in i or "afterState" in i for i in payload["items"])
    assert payload["items"][0]["summary"] and payload["items"][0]["actorName"]
    items = admin.call("GET", f"/users/{alice}/history")[1]["items"]
    assert any((i["afterState"] or {}).get("annualSalaryCents") == 12_345_600 for i in items)


def test_own_history_has_no_state(conn, org):
    status, payload = client_for(conn, org, "alice").call("GET", f"/users/{org['alice'].user_id}/history")
    assert status == 200 and payload["items"]
    assert not any("beforeState" in i for i in payload["items"])


def test_someone_elses_history_is_404_not_403(conn, org):
    carol, alice = client_for(conn, org, "carol"), client_for(conn, org, "alice")
    other = carol.call("GET", f"/users/{org['alice'].user_id}/history")
    assert other == carol.call("GET", "/users/999999/history") and other[0] == 404
    assert alice.call("GET", f"/users/{org['bob'].user_id}/history") == alice.call("GET", "/users/999999/history")


def test_history_rejects_a_bad_date(conn, org):
    status, payload = client_for(conn, org, "admin").call(
        "GET", f"/users/{org['alice'].user_id}/history", query={"dateFrom": "nope"})
    assert status == 400 and payload["field"] == "dateFrom"
