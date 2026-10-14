# Database layer design

Status: **revision 3**, 13 Oct 2026, for David's review.

- Revision 2 fixed the code-review findings.
- Revision 3 removes the Workday-style timekeeping, after comparing the design with
  Jira, GitHub Projects, OpenProject, Float, Asana and Tempo (section 1.1). It adds tasks
  that employees tick off.

Scope: build-order steps 1 and 3 in `CLAUDE.md` ("The stack"): schema, migrations,
the store's connection, and the tests that prove the database refuses bad data.
Services, the API and the UI are later steps. Their rules are recorded here so the
schema fits them.

## 1. What this serves

The brief: a **project-management and tracking platform** for ACME that answers seven
questions. Each table below exists for at least one of them.

| # | Client question | Answered from |
| --- | --- | --- |
| 1 | Status of each active project | `projects.status`, plus progress rolled up from `tasks` |
| 2 | Projects at risk of missing deadlines | Deliverable progress vs time elapsed, overdue deliverables, budget burn vs schedule |
| 3 | Resource allocation across projects | `assignments` (bookings: hours/week per person per project) |
| 4 | Key deliverables and completion | `milestones` (deliverables) and their `tasks` |
| 5 | Over-allocated team members | Bookings per week vs `users.weekly_capacity_hours`; logged hours vs the same |
| 6 | Dependency chain between deliverables | `milestone_dependencies`, within one project |
| 7 | Budget consumed vs planned | Planned: bookings × rate. Consumed: approved `time_entries` × the rate frozen on each entry |

### 1.1 What comparable tools do, and what we took from each

| Tool | Pattern | Taken |
| --- | --- | --- |
| Jira, GitHub Projects | Work items with To Do / In Progress / Done, an estimate, and "log work" as a duration. Parent progress = share of children done | `tasks`, `time_entries`, computed deliverable progress |
| OpenProject | Budgets: planned labor cost from hourly rates; actual labor cost = logged hours × the person's rate for that period | Planned vs consumed cost; rate frozen per entry |
| Float, Asana | Per-person weekly capacity (40 h default); bookings in hours; over-capacity alerts | `weekly_capacity_hours`, bookings, over-allocation flags |
| Tempo (Jira) | A lead approves team members' logged time; nobody approves their own | Line-manager approval of time entries |

