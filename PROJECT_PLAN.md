# ACME Project Tracker: plan, spec and task list

Single working document for the Citi workshop build, Oct 13 to 15 2026.
Everything the team needs that is not derivable from the code lives here.

**Rule:** if something in this file is out of date, fix it in the same commit as the
code that outdated it.

---

## 1. What we are building

A centralised project management and tracking platform for ACME Inc. Real-time
visibility into project health, resource utilisation, delivery progress and budget.
Stand-alone web app, no external integrations.

### The seven questions the client asked

These come straight from the business problem statement. Every one of them needs a
visible place in the UI. This list is also the demo running order.

| # | Question | Where it is answered |
| --- | --- | --- |
| 1 | What is the current status of each active project? | Project list, status column |
| 2 | Which projects are at risk of missing deadlines? | Dashboard "At risk" panel |
| 3 | How are resources allocated across projects? | Allocation grid, person by week |
| 4 | What are the key deliverables and their completion status? | Milestone timeline per project |
| 5 | Which team members are over-allocated? | Allocation grid, cells over 40h flagged |
| 6 | What is the dependency chain between deliverables? | Milestone dependency view |
| 7 | How much budget consumed versus planned? | Project budget bar, planned vs consumed |

**If a question has no screen, we have not met the requirements.** Build these seven
before anything else. Question 5 and question 7 are the two that need the data model
to be right from the start, so they drive the schema below.

---

## 2. Decisions to make in the next thirty minutes

Our notes contradict themselves in four places. Each of these is cheap now and
expensive tomorrow. Resolve them, write the answer in this file, move on.

### 2.1 The one-manager problem (blocking)

The notes say all three of these, and they cannot all be true:

- An employee has exactly one manager.
- An employee can be assigned to multiple projects.
- A project has exactly one manager.

If Alice is on project A (managed by Bob) and project B (managed by Carol), Alice has
two managers.

**Pick one:**

- **(a) Org chart model.** `users.manager_id` is the employee's line manager and has
  nothing to do with projects. Any manager can assign any employee to their project.
  One manager per employee holds, and multi-project works.
- **(b) Containment model.** An employee can only be assigned to projects owned by
  their own manager. Satisfies everything literally, but means reassigning an employee
  to another team breaks their project history.

**Recommendation: (a).** It is what the official brief assumes when it asks who is
over-allocated *across multiple projects*. Option (b) makes question 5 almost
meaningless.

> DECIDED: ______________________

### 2.2 Planned hours or logged hours

The brief asks for "budget consumed versus planned", so we need both numbers.

- **Planned** is derivable with no new UI: `hours_per_week x number of weeks in the
  assignment`.
- **Consumed** needs either employees logging time, or a rule that elapsed weeks count
  as consumed.

**Recommendation:** derive consumed from elapsed weeks for the MVP, and add real time
entry as the stretch. The `time_entries` table is in the schema either way so adding
it later touches no other table.

> DECIDED: ______________________

### 2.3 Money representation (do not skip this)

**Money is an integer number of cents, everywhere except on screen.** `123456` is
`$1,234.56`.

- Floats drift across a ledger. `1000.10 + 234.20 + 0.30 - 0.04` gives
  `1234.5599999999999`.
- `NUMERIC` in Postgres is exact but arrives in Python as `Decimal`, which is not JSON
  serialisable, so it leaves as a quoted string and goes back through a parser on every
  client.
- `BIGINT` cents is exact to beyond any number this app will see, and JSON has one
  numeric type so an integer survives `JSON.parse` unchanged.

Salaries, budgets and computed costs are all `BIGINT` cents. One module parses and
formats money and nothing else converts it.

Hourly rate: `hourly_rate_cents = annual_salary_cents / 2080` (40 hours x 52 weeks).
Integer division. Document the rounding once, in that module, and never round twice.

### 2.4 Field naming on the wire

