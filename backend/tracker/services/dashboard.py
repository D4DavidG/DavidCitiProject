"""The answers to the client's questions, computed from the data.

    Q2  at_risk()          projects at risk of missing deadlines, with the reasons
    Q3  allocation()       hours booked per person per week, across projects
    Q5  allocation()       ...flagged where bookings exceed capacity, or logged time does
    Q7  project_budget()   planned cost (bookings) vs consumed cost (approved time)
        integrity_check()  the five invariants, live

Q1 and Q4 (status and progress) are on the project list and the deliverables.
Every figure is a single aggregate query, never one query per person or project.
"""

import datetime as dt

import psycopg
from psycopg import sql

from domain import clock, values
from domain.errors import Forbidden
from services.access import visible_project
from services.actors import Actor
from store import integrity

BEHIND_THRESHOLD = 15  # percentage points


def _elapsed_percent(start: dt.date, end: dt.date, today: dt.date) -> float:
    """How much of [start, end] has passed, 0 to 100."""
    if today <= start:
        return 0.0
    if end <= start or today >= end:
        return 100.0
    return (today - start).days * 100 / (end - start).days


# --- Q7: budget ---------------------------------------------------------------------

def project_budget(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict:
    """Admins and the project's manager. All figures in cents."""
    project = visible_project(conn, actor, project_id)
    if actor.is_employee:
        raise Forbidden("Only the project's manager and admins see its budget.")
    row = conn.execute(
        "SELECT"
        " (SELECT COALESCE(sum(a.hours_per_week * ((a.end_date - a.start_date) + 1)"
        "         * (u.annual_salary_cents / 2080) / 7), 0)"
        "    FROM assignments a JOIN users u ON u.user_id = a.user_id"
        "   WHERE a.project_id = %(p)s AND NOT a.is_archived) AS planned_cents,"
        " (SELECT COALESCE(sum(minutes * hourly_rate_cents / 60), 0) FROM time_entries"
        "   WHERE project_id = %(p)s AND status = 'APPROVED') AS consumed_cents,"
        " (SELECT COALESCE(sum(minutes * hourly_rate_cents / 60), 0) FROM time_entries"
        "   WHERE project_id = %(p)s AND status = 'PENDING') AS pending_cents",
        {"p": project_id}).fetchone()
    budget = project["budget_cents"]
    return {
        "project_id": project_id,
        "budget_cents": budget,
        "planned_cents": int(row["planned_cents"]),
        "consumed_cents": int(row["consumed_cents"]),
        "pending_cents": int(row["pending_cents"]),
        "remaining_cents": budget - int(row["consumed_cents"]),
        "planned_over_budget": int(row["planned_cents"]) > budget,
        "consumed_percent": (int(row["consumed_cents"]) * 100 // budget) if budget else None,
        "schedule_elapsed_percent": int(_elapsed_percent(project["start_date"], project["predicted_end_date"],
                                                         clock.today())),
    }


# --- Q2: at risk --------------------------------------------------------------------------

def at_risk(conn: psycopg.Connection, actor: Actor) -> list[dict]:
    """Live, unfinished projects with at least one reason to worry. Admins: all; managers: theirs."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins see the risk panel.")
    today = clock.today()
    scope = sql.SQL("TRUE" if actor.is_admin else "p.manager_id = %(me)s")
    projects = conn.execute(sql.SQL(
        "SELECT p.project_id, p.name, p.status, p.start_date, p.predicted_end_date, p.budget_cents,"
        " (SELECT COALESCE(sum(minutes * hourly_rate_cents / 60), 0) FROM time_entries e"
        "   WHERE e.project_id = p.project_id AND e.status = 'APPROVED') AS consumed_cents"
        " FROM projects p WHERE NOT p.is_archived AND p.status <> 'COMPLETE' AND {} ORDER BY p.name").format(scope),
        {"me": actor.user_id}).fetchall()
    deliverables = conn.execute(
        "SELECT m.project_id, m.name, m.start_date, m.due_date, m.completed_at,"
        " COALESCE(sum(t.estimate_minutes), 0) AS total,"
        " COALESCE(sum(t.estimate_minutes) FILTER (WHERE t.status = 'DONE'), 0) AS done"
        " FROM milestones m LEFT JOIN tasks t ON t.milestone_id = m.milestone_id AND NOT t.is_archived"
        " WHERE NOT m.is_archived AND m.project_id = ANY(%s)"
        " GROUP BY m.milestone_id ORDER BY m.due_date",
        ([p["project_id"] for p in projects],)).fetchall()
    result = []
    for p in projects:
        reasons = []
        if p["predicted_end_date"] < today:
            reasons.append(("PAST_END_DATE", f"Past its end date ({p['predicted_end_date'].isoformat()})"
                                             " and not complete."))
        for d in (d for d in deliverables if d["project_id"] == p["project_id"] and d["completed_at"] is None):
            if d["due_date"] < today:
                reasons.append(("DELIVERABLE_OVERDUE", f"Deliverable {d['name']} was due {d['due_date'].isoformat()}."))
            elif d["total"]:
                progress = d["done"] * 100 / d["total"]
                elapsed = _elapsed_percent(d["start_date"], d["due_date"], today)
                if elapsed - progress > BEHIND_THRESHOLD:
                    reasons.append(("DELIVERABLE_BEHIND", f"Deliverable {d['name']} is {int(progress)}% done"
                                                          f" with {int(elapsed)}% of its time gone."))
        if p["budget_cents"]:
            spent = int(p["consumed_cents"]) * 100 / p["budget_cents"]
            elapsed = _elapsed_percent(p["start_date"], p["predicted_end_date"], today)
            if spent > elapsed + BEHIND_THRESHOLD:
                reasons.append(("BUDGET_BURN", f"{int(spent)}% of the budget is spent"
                                               f" with {int(elapsed)}% of the schedule gone."))
        if reasons:
            result.append({"project_id": p["project_id"], "name": p["name"], "status": p["status"],
                           "reasons": [{"code": c, "message": m} for c, m in reasons]})
    return result


# --- Q3 and Q5: allocation --------------------------------------------------------------------

def allocation(conn: psycopg.Connection, actor: Actor, filters: dict) -> dict:
    """Every active employee x N weeks: hours booked, projects, hours logged, and the flags."""
    if actor.is_employee:
        raise Forbidden("Only managers and admins see the allocation grid.")
    week_from = clock.week_start(values.date(filters, "week_from", required=False) or clock.today())
    weeks = values.integer(filters, "weeks", required=False, minimum=1, maximum=26) or 8
    rows = conn.execute(
        "WITH w AS (SELECT generate_series(%(from)s::date, %(from)s::date + 7 * (%(n)s - 1), '7 days')::date AS week),"
        " people AS (SELECT user_id, first_name || ' ' || last_name AS name, weekly_capacity_hours,"
        "            overtime_allowed FROM users WHERE role = 'EMPLOYEE' AND NOT is_archived)"
        " SELECT pe.*, w.week,"
        "  COALESCE((SELECT sum(a.hours_per_week) FROM assignments a JOIN projects p ON p.project_id = a.project_id"
        "    WHERE a.user_id = pe.user_id AND NOT a.is_archived AND NOT p.is_archived"
        "      AND a.start_date <= w.week + 6 AND a.end_date >= w.week), 0) AS booked_hours,"
        "  (SELECT count(DISTINCT a.project_id) FROM assignments a JOIN projects p ON p.project_id = a.project_id"
        "    WHERE a.user_id = pe.user_id AND NOT a.is_archived AND NOT p.is_archived"
        "      AND a.start_date <= w.week + 6 AND a.end_date >= w.week) AS project_count,"
        "  COALESCE((SELECT sum(e.minutes) FROM time_entries e WHERE e.user_id = pe.user_id"
        "    AND e.status <> 'REJECTED' AND e.work_date BETWEEN w.week AND w.week + 6), 0) AS logged_minutes"
        " FROM people pe CROSS JOIN w ORDER BY pe.name, pe.user_id, w.week",
        {"from": week_from, "n": weeks}).fetchall()
    people: dict[int, dict] = {}
    for r in rows:
        person = people.setdefault(r["user_id"], {
            "user_id": r["user_id"], "name": r["name"], "capacity_hours": r["weekly_capacity_hours"],
            "overtime_allowed": r["overtime_allowed"], "weeks": []})
        capacity = r["weekly_capacity_hours"]
        person["weeks"].append({
            "week": r["week"].isoformat(),
            "booked_hours": int(r["booked_hours"]),
            "project_count": r["project_count"],
            "over_allocated": int(r["booked_hours"]) > capacity,
            "logged_minutes": int(r["logged_minutes"]),
            "logged_hours": int(r["logged_minutes"]) / 60,
            "overtime": int(r["logged_minutes"]) > capacity * 60,
        })
    week_list = [(week_from + dt.timedelta(weeks=i)).isoformat() for i in range(weeks)]
    return {"weeks": week_list, "people": list(people.values())}


# --- the invariant --------------------------------------------------------------------------------

def integrity_check(conn: psycopg.Connection, actor: Actor) -> dict:
    """Admin only: run the five integrity queries; every list should be empty."""
    if not actor.is_admin:
        raise Forbidden("Only admins run the integrity check.")
    return {"violations": integrity.find_violations(conn), "checks": len(integrity.QUERIES)}
