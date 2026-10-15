# How it works

For engineers and evaluators who need to know how the tracker works inside: what runs where,
how one request travels through the code, where every kind of data lives, how it is secured,
what is missing, and how it scales. Back to the [root README](../README.md).

Paths start at the repo root. Inside the API, `services/...` is short for
`backend/tracker/services/...` (the same for `api/`, `domain/`, `store/` and `function.py`).
Line numbers were checked on 15 Oct 2026 at commit `4d8b949`; they drift as code changes, file
names don't. No secret value is printed on this page, except the local database's throwaway
development password, which is already public in the repo (`infra/locals.tf`).

**Contents**

1. [What runs where](#1-what-runs-where)
2. [One request, end to end](#2-one-request-end-to-end)
3. [The data model](#3-the-data-model)
4. [Where the data lives](#4-where-the-data-lives)
5. [The audit log and notifications](#5-the-audit-log-and-notifications)
6. [Looking inside the local database](#6-looking-inside-the-local-database)
7. [Security, in plain words](#7-security-in-plain-words)
8. [Known gaps](#8-known-gaps)
9. [Scaling notes](#9-scaling-notes)
10. [Related pages](#10-related-pages)

---

## 1. What runs where

**On AWS** (region `us-east-2`), everything is built by Terraform in [`infra/`](../infra/README.md):

```
Browser ──HTTPS──> CloudFront   https://d1gov8jpsxhwer.cloudfront.net
                     │
                     ├── /*             -> S3 bucket: the built website (private: only CloudFront may read it)
                     │
                     └── /api/tracker*  -> Lambda function URL: the API (Python 3.13, 512 MB), never cached
                                              │
                                              │  encrypted connection (sslmode=require)
                                              v
                                           Aurora PostgreSQL 17.7, Serverless v2
                                           (no public address; pauses itself when idle)
```

**Locally** (on the workshop VDI), `./bin/start-dev.sh` starts the same pieces with stand-ins:

```
Browser ──> Vite dev server, port 3000: the website, reloads on every save
  │
  └── API calls to http://localhost:3001/api/tracker/...
        -> bin/proxy-server.js, port 3001: stands in for CloudFront, strips /api/tracker
        -> LocalStack, port 4566: fake AWS in Docker, runs the same Lambda code (mounted, so edits are live)
        -> PostgreSQL 18 on the VDI, port 5432, reached from Docker at 172.17.0.1
```

| Piece | What it does | Local | AWS | Defined in |
| --- | --- | --- | --- | --- |
| Website | React 19, Material UI, React Router; what people click | Vite dev server, port 3000 | Files in an S3 bucket, served by CloudFront | `frontend/`, `infra/s3.tf`, `bin/deploy-frontend.sh` |
| Front door | Sends `/api/tracker*` to the API and everything else to the website | `bin/proxy-server.js`, port 3001 | CloudFront | `infra/cloudfront.tf` |
| API | Every rule and every database call; one AWS Lambda | LocalStack | Lambda with a public function URL | `backend/tracker/`, `infra/lambda.tf` |
| Database | All business data | PostgreSQL 18, database `postgres` | Aurora PostgreSQL 17.7, database `codingworkshop` | `infra/rds.tf`, `backend/tracker/store/migrations/` |
| Settings and secrets | Token-signing key, database login, first admin's password | The Lambda's environment variables, set by Terraform in LocalStack | The Lambda's environment variables, set by Terraform | `infra/secrets.tf`, `infra/locals.tf` |

Three things about this layout that shape the code:

- **One folder under `backend/` is one Lambda.** Terraform makes a Lambda for every
  `backend/*/requirements.txt` and skips folders starting with `_` (`infra/locals.tf:23-26`).
  Only that folder is zipped, so all API code lives inside `backend/tracker/`.
- **The same request arrives with two different paths.** Locally the proxy strips the prefix, so
  the Lambda sees `/projects/7` (sometimes `//projects/7`). On AWS, CloudFront passes the path
  through, so it sees `/api/tracker/projects/7`. `api/http.py` accepts both (`PREFIX`,
  `api/http.py:21`), and the tests cover both shapes.
- **A Lambda is not a server.** Many copies may run at once, they share no memory, and any copy
  can be thrown away. So nothing is kept in memory between requests except one database
  connection per warm copy (`function.py:26-27`), and every lock lives in Postgres (section 9).

The website uses `HashRouter` (`frontend/src/App.jsx:93`), so addresses look like
`/#/projects/7`. Refreshing a deep link never asks S3 for a file that doesn't exist.

## 2. One request, end to end

Example: Maria, a manager, opens the dashboard. The browser sends
`GET /api/tracker/dashboard/projects`.

| Step | Where | What happens |
| --- | --- | --- |
| 1 | `frontend/src/services/request.js` | The one place the website calls the API. It adds `Authorization: Bearer` and the access token. On a 401 it swaps the refresh token for a new pair once (`POST /auth/refresh`) and retries once; only a refusal from `/auth/refresh` itself signs the person out |
| 2 | CloudFront (`infra/cloudfront.tf`); locally `bin/proxy-server.js` | `/api/tracker*` goes to the Lambda's URL, never cached. The local proxy forwards a short list of named headers, `authorization` among them |
| 3 | `backend/tracker/function.py` (`handler`, line 58) | Refuses with 503 if the token-signing key is missing or short. Reuses the warm copy's database connection. On a cold start it runs new migrations under a lock and creates the first admin, `AD000001`, if missing (`_prepare`, line 45). Then hands over to `api/app.py` |
| 4 | `api/http.py` | Turns the Lambda event into a request: method, path (prefix dropped, `//` collapsed), lower-cased headers, query, JSON body. JSON keys are camelCase; Python and SQL use snake_case, and this file converts them |
| 5 | `api/routes.py` | **The one route table:** 70 routes, each with its method, path, the roles allowed and its handler. An unknown address answers 404 |
| 6 | `api/app.py` (`authorise`, line 22) | Checks the token's signature and expiry (`services/tokens.py`), then loads the person **from the database** (`services/actors.py`): role, archived or not, must they still change their first password. The token never carries the role. Then the route's role check |
| 7 | `api/handlers.py` | One short function per route: read the parameters, call one service |
| 8 | `services/*.py` | **The business rules,** one file per subject. Each checks whose record it is (`services/access.py`: not yours answers 404, the same as missing). Every write runs inside one transaction with `audit.record_change()` (section 5) |
| 9 | `store/postgres.py` | The connection, `atomic()` transactions, SQL with values passed as parameters. Turns Postgres errors (an overlapping booking, a duplicate email) into domain errors |
| 10 | PostgreSQL | Constraints and triggers refuse bad rows even if a service has a bug |
| Back | `services/views.py`, `api/errors.py`, `api/http.py` | `views.py` names every field sent (never the password hash; salary only to admins and the person). `errors.py` maps a domain error to a status code. `http.respond` writes the JSON |

`api/app.py:1-5` draws the same chain in its docstring; `dispatch` is at `api/app.py:41`.

### The folders of the API

| Folder or file | What lives there | Open it when |
| --- | --- | --- |
| `function.py` | The Lambda entry point: settings check, connection, migrations on a cold start | A request fails before any route runs (503) |
| `api/` | HTTP only, no business rules: `routes.py` (the route table), `app.py` (`dispatch`, `authorise`), `handlers.py`, `http.py`, `errors.py` (the one error-to-status table) | You need to know who may call an address, or what status an error gets |
| `services/` | The business rules and their SQL: `users`, `projects`, `assignments` (bookings), `milestones` (deliverables), `tasks`, `time_entries`, `requests`, `dashboard`, `notifications`, `audit`, plus `access` (404-not-403), `actors` (who is calling), `tokens` and `sessions` (sign-in), `passwords`, `paging`, `views` (what each answer contains) | You are asked about any rule: open the file named for the subject |
| `domain/` | Small parts every layer shares: `errors.py` (the error types), `money.py` (cents), `clock.py` ("today" in Eastern time), `values.py` (input checks). Imports nothing else of ours | You need the exact check on an input, or how money is worked out |
| `store/` | The database layer: `postgres.py` (connection, `atomic()`, error translation), `migrate.py`, `integrity.py` (the five checks that must find nothing) | A transaction, a migration or an integrity check |
| `store/migrations/` | The shape of the database: `001_init.sql` to `005_sessions.sql`, applied in order and recorded | You need a table, a column or a constraint. Never edit a file that has run on AWS; add the next number |

**The layer rule:** imports point only downward, `api/` to `services/` to `store/`, with
`domain/` shared by all. Nothing below `api/` knows HTTP exists, which is why the rule tests
call the services directly (`tests/backend/`). One exception, on purpose: `api/app.py` uses
`store.postgres.translate_errors` around the handler.

### What an error looks like

Every error is `{ "error": "..." }`, plus `field` when one input is at fault (the website turns
that box red) and `code` when the website should act on it (`api/errors.py`).

| Status | Means | Example |
| --- | --- | --- |
| 400 | The input is wrong | An empty first name (`field: "firstName"`); a salary under the minimum (`field: "annualSalaryCents"`) |
| 401 | Not signed in, or the token expired | No `Authorization` header |
| 403 | Your role may never call this, or you must change your first password | An employee calling `GET /admin/audit-log` |
| 404 | Missing, **or not yours**, with word-for-word the same message | A manager opening another manager's project |
| 405 | The address exists, but not with this method | `DELETE /projects/7`: there is no DELETE anywhere |
| 409 | The current state refuses it | A dependency loop; `code: "OVER_CAPACITY"` (log anyway?); `code: "ON_PROJECTS"` (archive anyway?) |
| 500 | A bug: "Something went wrong on our side. Nothing was changed." The details go to the log only | |
| 503 | The database isn't ready, or the signing key is missing | The first request while Aurora wakes |

Lists always answer `{ items, page, pageSize, total, totalPages }`, and writes answer the new
or changed record. The full list of addresses is in [API.md](API.md).

## 3. The data model

Twelve tables: eleven for the app, plus `schema_migrations`, which the migration runner keeps
for itself. Two tables have a different name on screen, because the workshop brief says
"deliverables" and "resources".

| Table | On screen | What a row holds | Where you see it | Made by |
| --- | --- | --- | --- | --- |
| `users` | People | One person: username, name, email, job title, role (Admin, Manager, Employee), line manager, yearly salary in cents, weekly hours, overtime on or off, task limit, the password **hash** | People, Account, the Allocation grid and Schedule rows | `001_init.sql:7`; `task_limit` from `002_task_limit.sql`; `password_changed_at` from `005_sessions.sql` |
| `projects` | Projects | Name, description, manager, start and end dates, budget in cents, status | Dashboard, Projects, a project's page | `001_init.sql:39` |
| `assignments` | Resources | One person booked on one project for 1 to 40 hours a week, between two dates. Two live bookings of one person on one project may not overlap | A project's Resources tab, Allocation, Schedule, the dashboard's workload chart | `001_init.sql:63` |
| `milestones` | Deliverables | Name, dates, the manager's sign-off. Status is worked out from the tasks, not stored | A project's Deliverables tab and timeline, the dependency view | `001_init.sql:87` |
| `milestone_dependencies` | Dependencies | "Deliverable A waits for B", both in the same project | The dependency view | `001_init.sql:111` |
| `tasks` | Tasks | Work under a deliverable: title, assignee (or none: Ready on the pull board), To Do / In Progress / Done, estimate in minutes | A project's Board tab, My tasks | `001_init.sql:129` |
| `time_entries` | Logged time | Day, minutes, note, the hourly rate frozen when logged, Pending / Approved / Rejected, who decided, the "over capacity" mark | My tasks (log time), Approvals, the budget bar (approved time only) | `001_init.sql:158`; `over_capacity` from `004_over_capacity.sql` |
| `project_requests` | Requests | Every kind of request (new project, archive a project, task limit, overtime, other), the decision and who made it | Requests | `001_init.sql:185`; `kind` from `003_request_kinds.sql` |
| `audit_log` | Audit log, History | One row per successful change: who, their role at the time, what, the record, before and after (JSON), a one-line summary, when | Audit log (admins), History on People, My history on Account | `001_init.sql:209` |
| `notifications` | The bell | One row per person told about an audit row; read or unread | The bell, Notifications | `001_init.sql:227` |
| `refresh_tokens` | (none) | Only a SHA-256 fingerprint of each refresh token, its expiry, when it was revoked, what replaced it | Nowhere: it keeps sign-ins alive | `005_sessions.sql:6` |
| `schema_migrations` | (none) | Which migration files have run, each with its own SHA-256 | Nowhere | `store/migrate.py` |

How they connect (`──<` means "one to many"):

```
users ──< users                   line manager (users.manager_id)
users ──< projects                the project's manager (projects.manager_id)
projects ──< assignments >── users            bookings: person x hours a week
projects ──< milestones ──< tasks >── users   deliverables, then tasks with an assignee
milestones ──< milestone_dependencies         "A waits for B", same project only
tasks ──< time_entries >── users              time logged on a task by its assignee
users ──< project_requests                    the asker, and who decided
audit_log ──< notifications >── users         one change, everyone told about it
users ──< refresh_tokens                      one row per refresh token (a new one at every refresh)
```

**Nothing is deleted.** "Archive" sets a flag and a date, which the database forces to agree,
and "Reactivate" clears them. A Postgres trigger refuses `DELETE` on every app table
(`refuse_change`, `001_init.sql:240-254`, and `005_sessions.sql` for `refresh_tokens`), and
refuses `UPDATE` too on `audit_log` (`001_init.sql:255`). There is no DELETE route, and tests
check that none exists. Why this departs from the rubric's DELETE is in [DECISIONS.md](DECISIONS.md).

**Who refuses bad data, in three layers:**

1. **The database** refuses what one row can prove wrong: a malformed username, a negative
   budget, a 41-hour booking, overlapping bookings, a task on another project's deliverable, a
   dependency across projects, someone approving their own time (`001_init.sql`).
2. **The services** enforce what needs the clock, a sum or the caller: weekly capacity,
   sign-off only when all work is done, dependency loops, ownership, the minimum pay, the
   warning before archiving someone still on a project.
3. **Five integrity queries** (`store/integrity.py`, also `GET /admin/integrity-check`) must
   always find nothing: no dependency loops; nothing live under an archived project; every
   record has its creation audit row; no time logged outside a booking; no signed-off
   deliverable with unfinished work. They run after every database test.

**Money and time.** Money is whole cents in `BIGINT` columns; `domain/money.py` holds the
formulas, and the dashboard repeats them in SQL so Postgres can add them up
(`services/dashboard.py`). The website never does money arithmetic; it only formats what the
server sends (`frontend/src/services/format.js`). Time worked is whole minutes; bookings are
whole hours a week. "Today" and weeks (Monday to Sunday) are Eastern time, although the servers
run in UTC (`domain/clock.py:9`). The minimum pay is $20 an hour, checked as a yearly salary of
at least $41,600 (2,080 working hours a year).

The full design, with the SQL, is in `backend/tracker/store/migrations/`; the reasons are in
[DECISIONS.md](DECISIONS.md).

## 4. Where the data lives

### The database

All business data (people, projects, bookings, time, requests, the audit trail) lives in
PostgreSQL and nowhere else. The API writes no files.

| | Local (the VDI) | AWS |
| --- | --- | --- |
| What | PostgreSQL 18, installed on the VDI itself | Aurora PostgreSQL 17.7, Serverless v2 (`infra/rds.tf`) |
| Database name | `postgres`, the shared default one | `codingworkshop` (the project name without its dash) |
| How the API reaches it | Docker's bridge address `172.17.0.1`, port 5432 (`infra/locals.tf`) | The cluster's address from Terraform, encrypted (`sslmode=require`, `store/postgres.py:63`) |
| Sleeps when idle? | No | Yes (`min_capacity = 0`): the first request after a pause takes about 15 s |
| Backups | None | Automatic, kept 7 days. No final copy on `terraform destroy` |
| Who creates the tables | The Lambda, on its first cold start: `store/migrate.py`, under a Postgres advisory lock so two cold starts can't both migrate | The same |

**The test databases are separate.** `tracker_test` is rebuilt at the start of each backend
test run, and four more (`tracker_migrate_test`, `tracker_function_test`, `tracker_commit_test`,
`tracker_claim_test`) are made and dropped by their tests. Their names are fixed in the test
code (`tests/backend/pg.py`), so a test can never touch the app's data. See [TESTING.md](TESTING.md).

### The browser

Four keys, and nothing else: a search of `frontend/src` for `localStorage`, `sessionStorage`,
`indexedDB`, `document.cookie`, `serviceWorker` and `caches.` finds only these.

| Storage | Key | Holds | Code | Lasts |
| --- | --- | --- | --- | --- |
| `sessionStorage` | `acme.token` | The access token | `frontend/src/auth/AuthContext.jsx:8` | Until the tab closes; the token itself dies after 15 minutes |
| `sessionStorage` | `acme.refresh` | The refresh token, replaced each time it is used | `frontend/src/auth/AuthContext.jsx:9` | Until the tab closes; the server ends it 8 hours after sign-in |
| `localStorage` | `acme.colorMode` | `light` or `dark` | `frontend/src/theme/colorMode.js:4` | Until the browser's data is cleared |
| `localStorage` | `acme.menuCollapsed` | Whether the side menu is folded | `frontend/src/components/AppLayout.jsx:22` | Until the browser's data is cleared |

- **No cookies.** The refresh token travels in the response body; why it isn't an HttpOnly
  cookie is in [DECISIONS.md](DECISIONS.md).
- Both tokens are also held in memory (`frontend/src/services/request.js:36-37`), so the site
  still works when storage is blocked. Every storage read and write is wrapped in try/catch.
- **Typed passwords** live only in the page's memory while being typed; nothing stores them.
- **The clipboard counts too:** "Copy username and password" puts a new person's username and
  first password on the clipboard until something else is copied.
- Each address has its own storage: `localhost:3000` and the CloudFront site never share it.

### Secrets and settings

What kind of thing each is and where it lives; never the value.

| Secret or setting | What kind of thing | Where it lives | Lasts |
| --- | --- | --- | --- |
| Token-signing key (`JWT_SECRET`) | 48 random letters and digits, made once by Terraform (`infra/secrets.tf`) | Terraform state; the Lambda's environment variables | Until `terraform destroy`. Changing it signs everyone out |
| AWS database password | Three random words (`random_pet`, `infra/rds.tf`) | Terraform state; the Lambda's settings; Aurora | Until destroy |
| First admin's password | 16 random characters, made by Terraform (`infra/secrets.tf`) | Terraform state; the Lambda's settings. Shown by `terraform -chdir=infra output -raw bootstrap_admin_password` | Used only to create `AD000001` if missing; that account must change it at first sign-in |
| Local database password | A throwaway development password | The repo (public): `infra/locals.tf`, `tests/backend/pg.py` | It opens only the VDI's own Postgres |
| Demo people's passwords | The seeded people's shared password, and the live logins David chose to publish | The repo (public): `tools/demo.py`, the tests, the [root README](../README.md) | See [Known gaps](#8-known-gaps), item 1 |
| Workshop participant code, LocalStack token | From the workshop email and LocalStack | `~/.bashrc` on the VDI | Until the VDI is wiped |
| Temporary AWS credentials | Access key, secret key, session token | `ENVIRONMENT.config` and `~/.aws/credentials` (both outside git) | They expire; rerun `./bin/setup-participant.sh` |

- **Terraform state** lives in an S3 bucket named `coding-workshop-tfstate-` plus the
  participant ID (`bin/deploy-backend.sh`). It holds the three generated secrets in plain text:
  `sensitive` only hides them on screen. The Lambda's code zip sits in the same bucket.
- **No Secrets Manager.** Every secret reaches the Lambda as an environment variable, read with
  `os.getenv` (`function.py`, `store/postgres.py`).
- Setting up a machine and these files is in [SETUP.md](SETUP.md).

### Files and logs

| What | Where | Lasts |
| --- | --- | --- |
| The built website | `frontend/dist` locally; on AWS an S3 bucket only CloudFront may read | Until the next build or deploy |
| CloudFront's copies of the website | CloudFront's cache: 1 hour by default, 24 hours at most; the API is never cached (`infra/cloudfront.tf`) | Each `./bin/deploy-frontend.sh` clears them |
| Lambda logs on AWS | CloudWatch, log group `/aws/lambda/coding-workshop-tracker-` plus the participant ID | 7 days (`infra/lambda.tf:36`) |
| Lambda logs locally | `docker logs localstack-main` | Until LocalStack is removed |
| Start-up logs | `/tmp/tf-init.log`, `/tmp/backend-deploy.log`, `/tmp/npm-install.log`, `/tmp/proxy-server.log` | Until the VDI restarts |
| Test output | Browser-test traces and reports in `frontend/test-results/` and `frontend/playwright-report/`; screen-tour pictures in `~/tour-shots`; backend coverage in `.coverage` | Overwritten by the next run ([TESTING.md](TESTING.md)) |
| README pictures | `docs/screenshots/` | In git |

**What the API writes to the log:** migrations applied, a missing signing key, "database not
ready", an unexpected error with its path and traceback, and a reused refresh token with the
user's number (`function.py`, `api/app.py:52-53`, `services/sessions.py`). It never logs a
password, a token or a request body on purpose, but an unexpected database error's traceback
can include the failing row's values.

### What a database leak would and wouldn't give away

- **No passwords.** Only `pbkdf2_sha256$600000$salt$hash`, with a random salt per person (`services/passwords.py`).
- **No usable refresh tokens.** Only their SHA-256 (`services/sessions.py`).
- **No access tokens.** They are never stored; each carries only a user number and two times, no role (`services/tokens.py`).
- **Salaries, yes.** In `users.annual_salary_cents`, and in the audit log's before/after for user changes, which only admins can read through the API.

## 5. The audit log and notifications

**The rule:** every successful change writes one audit row, and that row tells the people who
need to know through the bell. Reads are not logged, nor are sign-ins, refreshes and sign-outs
(a refresh every 15 minutes would flood the log). Refused requests changed nothing, so they
aren't logged either.

**How one notification is made.** Example: Ana, an employee, changes their own last name.

1. The website sends `PATCH /users/me`. `authorise()` (`api/app.py:22`) reads Ana's role
   fresh from the database, then the handler runs.
2. `update_self` in `services/users.py` updates the row and, **in the same database
   transaction**, calls `audit.record_change(...)`. Every write in the app does this, across
   `users.py`, `projects.py`, `assignments.py`, `milestones.py`, `tasks.py`, `time_entries.py`
   and `requests.py`.
3. `record_change` (`services/audit.py:37-66`) re-reads the actor's role (line 47), inserts one
   `audit_log` row (who, their role, the action, the record, before and after as JSON, a
   one-line summary; lines 48-53), then one SQL statement inserts one `notifications` row per
   person to tell (lines 56-65).
4. The change, the audit row and the notifications commit together or not at all.

**Who is told** (the `WHERE` clause at `services/audit.py:59-61`):

| Who | When |
| --- | --- |
| Every admin | Always |
| The person the change is about (`_subjects`, line 74) | The booked person, the task's assignee (old and new on a reassignment), the person whose time it is, the account itself (not when it is first created) |
| The actor's line manager | When the actor is an employee |
| The project's manager (`_project_manager`, line 90) | When the actor is an employee and the change is to a project's work (a booking, deliverable, task or logged time) |
| Anyone the code adds (`also_notify`) | The asker when a request is decided; the people under an archived project |
| Never | The actor themselves, or an archived person. `UNIQUE (recipient_user_id, audit_id)` means nobody is told twice (`001_init.sql:234`) |

A change that tells nobody (the only admin editing their own account, say) still writes its
audit row.

**How the bell reads them.** `frontend/src/components/NotificationBell.jsx` asks
`GET /notifications/unread-count` every 10 seconds while the tab is visible (`POLL_MS`,
line 10), again when the tab comes back, and right after any change made in the app (`onWrite`,
line 74). If the count rises, it fetches the newest for a pop-up. There are no websockets:
a Lambda function URL can't hold a connection open, so polling is the "real-time" here. The
bell's text is only the one-line summary, never the before/after state, so a salary can't leak
through it (`notification_view` in `services/views.py`). The other routes: `GET /notifications`
(own only, paged, `?unread=true`), `POST /notifications/{id}/read` (404 if not yours),
`POST /notifications/read-all` (queries in `services/notifications.py`).

**The admin's side:**

| What | Route | Code | Screen |
| --- | --- | --- | --- |
| Audit log, filtered by text, actor, record and dates | `GET /admin/audit-log` (admins only) | `audit.list_audit` (`services/audit.py:110`), which checks the role again | Audit log (`frontend/src/pages/audit/`) |
| One person's history | `GET /users/{id}/history`: admins, the line manager and the person; others get 404 | `audit.person_history` (`services/audit.py:140`). Only admins get the before/after state (`audit_view` in `services/views.py`) | People > Actions > History; Account > My history |
| Integrity check | `GET /admin/integrity-check` (admins only) | `store/integrity.py` | None; it answers five empty lists |

**The proof:** `tests/backend/test_audit.py` has one test per rule (for example
`test_employee_change_notifies_line_manager_and_admins`), and
`tests/backend/test_api_audit_walk.py` calls every write route and fails if one leaves no audit
row. Integrity query 3 fails any record without its creation row. Add a route and forget
`record_change`, and the suite fails. To watch it happen live through Swagger, see [API.md](API.md).

## 6. Looking inside the local database

Local only. The AWS database (Aurora) sits in a private network on purpose: see its data
through the API (the website, Swagger or `curl`). AWS's Query Editor can't open it either,
because the cluster has no Data API (`infra/rds.tf`).

| Setting | Value |
| --- | --- |
| Host, port | `localhost`, `5432` |
| User, password | `postgres`, `postgres123` (the throwaway development password) |
| Database, schema | `postgres`, `public` (`tracker_test` belongs to the tests: leave it alone) |

**From a terminal:**

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres
```

Then `\dt` lists the tables, `\d audit_log` shows one table's columns, and `\q` quits.

**In VS Code:** the PostgreSQL extension (`ms-ossdata.vscode-pgsql`): the elephant icon, Add
Connection, then server `localhost`, port `5432`, authentication Password, user `postgres`,
password `postgres123`, database `postgres`. Open Tables, right-click a table, Select Top 1000.

**Useful queries** (paste into `psql`):

```sql
-- The ten newest changes
SELECT audit_id, created_at, actor_role, action, entity_type, entity_id, summary
FROM audit_log ORDER BY audit_id DESC LIMIT 10;

-- Who was told about them, and whether they have read it
SELECT n.audit_id, u.first_name || ' ' || u.last_name AS told, u.role, n.is_read, a.summary
FROM notifications n
JOIN users u ON u.user_id = n.recipient_user_id
JOIN audit_log a ON a.audit_id = n.audit_id
WHERE n.audit_id IN (SELECT audit_id FROM audit_log ORDER BY audit_id DESC LIMIT 10)
ORDER BY n.audit_id DESC;

-- The local usernames (they differ on every machine; tools/demo.py seed makes them)
SELECT username, first_name, last_name, role, is_archived FROM users ORDER BY role, username;
```

To see the database protect itself, try `DELETE FROM audit_log WHERE audit_id = 1;`: the
append-only trigger refuses it, and nothing changes.

## 7. Security, in plain words

**In one breath:** every request passes two gates. The first is one route table that says
which roles may ever call each address. The second is in the business rules, and it checks
whose record it is. The role is never taken from the sign-in token: it is read from the
database on every request, so demoting or archiving someone works on their very next click.
Passwords are stored only as slow, salted hashes; sign-ins are 15-minute tokens renewed by a
rotating refresh token; and every change is written to an audit log that Postgres itself
refuses to edit or delete.

The request's path through the locks:

1. **Browser to CloudFront** over HTTPS only.
2. **CloudFront to the Lambda.** The Lambda's own address is public, so our code is the lock.
3. **Who are you?** Check the signed token, then load the person from the database (`api/app.py:29-33`).
4. **May your role ever do this?** The route table (`api/routes.py`, checked at `api/app.py:36-37`).
5. **Is this yours?** The service checks, and answers 404 (not 403) when it isn't.
6. **The database** takes values only as parameters, and its own rules catch what code misses.
7. **The answer** names each field it sends; salary only for admins and the person.

"Template" means the workshop's starting repo already had it; "added" means this project wrote it.

### Passwords and signing in

| Measure | What it does | Where | Why | Origin |
| --- | --- | --- | --- | --- |
| Slow, salted password hash | The database holds only a scrambled version that takes about half a second to make, with a random salt per person (PBKDF2-SHA256, 600,000 rounds) | `services/passwords.py` | A stolen database can't cheaply be turned back into passwords | Added |
| One answer for every failed sign-in | Wrong username, wrong password and archived account get the same sentence, and an unknown username still does one full slow hash | `services/users.py` (`login`) | Nobody can learn which usernames exist, from the words or from the reply time | Added |
| Constant-time comparison | Checking a password or a token signature takes the same time whatever is wrong | `services/passwords.py`, `services/tokens.py` | Timing can't leak the answer | Added |
| Generated first password | The server makes a 12-character password from a secure random source and shows it once | `services/passwords.py`, `services/users.py` | No admin chooses or keeps a lasting password for someone | Added |
| Forced change at first sign-in | Until it is changed, every address except "who am I" and "change password" answers 403 | `api/app.py:34-35` | The password an admin saw can't be used for real work | Added |
| People edit only their own name and email | Nobody, not even an admin, can change their own role or salary | `services/users.py` (`update_self`) | No one can promote themselves | Added |
| Admin reset instead of an emailed reset | A forgotten password is reset by an admin, with a new forced change | `services/users.py` | The workshop's AWS account can't send email or texts (no `ses:` permission, no route out of the network) | Added |

### Sign-in tokens and sessions

| Measure | What it does | Where | Why | Origin |
| --- | --- | --- | --- | --- |
| 15-minute access token (a signed JWT) | A signed note: "user number N, issued at T, good for 15 minutes". No role, no name | `services/tokens.py` | A stolen token is useful for 15 minutes at most | Added |
| Signature first, one error for all | The signature is checked before anything inside is trusted; bad, expired and forged tokens get the same 401 | `services/tokens.py` | A forger learns nothing | Added |
| One signing key from Terraform | Every copy of the Lambda uses the same random key; it refuses to serve (503) if the key is missing or short | `infra/secrets.tf`, `function.py:60-63` | A key made "on first run" would differ per copy and sign people out at random | Added |
| Refresh token, stored as a fingerprint | Sign-in also gives a long random refresh token; only its SHA-256 is saved. It dies 8 hours after sign-in | `services/sessions.py`, `005_sessions.sql` | A database leak gives nobody a usable token | Added |
| Rotation and a reuse alarm | Each refresh swaps the token for a new one. If an old one comes back, someone has a copy, and every session of that person ends | `services/sessions.py` | Catches a stolen token | Added |
| Sessions really end | Signing out revokes the token on the server; a password change, reset or archive ends older sessions | `services/sessions.py`, `services/users.py`, `services/actors.py` | A thief doesn't keep access after the password changes | Added |

### Who may do what

| Measure | What it does | Where | Why | Origin |
| --- | --- | --- | --- | --- |
| Role read from the database every time | The token says only who you are; the role is looked up fresh on every request | `api/app.py:22-38`, `services/actors.py` | A demoted or archived person loses power on their next click | Added |
| One route table, one gate | Every address, its method and the roles allowed are one list; only health, sign-in, refresh and sign-out are public | `api/routes.py` | All access can be checked by reading one file | Added |
| 404, not 403, for other people's things | A record that exists but isn't yours gets word-for-word the same answer as one that doesn't exist. The same goes for a person's history and projects (`GET /users/{id}/history`, `GET /users/{id}/projects`): admins, the line manager and the person only | `services/access.py` | Nobody can probe which records exist | Added |
| Search can't see more than you can | The visibility rule is part of the same database query as the search | `services/projects.py`, `services/requests.py` | Search isn't a side door | Added |
| Allowed fields only | Each edit lists the fields it accepts; anything else is refused by name | `domain/values.py` | Nobody slips `role` or a salary into an edit | Added |
| Salary stays private | Salary is sent only to admins and the person; history's before/after only to admins; the bell's text is a one-line summary | `services/views.py`, `services/audit.py` | Managers never see pay | Added |
| Nobody approves their own time | The database itself refuses it | `001_init.sql:179` | Honest cost figures | Added |
| The website hides what you can't use | Menus, pages and buttons a role can't use are hidden, but the server checks again | `frontend/src/auth/RequireRole.jsx`, `frontend/src/services/personAccess.js` | Tidy screens; not the security itself | Added |

### Data and the database

| Measure | What it does | Where | Why | Origin |
| --- | --- | --- | --- | --- |
| Values never pasted into SQL | Values travel separately from the SQL text; table and column names that vary are built with `psycopg.sql` | `store/postgres.py` | Stops SQL injection. Bandit finds no issues | Added |
| Input checks | Text trimmed and length-capped, numbers must be real numbers, dates `YYYY-MM-DD`, the body a JSON object, a salary at least $41,600 a year | `domain/values.py`, `api/http.py`, `services/users.py` | Refuse rather than guess | Added |
| Page size capped | At most 100 rows a page, whatever is asked | `services/paging.py:12` | No giant queries | Added |
| Plain errors, no internals | A real bug answers only "Something went wrong on our side. Nothing was changed."; the details go to the log | `api/errors.py`, `api/app.py:50-54` | Attackers learn nothing about the inside | Added |
| The database's own rules | Allowed values, foreign keys, no two overlapping live bookings of one person on one project | `001_init.sql` | A last line of defence, even under parallel requests | Added |
| Nothing can be deleted | No DELETE route, and a trigger refuses `DELETE` on every table | `001_init.sql:240-255` | Nothing is lost by mistake or on purpose | Added |
| An audit log nobody can edit | Every change writes an audit row in the same transaction; Postgres refuses to edit or delete those rows | `services/audit.py`, `001_init.sql:255` | "Who did what, when" always has an answer | Added |
| Five integrity checks | Five questions that must always find nothing | `store/integrity.py` | Catches quiet damage, including a change that forgot its audit row | Added |
| Tamper-evident migrations | Each applied migration's SHA-256 is recorded; an edited one stops the Lambda. A lock stops two cold starts migrating at once | `store/migrate.py` | The database shape can't drift quietly | Added |
| Row locks | Two requests can't both slip under a limit (weekly capacity, task limit, taking a task) | `services/time_entries.py`, `services/tasks.py` (`SELECT ... FOR UPDATE`) | Correct even with many Lambdas at once | Added |

### The network and AWS

| Measure | What it does | Where | Why | Origin |
| --- | --- | --- | --- | --- |
| HTTPS only | CloudFront turns plain HTTP into HTTPS, and talks to the Lambda over HTTPS (TLS 1.2) | `infra/cloudfront.tf` | Nobody can read or change traffic on the way | Template |
| Private website bucket | Only this CloudFront may read the website files | `infra/cloudfront.tf`, `infra/s3.tf` | Nobody reads the bucket directly | Template |
| Database encrypted, not public | Aurora's storage is encrypted, and it has no public address | `infra/rds.tf` | Nobody on the internet can connect to it | Template |
| Encrypted database connection | On AWS the API connects with `sslmode=require` | `store/postgres.py:63` | Traffic between the Lambda and Aurora is encrypted | Added |
| CORS names its headers | The Lambda URL allows `authorization` and `content-type` by name, not `*`, which browsers never let cover `Authorization` | `infra/lambda.tf:46-53` | Swagger UI can call the Lambda; the website is same-origin and doesn't need it | Template, changed |
| Logs kept 7 days; failed-call queue encrypted | CloudWatch drops Lambda logs after 7 days; the dead-letter queue is encrypted | `infra/lambda.tf` | Tidy and bounded | Template |
| The local proxy passes named headers only | The local stand-in for CloudFront forwards a short list of headers | `bin/proxy-server.js` | Keeps the local path as narrow as AWS | Template; `authorization` and `content-length` added |

### Checks and guardrails

| Measure | What it does | Where | Origin |
| --- | --- | --- | --- |
| Bandit on every push | Scans the Python for known unsafe patterns | `.github/workflows/python.actions.yml` | Template |
| npm audit on every push | Fails if a website library has a known high-severity hole | `.github/workflows/react.actions.yml` | Template |
| Checkov on every push | Reports risky cloud settings (reports only, never blocks) | `.github/workflows/terraform.actions.yml` | Template |
| Secrets kept out of git | `.gitignore` drops env files, credentials, Terraform state and private notes | `.gitignore` | Both |

## 8. Known gaps

Said plainly, so nobody finds them by surprise.

1. **Every live login is public, by David's choice.** The [root README](../README.md) lists
   the AWS admin's password and the seeded people's passwords, and the GitHub repo is public. So
   anyone who reads it can sign in to the live site as any role and change data. It is demo
   data. To close it: on the live site, sign in as the admin and change that password on
   Account, then reset each seeded person's password (People, Actions). That also stops the
   `./tools/e2e.sh --aws` browser tests, which sign in with the published passwords.
2. **No rate limit or lockout.** Only the slow hash slows password guessing (about 1.1 s per
   warm sign-in on AWS, measured 13 Oct). A chosen password needs only 8 characters.
3. **Tokens live in `sessionStorage`, not an HttpOnly cookie.** A script injected into the page
   could copy them. Against that: React escapes what it shows, `frontend/src/` has no
   `dangerouslySetInnerHTML`, and a copied refresh token used twice ends both sessions.
4. **The Lambda's own address is public and accepts any origin, with no AWS-level check**
   (`authorization_type = "NONE"`, `allow_origins = ["*"]`, `infra/lambda.tf`). Anyone can
   call it without going through CloudFront, so our code is the only lock. There is no
   firewall (WAF) in front.
5. **No browser security headers** (no HSTS or content-security policy) on CloudFront or in
   `frontend/index.html`.
6. **A stolen access token works for up to 15 minutes**, and one token can't be cancelled on
   its own (a password change ends them all).
7. **Secrets sit in Terraform state and the Lambda's settings, not Secrets Manager**, and the
   AWS database password is three random words.
8. **Changing your own email needs no current password.** Harmless while nothing is emailed.
9. **Managers see every employee's bookings on the Allocation grid**, including
   project names and hours on other managers' projects. That is how "who is over-allocated"
   works; salary is never shown, and opening another manager's project is still a 404.
10. **"That email is already in use"** lets a signed-in person test whether an address is in
    the system.
11. **Not checked from outside:** that the S3 bucket blocks public access, that Aurora
    refuses outside connections, and that `sslmode=require` is in effect.
12. **Older copies of the private project plan are in the public repo's history** (committed
    before `private/` was ignored). Ignoring a folder doesn't remove old history.
13. **Local Postgres trusts every connection** (`bin/start-dev.sh` sets `pg_hba` to `trust`).
    Fine on a private VDI, wrong anywhere else.
14. **`refresh_tokens` and `audit_log` only grow:** rows can't be deleted and nothing prunes
    them.
15. **The cleanup script's backup zips the whole folder,** including `ENVIRONMENT.config` and
    private notes, into the state bucket (`bin/cleanup-environment.sh`). Run it only on purpose.
16. **No lockfile in git** (`package-lock.json` is in `.gitignore`), so CI installs fresh
    library versions each run; and Checkov never blocks.
17. **Claude Code's deny list matches command spellings, not intent.** It blocks the usual
    spellings of `git push`, the deploy scripts and `terraform apply`/`destroy`, but not every
    spelling (`.claude/settings.local.json`, not in git). See [AI-WORKFLOW.md](AI-WORKFLOW.md).

## 9. Scaling notes

ACME may have hundreds of projects and people. What already copes, and where the limits are:

- **Search and paging happen on the server, everywhere.** Every list (projects, people,
  requests, approvals, notifications, the audit log, the Allocation grid's people) takes a
  name search and filters, and answers one page: `{ items, page, pageSize, total, totalPages }`,
  at most 100 rows (`services/paging.py:12`). The website never downloads a whole table. The
  visibility rule is part of the same query, so paging counts only what you may see.
- **The dashboard shows a short, useful slice.** For managers and admins it has two columns,
  **At risk** and **On track**, each the 3 projects with the most recent activity, with **See
  all** for the full, paged list. The server does the sorting and counting:
  `GET /dashboard/projects` takes `atRisk` and `sort=updated` and returns each project's
  `lastActivityAt`, and the totals (Total projects, Total at risk) are counted across every page
  (`atRiskTotal`), not from the rows on screen.
- **The top-bar search** finds a page (only the pages your role may open) or a project by name,
  so nobody scrolls a long list to reach one; `/` or Ctrl+K puts the cursor in it.
- **Indexes** sit on the columns lists and joins use: 16 in all (`001_init.sql`,
  `005_sessions.sql`). Nine cover only the rows that matter: live records
  (`WHERE NOT is_archived`), unread notifications (the bell's count) and unrevoked refresh
  tokens. The audit log is indexed by record and by time.
- **More traffic means more Lambda copies, and that is safe** because nothing lives in memory.
  Everything that must happen once is locked in Postgres: an advisory lock for migrations, row
  locks for capacity, task limits and taking a task, and an exclusion constraint against
  overlapping bookings. `tests/backend/test_claim_race.py` runs the races on separate
  connections.
- **Aurora Serverless v2 grows and shrinks on its own**; with a minimum of 0 it pauses when idle,
  so the first request after a pause takes about 15 s. Warm it up before a demo.
- **The website loads one page at a time.** Each signed-in screen is its own file
  (`frontend/src/components/lazyPage.js`), so the first download is smaller (739 kB to 560 kB,
  measured 14 Oct).
- **Measured load:** the k6 load test (reads plus a burst of sign-ins) passed its thresholds
  locally on 14 Oct: 4,038 requests, 0 failed, reads p95 67 ms. LocalStack itself fails past
  about 15 users, so larger runs are for AWS. How to run it is in [TESTING.md](TESTING.md).

**Where it would strain first:**

- **The bell's polling:** every open tab asks for the unread count every 10 seconds. The query
  is a small indexed count, but with thousands of people online a push channel would be cheaper.
  A Lambda function URL can't hold a websocket, so that would mean API Gateway websockets or a
  similar service.
- **Sign-ins are slow on purpose** (about 1 s each at 512 MB): a burst of hundreds at 9 am
  would queue. More Lambda memory makes each one faster.
- **The Allocation grid and Schedule** work out people by weeks on each request; a page of
  people is fine, but a year of weeks for everyone would want a summary table.
- **`audit_log` and `notifications` only grow.** They are indexed, but at real scale they
  would need archiving by date.

## 10. Related pages

| Page | What it answers |
| --- | --- |
| [Root README](../README.md) | What the tracker is, the live site, every login, where everything is |
| [docs/README.md](README.md) | The index of every document |
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the tracker must do: the seven questions, the features, the screens |
| [API.md](API.md) | Every API address, who may call it, Swagger locally and on AWS |
| [DECISIONS.md](DECISIONS.md) | Every design decision, why, and what was rejected |
| [TESTING.md](TESTING.md) | Every kind of test: what it checks, where it lives, how to run it |
| [SETUP.md](SETUP.md) | Running it locally, deploying to AWS, fixing common problems |
| [AI-WORKFLOW.md](AI-WORKFLOW.md) | How the project was built with Claude Code |
| [backend/README.md](../backend/README.md), [frontend/README.md](../frontend/README.md), [infra/README.md](../infra/README.md) | Each part of the code, folder by folder |
| [bin/README.md](../bin/README.md), [tools/README.md](../tools/README.md), [tests/README.md](../tests/README.md) | The scripts, the tools and the tests |
