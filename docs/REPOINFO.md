# Interview prep: what to say about the ACME Project Tracker

What to say to the Citi evaluators (15 Oct) and in later job interviews. It covers what to
say, not what to run: the demo steps are in [GUIDE.md §3](GUIDE.md#3-the-5-minute-demo).

**Last checked:** 14 Oct 2026, evening, against branch `David` after the dashboard-graphs
final fix wave, the project-manager notifications and requests for everyone, and the overtime warning: 506 backend
tests, 302 website tests, 22 Playwright tests. AWS was last checked at `a52da44`. Everything built since is committed
but **not on AWS until the next deploy**: the login-timing fix, the Hours and Minutes boxes,
the **Copy username and password** button, the pull board, the bell's 10 s check with its
pop-up, the three charts, the project manager being notified of an employee's project
work, and requests for everyone (migration 003). Every number below says when it was measured. Every claim
points at a file and line you can open.

**Contents:** [1 Pitch](#1-the-pitch) · [2 Seven questions](#2-the-seven-questions) ·
[3 Architecture](#3-architecture) · [4 Data and tables](#4-where-the-data-lives-and-the-10-tables) ·
[5 Database](#5-database-design) · [6 Security](#6-security) · [7 Testing](#7-testing) ·
[8 Performance](#8-performance) ·
[9 Stories](#9-three-things-that-went-wrong) · [10 Question bank](#10-the-question-bank) (14 Oct meeting questions and the security table are at its top) ·
[11 Say this, not that](#11-say-this-not-that) · [12 Gaps and AI](#12-honest-gaps-what-id-do-next-and-ai-use) ·
[13 Cheat card](#13-cheat-card)

---

## 1. The pitch

### 30 seconds

> "I built a project tracker for a fictional company, ACME, in three days. It's a
> portfolio and resource-management tool, closer to Float or Harvest Forecast than to
> Jira. It answers the client's seven questions: project status, which projects are at
> risk, who is working where, deliverables, who is over-allocated, dependencies and
> budget. Each answer is on a screen, backed by an endpoint. It's React and Material UI
> on the front end, and one Python Lambda with Postgres behind it, all deployed to AWS
> with Terraform. There are 506 backend tests running against a real Postgres database,
> and 302 website tests."

### 2 minutes

Add these, in this order:

1. **The framing.** "Jira tracks work inside one project. ACME's questions cut across
   projects, like 'who is over-allocated across all of them?'. So the manager lands on a
   dashboard, then an allocation grid of people by week. Tasks only exist so that
   deliverable progress is a measured number rather than a guess."
2. **The shape.** "There's one Lambda. Inside it, `api/` handles HTTP, `services/` holds
   the business rules, `store/` owns the database connection and transactions, and
   `domain/` holds shared things like errors, money and dates. Dependencies only point
   downward."
3. **Rules you can watch being enforced.** "Postgres refuses what a constraint can
   express, like a 41-hour booking or approving your own time. The services handle rules
   that need the clock, a sum or the caller, like weekly capacity. And five integrity
   queries check what neither can stop on its own. They run after the database tests and
   on a live admin endpoint."
4. **Every change is audited.** "Every successful write records one audit row with the
   before and after state, in the same transaction, and notifies the people above
   whoever made the change (an admin's change notifies the other admins)."
5. **What AWS taught me.** "Deploying to AWS showed me two problems that local testing
   never would have: a queue of cold starts, and CloudFront rewriting my 404s." (Pick one
   from [§9](#9-three-things-that-went-wrong).)

---

## 2. The seven questions

| # | Client question | Screen | Endpoint |
| --- | --- | --- | --- |
| 1 | Status of each active project | Dashboard cards, Projects list | `GET /dashboard/projects`, `GET /projects` |
| 2 | Projects at risk of missing deadlines | Dashboard, at risk first, with reasons in words | `GET /dashboard/projects`, `GET /dashboard/at-risk` |
| 3 | Resource allocation across projects | Allocation grid (people by week) | `GET /dashboard/allocation` |
| 4 | Key deliverables and completion | Project page, Deliverables tab | `GET /projects/{id}/milestones` |
| 5 | Over-allocated team members | Allocation grid, "Only over-allocated" | `GET /dashboard/allocation?overOnly=true` |
| 6 | Dependency chain between deliverables | Dependency view | `GET /projects/{id}/dependency-graph` |
| 7 | Budget consumed versus planned | Budget bar (dashboard card, Budget tab) | `GET /dashboard/projects`, `GET /projects/{id}/budget` |

Source: `README.md:15-23`.

**The framing, in one line:** "It's resource management, the kind of thing Float or Harvest
Forecast does, not a task tracker. Questions 3 and 5 span every project, so no single
project's view could answer them." The allocation grid is organisation-wide for every
manager and admin (`services/dashboard.py:195-225`).

**Words from the brief on screen:** the `milestones` table shows as "Deliverables", and
bookings show as "Resources", so evaluators can tick items off without translating.

---

## 3. Architecture

**Say this out loud:**

> "One Lambda, four folders: `api` handles HTTP, `services` holds the rules, `store` owns
> the connection and transactions, and `domain` holds the shared vocabulary: errors, money
> and dates. Dependencies only point downward, and nothing below `api` knows HTTP exists."

**The request path:**

```
browser -> CloudFront (/api/tracker*) -> Lambda Function URL
  -> function.py   reuse the warm connection; migrate once per cold start
  -> api/          parse the event, normalise the path, match the route table,
                   check the token, re-read the role from the database, map errors to status codes
  -> services/     the business rules, plus their SQL (run through store's helpers)
  -> store/        connection, atomic() transactions, migrations, integrity queries,
                   database errors -> domain errors
  -> PostgreSQL    named constraints refuse bad rows
  domain/          errors, money, clock, values: used by every layer, imports only itself
```

**How to describe it accurately:**

- **Say "dependencies only point downward".** Don't say "each layer only calls the one
  below it". That isn't true:
  - `api/app.py:17` imports `store.postgres.translate_errors` directly;
  - services run SQL themselves (81 `conn.execute` calls across 13 service files).
- **`store/` is not a repository layer.** It provides the connection, transactions and the
  `insert`/`update` helpers (`store/postgres.py:76-97`) and `atomic()` (`:100-104`).
- **What shows the separation is the import direction.** No module under `services/`,
  `store/` or `domain/` imports `api`. `domain/` imports only itself, and `store/` imports
  only `domain/` (checked with grep on 14 Oct). No test enforces this yet.
- **Note:** since 14 Oct, `README.md:37-47` and GUIDE §6 and §8 use this same wording:
  `function.py`, then `api/`, `services/`, `store/`, Postgres underneath, and `domain/`
  shared by every layer.

**Point at:** `backend/tracker/function.py:58-71`, `api/app.py:36-49` (`dispatch`),
`api/routes.py:126` (`match`), `api/errors.py:17-41`.

---

## 4. Where the data lives, and the 10 tables

**Say this out loud:**

> "All the data lives in PostgreSQL, and nowhere else. Ten tables for the app, plus one
> the migration runner keeps for itself."

**Three copies of the database:**

| Copy | Where | Used for |
| --- | --- | --- |
| Aurora PostgreSQL 17.7, Serverless v2 | AWS, private network; 0 to 4 capacity units, pauses when idle (`infra/rds.tf:11-13, 26-27`) | The live site |
| PostgreSQL 18, database `postgres` | The VDI | Development and the local demo |
| `tracker_test` (plus three scratch databases) | The VDI | Tests only; each test is rolled back |

**What is not in the database:**

- **The Lambda keeps nothing.** Its copies don't share memory and can be wiped at any time.
- **The browser keeps only the login token,** in sessionStorage.
- **The token-signing key and the first admin's password** are Lambda environment
  variables that Terraform generates (`infra/secrets.tf`). They are never in the repo.

**The stack:**

```
Browser (React + Material UI)
  -> CloudFront (one HTTPS address)
       -> S3         the website files
       -> Lambda     /api/tracker/*: Python 3.13, ONE function, 512 MB,
                     a plain handler(event, context), no framework,
                     psycopg 3 the only library, one database connection
                     per Lambda copy, reused (function.py)
            -> Aurora PostgreSQL
All of it is built by Terraform (infra/).
```

**Inside the Lambda** (`backend/tracker/`):

| Folder | What's in it |
| --- | --- |
| `function.py` | The entry point: the connection, and migrations on cold start under a lock |
| `api/` | `routes.py` (all 66 routes and their roles), `app.py` (auth), `errors.py`, `handlers.py`, `http.py` |
| `services/` | Every business rule, one file per subject |
| `domain/` | Errors, money, clock, values: shared by every layer |
| `store/` | `postgres.py` (connection and `atomic()`), `migrate.py`, `integrity.py`, `migrations/001_init.sql`, `migrations/002_task_limit.sql` |

Dependencies only point downward: `api` to `services` to `store` to Postgres, and every
layer uses `domain`.

**The ten tables**, all in `store/migrations/001_init.sql`, plus one later column, `users.task_limit`, in `002_task_limit.sql`:

| Table | One row is | On screen |
| --- | --- | --- |
| `users` | A person: name, email, role, line manager (`manager_id`), salary in cents, weekly capacity, overtime flag, password hash | People |
| `projects` | A project: its manager, dates, budget in cents, status | Projects |
| `assignments` | A person booked on a project for N hours a week between two dates | Resources |
| `milestones` | A deliverable: due date, and its sign-off (`completed_at`, `completed_by`) | Deliverables |
| `milestone_dependencies` | "A depends on B", both in the same project | Dependency view |
| `tasks` | A work item: estimate in minutes, assignee, status (`TODO`, `IN_PROGRESS`, `DONE`) | Tasks under a deliverable |
| `time_entries` | Logged time: date, minutes, note, the hourly rate frozen when logged (`hourly_rate_cents`), status (`PENDING`, `APPROVED`, `REJECTED`) | My tasks, Approvals |
| `project_requests` | A request of one `kind`: a manager asks the admins for a new project (`created_project_id` once approved) or to archive one (`project_id`); an employee asks their line manager for a higher task limit (`task_limit`) or overtime; either asks anything else. The decision, by whom, and its note | Requests |
| `audit_log` | One row per change: who, their role, the action, which record, before and after (JSONB), a one-line summary | Audit log |
| `notifications` | One per person told, per audit row; read or unread | The bell |

The database holds 11 tables: `store/migrate.py` creates `schema_migrations`, which
records which SQL files have run.

**How they link:**

```
users ─┬─ manages ─► projects ─┬─► assignments (person × hours/week)
       │                       └─► milestones ─┬─► milestone_dependencies (A needs B)
       │                                       └─► tasks ──► time_entries
       ├─ line manager of ─► users (manager_id points back at users)
       └─ asks ─► project_requests ──(when approved)──► a new or archived project,
                                                          or the asker's task limit / overtime
every change ──► audit_log ──► notifications (one per person told)
```

**The rules Postgres holds** (counted from `pg_constraint` on 14 Oct):

| What | How many | Example |
| --- | --- | --- |
| CHECK rules | 47 | A booking is 1 to 40 h/week; a budget can't be negative; you can't approve your own time |
| Foreign keys (links between tables) | 27 | A task must belong to a real deliverable |
| Primary keys | 11 | One per table, `schema_migrations` included |
| UNIQUE | 5, plus a unique index on `lower(email)` | A username is used once; two people can't share an email, whatever the capitals |
| Exclusion constraint | 1 (`assignments_no_overlap`) | The same person can't be booked twice on the same project for overlapping dates |
| Triggers | 10 | DELETE is refused on 9 tables; `audit_log` refuses UPDATE and DELETE |
| Migration files | 2 | `001_init.sql`, then `002_task_limit.sql` (adds `users.task_limit`, CHECK 1 to 10) |
| Integrity queries | 5 | No dependency loops, no time logged outside a booking, ... (`store/integrity.py`) |

**Questions they'll likely ask about the tables:**

- *"Why `milestones` and `assignments`, when the screen says Deliverables and Resources?"*
  The tables use the technical words. The screens use the brief's words, so evaluators
  can tick them off.
- *"Where's the deliverable's status column?"* There isn't one, on purpose. Progress and
  status are worked out from the tasks and dependencies every time, so they can never be
  out of date. Only the manager's sign-off is stored. *`services/milestones.py:1-16`*
- *"Why do `tasks` and `time_entries` repeat `project_id`?"* So Postgres itself guarantees
  a task's project matches its deliverable's. The foreign key covers the pair
  (`milestone_id`, `project_id`), and for time, (`task_id`, `project_id`).
  *`001_init.sql:106, 145-146, 152, 172-173`*
- *"Why store `hourly_rate_cents` on each time entry?"* It freezes the rate at the moment
  of logging, so a later raise doesn't rewrite past cost. *`001_init.sql:166`*
- *"How do you delete something?"* You don't: you archive. Users, projects, bookings,
  deliverables, dependencies and tasks have `is_archived`; time is rejected, not removed;
  the audit log and notifications only grow. A trigger refuses DELETE on all ten.
  *`001_init.sql:240-255`*
- *"Why TEXT with a CHECK instead of an ENUM for status?"* Postgres has no
  `CREATE TYPE ... IF NOT EXISTS`, and adding a value to a CHECK is one simple
  migration. *`store/postgres.py:23-50` maps each CHECK's name to a message*
- *"Why integers for money?"* Whole cents mean no rounding errors. *`domain/money.py`*

---

## 5. Database design

**Headline:** "Postgres is the backstop for anything a constraint can express. Everything
else lives in the services. Five integrity queries catch what neither can prevent."

**Supporting points:**

- **Money is integer cents.** Every `*_cents` column is BIGINT (`001_init.sql:16, 46,
  166`). `domain/money.py` holds the formulas. The dashboard repeats them in SQL so that
  it can total every project in one query (`services/dashboard.py:52-58`), so don't
  say "only one module does money maths".
- **Postgres refuses** a negative budget (`:56`), a booking outside 1 to 40 h/week (`:75`),
  overlapping live bookings for one person **on the same project** (an exclusion
  constraint, `:78-80`), tasks and dependencies that cross projects (composite foreign
  keys, `:119-122, 145-146`), and approving your own time (`:179`).
- **The services enforce** weekly capacity and overtime (`services/time_entries.py:63-90`),
  no future dates, sign-off completeness, dependency loops and ownership.
- **Nothing is deleted.** A trigger refuses DELETE on every application table, and
  `audit_log` also refuses UPDATE (`001_init.sql:246-255`). You archive and reactivate
  instead.
- **The five integrity queries** (`store/integrity.py:10-79`) are: no dependency loops;
  nothing live under an archived project; every record has its CREATE audit row; no time
  logged outside a booking; no signed-off deliverable with unfinished work.

**If they push:**

- *"Is every rule in both places?"* No. Booking hours, date order and "can't depend on
  itself" are in both. Overlap and self-approval are database only. Capacity, sign-off
  and loops are services only.
- *"Why TEXT + CHECK, not ENUM?"* Postgres has no `CREATE TYPE ... IF NOT EXISTS`, and
  changing an enum needs `ALTER TYPE`. A named CHECK is just as strict, and its name maps
  to a friendly message (`store/postgres.py:23-50`).
- *"Why no ORM?"* I wanted every query visible, so I can explain it. Values are always
  parameters, and table and column names are built with `psycopg.sql`.
- *"Is DELETE refused on every table?"* Every application table. `schema_migrations` has
  no trigger, and row-level triggers don't fire on TRUNCATE.

**Point at:** `backend/tracker/store/migrations/001_init.sql`, `store/integrity.py`,
`docs/superpowers/specs/2026-10-13-database-design.md`.

---

## 6. Security

**Headline:** "There are two gates, and the role always comes from the database, never
from the token."

**Supporting points:**

- **Passwords:** PBKDF2-HMAC-SHA256 at 600,000 rounds (OWASP's 2023 figure), a 16-byte
  random salt and a constant-time compare (`services/passwords.py:18, 27-44`).
- **Unknown usernames cost the same as real ones** (fixed 14 Oct in the working tree; on
  AWS after the next backend deploy). When the username isn't found, login hashes the
  typed password once at the current round count and throws the result away, then gives
  the same 401 as a wrong password (`services/users.py:159-164`). Nothing is hashed at
  import, so cold starts stay fast. Test:
  `test_unknown_username_costs_the_same_hashing_as_a_wrong_password`
  (`tests/backend/test_users.py:110`). It counts the hashing work, not the clock, so it
  isn't flaky. Before the fix, the dummy hash had only 1,000 rounds and answered much faster.
- **Token:** a signed token (HS256 JWT, standard library only) that lasts 8 hours and
  carries only the user id (`services/tokens.py:20, 39-59`). Its secret is a Terraform
  `random_password` (`infra/secrets.tf:6`).
- **Gate 1, the route table:** a role that may never do something gets a 403
  (`api/routes.py`, checked at `api/app.py:31-32`).
- **Gate 2, the services:** they check ownership. A project you can't see answers 404 with
  wording byte-identical to a missing one, so nobody can probe ids
  (`services/access.py:17-27`; test `test_api.py:163-167`).
- **The role is re-read on every authenticated request** with one primary-key lookup, so a
  demotion or an archive takes effect on the next request (`api/app.py:22-33`;
  `services/actors.py:46-55`; test `test_api.py:145-152`).

**If they push:**

- *"So timing can't reveal usernames at all?"* Both paths now do one PBKDF2 at 600,000
  rounds. One limit: if the round count is raised later, users with older hashes still
  verify at the old count, so a wrong password for them would be cheaper. Not the case
  today. Not yet timed on AWS.
- *"No refresh token?"* It's deliberate. Re-reading the role already gives fast
  revocation, and a refresh token would add storage, rotation and revocation for no
  benefit at this size.
- *"Does a password change end old sessions?"* No, a known gap. Until the user changes a
  reset password, an old token can only reach `/auth/me` and change-password, which asks
  for the current password, the one the admin just generated (`services/users.py:180`).
  Once the user has changed it, an old token works fully again until it expires (up to
  8 h): the token carries only the user id, and `verify` checks the signature and expiry,
  never when it was issued (`services/tokens.py:47-59`). Archiving the user kills every
  token at once. The fix: a `password_changed_at` column, and refuse tokens issued before
  it. (Read from the code, not tested.)
- *"Can a stolen session change the email?"* Yes, a known gap: `update_self` changes the
  email with no current-password check (`services/users.py:210-221`). Harmless today,
  because nothing is ever emailed; it matters once an emailed reset exists. The fix: ask
  for the current password, or notify the old address.
- *"Any string-built SQL?"* Four queries use f-strings, but only to join **constant** SQL
  fragments. Values are still parameters (`services/milestones.py:77`;
  `services/tasks.py:227, 233, 240`). bandit reported no issues locally on 14 Oct, with two
  `# nosec B105` false positives on the key `must_change_password`.
- *"Can a manager see salaries?"* No. A manager who books someone could work out their rate
  from the planned cost, and the README says so (`README.md:356-357`).

**Point at:** `backend/tracker/api/app.py:22-33`, `services/access.py`,
`services/passwords.py`, `services/tokens.py`.

---

## 7. Testing

**Headline (fresh, 14 Oct 2026):** "506 backend tests against a real Postgres database, at
96% coverage, with the API layer at 100%. Plus 302 website tests at 94.78% of
statements, and 22 Playwright browser tests."

**What (three layers, plus the website):**

| Layer | What it proves | How | Point at |
| --- | --- | --- | --- |
| 1. Database | Postgres refuses bad rows | One test per named constraint; a DELETE test for every application table | `tests/backend/test_schema.py`, `test_no_delete.py:31-46` |
| 2. Rules | Each business rule behaves as specified | Calls the services directly; never imports `api` | e.g. `tests/backend/test_work.py` |
| 3. API | All 66 routes respond correctly | **In-process:** a Lambda-shaped event goes into `app.dispatch()`. Two walk tests fail if any route other than login is missed | `test_api_read_walk.py:112-114`, `test_api_audit_walk.py` |
| Website | Screens behave correctly | Vitest + React Testing Library, with `fetch` stubbed (no database) | `frontend/src/**/*.test.jsx` |
| Browser | The demo works in a real browser | Playwright: 22 tests in 8 files (one only takes README screenshots) | `frontend/e2e/` |

- Each database test runs inside a transaction that is rolled back. After each one, the
  integrity check runs, except in tests marked `no_integrity_check` and pure unit tests;
  schema tests skip the audit-row query (`tests/backend/conftest.py:44-62`).
- **Fresh numbers, 14 Oct (after the overtime warning):** backend `506 passed in 19.44s`;
  coverage `1920 statements, 68 missed, 96%`. By folder: `api/` 100%, `function.py` 100%,
  `domain/` 99%, `services/` 95.5%, `store/` 93.9%. Website: 31 files, `302 passed`, about
  a minute and a half. Website coverage: 94.78% of statements, 95.88% of lines, 91.24% of
  branches, 90.47% of functions. Lint: clean.
- **Against AWS, 14 Oct:** `demo.spec.js` gave 2 passed in 7.0 s (recorded in
  `docs/DEMO-RUNBOOK.md:308`; not rerun for this check). Playwright was not rerun after the
  later 14 Oct changes; none of its tests log time, type an estimate or click Copy.

**Why this way:** the rubric asks for 80% overall and 90% on API and error paths. Real
Postgres catches what mocks can't: constraint names, the exclusion constraint, and
transactions.

**Why not more:**

- Most of the uncovered 4% is repeat guards: already archived, not found, nothing to change.
- **But five real rules have no test:**
  - reactivating a signed-off deliverable clears its sign-off (`milestones.py:197`);
  - adding a dependency on unfinished work clears a sign-off (`milestones.py:291`);
  - reactivating an unfinished task under a signed-off deliverable clears it (`tasks.py:215`);
  - archived deliverables can't take part in dependencies (`milestones.py:268`);
  - you can't demote a manager who still runs live projects (`users.py:239`).
- The service's "can't depend on itself" check (`milestones.py:266`) is untested, but
  the database's own CHECK for the same rule is (`test_schema.py:167`).
- The database going down mid-request is untested (`store/postgres.py:121`). The
  cold-start 503 is tested (`test_function.py:61`).
- The two pull-board row locks (claim) are tested under a race, on separate connections
  (`tests/backend/test_claim_race.py:92, 101`). The **other** concurrency guarantees have
  no test: the capacity row lock, the exclusion constraint under a race, and the advisory
  lock rest on Postgres guarantees and one AWS observation.
- **No browser test logs time and approves it.** That journey is covered by website tests
  with the API faked (`MyTasksPage.test.jsx:47`, `ApprovalsPage.test.jsx:35`) and by
  backend tests (`test_work.py:248`, `test_schema.py:212`).

**If they push:** *"Real HTTP?"* The 66-route walk is in-process. Real HTTP is exercised by
`tools/demo.py` and Playwright, through CloudFront on AWS.

**Re-check before quoting** (each runs on the VDI from the repo folder):

```sh
cd ~/DavidCitiProject
.venv/bin/pytest -q
(cd frontend && npm test)
```

---

## 8. Performance

**Headline:** "On AWS, 25 simultaneous users got 539 requests a second, and every
endpoint's 95th percentile was 65 ms or less (13 Oct)."

**Supporting points:**

- 16,184 requests at 25 users. p95 was 57 to 65 ms per endpoint (`README.md:276`).
- Inside the Lambda, a warm request takes **6 ms at the median and 13 ms at p95**, from
  the CloudWatch REPORT lines (`README.md:278-279`).
- A login takes about 1.1 s whatever the load: p50 1.11 s, p95 1.13 s at 512 MB. That's
  on purpose, because the password hash is deliberately slow (`infra/lambda.tf:11`).
- The dashboard costs a fixed number of queries however many projects there are. Money is
  one query using `project_id = ANY(...)` (`services/dashboard.py:48-62, 135-151`). This is
  plausible from the code, but no test counts the queries.
- A paused Aurora takes about 15 s to wake (the first login on 13 Oct took 15.9 s;
  `min_capacity = 0`, `infra/rds.tf:27`), so I warm it up before a demo.

**The two caveats, say them before they ask:**

1. **It was reads plus logins, no writes** (6 GET endpoints, `tools/loadtest.py:27-28`),
   on tiny seed data: 3 live projects and 6 people (`tools/demo.py:32-39`). The figures
   are recorded in the README.
   There are no raw logs in the repo, so the numbers can't be reproduced from it.
2. **2 of the 16,184 requests got no response** (status 0), and the Lambda logged no error.
   That is unexplained (`README.md:255-256`).

**If they push: "What breaks at 10x?"**

1. **Connections.** One Postgres connection per Lambda instance, with no RDS Proxy.
2. **Dashboard.** It computes every project in scope, then pages in Python, because "at
   risk first" is sorted in Python (`dashboard.py:150-151`).
3. **Allocation grid.** It computes every employee-by-week cell just to sort by worst week.
4. **Growth.** The audit and notification tables grow without limit.
5. **Aurora's cap** of 4 capacity units, and the CPU-bound login.

Fixes: RDS Proxy, a stored risk flag that SQL can sort, pre-aggregated weekly bookings, and
more Lambda memory.

Also: **not every list is paginated in SQL.** Bookings, deliverables, tasks and My tasks
return the whole list in a one-page envelope (`_whole`, `api/handlers.py:51-54`).

**Point at:** `README.md:269-290`, `tools/loadtest.py`, `services/dashboard.py`.

---

## 9. Three things that went wrong

Each takes about 90 seconds. **Lead with story A:** it has real numbers, it only showed up
on AWS, I found it by measuring, and it ends with a fix and a test.

### A. The cold-start staircase (lead with this one)

- **Situation:** "I load-tested the AWS deploy with 25 simultaneous users. Throughput was
  fine, but the slowest requests took 7 to 11 seconds end to end."
- **What I noticed:** "In the CloudWatch logs, the cold starts formed a staircase: 1.3,
  2.4, 3.4, 4.5 seconds, up to 9.8, each about 1.07 s after the one before. A queue."
- **What I did:** "Every cold start runs migrations under a Postgres advisory lock, so two
  starts can't migrate at once. Inside that lock, each one re-hashed the first admin's
  password at 600,000 rounds, about a second, even though the admin already existed. So
  they queued one behind another. I changed it to check whether the admin exists before
  hashing (`services/users.py:112-113`), and added the test
  `test_bootstrap_admin_skips_the_hash_once_the_admin_exists`."
- **Result:** "After the fix, 25 simultaneous cold starts each answered in 0.17 to 0.30 s
  (13 Oct, recorded in the README)."
- **Why it mattered:** "The lock times out at 10 seconds (`store/migrate.py:51`), and then
  the cold start answers 503. The 9.8 s step was 0.2 s from that limit, so a bigger burst
  would have started failing."
- **What it taught me:** "Never do slow work inside a lock. And deploy early, because
  local testing would never have shown this."

### B. CloudFront rewrote my 404s

- **Situation:** "The workshop's Terraform came with a CloudFront rule for single-page
  apps: any 404 becomes `/index.html` with status 200."
- **What I noticed:** "Reading the Terraform before deploying, I saw that the rule covered
  the whole distribution, API included. My 'not found or not yours' 404 would turn into a
  200 carrying HTML. I wrote that prediction into my notes before the first deploy."
- **What I did:** "The deploy confirmed it. No `index.html` was uploaded yet, so S3
  answered with a 403 AccessDenied XML page instead of my JSON 404. I removed the rule
  (`infra/cloudfront.tf:42-45`) and switched the website to hash links (`/#/projects/7`),
  so the server only ever serves `index.html` (`frontend/src/App.jsx:85`)."
- **Result:** "API 404s come through intact, and refreshing a deep link works. A Playwright
  test checks that (`frontend/e2e/tour.spec.js`)."
- **What it taught me:** "Read the infrastructure code you inherit, and check predictions
  against the real deploy."

### C. The writes that would never have committed

- **Situation:** "I chose psycopg, the Python Postgres driver, and its default
  `autocommit=False`."
- **What I noticed:** "With that default, the first read quietly opens a transaction, and
  every later transaction block becomes a savepoint inside it. So a write that follows a
  read never commits. And the normal tests roll everything back anyway, so they could
  never see it."
- **What I did:** "I turned autocommit on and wrapped every multi-statement write in one
  explicit `atomic()` (`store/postgres.py:1-7, 71, 100-104`). Then I added
  `tests/backend/test_store_commits.py`, which commits on a separate database and checks
  the result from a second connection."
- **Result:** "It was caught at design time, not in production. The database spec
  records reproducing it on 13 Oct: 0 rows visible from a second connection."
  (`docs/superpowers/specs/2026-10-13-database-design.md:190-193`)
- **What it taught me:** "A test suite has blind spots built into how it runs. Write a test
  aimed at the blind spot."
- **Careful:** don't claim "a review caught it" as something git can show: it shipped
  inside the first backend commit. And marking notifications read is a single autocommit
  UPDATE outside `atomic()`, which is safe because it's one statement. So say "every
  multi-statement write", not "every write".

---

## 10. The question bank

Short answers. Paths are under `backend/tracker/` unless they say otherwise.

### Questions from the 14 Oct meeting

David's meeting notes asked for these answers in one place. Each says plainly whether it is
**built** or **queued** (planned, not built). Counts measured 14 Oct 2026 on the VDI.

1. **"Which tests do you use, and why?"** Built. Five kinds, one per layer: database rule
   tests, business-rule tests, API tests (all pytest, against a real Postgres), website
   tests (Vitest with React Testing Library), and browser tests (Playwright). Today:
   **506 backend, 302 website, 22 Playwright** (`.venv/bin/pytest -q`, `npx vitest run`,
   `npx playwright test --list`). *Point at: `docs/TESTING.md` section 1 (table of kinds, commands, counts)*
2. **"What does each coverage number mean?"** Coverage is the share of our code the tests
   ran; it shows what ran, not what was checked. Backend **96% of statements** (94% with
   branches), the API layer 100%. Website **94.78% statements, 95.88% lines, 91.24% branches,
   90.47% functions** (`docs/TESTING.md` figures, re-measured on 14 Oct after requests for everyone). Browser tests
   and load tests get no percentage, on purpose: their measure is journeys walked, and speed
   and failures. *Point at: `docs/TESTING.md` section 2*
3. **"Selenium or Playwright?"** Playwright. It waits by itself for a button to be clickable
   (Selenium makes you write the waits, the usual cause of flaky tests), talks to the browser
   directly, has a trace viewer for failures, and installs all browsers with one command.
   *Point at: `docs/TESTING.md` section 5*
4. **"k6 for performance testing?"** Yes, built 14 Oct: `tools/k6/load.js` (k6 v2.2.0). Each
   virtual user logs in once and loops over a manager's eight reads, then 20 logins go out ten
   at a time. Thresholds in the script: under 1% failed, reads p95 under 1 s, logins p95 under
   3 s (PBKDF2 is slow on purpose). Local run, 10 users: 4,038 requests in 107 s, 0 failed,
   reads p95 67 ms, logins p95 1.3 s. Not yet run on AWS (`K6_PROFILE=aws`, 25 users). The
   earlier Python script, `tools/loadtest.py`, measured AWS on 13 Oct: 25 users, 16,184
   reads, 539 requests per second, p95 57 to 65 ms, 2 failures.
   *Point at: `tools/k6/load.js`; `docs/TESTING.md` section 7*
5. **"Why Vite?"** David chose it: the dev server reloads on save and the production build
   takes seconds. Vitest, the test runner made for Vite, reuses the same config, so tests
   see the code exactly as the app does. Built. *Point at: `frontend/vite.config.js` (the `test:` block); `docs/TESTING.md` section 5*
6. **"How fast are notifications, and why not WebSockets?"** Built 14 Oct, local until the
   next deploy. The bell asks the server every 10 s while the tab is visible (about 6 tiny
   reads a minute), straight away when you return to the tab, and after any change made in
   that tab. When the count goes up, a pop-up shows the newest message. WebSockets are
   blocked, not skipped: our AWS role has no API Gateway permission, and the Lambda sits in a
   network with no route out to send a push. *Point at: `frontend/src/components/NotificationBell.jsx:7-9` and `:30-72`; `docs/superpowers/specs/2026-10-14-websockets-findings.md` section 1*
7. **"If Chloe logs hours or finishes a task, is her manager told?"** Yes. For an employee,
   `record_change` notifies her line manager, every admin and, when the change is to a
   project's work (a task, logged time), that project's manager too. Chloe reports to Sam,
   so Sam's bell goes up; if the task is on Maria's project, Maria's does as well. Someone
   who is both is told once. The project manager was added on 14 Oct after this meeting. *Point at: `services/audit.py:42-51` (the recipient rule) and `:55-70` (finding the project's manager); `tests/backend/test_audit.py` (the four project-manager tests); `tools/demo.py:37`*
8. **"Does every action make a notification?"** Every successful change writes one audit
   row and notifies the people above the actor (employee: line manager, admins and, for project work, the project's manager; manager:
   admins; admin: the other admins). A decision on a request also notifies whoever asked
   (`also_notify`). Reads and refused requests are not logged. One test
   calls every write route and checks it left an audit row. *Point at: CLAUDE.md section 2 table; `tests/backend/test_api_audit_walk.py`*
9. **"What if someone steals the access token? A 15-minute timer?"** Today: the token lasts
   8 hours, carries only the user id, and the role is re-read from the database on every
   request, so archiving a user or demoting them takes effect at once. The gap: there is no
   refresh token and no revoke, so a stolen token works until it expires, and a password
   change doesn't end old sessions. **Queued, not built:** a 15-minute access token plus a
   refresh token stored in Postgres. *Point at: `services/tokens.py:20, 47-59`; `api/app.py:22-33`*
10. **"Total number of projects?"** Built. The dashboard's first counter, "Projects shown",
    is the server's count for the current search and status filter (all of them when no
    filter is set). "At risk" beside it counts only the cards on the current page. The budget
    chart sits under the counters. *Point at: `frontend/src/pages/dashboard/DashboardPage.jsx:150-153`*
11. **"How can you delete projects?"** You can't, by design: an admin archives (and can
    reactivate), and a Postgres trigger refuses any DELETE on every application table. The
    rubric's D in CRUD is met by archive; we haven't yet asked an evaluator whether that
    counts. **Built 14 Oct (not on AWS until the next deploy):** a manager asks an admin to archive a project from the Requests page; approving runs the same `archive_project`. *Point at: `store/migrations/001_init.sql:239-255`; `api/routes.py:66`; `services/requests.py` (`_apply`)*
12. **"History for employees?"** Today an admin can open the audit log and filter by person,
    record type and date, with before and after state. **Queued, not built:** a History tab
    per person that their line manager can read. *Point at: `frontend/src/pages/audit/AuditLogPage.jsx:99-103`*
13. **"How are budgets calculated?"** Planned cost = booked hours per week, over the days of
    the booking, times the person's hourly rate (salary divided by 2,080 hours), added up per
    project. Spent = approved minutes times the hourly rate frozen on the entry when it was
    logged, so a later raise changes nothing. All in whole cents, computed on the server;
    the browser only formats. Pending time is shown separately and doesn't count as spent.
    *Point at: `services/dashboard.py:48-60` (the money query); `domain/money.py:9, 28-40`*
14. **"Fewer lines of code, faster?"** Honest numbers: about 3,600 lines of backend Python
    (not counting the vendored database driver) and 88 website source files. The website
    ships as one JavaScript file of 728 kB (`frontend/dist/assets`, built 14 Oct, after the
    charts). The server avoids one-query-per-row loops and every list is paginated.
    **Queued, not built:** splitting the bundle per page and a cleanup pass. *Point at: `frontend/dist/assets/index-*.js`; `services/paging.py`*
15. **"Guardrails: how do you know the requirements are met?"** Three layers: Postgres
    refuses bad rows (47 CHECK rules, 27 foreign keys, one exclusion constraint, 10
    triggers); five integrity queries must return no rows and run after every database test
    and at `GET /admin/integrity-check`; and the role table decides who may call what. The
    requirements are traced to screens and tests. *Point at: `store/integrity.py`; `docs/superpowers/specs/2026-10-14-requirements-check.md`*
16. **"How do I look inside the database?"** Local copy only (AWS Aurora is not reachable
    from outside, by design). VS Code PostgreSQL extension: Server name `localhost` (not the
    project name), port 5432, user `postgres`, password `postgres123`, database `postgres`.
    Terminal: `PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres`.
    *Point at: `docs/DEMO-RUNBOOK.md` section 5*
17. **"Postman or SwaggerHub?"** Neither. We use `tools/tracker.http` (19 read-only
    requests for VS Code's REST Client), `curl`, and `tools/demo.py`. There is **no
    OpenAPI/Swagger file**. The one route table is the place to generate one from. Not built. *Point at: `tools/tracker.http`; `backend/tracker/api/routes.py`*
18. **"How do you automate tests?"** Locally, one command: `./tools/test-all.sh` runs
    backend tests with coverage, bandit, website tests with coverage, lint and the build,
    then Playwright when ports 3000 and 3001 are up, and prints a PASS/FAIL table (about 2.5
    minutes). On GitHub, `.github/workflows/` has three workflows, all triggered on every
    push and pull request, and **none of them runs our pytest or Vitest**:
    - `python.actions.yml`: `bandit -r ./backend` (security scan only);
    - `react.actions.yml`: `npm install`, then `npm audit --audit-level=high`;
    - `terraform.actions.yml`: Checkov on `./infra`, with `soft_fail: true`, so it reports
      but never turns the check red.

    All three came with the workshop repo (first commit 13cf7a6). Putting our tests in CI
    needs a Postgres service in the workflow; not built. *Point at: `tools/test-all.sh`; `.github/workflows/`*
19. **"Lighthouse or an accessibility scan?"** Not built. Today: the website tests find
    things by role and label (so a missing label fails a test), fields are tied to their
    errors with `aria-describedby`, and the tour test checks the phone layout. There is no
    axe package in `frontend/package.json` and no scan in `frontend/e2e/`. An axe scan inside
    Playwright is queued. *Point at: `frontend/e2e/tour.spec.js`; `frontend/package.json`*
20. **"A schedule and project plan like Float?"** Mostly built. The **Schedule** screen is
    Float-style: people by weeks, a bar per booking in its project's colour ("Apollo · 25 h/wk"),
    over-booked weeks outlined in red with "+5 h over", a bar opens its project. It reads the
    allocation route, nothing new on the server. Colours are handed out once per visit, so past
    five projects a later page can show several in grey (each bar still names its project; the
    seed has fewer than six). The deliverables timeline shows each project's
    milestones against dates. Float has drag-to-schedule; we don't: bookings are edited in a
    form. *Point at: `frontend/src/pages/schedule/SchedulePage.jsx`; `frontend/src/components/charts/TimelineChart.jsx`*
21. **"If someone logs too many hours: warn them, let them go ahead, flag the manager?"**
    Yes, built 14 Oct (not yet deployed). Without overtime allowed, the first answer is a
    409 with `code: "OVER_CAPACITY"` ("This puts you 2 h over your 40 h week. Log anyway?
    Your manager will be told."). **Log anyway** resends with `confirmOverCapacity: true`:
    the entry is saved, marked "Over capacity" on My logged time and Approvals, and the
    notification to the line manager, project manager and admins ends "(2 h over capacity)".
    With overtime allowed it is saved unmarked and the week is flagged, as before.
    *Point at: `services/time_entries.py:63-90` (`_check_limits`)*

### Every security check, and where it came from

"Came with the workshop repo" means the file was in the template by Eugene Istrati
(`eistrati`, first commit `13cf7a6`, 9 Jan 2026), checked with `git log` on 14 Oct. "We
added" means David's commits. Line numbers are in the working tree on 14 Oct.

| Check | What it stops | Where | Origin |
| --- | --- | --- | --- |
| Bandit in CI | Known insecure Python patterns reaching `main` | `.github/workflows/python.actions.yml` | Came with the workshop repo; we keep the code clean for it |
| `npm audit` in CI | Known-vulnerable website packages (high severity) | `.github/workflows/react.actions.yml` | Came with the workshop repo |
| Checkov on Terraform | Risky infrastructure settings; reports only (`soft_fail: true`) | `.github/workflows/terraform.actions.yml` | Came with the workshop repo |
| Website private behind CloudFront | Anyone reading the S3 bucket directly | `infra/cloudfront.tf:1-4, 19` (origin access control) | Came with the workshop repo |
| HTTPS only | Plain-HTTP traffic: CloudFront redirects | `infra/cloudfront.tf:61, 96` | Came with the workshop repo |
| Database encrypted, in the VPC | Reading data at rest; direct internet access (no `publicly_accessible` setting, so AWS's private default; not re-checked from outside on 14 Oct) | `infra/rds.tf:20-22` | Came with the workshop repo |
| Secrets generated by Terraform | A guessable or committed signing key or admin password | `infra/secrets.tf:6, 14`; injected at `infra/locals.tf:115-116` | We added the token key and admin password. The template's database password is a `random_pet` name (`infra/rds.tf:15`) |
| Passwords hashed: PBKDF2, 600,000 rounds, random salt | A stolen database revealing passwords | `services/passwords.py:18, 27-44` | We added |
| Signed token (HS256), 8 h expiry | Forged or endless sessions | `services/tokens.py:20-22, 47-59` | We added |
| Role re-read from the database on every request | A demoted or archived person keeping access | `api/app.py:22-33`; `services/actors.py:46-55` | We added |
| Forced password change at first login | Using the admin-generated password for real work | `api/app.py:29-30`; `api/routes.py:49-50` | We added |
| 404, never 403, with identical wording | Probing which ids exist | `services/access.py:17-27` | We added |
| Unknown username costs the same hashing | Learning which usernames exist from reply time | `services/users.py:159-164` | We added (14 Oct; AWS after the next deploy) |
| Parameterised SQL only | SQL injection | `store/postgres.py`; bandit B608 clean | We added |
| No DELETE, append-only audit log | Erased records or history | `store/migrations/001_init.sql:239-255` | We added |
| Five integrity queries | Silently inconsistent data | `store/integrity.py`; `GET /admin/integrity-check` | We added |
| Field allow-lists | A caller changing fields their role may not | `domain/values.py:91` (`only_allowed`), used 17 times in `services/` | We added |
| Proxy forwards only listed headers | Browser and cookie headers reaching the Lambda (local only) | `bin/proxy-server.js:100-110` | Template file; we added the `authorization` and `content-length` lines |
| CORS | Which websites' scripts may call the API | Local proxy: `bin/proxy-server.js:39-43` (explicit header list, ours). AWS: Lambda URL allows every origin, `infra/lambda.tf:44-50` | Template. On AWS the site and API share one CloudFront address, so the browser never applies CORS to our calls |

**Known gaps (each checked against the code on 14 Oct):**

- Tokens survive a password change: they carry no issue time (`services/tokens.py:47-59`).
- No refresh token and no way to revoke one token; a stolen token works up to 8 hours.
- No rate limiting on login or anywhere else (no throttle in `backend/tracker/` or `infra/`).
- Changing your own email needs no current password (`update_self` in `services/users.py`).
- The Lambda URL itself has no authorisation (`authorization_type = "NONE"`, template); every
  route except health and login checks the token in our code instead.
- The database password is a `random_pet` name from the template, not a long random string.

### Product and scope

1. **"In one sentence?"** A portfolio and resource-management tool that answers ACME's
   seven questions, each on a screen backed by an endpoint. *`README.md:15-23`*
2. **"Why not a Jira clone?"** ACME's questions cut across projects. Tasks exist only to
   make deliverable progress measurable. *`services/dashboard.py:1-14`*
3. **"What did you cut?"** Clock in/out, pay periods and overtime premiums, because they
   are payroll, not cost against budget. Emailed password reset, because the workshop's
   AWS role has no email permission and the Lambda's network has no way out (answer 22a).
   *`store/migrations/001_init.sql:158-180` (no clock-in columns)*
4. **"How is 'at risk' decided?"** Four reasons, each shown in words: past the end date;
   an overdue deliverable; a deliverable more than 15 points behind its share of elapsed
   time; spend more than 15 points ahead of schedule. One function serves both screens.
   *`services/dashboard.py:29, 77-112`*
5. **"Why allow over-allocation?"** The client asked to *see* it. Refusing it would hide
   it. Bookings are allowed and flagged; logged time past capacity asks first, then is
   saved and marked if the person confirms (unless overtime is on, when it is just saved). *`services/assignments.py:1-7`; `services/time_entries.py:83-90`*

5a. **"Is this a push or a pull system? How does work get to people?"** Both. The manager (or an admin) creates each
   task, and can still assign it to someone booked on the project, even past that
   person's limit. A task left unassigned is Ready, and an employee booked on the project
   presses **Take this** (the pull board, **built 14 Oct**), up to a per-person limit their
   line manager sets (default 2). **Put back** returns it. Two row locks, task first and
   then person, stop two people taking one task and one person passing the limit, and the
   race tests prove both on separate connections. Nothing assigns work automatically.
   *`services/tasks.py:145-167` (claim), `170-186` (release);
   `tests/backend/test_claim_race.py:92, 101`;
   [pull board design](superpowers/specs/2026-10-14-pull-board-design.md)*

### Architecture

6. **"Walk me through one request."** See [§3](#3-architecture). *`function.py:58-71`;
   `api/app.py:36-49`*
7. **"Why one Lambda?"** One database, one rule set: one connection, one deploy, no
   duplicated code. *`infra/locals.tf` finds services by `backend/*/requirements.txt`*
8. **"How are the layers separated?"** By import direction: nothing below `api` imports
   it, and services raise domain errors that one table maps to status codes. No test
   enforces the direction yet. *`api/errors.py:17-29`*
9. **"What did Lambda change in your design?"** Nothing lives in memory. The JWT secret
   comes from Terraform, not "generated on first run", and locks live in Postgres.
   *`function.py:9-11, 60-63`; `infra/secrets.tf:6`*
10. **"camelCase versus snake_case?"** Converted only in `api/http.py` (incoming keys,
    and computed results such as the dashboard, `:33-48`) and `services/views.py` (each
    record's fields, by name).

### Database

11. **"Why integer cents?"** Floats can't hold 0.1 exactly. One module converts, and the
    API refuses `12.5` for a cents field. *`domain/money.py:12-30`;
    `frontend/src/services/format.js:29-34`*
12. **"What does the EXCLUDE constraint do?"** It refuses two live, overlapping bookings for
    one person on one project, even when two requests race. It needs `btree_gist`.
    *`001_init.sql:5, 78-80`; `tests/backend/test_schema.py:130, 142`*
13. **"Two managers book the same person at once?"** They must be on different projects,
    so both succeed and the grid flags the overload. On the same project, the constraint
    refuses the second. There is no parallel test. *`001_init.sql:78-80`;
    `services/access.py:43-50` (each manager changes only their own projects)*
14. **"Two time entries that together pass 40 h?"** `SELECT ... FOR UPDATE` on the
    person's row makes the second wait, then see the first, so an unconfirmed entry can't
    slip past. It's tested one request at a time only. *`services/time_entries.py:67, 80-90`*
15. **"Migrations on Lambda?"** One transaction under `pg_advisory_xact_lock` with a 10 s
    lock timeout. Each file's sha256 is recorded, and an edited old migration is refused.
    *`store/migrate.py:19, 50-53, 64-67`*
16. **"Why archive, not DELETE?"** Deleting would wipe logged hours, so past costs couldn't
    be rebuilt. Tests assert there is no DELETE route and that Postgres refuses DELETE. I'd
    ask whether archive counts as the D in CRUD. *`tests/backend/test_api.py:229-233`;
    `001_init.sql:240-255`; `tests/backend/test_no_delete.py:32, 37`*
17. **"Why freeze the rate on each time entry?"** So a later raise doesn't rewrite past
    spend. *`001_init.sql:166`; `services/time_entries.py:111-114`*
18. **"Who stops self-approval?"** Only the database: the `time_entries_not_own_approval`
    CHECK, mapped to 409. The service doesn't check it. *`001_init.sql:179`;
    `store/postgres.py:47`*

### Security

19. **"Why JWT, not sessions?"** Lambda instances share no memory. The token holds only the
    user id, and the role is re-read per request. *`services/tokens.py:39-59`*
20. **"Can you revoke a token?"** Archiving the user kills it at once. A reset doesn't:
    once the user sets a new password, an old token works again until it expires (see
    [§6](#6-security)). *`services/actors.py:50`; `api/app.py:29-30`*
21. **"Privilege escalation?"** Only admins create users or change roles. Nobody changes
    their own role or salary. *`services/users.py:224-230`; `api/routes.py:53-60`*
22. **"Where are the secrets?"** Terraform generates them and passes them in as Lambda
    environment variables. They sit in Terraform state, which I accept for a workshop.
    *`infra/secrets.tf:6, 14`*

22a. **"Why no email or SMS for new accounts or forgotten passwords?"** Two blockers. The
    Lambda runs on the organisers' role, which has no `ses:` (email) permission; our
    account could edit that role, but it's theirs, so I didn't without asking. And it sits
    in a private network (a VPC) with no NAT gateway and no private endpoint for email or
    SNS, and we aren't allowed to create either, so no email could leave anyway. So the
    admin sees the generated password once and can copy it, the person must change it at
    first sign-in, and a forgotten password is an admin reset. In production: a private
    endpoint to SES and a single-use, expiring set-password link, never the password.
    *`infra/lambda.tf:28, 32`;
    [email and SMS findings](superpowers/specs/2026-10-14-email-and-sms-findings.md)*

### API

23. **"Error contract?"** `{"error": "..."}`, plus `field` when one input is at fault. 400,
    401, 403, 404 (missing or not yours), 405, 409, 503; a crash is a 500 with a generic
    message, logged but never shown.
    *`api/errors.py:17-41`*
24. **"Audit atomic with the change?"** `record_change` runs in the same `atomic()`
    transaction. Integrity query 3 and a walk test over every write route catch a forgotten
    call. *`services/audit.py:29-52`; `tests/backend/test_api_audit_walk.py:17`*
25. **"Pagination?"** Top-level lists return `{items, page, pageSize, total, totalPages}`,
    capped at 100, paged in SQL except the dashboard (paged in Python to put at-risk
    first). Lists inside a project return the whole list in that same envelope.
    *`services/paging.py:12-26`; `services/dashboard.py:150-151`; `api/handlers.py:51-54`*

### Frontend

26. **"Why HashRouter?"** The server only ever serves `index.html`, so CloudFront needs no
    rewrite rule. *`frontend/src/App.jsx:85`*
27. **"Business rules in the browser?"** None. The browser only formats what the server
    computes, and the server is what refuses. Typed time goes in two boxes, Hours and
    Minutes; the browser checks whole numbers and the server's own limits (24 h logged,
    1,000 h estimate) only to show the error under the right box.
    *`frontend/src/services/format.js:18-42, 75-88`*
28. **"Real-time on Lambda?"** No websockets on Function URLs (and the workshop account blocks
    API Gateway's), so the bell polls every 10 s while the tab is visible, pauses while hidden,
    checks at once when you switch back, refreshes after your own writes, and shows a pop-up
    when the count rises. The Notifications page reloads itself on a change. Why not WebSockets:
    `docs/superpowers/specs/2026-10-14-websockets-findings.md`.
    *`frontend/src/components/NotificationBell.jsx:8, 91-104`*
29. **"Responsive?"** At 899 px and below, tables become cards and the sidebar a drawer. A Playwright
    tour fails on sideways scroll at 375 px. *`frontend/src/theme/responsive.js:4`;
    `frontend/e2e/tour.spec.js`*
29a. **"Why no chart library?"** The bundle was already 711 kB before the charts (re-measured
    14 Oct), and our three add about 18 kB (728 kB); a library would add more. No chart needed
    one. Each is boxes sized in percent. The server sends every percentage, so the browser
    never touches cents. The project colours failed a colour-blindness validator on the first
    try, so I changed them. *`frontend/src/components/charts/`;
    `frontend/src/theme/chartColours.js`*

### Testing, performance, process

30. **"What isn't tested?"** Concurrency outside the two claim row locks (the exclusion
    constraint and the advisory lock are not tested); the employee journey end to end; the
    database dropping mid-request; five real rules ([§7](#7-testing)); how it looks.
31. **"How do you know the tests test something?"** Each integrity query has a test that
    plants a violation. The cold-start fix shipped with a test that fails without it.
    *`tests/backend/test_integrity.py:35`*
32. **"Time zones?"** Lambda and Aurora run in UTC. "Today" and Monday-to-Sunday weeks come
    from one `America/New_York` constant. *`domain/clock.py:9, 17-24`*
33. **"What would you do differently?"** Deploy to AWS on day one, and write concurrency
    tests alongside the locking code. (I did that for the claim locks, `test_claim_race.py`,
    and not for the rest.)
34. **"A time you were wrong?"** I estimated a login at about 0.5 s at 512 MB; AWS measured
    1.15 s. The comment at `infra/lambda.tf:11` still says 0.5 s.

More, with longer answers: [GUIDE.md §8](GUIDE.md#8-questions-you-will-probably-be-asked).

---

## 11. Say this, not that

| Don't say | Say instead | Why |
| --- | --- | --- |
| "Every rule is enforced in two places" | "Postgres is the backstop for what a constraint can express; other rules live in services; integrity queries catch the rest" | Overlap and self-approval are database only; capacity, sign-off and loops are services only |
| "Each layer only calls the one below it" | "Dependencies only point downward" | `api/app.py:17` imports store; services run SQL |
| "Four layers: api, services, store, Postgres" | "api, services, store, plus domain shared by all" | `domain/` exists and every layer uses it |
| "Every API route is tested over HTTP" | "Every route is called in-process with a Lambda-shaped event; real HTTP is covered by the demo script and Playwright" | `test_api.py` calls `app.dispatch()` |
| "The uncovered 4% is only repeat guards" | "Mostly repeat guards, but five real rules are untested, and I can name them" | `milestones.py:197, 268, 291`, `tasks.py:215`, `users.py:239` |
| "The rule tests prove the layers are separate" | "The rule tests show services don't need HTTP; the import direction is what keeps them separate" | No test enforces imports |
| "Real Postgres, not mocks" (right after "302 website tests") | "The backend tests use real Postgres; the website tests stub `fetch`" | `README.md:230-231` |
| "No overlapping bookings for one person" | "No overlapping bookings for one person on one project" | Across projects is allowed: that's over-allocation |
| "The staircase went up to 11 s" | "Up to about 10 s in the logs (9.8 s)" | 7 to 11 s was the load-test client's `max` column |
| "6 ms inside the Lambda" | "6 ms median, 13 ms at p95" | `README.md:278-279` |
| "25 cold starts took 0.2 s each" | "0.17 to 0.30 s each" | `README.md:288-289` |
| "Every write is wrapped in atomic()" | "Every multi-statement write" | Marking notifications read is one UPDATE |
| "DELETE is refused on every table" | "On every application table" | `schema_migrations` has no trigger |
| "The integrity check runs after every test" | "After every database test" | Unit tests and `no_integrity_check` tests skip it |
| "Every list is paginated" | "Top-level lists are paged (in SQL, except the dashboard); lists inside a project come whole" | `_whole` in `api/handlers.py:51-54` |
| "Login timing is perfectly constant" | "An unknown username does the same hashing work as a wrong password; the test counts the work, not the clock" | `test_unknown_username_costs_the_same_hashing_as_a_wrong_password`; not timed on AWS |
| "The browser checks nothing" | "The browser checks only that typed time is whole numbers within the server's own limits, to point at the wrong box; the server still refuses" | `parseDuration`, `frontend/src/services/format.js:75-88` |
| "Only `money.py` does money maths" | "`money.py` holds the formulas; the dashboard repeats them in one SQL query" | `services/dashboard.py:52-58` |
| "No N+1, proven" | "Each screen uses a fixed number of queries; no test counts them yet" | No query-count test |
| "Tests were written first" | "Every behavioural fix ships with the test that fails without it" | Test-first can't be shown from the code |

---

## 12. Honest gaps, what I'd do next, and AI use

**Gaps and next steps, in order:**

1. A browser test of the employee journey: log time, then a manager approves it.
2. Concurrency tests for the exclusion constraint and the advisory lock (the two claim
   row locks are done).
3. Tests for the five untested rules, and for the database dropping mid-request.
4. RDS Proxy, and risk sorting in SQL so the dashboard pages in the database.
5. Security: a `password_changed_at` column so a password change ends old sessions; the
   current password before an email change; refresh tokens. (Login timing for unknown
   usernames was fixed on 14 Oct in the working tree, on AWS after the next backend
   deploy; see [§6](#6-security).)
6. Email: a private endpoint to SES and a single-use, expiring set-password link
   ([findings](superpowers/specs/2026-10-14-email-and-sms-findings.md)).
7. The pull board (**Take this**, a per-person task limit) is **built**
   ([spec](superpowers/specs/2026-10-14-pull-board-design.md)); still to do: deploy it
   to AWS and check it there. Known gap: a manager cannot put a task back to Ready from
   the screen (the Assign dialog has no empty choice); the API allows it
   (`PATCH /tasks/{id}` with `assigneeUserId: null`).
8. Small website bugs:
   - "Mark all as read" is enabled based only on the current page; the server marks all;
   - the "At risk" counter counts one page;
   - approving an already-decided entry again is allowed (`services/time_entries.py:146-166`).
9. Unexplained: 2 of 16,184 load-test requests got no response.
10. Ask the evaluators whether archive counts as the D in CRUD.
11. (d) History charts: a burn-up chart (work done over time) and budget spent over time.
    Both need history the API doesn't keep (no snapshots per day or week).

**The AI-use answer:**

> "Yes, I used Claude Code throughout, and I say so plainly. I made the product and design
> decisions; they're in the decisions table in CLAUDE.md. I don't trust the code because an
> AI wrote it. I trust it because of evidence: 506 backend tests against real Postgres; an
> integrity check after every database test; bandit and npm audit in CI; and my own
> checks on AWS, which is where the real bugs showed up. The real test is that I can open
> any file and explain it, so ask me about any of them."

Also true, but only documented (`docs/OVERNIGHT-REPORT.md:277-296`): a separate reviewer
agent found four important issues (one was that the report itself was unfinished) and a
minor one worth fixing, and all five were fixed. Don't say "rules are enforced twice" here (see [§11](#11-say-this-not-that)).

---

## 13. Cheat card

**Thirteen numbers**

| Number | What | Measured |
| --- | --- | --- |
| 506 / 96% | Backend tests / coverage (API layer 100%) | 14 Oct |
| 302 / 94.78% | Website tests / statements (95.88% of lines) | 14 Oct |
| 66 | Routes in the one route table | 14 Oct |
| 5 | Integrity queries that must return no rows | code |
| 10 + 1 | Tables: ten for the app, plus `schema_migrations` | 14 Oct |
| 41 / 26 | CHECK rules / foreign keys | 14 Oct |
| 1 / 10 | Exclusion constraint (no double-booking on one project) / triggers (no DELETE; audit log append-only) | 14 Oct |
| 600,000 | PBKDF2 rounds; login about 1.1 s at 512 MB | 13 Oct |
| 8 h | Token lifetime; no refresh token | code |
| 539 req/s | 25 users on AWS, p95 57 to 65 ms (read-only, tiny data) | 13 Oct |
| 6 / 13 ms | Inside the Lambda, p50 / p95 | 13 Oct |
| 9.8 s vs 10 s | Last staircase step vs the lock timeout; after the fix, 0.17 to 0.30 s | 13 Oct |
| 15 points | "At risk" threshold; bookings 1 to 40 h/week | code |

**Two one-liners**

- Email/SMS: blocked by role + VPC (no `ses:` permission, no way out of the network), so
  passwords are shown once instead (answer 22a).
- Pull board: built 14 Oct (66 routes, 2 migrations; answer 5a). Local only until the next deploy.

**Ten files** (under `backend/tracker/` unless shown)

| File | Why |
| --- | --- |
| `api/routes.py` | The one route table: method, path, roles |
| `api/app.py` | `dispatch` and `authorise`; role re-read at `:22-33` |
| `api/errors.py` | The one error-to-status table |
| `services/access.py` | 404, not 403, for what isn't yours |
| `services/audit.py` | `record_change`: audit row plus notifications |
| `services/dashboard.py` | Risk reasons and the allocation grid |
| `store/postgres.py` | autocommit plus `atomic()`; constraint name to message |
| `store/migrations/001_init.sql` | Every constraint, the exclusion, the no-DELETE trigger |
| `store/integrity.py` | The five integrity queries |
| `tests/backend/conftest.py` | Rollback per test; integrity check after each |