Pick `snake_case` or `camelCase` once and apply it to requests **and** responses.
Mixing them is the failure that silently breaks optional-field lookups: the server
reads a key the client never sent, gets `None`, and the guard quietly does nothing.

**Recommendation:** `camelCase` on the wire, `snake_case` in Postgres and Python,
converted in one serialisation layer.

> DECIDED: ______________________

---

## 3. Roles and permissions

Three roles. This table is the entire authorisation model, and it belongs in one place
in code as well, as a route table rather than an `if` inside each handler.

| Capability | Admin | Manager | Employee |
| --- | --- | --- | --- |
| Create project | yes | no, requests only | no |
| Edit project (name, dates, budget) | yes | partial, see below | no |
| Archive / reactivate project | yes | no | no |
| Assign manager to project | yes | no | no |
| Create users, including other admins | yes | no | no |
| Assign employees to a project | yes | own projects only | no |
| Create and edit milestones | yes | own projects only | no |
| Set and edit budget | yes | own projects only | no |
| Approve project requests | yes | no | no |
| View all projects | yes | own only | assigned only |
| Edit own name and email | yes | yes | yes |
| Edit own salary, job title, role | no | no | no |

**Manager partial edit on projects:** description and status yes; name, start date,
predicted end date and budget ceiling no. Those belong to the admin because they change
the planned cost.

**Nobody edits their own salary or role.** Ever. Not even an admin on their own record.

### Flow that matters

1. Admin creates the overarching project and assigns a manager to it.
2. The manager controls milestones, employee assignments and the budget inside it.
3. A manager who needs a new project files a request. The admin approves or rejects it,
   and approval creates the project with that manager already assigned.

---

## 4. Archive, never delete

**There are no DELETE endpoints in this application.** Records are archived with a
boolean flag and a timestamp, and archived records can be reactivated.

Why it is stated this strongly: "just add a delete for cleanup" is the easiest feature
to write and the wrong one. Once a project row is gone, every cost figure that
referenced it is unreconstructable.

Implementation:

- `is_archived BOOLEAN NOT NULL DEFAULT FALSE`, plus `archived_at` and `archived_by`.
- Every list query filters `WHERE is_archived = FALSE` by default, with an explicit
  "show archived" toggle in the UI.
- Archiving a project archives its assignments and milestones in the same transaction.
  Reactivating restores them.
- Every mutation writes an `audit_log` row. The audit log is append only.

**Write the tests that assert the absence**, because these keep working after everyone
has forgotten why they exist:

- No service method or repository method named `delete`.
- No route with the `DELETE` verb, anywhere.
- No route path containing `/delete`.

Add a route, forget the rule, the suite fails. This is also a thirty-second demo moment:
show the test, then show the archived project coming back.

---

## 5. Data model

Postgres. Aurora Serverless via `infra/rds.tf`. The repo also ships `documentdb.tf`;
ignore it, the requirements say PostgreSQL.

