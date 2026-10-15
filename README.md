# ACME Project Tracker

> **For:** anyone opening this repo for the first time. **Answers:** what the tool is, how to
> try it, how to sign in as each kind of user, and where every file, test and guide lives.

A web app that shows a company's managers how their projects are doing: which are late or
over budget, who is working on what, and who is booked for more hours than they have. It was
built by David Gusmao, alone, in three days (13 to 15 Oct 2026) for the Citi coding workshop.

- **Website:** React 19 with Material UI and react-responsive (works on phones).
- **API:** Python 3.13 on AWS Lambda, one function, 71 endpoints.
- **Database:** PostgreSQL (Aurora Serverless v2 on AWS, a local Postgres on the dev machine).
- **Hosting:** S3 and CloudFront, all built by Terraform and the repo's shell scripts.

## Contents

1. [What it does](#what-it-does)
2. [Try it live](#try-it-live)
3. [Screenshots](#screenshots)
4. [Features](#features)
5. [Find your way around the repo](#find-your-way-around-the-repo)
6. [Tests](#tests)
7. [Try the API in Swagger](#try-the-api-in-swagger)
8. [Documentation](#documentation)
9. [How it fits together](#how-it-fits-together)
10. [Run it yourself, or deploy it](#run-it-yourself-or-deploy-it)
11. [How it was built](#how-it-was-built)
12. [Known gaps](#known-gaps)

## What it does

ACME Inc. runs many projects and can't see their progress, who is working on what, or where
the money goes. The tracker answers the client's seven questions, each on its own screen:

| # | Question | Screen |
| --- | --- | --- |
| 1 | What is the status of each active project? | Dashboard, Projects |
| 2 | Which projects are at risk of missing deadlines? | Dashboard: the **At risk** column, with the reason |
| 3 | How are people allocated across projects? | Allocation grid and Schedule: people down, weeks across |
| 4 | What are the key deliverables, and how complete are they? | A project's Deliverables tab and timeline |
| 5 | Who is over-allocated? | Allocation grid and Schedule: weeks past a person's capacity in red |
| 6 | Which deliverables depend on which? | A project's dependency view |
| 7 | How much budget is spent versus planned? | Budget bar on the dashboard and on each project |

It is **portfolio and resource management** (the kind of tool Float, Harvest Forecast and
Smartsheet Resource Management are), not a task tracker like Jira. Tasks exist so that "how
complete is this deliverable" is a measured number, not a guess. Every figure (risk, progress,
money, over capacity) is computed by the server; the website only displays it.

The full list of requirements, rules and who may do what: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Try it live

**https://d1gov8jpsxhwer.cloudfront.net**

The first visit after a quiet spell can take about 15 seconds: the database pauses itself when
idle and wakes on the first request.

| Role | Name | Username | Password |
| --- | --- | --- | --- |
| Admin | System Administrator | `AD000001` | `gusmao123` |
| Manager | Maria Lopez | `ML662930` | `Demo-pass-2026` |
| Manager | Sam Patel | `SP918535` | `Demo-pass-2026` |
| Employee | Guy Gardner | `GG530359` | `bobyboby` |
| Employee | Ben Okafor | `BO435681` | `Demo-pass-2026` |
| Employee | Chloe Kim | `CK971979` | `Demo-pass-2026` |
| Employee | Dev Shah | `DS516414` | `Demo-pass-2026` |

Ana Ruiz (`AR553882`) is archived on the live site, so that account can't sign in: it shows
what archiving someone does. David chose to publish these logins so reviewers can try every
role. Anything you change on the live site is real and rings other people's notification bells.

**What each role sees** (the menu is `frontend/src/components/navigation.js`; the server
enforces the same rules, so hiding a button is never the only protection):

| Role | Menu | Can do |
| --- | --- | --- |
| Admin | Dashboard, Allocation, Schedule, Projects, Approvals, People, Requests, Notifications, Audit log | Everything: create accounts and projects, reset passwords, set salaries, archive and reactivate anything, read the audit log |
| Manager | Dashboard, Allocation, Schedule, Projects, Approvals, People, Requests, Notifications | Run the projects they manage (dates, budget, bookings, deliverables, tasks); approve their reports' time; set their reports' capacity, overtime and task limit; ask the admins for a new project |
| Employee | Dashboard (their own projects and tasks), Projects, Requests, Notifications | Take Ready tasks, move their tasks, log time; ask their line manager for overtime or a higher task limit |

Everyone also has **Account** (name, email, password, **My history**), the notification bell
and the search box in the top bar.

To run your own copy, see [docs/SETUP.md](docs/SETUP.md). Its logins are your own: the
server generates every username, so local ones differ on each machine
([how to sign in locally](docs/SETUP.md#4-sign-in-locally-and-add-demo-data)).

## Screenshots

| Dashboard (questions 1, 2, 7) | Allocation grid (questions 3, 5) |
| --- | --- |
| ![Dashboard: Apollo at risk with its reason and budget bar](docs/screenshots/dashboard.png) | ![Allocation grid: Ben booked 45 of 40 hours, Apollo 25 h and Zeus 20 h](docs/screenshots/allocation.png) |
| **Project (question 4): deliverables, tasks, resources, budget** | **Dependency view (question 6)** |
| ![Project page with deliverables and tasks](docs/screenshots/project.png) | ![Dependencies: Design, then Build, then Launch (blocked)](docs/screenshots/dependencies.png) |

On a phone the menu becomes a drawer, tables become cards and the grid scrolls sideways
(<img src="docs/screenshots/phone-dashboard.png" alt="Dashboard at phone width" width="120">).
These were taken before the 15 Oct changes below, so the dashboard's two columns are not in them yet.

## Features

**Seeing the portfolio**

- **Dashboard** (managers, admins): two columns, **At risk** and **On track**, each showing the
  3 projects with the most recent activity, with **See all** for the rest, so it stays readable
  with hundreds of projects. Totals of projects and of projects at risk, a budget chart, this
  week's workload, and a timeline per project whose row of dates starts "Week of".
- **Late deliverables explain themselves:** hover a late deliverable on a timeline to read "was
  due … · today is … · N days late".
- **Allocation grid:** people by weeks, sorted by each person's worst week; each cell lists the
  projects its hours come from. **How to read this** explains the colours, and why only some
  names open a menu (you can act only on people you manage).
- **Schedule:** one bar per booking, in its project's colour; weeks past capacity outlined in red.
- **Projects:** Deliverables (with a timeline), Tasks, Board, Resources (bookings) and Budget
  tabs, and a dependency view.
- **Search** in the top bar finds pages (the ones your role may open) and projects by name.
  Press `/`, `Ctrl+K` or `Cmd+K` to jump to it.

**Doing the work**

- **Tasks:** managers create them; employees take a Ready task (**Take this**, up to their task
  limit, default 2) or **Put back** one; the assignee moves it To do, In progress, Done.
- **Logging time** in Hours and Minutes boxes. Past the weekly capacity (default 40 h) without
  overtime, the app asks **Log anyway?**; confirmed time is marked "Over capacity" and the
  manager is told.
- **Approvals:** the line manager or an admin approves logged time; only approved time costs
  money; nobody approves their own.
- **Requests:** employees ask their line manager (overtime, a higher task limit, anything else);
  managers ask the admins (a new project, archiving one, anything else). Approving applies the
  change.

**Running the company**

- **People** (admins create accounts): the server generates the username (initials plus 6
  digits) and a 12-character password, shown once with a **Copy username and password** button
  and changed at first sign-in.
- **Minimum pay:** every new account and every pay change is at least $20 an hour, which is
  $41,600 a year (the hourly rate is salary / 2,080 hours). The API refuses less.
- **Archive warning:** archiving someone still on a live project (a booking that hasn't ended,
  or an unfinished task) shows a red warning listing those projects, and the button becomes
  **Archive anyway**.
- **Nothing is deleted:** people, projects, deliverables, tasks and bookings are archived and can
  be reactivated, so every past cost can still be explained.
- **Audit log and notifications:** every change writes one audit row and notifies the people
  above whoever made it, and the person it concerns (the bell checks every 10 seconds). Admins
  see the before and after of every change; **History** shows one person's trail.
- **Sessions:** 15-minute sign-in tokens, renewed in the background by a refresh token that
  lasts up to 8 hours.
- Light and dark themes, phone layouts, and accessibility checked by an automated scan (axe) on
  every screen.

## Find your way around the repo

```text
.
├── README.md              you are here
├── CLAUDE.md              the working notes Claude Code reads first: rules, decisions, traps, commands
├── LICENSE                MIT-0, from the workshop template
├── backend/               the API: one Python Lambda in backend/tracker/ (api, services, store, domain)
├── frontend/              the website: React + Material UI + Vite; unit tests sit beside the code, browser tests in e2e/
├── tests/                 start here for tests: the map of every suite, the backend tests, the k6 load test
├── infra/                 Terraform: Lambda, Aurora PostgreSQL, S3, CloudFront, secrets
├── bin/                   the workshop's shell scripts: set up the machine, run locally, deploy, clean up
├── tools/                 our helpers: demo data, Swagger, the browser-test runner, the OpenAPI builder
├── docs/                  every guide, the API description (openapi.json), Swagger UI, screenshots
├── .github/               security checks on every push (bandit, npm audit, Checkov) and coding instructions for AI assistants
├── pytest.ini             tells pytest where the tests and the backend code are
├── .coveragerc            coverage counts our code only, not the database driver vendored for LocalStack
├── requirements-dev.txt   Python packages for running the tests (psycopg, pytest, pytest-cov)
└── .gitignore             what git leaves out; it also drops any folder named lib, build, dist or coverage
```

Each important folder has its own README:

| Folder | README answers |
| --- | --- |
| `backend/` | [backend/README.md](backend/README.md): the four layers, the route table, how a request is handled |
| `frontend/` | [frontend/README.md](frontend/README.md): the screens, shared components, how the website calls the API |
| `tests/` | [tests/README.md](tests/README.md): every test suite, where it lives and how to run it |
| `infra/` | [infra/README.md](infra/README.md): what Terraform builds on AWS and in LocalStack |
| `bin/` | [bin/README.md](bin/README.md): each shell script, and when to run it |
| `tools/` | [tools/README.md](tools/README.md): demo data, Swagger, the browser-test runner, the OpenAPI builder |
| `docs/` | [docs/README.md](docs/README.md): the index of every guide |

`.github/` has no README. Its [workflows](.github/workflows/) run three security checks on every
push: bandit on `backend/` (`python.actions.yml`), `npm audit` at high severity on `frontend/`
(`react.actions.yml`) and Checkov on the Terraform (`terraform.actions.yml`). Its instructions
are the organisation's coding rules for AI assistants, one per language:
[Python](.github/instructions/python.instructions.md),
[React](.github/instructions/react.instructions.md) and
[Terraform](.github/instructions/terraform.instructions.md).

## Tests

About 1,500 automated tests, in four kinds. **Backend** (pytest, 648 tests, 97% of statements)
checks every business rule, every route and that Postgres itself refuses bad rows. **Website**
(Vitest and React Testing Library, 846 tests in 51 files, 98.04% of lines) checks what each
screen shows and sends. **Browser** (Playwright, 33 passed and 1 skipped on request) clicks
through the real app, takes screenshots of every screen and runs 100 accessibility scans in
light and dark; 17 of them are safe to run against the live AWS site, and all 17 passed there
after the 15 Oct deploy. A **load test** (k6) measures speed under many users. Numbers are from
15 Oct, before the post-demo changes.

```sh
./tools/test-all.sh                     # every local check in order, then a PASS or FAIL table (about 2.5 min)
./tools/e2e.sh --aws --show demo        # watch the demo walk in a real browser, on the live site
./tools/e2e.sh --aws --video demo       # the same, recorded: opens the report with the videos
```

Where each suite lives and how to run it: [tests/README.md](tests/README.md). What each test
proves, the coverage, and why the gaps are there: [docs/TESTING.md](docs/TESTING.md).

## Try the API in Swagger

Swagger UI is a web page that lists every endpoint and lets you call it. It reads
[docs/openapi.json](docs/openapi.json) (71 operations, built from the route table).

**Against the live AWS site** (nothing else needs to be running):

1. Run `./tools/swagger.sh` from the repo root, then open http://localhost:8090/swagger.html.
2. In **Servers**, pick `https://d1gov8jpsxhwer.cloudfront.net/api/tracker`.
3. Open **auth**, then **POST /auth/login**, **Try it out**, and send
   `{"username": "ML662930", "password": "Demo-pass-2026"}` with **Execute**. The page puts the
   token into **Authorize** for you (it lasts 15 minutes). Now try, for example,
   **GET /dashboard/projects**.

On AWS, anything but a GET changes the live data. Use your local copy to try changes.

**Against your local copy:**

1. Start the app with `./bin/start-dev.sh` (see [docs/SETUP.md](docs/SETUP.md)).
2. Run `./tools/swagger.sh`, open http://localhost:8090/swagger.html, and pick the server
   `http://localhost:3001/api/tracker`.
3. **POST /auth/login** with a local username and password, then call anything. Local
   usernames differ on every machine; [docs/SETUP.md](docs/SETUP.md#4-sign-in-locally-and-add-demo-data)
   shows how to list them and where the passwords come from.

To sign in as someone else, log in again: the new token replaces the old one. More, including
Postman, curl, the audit log and notifications step by step, and every error code:
[docs/API.md](docs/API.md) (Swagger: [section 5](docs/API.md#5-swagger-ui-step-by-step)).

## Documentation

Start at the index, [docs/README.md](docs/README.md). Every guide:

| Guide | Answers |
| --- | --- |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | What the brief asked for, which screen meets each item, who may do what, the rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the parts fit, where the data lives, the security measures in plain words |
| [docs/API.md](docs/API.md) | The endpoints, Swagger and Postman, errors, how to watch the audit log and notifications |
| [docs/TESTING.md](docs/TESTING.md) | What every test proves, where it is, why, coverage and its gaps, the load test results |
| [docs/SETUP.md](docs/SETUP.md) | Run it on your machine, deploy it to AWS, fix what usually goes wrong |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every design decision, why it was made and what was rejected |
| [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md) | How David used Claude Code: instructions, agents and orchestration |
| [CLAUDE.md](CLAUDE.md) | The working notes Claude Code reads on every session |

## How it fits together

```text
browser ─> CloudFront ─┬─> S3: the website (static files)
                       └─> /api/tracker/* ─> Lambda (backend/tracker/) ─> Aurora PostgreSQL

inside the Lambda:
  function.py   entry point: one database connection per warm instance; migrations on a cold start
  api/          one route table, one authorise() that re-reads the role from the database, one error table
  services/     the business rules and their SQL; know nothing about HTTP
  store/        connection, transactions, numbered migrations, the 5 integrity queries
  domain/       errors, money (integer cents), the Eastern-time clock; imports nothing else
```

Three choices worth knowing before you read the code:

- **Archive instead of delete.** The workshop rubric asks for DELETE returning 204. The tracker
  archives instead, because deleting a project would make every cost that referred to it
  impossible to explain. There is no DELETE route, tests assert it, and a database trigger
  refuses deletes.
- **The database refuses what one row can prove wrong** (a 41-hour booking, overlapping
  bookings, approving your own time), and five integrity queries, run after every database test
  and on `GET /admin/integrity-check`, catch the rest.
- **Something you may not see answers 404, not 403,** with the same message as a missing record,
  so nobody can probe which ids exist.

The full picture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The reasons:
[docs/DECISIONS.md](docs/DECISIONS.md).

## Run it yourself, or deploy it

The workshop ran everything on an Ubuntu 22.04 virtual desktop. In short:

```sh
source ~/.bashrc && ./bin/start-dev.sh   # local: Postgres, LocalStack (fake AWS), the API on :3001, the website on :3000
./bin/setup-participant.sh               # AWS: fresh temporary credentials (they expire)
./bin/deploy-backend.sh                  # AWS: Lambda, Aurora, CloudFront (terraform apply)
./bin/deploy-frontend.sh                 # AWS: build the website, upload it to S3, print the URL
```

First-time setup, the local logins, demo data, troubleshooting and the AWS details:
[docs/SETUP.md](docs/SETUP.md).

## How it was built

David designed it and directed Claude Code (Anthropic's coding agent), which wrote most of the
code and tests under the rules in [CLAUDE.md](CLAUDE.md): explain every change, prove it with a
test that fails without it, and never push or deploy (David did that). How the sessions, agents
and orchestration worked: [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md). Why the app is the way it
is: [docs/DECISIONS.md](docs/DECISIONS.md).

## Known gaps

- **No email or text messages.** The workshop's AWS role can't send them (no `ses:`
  permission, and the Lambda's private network has no way out), so a new or reset password is
  shown once to the admin and changed at first sign-in.
- **Changing your own email needs no current password** (`update_self` in
  `backend/tracker/services/users.py`). It would matter once an emailed reset exists.
- **A manager who books someone can work out their pay** from the project's planned cost.
- **"Mark all as read"** marks only the notifications on the current page.
- **Signing in costs about 1.1 seconds**, on purpose: the password hash is deliberately slow.
  More Lambda memory would roughly halve it.
- **Untested corners:** the uncovered 3% of the backend and 2% of the website are mostly guard
  branches for records that don't exist or are already archived, and less-used People screen
  paths. The list, with reasons: [docs/TESTING.md](docs/TESTING.md).
- **Not yet on AWS:** the Swagger CORS change and the 15 Oct post-demo features are committed but
  reach the live site only after the next `./bin/deploy-backend.sh` and
  `./bin/deploy-frontend.sh`.

## Licence

MIT-0, from the Citi coding workshop template: see [LICENSE](LICENSE).
