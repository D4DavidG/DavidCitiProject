# ACME Project Tracker

A project-management and tracking platform for ACME Inc., built for the Citi coding
workshop (13 to 15 Oct 2026). It answers the client's seven questions from live data:
React with Material UI on the front (in progress), Python on AWS Lambda behind it,
PostgreSQL (Aurora) underneath, deployed with Terraform and the repo's shell scripts.

- How it works, how to demo it, likely questions: [docs/GUIDE.md](./docs/GUIDE.md)
- Scope, rules and screens: [MVP.md](./MVP.md)
- Database design and reasoning: [docs/superpowers/specs/2026-10-13-database-design.md](./docs/superpowers/specs/2026-10-13-database-design.md)
- Workshop guides: [docs/README.md](./docs/README.md)

## The seven questions, and where the answers come from

| # | Question | Computed by | Endpoint |
| --- | --- | --- | --- |
| 1 | Status of each active project | project status + progress from task estimates | `GET /dashboard/projects` (one card per project), `GET /projects` |
| 2 | Projects at risk of missing deadlines | past end date, overdue or behind-schedule deliverables, budget burning faster than time | `GET /dashboard/projects` (at risk first, with reasons), `GET /dashboard/at-risk` |
| 3 | Resource allocation across projects | bookings (hours/week per person per project), with the projects behind each week's hours | `GET /dashboard/allocation` |
| 4 | Key deliverables and completion | deliverable status and progress computed from their tasks | `GET /projects/{id}/milestones` |
| 5 | Over-allocated team members | weeks booked past each person's capacity (worst week first, `?overOnly=true`), and weeks logged past it | `GET /dashboard/allocation` |
| 6 | Dependency chain between deliverables | live dependency links, one project at a time | `GET /projects/{id}/dependency-graph` |
| 7 | Budget consumed vs planned | planned = bookings x rate; consumed = approved time x the rate frozen when logged | `GET /dashboard/projects`, `GET /projects/{id}/budget` |

We read the brief as a portfolio and resource-management problem (the category of
Float, Harvest Forecast and Smartsheet Resource Management), not task tracking (Jira,
Trello). So the manager lands on the dashboard (`/dashboard/projects`: status, risk and
budget per project, answering questions 1, 2 and 7 at a glance), then the allocation grid
(questions 3 and 5: who is over capacity, in which week, and which projects the hours come
from). Tasks exist only to make deliverable completion (question 4) a measured number.
The dashboard, the risk panel and the budget screen share one money query and one risk
function, so they can never disagree; each screen costs a fixed number of queries,
however many projects or people there are.

## Architecture

One Lambda, `backend/tracker/`, in four layers. Each layer only calls the one below it.

```
request -> function.py      Lambda entry: one connection per warm instance, migrate on cold start
        -> api/             parse the event, match the route table, authorise, map errors to status codes
        -> services/        every business rule; raises domain errors, knows nothing about HTTP
        -> store/           Postgres connection and transactions, migrations, integrity queries
        -> PostgreSQL       constraints refuse bad rows even if a service has a bug
```

- **`api/routes.py`** is the one route table: method, path, which roles may call it.
  `api/app.py` reads the token, then **re-reads the user's role from the database** on
  every request, so a demoted user's old token can't keep powers it no longer has.
- **`api/errors.py`** is the one table from domain error to status: 400 validation,
  401 not signed in, 403 role can't, 404 missing *or not yours* (identical messages,
  so ids can't be probed), 409 state refuses (over capacity, dependency loop), 503
  database down.
- **`services/`** holds every rule, and the rule tests call it directly, never through
  HTTP. That is what proves the layers are separate.
- **`store/postgres.py`** opens every connection in autocommit mode and wraps every
  write in `atomic()`. psycopg's default would silently never commit after a read;
  `tests/backend/test_store_commits.py` guards that.
- **Wire format:** JSON is camelCase; Python and SQL are snake_case. `services/views.py`
  names every output field, so a password hash can never leak.

### Data model (`backend/tracker/store/migrations/001_init.sql`)

`users`, `projects`, `assignments` (bookings, "Resources" on screen), `milestones`
(deliverables), `milestone_dependencies`, `tasks`, `time_entries`, `project_requests`,
`audit_log`, `notifications`. Money is integer cents. Nothing is deleted: a trigger
refuses `DELETE` on every table, and records are archived and reactivated instead.

The database itself refuses whatever one row can prove wrong:

- a malformed username, a negative budget, or a 41-hour booking;
- overlapping bookings for one person on one project;
- a task on another project's deliverable, or time logged on another project's task;
- a dependency across projects;
- someone approving their own time.

Rules that need several rows, the clock or the caller live in the services.

**Integrity check** (`store/integrity.py`, `GET /admin/integrity-check`): five queries
that must always return no rows:

- no dependency loops;
- nothing live under an archived project;
- every record has its creation audit row;
- no time logged outside a booking;
- no signed-off deliverable with unfinished work.

They run after **every** test.

### Business rules

- **Accounts:** admins create them. The server generates the username (initials plus 6
  digits, never changed) and a 12-character password, shown once and changed at first
  login. Passwords are hashed with PBKDF2-SHA256 at 600,000 rounds.