```sql
CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');
CREATE TYPE project_status AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETE');
CREATE TYPE milestone_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE');
CREATE TYPE request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE users (
    user_id              BIGSERIAL PRIMARY KEY,
    employee_code        VARCHAR(16)  NOT NULL UNIQUE,  -- generated login id
    first_name           VARCHAR(80)  NOT NULL,
    last_name            VARCHAR(80)  NOT NULL,
    email                VARCHAR(255) NOT NULL UNIQUE,
    job_title            VARCHAR(120),
    role                 user_role    NOT NULL,
    manager_id           BIGINT       REFERENCES users(user_id),
    annual_salary_cents  BIGINT       NOT NULL DEFAULT 0 CHECK (annual_salary_cents >= 0),
    password_hash        TEXT         NOT NULL,
    must_change_password BOOLEAN      NOT NULL DEFAULT TRUE,
    is_archived          BOOLEAN      NOT NULL DEFAULT FALSE,
    archived_at          TIMESTAMPTZ,
    archived_by          BIGINT       REFERENCES users(user_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (manager_id IS NULL OR manager_id <> user_id)
);

CREATE TABLE projects (
    project_id           BIGSERIAL PRIMARY KEY,
    name                 VARCHAR(200) NOT NULL,
    description          TEXT,
    manager_id           BIGINT       NOT NULL REFERENCES users(user_id),
    start_date           DATE         NOT NULL,
    predicted_end_date   DATE         NOT NULL,
    budget_cents         BIGINT       NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
    status               project_status NOT NULL DEFAULT 'PLANNING',
    created_by           BIGINT       NOT NULL REFERENCES users(user_id),
    is_archived          BOOLEAN      NOT NULL DEFAULT FALSE,
    archived_at          TIMESTAMPTZ,
    archived_by          BIGINT       REFERENCES users(user_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (predicted_end_date >= start_date)
);

-- An employee's allocation to a project, in hours per week over a date range.
-- This table is what makes over-allocation detection possible.
CREATE TABLE assignments (
    assignment_id   BIGSERIAL PRIMARY KEY,
    project_id      BIGINT  NOT NULL REFERENCES projects(project_id),
    user_id         BIGINT  NOT NULL REFERENCES users(user_id),
    hours_per_week  INTEGER NOT NULL CHECK (hours_per_week BETWEEN 1 AND 40),
    start_date      DATE    NOT NULL,
    end_date        DATE    NOT NULL,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    UNIQUE (project_id, user_id, start_date)
);

CREATE TABLE milestones (
    milestone_id  BIGSERIAL PRIMARY KEY,
    project_id    BIGINT  NOT NULL REFERENCES projects(project_id),
    name          VARCHAR(200) NOT NULL,
    description   TEXT,
    start_date    DATE    NOT NULL,
    due_date      DATE    NOT NULL,
    status        milestone_status NOT NULL DEFAULT 'NOT_STARTED',
    completed_at  TIMESTAMPTZ,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (due_date >= start_date)
);

CREATE TABLE milestone_dependencies (
    milestone_id            BIGINT NOT NULL REFERENCES milestones(milestone_id),
    depends_on_milestone_id BIGINT NOT NULL REFERENCES milestones(milestone_id),
    PRIMARY KEY (milestone_id, depends_on_milestone_id),
    CHECK (milestone_id <> depends_on_milestone_id)
);

CREATE TABLE project_requests (
    request_id          BIGSERIAL PRIMARY KEY,
    requested_by        BIGINT NOT NULL REFERENCES users(user_id),
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    justification       TEXT NOT NULL,
    proposed_start      DATE,
    proposed_end        DATE,
    status              request_status NOT NULL DEFAULT 'PENDING',
    decided_by          BIGINT REFERENCES users(user_id),
    decided_at          TIMESTAMPTZ,
    decision_note       TEXT,
    created_project_id  BIGINT REFERENCES projects(project_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stretch. Table exists from day one so adding it later touches nothing else.
CREATE TABLE time_entries (
    entry_id      BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES assignments(assignment_id),
    work_date     DATE   NOT NULL,
    hours         NUMERIC(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (assignment_id, work_date)
);

CREATE TABLE audit_log (
    audit_id       BIGSERIAL PRIMARY KEY,
    actor_user_id  BIGINT REFERENCES users(user_id),
    action         VARCHAR(64) NOT NULL,
    entity_type    VARCHAR(64) NOT NULL,
    entity_id      BIGINT,
    before_state   JSONB,
    after_state    JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes the queries below actually need.
CREATE INDEX idx_projects_manager   ON projects(manager_id)   WHERE is_archived = FALSE;
CREATE INDEX idx_assignments_user   ON assignments(user_id)   WHERE is_archived = FALSE;
CREATE INDEX idx_assignments_proj   ON assignments(project_id) WHERE is_archived = FALSE;
CREATE INDEX idx_milestones_project ON milestones(project_id) WHERE is_archived = FALSE;
CREATE INDEX idx_audit_entity       ON audit_log(entity_type, entity_id);
```

