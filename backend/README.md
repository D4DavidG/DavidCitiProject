# Backend: the tracker API

For anyone reading or changing the server code: what the backend is, what every file does,
the rule each layer keeps, and how to run and test it. Back to the [project README](../README.md).

## What it is

One Python program, [`tracker/`](tracker/), answers every request whose address starts with
`/api/tracker`. On AWS it runs as one **Lambda function** (AWS starts the code when a request
arrives; there is no server to keep running) behind CloudFront, and keeps its data in
**Aurora PostgreSQL**. Locally the same code runs in LocalStack (a copy of AWS in Docker)
against the PostgreSQL on your machine.

- Python 3.13, the Lambda's runtime. One package: `psycopg`, the PostgreSQL driver
  ([`tracker/requirements.txt`](tracker/requirements.txt)). No web framework: Lambda hands
  over one event, [`tracker/function.py`](tracker/function.py) returns one answer.
- **Why everything sits in one folder.** Terraform makes one Lambda for each folder directly
  under `backend/` that holds a `requirements.txt`, and skips folders whose name starts with
  `_` ([`infra/locals.tf`](../infra/locals.tf), lines 23 to 26). It zips only that folder, so a
  sibling such as `backend/services/` would never reach AWS.
- [`_examples/python-service/`](_examples/python-service/) is the workshop's sample service,
  kept as a reference. Its name starts with `_`, so it is never deployed.

How the backend fits with the website and AWS, where the data lives and the security measures
are in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Every endpoint, with Swagger, is in
[docs/API.md](../docs/API.md). Why it is built this way, and what was rejected, is in
[docs/DECISIONS.md](../docs/DECISIONS.md).

## Every file

Each folder below also holds an empty `__init__.py`, which makes it a Python package.

```
backend/
├── README.md                  this page
├── _examples/python-service/  the workshop's sample service; not deployed (name starts with _)
└── tracker/                   the API: one Lambda
    ├── function.py            the Lambda entry point: open or reuse the database connection, apply
    │                          new migrations on a cold start, create the first admin, then api/app.py
    ├── requirements.txt       psycopg[binary] 3.3.6, the only package
    ├── .gitignore             ignores the packages bin/start-dev.sh installs into this folder
    ├── api/                   HTTP in and out; no business rules
    │   ├── app.py             dispatch(): parse, route, authorise, run the handler, map errors
    │   ├── routes.py          the route table: every endpoint, who may call it, its status code
    │   ├── handlers.py        one small function per route: read the request, call one service
    │   ├── http.py            Lambda event -> Request; the two path shapes; camelCase <-> snake_case
    │   └── errors.py          the one table from domain errors to HTTP status codes
    ├── domain/                plain values and rules; no database
    │   ├── errors.py          the exceptions services raise: NotFound, Forbidden, Conflict, ...
    │   ├── money.py           the money formulas, in whole cents
    │   ├── values.py          read and check one field of a request body; a bad field names itself
    │   └── clock.py           ACME's "today", in Eastern time (Lambda and Aurora run in UTC)
    ├── services/              the business rules, one file per subject; no HTTP
    │   ├── access.py          who may see and who may manage a project (not yours -> 404)
    │   ├── actors.py          who is calling, re-read from the database on every request
    │   ├── assignments.py     bookings ("Resources" on screen): a person on a project, hours a week
    │   ├── audit.py           record_change(): one audit row and its notifications; the audit
    │   │                      log; one person's history
    │   ├── dashboard.py       the client's questions: project cards, at risk, allocation, budget,
    │   │                      timeline, the integrity check
    │   ├── milestones.py      deliverables and their dependency chain; computed status; sign-off
    │   ├── notifications.py   a person's bell: list, unread count, mark read
    │   ├── paging.py          every list's shape: items, page, pageSize, total, totalPages
    │   ├── passwords.py       password hashing (PBKDF2) and generated passwords
    │   ├── projects.py        projects: create, edit, archive and reactivate with all they hold
    │   ├── requests.py        requests: people ask, the people above them decide
    │   ├── sessions.py        refresh tokens: rotation, an 8-hour limit, reuse ends every session
    │   ├── tasks.py           tasks: create, assign, Take this and Put back, status
    │   ├── time_entries.py    logged time: its rules, over capacity, approve and reject
    │   ├── tokens.py          the 15-minute access token (JWT, HS256), standard library only
    │   ├── users.py           accounts: create, sign in, passwords, self-edit, capacity, archive
    │   └── views.py           the outside shape of every record, field by field
    └── store/                 PostgreSQL
        ├── postgres.py        connections, atomic() transactions, driver errors -> domain errors
        ├── migrate.py         applies each new migration file once, in order, under a lock
        ├── integrity.py       five queries that must always return no rows
        └── migrations/        the schema, as numbered SQL files:
            ├── 001_init.sql          every table, constraint and trigger
            ├── 002_task_limit.sql    each person's task limit (the pull board)
            ├── 003_request_kinds.sql the kinds of request
            ├── 004_over_capacity.sql the "Over capacity" mark on logged time
            └── 005_sessions.sql      refresh tokens (only a hash of each is stored)
```