- **Projects:** admins create projects. A manager runs their own: description, dates,
  budget, status, bookings, deliverables, tasks.
- **Tasks:** employees move the tasks assigned to them and log time on them. They can't
  log on a future date or outside their booking, or more than 24 hours a day.
- **Capacity:** logging past a person's weekly capacity is refused unless their manager
  switched overtime on. Booking someone past capacity is allowed but flagged.
- **Approval:** the line manager or an admin approves logged time. Only approved time
  is charged.
- **Deliverables:** their status is computed. Sign-off is refused until all tasks and
  dependencies are done, and reopening work clears the sign-off down the chain.
- **Audit:** every change writes an audit row in the same transaction, and notifies
  the people above the actor (in-app bell).

## Running it locally (on the VDI)

```sh
source ~/.bashrc && ./bin/start-dev.sh          # Postgres, LocalStack, deploys the Lambda, proxy :3001, Vite :3000
curl http://localhost:3001/api/tracker/health   # {"status": "ok"}
```

The first admin is `AD000001`. Its generated password differs per environment:

```sh
AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_ENDPOINT_URL_S3=http://s3.localhost.localstack.cloud:4566 \
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1 \
  terraform -chdir=infra output -raw bootstrap_admin_password
```

## Tests

Local PostgreSQL must be running. The suite builds its own databases (`tracker_test`
and three scratch ones) and never touches the app's.

```sh
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # once
.venv/bin/pytest -q                                                        # 369 passed
.venv/bin/pytest -q tests/backend/test_work.py                             # one file
.venv/bin/pytest -q -k capacity                                            # tests whose name matches
.venv/bin/pytest --cov --cov-report=term-missing                           # coverage: 96% of our code
```

Against the rubric's coverage goals (`docs/full-stack.md`): backend 96% (goal 80%);
the API layer (`api/`: routing, auth, error mapping, every handler) 100% (goal 90%), with
every route in the table called over HTTP by the two walk tests.

| File | What it proves |
| --- | --- |
| `test_schema.py`, `test_no_delete.py` | Postgres refuses each bad row by its named constraint; nothing can be deleted |
| `test_migrate.py`, `test_store_commits.py`, `test_function.py` | migrations are all-or-nothing and run once; writes really commit; cold start, first admin, 503s |
| `test_integrity.py` | each integrity query catches a deliberately planted violation |
| `test_users.py`, `test_audit.py`, `test_projects.py`, `test_work.py`, `test_requests.py`, `test_dashboard.py` | every business rule, calling services directly |
| `test_api.py` | routing (both path shapes), every non-public route needs a token, role from the database, 404 not 403, error and list shapes, no DELETE anywhere |
| `test_api_audit_walk.py` | calls every write route and checks each one left an audit row |
| `test_api_read_walk.py` | calls every read route and checks its shape; audit-log filters; malformed queries and bodies; a crash is a bare 500 |
| `test_domain.py`, `test_security.py` | validation, money, the Eastern-time clock, hashing (and that production stays at 600k rounds), tokens |

**Known gaps (the uncovered 4%):**

- guard branches in the services for ids that don't exist or records already archived
  (for example, archiving an archived task); the same guards are tested on other records;
- the database-down branch inside a request (the cold-start one is tested);
- the frontend, which is not built yet;
- 2 of 16,184 requests at 25 users on AWS got no HTTP response (status 0) and are unexplained;
  the Lambda logged no error for them (below).

### Load test

`tools/loadtest.py` (standard library, like the demo) runs N simulated managers
looping over the dashboard's reads, then a burst of logins, and prints throughput,
p50/p95/max per endpoint and failures by status. It exits 1 if anything failed.

```sh
TRACKER_ADMIN_PASSWORD=... python3 tools/loadtest.py                        # 10 users, 20 s
TRACKER_ADMIN_PASSWORD=... python3 tools/loadtest.py --users 25 --seconds 60
```

Results on AWS (CloudFront, Lambda at 512 MB, Aurora Serverless v2; 13 Oct, seeded data):

| Users | Reads | Throughput | p50 / p95 | Failed | Login p50 / p95 |
| --- | --- | --- | --- | --- | --- |
| 10 | 4,190 | 209 req/s | 28–35 / 40–50 ms | 0 | 1.10 / 1.13 s |
| 25 | 16,184 | 539 req/s | 35–41 / 57–65 ms | 2 (0.01%, no response) | 1.11 / 1.13 s |

Inside Lambda a warm request takes 6 ms (p50) and 13 ms (p95), from the CloudWatch
`REPORT` lines; the rest is the network to CloudFront and back.

**What the load test found.** The `max` column (7 to 11 s) was cold starts, and the
CloudWatch logs showed them as a staircase: 1.3, 2.4, 3.4, 4.5 ... 9.8 s, each about 1.07 s
after the one before. Every cold start re-hashed the bootstrap admin's password
(600,000 rounds, about 1 s) inside the migration's advisory lock, even though the
admin already existed, so simultaneous cold starts queued. With the lock's 10 s timeout,
a bigger burst would have started answering 503. Fixed 13 Oct: `bootstrap_admin` checks
for the admin before hashing (test: `test_bootstrap_admin_skips_the_hash_once_the_admin_exists`).
Measured on AWS after the fix (25 users, same day): 25 simultaneous cold starts each
answered in 0.17 to 0.30 s, with no queue.