### The invariant to check constantly

Pick the one property that must never be false and wire it into the test harness, so
every test is also a test of it.

**No employee is allocated more than 40 hours in any single week.**

```sql
-- Must always return zero rows.
SELECT user_id, week_start, SUM(hours_per_week) AS total
FROM (
  SELECT a.user_id,
         generate_series(
           date_trunc('week', a.start_date),
           date_trunc('week', a.end_date),
           '1 week'
         )::date AS week_start,
         a.hours_per_week
  FROM assignments a
  WHERE a.is_archived = FALSE
) weeks
GROUP BY user_id, week_start
HAVING SUM(hours_per_week) > 40;
```

Run it in test teardown. A code path that assigns hours without checking capacity fails
inside whichever test touched it, immediately, rather than three days later when the
numbers stop adding up. Expose it as an admin endpoint too, so it is demoable live.
Ending the demo on this returning zero rows is the strongest thirty seconds available.

---

## 6. Business rules

1. An employee cannot be allocated more than 40 hours in any week, counting every
   project. Attempting it returns 409, not 400, and names the conflicting projects.
2. A project must have exactly one manager at all times.
3. A manager cannot be assigned as an employee to a project.
4. Milestone dependencies must form a directed acyclic graph. Reject a dependency that
   would create a cycle, detected with a recursive CTE.
5. A milestone cannot be marked `DONE` while any milestone it depends on is not `DONE`.
   Mark it `BLOCKED` instead.
6. Planned cost recomputes whenever project dates or any assignment changes. **Pushing
   the predicted end date out increases planned cost**, which is the behaviour the
   client specifically asked about.
7. Budget is a ceiling, not a target. Planned cost exceeding budget is a warning state,
   not a rejection, because a manager needs to see it to act on it.
8. Nothing is deleted. See section 4.
9. Generated passwords force a change on first login.

### Derived figures

```
hourly_rate_cents   = annual_salary_cents / 2080
planned_hours       = sum over assignments of (hours_per_week * weeks_in_range)
planned_cost_cents  = sum over assignments of (hours * hourly_rate_cents)
consumed_cost_cents = same, but only for weeks already elapsed
budget_utilisation  = consumed_cost_cents / budget_cents
schedule_elapsed    = (today - start_date) / (predicted_end_date - start_date)
```

**At risk** when any of these hold, and the UI says which one:

- `predicted_end_date < today` and status is not `COMPLETE`
- a milestone is past its `due_date` and not `DONE`
- `budget_utilisation > schedule_elapsed + 0.15`
- a `DONE` milestone depends on something still blocked

---

## 7. API

Route table lives in one list, each row declaring the roles allowed. That list is the
whole authorisation config, auditable at a glance, read by one `authorise` function.
The alternative is an `if` repeated in thirty handlers, which is the fastest route to
twenty-nine that check and one that forgot.

**And a test walks the real route table asserting every route except `/auth/login`
requires a token.**

