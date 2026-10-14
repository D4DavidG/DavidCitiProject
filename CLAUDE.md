# CLAUDE.md

Working notes for Claude Code: ACME Project Tracker, Citi coding workshop, Tue 13 to
Thu 15 Oct 2026. A solo build by David. The product spec is `private/PROJECT_PLAN.md`
(gitignored so later commits leave it out; earlier copies are still in the public
repo's history), and section numbers below (§) refer to it. If
that file is missing, ask David for it rather than reconstructing it. `MVP.md` is the
short, public scope summary. This file holds what the spec does not: the stack, how this
repo actually runs and deploys, the traps found by reading it, and how to work with
David.

**Rule:** if something here goes out of date, fix it in the same commit as the code that
outdated it.

### Where things stand (updated 14 Oct, evening)

- **Built:** backend, database and every website screen in `MVP.md`. All of it is
  deployed to AWS and checked there, except five 14 Oct changes that are committed but
  not deployed (Hours and Minutes boxes, **Copy username and password**, the login-timing
  fix at `services/users.py:159-164`, the pull board with migration
  `002_task_limit.sql`, and the bell's 10 s check with its pop-up): on AWS after the next
  `./bin/deploy-backend.sh` and `./bin/deploy-frontend.sh`. The full list is at the top of
  `docs/DEMO-RUNBOOK.md`. Three charts, built 14 Oct and not yet deployed (plain MUI
  boxes, no chart library; the server sends every percentage): a deliverables timeline on
  each project, and a budget chart and this week's workload on the dashboard
  (`components/charts/`). Also not deployed: an employee's project work now notifies the
  project's manager too (`services/audit.py`). Also not deployed: **requests for
  everyone** (migration `003_request_kinds.sql`; spec
  `docs/superpowers/specs/2026-10-14-requests-design.md`): employees ask their line
  manager for a higher task limit, overtime or anything else; managers ask the admins
  for a new project, to archive one, or anything else; approving applies the change and
  the asker's bell says so. Tests: 490 backend, 297 website, and 22 Playwright browser
  tests in 8 files (`e2e/demo.spec.js` walks the demo; `e2e/pull.spec.js` takes and
  puts back a task; `e2e/requests.spec.js` asks and answers a request;
  `e2e/tour.spec.js` screenshots every screen at desktop and phone width;
  `timeline`, `budget` and `workload` specs check the charts).
- **Read these first:**
  - `docs/GUIDE.md`: David's one-stop guide (demo scripts, how to reach everything,
    evaluator Q&A);
  - `docs/REPOINFO.md` (what to say, with every claim checked against the code,
    and a "say this, not that" table) and `docs/DEMO-RUNBOOK.md` (what to run and click
    live, the tests, Plan B); `tools/tracker.http` holds read-only API requests for VS
    Code's REST Client;
  - `docs/OVERNIGHT-REPORT.md`: what was built on the night of 13 to 14 Oct, every
    decision made for David, and what isn't verified;
  - `docs/superpowers/plans/2026-10-13-manual-verification.md`: the AWS checklist,
    all steps done;
  - `docs/superpowers/specs/2026-10-14-email-and-sms-findings.md`: why AWS can't send
    email or texts (role and network), and the design for any future reset flow;
  - `docs/superpowers/specs/2026-10-14-pull-board-design.md`: the pull board (Take this,
    a per-person task limit), built 14 Oct (66 routes; three migration files since
    `003_request_kinds.sql`).
- **Who does what:** Claude edits, tests and commits when asked. David pushes and
  deploys: `.claude/settings.local.json` denies Claude `git push`, the `bin/` deploy
  and cleanup scripts, and `terraform apply`/`destroy`. Every other shell command runs
  without a prompt (a blanket `"Bash"` allow, added 14 Oct at David's request; delete
  that line to go back). Hand him the exact commands for the denied ones.
- **Open items:**
  - deploy the three charts and requests for everyone: `git push origin David`, then
    `./bin/deploy-backend.sh` (the server's `plannedPercent` and `pendingPercent`, and
    migration 003 on the first cold start) and `./bin/deploy-frontend.sh`;
  - "Mark all as read" checks only the notifications on the current page;
  - notifications seeded before 14 Oct keep their old wording (no day for logged time);
  - the evaluators haven't yet been asked whether archive counts as the D in CRUD (§8);
  - old sessions survive a password change: tokens carry only the user id and `verify`
    never checks when one was issued (`services/tokens.py:47-59`); fix with
    `password_changed_at`;
  - changing your own email needs no current password (`update_self` in
    `services/users.py`); it matters once an emailed reset exists;

---

## The stack (decided 13 Oct)

### Decisions

These were settled in a grilling session on 13 Oct. They override any plan text that
disagrees.

| Question | Decision |
| --- | --- |
| Manager model (plan §2.1) | (a) org chart. `users.manager_id` is the line manager. Any manager staffs anyone onto projects they manage. Employees never choose projects |
| Accounts | Admin creates accounts. The server generates the username (`^[A-Z]{2}[0-9]{6}$`, initials plus 6 digits, **never changes**) and a 12-character password (`secrets`), shown once. Login is by username. A forced change on first login (every route but change-password and "me" answers 403). Self-edit: name and email only. Forgotten password: admin reset. Emailed reset code is a stretch goal. Checked 14 Oct: the Lambda can't send email or texts. Its role has no `ses:` permission, and it sits in a VPC with no NAT gateway or email/SNS endpoint, which our role can't create |
| Consumed cost (§2.2) | **Time logged on tasks** (date, minutes, note), as in Jira and OpenProject, not Workday. Only the task's assignee logs. Only approved entries cost money, at the `hourly_rate_cents` frozen on the entry when logged. Clock in/out, pay periods, overtime review and overtime premiums were **removed on 13 Oct** as payroll features |
| Overtime | Each person has `weekly_capacity_hours` (default 40) and `overtime_allowed` (default off), set by their line manager or an admin. Logging past capacity in a Mon-to-Sun week is refused (409) unless allowed; when allowed, the week is flagged |
| Over-allocation | Bookings above a person's capacity are **allowed and flagged** (question 5), not refused. One booking is 1 to 40 h/week; no overlapping live bookings per person per project |
| Approver | The line manager (`users.manager_id`) **or any admin** approves or rejects logged time. Nobody approves their own |
| Tasks | Deliverables hold tasks (estimate, assignee, To Do / In Progress / Done). The manager creates; employees pull Ready tasks (Take this, up to their `task_limit`, default 2); managers can still assign. The assignee moves status and logs time. Deliverable status is **computed**; the manager signs off, refused until all tasks and dependencies are done |
| Requests (14 Oct) | `project_requests` gains a `kind` (migration 003). Managers ask the admins (new project, archive a project, free text); employees ask their line manager or an admin (task limit, overtime, free text). Who may decide = who is notified when it is sent. Approving runs the existing service (`archive_project`, `set_capacity`) in the same transaction |
| Invariant | `GET /admin/integrity-check`: 5 queries that must return no rows (no dependency loops; nothing live under an archived project; every record has its CREATE audit row; no time logged outside a booking; no signed-off deliverable with unfinished work). Runs after every database test |
| Schema | `TEXT` + `CHECK` instead of `ENUM`; numbered migrations in `store/migrations/`. Full design: `docs/superpowers/specs/2026-10-13-database-design.md` |
| Wire naming (§2.4) | camelCase in JSON, snake_case in Python and Postgres, converted only in `api/http.py` (incoming keys, computed results) and `services/views.py` (each record's fields, by name) |
| Removal | `POST /{thing}/{id}/archive` and `/reactivate`. No DELETE verb anywhere, and tests assert it. Explain in the README why this departs from the rubric's DELETE/204 |
| Update verb | PATCH, with partial bodies. The server refuses fields the caller's role may not change |
| Storage | **Postgres only, no in-memory store.** Tests run against their own database, `tracker_test`, with each test rolled back |
| Tests | Backend: pytest with pytest-cov. Frontend: Vitest with React Testing Library (Jest-compatible API), plus `@vitest/coverage-v8`. End to end: Playwright |
| Coverage | Evaluators will ask why coverage is what it is. Print the numbers, and list each uncovered area in the README with a reason |
| Scope | Everything in `MVP.md` ships. Nothing is pre-cut; evenings absorb the overrun. Out of the MVP: dark mode, emailed password reset |
| Product framing (13 Oct, evening) | Portfolio and resource management (Float, Harvest Forecast, Smartsheet RM), not task tracking (Jira, Trello). Screen order: dashboard (`GET /dashboard/projects`: status, risk, budget per project, at risk first), then the allocation grid, then a task board last and only if time |
| Allocation grid | People x weeks, sorted by each person's worst week ("peak over by"); `?overOnly=true` keeps anyone over in any shown week; each cell lists the projects its hours come from; paginated by person |
| "Resources" on screen | Means bookings (person x hours/week on a project), as in the brief's CRUD list. People stay "People" |
| Rejected from the phone notes (13 Oct) | A `/admin/capacity-check` that must return zero: it contradicts question 5, where over-allocation is allowed and flagged. "No time entry, derive spend from elapsed weeks": consumed cost stays real approved time |

The database design, with the full SQL, is in
`docs/superpowers/specs/2026-10-13-database-design.md`. It overrides plan §5.

### Where the files go

```
backend/tracker/                 # one Lambda; the URL segment is /api/tracker/...
├── function.py                  # handler(event, context): normalise path, then api.dispatch()
├── requirements.txt             # psycopg[binary] only
├── .gitignore                   # the pip packages start-dev.sh vendors here (trap 4)
├── store/
│   ├── migrations/              # 001_init.sql, 002_task_limit.sql, 003_request_kinds.sql; never edit one that has run on Aurora
│   ├── migrate.py               # applies new migrations on cold start, under an advisory lock
│   ├── integrity.py             # the 5 integrity queries
│   └── postgres.py              # connection, atomic(), queries; psycopg errors -> domain errors
├── domain/
│   ├── errors.py                # OverAllocated, NotFound, DependencyCycle, ...
│   ├── money.py                 # the only code that parses or formats cents
│   └── models.py                # plain dataclasses
├── services/                    # business rules, no framework or HTTP imports
│   ├── auth.py  users.py  projects.py  deliverables.py  resources.py
│   ├── timesheets.py  budget.py  dashboard.py  requests.py
│   └── audit.py                 # record_change(): audit row + notifications
└── api/
    ├── routes.py                # the one route table: method, path, roles, handler
    ├── app.py                   # dispatch() and authorise(): token check, then the role re-read from the DB
    ├── errors.py                # the one exception -> status table
    ├── handlers.py              # one function per route
    └── http.py                  # event parsing, camelCase <-> snake_case (record fields: services/views.py)
tests/backend/                   # pytest; conftest rebuilds tracker_test, runs the integrity check on teardown
requirements-dev.txt, pytest.ini  # repo root: test tooling (venv in .venv/)
frontend/src/
├── services/request.js          # the one fetch wrapper; plus one file per resource
├── auth/                        # AuthContext, session probe, RequireRole
├── theme/                       # MUI theme
├── components/                  # shared: DataTable/CardList, BudgetBar, StatusChip, ...
└── pages/                       # one folder per screen in MVP.md
frontend/src/**/*.test.jsx       # Vitest + RTL, beside the code they test
```

Folder names to avoid (trap 3): `lib`, `assets`, `build`, `dist`, `env`, `logs`, `tmp`,
`coverage`. Check new paths with `git check-ignore -v`.

### Build order, one layer at a time, each tested before the next

1. **Database:** `store/migrations/001_init.sql`, `migrate.py`, `integrity.py`. Proof: one
   test per constraint showing Postgres refuses bad rows, and each integrity query
   catching a planted violation.
2. **Domain:** errors, money, models. Proof: unit tests for money parsing.
3. **Store:** `postgres.py` with `atomic()`. Proof: round-trip tests against
   `tracker_test`.
4. **Services:** every rule in `MVP.md`, plus `record_change`. Proof: rule tests that
   never import `api`, with the integrity check run in teardown.
5. **API:** route table, `authorise`, error map, serialisers, `function.py`. Proof: HTTP
   tests covering both path shapes and 404-not-403.
6. **Local deploy:** `curl` through the proxy on 3001 (fix traps 1 and 2 here).
7. **Seed:** replayed through the services, with edge cases (a week booked past capacity, an employee at capacity with overtime off,
   time pending approval, an overdue deliverable, a deliverable ready for sign-off, an over-budget project, an archived project).
8. **Frontend:** `request.js` and auth first, then the manager dashboard, the allocation
   grid, project detail with deliverables, the dependency view, and a task board last.
9. **AWS deploy,** then the checks in §7.

---

## 1. Working with David

David has to explain every line of this project to Citi evaluators, live, including the
parts nobody typed by hand. That shapes everything:

- **Explain as you go.** For every change, say what changed, why, where it sits in the
  request path (route, auth check, service rule, repository, Postgres, response), and
  which alternative you rejected. Plain words first, then the technical term.
- **Verify, don't assert.** The evidence must match the claim: test output with the
  count, `curl` against the running server, a request that breaks a rule and shows the
  refusal. A clean build is not a working feature.
- **End every task with two lists:** verified (and how), and not verified (and why).
  Layout, colour in context and hover states always go in "not verified".
- **Every behavioural fix ships with the test that fails without it.**
- **Brevity outranks completeness.** A feature nobody can explain is worse than no
  feature. The seven client questions come before anything clever.
- **Disagree with evidence.** If the plan is wrong, show the output that proves it.
- **Keep the README's architecture notes current.** When a layer is finished, add a few
  lines on it in the same commit. That is David's script for the code walkthrough.
- Don't commit, push or deploy unless asked. Follow the build order (§9): the API is
  stable before the UI starts.

Who David is, for priorities: UCF CS senior (graduating Dec 2026), Master's next spring.
PM and tech lead on Knights Counsel (a permission-aware RAG agent for a university legal
office), and PM and frontend lead on SimpleBank, the four-day build behind the workshop
playbook. Site: d4davidg.github.io, "building systems that tell you why they work".
David's angle here: a UI that looks finished, requirements visibly traced to screens,
and business rules you can watch being enforced.

## 2. What we are building

An ACME Inc. project tracker that answers seven client questions, each on a visible
screen. This list is also the demo running order:

1. Status of each active project: project list.
2. Projects at risk of missing deadlines: dashboard panel.
3. Resource allocation across projects: allocation grid, person by week.
4. Key deliverables and completion: milestone timeline.
5. Over-allocated team members: projects and hours per person per week, flagged past capacity.
6. Dependency chain between deliverables: dependency view.
7. Budget consumed versus planned: budget bar.

The brief fixes the stack: React with React Responsive and Material UI, Python, and
PostgreSQL, deployed to AWS (Lambda, Aurora, S3, CloudFront) through this repo's
Terraform.

### The brief's feature list (the workshop email outranks the plan)

The organisers' email is the requirement. The plan is our design for meeting it. When
they disagree, the email wins. Use the brief's own words in the UI, the README and
the demo, so evaluators can tick items off without translating:

| Brief says | We build | Where it shows |
| --- | --- | --- |
| User authentication and authorization | Username login, generated password changed on first login, hashed passwords, JWT with expiry, role re-read from DB | Login screen |
| Role-based access control | Admin / Manager / Employee, one route table (plan §3, §7) | Nav differs per role; refusals in the demo |
| CRUD: projects | `projects` | Project list and detail |
| CRUD: deliverables | `milestones` table. **Label it "Deliverables" on screen** | Deliverables tab, timeline, dependency view |
| CRUD: resources | `assignments` (people x hours per week). **Label it "Resources"** | Resources tab, allocation grid |
| CRUD: budget tracking | `budget_cents` plus derived planned and consumed cost | Budget bar |
| Search and filter | Name search and status filter on every list, all server side and paginated | Every list screen |
| Responsive design, mobile and desktop | `react-responsive` breakpoints: tables become cards on phones, the grid scrolls sideways | Demo once at phone width |
| "Real-time visibility" | Dashboard plus notifications, refreshed by polling (no websockets on Lambda URLs) | Dashboard, bell icon |
| Git, Terraform, shell scripts, AWS serverless | `bin/*.sh` + `infra/` only, no hand-clicked console resources | README deploy section |

"D" in CRUD is archive and reactivate, never a hard delete (§8 below).

### Audit log and notifications (David's requirement, 13 Oct)

**Every successful change writes one audit row, and that row notifies everyone above
the actor.** That covers every create, edit, archive and reactivate: users (account
created, role or title changed, password changed or reset), projects, deliverables,
resources, budget, dependencies, tasks (created, assigned, claimed from the board, put
back, status moved), time entries (logged, edited, approved, rejected), capacity,
overtime and task-limit settings, and requests of every kind and their decisions (a
decision also notifies the asker, through `record_change(..., also_notify=)`). Reads
are not logged.
Refused requests (403, 404, 409) changed nothing, so they are not logged either.

| Actor's role (stored in the DB at the time) | Who is notified |
| --- | --- |
| Employee | Their line manager (`users.manager_id`), every admin and, when the change is to a project's work (task, logged time, booking, deliverable), that project's manager (`projects.manager_id`; added 14 Oct at David's request) |
| Manager | Every admin |
| Admin | Every *other* admin |

Edge cases, decided so code doesn't guess: an employee with no manager notifies the
admins only. A lone admin's action notifies nobody, but the audit row is still written.
Archived users receive nothing. "Line manager" is `users.manager_id` (decision (a),
in "The stack" above).

How it is built, so it can't be forgotten:

- **One service function, `record_change(actor, action, entity_type, entity_id, before,
  after)`,** called inside the same `store.atomic()` transaction as the change. It
  inserts the `audit_log` row and its `notifications` rows together. Change, audit and
  notification commit together or not at all.
- **Recipients come from the stored role**, never the token (§9).
- **Snapshots use the same explicit serialisers as responses.** `password_hash` never
  appears. Notification text is a one-line summary ("Ana Ruiz changed the budget of
  Apollo"), never the before/after state, so a manager never sees salary through it.
- **Append only.** A Postgres trigger refuses UPDATE and DELETE on `audit_log`.
  Notifications are marked read, never removed.
- **Tests:** one per row of the table above plus the two edge cases. One test also
  calls every mutating route and asserts that each wrote at least one audit row (one per
  entity changed: approving a request writes two). Integrity query 3 also fails any
  record with no CREATE row. Add a route and forget `record_change`, and the suite fails.

The `audit_log` and `notifications` tables are in the database spec
(`docs/superpowers/specs/2026-10-13-database-design.md`).

Routes (add to the plan §7 table): `GET /notifications` (own only, paginated,
`?unread=true`), `GET /notifications/unread-count`, `POST /notifications/{id}/read` (404
if not yours), `POST /notifications/read-all`. All require any authenticated user.
`GET /admin/audit-log` stays admin only, with filters by actor, entity and date.

UI: a bell with an MUI `Badge` unread count in the app bar, polled every 10 s while the tab is visible, at once on return, and after
each write. Add a notifications page, and an admin audit-log page with filters. These
are in-app notifications only. Email notifications stay out of scope (plan §16).

Demo moment: an employee changes their own name, the manager's bell shows 1, and the
admin's audit log shows the before/after state.

## 3. Where things run (decided 13 Oct)

| Machine | Use |
| --- | --- |
| **VDI** (Amazon WorkSpaces, Ubuntu 22.04) | Everything that executes: setup scripts, `start-dev.sh`, tests, deploys, the demo |
| Windows laptop | Reading and editing only. Don't run `bin/` scripts or Terraform from it |

Why not Windows:

- Every `bin/` script assumes Ubuntu (`apt`, `snap`, `systemctl`, `ss`, `sudo`,
  `mongod --fork`).
- Terraform builds the Lambda zip on whichever machine runs it (`build_in_docker =
  false`, `infra/lambda.tf:14`). A Windows deploy ships Windows wheels of
  `psycopg-binary` to a Linux Lambda, which crashes on import.
- After `setup-environment.sh`, the VDI's default Python is 3.13 (`PYENV_VERSION`,
  `bin/setup-environment.sh:13`), the same as the Lambda runtime. Before it, the VDI has
  3.10. The laptop has 3.14.

Work happens on branch `David`. The VDI is wiped after the workshop, so push to GitHub
at least every evening.

## 4. Environment

| Setting | Value |
| --- | --- |
| AWS region | `us-east-2` (LocalStack always uses `us-east-1`) |
| Event ID | `01a127f2` |
| Participant ID | `c7dabfc1` (no `u`; the `u` belongs only to the WorkSpaces username) |
| Participant code, LocalStack token | In `~/.bashrc` on the VDI only. Never in the repo or a commit |

| Port | What |
| --- | --- |
| 3000 | Vite dev server (React) |
| 3001 | `bin/proxy-server.js`, forwards `/api/<service>/...` to the LocalStack Lambda URL |
| 4566 | LocalStack: fake AWS in Docker. Pro image, so it needs the auth token |
| 5432 | PostgreSQL 18 on the host: user `postgres`, password `postgres123`, database `postgres` |
| 27017 | MongoDB: installed but unused, because the requirements say Postgres |

Terraform injects these into every Lambda (`infra/locals.tf:98-114`):

| Variable | LocalStack | AWS |
| --- | --- | --- |
| `IS_LOCAL` | `true` | `false` |
| `POSTGRES_HOST` | `172.17.0.1` (the Docker bridge back to the host) | Aurora endpoint |
| `POSTGRES_NAME` / `_USER` / `_PASS` | `postgres` / `postgres` / `postgres123` | `codingworkshop` / `superadmin` / generated |

On AWS, add `sslmode=require` to the connection when `IS_LOCAL` is `false`.

### Scripts

| Script | What it actually does | Writes |
| --- | --- | --- |
| `setup-participant.sh` | Looks up the event's API via a DNS TXT record on `codingworkshop.net`, then trades participant ID and code for **temporary** AWS credentials. Needs `aws`, `curl`, `jq`, `dig` | `~/.aws/credentials`, and `ENVIRONMENT.config` (gitignored, holds the credentials) |
| `setup-environment.sh -d` | Installs the toolchain on Ubuntu 22.04. `-d` adds dnsmasq so `*.localhost.localstack.cloud` resolves locally. Idempotent, so rerun it on failure | log in `~/.local/share/workspace-setup/` |
| `start-dev.sh` | Rebinds Postgres and Mongo to `0.0.0.0` (pg_hba `trust`, dev only), starts LocalStack, deploys to it with Terraform, writes `frontend/.env.local`, starts the proxy on 3001, then runs Vite on 3000 in the foreground | `/tmp/tf-init.log`, `/tmp/backend-deploy.log`, `/tmp/npm-install.log`, `/tmp/proxy-server.log` |
| `deploy-backend.sh [aws\|local]` | `terraform apply`. Defaults to `aws`, and refreshes credentials first | |
| `deploy-frontend.sh` | `npm run build`, S3 sync, CloudFront invalidation, prints the URL | |
| `cleanup-environment.sh` | Zips the project to `s3://coding-workshop-tfstate-<id>/backup/`, then `terraform destroy`. Irreversible: never run it without asking | |

### First-time VDI setup

Run these after cloning our repo on branch `David`. The commented walkthrough was given in
chat on 13 Oct.

```sh
echo "export AWS_REGION='us-east-2'"           >> ~/.bashrc
echo "export EVENT_ID='01a127f2'"              >> ~/.bashrc
echo "export PARTICIPANT_ID='c7dabfc1'"        >> ~/.bashrc
echo "export PARTICIPANT_CODE='<from email>'"  >> ~/.bashrc
echo "export LOCALSTACK_AUTH_TOKEN='<token>'"  >> ~/.bashrc
source ~/.bashrc
./bin/setup-participant.sh && aws sts get-caller-identity
./bin/setup-environment.sh -d     # sudo password = VDI password; takes a long time
source ~/.bashrc
./bin/start-dev.sh                # done: "All Components Verified!" and :3000 loads
# End-to-end proof: cp -R backend/_examples/python-service backend/python-service,
# rerun start-dev.sh, curl http://localhost:3001/api/python-service (expect both DB
# versions), then delete that folder. Never commit it.
```

| Symptom | Fix |
| --- | --- |
| `'jq' is missing` | `sudo apt install -y jq` |
| `'aws' is missing` | Run `setup-environment.sh -d` first, then `setup-participant.sh` |
| `PARTICIPANT_URL not found` | Check `EVENT_ID`. Run `dig +short TXT codingworkshop.net`, and if `dig` is missing: `sudo apt install -y dnsutils` |
| `Workshop API returned HTTP 4xx` | Wrong participant ID or code |
| AWS calls fail later with `ExpiredToken` | Rerun `./bin/setup-participant.sh`. The credentials are temporary |
| Lambda logs `No module named 'psycopg'`, 502 through the proxy | `~/.local/bin/pip` ran Python 3.14, which has no `psycopg-binary` 3.2.3 wheel, and `start-dev.sh:342` hides the error. Fix: `python3 -m pip install --user --force-reinstall pip`, then check `pip --version` says 3.13 (fixed 13 Oct) |
| Setup summary: `Cannot start dnsmasq: port 5353 already in use` | Harmless if dnsmasq already holds the port. Check that `getent hosts x.localhost.localstack.cloud` returns 127.0.0.1 |
| `$'\r': command not found` | A script picked up Windows line endings: `sed -i 's/\r$//' bin/*.sh` |
| `PARTICIPANT_ID not found` from a script run by Claude or any non-interactive shell | Ubuntu's `~/.bashrc` returns early when not interactive, so `source ~/.bashrc` loads nothing. Export the variables in that command, or run it in your own terminal |
| `PARTICIPANT_URL` ends in `us-east-1` | `AWS_REGION` was unset, and the DNS TXT record has an entry per region. Set it to `us-east-2` and rerun |

## 5. How this repo turns code into a running API

**One folder directly under `backend/` is one Lambda.** Terraform finds Python services
by `backend/*/requirements.txt` (`infra/locals.tf:23-26`). The backend README says it
looks for `function.py`, which is wrong for Terraform, but `start-dev.sh` counts
`function.py`, so every service needs both files. The handler is `function.handler`, on
runtime `python3.13`, with 128 MB and a 300 s timeout. Folders starting with `_` are
skipped.

**Only that folder is zipped.** The plan's sibling folders (`backend/domain/`,
`backend/services/`, ... in §11) would deploy as nothing, and the API would crash on
`import domain`. All backend code lives inside one service folder:

All backend code lives inside that one service folder; the full tree is in "Where the
files go" at the top. Tests sit in `tests/`, outside `backend/` (trap 7), with pytest
`pythonpath = backend/tracker`. The name `tracker` is a proposal; rename it freely
before the first deploy.

**The same request arrives with different paths:**

```
local: browser :3000 -> proxy :3001 /api/tracker/projects/7
         proxy strips /api/tracker -> Lambda sees /projects/7 (possibly //projects/7)
AWS:   browser -> CloudFront /api/tracker* -> Lambda URL, path untouched
         -> Lambda sees /api/tracker/projects/7
```

The router has to normalise both: drop a leading `/api/tracker` and collapse `//`. Test
both shapes.

**Event shape** (Function URL, payload format 2.0):

- path: `event["rawPath"]`
- method: `event["requestContext"]["http"]["method"]`
- headers: `event["headers"]`, with lower-cased keys
- query: `event.get("queryStringParameters")`, which may be absent
- body: `event["body"]`, a string, base64-encoded when `isBase64Encoded` is true

The handler returns `{"statusCode", "headers", "body": json.dumps(...)}`.

**Local hot reload.** LocalStack mounts the service folder, so Python edits are live
without a deploy. Adding or removing a service, or changing Terraform, needs a deploy.
`start-dev.sh` only redeploys when it finds more services on disk than are deployed, or
none responding, so force a deploy with
`(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)`. Without
`ENVIRONMENT.config`, the app id falls back to `abcd1234` and Terraform renames every
resource.

**Lambda is not a server.** Concurrent instances don't share memory, and an instance is
wiped when it is recycled. What that means for the plan:

- There is no in-memory store (decided 13 Oct). State lives only in Postgres.
- Anything "generated on first run", such as the JWT signing key in §13, would differ per
  instance and cause random 401s. Use one stable secret: a Terraform `random_password`
  passed in as a Lambda environment variable, or a row in Postgres.
- Locks must live in Postgres. Migrations take `pg_advisory_xact_lock`, so two cold starts
  don't both migrate. Overlapping bookings are refused by an exclusion constraint, which
  holds under concurrency. The capacity check takes `SELECT ... FOR UPDATE` on the
  user's row, so two concurrent entries can't both slip under the limit.
- The Lambda and Aurora clocks are UTC. "Today", weeks and dates all use Eastern time
  (`America/New_York`), from one Python constant passed into every query that needs it.

## 6. Traps found by reading the code

Fix each one when the work reaches it, not before.

| # | Trap | Where | Fix |
| --- | --- | --- | --- |
| 1 | The proxy forwards only `accept`, `content-type`, `user-agent` and `host`, so **`Authorization` never reaches the Lambda locally**, and every authenticated call returns 401 | `bin/proxy-server.js:95-106` | Forward `authorization`, and also `content-length` if POST bodies arrive empty **Fixed 13 Oct** (`bin/proxy-server.js`). |
| 2 | Preflight answers `Access-Control-Allow-Headers: *`, but the Fetch spec never lets `*` cover `Authorization`, so the browser blocks the call before trap 1 even matters | `bin/proxy-server.js:41` | Call relative `/api/...` URLs through Vite's `server.proxy`, which is same-origin both locally and on CloudFront, so CORS never applies. Or list `Authorization, Content-Type` explicitly **Fixed 13 Oct**: the header list is explicit. |
| 3 | `.gitignore` silently drops any folder named `lib/`, `assets`, `build`, `dist`, `env/`, `var/`, `parts/`, `logs`, `tmp`, `coverage`, `target/` or `downloads/`, anywhere in the tree. For example, `frontend/src/lib/api.js` would never be committed. It also ignores `*.config` and `package-lock.json` | `.gitignore` | Avoid those names. When a file won't show in `git status`, run `git check-ignore -v <path>` |
| 4 | `start-dev.sh` pip-installs dependencies **into** the service folder, which leaves untracked clutter there | `bin/start-dev.sh:342` | Add `backend/tracker/.gitignore` for the vendored packages, and check `git status` after the first run **Fixed 13 Oct** (`backend/tracker/.gitignore`). |
| 5 | `npm run lint` fails: the config imports `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`, which aren't in `package.json` | `frontend/eslint.config.js:3-4` | `npm i -D` both **Fixed 14 Oct** (both installed; `npm run lint` is clean). |
| 6 | Vite silently moves to the next free port if 3000 is busy, so you can end up looking at a stale server | `frontend/vite.config.js` | Set `server.strictPort: true`, and keep exactly one listener per port (§11) **Fixed 14 Oct** (`strictPort: true`). |
| 7 | CI runs `bandit -r ./backend`. It fails on `assert` in tests (B101), `random` used for passwords (B311), string-built SQL (B608) and hard-coded seed passwords (B105/B106), and the red X shows on every push | `.github/workflows/python.actions.yml:27` | Keep tests in `tests/`, use `secrets` for the six-character password, use parameterised SQL only |
| 8 | The repo docs curl `https://localhost:3001`, but the proxy is plain HTTP | `docs/full-stack.md:121` | Use `http://` |
| 9 | The docs' local log command picks up your `us-east-2` region, but the functions live in LocalStack's `us-east-1` | `docs/full-stack.md:131` | Use the command in §11 |
| 10 | React 19 ignores `propTypes` at runtime, but the org's instructions still require them | `.github/instructions/react.instructions.md` | Write them as documentation; don't rely on them for validation |
| 11 | Postgres has no `CREATE TYPE ... IF NOT EXISTS`, and Aurora isn't publicly accessible, so the schema has to be applied from inside the Lambda | `infra/rds.tf` | Numbered migrations applied on cold start under an advisory lock, with `TEXT` + `CHECK` instead of enums (decided; see the spec) |
| 12 | Local Postgres is a single shared `postgres` database | | Tests hard-code their own database name. Never point the app at it |

## 7. Check on the first AWS deploy (Wednesday)

These are inferred from the Terraform but not yet observed. Check each against the
deployed URL:

1. **API 404s survive CloudFront.** `custom_error_response` rewrites 404 to
   `/index.html` with status 200 (`infra/cloudfront.tf:42-47`), and it applies to the
   whole distribution, API included. Our "not found or not yours" 404 may arrive as a 200
   carrying HTML. Likely fix: remove the block, and use `HashRouter` or a CloudFront
   Function for the single-page-app rewrites. **Observed 13 Oct** on the first deploy: with
   no `index.html` uploaded yet, an API 404 came back as S3's `403 AccessDenied` XML. The
   block is removed (`infra/cloudfront.tf`), and the frontend will use `HashRouter`. Recheck
   after the next `deploy-backend.sh`.
2. **Deep links.** S3 behind origin access control answers 403, not 404, for a missing
   key, so refreshing `/projects/7` may show an AccessDenied page. `HashRouter` avoids it.
   **Observed 14 Oct: it works.** The tour's deep-link refresh passed against CloudFront.
3. **`Authorization` reaches the Lambda on GET requests through CloudFront.** CloudFront
   treats that header specially. If it is dropped, switch to a custom header. **Observed 13
   Oct: it arrives.** `GET /auth/me` with a Bearer token returned 200 through CloudFront.
4. **Login latency.** A 128 MB Lambda gets a small slice of a CPU, so PBKDF2 at 600k
   rounds can take seconds there, even though it is fast in LocalStack. On 13 Oct one
   VDI core took 0.14 s, which estimates about 2 s at 128 MB, so `memory_size` is now
   512 (`infra/lambda.tf:11`), estimated at about 0.5 s. **Observed 13 Oct: 1.15 s** per
   warm login through CloudFront (15.9 s for the first one, with Aurora waking). Acceptable;
   1024 MB would roughly halve it if evaluators notice.
5. **First request after idle.** Aurora Serverless v2 with `min_capacity = 0`
   (`infra/rds.tf:27`) pauses itself. Resuming it, plus a Lambda cold start, takes many
   seconds. Warm the app up a minute before the demo.
6. **`btree_gist` on Aurora.** The migration runs `CREATE EXTENSION btree_gist`, which the
   no-overlap rules need. Confirm the first cold start applies `001_init` there.

## 8. Where the plan and the repo disagree

- **The §2 decisions are made** (13 Oct): see "The stack" at the top. Money (2.3) is
  integer cents.
- **§10 lists `implementation.md`, `testing.md` and `evaluation.md` to read.** They don't
  exist. That material is the three sections of `docs/full-stack.md`, which is the
  rubric.
- **The §11 ownership paths** become `backend/tracker/domain/` and so on (§5 above).
- **The rubric expects DELETE.** `docs/full-stack.md` asks for DELETE with 204 and says
  "deleted records are properly removed"; we archive instead (plan §4). Keep archiving,
  explain why in the README and the demo, and ask an evaluator early whether archive
  satisfies the D in CRUD.
- **The JUMP pre-training checklist PDF (now in `private/`) mentions FastAPI and
  MongoDB.** That is generic
  bootcamp material. The workshop email says Python and PostgreSQL, and the repo's
  Lambda handler is a plain `handler(event, context)`. Don't add FastAPI or MongoDB.
- **Plan §16 rules out email notifications.** That still holds. The in-app
  notifications in §2 above are a different feature, and they are in scope.
- **The rubric expects token refresh.** It lists "token expiration and refresh". We do
  expiry plus a clean re-login, and list refresh tokens as a deliberate omission (§16).
- **How scoring works.** Five technical scores (Implementation, Design, Code, Testing,
  Experience) and three soft-skill scores (Curious, Observant, Driven), each 1 to 10. The
  final score is the average of the two averages, and 9 or above is excellent.
- **Coverage targets:** 80% for backend and frontend, 90% for API and error paths, 100%
  of critical paths end to end. The README must cover the architecture, trade-offs,
  assumptions, test commands, results and known gaps.
- **Frontend test runner:** Vitest with React Testing Library, decided 13 Oct. Its API is
  Jest-compatible, which answers the rubric's "Jest".

## 9. Rules that don't bend

The detail is in the plan:

- Money is integer cents everywhere except on screen, and one module converts it (§2.3).
- Nothing is deleted: archive and reactivate. There is no DELETE route and no `delete`
  method, and tests assert their absence (§4). A Postgres trigger also refuses `DELETE` on
  every application table (`schema_migrations` has none).
- The invariant: the 5 integrity queries return no rows. Every database test's teardown
  checks it, and so does `GET /admin/integrity-check`.
- Answer 404, never 403, for something that exists but isn't yours, with byte-identical
  messages (§7).
- Authorise from the role stored in the database, never from the token's claim (§7).
- One route table and one `authorise()` (§7).
- One exception-to-status table (§7).
- Every error has the shape `{ "error": "..." }` (§7).
- Lists return `{ items, page, pageSize, total, totalPages }` (§7).
- Write endpoints return the new resource (§7).
- Serialise fields by name, never by dumping the model (§7).
- Services raise domain exceptions and import no framework. Rule tests never import
  `api` (§9).
- Frontend (§8):
  - one `request()` module for every backend call;
  - 401s handled in one place, with login exempt;
  - the session probed on load;
  - every storage access wrapped in try/catch;
  - MUI theme tokens for light and dark, each annotated with its contrast ratio;
  - field errors tied to their field with `aria-describedby`;
  - no money arithmetic in the browser.

## 10. Conventions

- **Python:** PEP 8, snake_case, and type hints plus docstrings on everything public
  (from `.github/instructions/`). Target 3.13; don't use 3.14-only features.
- **SQL:** values are always parameters. Table and column names that vary are composed
  with `psycopg.sql` (`store.postgres.insert/update/columns`), never f-strings. CI's
  bandit fails on string-built SQL (B608), and it was clean on 13 Oct.
- **React:** function components, camelCase names, PascalCase components, Airbnb style,
  PropTypes and JSDoc on components and public functions. Stay with JavaScript (`.jsx`),
  since the scaffold is JS.
- **Frontend packages (installed 14 Oct):** MUI 9 (`@mui/material`, `@mui/icons-material`,
  emotion), React Router 8 (`HashRouter`), react-responsive, prop-types; Vitest 5, React
  Testing Library, Playwright. CI fails on high-severity `npm audit` findings, so run it
  before adding anything else (0 on 14 Oct).
- **Frontend rules in practice:** every API call goes through `src/services/request.js`;
  only `src/services/format.js` turns cents, minutes and dates into text (and typed
  dollars into cents); field names are exactly the API's camelCase; forms are
  `components/FormDialog.jsx` (edit sends only changed fields); chart colours come only from
  `src/theme/chartColours.js`; MUI icons are named
  `…Outlined` in v9 (check `node_modules/@mui/icons-material/<Name>.js` exists).
- **Terraform:** snake_case, a comment on every resource, and `terraform validate`
  before committing.

## 11. Commands (VDI)

```sh
source ~/.bashrc && ./bin/start-dev.sh                         # start or repair everything
(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)   # force a LocalStack redeploy
curl http://localhost:3001/                                     # proxy lists deployed services
ss -ltnp | grep -E ':(3000|3001|4566|5432)'                     # exactly one listener per port

# Lambda logs in LocalStack (region and credentials must be LocalStack's)
AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
  aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --follow --format short

./bin/deploy-backend.sh && ./bin/deploy-frontend.sh            # AWS; prints the CloudFront URL
```

Tests (local Postgres must be running; they create and drop their own `tracker_*test`
databases and never touch `postgres`):

```sh
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # once
.venv/bin/pytest -q                                                        # prints the count
.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing           # with coverage
(cd frontend && npm test)                                                  # website: Vitest + RTL
(cd frontend && npm run test:coverage && npm run lint)
(cd frontend && E2E_ADMIN_PASSWORD=... npm run e2e)                        # Playwright; needs start-dev.sh + seed
# Screen tour: usernames come from `demo.py demo`; add E2E_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net for AWS
(cd frontend && E2E_MANAGER_USERNAME=... E2E_EMPLOYEE_USERNAME=... E2E_TOUR_DIR=/some/dir npm run e2e -- tour)
```

Demo against the running API (local proxy, or the deployed URL via `TRACKER_API`):

```sh
TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py seed   # once: users, projects, tasks, time
TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py demo   # the seven questions, then ten refusals
TRACKER_ADMIN_PASSWORD=... python3 tools/loadtest.py    # concurrent reads + logins; LocalStack fails past ~15 users (its file limit)
terraform -chdir=infra output -raw bootstrap_admin_password  # AD000001's first password (per environment)
(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)  # AWS console, signed in (lambda|logs|rds|cloudfront|s3)
```

## 12. Safe to ignore

- `data/`, `infra/eks.tf`, `infra/helm/`, and `infra/documentdb.tf` (off by default).
- `backend/_examples/java-service` and `backend/_examples/nodejs-service`.
- Every guide in `docs/` except `full-stack.md` and `validation.md`.
- Jupyter, Spark, Trino, kubectl and Helm, which `setup-environment.sh` installs for
  other tracks. Their install failures don't matter to us.
