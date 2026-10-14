"""Signed session tokens (JWT, HS256), standard library only.

The token says who you are; the database says what you may do. It carries only
the user id and its times, never the role: the role is re-read from Postgres on
every request, so a demoted user's old token can't keep admin powers.

Signed, not encrypted: anyone holding a token can read it, so nothing
sensitive goes in. Every failure gets the same message, because telling an
attacker which part of a forgery was wrong tells them what to fix.
"""

import base64
import datetime as dt
import hashlib
import hmac
import json
from typing import NamedTuple

from domain.errors import AuthenticationError

LIFETIME = dt.timedelta(minutes=15)  # short: a stolen token is useful for 15 minutes at most
INVALID_MESSAGE = "Your session is invalid or has expired. Please sign in again."
_HEADER = {"alg": "HS256", "typ": "JWT"}


class Claims(NamedTuple):
    """What a valid token says: who, and when it was issued (Unix seconds)."""

    user_id: int
    issued_at: int


def _encode(obj: dict) -> str:
    raw = json.dumps(obj, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _decode(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def _sign(signing_input: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def issue(user_id: int, secret: str, now: dt.datetime) -> str:
    """A token for `user_id`, valid for LIFETIME from `now`."""
    issued = int(now.timestamp())
    payload = {"sub": str(user_id), "iat": issued, "exp": issued + int(LIFETIME.total_seconds())}
    signing_input = f"{_encode(_HEADER)}.{_encode(payload)}"
    return f"{signing_input}.{_sign(signing_input, secret)}"


def verify(token: str | None, secret: str, now: dt.datetime) -> Claims:
    """Return the user id and issue time of a valid, unexpired token; otherwise one uniform 401."""
    try:
        header, payload, signature = token.split(".")
        # Check the signature before trusting anything inside the token.
        if not hmac.compare_digest(_sign(f"{header}.{payload}", secret), signature):
            raise ValueError("bad signature")
        claims = json.loads(_decode(payload))
        if claims["exp"] <= now.timestamp():
            raise ValueError("expired")
        return Claims(int(claims["sub"]), int(claims["iat"]))
    except (AttributeError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise AuthenticationError(INVALID_MESSAGE) from exc
