"""The outside shape of every record: camelCase, every field named explicitly.

Used for API responses and for audit snapshots, so both always agree. Naming
each field (never dumping a row) is what guarantees password_hash can't leak
when someone adds a column later.
"""

import datetime as dt


def _plain(value):
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return value


def _pick(row: dict, fields: dict[str, str]) -> dict:
    return {out: _plain(row.get(src)) for out, src in fields.items()}


_USER = {
    "userId": "user_id", "username": "username", "firstName": "first_name", "lastName": "last_name",
    "email": "email", "jobTitle": "job_title", "role": "role", "managerId": "manager_id",
    "weeklyCapacityHours": "weekly_capacity_hours", "overtimeAllowed": "overtime_allowed",
    "mustChangePassword": "must_change_password", "isArchived": "is_archived",
    "archivedAt": "archived_at", "createdAt": "created_at", "updatedAt": "updated_at",
}


def user_view(row: dict, include_salary: bool) -> dict:
    """A person. Salary only for admins and the person themselves."""
    view = _pick(row, _USER)
    if include_salary:
        view["annualSalaryCents"] = row.get("annual_salary_cents")
    return view


def project_view(row: dict) -> dict:
    """A project. progressPercent is present when the service computed it."""
    view = _pick(row, {
        "projectId": "project_id", "name": "name", "description": "description", "managerId": "manager_id",
        "startDate": "start_date", "predictedEndDate": "predicted_end_date", "budgetCents": "budget_cents",
        "status": "status", "createdBy": "created_by", "isArchived": "is_archived",
        "archivedAt": "archived_at", "createdAt": "created_at", "updatedAt": "updated_at",
    })
    if "progress_percent" in row:
        view["progressPercent"] = row["progress_percent"]
    return view


def booking_view(row: dict) -> dict:
    """A booking. personName is present when the service joined it."""
    view = _pick(row, {
        "assignmentId": "assignment_id", "projectId": "project_id", "userId": "user_id",
        "hoursPerWeek": "hours_per_week", "startDate": "start_date", "endDate": "end_date",
        "isArchived": "is_archived", "archivedAt": "archived_at", "createdAt": "created_at",
        "updatedAt": "updated_at",
    })
    if "person_name" in row:
        view["personName"] = row["person_name"]
    return view


def milestone_view(row: dict) -> dict:
    """A deliverable. status and progress are present when the service computed them."""
    view = _pick(row, {
        "milestoneId": "milestone_id", "projectId": "project_id", "name": "name", "description": "description",
        "startDate": "start_date", "dueDate": "due_date", "completedAt": "completed_at",
        "completedBy": "completed_by", "sortOrder": "sort_order", "isArchived": "is_archived",
        "archivedAt": "archived_at", "createdAt": "created_at", "updatedAt": "updated_at",
    })
    for out, src in {"status": "status", "progressPercent": "progress_percent",
                     "totalEstimateMinutes": "total_estimate_minutes", "doneEstimateMinutes": "done_estimate_minutes",
                     "taskCount": "task_count", "doneTaskCount": "done_task_count"}.items():
        if src in row:
            view[out] = row[src]
    return view


def task_view(row: dict) -> dict:
    return _pick(row, {
        "taskId": "task_id", "milestoneId": "milestone_id", "projectId": "project_id", "title": "title",
        "description": "description", "assigneeUserId": "assignee_user_id", "status": "status",
        "estimateMinutes": "estimate_minutes", "completedAt": "completed_at", "createdBy": "created_by",
        "isArchived": "is_archived", "archivedAt": "archived_at", "createdAt": "created_at",
        "updatedAt": "updated_at",
    })


def entry_view(row: dict) -> dict:
    """Logged time. The frozen hourly rate is left out: it would reveal salary."""
    return _pick(row, {
        "entryId": "entry_id", "taskId": "task_id", "projectId": "project_id", "userId": "user_id",
        "workDate": "work_date", "minutes": "minutes", "note": "note", "status": "status",
        "decidedBy": "decided_by", "decidedAt": "decided_at", "createdAt": "created_at",
        "updatedAt": "updated_at",
    })


def request_view(row: dict) -> dict:
    return _pick(row, {
        "requestId": "request_id", "requestedBy": "requested_by", "name": "name", "description": "description",
        "justification": "justification", "proposedStart": "proposed_start", "proposedEnd": "proposed_end",
        "status": "status", "decidedBy": "decided_by", "decidedAt": "decided_at",
        "decisionNote": "decision_note", "createdProjectId": "created_project_id", "createdAt": "created_at",
    })


def notification_view(row: dict) -> dict:
    return _pick(row, {
        "notificationId": "notification_id", "auditId": "audit_id", "summary": "summary",
        "entityType": "entity_type", "entityId": "entity_id", "isRead": "is_read", "readAt": "read_at",
        "createdAt": "created_at",
    })


def audit_view(row: dict) -> dict:
    return _pick(row, {
        "auditId": "audit_id", "actorUserId": "actor_user_id", "actorRole": "actor_role", "action": "action",
        "entityType": "entity_type", "entityId": "entity_id", "beforeState": "before_state",
        "afterState": "after_state", "summary": "summary", "createdAt": "created_at",
    })
