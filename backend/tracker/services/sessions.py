"""Refresh tokens: how a signed-in tab gets a new 15-minute access token.

Login hands out two things: a short access token (a JWT, 15 minutes) and a
refresh token (32 random bytes). Only the refresh token's SHA-256 is stored, so
a database leak gives nobody a usable token.

- Rotation: each refresh retires the token used and returns a new pair.
- Fixed expiry: every token in the chain dies 8 hours after login.
- Reuse detection: a rotated token coming back means someone has a copy, so
  every live refresh token of that user is revoked and both sides sign in again.
  A token revoked any other way (sign out, password change, reset, archive) is
  just refused: nobody copied it, so the user's other sessions stay.

Sessions are not audited (see the design, section 2): a refresh every 15 minutes
would flood the audit log and the admins' bells.
"""

import datetime as dt
import hashlib
import logging
import secrets

import psycopg

from domain.errors import AuthenticationError
from services import tokens
from store.postgres import atomic, insert

logger = logging.getLogger(__name__)
REFRESH_LIFETIME = dt.timedelta(hours=8)  # counted from login; rotation never extends it


def _hash(raw) -> str:
    """The SHA-256 of a refresh token, as 64 hex characters. Only this is stored.

    Anything that isn't text (missing, a number) hashes as "", which matches no row.
    """
    return hashlib.sha256((raw if isinstance(raw, str) else "").encode()).hexdigest()


def _new_pair(conn: psycopg.Connection, user_id: int, secret: str, now: dt.datetime,
              expires_at: dt.datetime) -> tuple[dict, int]:
    """Store a new refresh token; return the pair to send and the new row's id."""
    raw = secrets.token_urlsafe(32)
    row = insert(conn, "refresh_tokens", {"user_id": user_id, "token_hash": _hash(raw),
                                          "created_at": now, "expires_at": expires_at})
    return {"token": tokens.issue(user_id, secret, now), "refresh_token": raw}, row["refresh_token_id"]


def start(conn: psycopg.Connection, user_id: int, secret: str, now: dt.datetime) -> dict:
    """A new session at login: {"token", "refresh_token"}."""
    with atomic(conn):
        pair, _ = _new_pair(conn, user_id, secret, now, now + REFRESH_LIFETIME)
    return pair


def rotate(conn: psycopg.Connection, raw: str | None, secret: str, now: dt.datetime) -> dict:
    """Swap a live refresh token for a new pair; any problem is the standard 401."""
    reused_by = None
    with atomic(conn):
        old = conn.execute(
            "SELECT r.refresh_token_id, r.user_id, r.expires_at, r.revoked_at, r.replaced_by, u.is_archived"
            " FROM refresh_tokens r JOIN users u ON u.user_id = r.user_id"
            " WHERE r.token_hash = %s FOR UPDATE OF r",
            (_hash(raw),),
        ).fetchone()
        if old is None or old["expires_at"] <= now or old["is_archived"]:
            raise AuthenticationError(tokens.INVALID_MESSAGE)
        if old["replaced_by"] is not None:
            reused_by = old["user_id"]  # a rotated token came back: someone has a copy
            revoke_all(conn, reused_by, now)
        elif old["revoked_at"] is not None:
            raise AuthenticationError(tokens.INVALID_MESSAGE)  # signed out or ended: refuse only
        else:
            pair, new_id = _new_pair(conn, old["user_id"], secret, now, old["expires_at"])
            conn.execute("UPDATE refresh_tokens SET revoked_at = %s, replaced_by = %s WHERE refresh_token_id = %s",
                         (now, new_id, old["refresh_token_id"]))
    if reused_by is not None:
        # Raised after the block, so the revocation above is committed.
        logger.warning("refresh token reuse for user %s; all their sessions ended", reused_by)
        raise AuthenticationError(tokens.INVALID_MESSAGE)
    return pair


def end(conn: psycopg.Connection, raw: str | None, now: dt.datetime) -> None:
    """Sign out: revoke this refresh token if it is live. Never raises, never reveals anything."""
    with atomic(conn):
        conn.execute("UPDATE refresh_tokens SET revoked_at = %s WHERE token_hash = %s AND revoked_at IS NULL",
                     (now, _hash(raw)))


def revoke_all(conn: psycopg.Connection, user_id: int, now: dt.datetime) -> None:
    """End every live refresh token of one user (password change, reset, archive, reuse)."""
    with atomic(conn):
        conn.execute("UPDATE refresh_tokens SET revoked_at = %s WHERE user_id = %s AND revoked_at IS NULL",
                     (now, user_id))
