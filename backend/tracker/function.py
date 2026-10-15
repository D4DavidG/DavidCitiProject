"""AWS Lambda entry point for the ACME Project Tracker API.

Terraform finds this service by backend/tracker/requirements.txt and calls
function.handler. On a cold start it connects to Postgres, applies new
migrations (Aurora isn't publicly reachable, so the schema can only be applied
from inside the Lambda) and creates the first admin if BOOTSTRAP_ADMIN_PASSWORD
is set. A warm instance reuses its connection. The rest is api.app.dispatch().

Lambda instances don't share memory and are recycled at will, so nothing may be
"generated on first run". The JWT secret comes from the environment, so every
instance signs and checks tokens with the same key.
"""

import logging
import os

from api import app, http
from domain import clock
from services import users
from store import migrate
from store.postgres import connect

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_conn = None
_ready = False


def reset() -> None:
    """Forget the cached connection (a fresh cold start). Used by tests."""
    global _conn, _ready
    if _conn is not None and not _conn.closed:
        _conn.close()
    _conn, _ready = None, False


def _connection():
    """The cached connection, reopened if it was closed or broke while the instance sat idle."""
    global _conn
    if _conn is None or _conn.closed or _conn.broken:
        _conn = connect()
    return _conn


def _prepare(conn) -> None:
    """Migrate once per cold start, under the advisory lock in migrate.run()."""
    global _ready
    if _ready:
        return
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    bootstrap = (lambda c: users.bootstrap_admin(c, password)) if password else None
    applied = migrate.run(conn, bootstrap=bootstrap)
    if applied:
        logger.info("Applied migrations %s", applied)
    _ready = True


def handler(event, context=None):
    """Lambda handler: returns {statusCode, headers, body}."""
    secret = os.getenv("JWT_SECRET", "")
    if len(secret) < 32:
        logger.error("JWT_SECRET is missing or shorter than 32 characters")
        return http.respond(503, {"error": "The server is not configured: JWT_SECRET is missing."})
    try:
        conn = _connection()
        _prepare(conn)
    except Exception:
        logger.exception("Database not ready")
        reset()
        return http.respond(503, {"error": "The database is not ready. Please try again shortly."})
    return app.dispatch(event, conn, secret, clock.now())
