# Project Guide: how it works, how to show it, how to answer questions

Everything about the ACME Project Tracker in one place: what exists, how to reach every
part of it, a demo script, and the questions evaluators are likely to ask. The README is
the formal write-up; this is the guide for presenting and explaining it.

Numbers here were measured on 13 Oct 2026. Re-run the commands in section 9 before quoting them.

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
> not a task board like Jira. So I built the backend that answers all seven from live
> data. It's a Python API on AWS Lambda with a PostgreSQL database (Aurora). The
> business rules are enforced twice, in the code and in the database itself, and 370
> automated tests run against a real database. It's deployed on AWS. I load-tested it
> there and found and fixed two real problems. The React frontend is the next step.

What's done and what isn't, honestly:

| Part | State |
| --- | --- |
| Database (10 tables, rules enforced by Postgres) | Done, tested, deployed to Aurora |
| Backend API (62 routes, roles, audit log, notifications) | Done, tested, deployed to Lambda |
| Answers to all seven questions | Done, shown by `tools/demo.py` |
| Tests | 370 passing; 96% coverage overall, 100% for the API layer |
| AWS deployment | Verified 13 Oct: health, login, token, 404s, demo, load test |
| Frontend (React, Material UI) | **Not started.** It's the next build step |

---

## 2. What you can do with it right now

There's no website yet, so everything runs from a **terminal** and is shown as
**text and JSON**. That's normal for a backend. Five things you can show:

| You can... | How | Section |
| --- | --- | --- |
| Run the whole story: the seven answers, then every rule refusing bad input | `python3 tools/demo.py demo` | 3 |
| Prove the code works | `.venv/bin/pytest -q`: 370 tests in about 12 s | 3, 9 |
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

### The script

| Step | Do | Say |
| --- | --- | --- |
| 1 | Show the README's "seven questions" table | "Every client question maps to an endpoint. Nothing was built that doesn't answer one of them." |
| 2 | Run `python3 tools/demo.py demo` | "This talks to the live AWS deployment over HTTP, exactly as the website will." |
| 3 | Point at **1, 2 and 7** in the output | "The manager's dashboard: each project's status, whether it's at risk and why, and budget spent against planned. At-risk projects come first." |
| 4 | Point at **3 and 5** | "Ben is booked 45 hours against a 40-hour week: 25 on Apollo, 20 on Zeus. That's the over-allocation question. Neither project's manager could see it alone, because it spans projects." |
| 5 | Point at **4 and 6** | "Deliverables, with completion worked out from their tasks, and the dependency chain. Launch is blocked because Build isn't done." |
| 6 | Point at **Trying to break the rules** | "Every one of these is a real request the server refused. Logging past 40 hours, a loop in the dependencies, someone else's project (404, not 403, so you can't tell it exists), deleting anything (there is no delete: records are archived)." |
| 7 | Point at **5 integrity checks, 0 violations** | "Five database queries that must always return nothing: no dependency loops, no time logged outside a booking, and so on. They run after every test, and here on live data." |
| 8 | Run `.venv/bin/pytest -q` | "370 tests against a real Postgres database, not mocks. 12 seconds." |
| 9 | Optional: `(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)` | "Here are those requests arriving in AWS's logs." |
| 10 | Tell one story from section 8, "Things that went wrong" | Evaluators score curiosity and observation. These stories show both. |

If they want to see code, open the file behind the rule they ask about (section 7 has
the map). Good ones to have ready:

- **The 40-hour rule:** `backend/tracker/services/time_entries.py`, function
  `_check_limits`, and its test `tests/backend/test_work.py` (search for `capacity`).
- **No double-booking:** the `EXCLUDE` constraint in
  `backend/tracker/store/migrations/001_init.sql`. Postgres itself refuses an
  overlapping booking.
- **Who may do what:** `backend/tracker/api/routes.py`, one table listing every
  endpoint and which roles may call it.

---

## 4. How to reach everything

| Thing | Where it lives | How to reach it |
| --- | --- | --- |
| The code | This repo, branch `David` | VS Code on the VDI, or https://github.com/D4DavidG/DavidCitiProject/tree/David |
| Tests | `tests/backend/` | `.venv/bin/pytest -q` in the repo folder (local Postgres must be running) |
| The live API (AWS) | CloudFront → Lambda → Aurora | `$TRACKER_API` (section 3), using `curl`, `tools/demo.py` or `tools/loadtest.py` |
| The live API in a browser | Same | Only `.../api/tracker/health` works in a browser tab. Everything else needs a login token, so use `curl` |
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

