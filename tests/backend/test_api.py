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

SECRET = "api-test-secret"
NOW = dt.datetime(2026, 10, 14, 15, 0, tzinfo=dt.timezone.utc)


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
        self.token = None

    def call(self, method, path, body=None, query=None, token="default", **kw):
        response = app.dispatch(event(method, path, body, self.token if token == "default" else token, query, **kw),
                                self.conn, SECRET, NOW)
        payload = json.loads(response["body"]) if response["body"] else None
        return response["statusCode"], payload

    def login(self, username, password):
        status, payload = self.call("POST", "/auth/login", {"username": username, "password": password}, token=None)
        assert status == 200, payload
        self.token = payload["token"]
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


def test_public_routes_are_exactly_login_and_health():
    assert {(r.method, r.path) for r in routes.ROUTES if r.public} == {("POST", "/auth/login"), ("GET", "/health")}


def test_forged_token_is_401(conn, org):
    status, _ = Client(conn).call("GET", "/auth/me", token="a.b.c")
    assert status == 401


def test_archived_users_token_stops_working(conn, org):
    c = client_for(conn, org, "alice")
    client_for(conn, org, "admin").call("POST", f"/users/{org['alice'].user_id}/archive")
    status, _ = c.call("GET", "/auth/me")
    assert status == 401


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


def test_malformed_json_is_400(conn, org):
    status, payload = client_for(conn, org, "admin").call("POST", "/projects", raw_body="{not json")
    assert status == 400 and "JSON" in payload["error"]


def test_base64_bodies_are_decoded(conn, org):
    c = client_for(conn, org, "admin")
    status, payload = c.call("PATCH", f"/projects/{org['apollo']['project_id']}", {"description": "b64"}, b64=True)
    assert (status, payload["description"]) == (200, "b64")


def test_over_capacity_is_409(conn, org):
    bob = client_for(conn, org, "bob")
    ms = bob.call("POST", f"/projects/{org['apollo']['project_id']}/milestones",
                  {"name": "D", "startDate": "2026-10-01", "dueDate": "2026-11-30"})[1]
    task = bob.call("POST", f"/milestones/{ms['milestoneId']}/tasks",
                    {"title": "T", "estimateMinutes": 600, "assigneeUserId": org["alice"].user_id})[1]
    bob.call("PATCH", f"/users/{org['alice'].user_id}/capacity", {"weeklyCapacityHours": 2})
    alice = client_for(conn, org, "alice")
    status, payload = alice.call("POST", f"/tasks/{task['taskId']}/time-entries",
                                 {"workDate": "2026-10-13", "minutes": 180})
    assert status == 409 and "capacity" in payload["error"]


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
