"""The integrity check: five queries that must always return no rows.

Each covers a rule the schema can't enforce row by row. They run after every
database test and back GET /admin/integrity-check.
"""

import psycopg

QUERIES = {
    # No deliverable reachable from itself through live dependency links.
    "dependency_loops": """
        WITH RECURSIVE live AS (
            SELECT milestone_id, depends_on_milestone_id
            FROM milestone_dependencies WHERE NOT is_archived
        ), walk(start_id, current_id, path) AS (
            SELECT milestone_id, depends_on_milestone_id, ARRAY[milestone_id] FROM live
            UNION ALL
            SELECT w.start_id, l.depends_on_milestone_id, w.path || w.current_id
            FROM walk w JOIN live l ON l.milestone_id = w.current_id
            WHERE NOT w.current_id = ANY (w.path)
        )
        SELECT DISTINCT start_id AS milestone_id FROM walk WHERE current_id = start_id
    """,
    # Archiving a project must archive its bookings, deliverables and tasks too.
    "live_under_archived": """
        SELECT 'assignments' AS entity_type, a.assignment_id AS entity_id
        FROM assignments a JOIN projects p ON p.project_id = a.project_id
        WHERE p.is_archived AND NOT a.is_archived
        UNION ALL
        SELECT 'milestones', m.milestone_id
        FROM milestones m JOIN projects p ON p.project_id = m.project_id
        WHERE p.is_archived AND NOT m.is_archived
        UNION ALL
        SELECT 'tasks', t.task_id
        FROM tasks t JOIN projects p ON p.project_id = t.project_id
        WHERE p.is_archived AND NOT t.is_archived
    """,
    # Every record has a CREATE audit row, so a write path that forgets record_change() fails.
    "audit": """
        SELECT t.entity_type, t.entity_id FROM (
                      SELECT 'users' AS entity_type, user_id AS entity_id FROM users
            UNION ALL SELECT 'projects', project_id FROM projects
            UNION ALL SELECT 'assignments', assignment_id FROM assignments
            UNION ALL SELECT 'milestones', milestone_id FROM milestones
            UNION ALL SELECT 'tasks', task_id FROM tasks
            UNION ALL SELECT 'time_entries', entry_id FROM time_entries
            UNION ALL SELECT 'project_requests', request_id FROM project_requests
        ) t
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_log a
            WHERE a.action = 'CREATE' AND a.entity_type = t.entity_type AND a.entity_id = t.entity_id
        )
    """,
    # Non-rejected time sits on a day its author was booked on that project.
    # Archived bookings still count: archiving later doesn't make history wrong.
    "time_outside_booking": """
        SELECT e.entry_id
        FROM time_entries e
        WHERE e.status <> 'REJECTED'
          AND NOT EXISTS (
              SELECT 1 FROM assignments a
              WHERE a.user_id = e.user_id AND a.project_id = e.project_id
                AND e.work_date BETWEEN a.start_date AND a.end_date)
    """,
    # A signed-off deliverable has no unfinished live task or dependency.
    "signed_off_unfinished": """
        SELECT m.milestone_id
        FROM milestones m
        WHERE m.completed_at IS NOT NULL
          AND (EXISTS (SELECT 1 FROM tasks t
                       WHERE t.milestone_id = m.milestone_id AND NOT t.is_archived AND t.status <> 'DONE')
            OR EXISTS (SELECT 1 FROM milestone_dependencies d
                       JOIN milestones dm ON dm.milestone_id = d.depends_on_milestone_id
                       WHERE d.milestone_id = m.milestone_id AND NOT d.is_archived
                         AND dm.completed_at IS NULL))
    """,
}


def find_violations(conn: psycopg.Connection, skip: set[str] = frozenset()) -> dict[str, list[dict]]:
    """Run every check not in `skip`; return {check name: offending rows} for failures only."""
    found = {}
    for name, query in QUERIES.items():
        if name in skip:
            continue
        rows = conn.execute(query).fetchall()
        if rows:
            found[name] = rows
    return found