Any route in `backend/tracker/api/routes.py` works the same way. The token lasts 8 hours.

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
| **CloudFront** | The front door: one public HTTPS address. `/api/tracker/*` goes to the Lambda; everything else will be the website | `d1gov8jpsxhwer.cloudfront.net` |
| **Lambda** | Runs our Python code only when a request arrives. No server to manage | `coding-workshop-tracker-c7dabfc1` (Python 3.13, 512 MB) |
| **Aurora Serverless v2** | The PostgreSQL 17 database. Pauses itself when idle (that's the 15 s wake-up) | `coding-workshop-rds-c7dabfc1` |
| **CloudWatch Logs** | Every request's log lines and timings | `/aws/lambda/coding-workshop-tracker-c7dabfc1` |
| **S3** | Will hold the website files. Empty until the frontend is deployed | `coding-workshop-website-c7dabfc1` |

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

The layers only call downwards: `api` calls `services`, `services` calls `store` and
Postgres. That's why the business rules can be tested without HTTP at all.

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
  store/                             the database: migrations/001_init.sql (all tables and rules),
                                     migrate.py, integrity.py (the 5 checks), postgres.py
tests/backend/                       370 tests; conftest.py builds the test database
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
| `frontend/` | The starter React app | It becomes our website next |
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
Inside the Lambda there are four layers (api, services, domain, store), and each only
calls the one below.

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
on every table, so not even a bug can remove data. (This is the one place we knowingly
depart from the rubric; worth asking an evaluator if it counts.)

### Security

**"How does login work?"** Username and password. The password is stored only as a
PBKDF2 hash with 600,000 rounds (OWASP's 2023 recommendation), never in plain text. A
correct login returns a signed token (JWT) that lasts 8 hours. New accounts get a
generated password and must change it at first login.

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
*see* it (question 5). Logging more than 40 hours in a week is refused unless their
manager allowed overtime. That check locks the person's row first, so two requests at
once can't both slip under.

**"How is the budget calculated?"** Planned = booked hours × the person's hourly rate
(salary ÷ 2,080 hours). Consumed = approved logged time × the rate frozen when the time
was logged, so a later raise doesn't rewrite past costs. All money is whole cents
(integers), never decimals, so there are no rounding errors.

**"What stops the data getting into a bad state?"** Rules are enforced twice: in the
Python services, and again in the database (foreign keys, check constraints, the
exclusion constraint, triggers). On top of that, five integrity queries must always
return nothing. They run after every single test and are available live at
`GET /admin/integrity-check`.

**"Time zones?"** AWS clocks run on UTC. "Today", weeks and dates use Eastern time,
from one constant (`domain/clock.py`), so an entry at 9 pm New York time isn't
counted as the next day.

### Testing

**"How did you test it?"** 370 tests with pytest, against a real PostgreSQL database,
not mocks. Each test runs inside a transaction that's rolled back, so tests can't
affect each other, and the integrity check runs after each one.

- **Unit and rule tests:** call the services directly (every business rule).
- **API tests:** send real Lambda events through the same entry point AWS uses. Two
  "walk" tests call every one of the 62 routes, and fail if someone adds a route without
  testing it.
- **Database tests:** prove Postgres itself refuses each kind of bad row.
- **Load test:** `tools/loadtest.py`, run on LocalStack and on AWS.

**"What's your coverage, and why not 100%?"** 96% overall; 100% for the API layer (the
rubric asks for 90%). The uncovered 4% is mostly repeat guard branches ("this id doesn't
exist" on records where the same check is already tested elsewhere) and the
database-down branch inside a request. The list is in the README under "Known gaps".

**"How do you know the tests actually test something?"** For new tests, I deliberately
broke the code (removed a sort, a filter, a check) and confirmed the right test failed.
Most tests were written before the code and seen failing first.

**"No frontend tests?"** The frontend isn't built yet. The plan is Vitest with React
Testing Library, and Playwright for end to end.

### Performance

**"Will it scale?"** Every screen costs a fixed number of queries, never one per row
(no "N+1"), and every list is paginated. Lambda adds copies automatically under load.
Measured on AWS at 25 simultaneous users: **539 requests per second, 95% under 65 ms,
and 6 ms inside the Lambda** for a typical request. The limits would be Aurora's
capacity (capped at 4 units in `infra/rds.tf`) and the deliberately slow login (about
1.1 s per login, by design).

### Things that went wrong (tell one of these; they score well)

- **CloudFront was swallowing our error responses.** The first AWS deploy returned an
  S3 "Access Denied" page instead of our 404. The workshop's Terraform rewrote every 404
  into the website's home page, API included. I predicted it from reading the
  Terraform, confirmed it on the deploy, removed the rule, and redeployed. The website
  will use hash-based links (`/#/projects/7`) so it doesn't need that rule.
- **The load test found a queue.** On AWS, new copies of the function took 1.3, 2.4,
  3.4 ... up to 11 seconds: a staircase. CloudWatch showed each cold start re-hashing the
  first admin's password (about 1 s, on purpose slow) inside a database lock, even
  though the admin already existed, so they queued. Past 10 seconds the lock would have
  timed out and returned errors. The fix was to check before hashing, with a test proving
  it. After redeploying, 25 cold starts at once took 0.2 s each.
- **Writes that would have silently vanished.** A design review caught that the
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

**"What would you do next?"** The frontend: login, then the manager dashboard and the
allocation grid (questions 1, 2, 3, 5 and 7), then deliverables and the dependency view.
After that, token refresh (now it's expiry plus log in again) and emailed password reset
(the workshop's AWS role has no email access).

**"What would you do differently?"** Start the AWS deploy on day one: two of the most
interesting problems only showed up there.

---

## 9. Command cheat sheet

Run from `~/DavidCitiProject` on the VDI.

```sh
# Tests
.venv/bin/pytest -q                                   # all tests (expect 370 passed)
.venv/bin/pytest --cov --cov-report=term-missing      # with the coverage table
.venv/bin/pytest -q -k capacity                       # only tests with "capacity" in the name

# Against AWS (set TRACKER_API and TRACKER_ADMIN_PASSWORD first: section 3)
curl -s $TRACKER_API/health                           # wake it up / is it alive?
python3 tools/demo.py demo                            # the seven answers + every refusal
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
| **Route / endpoint** | One address plus method, like `GET /projects`. We have 62 |
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
