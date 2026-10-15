"""Dispatch one request: parse, route, authenticate, authorise, run the handler, map errors.

    event -> http.parse -> routes.match -> authorise -> handler -> service -> Postgres
          <- http.respond <------------- errors.to_response (on a domain exception)
"""

import datetime as dt
import logging

import psycopg

from api import errors, http, routes
from api.handlers import Context
from domain.errors import AuthenticationError, DomainError, Forbidden, PasswordChangeRequired
from services import actors, tokens
from services.actors import Actor
from store.postgres import translate_errors

logger = logging.getLogger(__name__)


def authorise(conn: psycopg.Connection, request: http.Request, route: routes.Route, secret: str,
              now: dt.datetime) -> Actor:
    """Return the caller, read fresh from the database; refuse if their stored role can't use this route.

    The token only proves who signed in. Role and the must-change-password flag
    come from Postgres, never from the token, so a demoted user loses access at once.
    """
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise AuthenticationError(tokens.INVALID_MESSAGE)
    actor = actors.load(conn, tokens.verify(header[len("Bearer "):], secret, now))
    if actor.must_change_password and not route.allowed_before_password_change:
        raise PasswordChangeRequired("Change your generated password before continuing.")
    if route.roles is not None and actor.role not in route.roles:
        raise Forbidden("Your role can't do this.")
    return actor


def dispatch(event: dict, conn: psycopg.Connection, secret: str, now: dt.datetime) -> dict:
    """Handle one Lambda event and return the Lambda response."""
    try:
        request = http.parse(event)
        route, params = routes.match(request.method, request.path)
        with translate_errors():
            actor = None if route.public else authorise(conn, request, route, secret, now)
            payload = route.handler(Context(conn, request, actor, params, secret, now))
        return http.respond(route.status, payload)
    except DomainError as exc:
        return http.respond(*errors.to_response(exc))
    except Exception:  # a bug: log the details, tell the caller nothing internal
        logger.exception("Unhandled error for %s", event.get("rawPath"))
        return http.respond(500, {"error": errors.UNEXPECTED})
