"""The answers to the client's questions, computed from the data.

    Q1 Q2 Q7  project_cards()   the manager's dashboard: status, progress, risk and money per project
    Q2        at_risk()         projects at risk of missing deadlines, with the reasons
    Q3 Q5     allocation()      hours booked per person per week, which projects they come from,
                                and who is over capacity (worst first)
    Q7        project_budget()  planned cost (bookings) vs consumed cost (approved time)
              integrity_check() the five invariants, live

Q4 (deliverables and completion) is on the deliverables list. Every figure is an
aggregate query over the whole page of projects or people, never one query per
row. The cards, the risk panel and the budget screen share _money() and
_risk_reasons(), so they can never disagree.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import clock, values
from domain.errors import Forbidden
from services import projects as project_service
from services.access import visible_project
from services.actors import Actor
from services.paging import page_of, paginate
from store import integrity

BEHIND_THRESHOLD = 15  # percentage points


def _elapsed_percent(start: dt.date, end: dt.date, today: dt.date) -> float:
    """How much of [start, end] has passed, 0 to 100."""
    if today <= start:
        return 0.0
    if end <= start or today >= end:
        return 100.0
    return (today - start).days * 100 / (end - start).days


def _staff_only(actor: Actor, what: str) -> None:
    if actor.is_employee:
        raise Forbidden(f"Only managers and admins see {what}.")


# --- money and risk, shared by every screen ----------------------------------------------------

def _money(conn: psycopg.Connection, project_ids: list[int]) -> dict[int, dict]:
    """Planned, consumed (approved) and pending cents for each project, in one query."""
    rows = conn.execute(
        "SELECT p.project_id,"
        " (SELECT COALESCE(sum(a.hours_per_week * ((a.end_date - a.start_date) + 1)"
        "         * (u.annual_salary_cents / 2080) / 7), 0)"
        "    FROM assignments a JOIN users u ON u.user_id = a.user_id"
        "   WHERE a.project_id = p.project_id AND NOT a.is_archived) AS planned_cents,"
        " (SELECT COALESCE(sum(minutes * hourly_rate_cents / 60), 0) FROM time_entries e"
        "   WHERE e.project_id = p.project_id AND e.status = 'APPROVED') AS consumed_cents,"
        " (SELECT COALESCE(sum(minutes * hourly_rate_cents / 60), 0) FROM time_entries e"
        "   WHERE e.project_id = p.project_id AND e.status = 'PENDING') AS pending_cents"
        " FROM projects p WHERE p.project_id = ANY(%s)", (project_ids,)).fetchall()
    return {r["project_id"]: {k: int(r[k]) for k in ("planned_cents", "consumed_cents", "pending_cents")}
            for r in rows}


def _figures(project: dict, money: dict, today: dt.date) -> dict:
    budget = project["budget_cents"]
    return {
        "budget_cents": budget,
        **money,
        "remaining_cents": budget - money["consumed_cents"],
        "planned_over_budget": money["planned_cents"] > budget,
        "consumed_percent": (money["consumed_cents"] * 100 // budget) if budget else None,
        "schedule_elapsed_percent": int(_elapsed_percent(project["start_date"], project["predicted_end_date"], today)),
    }


def _risk_reasons(conn: psycopg.Connection, projects: list[dict], money: dict[int, dict],
                  today: dt.date) -> dict[int, list[dict]]:
    """Why each unfinished project is at risk (an empty list if it isn't). One deliverables query."""
    deliverables = conn.execute(
        "SELECT m.project_id, m.name, m.start_date, m.due_date, m.completed_at,"
        " COALESCE(sum(t.estimate_minutes), 0) AS total,"
        " COALESCE(sum(t.estimate_minutes) FILTER (WHERE t.status = 'DONE'), 0) AS done"
        " FROM milestones m LEFT JOIN tasks t ON t.milestone_id = m.milestone_id AND NOT t.is_archived"
        " WHERE NOT m.is_archived AND m.project_id = ANY(%s)"
        " GROUP BY m.milestone_id ORDER BY m.due_date",
        ([p["project_id"] for p in projects],)).fetchall()
    result = {}
    for p in projects:
        reasons = []
        if p["status"] != "COMPLETE":
            if p["predicted_end_date"] < today:
                reasons.append(("PAST_END_DATE", f"Past its end date ({p['predicted_end_date'].isoformat()})"
                                                 " and not complete."))
            for d in (d for d in deliverables if d["project_id"] == p["project_id"] and d["completed_at"] is None):
                if d["due_date"] < today:
                    reasons.append(("DELIVERABLE_OVERDUE",
                                    f"Deliverable {d['name']} was due {d['due_date'].isoformat()}."))
                elif d["total"]:
                    progress = d["done"] * 100 / d["total"]
                    elapsed = _elapsed_percent(d["start_date"], d["due_date"], today)
                    if elapsed - progress > BEHIND_THRESHOLD:
                        reasons.append(("DELIVERABLE_BEHIND", f"Deliverable {d['name']} is {int(progress)}% done"
                                                              f" with {int(elapsed)}% of its time gone."))
            if p["budget_cents"]:
                spent = money[p["project_id"]]["consumed_cents"] * 100 / p["budget_cents"]
                elapsed = _elapsed_percent(p["start_date"], p["predicted_end_date"], today)
                if spent > elapsed + BEHIND_THRESHOLD:
                    reasons.append(("BUDGET_BURN", f"{int(spent)}% of the budget is spent"
                                                   f" with {int(elapsed)}% of the schedule gone."))
        result[p["project_id"]] = [{"code": c, "message": m} for c, m in reasons]
    return result


def _live_projects(conn: psycopg.Connection, actor: Actor, filters: dict) -> list[dict]:
    """Live projects in the actor's scope (admins: all; managers: theirs), by name, with progress."""
    where, params = ["NOT p.is_archived"], {"me": actor.user_id}
    if not actor.is_admin:
        where.append("p.manager_id = %(me)s")
    if search := values.text(filters, "search", required=False, max_length=100):
        where.append("p.name ILIKE %(q)s")
        params["q"] = f"%{search}%"
    if status := values.choice(filters, "status", project_service.STATUSES, required=False):
        where.append("p.status = %(status)s")
        params["status"] = status
    # The WHERE fragments are fixed strings from this function; every value is a parameter.
    query = sql.SQL("SELECT wp.*, m.first_name || ' ' || m.last_name AS manager_name FROM ({} WHERE {}) wp"
                    " JOIN users m ON m.user_id = wp.manager_id ORDER BY wp.name, wp.project_id").format(
        sql.SQL(project_service._WITH_PROGRESS), sql.SQL(" AND ").join(map(sql.SQL, where)))
    return conn.execute(query, params).fetchall()


# --- Q1, Q2 and Q7: the manager's dashboard -------------------------------------------------------

def project_cards(conn: psycopg.Connection, actor: Actor, filters: dict, page: int, page_size: int) -> dict:
    """One card per live project in scope: status, progress, risk and money. At-risk projects first."""
    _staff_only(actor, "the project dashboard")
    today = clock.today()
    rows = _live_projects(conn, actor, filters)
    money = _money(conn, [r["project_id"] for r in rows])
    reasons = _risk_reasons(conn, rows, money, today)
    cards = [{
        "project_id": r["project_id"], "name": r["name"], "status": r["status"],
        "manager_id": r["manager_id"], "manager_name": r["manager_name"],
        "start_date": r["start_date"].isoformat(), "predicted_end_date": r["predicted_end_date"].isoformat(),
        "progress_percent": r["progress_percent"],
        "at_risk": bool(reasons[r["project_id"]]), "risk_reasons": reasons[r["project_id"]],
        **_figures(r, money[r["project_id"]], today),
    } for r in rows]
    cards.sort(key=lambda c: not c["at_risk"])  # stable: at-risk first, each group still by name
    return page_of(cards, page, page_size)


# --- Q7: budget ---------------------------------------------------------------------

def project_budget(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """Admins and the project's manager. All figures in cents."""
    project = visible_project(conn, actor, project_id)
    if actor.is_employee:
        raise Forbidden("Only the project's manager and admins see its budget.")
    return {"project_id": project_id, **_figures(project, _money(conn, [project_id])[project_id], clock.today())}


# --- Q2: at risk --------------------------------------------------------------------------

def at_risk(conn: psycopg.Connection, actor: Actor) -> list[dict]:
    """Live, unfinished projects with at least one reason to worry. Admins: all; managers: theirs."""
    _staff_only(actor, "the risk panel")
    rows = [r for r in _live_projects(conn, actor, {}) if r["status"] != "COMPLETE"]
    reasons = _risk_reasons(conn, rows, _money(conn, [r["project_id"] for r in rows]), clock.today())
    return [{"project_id": r["project_id"], "name": r["name"], "status": r["status"],
             "reasons": reasons[r["project_id"]]} for r in rows if reasons[r["project_id"]]]


# --- Q3 and Q5: allocation --------------------------------------------------------------------

# Every active employee x every shown week: hours booked, projects, minutes logged.
_CELLS = (
    "WITH w AS (SELECT generate_series(%(from)s::date, %(from)s::date + 7 * (%(n)s - 1), '7 days')::date AS week),"
    " people AS (SELECT user_id, first_name || ' ' || last_name AS name, job_title, weekly_capacity_hours,"
    "            overtime_allowed FROM users WHERE role = 'EMPLOYEE' AND NOT is_archived),"
    " cells AS (SELECT pe.user_id, w.week,"
    "  COALESCE((SELECT sum(a.hours_per_week) FROM assignments a JOIN projects p ON p.project_id = a.project_id"
    "    WHERE a.user_id = pe.user_id AND NOT a.is_archived AND NOT p.is_archived"
    "      AND a.start_date <= w.week + 6 AND a.end_date >= w.week), 0) AS booked_hours,"
    "  (SELECT count(DISTINCT a.project_id) FROM assignments a JOIN projects p ON p.project_id = a.project_id"
    "    WHERE a.user_id = pe.user_id AND NOT a.is_archived AND NOT p.is_archived"
    "      AND a.start_date <= w.week + 6 AND a.end_date >= w.week) AS project_count,"
    "  COALESCE((SELECT sum(e.minutes) FROM time_entries e WHERE e.user_id = pe.user_id"
    "    AND e.status <> 'REJECTED' AND e.work_date BETWEEN w.week AND w.week + 6), 0) AS logged_minutes"
    "  FROM people pe CROSS JOIN w)"
)


def allocation(conn: psycopg.Connection, actor: Actor, filters: dict, page: int = 1, page_size: int = 20) -> dict:
    """People x weeks, worst week first. Each cell says which projects its hours come from.

    A person's peak is their largest "over by" in any shown week; the list is
    sorted by it, and over_only keeps people whose peak is above zero.
    """
    _staff_only(actor, "the allocation grid")
    week_from = clock.week_start(values.date(filters, "week_from", required=False) or clock.today())
    weeks = values.integer(filters, "weeks", required=False, minimum=1, maximum=26) or 8
    over_only = values.boolean(filters, "over_only", required=False)
    params = {"from": week_from, "n": weeks}

    over_filter = sql.SQL(" HAVING max(c.booked_hours - pe.weekly_capacity_hours) > 0" if over_only else "")
    people = paginate(conn, sql.SQL(_CELLS) + sql.SQL(
        " SELECT pe.user_id, pe.name, pe.job_title, pe.weekly_capacity_hours, pe.overtime_allowed,"
        " max(GREATEST(c.booked_hours - pe.weekly_capacity_hours, 0)) AS peak_over_by"
        " FROM people pe JOIN cells c ON c.user_id = pe.user_id"
        " GROUP BY pe.user_id, pe.name, pe.job_title, pe.weekly_capacity_hours, pe.overtime_allowed") + over_filter,
        params, sql.SQL("peak_over_by DESC, name, user_id"), page, page_size)

    ids = [p["user_id"] for p in people["items"]]
    cells = conn.execute(sql.SQL(_CELLS) + sql.SQL(" SELECT * FROM cells WHERE user_id = ANY(%(ids)s) ORDER BY week"),
                         {**params, "ids": ids}).fetchall()
    shares = conn.execute(
        "WITH w AS (SELECT generate_series(%(from)s::date, %(from)s::date + 7 * (%(n)s - 1), '7 days')::date AS week)"
        " SELECT a.user_id, w.week, p.project_id, p.name, sum(a.hours_per_week) AS hours"
        " FROM w JOIN assignments a ON a.start_date <= w.week + 6 AND a.end_date >= w.week"
        " JOIN projects p ON p.project_id = a.project_id"
        " WHERE a.user_id = ANY(%(ids)s) AND NOT a.is_archived AND NOT p.is_archived"
        " GROUP BY a.user_id, w.week, p.project_id, p.name ORDER BY hours DESC, p.name",
        {**params, "ids": ids}).fetchall()
    by_cell: dict[tuple, list] = {}
    for s in shares:
        by_cell.setdefault((s["user_id"], s["week"]), []).append(
            {"project_id": s["project_id"], "name": s["name"], "hours": int(s["hours"])})

    rows = {}
    for p in people["items"]:
        peak = int(p["peak_over_by"])
        rows[p["user_id"]] = {
            "user_id": p["user_id"], "name": p["name"], "job_title": p["job_title"],
            "capacity_hours": p["weekly_capacity_hours"], "overtime_allowed": p["overtime_allowed"],
            "peak_over_by_hours": peak, "status": "OVER_ALLOCATED" if peak > 0 else "OK", "weeks": []}
    for c in cells:
        capacity = rows[c["user_id"]]["capacity_hours"]
        booked, logged = int(c["booked_hours"]), int(c["logged_minutes"])
        rows[c["user_id"]]["weeks"].append({
            "week": c["week"].isoformat(),
            "booked_hours": booked,
            "project_count": c["project_count"],
            "over_allocated": booked > capacity,
            "over_by_hours": max(booked - capacity, 0),
            "projects": by_cell.get((c["user_id"], c["week"]), []),
            "logged_minutes": logged,
            "logged_hours": logged / 60,
            "overtime": logged > capacity * 60,
        })
    week_list = [(week_from + dt.timedelta(weeks=i)).isoformat() for i in range(weeks)]
    return {**people, "items": [rows[i] for i in ids], "weeks": week_list}


# --- the invariant --------------------------------------------------------------------------------

def integrity_check(conn: psycopg.Connection, actor: Actor) -> dict:
    """Admin only: run the five integrity queries; every list should be empty."""
    if not actor.is_admin:
        raise Forbidden("Only admins run the integrity check.")
    return {"violations": integrity.find_violations(conn), "checks": len(integrity.QUERIES)}
