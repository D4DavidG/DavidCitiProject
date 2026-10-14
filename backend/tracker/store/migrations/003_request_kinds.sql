-- 003_request_kinds: requests of five kinds, from employees as well as managers.
-- Design: docs/superpowers/specs/2026-10-14-requests-design.md
ALTER TABLE project_requests
    ADD COLUMN kind       TEXT    NOT NULL DEFAULT 'NEW_PROJECT',
    ADD COLUMN project_id BIGINT  REFERENCES projects(project_id),   -- ARCHIVE_PROJECT only
    ADD COLUMN task_limit INTEGER,                                    -- TASK_LIMIT only
    ADD CONSTRAINT requests_kind_valid CHECK
        (kind IN ('NEW_PROJECT', 'ARCHIVE_PROJECT', 'TASK_LIMIT', 'OVERTIME', 'OTHER')),
    ADD CONSTRAINT requests_project_iff_archive CHECK ((kind = 'ARCHIVE_PROJECT') = (project_id IS NOT NULL)),
    ADD CONSTRAINT requests_limit_iff_task_limit CHECK
        ((kind = 'TASK_LIMIT') = (task_limit IS NOT NULL) AND (task_limit IS NULL OR task_limit BETWEEN 1 AND 10)),
    ADD CONSTRAINT requests_dates_only_new_project CHECK
        (kind = 'NEW_PROJECT' OR (proposed_start IS NULL AND proposed_end IS NULL)),
    ADD CONSTRAINT requests_not_self_decided CHECK (decided_by <> requested_by),
    DROP CONSTRAINT requests_project_iff_approved;
ALTER TABLE project_requests ADD CONSTRAINT requests_project_iff_approved
    CHECK ((kind = 'NEW_PROJECT' AND status = 'APPROVED') = (created_project_id IS NOT NULL));
