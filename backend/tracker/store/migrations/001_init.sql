-- 001_init: the whole schema. Design and reasoning:
-- docs/superpowers/specs/2026-10-13-database-design.md, section 4.
-- Never edit this file once it has run on Aurora; add 002_*.sql instead.

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- for assignments_no_overlap

CREATE TABLE users (
    user_id               BIGSERIAL PRIMARY KEY,
    username              VARCHAR(8)   NOT NULL,
    first_name            VARCHAR(80)  NOT NULL,
    last_name             VARCHAR(80)  NOT NULL,
    email                 VARCHAR(255) NOT NULL,
    job_title             VARCHAR(120),
    role                  TEXT    NOT NULL,
    manager_id            BIGINT  REFERENCES users(user_id),
    annual_salary_cents   BIGINT  NOT NULL DEFAULT 0,
    weekly_capacity_hours INTEGER NOT NULL DEFAULT 40,
    overtime_allowed      BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash         TEXT    NOT NULL,
    must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
    is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at           TIMESTAMPTZ,
    archived_by           BIGINT  REFERENCES users(user_id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_username_unique  UNIQUE (username),
    CONSTRAINT users_username_format  CHECK (username ~ '^[A-Z]{2}[0-9]{6}$'),
    CONSTRAINT users_names_present    CHECK (btrim(first_name) <> '' AND btrim(last_name) <> ''),
    CONSTRAINT users_email_format     CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_role_valid       CHECK (role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
    CONSTRAINT users_not_own_manager  CHECK (manager_id IS NULL OR manager_id <> user_id),
    CONSTRAINT users_salary_positive  CHECK (annual_salary_cents >= 0),
    CONSTRAINT users_capacity_range   CHECK (weekly_capacity_hours BETWEEN 1 AND 60),
    CONSTRAINT users_archive_consistent CHECK (is_archived = (archived_at IS NOT NULL))
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_manager ON users (manager_id) WHERE NOT is_archived;

CREATE TABLE projects (
    project_id          BIGSERIAL PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    manager_id          BIGINT NOT NULL REFERENCES users(user_id),
    start_date          DATE   NOT NULL,
    predicted_end_date  DATE   NOT NULL,
    budget_cents        BIGINT NOT NULL DEFAULT 0,
    status              TEXT   NOT NULL DEFAULT 'PLANNING',
    created_by          BIGINT NOT NULL REFERENCES users(user_id),
    is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at         TIMESTAMPTZ,
    archived_by         BIGINT REFERENCES users(user_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT projects_name_present   CHECK (btrim(name) <> ''),
    CONSTRAINT projects_dates_ordered  CHECK (predicted_end_date >= start_date),
    CONSTRAINT projects_budget_positive CHECK (budget_cents >= 0),
    CONSTRAINT projects_status_valid   CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETE')),
    CONSTRAINT projects_archive_consistent CHECK (is_archived = (archived_at IS NOT NULL))
);
CREATE INDEX projects_manager ON projects (manager_id) WHERE NOT is_archived;

-- "Resources": a person booked on a project for N hours a week over a date range.
CREATE TABLE assignments (
    assignment_id   BIGSERIAL PRIMARY KEY,
    project_id      BIGINT  NOT NULL REFERENCES projects(project_id),
    user_id         BIGINT  NOT NULL REFERENCES users(user_id),
    hours_per_week  INTEGER NOT NULL,
    start_date      DATE    NOT NULL,
    end_date        DATE    NOT NULL,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at     TIMESTAMPTZ,
    archived_by     BIGINT  REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT assignments_hours_range  CHECK (hours_per_week BETWEEN 1 AND 40),
    CONSTRAINT assignments_dates_ordered CHECK (end_date >= start_date),
    CONSTRAINT assignments_archive_consistent CHECK (is_archived = (archived_at IS NOT NULL)),
    CONSTRAINT assignments_no_overlap EXCLUDE USING gist (
        project_id WITH =, user_id WITH =, daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (NOT is_archived)
);
CREATE INDEX assignments_user    ON assignments (user_id)    WHERE NOT is_archived;
CREATE INDEX assignments_project ON assignments (project_id) WHERE NOT is_archived;

-- "Deliverables". Status is computed from tasks and dependencies (section 2);
-- only the manager's sign-off is stored.
CREATE TABLE milestones (
    milestone_id  BIGSERIAL PRIMARY KEY,
    project_id    BIGINT  NOT NULL REFERENCES projects(project_id),
    name          VARCHAR(200) NOT NULL,
    description   TEXT,
    start_date    DATE    NOT NULL,
    due_date      DATE    NOT NULL,
    completed_at  TIMESTAMPTZ,                         -- signed off
    completed_by  BIGINT  REFERENCES users(user_id),
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at   TIMESTAMPTZ,
    archived_by   BIGINT  REFERENCES users(user_id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT milestones_name_present   CHECK (btrim(name) <> ''),
    CONSTRAINT milestones_dates_ordered  CHECK (due_date >= start_date),
    CONSTRAINT milestones_signoff_consistent CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
    CONSTRAINT milestones_archive_consistent CHECK (is_archived = (archived_at IS NOT NULL)),
    CONSTRAINT milestones_id_project UNIQUE (milestone_id, project_id)   -- composite-key target
);
CREATE INDEX milestones_project ON milestones (project_id) WHERE NOT is_archived;

-- "A depends on B". Both deliverables must be in the same project.
CREATE TABLE milestone_dependencies (
    milestone_id            BIGINT NOT NULL,
    depends_on_milestone_id BIGINT NOT NULL,
    project_id              BIGINT NOT NULL,
    is_archived             BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (milestone_id, depends_on_milestone_id),
    CONSTRAINT dependencies_same_project_from FOREIGN KEY (milestone_id, project_id)
        REFERENCES milestones (milestone_id, project_id),
    CONSTRAINT dependencies_same_project_to FOREIGN KEY (depends_on_milestone_id, project_id)
        REFERENCES milestones (milestone_id, project_id),
    CONSTRAINT dependencies_not_self CHECK (milestone_id <> depends_on_milestone_id),
    CONSTRAINT dependencies_archive_consistent CHECK (is_archived = (archived_at IS NOT NULL))
);
CREATE INDEX milestone_dependencies_target ON milestone_dependencies (depends_on_milestone_id);

-- Work items under a deliverable, ticked off by their assignee.
CREATE TABLE tasks (
    task_id           BIGSERIAL PRIMARY KEY,
    milestone_id      BIGINT  NOT NULL,
    project_id        BIGINT  NOT NULL,
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    assignee_user_id  BIGINT  REFERENCES users(user_id),   -- NULL = not yet assigned
    status            TEXT    NOT NULL DEFAULT 'TODO',
    estimate_minutes  INTEGER NOT NULL,
    completed_at      TIMESTAMPTZ,
    created_by        BIGINT  NOT NULL REFERENCES users(user_id),
    is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at       TIMESTAMPTZ,
    archived_by       BIGINT  REFERENCES users(user_id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tasks_on_project_milestone FOREIGN KEY (milestone_id, project_id)
        REFERENCES milestones (milestone_id, project_id),
    CONSTRAINT tasks_title_present     CHECK (btrim(title) <> ''),
    CONSTRAINT tasks_status_valid      CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    CONSTRAINT tasks_estimate_range    CHECK (estimate_minutes BETWEEN 1 AND 60000),
    CONSTRAINT tasks_done_consistent   CHECK ((status = 'DONE') = (completed_at IS NOT NULL)),
    CONSTRAINT tasks_archive_consistent CHECK (is_archived = (archived_at IS NOT NULL)),
    CONSTRAINT tasks_id_project UNIQUE (task_id, project_id)   -- composite-key target
);
CREATE INDEX tasks_milestone ON tasks (milestone_id) WHERE NOT is_archived;
CREATE INDEX tasks_assignee  ON tasks (assignee_user_id) WHERE NOT is_archived;

-- Time logged by an employee on a task: a date and a number of minutes.
CREATE TABLE time_entries (
    entry_id           BIGSERIAL PRIMARY KEY,
    task_id            BIGINT  NOT NULL,
    project_id         BIGINT  NOT NULL,
    user_id            BIGINT  NOT NULL REFERENCES users(user_id),
    work_date          DATE    NOT NULL,
    minutes            INTEGER NOT NULL,
    note               TEXT,
    hourly_rate_cents  BIGINT  NOT NULL,                   -- frozen when logged
    status             TEXT    NOT NULL DEFAULT 'PENDING',
    decided_by         BIGINT  REFERENCES users(user_id),
    decided_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT time_entries_on_project_task FOREIGN KEY (task_id, project_id)
        REFERENCES tasks (task_id, project_id),
    CONSTRAINT time_entries_minutes_range  CHECK (minutes BETWEEN 1 AND 1440),
    CONSTRAINT time_entries_rate_positive  CHECK (hourly_rate_cents >= 0),
    CONSTRAINT time_entries_status_valid   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT time_entries_decision_consistent CHECK (
        (status = 'PENDING') = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)),
    CONSTRAINT time_entries_not_own_approval CHECK (decided_by IS NULL OR decided_by <> user_id)
);
CREATE INDEX time_entries_user_date ON time_entries (user_id, work_date);
CREATE INDEX time_entries_project   ON time_entries (project_id);
CREATE INDEX time_entries_task      ON time_entries (task_id);

CREATE TABLE project_requests (
    request_id          BIGSERIAL PRIMARY KEY,
    requested_by        BIGINT NOT NULL REFERENCES users(user_id),
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    justification       TEXT   NOT NULL,
    proposed_start      DATE,
    proposed_end        DATE,
    status              TEXT   NOT NULL DEFAULT 'PENDING',
    decided_by          BIGINT REFERENCES users(user_id),
    decided_at          TIMESTAMPTZ,
    decision_note       TEXT,
    created_project_id  BIGINT REFERENCES projects(project_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT requests_text_present   CHECK (btrim(name) <> '' AND btrim(justification) <> ''),
    CONSTRAINT requests_dates_ordered  CHECK (proposed_end IS NULL OR proposed_start IS NULL
                                              OR proposed_end >= proposed_start),
    CONSTRAINT requests_status_valid   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT requests_decision_consistent CHECK (
        (status = 'PENDING') = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)),
    CONSTRAINT requests_project_iff_approved CHECK ((status = 'APPROVED') = (created_project_id IS NOT NULL)),
    CONSTRAINT requests_one_project UNIQUE (created_project_id)
);

CREATE TABLE audit_log (
    audit_id       BIGSERIAL PRIMARY KEY,
    actor_user_id  BIGINT REFERENCES users(user_id),       -- NULL only for the bootstrap admin
    actor_role     TEXT,
    action         VARCHAR(64) NOT NULL,                   -- CREATE, UPDATE, ARCHIVE, APPROVE, ...
    entity_type    VARCHAR(64) NOT NULL,                   -- table name, e.g. 'projects'
    entity_id      BIGINT,
    before_state   JSONB,
    after_state    JSONB,
    summary        TEXT   NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_role_valid    CHECK (actor_role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
    CONSTRAINT audit_actor_consistent CHECK ((actor_user_id IS NULL) = (actor_role IS NULL)),
    CONSTRAINT audit_summary_present CHECK (btrim(summary) <> '')
);
CREATE INDEX audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX audit_time   ON audit_log (created_at);

CREATE TABLE notifications (
    notification_id   BIGSERIAL PRIMARY KEY,
    recipient_user_id BIGINT  NOT NULL REFERENCES users(user_id),
    audit_id          BIGINT  NOT NULL REFERENCES audit_log(audit_id),
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notifications_once         UNIQUE (recipient_user_id, audit_id),
    CONSTRAINT notifications_read_consistent CHECK (is_read = (read_at IS NOT NULL))
);
CREATE INDEX notifications_unread ON notifications (recipient_user_id) WHERE NOT is_read;

-- Nothing is deleted, and the audit log is append-only: Postgres itself refuses.
CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% on % is not allowed: this table keeps its full history',
        TG_OP, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER no_delete BEFORE DELETE ON users                  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON projects               FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON assignments            FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON milestones             FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON milestone_dependencies FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON tasks                  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON time_entries           FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON project_requests       FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER no_delete BEFORE DELETE ON notifications          FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit_log  FOR EACH ROW EXECUTE FUNCTION refuse_change();
