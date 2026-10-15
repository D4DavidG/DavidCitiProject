"""Paginated lists: every list answers { items, page, page_size, total, total_pages }.

Always paginating keeps the shape stable; adding pages later would break clients
that expect a bare array. (The API converts the keys to camelCase.)
"""

import math

import psycopg
from psycopg import sql

MAX_PAGE_SIZE = 100


def paginate(conn: psycopg.Connection, query: sql.Composable, params: dict, order_by: sql.Composable,
             page: int, page_size: int) -> dict:
    """Run `query` (a composed SELECT without ORDER BY/LIMIT) one page at a time."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    total = conn.execute(sql.SQL("SELECT count(*) AS n FROM ({}) AS counted").format(query), params).fetchone()["n"]
    items = conn.execute(
        sql.SQL("{} ORDER BY {} LIMIT %(_limit)s OFFSET %(_offset)s").format(query, order_by),
        {**params, "_limit": page_size, "_offset": (page - 1) * page_size},
    ).fetchall()
    return _envelope(items, page, page_size, total)


def page_of(rows: list, page: int, page_size: int) -> dict:
    """One page of a list already built in Python (for orderings SQL can't do, like 'at risk first')."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    return _envelope(rows[(page - 1) * page_size:page * page_size], page, page_size, len(rows))


def _envelope(items: list, page: int, page_size: int, total: int) -> dict:
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
    }
