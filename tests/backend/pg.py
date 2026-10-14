"""Connection settings and database helpers shared by the test suite.

Tests never read the app's POSTGRES_* variables, so they can't touch the app's
database by accident (CLAUDE.md trap 12). Database names are hard-coded here.
"""

import os

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

TEST_DB = "tracker_test"


def settings(dbname: str) -> dict:
    """Return connection settings for a test database on the local server."""
    return {
        "host": os.getenv("TEST_PG_HOST", "localhost"),
        "port": int(os.getenv("TEST_PG_PORT", "5432")),
        "user": os.getenv("TEST_PG_USER", "postgres"),
        "password": os.getenv("TEST_PG_PASS", "postgres123"),
        "dbname": dbname,
    }


def recreate_database(name: str) -> None:
    """Drop and create a database, disconnecting anyone attached to it."""
    with psycopg.connect(**settings("postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))


def drop_database(name: str) -> None:
    """Drop a database, disconnecting anyone attached to it."""
    with psycopg.connect(**settings("postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


def open_connection(name: str) -> psycopg.Connection:
    """Open an autocommit connection returning rows as dicts."""
    return psycopg.connect(**settings(name), autocommit=True, row_factory=dict_row)