```
POST   /auth/login                              public
POST   /auth/change-password                     any authenticated
GET    /auth/me                                  any authenticated

GET    /users                                    admin, manager
POST   /users                                    admin
GET    /users/{id}                               admin, manager, self
PATCH  /users/{id}                               admin
PATCH  /users/me                                 any (name and email only)
POST   /users/{id}/archive                       admin
POST   /users/{id}/reactivate                    admin

GET    /projects                                 all (scoped by role)
POST   /projects                                 admin
GET    /projects/{id}                            all (scoped)
PATCH  /projects/{id}                            admin, owning manager (partial)
POST   /projects/{id}/archive                    admin
POST   /projects/{id}/reactivate                 admin

GET    /projects/{id}/assignments                admin, owning manager, assigned
POST   /projects/{id}/assignments                admin, owning manager
PATCH  /assignments/{id}                         admin, owning manager
POST   /assignments/{id}/archive                 admin, owning manager

GET    /projects/{id}/milestones                 admin, owning manager, assigned
POST   /projects/{id}/milestones                 admin, owning manager
PATCH  /milestones/{id}                          admin, owning manager
POST   /milestones/{id}/archive                  admin, owning manager
POST   /milestones/{id}/dependencies             admin, owning manager
GET    /projects/{id}/dependency-graph           admin, owning manager, assigned

GET    /projects/{id}/budget                     admin, owning manager
GET    /dashboard/at-risk                        admin, manager
GET    /dashboard/allocation                     admin, manager
GET    /admin/capacity-check                     admin
GET    /admin/audit-log                          admin

GET    /project-requests                         admin, manager (own)
POST   /project-requests                         manager
POST   /project-requests/{id}/approve            admin
POST   /project-requests/{id}/reject             admin
```

### Conventions

- **Every failure returns the same shape:** `{ "error": "..." }`. One thing for the
  client to unwrap.
- **Paginate from day one.** Lists return
  `{ items, page, pageSize, total, totalPages }`. Adding pagination later changes the
  response shape and breaks every client. The cost now is one word of nesting. Projects
  can run a year, so milestone and audit lists will be long.
- **Write endpoints return the new authoritative resource**, not just a confirmation.
- **Serialise by naming every field explicitly.** Never dump a model's `__dict__`, or
  `password_hash` leaks the first time somebody adds a field.
- **Business logic raises domain exceptions**, never HTTP status codes. One ordered
  table maps exception to status, subclasses before parents.

| Status | Meaning here |
| --- | --- |
| 400 | malformed request, invalid date range, non-integer money |
| 401 | authenticate, including a failed login |
| 403 | authenticated but this role cannot do this |
| 404 | not found, **or exists but you are not allowed to know that** |
| 409 | well formed but state refuses it: over 40 hours, dependency cycle |
| 503 | database unavailable, nothing was changed |

**404 not 403 for another manager's project.** A 403 confirms the project exists, which
lets someone enumerate the portfolio by walking ids. Write a test asserting the "not
yours" and "does not exist" messages are byte identical.

**Never authorise off the token's role claim.** The claim is signed so it has not been
tampered with, but a token cannot be recalled. A user demoted after logging in still
carries a token saying ADMIN. Re-read the user from the database and authorise on the
stored role. The token says who you are, the database says what you may do.

---

## 8. Frontend

Required by the brief, so not optional: **React with React Responsive and Material UI
components.** Do not hand roll the component library.

### Screens

| Screen | Who | Notes |
| --- | --- | --- |
| Login | all | forced password change on first login |
| Dashboard | admin, manager | at-risk panel, allocation heat, budget summary |
| Project list | all, scoped | search, filter by status, pagination |
| Project detail | all, scoped | tabs: overview, milestones, team, budget |
| Milestone timeline | admin, manager, assigned | dependency arrows, overdue marked |
| Allocation grid | admin, manager | people down, weeks across, cells over 40 flagged |
| Employee list | admin, manager | search, filter, archived toggle |
| My projects | employee | only assigned, no portfolio visibility |
| My profile | all | name and email only |
| Project requests | admin, manager | manager files, admin approves |
| Audit log | admin | append only, paginated |

### Rules

- **One module talks to the backend.** Every call goes through a single `request()`
  function so the token header, JSON encoding and error shape are handled once. Pages
  call named functions and never call `fetch` directly.
- **Handle session expiry in exactly one place.** Any 401 from any call clears the token
  and drops the user, so the route guard redirects to login. Login is exempt, because a
  401 there means wrong password, not session ended.
- **Probe the session on load.** Ask the backend whether the stored token is still good
  rather than assuming it. Render nothing while that is in flight, so a signed-in user
  refreshing a page is never briefly bounced to login.
