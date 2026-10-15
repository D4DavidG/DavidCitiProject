# Project Guide: how it works, how to show it, how to answer questions

Everything about the ACME Project Tracker in one place: what exists, how to reach every
part of it, a demo script, and the questions evaluators are likely to ask. The README is
the formal write-up; this is the guide for presenting and explaining it.

Numbers here were measured on 13 and 14 Oct 2026. Re-run the commands in section 9 before quoting them.

**Contents:**

1. [The 30-second answer](#1-the-30-second-answer)
2. [What you can do with it right now](#2-what-you-can-do-with-it-right-now)
3. [The 5-minute demo](#3-the-5-minute-demo)
4. [How to reach everything](#4-how-to-reach-everything)
5. [What is on AWS, and how to see it](#5-what-is-on-aws-and-how-to-see-it)
6. [How one request travels through the system](#6-how-one-request-travels-through-the-system)
7. [The file map: what goes where](#7-the-file-map-what-goes-where)
8. [Questions you will probably be asked](#8-questions-you-will-probably-be-asked)
9. [Command cheat sheet](#9-command-cheat-sheet)
10. [Words, in plain English](#10-words-in-plain-english)

---

## 1. The 30-second answer

> ACME asked seven questions about their projects: which are at risk, who is
> over-allocated, how much budget is used, and so on. I read that as a portfolio and
> resource-management problem, the category of tools like Float and Harvest Forecast,
> not a task board like Jira. So the manager lands on a dashboard of every project's
> status, risk and budget, then an allocation grid that shows who is over capacity across
> projects. It's a React website and a Python API on AWS Lambda with a PostgreSQL
> database (Aurora). Postgres enforces what a constraint can express; rules that need the
> clock, sums or the caller live in the code; and five integrity queries catch what
> neither can prevent. About 600 automated tests check it, including a real browser
> walking the demo. I deployed it to AWS, load-tested it there, and found and fixed two
> real problems.

What's done and what isn't, honestly:

| Part | State |
| --- | --- |
| Database (10 tables, rules enforced by Postgres) | Done, tested, deployed to Aurora |
| Backend API (66 routes, roles, audit log, notifications) | Done and tested. 62 of the routes are on Lambda; the 4 pull-board routes and migration `002_task_limit.sql` arrive with the next `./bin/deploy-backend.sh` |
| Answers to all seven questions | Done, shown by `tools/demo.py` |
| Tests | Backend: 559 passing, 97% coverage, 100% for the API layer. Frontend: 325 passing, 94.7% of statements and 95.86% of lines covered, plus 24 browser (Playwright) tests in 9 files (14 Oct) |
| AWS deployment | Verified 13 Oct: health, login, token, 404s, demo, load test |
| Frontend (React, Material UI) | **Every screen built and tested**, live on AWS since 14 Oct (website deployed 11:35 UTC). The later 14 Oct changes (Hours and Minutes boxes, the Copy username and password button, the login-timing fix, the pull board, the bell's 10 s check with its pop-up, and the three charts: Workload and Budget on the Dashboard, the Deliverables timeline on each project) are local until the next `./bin/deploy-backend.sh` and `./bin/deploy-frontend.sh`. See `docs/OVERNIGHT-REPORT.md` for the rest |

---

## 2. What you can do with it right now

There's a **website** for the demo screens, and the **terminal** shows the rest as text
and JSON. Things you can show:

| You can... | How | Section |
| --- | --- | --- |
| Click through the app as a manager: dashboard, allocation grid, a project, its dependencies | The CloudFront URL, or `http://localhost:3000` locally | 3 |
| Run the whole story: the seven answers, then ten requests the rules refuse | `python3 tools/demo.py demo` | 3 |
| Prove the code works | `.venv/bin/pytest -q` (559 backend tests, ~20 s) and `cd frontend && npm test` (325, about a minute and a half) | 3, 9 |
| Show it's live on AWS | `curl .../health`, the demo against AWS, the AWS console | 5 |
| Show raw API answers (JSON) | `curl` with a login token | 4 |
| Look inside the database | `psql` or DBeaver, on the local copy | 4 |

---

## 3. The 5-minute demo

### Before you start (2 minutes, do it before they arrive)

Open a terminal on the VDI:

```sh
cd ~/DavidCitiProject
export TRACKER_API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker
read -rsp 'Admin password: ' TRACKER_ADMIN_PASSWORD; echo; export TRACKER_ADMIN_PASSWORD
curl -s $TRACKER_API/health
```

At the prompt, type the admin password you chose in checklist step 4.1 (nothing shows
while you type). The `curl` should print `{"status": "ok"}`. The first one takes about
15 s, because the database pauses itself when idle and has to wake up. That's why you
do it before they arrive.

If the URL ever changes (only if the infrastructure is destroyed and rebuilt), get it
with: `(set -a; source ENVIRONMENT.config; terraform -chdir=infra output -raw api_base_url)`.

Also open `README.md` in VS Code, and on GitHub in a browser tab.

### The website script (lead with this)

Open `https://d1gov8jpsxhwer.cloudfront.net` (locally,
`http://localhost:3000` once `./bin/start-dev.sh` is running). Sign in as the manager
Maria: her username is printed by `python3 tools/demo.py demo`, and the password is
`Demo-pass-2026`.

| Step | Click | Say |
| --- | --- | --- |
| 1 | You land on **Dashboard** | "A manager's first screen answers questions 1, 2 and 7: every project's status, whether it's at risk and why, and budget spent against planned. At-risk projects come first. The workload chart at the top: Ben's bar passes the capacity line, red, '+5 h over'. Under the counts, each project's budget as a bar against its own budget." |
| 2 | Point at Apollo's red **At risk** and its reason | "The reason is in words, worked out by the server from the deliverables, the dates and the money." |
| 3 | **Allocation** in the menu | "Questions 3 and 5: people down the side, weeks across. Ben is red: 45 hours booked against 40." Hover (or tap, on a phone) his cell: "25 on Apollo, 20 on Zeus. Neither manager could see that alone, because it spans projects." |
| 4 | Flip **Only over-allocated** | "The server filters and sorts the worst first. A week with nobody over says so; that's good news, not an empty table." |
| 5 | **Projects**, then **Apollo** | "Question 4: deliverables with progress computed from their tasks. The timeline shows when each deliverable lands, and the Today line." Open **Show tasks** on Build. |
| 6 | Point at **Sign off** on Build: greyed out, with "2 tasks left to finish" beside it | "Sign-off needs every task done and everything it depends on signed off. The screen says why it isn't ready, and the server enforces the same rule: the terminal demo shows it refusing." |
| 7 | **Resources** and **Budget** tabs | "Who is booked for how many hours, and the money: planned from bookings, spent from approved time." |
| 8 | **Dependency view** | "Question 6: read left to right. Launch is blocked until Build is done. Try to add a loop and the server says no." |
| 9 | Make the window narrow (or open it on your phone) | "Responsive: the menu becomes a drawer, tables become cards, the grid scrolls sideways." |
| 10 | Optional, after the next deploy: sign in as Ana, **Requests**, **New request**, **Raise my task limit**, 3, a note, **Send request**. Then as Maria: the bell goes up; **Requests**, **To decide**, **Approve** | "Everyone can ask: an employee asks her line manager, a manager asks the admins. The dialog says what approving does, and it runs the same rule as the People screen, with the same audit row. Ana's bell tells her the answer." Don't approve Ben's seeded overtime request: the terminal script needs Ben's overtime off to show the 40-hour refusal |
| 11 | Then the terminal script below, from step 6 | The refusals, the integrity check and the tests. |

### The terminal script

| Step | Do | Say |
| --- | --- | --- |
| 1 | Show the README's "seven questions" table | "Every client question maps to an endpoint. Nothing was built that doesn't answer one of them." |
| 2 | Run `python3 tools/demo.py demo` | "This talks to the live AWS deployment over HTTP, exactly as the website does." |
| 3 | Point at **1, 2 and 7** in the output | "The manager's dashboard: each project's status, whether it's at risk and why, and budget spent against planned. At-risk projects come first." |
| 4 | Point at **3 and 5** | "Ben is booked 45 hours against a 40-hour week: 25 on Apollo, 20 on Zeus. That's the over-allocation question. Neither project's manager could see it alone, because it spans projects." |
| 5 | Point at **4 and 6** | "Deliverables, with completion worked out from their tasks, and the dependency chain. Launch is blocked because Build isn't done." |
| 6 | Point at **Trying to break the rules** | "Every one of these is a real request the server refused. Logging past 40 hours without confirming, a loop in the dependencies, someone else's project (404, not 403, so you can't tell it exists), deleting anything (there is no delete: records are archived)." |
| 7 | Point at **5 integrity checks, 0 violations** | "Five database queries that must always return nothing: no dependency loops, no time logged outside a booking, and so on. They run after every database test, and here on live data." |
| 8 | Run `.venv/bin/pytest -q`, then `cd frontend && npm test` | "559 backend tests against a real Postgres database, not mocks. 325 website tests, which fake the API so they need no database. Plus a real browser test that walks this exact demo." |
| 9 | Optional: `(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)` | "Here are those requests arriving in AWS's logs." |
| 10 | Tell one story from section 8, "Things that went wrong" | Evaluators score curiosity and observation. These stories show both. |

If they want to see code, open the file behind the rule they ask about (section 7 has
the map). Good ones to have ready:

- **The 40-hour rule:** `backend/tracker/services/time_entries.py`, function
  `_check_limits`, and its test `tests/backend/test_work.py` (search for `capacity`).
- **No double-booking:** the `EXCLUDE` constraint in
  `backend/tracker/store/migrations/001_init.sql` (there are four migration files; the
  second, `002_task_limit.sql`, adds each person's task limit, the third,
  `003_request_kinds.sql`, adds the kinds of request, and the fourth,
  `004_over_capacity.sql`, marks time logged past capacity). Postgres itself
  refuses an overlapping booking for the same person on the same project.
- **Who may do what:** `backend/tracker/api/routes.py`, one table listing every
  endpoint and which roles may call it.

---

## 4. How to reach everything

| Thing | Where it lives | How to reach it |
| --- | --- | --- |
| The code | This repo, branch `David` | VS Code on the VDI, or https://github.com/D4DavidG/DavidCitiProject/tree/David |
| Tests | `tests/backend/`, `frontend/src/**/*.test.jsx`, `frontend/e2e/` | `.venv/bin/pytest -q` in the repo folder (local Postgres must be running); `cd frontend && npm test`; `E2E_ADMIN_PASSWORD=… npm run e2e` with the local stack running |
| The live API (AWS) | CloudFront → Lambda → Aurora | `$TRACKER_API` (section 3), using `curl`, `tools/demo.py` or `tools/loadtest.py` |
| The website | CloudFront (S3) on AWS; Vite on the VDI | `https://d1gov8jpsxhwer.cloudfront.net`; `http://localhost:3000` locally |
| The raw API in a browser | Same as the API | Only `.../api/tracker/health` works in a browser tab. Everything else needs a login token, so use `curl` (or the website) |
| The AWS console | AWS, us-east-2 | `(set -a; source ENVIRONMENT.config; python3 tools/console.py)`; section 5 |
| The AWS database | Aurora, inside a private network | **Not directly.** It isn't reachable from the internet, by design. You see its data through the API |
| The local copy of everything | Your VDI | `./bin/start-dev.sh` starts it; the API is then at `http://localhost:3001/api/tracker` |
| The local database | Postgres on the VDI | `PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres`, or DBeaver (below) |
| CI checks | GitHub Actions | https://github.com/D4DavidG/DavidCitiProject/actions |

### Seeing raw API answers (JSON) with curl

With `TRACKER_API` and `TRACKER_ADMIN_PASSWORD` set (section 3):

```sh
TOKEN=$(curl -s -H 'content-type: application/json' \
  -d "{\"username\":\"AD000001\",\"password\":\"$TRACKER_ADMIN_PASSWORD\"}" $TRACKER_API/auth/login \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" $TRACKER_API/dashboard/projects | python3 -m json.tool
curl -s -H "Authorization: Bearer $TOKEN" "$TRACKER_API/dashboard/allocation?overOnly=true" | python3 -m json.tool
```

Any route in `backend/tracker/api/routes.py` works the same way. The token lasts 15
minutes; after that, log in again (the website does this for you with its refresh token).

### Looking inside the database

The AWS database can't be opened directly, but the local copy has the same tables:

- **Terminal:** `PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres`, then
  `\dt` to list tables, `SELECT name, status FROM projects;`, and `\q` to quit.
- **A visual tool:** `sudo snap install dbeaver-ce --classic`, then add a PostgreSQL
  connection: host `localhost`, port `5432`, database `postgres`, user `postgres`,
  password `postgres123`.

The local copy gets data when you run `TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py seed`
against the local API. (The tests use their own throwaway databases and never touch this one.)

### Demo accounts

`tools/demo.py seed` creates two managers and four employees. All six share the password
`Demo-pass-2026`, and `tools/demo.py demo` prints their usernames. The admin is
`AD000001`, with your own password. These are demo accounts on a public URL with a
password in a public repo: fine for a workshop, never for real data.

---

## 5. What is on AWS, and how to see it

Everything was created by Terraform (`infra/`), never by clicking in the console.

| AWS service | What it is for us | Name |
| --- | --- | --- |
| **CloudFront** | The front door: one public HTTPS address. `/api/tracker/*` goes to the Lambda; everything else is the website | `d1gov8jpsxhwer.cloudfront.net` |
| **Lambda** | Runs our Python code only when a request arrives. No server to manage | `coding-workshop-tracker-c7dabfc1` (Python 3.13, 512 MB) |
| **Aurora Serverless v2** | The PostgreSQL 17 database. Pauses itself when idle (that's the 15 s wake-up) | `coding-workshop-rds-c7dabfc1` |
| **CloudWatch Logs** | Every request's log lines and timings | `/aws/lambda/coding-workshop-tracker-c7dabfc1` |
| **S3** | Holds the website files (deployed 14 Oct) | `coding-workshop-website-c7dabfc1` |

### In the browser (AWS console)

```sh
cd ~/DavidCitiProject
(set -a; source ENVIRONMENT.config; python3 tools/console.py)            # the Lambda
(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)       # its logs
(set -a; source ENVIRONMENT.config; python3 tools/console.py rds)        # the database
```

Other pages: `cloudfront`, `s3`. If it says the credentials are refused, they've
expired: run `./bin/setup-participant.sh`, then try again. Things worth showing:

- **Lambda → Monitor tab:** graphs of invocations, duration and errors. The load test
  shows up as a spike.
- **Logs:** one `REPORT` line per request with its duration. `Init Duration` marks a cold
  start (a new copy of the function starting).
- **RDS:** the Aurora cluster, its engine version (17.7), and its capacity graph.

### In the terminal

```sh
(set -a; source ENVIRONMENT.config; aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --since 15m --format short)
(set -a; source ENVIRONMENT.config; aws lambda get-function-configuration --function-name coding-workshop-tracker-c7dabfc1 --query '{runtime:Runtime,memory:MemorySize,updated:LastModified}')
```

---

## 6. How one request travels through the system

Example: a manager opens the dashboard, `GET /api/tracker/dashboard/projects`.

```
browser or curl
  -> CloudFront                       the public HTTPS address; sends /api/tracker/* to the Lambda
  -> Lambda: function.py              connects to Aurora (once per copy), applies new migrations
  -> api/http.py                      reads the request: path, query, body, camelCase -> snake_case
  -> api/routes.py                    finds the route: GET /dashboard/projects, roles ADMIN + MANAGER
  -> api/app.py  authorise()          checks the token, then re-reads the user's role from the database
  -> api/handlers.py                  one small function per route; calls one service
  -> services/dashboard.py            the business logic: project_cards()
  -> PostgreSQL (Aurora)              three queries, however many projects there are
  <- api/handlers.py                  shapes the answer: snake_case -> camelCase, the list envelope
  <- JSON back to the caller          {"items": [...], "page": 1, "pageSize": 20, "total": 3, "totalPages": 1}
```

When something is refused, a service raises an error (for example `OverCapacity`), and
`api/errors.py` turns it into a status code and `{"error": "..."}`. That one table is the
only place errors become status codes.

Dependencies only point downward: `api` calls `services`, and `services` run their SQL
through `store`'s connection and helpers. It isn't strictly one layer at a time (`api/app.py`
also imports `store.postgres.translate_errors`), but nothing below `api` knows HTTP exists.
That's why the business rules can be tested without HTTP at all. `domain/` (errors, money,
clock, values) is shared by every layer.

---

## 7. The file map: what goes where

### Ours (what you'll be asked about)

```
backend/tracker/                     the whole backend: one Lambda
  function.py                        entry point: connect, migrate on cold start, dispatch
  api/                               HTTP: routes.py (every endpoint and its roles), app.py (auth),
                                     handlers.py (one function per route), errors.py, http.py
  services/                          business rules, one file per subject:
                                     users, projects, assignments (bookings), milestones (deliverables),
                                     tasks, time_entries, requests, dashboard (the seven answers),
                                     audit (log and notifications), passwords, tokens, access, views
  domain/                            small shared pieces: errors, money (cents), clock (Eastern time), values
  store/                             the database: migrations/ (001_init.sql: all tables and rules; 002 to 004 add columns, 005 adds refresh_tokens),
                                     migrate.py, integrity.py (the 5 checks), postgres.py
tests/backend/                       559 tests; conftest.py builds the test database
frontend/src/                        the website (React + Material UI):
  services/request.js                the one module that calls the API (token, JSON, errors; on a 401 refresh once, then retry)
  services/format.js                 the only code that turns cents, minutes and dates into text
                                     (and typed hours and minutes into minutes)
  auth/                              session and the role gate (RequireRole)
  components/                        layout, DataTable, FormDialog, BudgetBar, StatusChip, PageState
  pages/                             one folder per screen: dashboard, allocation, projects, mytasks,
                                     approvals, people, requests, notifications, audit, account, login
frontend/e2e/                        Playwright: a real browser walking the demo
tools/demo.py                        seed + demo, over HTTP
tools/loadtest.py                    load test
tools/console.py                     opens the AWS console
README.md                            the formal write-up: architecture, decisions, tests, gaps
MVP.md                               short scope summary for teammates
CLAUDE.md                            working notes: stack, decisions, traps, commands
docs/GUIDE.md                        this file
docs/superpowers/specs/              the database design, with reasons
docs/superpowers/plans/              the AWS verification checklist, with results
```

**Naming:** the database says `milestones` and `assignments`; the screens and the brief
say **Deliverables** and **Resources**. Same things.

### The workshop's (keep, but ignore)

| Path | What it is | Why it stays |
| --- | --- | --- |
| `bin/` | The organisers' scripts: setup, start, deploy, cleanup | We use them; the deploy depends on them |
| `infra/` | Terraform for all of AWS | We use it. We changed `lambda.tf`, `locals.tf`, `output.tf`, `cloudfront.tf` and added `secrets.tf` |
| `.github/` | CI checks (bandit, npm audit, checkov) | They run on every push |
| `backend/_examples/` | Sample services in 3 languages | Ignored by the deploy (names starting with `_` are skipped) |
| `data/`, `infra/eks.tf`, `infra/helm/`, `infra/documentdb.tf` | For other workshop tracks | Switched off; unused |
| `docs/*.md` except this guide | Workshop guides; `full-stack.md` is the marking rubric | Reference |
| `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `DCO.md`, `SECURITY.md` | The template's legal files | Required by the template |

**Why nothing was deleted:** the organisers' scripts, CI and Terraform expect these
files, and deleting Terraform files can change what gets deployed. Keeping them also
means your branch differs from the workshop template only by your own work, which is
easy for evaluators to review. The table above is the "ignore" list instead.

### Not in git (on purpose)

`private/` (your personal docs), `ENVIRONMENT.config` (temporary AWS keys), `.venv/`
(Python tools), `frontend/node_modules/`, `infra/.terraform/`, and the database library
`start-dev.sh` copies into `backend/tracker/`. All of these are listed in `.gitignore`.

---

## 8. Questions you will probably be asked

The rubric (`docs/full-stack.md`) scores Implementation, Design, Code, Testing and
Experience, plus Curious, Observant and Driven. Short answers, each with where to point.

### Design and architecture

**"Walk me through the architecture."** Section 6: CloudFront → one Lambda → Aurora.
Inside the Lambda: `function.py` (the entry point), then `api/`, `services/` and `store/`,
with Postgres underneath; `domain/` holds the shared pieces every layer uses (errors,
money, clock). Dependencies only point downward.

**"Why one Lambda, not one per feature?"** The features share one database and one set
of rules. One function means one connection pool, one deploy and no duplicated code.
Splitting it would add network hops and cold starts for no benefit at this size.

**"Why not Jira-style task tracking?"** Jira tracks work items inside one project. The
client's questions span projects: who's over-allocated across all of them, budget across
the portfolio. That's what resource tools like Float and Harvest Forecast do, so I led
with the dashboard and the allocation grid. Tasks exist only to make deliverable
completion a real number.

**"Why archive instead of delete? The rubric says DELETE."** Deleting a project would
also delete its history: logged hours, budget spent, the audit trail. Archiving hides
it and keeps everything, and it can be reactivated. A database trigger refuses `DELETE`
on every application table, so not even a bug can remove data. (This is the one place we knowingly
depart from the rubric; worth asking an evaluator if it counts.)

### Security

**"How does login work?"** Username and password. The password is stored only as a
PBKDF2 hash with 600,000 rounds (OWASP's 2023 recommendation), never in plain text. A
correct login returns two tokens: a signed access token (JWT) that lasts 15 minutes, and a
refresh token the website swaps for a new pair when the first one expires (each refresh
token is used once; reusing an old one signs that person out everywhere; all of them die 8
hours after login). Changing a password ends every older session. New accounts get a
generated password and must change it at first login. An unknown username costs the same
hashing work as a wrong password, so the reply time doesn't reveal which usernames exist
(test: `test_unknown_username_costs_the_same_hashing_as_a_wrong_password`).

**"How do you stop people seeing what isn't theirs?"** Two layers. The route table says
which roles may call each endpoint (403 otherwise). Then each service checks ownership:
a manager asking for another manager's project gets **404, worded exactly like a missing
one**, so ids can't be probed to find out what exists. The role is re-read from the
database on every request, so a demotion takes effect immediately; the token's copy of
it is never trusted.

**"SQL injection?"** Every value is a query parameter. Table and column names are built
with psycopg's safe SQL composer, never string formatting. The CI security scan
(bandit) checks for string-built SQL, and it passes.

**"Where are the secrets?"** Terraform generates the token-signing key and the first
admin password and passes them to the Lambda as environment variables. Nothing secret
is in the repo; that was checked before every commit.

### Data and business rules

**"How do you prevent double-booking or over-allocation?"** Double-booking (the same
person twice on the same project for overlapping dates) is refused by Postgres itself:
an `EXCLUDE` constraint, which also holds when two requests arrive at once.
Over-allocation across projects is allowed but flagged, because the client asked to
*see* it (question 5). Logging more than 40 hours in a week without overtime asks first:
"This puts you 2 h over your 40 h week. Log anyway? Your manager will be told." If they
confirm, the entry is saved, marked "Over capacity", and their manager is told by how much
(we don't hide real work; Jira and Harvest do the same). That check locks the person's
row first, so an unconfirmed entry can never slip past.

**"How is the budget calculated?"** Planned = booked hours × the person's hourly rate
(salary ÷ 2,080 hours). Consumed = approved logged time × the rate frozen when the time
was logged, so a later raise doesn't rewrite past costs. All money is whole cents
(integers), never decimals, so there are no rounding errors.

**"What stops the data getting into a bad state?"** Postgres enforces what a constraint
can express (foreign keys, check constraints, the exclusion constraint, triggers); rules
that need the clock, sums or the caller (weekly capacity, sign-off, loops, ownership) live
in the Python services; and the five integrity queries catch what neither can prevent.
Some rules are in both (booking hours, date order); overlap and self-approval are
database only. The integrity queries run after every database test and are available
live at `GET /admin/integrity-check`.

**"Time zones?"** AWS clocks run on UTC. "Today", weeks and dates use Eastern time,
from one constant (`domain/clock.py`), so an entry at 9 pm New York time isn't
counted as the next day.

### Testing

**"How did you test it?"** 559 backend tests with pytest, against a real PostgreSQL database,
not mocks. Each test runs inside a transaction that's rolled back, so tests can't
affect each other, and the integrity check runs after each database test.

- **Unit and rule tests:** call the services directly (every business rule).
- **API tests:** send Lambda-shaped events, in-process, through the same entry point AWS
  uses. Two "walk" tests call every one of the 69 routes, and fail if someone adds a
  route without testing it. Real HTTP is exercised by `tools/demo.py` and Playwright.
- **Database tests:** prove Postgres itself refuses each kind of bad row.
- **Load test:** `tools/loadtest.py`, run on LocalStack and on AWS.

**"What's your coverage, and why not 100%?"** 97% overall; 100% for the API layer (the
rubric asks for 90%). The uncovered 3% is mostly repeat guard branches ("this id doesn't
exist" on records where the same check is already tested elsewhere) and the
database-down branch inside a request. But a handful of real rules are still untested:
reactivating a deliverable or task clears a sign-off (`milestones.py:197`, `tasks.py:215`),
adding a dependency clears a sign-off (`milestones.py:291`), archived deliverables can't be
in dependencies (`milestones.py:268`), and a manager who still runs live projects can't be
demoted (`users.py:239`). The list is in the README under "Known gaps".

**"How do you know the tests actually test something?"** For new tests, I deliberately
broke the code (removed a sort, a filter, a check) and confirmed the right test failed.
Every behavioural fix ships with the test that fails without it.

**"And the frontend?"** 325 tests with Vitest and React Testing Library (Jest's API),
94.7% of statements and 95.86% of lines covered. They render each screen with the API stubbed (no database) and check what a
person would see and what gets sent (cents, minutes from the Hours and Minutes boxes, only
the changed fields). On top of that, Playwright drives a real browser against the real local API and database through the demo, and checks
the phone layout doesn't scroll sideways.

**"Where are the business rules in the website?"** Nowhere, on purpose. Risk, progress,
over-capacity and every money figure come from the server; the website only formats them
(`services/format.js` is the only place cents become dollars). Buttons a role can't use
are hidden, but the server is what refuses. The Hours and Minutes boxes check the server's
own limits (24 h logged, 1,000 h estimate) only so the dialog can say which box is wrong;
the server still enforces them.

### Performance

**"Will it scale?"** Every screen is written to cost a fixed number of queries, never
one per row (no "N+1"; no test counts them yet). Top-level lists are paginated; lists
inside one project come whole. Lambda adds copies automatically under load.
Measured on AWS at 25 simultaneous users: **539 requests per second, 95% under 65 ms,
and 6 ms median (p95 13 ms) inside the Lambda** for a typical request. The limits would
be Aurora's capacity (capped at 4 units in `infra/rds.tf`) and the deliberately slow
login (about 1.1 s per login, by design).

### Things that went wrong (tell one of these; they score well)

- **CloudFront was swallowing our error responses.** The first AWS deploy returned an
  S3 "Access Denied" page instead of our 404. The workshop's Terraform rewrote every 404
  into the website's home page, API included. I predicted it from reading the
  Terraform, confirmed it on the deploy, removed the rule, and redeployed. The website
  uses hash-based links (`/#/projects/7`), so it doesn't need that rule.
- **The load test found a queue.** On AWS, the CloudWatch logs showed new copies of the
  function starting after 1.3, 2.4, 3.4 ... up to 9.8 seconds: a staircase. Each cold
  start was re-hashing the first admin's password (about 1 s, on purpose slow) inside a database lock, even
  though the admin already existed, so they queued. Past 10 seconds the lock would have
  timed out and returned errors. The fix was to check before hashing, with a test proving
  it. After redeploying, 25 cold starts at once took 0.17 to 0.30 s each.
- **Writes that would have silently vanished.** At design time I caught that the
  database driver's default (psycopg, `autocommit=False`) opens a hidden transaction on
  the first query, which turns every later "transaction" into a savepoint. Nothing
  would ever have been committed, and data would have disappeared whenever AWS recycled
  the function. I reproduced it with a test on its own database, then fixed it with
  autocommit plus explicit transactions. `tests/backend/test_store_commits.py` guards it,
  because the normal tests roll everything back and could never notice.
- **LocalStack fell over first.** The local AWS emulator failed at 25 users. Its logs
  showed it running out of open files, not our code failing, which the real AWS run
  then confirmed.

### Process and AI

**"Did you use AI?"** Yes, Claude Code, and say so plainly. The useful part to explain is
how: I made the product decisions (what to build, and what to cut, like clock-in/out and
payroll features that made it a Workday clone). It wrote code test-first, and I verified
everything on real AWS myself, which is where the CloudFront and cold-start problems
were found. Be ready to explain any file in section 7; that's the real test.

**"What would you do next?"** An end-to-end test of the employee journey (log time, a
manager approves it), the refresh token in an HttpOnly cookie instead of `sessionStorage`
(token refresh itself is built: 15-minute tokens, 14 Oct), emailed password
reset (blocked on AWS: no email permission and no way out of the network; see
`docs/superpowers/specs/2026-10-14-email-and-sms-findings.md`), and running the pull
board (built 14 Oct: Take this, Put back, a task limit; see
`docs/superpowers/specs/2026-10-14-pull-board-design.md`) on AWS. It is tested locally
only until the next deploy.

**"What would you do differently?"** Start the AWS deploy on day one: two of the most
interesting problems only showed up there.

---

## 9. Command cheat sheet

Run from `~/DavidCitiProject` on the VDI.

```sh
# Tests
.venv/bin/pytest -q                                   # backend tests (expect 559 passed)
(cd frontend && npm test)                             # website tests (expect 325 passed)
(cd frontend && E2E_ADMIN_PASSWORD=... npm run e2e)   # real browser, needs ./bin/start-dev.sh running
.venv/bin/pytest --cov --cov-report=term-missing      # with the coverage table
.venv/bin/pytest -q -k capacity                       # only tests with "capacity" in the name

# Against AWS (set TRACKER_API and TRACKER_ADMIN_PASSWORD first: section 3)
curl -s $TRACKER_API/health                           # wake it up / is it alive?
python3 tools/demo.py demo                            # the seven answers + ten refusals
python3 tools/loadtest.py | tail -20                  # load test, summary only

# AWS itself
./bin/setup-participant.sh                            # refresh the temporary AWS keys
./bin/deploy-backend.sh                               # deploy code or Terraform changes
(set -a; source ENVIRONMENT.config; python3 tools/console.py)        # AWS console in the browser

# Local copy
./bin/start-dev.sh                                    # start Postgres, LocalStack, proxy, Vite
TRACKER_API=http://localhost:3001/api/tracker TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py demo

# Git
git status                                            # what changed
git add -u && git commit -m "..." && git push origin David
```

---

## 10. Words, in plain English

| Word | Meaning here |
| --- | --- |
| **API** | The backend's set of addresses (routes) that accept requests and answer with JSON |
| **Route / endpoint** | One address plus method, like `GET /projects`. We have 66 |
| **JSON** | The text format the API answers in: `{"name": "Apollo"}` |
| **Lambda** | AWS runs our function only when a request arrives; we never manage a server |
| **Cold start** | The first request to a brand-new copy of the Lambda, which has to start up first |
| **Aurora** | AWS's managed PostgreSQL database |
| **CloudFront** | AWS's front door: one public HTTPS address in front of everything |
| **Terraform** | Code that describes the AWS setup; `deploy-backend.sh` applies it |
| **LocalStack** | A fake AWS running on the VDI, for testing before deploying |
| **Migration** | A numbered SQL file that creates or changes tables, applied once, in order |
| **JWT / token** | The signed pass you get at login and send with every request |
| **Hash (PBKDF2)** | A one-way scramble of the password; we store only that |
| **403 / 404 / 409** | Refused: not your role / not found or not yours / breaks a rule |
| **Archive** | Our "delete": hidden but kept, and it can be reactivated |
| **Integrity check** | Five queries that must return nothing if the data is consistent |
| **Coverage** | The share of code lines that the tests actually run |
| **p50 / p95** | Half of requests were faster than p50; 95% were faster than p95 |
