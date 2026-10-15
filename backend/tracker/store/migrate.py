"""Apply numbered migration files once each, in order, all or nothing.

Runs on every Lambda cold start (function.py) and in the tests. An advisory lock
makes two cold starts queue instead of both migrating. Each applied file's sha256
is recorded; an applied file that later changes is refused, so fix forward with a
new file instead of editing one that has already run on Aurora.
"""

import hashlib
import re
from pathlib import Path
from typing import Callable

import psycopg

from domain.errors import MigrationError

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
LOCK_KEY = 74_131_015  # any fixed number, the same in every instance
FILE_NAME = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")


def _read_files(directory: Path) -> list[tuple[int, str, str]]:
    """Read every migration file as (version, name, text), sorted by version; refuse bad or duplicate numbers."""
    found: dict[int, str] = {}
    files = []
    for path in sorted(directory.glob("*.sql")):
        match = FILE_NAME.match(path.name)
        if not match:
            raise MigrationError(f"Badly named migration file: {path.name}")
        version = int(match.group(1))
        if version in found:
            raise MigrationError(f"Two migrations share number {match.group(1)}: {found[version]}, {path.name}")
        found[version] = path.name
        files.append((version, path.name, path.read_text()))
    return files


def run(
    conn: psycopg.Connection,
    directory: Path = MIGRATIONS_DIR,
    bootstrap: Callable[[psycopg.Connection], None] | None = None,
) -> list[int]:
    """Apply pending migrations, then the optional bootstrap hook, in one transaction.

    Returns the versions applied; an empty list means the database was current.
    """
    files = _read_files(directory)
    applied_now = []
    with conn.transaction():
        conn.execute("SET LOCAL lock_timeout = '10s'")
        conn.execute("SET LOCAL statement_timeout = '60s'")
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_KEY,))
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL,"
            " applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        recorded = {
            row["version"]: row["sha256"]
            for row in conn.execute("SELECT version, sha256 FROM schema_migrations").fetchall()
        }
        for version, name, text in files:
            digest = hashlib.sha256(text.encode()).hexdigest()
            if version in recorded:
                if recorded[version] != digest:
                    raise MigrationError(f"{name} changed after it was applied. Add a new migration instead.")
                continue
            conn.execute(text)  # no parameters, so one file can hold several statements
            conn.execute(
                "INSERT INTO schema_migrations (version, name, sha256) VALUES (%s, %s, %s)",
                (version, name, digest),
            )
            applied_now.append(version)
        if bootstrap is not None:
            bootstrap(conn)
    return applied_now
