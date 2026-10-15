"""Read and validate one field of a request body (already snake_case).

Each helper raises ValidationError naming the field, so the form can show the
message on the right input. They refuse rather than guess: "3" is not an
integer and "false" is not a boolean.
"""

import datetime as dt

from domain.errors import ValidationError

_MISSING = object()


def _get(data: dict, key: str, required: bool):
    value = data.get(key, _MISSING)
    if value is _MISSING or value is None:
        if required:
            raise ValidationError(f"{_label(key)} is required.", field=key)
        return None
    return value


def _label(key: str) -> str:
    return key.replace("_", " ").capitalize()


def require(data: dict, keys) -> None:
    """Refuse a create body that lacks any of `keys`, naming the first one missing.

    Presence only; each field's own helper checks its value.
    """
    for key in keys:
        if key not in data:
            raise ValidationError(f"{_label(key)} is required.", field=key)


def text(data: dict, key: str, required: bool = True, max_length: int = 200) -> str | None:
    """A trimmed string; blank counts as missing."""
    value = _get(data, key, required)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(f"{_label(key)} must be text.", field=key)
    value = value.strip()
    if not value:
        if required:
            raise ValidationError(f"{_label(key)} is required.", field=key)
        return None
    if len(value) > max_length:
        raise ValidationError(f"{_label(key)} must be at most {max_length} characters.", field=key)
    return value


def search(filters: dict) -> str | None:
    """A list's search box: `q` (or `search`, the older name a few lists took), as an ILIKE pattern.

    None when blank. The pattern is always passed as a parameter, never written into the SQL.
    """
    key = "q" if filters.get("q") is not None else "search"
    term = text(filters, key, required=False, max_length=100)
    return f"%{term}%" if term else None


def date(data: dict, key: str, required: bool = True) -> dt.date | None:
    """A calendar date written YYYY-MM-DD."""
    value = _get(data, key, required)
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value)
        except ValueError:
            pass
    raise ValidationError(f"{_label(key)} must be a date written YYYY-MM-DD.", field=key)


def integer(data: dict, key: str, required: bool = True,
            minimum: int | None = None, maximum: int | None = None) -> int | None:
    """A whole number (never a float, string or boolean), optionally bounded."""
    value = _get(data, key, required)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(f"{_label(key)} must be a whole number.", field=key)
    if (minimum is not None and value < minimum) or (maximum is not None and value > maximum):
        raise ValidationError(f"{_label(key)} must be between {minimum} and {maximum}.", field=key)
    return value


def boolean(data: dict, key: str, required: bool = True) -> bool | None:
    """A JSON true or false."""
    value = _get(data, key, required)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise ValidationError(f"{_label(key)} must be true or false.", field=key)
    return value


def choice(data: dict, key: str, options: set[str], required: bool = True) -> str | None:
    """One of a fixed set of strings, matched exactly."""
    value = _get(data, key, required)
    if value is None:
        return None
    if value not in options:
        raise ValidationError(f"{_label(key)} must be one of {', '.join(sorted(options))}.", field=key)
    return value


def only_allowed(data: dict, allowed: set[str]) -> None:
    """Refuse any field outside `allowed`, so a client bug shows up instead of being ignored."""
    for key in data:
        if key not in allowed:
            raise ValidationError(f"{_label(key)} can't be changed here.", field=key)
