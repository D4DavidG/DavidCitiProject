"""Refresh tokens: stored as a hash, rotated on use, fixed expiry, reuse signs everyone out."""

import datetime as dt
import hashlib

import pytest

import factories as f
from domain.errors import AuthenticationError
from services import sessions, tokens

SECRET = "sessions-test-secret"
NOW = dt.datetime(2026, 10, 14, 12, 0, tzinfo=dt.timezone.utc)


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    alice, _ = f.person(conn, admin, first_name="Alice")
    bob, _ = f.person(conn, admin, first_name="Bob")
    return {"admin": admin, "alice": alice, "bob": bob}


def row_of(conn, raw):
    return conn.execute("SELECT * FROM refresh_tokens WHERE token_hash = %s",
                        (hashlib.sha256(raw.encode()).hexdigest(),)).fetchone()


def live_count(conn, user_id):
    return conn.execute("SELECT count(*) AS n FROM refresh_tokens WHERE user_id = %s AND revoked_at IS NULL",
                        (user_id,)).fetchone()["n"]


def test_only_the_hash_is_stored(conn, org):
    raw = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    row = row_of(conn, raw)
    assert row["token_hash"] == hashlib.sha256(raw.encode()).hexdigest()
    assert raw not in [str(v) for v in row.values()]


def test_refresh_token_expires_eight_hours_after_login(conn, org):
    raw = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    assert row_of(conn, raw)["expires_at"] == NOW + dt.timedelta(hours=8)


def test_rotate_gives_a_new_pair_and_retires_the_old_one(conn, org):
    old = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    later = NOW + dt.timedelta(minutes=20)
    new = sessions.rotate(conn, old, SECRET, later)
    assert new["refresh_token"] != old
    retired, fresh = row_of(conn, old), row_of(conn, new["refresh_token"])
    assert (retired["revoked_at"], retired["replaced_by"]) == (later, fresh["refresh_token_id"])
    assert tokens.verify(new["token"], SECRET, later).user_id == org["alice"].user_id


def test_rotation_keeps_the_original_expiry(conn, org):
    first = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    second = sessions.rotate(conn, first, SECRET, NOW + dt.timedelta(hours=7, minutes=59))["refresh_token"]
    assert row_of(conn, second)["expires_at"] == NOW + dt.timedelta(hours=8)
    with pytest.raises(AuthenticationError):
        sessions.rotate(conn, second, SECRET, NOW + dt.timedelta(hours=8))


def test_reusing_a_rotated_token_revokes_everything(conn, org):
    a = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    b = sessions.rotate(conn, a, SECRET, NOW)["refresh_token"]
    with pytest.raises(AuthenticationError, match="session is invalid"):
        sessions.rotate(conn, a, SECRET, NOW)  # a thief (or the owner) replays the old one
    assert row_of(conn, b)["revoked_at"] == NOW  # kept, although the call raised
    with pytest.raises(AuthenticationError):
        sessions.rotate(conn, b, SECRET, NOW)


@pytest.mark.parametrize("raw", [None, "", "x", 123])
def test_unknown_or_malformed_token_is_refused(conn, org, raw):
    sessions.start(conn, org["alice"].user_id, SECRET, NOW)
    with pytest.raises(AuthenticationError):
        sessions.rotate(conn, raw, SECRET, NOW)
    assert live_count(conn, org["alice"].user_id) == 1  # nothing revoked


def test_archived_user_cannot_refresh(conn, org):
    raw = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    conn.execute("UPDATE users SET is_archived = TRUE, archived_at = now() WHERE user_id = %s",
                 (org["alice"].user_id,))
    with pytest.raises(AuthenticationError):
        sessions.rotate(conn, raw, SECRET, NOW)


def test_end_revokes_and_is_safe_twice(conn, org):
    raw = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    sessions.end(conn, raw, NOW)
    sessions.end(conn, raw, NOW + dt.timedelta(minutes=1))
    assert row_of(conn, raw)["revoked_at"] == NOW
    assert sessions.end(conn, "nope", NOW) is None
    assert sessions.end(conn, None, NOW) is None
    with pytest.raises(AuthenticationError):
        sessions.rotate(conn, raw, SECRET, NOW)


def test_a_signed_out_token_is_not_reuse(conn, org):
    signed_out = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    other_tab = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    sessions.end(conn, signed_out, NOW)
    with pytest.raises(AuthenticationError):
        sessions.rotate(conn, signed_out, SECRET, NOW)  # revoked, never rotated: a plain 401
    assert row_of(conn, other_tab)["revoked_at"] is None  # the other tab is untouched


def test_revoke_all_only_touches_that_user(conn, org):
    for _ in range(2):
        sessions.start(conn, org["alice"].user_id, SECRET, NOW)
    sessions.start(conn, org["bob"].user_id, SECRET, NOW)
    sessions.revoke_all(conn, org["alice"].user_id, NOW)
    assert (live_count(conn, org["alice"].user_id), live_count(conn, org["bob"].user_id)) == (0, 1)


def test_sessions_are_not_audited(conn, org):
    before = conn.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"]
    raw = sessions.start(conn, org["alice"].user_id, SECRET, NOW)["refresh_token"]
    sessions.end(conn, sessions.rotate(conn, raw, SECRET, NOW)["refresh_token"], NOW)
    assert conn.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"] == before


def test_end_ignores_a_token_that_is_not_text(conn, org):
    assert sessions.end(conn, 123, NOW) is None
