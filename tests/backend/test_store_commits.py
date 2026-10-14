"""The store must really commit.

psycopg's default (autocommit=False) opens a hidden transaction on the first
statement, after which every transaction() block is only a savepoint and nothing
is ever committed. The rest of the suite runs inside rolled-back transactions,
so only a test on its own database can catch that.
"""

import pytest

from pg import drop_database, open_connection, recreate_database, settings
from store.postgres import atomic, connect

DB = "tracker_commit_test"


@pytest.fixture
def commit_db():
    recreate_database(DB)
    with open_connection(DB) as c:
        c.execute("CREATE TABLE t (x INTEGER)")
    yield DB
    drop_database(DB)


def test_connect_is_autocommit(commit_db):
    with connect(settings(commit_db)) as conn:
        assert conn.autocommit is True


def test_write_after_a_read_is_visible_to_another_connection(commit_db):
    with connect(settings(commit_db)) as conn:
        conn.execute("SELECT 1")          # a read outside atomic(), as a service would do
        with atomic(conn):
            conn.execute("INSERT INTO t VALUES (1)")
        with open_connection(commit_db) as other:
            assert other.execute("SELECT count(*) AS n FROM t").fetchone()["n"] == 1
