"""Password hashing and generated credentials.

PBKDF2-HMAC-SHA256 with a random salt per user, stored as one string:
algorithm$rounds$salt$key. The round count lives inside the string, so it can be
raised later without locking out existing users. Plain SHA-256 is fast, which is
what an attacker guessing passwords wants; PBKDF2 is deliberately slow.
"""

import base64
import hashlib
import hmac
import re
import secrets
import string
import unicodedata

DEFAULT_ROUNDS = 600_000  # OWASP's advice for PBKDF2-SHA256; about 1 s per login on Lambda (512 MB)
ROUNDS = DEFAULT_ROUNDS  # tests lower this for speed; one test checks the default
ALPHABET = string.ascii_letters + string.digits


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def hash_password(password: str, rounds: int | None = None) -> str:
    """Hash a password with a fresh random salt."""
    rounds = rounds or ROUNDS
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds)
    return f"pbkdf2_sha256${rounds}${_b64(salt)}${_b64(key)}"


def verify_password(password: str, stored: str) -> bool:
    """True only if `password` matches; compared in constant time."""
    try:
        algorithm, rounds, salt, key = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(rounds))
        return hmac.compare_digest(candidate, base64.b64decode(key))
    except (ValueError, TypeError):
        return False


def generate_password() -> str:
    """A 12-character password of letters and digits, from a secure random source."""
    return "".join(secrets.choice(ALPHABET) for _ in range(12))


def _initial(name: str) -> str:
    """First A-Z letter of a name, accents dropped; "X" if it has none."""
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    letters = re.sub(r"[^A-Za-z]", "", ascii_only)
    return letters[0].upper() if letters else "X"


def generate_username(first_name: str, last_name: str) -> str:
    """Initials plus six random digits, e.g. DG482913. The caller retries on a collision."""
    return f"{_initial(first_name)}{_initial(last_name)}{secrets.randbelow(1_000_000):06d}"