- **Wrap every storage access in try/catch.** `localStorage` throws rather than
  returning null in some private browsing modes.
- **Light and dark mode**, through MUI's theme with our own tokens. Annotate each colour
  with its measured contrast ratio in a comment. That is what makes accessibility
  checkable instead of aspirational, and it is what makes the dark theme a token
  redefinition rather than a rewrite.
- **Never signal an error by border colour alone.** Tie each message to its field with
  `aria-describedby`.
- **Never compute money in the browser.** Every write endpoint returns the authoritative
  figures. Render those.

### Scalability answers to have ready

They will ask. Point at code rather than describing intentions.

- Pagination on every list, in the response envelope from day one.
- Partial indexes on the archived flag, so the common query never scans archived rows.
- The allocation query is a single grouped aggregate, not N+1 per employee.
- Lambda is stateless, so horizontal scale is the default. Session state is in the JWT.
- A year-long project means 52 week columns, so the allocation grid virtualises or
  windows by quarter rather than rendering every cell.

---

## 9. Build order

Each step is testable before the next begins. Do not reorder these; the UI cannot start
until the API is stable, so the API has to be done early rather than done well.

1. **Domain exceptions.** One module. `OverAllocated`, `ProjectNotFound`,
   `NotAuthorised`, `DependencyCycle`, `CannotDelete`. Ten minutes, and it is what lets
   the service layer stay framework free.
2. **The money module.** Parse, validate, format. Nothing else converts money.
3. **Models.** Plain classes. Make invariant-critical fields read only.
4. **Repository, in memory first.** Dictionaries behind the method names Postgres will
   later implement. Do not skip this to save time. It is what makes the tests fast, the
   demo zero setup, and the real database a one-file change.
5. **Service layer.** Every business rule, no framework imports.
6. **Tests of the rules**, calling services directly, never importing the API module.
   That import boundary is what proves the layer separation rather than claiming it.
7. **Route table and one `authorise` function.** Plus the error mapping table.
8. **Tests of the HTTP layer**, including the 404-not-403 case and the token-required
   walk over the real route table.
9. **Seed data**, replayed through the real service methods so loading the seed is
   itself a test. Seed deliberate edge cases: an employee at exactly 40 hours, one at
   39, an overdue milestone, a project over budget, an archived project.
10. **Postgres behind the repository interface.** Translate driver errors into domain
    errors at the boundary so no psycopg exception escapes the store file.
11. **Frontend.**
12. **Deploy.**

---

## 10. Schedule

Three sessions, 9am to 3pm, and expect to work in the evenings. Day 1 is already
partly gone, so this is tighter than ideal.

### Today, Tuesday

- [ ] Environment validated, `start-dev.sh` running
- [ ] Section 2 decisions made and written into this file
- [ ] Repo docs read: `implementation.md`, `testing.md`, `full-stack.md`, `evaluation.md`
- [ ] Ownership table filled in (section 11)
- [ ] Steps 1 to 6 of the build order: exceptions, money, models, in-memory repository,
      services, rule tests
- [ ] One end-to-end slice working: login, list projects, see one project

### Wednesday

- [ ] Steps 7 to 10: route table, HTTP tests, seed, Postgres
- [ ] Postman collection generated from the route table, including failure cases
- [ ] Frontend: login, project list, project detail, allocation grid
- [ ] Milestones with dependencies
- [ ] Deploy once, even if incomplete. A first deploy always breaks; find out today.

### Thursday

- [ ] Budget view, dashboard, at-risk panel
- [ ] Light and dark mode
- [ ] Screenshots of every feature including empty and error states
- [ ] Rehearse the demo **against the running app**, not from memory
- [ ] Final deploy, verify the deployed URL in a fresh browser

---

## 11. Ownership

Own files, not features. Two people in one file is where conflicts come from. Write the
route next to the filename so it also says who to ask.