A login costs about 1.1 s whatever the load, because the password hash is deliberately
slow and CPU-bound. 1024 MB of Lambda memory would roughly halve it.

Results on LocalStack (VDI, 13 Oct, seeded data):

| Users | Reads | Throughput | p50 / p95 | Failed | Login p50 |
| --- | --- | --- | --- | --- | --- |
| 10 | 1,348 | 60 req/s | 108 / 225 ms | 0 | 1.0 s |
| 15 | 1,819 | 59 req/s | | 3 (0.2%) | 1.1 s |
| 25 | 2,120 | 35 req/s | 340 / 2,700 ms | 58 (2.7%) | 2.3 s |

Every failure was a 500 from LocalStack itself, not from our code: its container
has a 1,024 open-file limit, and past about 15 parallel Lambda environments it logs
`Could not start new environment ... Too many open files`. Our Lambda logged no
unhandled errors, and the demo and integrity check were clean afterwards.
Throughput levels off at about 60 req/s because the emulator runs everything on
one VDI. On AWS the same 10 users got 3.5 times the throughput with no failures.

## Live demo from the terminal

`tools/demo.py` talks to the API over HTTP, so it works locally and against the
deployed URL (set `TRACKER_API`).

```sh
TRACKER_ADMIN_PASSWORD='<admin password>' python3 tools/demo.py seed   # once
TRACKER_ADMIN_PASSWORD='<admin password>' python3 tools/demo.py demo
```

`seed` creates two managers and four employees (password `Demo-pass-2026`), three live
projects, bookings, a dependency chain, tasks, a week of logged time, requests and an
archived project. `demo` prints the seven answers, then tries to break the rules: over
capacity, a future date, another manager's project, an employee creating a project, a
dependency loop, signing off unfinished work, DELETE, no token. It ends on the
integrity check.

## Deploying to AWS

```sh
./bin/setup-participant.sh       # fresh temporary AWS credentials (they expire)
./bin/deploy-backend.sh          # terraform apply: Lambda, Aurora, CloudFront, secrets
./bin/deploy-frontend.sh         # once the frontend exists; prints the CloudFront URL
terraform -chdir=infra output -raw bootstrap_admin_password   # right after the AWS deploy
```

The first request after a deploy migrates Aurora and creates `AD000001`.

## Trade-offs and assumptions

- **Archive instead of DELETE.** The rubric asks for DELETE returning 204. We archive,
  because deleting a project would make every cost figure that referenced it
  unreconstructable. There is no DELETE route and the database refuses deletes.
- **PATCH for edits:** a manager may change only some fields of a project.
- **Logged time, not payroll.** There's no clock-in, pay periods or overtime pay; those
  belong to HR systems. Cost is minutes x the hourly rate (salary / 2080) frozen on the
  entry when logged.
- **Cost arithmetic in SQL.** Budget and risk figures sum `minutes x rate / 60` in SQL,
  one aggregate query rather than a row-by-row loop, using the same rounding as
  `domain/money.py`. The budget test pins the two together.
- **No refresh tokens.** Tokens expire after 8 hours, then sign in again. A token
  can't be revoked, so the role is re-read from the database on every request.
- **Secrets in Terraform state.** The JWT secret and the first admin's password are
  generated by Terraform, so they are in its state file. The forced password change
  limits the exposure.
- **"Today" is Eastern time,** from one constant (`domain/clock.py`).
- **Lambda memory is 512 MB,** so a 600k-round PBKDF2 login takes about 0.5 s rather
  than about 2 s.
- **Known disclosure:** a manager who books one person can work out that person's rate
  from planned cost.

## Contributing

See the [CONTRIBUTING](./CONTRIBUTING.md) resource for more details.

## License

This library is licensed under the MIT-0 License.
See the [LICENSE](./LICENSE) resource for more details.

## Roadmap

See the
[open issues](https://github.com/citi/coding-workshop-participant/issues)
for a list of proposed roadmap features (and known issues).

## Security

See the
[Security Issue Notifications](./CONTRIBUTING.md#security-issue-notifications)
resource for more details.

## Authors

The following people have contributed to this workshop:

* Colin Heilman - [@heilmancs](https://github.com/heilmancs)
* Eugene Istrati - [@eistrati](https://github.com/eistrati)
* Isaiah Cornelius Smith - [@corneliusmith](https://github.com/corneliusmith)
* Juan Arevalo - [@jparevalo27](https://github.com/jparevalo27)
* Michael Annucci - [@michael-annucci](https://github.com/michael-annucci)

## Feedback

We'd love to hear your feedback! Please:

* ⭐ Star the repository if you find it helpful
* 🐛 Report issues on GitHub
* 💡 Suggest improvements
* 📝 Share your experience
