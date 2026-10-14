"""function.handler: the Lambda entry point. Uses its own database, because it commits for real."""

import json

import pytest

import function
from pg import drop_database, open_connection, recreate_database, settings

DB = "tracker_function_test"
SECRET = "x" * 40


def event(method, path, body=None, token=None):
    headers = {"authorization": f"Bearer {token}"} if token else {}
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
            "body": json.dumps(body) if body is not None else None}


@pytest.fixture
def lambda_env(monkeypatch):
    recreate_database(DB)
    s = settings(DB)
    for key, value in {"POSTGRES_HOST": s["host"], "POSTGRES_PORT": str(s["port"]), "POSTGRES_USER": s["user"],
                       "POSTGRES_PASS": s["password"], "POSTGRES_NAME": DB, "IS_LOCAL": "true",
                       "JWT_SECRET": SECRET, "BOOTSTRAP_ADMIN_PASSWORD": "first-admin-password"}.items():
        monkeypatch.setenv(key, value)
    function.reset()
    yield
    function.reset()
    drop_database(DB)


def call(evt):
    response = function.handler(evt, None)
    return response["statusCode"], json.loads(response["body"])


def test_cold_start_migrates_and_creates_the_first_admin(lambda_env):
    assert call(event("GET", "/health")) == (200, {"status": "ok"})
    with open_connection(DB) as conn:
        assert conn.execute("SELECT username, must_change_password FROM users").fetchall() == [
            {"username": "AD000001", "must_change_password": True}]


def test_first_admin_can_sign_in_through_the_lambda(lambda_env):
    status, payload = call(event("POST", "/auth/login", {"username": "ad000001", "password": "first-admin-password"}))
    assert status == 200
    status, me = call(event("GET", "/api/tracker/auth/me", token=payload["token"]))
    assert (status, me["username"]) == (200, "AD000001")


def test_second_cold_start_does_not_create_a_second_admin(lambda_env):
    call(event("GET", "/health"))
    function.reset()
    call(event("GET", "/health"))
    with open_connection(DB) as conn:
        assert conn.execute("SELECT count(*) AS n FROM users").fetchone()["n"] == 1


def test_unreachable_database_answers_503(lambda_env, monkeypatch):
    monkeypatch.setenv("POSTGRES_PORT", "1")
    function.reset()
    status, payload = call(event("GET", "/health"))
    assert (status, payload) == (503, {"error": "The database is not ready. Please try again shortly."})


def test_missing_or_short_jwt_secret_refuses_to_serve(lambda_env, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "short")
    status, payload = call(event("GET", "/health"))
    assert status == 503 and "JWT_SECRET" in payload["error"]