| Area | Files | Owner |
| --- | --- | --- |
| Domain, money, exceptions | `backend/domain/` | |
| Services and rules | `backend/services/` | |
| Repository and Postgres | `backend/store/` | |
| Route table and handlers | `backend/api/` | |
| API client module | `frontend/src/api.js` | |
| Theme and design tokens | `frontend/src/theme/` | |
| Auth context and route guards | `frontend/src/auth/` | |
| Project screens | `frontend/src/pages/projects/` | |
| Allocation grid | `frontend/src/pages/allocation/` | |
| Milestone timeline | `frontend/src/pages/milestones/` | |
| Infra and deploy | `infra/`, `bin/` | |

**Merge constantly, and never trust a clean merge.** Git merges text, not meaning. After
every merge, run the tests and read what changed in the files you own. Restart the
backend after pulling backend changes; the symptom of forgetting is baffling, because
the code is right, the tests pass, and the running app serves the old behaviour.

---

## 12. Environment setup

Values from the workshop email. **Do not commit the participant code or the password.**
The participant code is also the VDI login password.

| Setting | Value |
| --- | --- |
| WorkSpaces registration code | `wscmh+XEEJD4` |
| WorkSpaces username | `uc7dabfc1` |
| WorkSpaces password | from email, same as participant code |
| AWS region | `us-east-2` |
| Event ID | `01a127f2` |
| Participant ID | `c7dabfc1` (no `u` prefix) |
| Participant code | from email |
| Repo | https://github.com/citi/coding-workshop-participant |

The `u` prefix belongs only to the WorkSpaces username, not the participant ID.

```sh
git clone https://github.com/citi/coding-workshop-participant
cd coding-workshop-participant

echo "export AWS_REGION='us-east-2'"            >> ~/.bashrc
echo "export EVENT_ID='01a127f2'"               >> ~/.bashrc
echo "export PARTICIPANT_ID='c7dabfc1'"         >> ~/.bashrc
echo "export PARTICIPANT_CODE='<from-email>'"   >> ~/.bashrc
echo "export LOCALSTACK_AUTH_TOKEN='<token>'"   >> ~/.bashrc

source ~/.bashrc
./bin/setup-participant.sh

source ~/.bashrc
./bin/setup-environment.sh -d      # asks for sudo, same as VDI password, types invisibly

source ~/.bashrc
./bin/start-dev.sh
```

**The LocalStack token is the step most likely to be missed.** Get it from
https://app.localstack.cloud/getting-started before running the setup scripts.

Other notes on the VDI:

- Use the WorkSpaces desktop client rather than the web client if you can. The desktop
  client shares the clipboard with your own machine, which means copy and paste from
  these docs. Paste into a terminal with `Ctrl+Shift+V`.
- VS Code comes with Copilot pre-installed and works anonymously until the free quota
  runs out. Sign into your personal GitHub account to extend it.
- Claude Code subscription is sponsored for the workshop. Redeem it from the link in the
  email. Do not put the redeem code in this file or any commit.
- The VDI is erased shortly after the workshop. Push everything to GitHub.

### Scripts in the repo

| Script | Does |
| --- | --- |
| `bin/setup-participant.sh` | registers you against the event |
| `bin/setup-environment.sh -d` | installs VS Code, PyCharm, IntelliJ, awscli, terraform |
| `bin/start-dev.sh` | starts backend and frontend locally |
| `bin/generate-env.sh` | writes the frontend `.env` |
| `bin/deploy-backend.sh` | Terraform apply for Lambda and RDS |
| `bin/deploy-frontend.sh` | builds and pushes to S3 and CloudFront |
| `bin/proxy-server.js` | CORS-enabled local proxy |
| `bin/cleanup-environment.sh` | tears it all down |

---

## 13. Security

It is a bank. These are cheap and they get noticed.