**Removed in revision 3, because these are payroll and HR features (Workday's job), not
project management:** clock in/out and open shifts, pay periods, advance overtime
approval and after-the-fact overtime review, the 1.5× overtime premium, and
effective-dated expected hours. None of the tools above has them.

## 2. Decisions

All settled with David on 13 Oct.

**Accounts**

- **Created by an admin only.** The server generates the **username** (initials plus 6
  digits, `DG482913`, regenerated on a collision). Accents are stripped from the
  initials (NFKD), and `X` stands in when a name has no ASCII letter. **Usernames never
  change.**
- **Password.** The server also generates a **12-character password** (`secrets`). It
  is shown once, and only its hash is stored.
- **Login is by username and password.** Email is contact information only.
- **Forced change on first login.** Until then, every route except change-password and
  "who am I" answers 403. A new password needs at least 8 characters and must differ
  from the current one.
- **Self-edit:** a user may change their own first name, last name and email, and
  nothing else.
- **Admin edits:** an admin edits everything except username and id, and never their
  own role or salary.
- **Forgotten password:** an admin reset, which generates a new password, shows it once
  and forces a change. An emailed reset code is a stretch goal; the workshop AWS role
  has no SES access.
- **Archiving a person** also archives their live bookings. Archiving a manager who
  still has live projects or live reports is refused (409).

**Work: deliverables, tasks and time**

- **Deliverables (`milestones`)** belong to one project.
- **Tasks:** the project's manager, or an admin, creates tasks under a deliverable.
  Each task gets an **estimate** and an **assignee** who is booked on the project.
- **Task status:** only the assignee moves a task through To Do, In Progress and Done.
- **Logging time:** only the assignee logs time on a task. An entry is a date, a number
  of minutes and a note. The date can't be in the future, and it must fall inside one of
  the employee's bookings on that project. Several entries per day are allowed, up to 24
  hours in total per person per day.
- **Deliverable status is computed, not typed:**
  - *Done* once it has been signed off (`completed_at` set);
  - otherwise *Blocked* while any live dependency isn't done;
  - otherwise *In progress* once any task has started;
  - otherwise *Not started*.
- **Progress** = done task estimates ÷ all live task estimates.
- **Sign-off:** the project's manager signs a deliverable off. That is refused (409)
  while any live task isn't done or any live dependency isn't signed off.
- **Undoing a sign-off:** reopening a task, or adding a task, in a signed-off
  deliverable clears the sign-off. Integrity query 5 checks nothing drifts.
- **Dependencies** stay **within one project**, enforced by composite foreign keys.
  Removing a dependency archives the link.
- **Reactivating a project** restores the bookings, deliverables and tasks that were
  archived with it, matched by `archived_at`.

**Capacity and overtime**

- Each person has `weekly_capacity_hours` (default 40, 1 to 60) and an
  `overtime_allowed` switch (default off). Both are set by their line manager or an
  admin.
- **Weeks** run Monday to Sunday, keyed by `work_date`. "Today" is Eastern time
  (`America/New_York`, one Python constant).
- **Logging past capacity:** an entry that takes the person's week, counting all
  projects and all non-rejected entries, beyond their capacity is **refused (409)
  unless `overtime_allowed`**. When allowed, the week is **flagged as overtime** on the
  dashboard.
- **Over-allocation (question 5):** a week whose **bookings** exceed the person's
  capacity is flagged on the allocation grid. It is allowed, not refused, because
  managers need to see it in order to fix it.
- One booking is 1 to 40 hours a week. A person can't hold two overlapping live
  bookings on the same project.

**Approval and cost**

- **Approver:** the employee's **line manager or any admin** approves or rejects time
  entries. Nobody approves their own. Only **approved** time counts as consumed budget.
- **Editing** an approved or rejected entry returns it to pending.
- **Hourly rate:** each entry stores `hourly_rate_cents = annual_salary_cents / 2080`
  (integer division) when it is created, so a later raise never rewrites past costs.
- **Consumed cost** = Σ over approved entries of minutes × rate / 60, rounded down per
  entry.
- **Planned cost** = Σ over live bookings of hours per week × 60 × days / 7, × the
  person's current rate / 60, rounded once per booking. It is a forecast, so it isn't
  frozen.
- **At risk** when any of these holds; the UI names which:
  - the project is past its end date and not complete;
  - a deliverable is past due and not done;
  - a deliverable's progress is more than 15 points behind its share of elapsed time;
  - consumed share of budget > elapsed share of schedule + 15 points.

**Database mechanics**

- **Value lists:** `TEXT` + `CHECK`, not `ENUM` (trap 11).
- **Migrations:** numbered files with a checksum, applied on cold start under an
  advisory lock.
- **Storage:** Postgres only, and tests use their own databases.
- **Nothing is deleted:** a trigger refuses `DELETE` on every table and `UPDATE` on
  `audit_log`.
- **Versions:** the DDL must run on Postgres 17 (Aurora 17.7, `infra/rds.tf:13`) and on
  local 18.6, so no 18-only features.
- **Connections use `autocommit=True`** (section 3.1). Every rule a service translates
  into a message has an explicit constraint name.

**Permissions**

| Action | Admin | Manager | Employee |
| --- | --- | --- | --- |
| Create, archive and restore users; reset passwords; edit salaries | yes | no | no |
| Change usernames | no one | no | no |
| Set capacity, "overtime allowed" and task limit | anyone | own reports | no |
| Edit own name and email; see own salary | yes | yes | yes |
| Create projects, approve requests, assign managers, archive or restore projects | yes | no | no |
| Request a new project | n/a | yes | no |
| Edit description, dates, budget and status; book people | all | own projects | no |
| Deliverables and dependencies: create, edit, sign off, archive | all | own projects | no |
| Tasks: create, assign, estimate, archive | all | own projects | no |
| Move a task's status; log time on it | no | no | own assigned tasks |
| Take a Ready task; put back your own (added 14 Oct) | no | no | booked on the project |
| Approve or reject time | anyone | own reports | no |
| See projects | all, including archived | managed | booked on, active only |
| Audit log | yes | no | no |

Managers and admins have no tasks or hours of their own, and are never booked. A
project's name stays admin-only. A manager chain must not loop (a service rule).

**Added 14 Oct (migration `002_task_limit.sql`):** `users.task_limit INTEGER NOT NULL
DEFAULT 2`, with a CHECK that it is 1 to 10 (`users_task_limit_range`). It is the most
unfinished tasks a person may take themselves (Take this); a manager can still assign past
it. It is set with capacity and "overtime allowed". Section 4 below shows `001_init.sql`
as first written and is not edited, because that file never changes once it has run.

## 3. Files

```
backend/tracker/store/
├── migrations/001_init.sql   # section 4
├── migrations/002_task_limit.sql  # adds users.task_limit (14 Oct)
├── migrate.py                # section 5
├── integrity.py              # section 6
└── postgres.py               # connect(), atomic(), error translation; section 3.1
requirements-dev.txt          # repo root: psycopg[binary]==3.3.*, pytest, pytest-cov
pytest.ini                    # repo root: testpaths = tests, pythonpath = backend/tracker
tests/backend/
├── conftest.py               # section 7
├── test_store_commits.py
├── test_migrate.py
├── test_schema_users.py
├── test_schema_projects.py   # projects, assignments, requests
├── test_schema_work.py       # milestones, dependencies, tasks, time entries
├── test_no_delete.py
└── test_integrity.py
```

### 3.1 Connections and transactions (`postgres.py`)

- **Every connection is opened with `autocommit=True`.** Every write goes through
  `atomic()`, which is `conn.transaction()`. The outermost one is a real
  `BEGIN … COMMIT`, and a nested one is a savepoint.
- **Why:** with psycopg's default `autocommit=False`, the first statement opens a
  hidden transaction, and every later `transaction()` becomes only a savepoint. Nothing
  is ever committed. This was reproduced on 13 Oct: 0 rows visible from another
  connection, both while open and after close. `test_store_commits.py` guards it.
- **One connection per warm Lambda,** reconnecting if it is broken.
- **Errors are translated here:** connection failures become `StorageUnavailable`
  (503). Constraint violations become domain errors, looked up by **constraint name**.
  No psycopg exception escapes the store.
- **psycopg 3.3.x** (3.3.6 verified) in both `requirements.txt` files.

## 4. Schema: `001_init.sql`

```sql
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
```

`updated_at` is set explicitly by each `UPDATE` in the store. `TRUNCATE` bypasses row
triggers; only the test harness drops databases, and the app never truncates.

### What the database refuses vs what the services refuse

**The database** refuses anything checkable from one row, a foreign key, or an
exclusion constraint:

- a malformed username or a negative budget;
- overlapping bookings on the same project;
- a cross-project dependency;
- a task on another project's deliverable, or a time entry on another project's task;
- a task marked done without its timestamp;
- self-approval;
- a deleted row, or an edited audit row.

**The services** refuse what needs other rows, the clock, or the caller:

- who may do what, and that only the assignee logs time or moves a task;
- the assignee must be booked on the project;
- an entry's date inside a booking, and not in the future;
- 24 hours per day per person;
- logging past capacity without `overtime_allowed` (the service takes
  `SELECT … FOR UPDATE` on the user's row first, so two entries submitted at once can't
  both slip under the limit);
- sign-off preconditions, and clearing the sign-off when work reopens;
- dependency loops;
- manager-chain loops;
- archive and reactivate cascades.

The integrity check (section 6) re-checks five of these after the fact.

## 5. Migrations: `migrate.py`

1. Open an autocommit connection and begin one transaction. `SET LOCAL lock_timeout =
   '10s'` and `statement_timeout = '60s'`. Take `pg_advisory_xact_lock(<fixed key>)`,
   so two Lambdas cold-starting at once queue rather than both migrating.
2. `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT
   NOT NULL, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`.
3. Read `migrations/NNN_name.sql`, sorted. Refuse to start if two files share a number,
   or if an applied file's sha256 has changed. Never edit a migration that has run; fix
   forward with a new file.
4. Run each pending file with one `execute()` and no parameters, so a file may hold
   several statements. Record each one. It's all one transaction, so a failure leaves
   no trace. Don't use `CREATE INDEX CONCURRENTLY`; it can't run inside a transaction.
5. **Bootstrap admin, inside the same locked transaction.** If
   `BOOTSTRAP_ADMIN_PASSWORD` is set, insert `AD000001` with:
   - `must_change_password = true`;
   - a CREATE audit row with a NULL actor;
   - `ON CONFLICT (username) DO NOTHING`.

   The hashing function is passed in by `function.py`, so `store/` imports no service.
6. Commit, and return the versions applied.

**Failure on cold start:** `function.py` logs the error and answers each request with
503 `{"error": "database not ready"}`, retrying the migration on the next request.

**Bootstrap secret:** a Terraform `random_password`, passed to the Lambda next to the
JWT secret. Read it with `terraform output -raw bootstrap_admin_password`. Both secrets
sit in Terraform state and the Lambda's configuration. That's acceptable for the
workshop, the forced first-login change limits it, and it's worth saying out loud.

## 6. Integrity check: `integrity.py`

Five queries, each of which must return no rows. They run after every test and back
`GET /admin/integrity-check`. Each checks something the schema can't enforce row by row.

```sql
-- 1. No dependency loops among live links.
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
SELECT DISTINCT start_id AS milestone_id FROM walk WHERE current_id = start_id;

-- 2. Nothing live under an archived project.
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
WHERE p.is_archived AND NOT t.is_archived;

-- 3. Every record has its creation audit row.
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
);

-- 4. No live time entry on a day its author wasn't booked on that project.
SELECT e.entry_id
FROM time_entries e
WHERE e.status <> 'REJECTED'
  AND NOT EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.user_id = e.user_id AND a.project_id = e.project_id
        AND e.work_date BETWEEN a.start_date AND a.end_date);

-- 5. No signed-off deliverable with an unfinished live task or dependency.
SELECT m.milestone_id
FROM milestones m
WHERE m.completed_at IS NOT NULL
  AND (EXISTS (SELECT 1 FROM tasks t
               WHERE t.milestone_id = m.milestone_id AND NOT t.is_archived AND t.status <> 'DONE')
    OR EXISTS (SELECT 1 FROM milestone_dependencies d
               JOIN milestones dm ON dm.milestone_id = d.depends_on_milestone_id
               WHERE d.milestone_id = m.milestone_id AND NOT d.is_archived
                 AND dm.completed_at IS NULL));
```

Query 4 counts archived bookings too. A booking archived after time was logged on it
doesn't make that history wrong.

**Audit rule:**

- **Each change writes one audit row per entity it changes.** Approving a request writes
  two rows: the request was updated, and a project was created.
- **Archiving cascades write a row per child.** Archiving a project writes one row for
  the project, and one for each booking, deliverable and task archived with it.
- **The route walk** asserts that every mutating route writes at least one row.
- **Query 3** asserts that every record has its CREATE row.
- **Links:** `milestone_dependencies` has no id, so its changes are audited as UPDATEs
  of the deliverable.

## 7. Tests

**Harness (`conftest.py`)**

- **Session start:** `DROP DATABASE IF EXISTS tracker_test WITH (FORCE)`, then
  `CREATE DATABASE tracker_test`, then run `migrate.py`. The name is hard-coded
  (trap 12), and there's no bootstrap admin.
- **Per test:** an autocommit connection inside
  `with conn.transaction(force_rollback=True)`. `atomic()` nests as a savepoint, and
  nothing persists. A refusal inside a savepoint leaves the transaction usable; this
  was verified on 13 Oct.
- **Teardown:** still inside the transaction, the five integrity queries must return
  nothing. The check is skipped if the connection isn't `INTRANS`, so a test's real
  error isn't masked.
- **Markers:**
  - `@pytest.mark.schema` (raw-SQL tests with no audit rows) skips query 3 only.
  - `@pytest.mark.no_integrity_check` (`test_integrity.py`) skips the whole check.
- **Factories:** `make_user()`, `make_project()`, `make_task()` and similar insert valid
  rows plus their CREATE audit row. A refusal test then breaks exactly one thing, inside
  its own savepoint.
- **Own databases:** `test_migrate.py` and `test_store_commits.py` create and drop
  `tracker_migrate_test` and `tracker_commit_test`.

| File | Proves |
| --- | --- |
| `test_store_commits.py` | A write through `atomic()` is visible from a second connection (guards against the lost-write trap) |
| `test_migrate.py` | A fresh database reaches the latest version. A rerun applies nothing. A broken migration leaves no trace. Duplicate numbers and edited applied files are refused. The bootstrap admin is created exactly once |
| `test_schema_users.py` | Username format and uniqueness; email unique ignoring case; names present; not own manager; salary ≥ 0; capacity 1 to 60; overtime off and password change required by default; archive fields agree |
| `test_schema_projects.py` | Dates ordered; budget ≥ 0; valid status; booking hours 1 to 40; overlapping live bookings refused (an archived one doesn't block; another project is fine); request decision fields agree; one project per request |
| `test_schema_work.py` | Sign-off fields agree; no self-dependency; no cross-project dependency; a task on another project's deliverable refused; task done ⇔ completed timestamp; estimate range; a time entry on another project's task refused; minutes 1 to 1440; decision fields agree; self-approval refused |
| `test_no_delete.py` | `DELETE` refused on every table; `UPDATE` refused on `audit_log`; marking a notification read still works |
| `test_integrity.py` | Each query is empty on clean data and catches a planted violation: a loop A→B→C→A (an archived link closing it is ignored); a live task under an archived project; a row without its audit row; an entry dated after its booking ends; a signed-off deliverable with a reopened task |

**Commands**

```sh
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # once
.venv/bin/pytest -q                                     # everything; prints the count
.venv/bin/pytest -q tests/backend/test_schema_work.py   # one file
.venv/bin/pytest -q -k overlap                          # by name
.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing
PGPASSWORD=postgres123 psql -h localhost -U postgres -d tracker_test   # look around
```

## 8. Not in this step

- **Later build steps:** services, routes, password hashing and JWT are steps 4 and 5;
  seed data is step 7.
- **Search:** `ILIKE` on small tables. `pg_trgm` (available locally) is the answer to
  the scale question.
- **Known disclosure:** a manager who books a single employee can work out that
  person's rate from the planned cost. Accepted; say it if asked.
