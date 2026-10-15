"""Postgres connections, transactions, and translation of driver errors.

Every connection is autocommit, and every write goes through atomic(): a real
BEGIN ... COMMIT at the outermost level, a savepoint when nested. With psycopg's
default (autocommit=False) the first statement opens a hidden transaction, every
later transaction() is only a savepoint, and nothing is ever committed.
tests/backend/test_store_commits.py guards against that.
"""

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from domain.errors import Conflict, NotFound, StorageUnavailable, ValidationError

# Database constraint name -> (error class, message for the caller). Only rules a
# user can trip through the API are listed; any other violation is a bug and is re-raised.
CONSTRAINT_ERRORS = {
    "users_username_unique": (Conflict, "That username is already taken."),
    "users_email_unique": (Conflict, "That email is already in use."),
    "users_email_format": (ValidationError, "Email address is not valid."),
    "users_names_present": (ValidationError, "First and last name are required."),
    "users_capacity_range": (ValidationError, "Weekly capacity must be 1 to 60 hours."),
    "users_salary_positive": (ValidationError, "Salary can't be negative."),
    "users_not_own_manager": (ValidationError, "A person can't be their own manager."),
    "projects_name_present": (ValidationError, "Project name is required."),
    "projects_dates_ordered": (ValidationError, "End date can't be before start date."),
    "projects_budget_positive": (ValidationError, "Budget can't be negative."),
    "assignments_hours_range": (ValidationError, "A booking is 1 to 40 hours a week."),
    "assignments_dates_ordered": (ValidationError, "End date can't be before start date."),
    "assignments_no_overlap": (Conflict, "This person already has a booking on this project for those dates."),
    "milestones_name_present": (ValidationError, "Deliverable name is required."),
    "milestones_dates_ordered": (ValidationError, "Due date can't be before start date."),
    "dependencies_not_self": (ValidationError, "A deliverable can't depend on itself."),
    "dependencies_same_project_from": (ValidationError, "Dependencies must be within one project."),
    "dependencies_same_project_to": (ValidationError, "Dependencies must be within one project."),
    "milestone_dependencies_pkey": (Conflict, "That dependency already exists."),
    "tasks_title_present": (ValidationError, "Task title is required."),
    "tasks_estimate_range": (ValidationError, "Estimate must be 1 minute to 1000 hours."),
    "tasks_on_project_milestone": (ValidationError, "The deliverable is not on this project."),
    "time_entries_minutes_range": (ValidationError, "An entry is 1 minute to 24 hours."),
    "time_entries_not_own_approval": (Conflict, "Nobody approves their own time."),
    "requests_text_present": (ValidationError, "Name and justification are required."),
    "requests_dates_ordered": (ValidationError, "End date can't be before start date."),
}


def settings_from_env() -> dict:
    """Connection settings from the variables Terraform gives every Lambda."""
    result = {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432") or 5432),
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASS", ""),
        "dbname": os.getenv("POSTGRES_NAME", "postgres"),
        "connect_timeout": 15,
    }
    if os.getenv("IS_LOCAL", "true") == "false":
        result["sslmode"] = "require"  # encrypt the connection to Aurora on AWS (the workshop brief asks for it; docs/ARCHITECTURE.md)
    return result


def connect(settings: dict | None = None) -> psycopg.Connection:
    """Open an autocommit connection that returns rows as dicts."""
    try:
        return psycopg.connect(**(settings or settings_from_env()), autocommit=True, row_factory=dict_row)
    except psycopg.OperationalError as exc:
        raise StorageUnavailable("The database is unavailable. Nothing was changed.") from exc


def columns(names: list[str]) -> sql.Composable:
    """A comma-separated list of quoted column names."""
    return sql.SQL(", ").join(map(sql.Identifier, names))


def insert(conn: psycopg.Connection, table: str, values: dict,
           returning: sql.Composable = sql.SQL("*")) -> dict:
    """INSERT one row and return it. Names are quoted identifiers, values are parameters (no string-built SQL)."""
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING {}").format(
        sql.Identifier(table), columns(list(values)),
        sql.SQL(", ").join(map(sql.Placeholder, values)), returning)
    return conn.execute(query, values).fetchone()


def update(conn: psycopg.Connection, table: str, key: str, key_value: int, changes: dict,
           returning: sql.Composable = sql.SQL("*")) -> dict:
    """UPDATE one row by its key, stamping updated_at, and return it."""
    sets = sql.SQL(", ").join(
        sql.SQL("{} = {}").format(sql.Identifier(k), sql.Placeholder(k)) for k in changes)
    query = sql.SQL("UPDATE {} SET {}, updated_at = now() WHERE {} = {} RETURNING {}").format(
        sql.Identifier(table), sets, sql.Identifier(key), sql.Placeholder("_key"), returning)
    return conn.execute(query, {**changes, "_key": key_value}).fetchone()


@contextmanager
def atomic(conn: psycopg.Connection) -> Iterator[None]:
    """Run the block as one transaction (a savepoint if already inside one)."""
    with translate_errors(), conn.transaction():
        yield


@contextmanager
def translate_errors() -> Iterator[None]:
    """Turn psycopg errors into domain errors, so none escapes the store."""
    try:
        yield
    except psycopg.errors.IntegrityError as exc:
        name = exc.diag.constraint_name
        if name in CONSTRAINT_ERRORS:
            error_class, message = CONSTRAINT_ERRORS[name]
            raise error_class(message) from exc
        if isinstance(exc, psycopg.errors.ForeignKeyViolation):
            raise NotFound("A referenced record does not exist.") from exc
        raise
    except psycopg.OperationalError as exc:
        raise StorageUnavailable("The database is unavailable. Nothing was changed.") from exc
