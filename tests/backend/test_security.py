"""Password hashing, generated credentials, and signed tokens. No database."""

import datetime as dt
import re

import pytest

from domain.errors import AuthenticationError
from services import passwords, tokens

SECRET = "test-secret-not-used-anywhere-else"
NOW = dt.datetime(2026, 10, 13, 12, 0, tzinfo=dt.timezone.utc)


def test_hash_verifies_the_right_password_only():
    stored = passwords.hash_password("correct horse")
    assert passwords.verify_password("correct horse", stored)
    assert not passwords.verify_password("wrong horse", stored)


def test_same_password_hashes_differently_each_time():
    assert passwords.hash_password("same") != passwords.hash_password("same")


def test_hash_records_algorithm_and_cost():
    assert passwords.hash_password("x", rounds=1000).startswith("pbkdf2_sha256$1000$")


def test_production_cost_is_still_600k_rounds():
    """The suite hashes at 1,000 rounds for speed (conftest); this stops that leaking."""
    assert passwords.DEFAULT_ROUNDS == 600_000


def test_verify_uses_the_rounds_stored_in_the_hash():
    stored = passwords.hash_password("pw", rounds=1234)
    assert passwords.verify_password("pw", stored)


def test_garbage_hash_never_verifies():
    assert not passwords.verify_password("pw", "not-a-hash")


def test_generated_password_is_12_letters_and_digits():
    pw = passwords.generate_password()
    assert re.fullmatch(r"[A-Za-z0-9]{12}", pw)


def test_generated_passwords_differ():
    assert len({passwords.generate_password() for _ in range(20)}) == 20


@pytest.mark.parametrize("first,last,prefix", [
    ("David", "Guamao", "DG"),
    ("ángel", "Ñúñez", "AN"),       # accents stripped
    ("李", "王", "XX"),             # no ASCII letter -> X
    ("  bob", " o'neil", "BO"),
])
def test_username_is_initials_plus_six_digits(first, last, prefix):
    name = passwords.generate_username(first, last)
    assert re.fullmatch(prefix + r"[0-9]{6}", name)


def test_token_round_trip_gives_back_the_user_id():
    token = tokens.issue(42, SECRET, now=NOW)
    assert tokens.verify(token, SECRET, now=NOW + dt.timedelta(hours=1)) == 42


def test_expired_token_is_refused():
    token = tokens.issue(42, SECRET, now=NOW)
    with pytest.raises(AuthenticationError):
        tokens.verify(token, SECRET, now=NOW + tokens.LIFETIME + dt.timedelta(seconds=1))


def test_token_signed_with_another_secret_is_refused():
    token = tokens.issue(42, "other-secret", now=NOW)
    with pytest.raises(AuthenticationError):
        tokens.verify(token, SECRET, now=NOW)


def test_tampered_payload_is_refused():
    header, payload, signature = tokens.issue(42, SECRET, now=NOW).split(".")
    forged = tokens.issue(1, SECRET, now=NOW).split(".")[1]
    with pytest.raises(AuthenticationError):
        tokens.verify(f"{header}.{forged}.{signature}", SECRET, now=NOW)


@pytest.mark.parametrize("junk", ["", "abc", "a.b.c", "a.b", None])
def test_malformed_tokens_get_the_same_error(junk):
    with pytest.raises(AuthenticationError) as caught:
        tokens.verify(junk, SECRET, now=NOW)
    assert str(caught.value) == tokens.INVALID_MESSAGE
