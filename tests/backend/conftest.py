"""Shared fixtures.

- tracker_test is rebuilt once per run with the real migrations.
- Every test runs inside one transaction that is always rolled back, so tests
  can't see each other's data. Code under test calls atomic(), which nests as a
  savepoint.
- After every test the integrity queries must return nothing (spec section 6).
"""

import datetime as dt

import psycopg
import pytest

from domain import clock
from pg import TEST_DB, open_connection, recreate_database
from services import passwords
from store import integrity, migrate

FROZEN_TODAY = dt.date(2026, 10, 14)  # a Wednesday


@pytest.fixture(autouse=True)
def fast_hashing(monkeypatch):
    """Hash at 1,000 rounds in tests; test_security checks production stays at 600,000."""
    monkeypatch.setattr(passwords, "ROUNDS", 1000)


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch):
    """Every test runs on Wednesday 14 Oct 2026, Eastern time."""
    real_today = clock.today
    monkeypatch.setattr(clock, "today", lambda now=None: FROZEN_TODAY if now is None else real_today(now))


@pytest.fixture(scope="session")
def test_database():
    recreate_database(TEST_DB)
    with open_connection(TEST_DB) as conn:
        migrate.run(conn)
    return TEST_DB


@pytest.fixture
def conn(test_database, request):
    connection = open_connection(test_database)
    try:
        with connection.transaction(force_rollback=True):
            yield connection
            _check_integrity(connection, request)
    finally:
        connection.close()


def _check_integrity(connection, request):
    if request.node.get_closest_marker("no_integrity_check"):
        return
    if connection.info.transaction_status != psycopg.pq.TransactionStatus.INTRANS:
        return  # the test already failed; don't hide its error behind this one
    skip = {"audit"} if request.node.get_closest_marker("schema") else set()
    violations = integrity.find_violations(connection, skip=skip)
    assert violations == {}, f"Integrity check failed after the test: {violations}"


def insert(connection, table, **values):
    """Insert one row with raw SQL and return it (for schema tests)."""
    columns = ", ".join(values)
    placeholders = ", ".join(f"%({k})s" for k in values)
    return connection.execute(
        f"INSERT INTO {table} ({columns}) VALUES ({placeholders}) RETURNING *", values
    ).fetchone()


def refused(connection, statement, params=None):
    """Run a statement that must fail; return the violated constraint's name (or the error)."""
    try:
        with connection.transaction():
            connection.execute(statement, params)
    except psycopg.errors.Error as exc:
        return exc.diag.constraint_name or type(exc).__name__
    raise AssertionError(f"Statement was accepted: {statement}")
