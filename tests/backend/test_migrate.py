"""The migration runner: applies numbered files once, in order, all or nothing."""

import pytest

from domain.errors import MigrationError
from pg import drop_database, open_connection, recreate_database
from store import migrate

DB = "tracker_migrate_test"


@pytest.fixture
def mconn():
    recreate_database(DB)
    conn = open_connection(DB)
    yield conn
    conn.close()
    drop_database(DB)


def write(directory, name, text):
    (directory / name).write_text(text)


def tables(conn):
    rows = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    ).fetchall()
    return {r["table_name"] for r in rows}


def test_fresh_database_reaches_the_latest_version(mconn):
    assert migrate.run(mconn) == [1]
    assert {"users", "projects", "tasks", "time_entries", "audit_log"} <= tables(mconn)


def test_second_run_applies_nothing(mconn):
    migrate.run(mconn)
    assert migrate.run(mconn) == []
    assert mconn.execute("SELECT count(*) AS n FROM schema_migrations").fetchone()["n"] == 1


def test_broken_migration_leaves_no_trace(mconn, tmp_path):
    write(tmp_path, "001_good.sql", "CREATE TABLE good (x INTEGER);")
    write(tmp_path, "002_bad.sql", "CREATE TABLE bad (x NOT_A_TYPE);")
    with pytest.raises(Exception):
        migrate.run(mconn, directory=tmp_path)
    assert "good" not in tables(mconn)
    assert "schema_migrations" not in tables(mconn)


def test_duplicate_version_numbers_are_refused(mconn, tmp_path):
    write(tmp_path, "001_a.sql", "SELECT 1;")
    write(tmp_path, "001_b.sql", "SELECT 1;")
    with pytest.raises(MigrationError, match="001"):
        migrate.run(mconn, directory=tmp_path)


def test_editing_an_applied_migration_is_refused(mconn, tmp_path):
    write(tmp_path, "001_a.sql", "CREATE TABLE a (x INTEGER);")
    migrate.run(mconn, directory=tmp_path)
    write(tmp_path, "001_a.sql", "CREATE TABLE a (x INTEGER, y INTEGER);")
    with pytest.raises(MigrationError, match="changed"):
        migrate.run(mconn, directory=tmp_path)


def test_bootstrap_hook_runs_after_migrations_in_the_same_transaction(mconn):
    seen = []

    def bootstrap(conn):
        seen.append(conn.execute("SELECT count(*) AS n FROM users").fetchone()["n"])

    migrate.run(mconn, bootstrap=bootstrap)
    assert seen == [0]


def test_failing_bootstrap_rolls_back_the_migration(mconn):
    def bootstrap(conn):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        migrate.run(mconn, bootstrap=bootstrap)
    assert "users" not in tables(mconn)