The tests are not in this folder: they are in [`tests/backend/`](../tests/backend/), outside
`backend/`, because the CI security scan (`bandit -r ./backend`) flags every `assert` a test uses.

## The layers, and the rule each one keeps

A request goes down the table and the answer comes back up. Each layer only calls the one below.

| Layer | Its job | The rules it keeps |
| --- | --- | --- |
| **Routes and authorise** ([`api/routes.py`](tracker/api/routes.py), [`api/app.py`](tracker/api/app.py)) | Who may call what | One route table, read by one function, `authorise()`. The token only proves who signed in; the role is re-read from the `users` table on every request ([`services/actors.py`](tracker/services/actors.py)), so a demoted person loses access at once. A role that can never do something gets 403. Until a new person changes their generated password, every route except change-password and "me" answers 403. There is no DELETE route anywhere. |
| **Handlers** ([`api/handlers.py`](tracker/api/handlers.py)) | Translate | Read the request, call one service, shape the answer. No business rule lives here. |
| **Services** ([`services/`](tracker/services/)) | The business rules | Raise domain errors and import nothing about HTTP, so the rule tests reach them directly. Every change runs inside `store.atomic()` together with `audit.record_change()`: the change, its audit row and its notifications commit together or not at all. Something that exists but isn't yours answers 404 with the same words as something that doesn't exist, so ids can't be probed. Records leave only through [`services/views.py`](tracker/services/views.py), field by field, so `password_hash` can never leak. |
| **Domain** ([`domain/`](tracker/domain/)) | Values and money | Money is whole cents everywhere; only the website turns it into dollars. Values refuse rather than guess: `"3"` is not a number and `"false"` is not a yes/no. |
| **Errors** ([`api/errors.py`](tracker/api/errors.py)) | Domain error -> HTTP status | One table. Every error body is `{"error": "..."}`, plus `field` when one input is at fault and `code` when the website must react (`OVER_CAPACITY`: "Log anyway"; `ON_PROJECTS`: "Archive anyway"). |
| **Store** ([`store/postgres.py`](tracker/store/postgres.py)) | Talk to PostgreSQL | Values are always query parameters; table and column names are built with `psycopg.sql`, never pasted into a string. One `atomic()`: a real transaction at the top, a savepoint inside. |
| **Migrations** ([`store/migrations/`](tracker/store/migrations/), [`store/migrate.py`](tracker/store/migrate.py)) | The schema | Applied on a cold start (Aurora can't be reached from outside, so the Lambda applies the schema itself), under a lock so two cold starts queue. A file that has run is never edited: its checksum is stored and a changed file is refused, so you fix forward with the next number. `TEXT` plus `CHECK` instead of enum types. Triggers refuse `DELETE` on every application table, and `UPDATE` too on `audit_log` ([`001_init.sql`](tracker/store/migrations/001_init.sql), lines 238 to 255). |

## One request, end to end

An employee changes their own name: the website sends `PATCH /api/tracker/users/me` with
`{"firstName": "Ana"}`.

1. **Arrive.** On AWS: browser -> CloudFront -> the Lambda's address, path unchanged
   (`/api/tracker/users/me`). Locally: browser -> the proxy on port 3001, which strips
   `/api/tracker` -> LocalStack's Lambda (`/users/me`).
2. **Start.** [`function.py`](tracker/function.py) `handler()` checks the signing secret
   (`JWT_SECRET`, at least 32 characters), reuses the open database connection or opens one,
   applies new migrations once per cold start, and calls `app.dispatch()`.
3. **Parse.** [`api/http.py`](tracker/api/http.py) `parse()` turns both path shapes into
   `/users/me`, decodes the body and turns its camelCase keys into snake_case (`first_name`).
4. **Route and authorise.** `routes.match()` finds the route; [`api/app.py`](tracker/api/app.py)
   `authorise()` checks the `Bearer` token ([`services/tokens.py`](tracker/services/tokens.py)),
   then reads the caller's role from the database.
5. **Handle.** `update_me()` in [`api/handlers.py`](tracker/api/handlers.py) calls
   `users.update_self()`.
6. **Apply the rules.** [`services/users.py`](tracker/services/users.py) `update_self()` accepts
   only name and email, checks each field (a blank first name is a `ValidationError` naming
   `first_name`), then, inside one `atomic()` transaction, updates the row and calls
   `audit.record_change()`. That writes one `audit_log` row and one `notifications` row for
   each person to tell (their line manager and every admin).
7. **Answer.** The handler shapes the row with `views.user_view()`; `http.respond()` sends
   `200` with camelCase JSON. Had a rule failed, [`api/errors.py`](tracker/api/errors.py) would
   have turned the error into, for example, `400 {"error": "First name is required.", "field": "firstName"}`.

## Run it

| What | How |
| --- | --- |
| Start everything locally (PostgreSQL, LocalStack, the API, the website) | `./bin/start-dev.sh`, from the repo root. The API is then on http://localhost:3001/api/tracker. Full guide: [docs/SETUP.md](../docs/SETUP.md) |
| Check it answers | `curl http://localhost:3001/api/tracker/health` |
| Change Python code | Nothing to do: LocalStack mounts this folder (hot reload, [`infra/lambda.tf`](../infra/lambda.tf)), so the next request runs the new code. A new package or a Terraform change needs a redeploy: `(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)` |
| Add a migration | Add the next numbered file to `store/migrations/`. It applies on the next cold start (a fresh Lambda instance) and in the next test run |
| Read the local logs | `AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --follow --format short` |
| Read the AWS logs | `(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)` opens them in the AWS console ([tools/README.md](../tools/README.md)) |
| Deploy to AWS | `./bin/deploy-backend.sh` ([bin/README.md](../bin/README.md)) |
| Try the endpoints in a browser | Swagger: `./tools/swagger.sh`, then http://localhost:8090/swagger.html ([docs/API.md](../docs/API.md)) |
| After changing a route | Rebuild the API description: `.venv/bin/python tools/openapi.py` (`tests/backend/test_openapi.py` fails until you do) |

The settings Terraform gives the Lambda: `IS_LOCAL`, `POSTGRES_HOST`, `POSTGRES_PORT`,
`POSTGRES_NAME`, `POSTGRES_USER`, `POSTGRES_PASS`, `JWT_SECRET` (the token signing key, one
random value shared by every instance) and `BOOTSTRAP_ADMIN_PASSWORD` (the first admin's
password, changed at first sign-in) ([`infra/locals.tf`](../infra/locals.tf), lines 103 to 116).

## Test it

The backend tests (pytest) run against a real PostgreSQL: their own database, `tracker_test`,
rebuilt with the real migrations once per run, each test rolled back afterwards, and the five
integrity queries checked after every test. They never touch the app's `postgres` database.

```sh
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # once, from the repo root
.venv/bin/pytest -q                                                        # every backend test
.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing           # with coverage
.venv/bin/pytest tests/backend/test_users.py -q                            # one file
```

Local PostgreSQL must be running (`./bin/start-dev.sh` starts it). Which file tests what is in
[tests/README.md](../tests/README.md); every kind of test, why and the latest results are in
[docs/TESTING.md](../docs/TESTING.md).