- **Hash passwords with PBKDF2-HMAC-SHA256**, high round count, random per-user salt,
  stored as one self-describing string carrying algorithm, cost, salt and key. The
  instinct to "just use SHA-256" is wrong; a plain hash is built to be fast, and fast is
  what an attacker wants. Slow is the feature. Use bcrypt or argon2 if a dependency is
  allowed.
- **The generated password is six characters, which is weak.** That is what the
  requirement says, so implement it, then force a change on first login and say out loud
  in the demo that the generated credential is a single-use enrolment secret rather than
  a password. Naming the weakness reads better than hoping nobody asks.
- **Compare secrets with a constant-time function**, not `==`. Normal equality returns
  as soon as it finds a difference, so timing leaks how much of a forged value was right.
- **One answer for every auth failure.** Malformed, forged, expired, wrong password: the
  same 401 with the same message. Telling an attacker which part was wrong tells them
  what to fix.
- **JWTs are signed, not encrypted.** Anyone holding one can read the payload. Nothing
  sensitive goes in it, and salary never does.
- **Generate the signing key on first run into a gitignored `.env`.** Without that, every
  restart signs everyone out and somebody will skip the setup step.
- **Secrets never enter the repo.** `.env`, `*.tfstate`, `.terraform/`, `node_modules`,
  `.venv` all in `.gitignore` before the first commit.

---

## 14. What they will ask you to do

From someone who has taken this workshop. Build toward these, because the examination is
part of the evaluation.

- Start your localhost in front of them and walk the app.
- Show your Postman collection or Swagger docs.
- Run your test suite while they watch.
- Explain the codebase end to end. Not line by line, but the whole path of one request.
- Answer questions about choices you made and why.

So:

- [ ] App starts cold in under a minute
- [ ] Postman collection generated from the route table, current, with failure cases in
      it. A collection of happy paths proves the endpoints exist; one with an
      over-allocation and an ownership violation proves the rules do.
- [ ] Test suite runs on one command and prints its count
- [ ] Each person can trace one request end to end out loud: route, auth check, service
      rule, repository, Postgres, response
- [ ] Each person can name the parts they did not write

**Take feedback visibly well.** Accept it, then say how you will implement it. Then
present to the whole class, not only in the one-on-one, and show three things: the
original, the notes you took on the criticism, and what you changed. Write criticism
down verbatim as you receive it.

### Demo rules

- **Demo the refusal, not just the action.** Assigning an employee changes a number.
  Trying to assign them a 41st hour and being refused shows the rule being enforced,
  which is the thing you actually built. Same for the dependency cycle and the delete
  that does not exist.
- **End on the invariant.** `GET /admin/capacity-check` returning zero violations across
  every employee is the strongest closing thirty seconds available.
- **Rehearse against the running app.** Walking the running order through the real API is
  how you find the hole where a screen has nothing on it yet, which is the kind of thing
  nobody notices from memory.
- Before the room is watching: the env var the demo needs is set on the presenting
  machine, exactly one server is running, and somebody knows a name to type into the
  search box.

---

## 15. Things to say about the limitations

Knowing a weakness reads better than defending it.

- A six-character generated password is weak by design of the requirement, mitigated by
  forced rotation on first login.
- A JWT cannot be revoked. Signing replaced storing, so there is no token table and
  nothing to revoke. Mitigation is a short expiry plus re-reading the role from the
  database on every request.
- Consumed cost derived from elapsed weeks is an approximation. Real time entry is the
  table that is already there and the next thing we would build.
- Lambda cold starts add latency on the first request after idle. Provisioned
  concurrency is the fix and it costs money, so it is a deliberate trade for a demo.

---

## 16. Deliberately not doing

Writing these down stops the team relitigating them and gives an honest answer when
asked.

- Refresh tokens and httpOnly cookie sessions
- Login rate limiting
- Email notifications on assignment or approval
- File attachments on projects
- Gantt drag and drop. The timeline is read only.
- Real time collaborative editing
- Multi-tenancy beyond the single ACME org
- Internationalisation

All the right end state. None of them in scope for three days.
