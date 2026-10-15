# Testing guide

For anyone who needs to run, read or extend this project's tests: what each kind of test
checks, why it exists, how to run it, and what its result means. Back to the
[root README](../README.md). The short list of every suite and where it lives is in
[tests/README.md](../tests/README.md).

Every command on this page runs from the repo root (the folder that holds `README.md`).

## Contents

1. [The kinds of test, at a glance](#1-the-kinds-of-test-at-a-glance)
2. [Each kind in detail](#2-each-kind-in-detail): why we use it, what it does, which part
   of the stack it checks, what the results mean, and what coverage it gives
   - [2.1 Database rule and integrity tests](#21-database-rule-and-integrity-tests-pytest)
   - [2.2 Business-rule tests](#22-business-rule-tests-pytest)
   - [2.3 API tests](#23-api-tests-pytest)
   - [2.4 Commit and race tests](#24-commit-and-race-tests-pytest)
   - [2.5 Bandit, the Python security scan](#25-bandit-the-python-security-scan)
   - [2.6 Website unit tests](#26-website-unit-tests-vitest-and-react-testing-library)
   - [2.7 Lint](#27-lint-eslint)
   - [2.8 The production build](#28-the-production-build)
   - [2.9 Browser tests](#29-browser-tests-playwright)
   - [2.10 Accessibility scans](#210-accessibility-scans-axe)
   - [2.11 k6 load test](#211-k6-load-test)
   - [2.12 npm audit](#212-npm-audit)
   - [2.13 The CI workflows on GitHub](#213-the-ci-workflows-on-github)
   - [2.14 The live API walk](#214-the-live-api-walk-toolsdemopy-demo)
3. [What coverage means, and our numbers](#3-what-coverage-means-and-our-numbers)
4. [Set up a machine to run the tests](#4-set-up-a-machine-to-run-the-tests)
5. [Run each suite](#5-run-each-suite)
6. [Run everything with one command](#6-run-everything-with-one-command-toolstest-allsh)
7. [Watching the tests](#7-watching-the-tests-toolse2esh)
8. [Why these tools](#8-why-these-tools)

## 1. The kinds of test, at a glance

A test is a small program that uses our code and checks the result. Each kind below looks at
a different part of the system, so each catches a different sort of mistake.

**The stack, in layers.** A click in the browser travels down this list, and the answer
travels back up:

```
Browser                 what a person sees: layout, clicks, the phone width
Website code            the React screens and components (frontend/src)
request.js              the one module every website call goes through: token, refresh, errors
CloudFront (AWS) or the local proxy (port 3001)    pass /api/tracker/... on to the Lambda
API layer               route table, who may call what, error answers (backend/tracker/api)
Services                the business rules (backend/tracker/services)
Store                   the connection, atomic() transactions, queries (backend/tracker/store)
Postgres                constraints, triggers, the 5 integrity queries
```

| Kind | Where it lives | What it checks | Latest result |
| --- | --- | --- | --- |
| [Database rule and integrity tests](#21-database-rule-and-integrity-tests-pytest) | `tests/backend/` (4 files) | Postgres itself refuses bad rows | 88 tests |
| [Business-rule tests](#22-business-rule-tests-pytest) | `tests/backend/` (9 files) | The rules in `services/`, on a real Postgres | 383 tests |
| [API tests](#23-api-tests-pytest) | `tests/backend/` (5 files) | Routes, sign-in checks, error answers, the OpenAPI file | 173 tests |
| [Commit and race tests](#24-commit-and-race-tests-pytest) | `tests/backend/` (2 files) | Writes really save; two people can't win the same task | 4 tests |
| Backend, all four kinds | `tests/backend/` (20 test files) | | **648 passed, 97% of statements** (15 Oct) |
| [Bandit](#25-bandit-the-python-security-scan) | reads `backend/tracker` | Security mistakes in the Python | no issues |
| [Website unit tests](#26-website-unit-tests-vitest-and-react-testing-library) | `frontend/src/**/*.test.js(x)`, beside the code | Each screen and component, with the API faked | **846 passed in 51 files, 98.04% of lines** (15 Oct) |
| [Lint](#27-lint-eslint) | reads `frontend/` | JavaScript and React mistakes | clean |
| [Production build](#28-the-production-build) | `frontend/` to `frontend/dist` | The website builds the way the deploy builds it | builds |
| [Browser tests](#29-browser-tests-playwright) | `frontend/e2e/*.spec.js` (12 files) | The whole app in a real browser | **34 tests: 33 passed, 1 skipped on purpose** (local, 15 Oct); 17 of 17 on AWS |
| [Accessibility scans](#210-accessibility-scans-axe) | inside `frontend/e2e/tour.spec.js` | WCAG A and AA problems on every screen | 8 tests, 100 scans, all passed |
| [k6 load test](#211-k6-load-test) | `tests/load/load.js` | Speed and failures with many users at once | 4,038 requests, 0 failed, 4 of 4 thresholds (local, 14 Oct) |
| [npm audit](#212-npm-audit) | reads the website's package list | Known security holes in the website's packages | 0 high (14 Oct) |
| [CI workflows](#213-the-ci-workflows-on-github) | `.github/workflows/` | Bandit, npm audit and Checkov on every push | run by GitHub |
| [Live API walk](#214-the-live-api-walk-toolsdemopy-demo) | `tools/demo.py demo` | The seven questions and ten refused rule breaks, over HTTP | 0 unexpected, 0 integrity violations |

**Which kind looks at which layer.** `yes` = it runs that layer, `part` = some of it,
`reads` = it reads the code without running it, `-` = not touched.

| Kind | Browser | Website code | request.js | Proxy or CloudFront | API layer | Services | Store | Postgres |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Database rule tests | - | - | - | - | - | - | part | yes |
| Business-rule tests | - | - | - | - | - | yes | yes | yes |
| API tests | - | - | - | part (both path shapes, as events) | yes | yes | yes | yes |
| Commit and race tests | - | - | - | - | - | part | yes | yes |
| Bandit | - | - | - | - | reads | reads | reads | - |
| Website unit tests | part (jsdom) | yes | yes (network faked) | - | - | - | - | - |
| Lint, production build | - | reads | reads | - | - | - | - | - |
| Browser tests | yes | yes | yes | yes | yes | yes | yes | yes |
| Accessibility scans | yes | yes | - | - | - | - | - | - |
| k6 load test, live API walk | - | - | - | yes | yes | yes | yes | yes |

Read it by column to see how well a layer is guarded. Only the browser tests run the whole
chain, which is why they exist even though they are the slowest.

## 2. Each kind in detail

### 2.1 Database rule and integrity tests (pytest)

Files: [`test_schema.py`](../tests/backend/test_schema.py) (56 tests),
[`test_no_delete.py`](../tests/backend/test_no_delete.py) (13),
[`test_integrity.py`](../tests/backend/test_integrity.py) (10),
[`test_migrate.py`](../tests/backend/test_migrate.py) (9). About 2 seconds.

**Why we use it.** The database is the last line of defence. If a bug in our Python lets a
bad row through, Postgres must still refuse it. These tests prove the refusal lives in
Postgres itself, not only in our code.

**What it does.**
- `test_schema.py`: one test per rule. It builds valid rows, breaks exactly one thing (a
  booking of 41 hours a week, two overlapping bookings for one person on one project, a
  deliverable that depends on itself, a time entry over 24 hours) and checks Postgres refused
  it by the named rule.
- `test_no_delete.py`: tries to delete a row from every table, and to change or delete an
  audit row. Postgres triggers refuse all of it (nothing is ever deleted; things are archived).
- `test_integrity.py`: each of the 5 integrity queries returns nothing on clean data and finds
  a problem planted on purpose. The same 5 queries run after every database test, and the
  admin can run them live with `GET /admin/integrity-check`.
- `test_migrate.py`: the migration runner applies the numbered files in
  `backend/tracker/store/migrations/` once, in order, all or nothing.

**Which part of the stack.** Postgres (constraints, exclusion constraints, triggers), plus the
migration runner and the integrity queries in the store layer.

**What the results mean.** Passing ends with `88 passed in` and the seconds. A failure names
the test (`FAILED tests/backend/test_schema.py::test_...`) and the assertion: Postgres accepted
something it should refuse, or refused it by a different rule. If you changed a rule on
purpose, change its test. Otherwise a migration is wrong. Never edit a migration that has run
on Aurora; add a new numbered one.

**Coverage.** Counted in rules, not lines: one test per constraint, and a clean case and a
planted case for each integrity query. It adds to the backend's 97% for the migration runner
and the integrity queries. It can't catch a rule that lives only in Python.

### 2.2 Business-rule tests (pytest)

Files (383 tests): [`test_users.py`](../tests/backend/test_users.py),
[`test_work.py`](../tests/backend/test_work.py), [`test_projects.py`](../tests/backend/test_projects.py),
[`test_requests.py`](../tests/backend/test_requests.py), [`test_dashboard.py`](../tests/backend/test_dashboard.py),
[`test_audit.py`](../tests/backend/test_audit.py), [`test_domain.py`](../tests/backend/test_domain.py),
[`test_security.py`](../tests/backend/test_security.py), [`test_sessions.py`](../tests/backend/test_sessions.py).
About 7 seconds.

**Why we use it.** The business rules are the heart of the product, so they get the most
tests. These tests call the rules directly, never through HTTP (they never import `api`), so
a failure points at the rule, not at the wiring.

**What it does.** It calls the services against a real Postgres database, not a pretend one.
Each test runs inside a transaction that is rolled back at the end
([`conftest.py`](../tests/backend/conftest.py), `force_rollback=True`), so tests never see each
other's data. The clock is frozen to Wednesday 14 Oct 2026 (`FROZEN_TODAY`), and passwords
hash at 1,000 rounds in tests (production stays at 600,000; `test_security.py` checks that).
After every test the 5 integrity queries must return nothing. The rules covered: who may do
what, capacity and overtime, the task limit, sign-off, budget maths, minimum pay, requests,
audit rows and who gets notified, money, the clock, password hashing, access tokens (15
minutes) and refresh tokens (rotation, reuse detection).

**Which part of the stack.** The services, the store they call, and Postgres.

**What the results mean.** Passing ends with `N passed in` and the seconds. A failure shows
the test name (for example
`tests/backend/test_work.py::test_logging_past_capacity_asks_first_without_overtime`) and the
assertion that did not hold. A failure at the end of a test with an integrity-check message is
different: the rule's own checks passed, but it left the data broken, which is a bug in the
rule. To rerun only the tests whose names contain a word: `.venv/bin/pytest -q -k capacity`.

**Coverage.** Most of the backend line coverage comes from here. It can't catch wiring
mistakes (a route pointing at the wrong service), the real network, or anything on screen.

### 2.3 API tests (pytest)

Files (173 tests): [`test_api.py`](../tests/backend/test_api.py),
[`test_api_read_walk.py`](../tests/backend/test_api_read_walk.py),
[`test_api_audit_walk.py`](../tests/backend/test_api_audit_walk.py),
[`test_function.py`](../tests/backend/test_function.py),
[`test_openapi.py`](../tests/backend/test_openapi.py). About 4 seconds.

**Why we use it.** The rules can be right and the wiring still wrong. These tests prove a web
request reaches the right rule, with the right checks, and comes back in the agreed shape.

**What it does.** It builds events shaped like the ones AWS hands the Lambda and sends them
through the real entry point (`dispatch()`, and `function.handler` in `test_function.py`). It
checks:
- both path shapes: `/api/tracker/projects/7` as it arrives on AWS, and `//projects/7` as it
  arrives through the local proxy;
- every route needs a token, and the role is read from the database, never from the token;
- something that exists but isn't yours answers 404, not 403, with byte-identical messages;
- every error is `{ "error": ... }` and every list is `{ items, page, pageSize, total, totalPages }`;
- there is no DELETE route;
- two "walk" tests call every read route and every write route, and the write walk fails if a
  route changes data without writing an audit row (add a route and forget the audit row, and
  the suite fails);
- [`docs/openapi.json`](openapi.json) is identical to a fresh build from the route table.

**Which part of the stack.** The API layer (route table, `authorise`, error table,
serialisers) and everything under it. CloudFront and the proxy are not run; only their path
shapes are sent.

**What the results mean.** Passing ends with `N passed in` and the seconds. A failure in
`test_openapi.py` means the saved OpenAPI file is out of date: rebuild it with
`.venv/bin/python tools/openapi.py` and commit it. A failure saying a route was not walked
means you added a route: add it to the walk. Any other failure shows the status or body that
came back next to the one expected.

**Coverage.** The `api/` folder is at 100% of lines and branches, and every route (70
operations) is called by the two walks. It can't catch real network problems, what CloudFront
does to headers, or real-world speed.

### 2.4 Commit and race tests (pytest)

Files: [`test_store_commits.py`](../tests/backend/test_store_commits.py) (2 tests),
[`test_claim_race.py`](../tests/backend/test_claim_race.py) (2). Under 1 second each.

**Why we use it.** Every other backend test rolls back on purpose, so a bug where nothing is
ever really saved would pass all of them. And a race (two people pressing **Take this** at the
same moment) never shows with one database connection.

**What it does.**
- `test_store_commits.py` builds its own database (`tracker_commit_test`), writes inside
  `atomic()` and asks a second, separate connection whether the row is there. It also checks
  the connection is in autocommit mode: psycopg's default would open a hidden transaction and
  turn every `atomic()` into a savepoint that never commits.
- `test_claim_race.py` uses real, separate connections. Connection A takes a task inside an
  open transaction; connection B tries in another thread; the test waits until Postgres
  reports B blocked on a lock (`pg_stat_activity`), then lets A commit. Two cases: two people
  and one Ready task (the second is refused), and one person at 1 of 2 tasks taking two tasks
  at once (one is refused; this fails if the `SELECT ... FOR UPDATE` lock on the person's row
  is removed).

**Which part of the stack.** The store (`connect()` and `atomic()` in
`backend/tracker/store/postgres.py`), the Take-this rule, and Postgres' row locks.

**What the results mean.** Passing ends with `2 passed in` for each file. A commit failure is
urgent: writes would look fine in the app and vanish. A race failure means a lock is missing
or in the wrong place; look at the locking in `claim_task` first.

**Coverage.** Two properties, fully: committed writes are visible, and these two races can't
both win. Other concurrent paths are guarded by Postgres rules or locks but not raced here.

### 2.5 Bandit, the Python security scan

Command: `.venv/bin/bandit -r backend/tracker -x backend/tracker/psycopg,backend/tracker/psycopg_binary,backend/tracker/psycopg_binary.libs`.
Under 1 second.

**Why we use it.** Some security mistakes are visible without running anything, and CI runs
bandit on every push (section 2.13), so a finding shows as a red cross on GitHub.

**What it does.** Reads the Python and flags known risky patterns: `assert` in app code
(B101), `random` used for passwords (B311), SQL built from strings (B608), hard-coded
passwords (B105, B106). The `-x` list leaves out the psycopg copy that `bin/start-dev.sh`
puts into the folder for LocalStack. That is why the backend tests live in `tests/`, outside
`backend/`: their `assert` lines would fail it.

**Which part of the stack.** Reads the backend code (API layer, services, store, domain).
Runs nothing.

**What the results mean.** Passing prints `No issues identified.` (with `-q`, as
`tools/test-all.sh` runs it, it prints nothing). A failure prints `Issue: [B608:...]` with the
file and line: fix that line. A deliberate exception gets a `# nosec` comment with the reason;
two exist, both B105 in `backend/tracker/services/users.py` (a column named
`password_changed_at`, not a password).

**Coverage.** Pass or fail over every backend file. It can't find a logic error.

### 2.6 Website unit tests (Vitest and React Testing Library)

Files: 51 files named `*.test.jsx` or `*.test.js`, each beside the code it tests in
`frontend/src/` (for example `frontend/src/pages/approvals/`). Setup in
[`frontend/src/test/setup.js`](../frontend/src/test/setup.js); config in the `test:` block
of [`frontend/vite.config.js`](../frontend/vite.config.js). About 3 to 4 minutes.

**Why we use it.** They check the website without a browser or a server, so they run
anywhere. They catch the mistakes a person would see: a wrong label, a missing button, a form
that sends the wrong field. React Testing Library finds things the way a person does (by
label, role and visible text), so a test breaks only when a user would notice.

**What it does.** Vitest renders each screen in jsdom (a pretend browser written in
JavaScript) and fakes the API at `fetch`. It checks each screen shows the right thing and
sends the right request: field names exactly as the API spells them, money as cents, only
the fields that changed, refusals shown as the server wrote them, buttons per role, and the
phone layout. The real `request.js` runs (tokens, refresh, error handling); only the network
is faked.

**Which part of the stack.** The website code and `request.js`. jsdom stands in for the
browser, so layout and colour are not tested here.

**What the results mean.** Passing prints `Test Files  51 passed (51)` and
`Tests  846 passed (846)`. A failure prints `FAIL`, the file and test name, and a diff of what
the screen showed against what was expected. Rerun one folder to see it quickly:
`(cd frontend && npx vitest run src/pages/approvals)`. If you changed a label on purpose,
update the test.

**Coverage.** Line, statement, branch and function coverage, measured by V8: **98.04% of
lines** on 15 Oct (section 3). It can't catch what jsdom can't lay out (sideways scrolling,
overlap, colour contrast), or a faked API drifting from the real one. The browser tests
cover both.

### 2.7 Lint (ESLint)

Command: `(cd frontend && npm run lint)`. About 5 seconds.

**Why we use it.** Cheap to run, and it catches mistakes before a test runs: an unused
variable, a React hook used in the wrong place.

**What it does.** Reads the website code against the recommended JavaScript rules, the React
hooks rules and the Vite refresh rules ([`frontend/eslint.config.js`](../frontend/eslint.config.js)).

**Which part of the stack.** Reads the website code. Runs nothing.

**What the results mean.** Passing prints only the two npm lines (`> eslint .`) and exits 0.
A failure lists `file:line:column error rule-name` and ends with `✖ N problems`: fix each
line it names.

**Coverage.** Pass or fail over every file in `frontend/`. It can't find a logic error.

### 2.8 The production build

Command: `(cd frontend && npm run build)`. A few seconds.

**Why we use it.** The development server never builds the site the way it ships. This is
the same `vite build` that `bin/deploy-frontend.sh` runs before uploading to S3, so a failure
here would be a failed deploy.

**What it does.** Bundles the website into `frontend/dist`, with each signed-in page in its
own file, loaded on first visit.

**Which part of the stack.** The website code and its packages, as shipped.

**What the results mean.** Passing ends with `✓ built in` and the seconds, and exits 0. A
failure prints the file and line that would not compile.

**Coverage.** Pass or fail. To test the built files in a browser, see
[Against the production build](#against-the-production-build) in section 2.9.

### 2.9 Browser tests (Playwright)

Files: 12 in [`frontend/e2e/`](../frontend/e2e/), 34 tests. Config:
[`frontend/playwright.config.js`](../frontend/playwright.config.js). Run them with
[`tools/e2e.sh`](../tools/e2e.sh) (section 7). About 5 minutes for all of them locally.

**Why we use it.** It is the only test that sees what a user sees: a real browser, a real
sign-in, the real API, the real database and the real layout. It catches what every other
kind misses: a screen that renders but is wired to nothing, a page that scrolls sideways on a
phone, a menu that can't be reached.

**What it does.** A real Chromium signs in and clicks through the app, checking what appears.

| File | Tests | What it checks | Adds data? |
| --- | --- | --- | --- |
| `demo.spec.js` | 2 | The seven questions on screen, then the phone menu | No |
| `tour.spec.js` | 9 | Every screen for a manager and an employee, desktop and phone, light and dark, no sideways scrolling, an axe scan of each (2.10), and a deep-link refresh | No |
| `history.spec.js` | 2 | A manager reads a person's history without the before/after values; an employee sees My history | No |
| `schedule.spec.js` | 4 | The Schedule: a bar per booking, the over week outlined, keyboard tooltip and Enter | No |
| `timeline.spec.js` | 4 | The deliverables timeline: Late words and icon, tooltips on hover, tap and focus, print stripes | No |
| `budget.spec.js` | 3 | The budget chart: where the Budget line sits, tooltips | No |
| `workload.spec.js` | 5 | The workload chart: gridlines and bars line up, Tab opens the tooltip, contrast | No |
| `pull.spec.js` | 1 | An employee takes a Ready task (**Take this**) and puts it back | **Yes**: a task, audit rows, bell notifications |
| `requests.spec.js` | 1 | An employee asks, the manager rejects with a note, the employee reads it on a phone | **Yes**: a request, audit rows, notifications |
| `timelog.spec.js` | 1 | An employee logs 15 minutes, the manager approves, the project's Spent goes up | **Yes**: an approved time entry |
| `project-lifecycle.spec.js` | 1 | An admin creates, edits, archives and reactivates a project | **Yes**: an archived project |
| `screenshots.spec.js` | 1 | Retakes the pictures in [`docs/screenshots/`](screenshots/) | Changes repo files; runs only with `E2E_SCREENSHOTS=1` |

**Which part of the stack.** All of it, on the local stack or on the live AWS site.

**What the results mean.** `tools/e2e.sh` ends with a block headed `=== What this means ===`:

| It says | What happened | What to do |
| --- | --- | --- |
| `PASSED: N tests passed` | In a real browser, the app did what each test expects | Nothing |
| `FAILED: N tests failed` | A check did not hold. The error above the block names the file, the line and what was expected | Open the recording it prints (`npx playwright show-trace ...`), or rerun that file with `--show` and watch |
| `SKIPPED: N` with a list | Those tests did not have what they need (usually `E2E_ADMIN_PASSWORD`). Not a failure | Set what it names, if you want them to run |
| `COULD NOT RUN` | Playwright stopped before any test finished | Read the first error above; a missing browser is fixed with `(cd frontend && npx playwright install chromium)` |

Exit code: 0 all passed, 1 a failure or a run that could not start, 2 a request the script
refused. Every failed test keeps a **trace** (a recording of each step with screenshots,
network calls and the console) in `frontend/test-results/`, which is emptied at the start of
every run, so open it before you run again. If a test fails only after you changed a label
or a layout on purpose, update the test.

**Coverage.** Counted in **journeys**, not lines: the manager's demo (all seven questions),
the pull board, a request and its answer, every screen for both roles at two widths in both
colour modes, a person's history, the three charts, the Schedule, log time then approve, and
an admin's project life cycle. A line percentage would mix in code the unit tests already
cover. What it can't catch: other browsers (Chromium only), the forced password change at
first sign-in (not walked in a browser; covered by backend and unit tests), and anything
after the data has drifted far from the seed.

#### Against the production build

The development server never splits the site into page files; only the build does. To test
the real built files before a deploy, serve the build on port 4173 and run read-only files
against it (the local stack must be running for the API on 3001):

```sh
(cd frontend && npm run build)
(cd frontend && npx vite preview --port 4173 --strictPort > /dev/null 2>&1 &)
MARIA=$(PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -At -c "SELECT username FROM users WHERE email = 'maria.lopez@acme.test' AND NOT is_archived")
ANA=$(PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -At -c "SELECT username FROM users WHERE email = 'ana.ruiz@acme.test' AND NOT is_archived")
(cd frontend && E2E_BASE_URL=http://localhost:4173 E2E_API=http://localhost:3001/api/tracker E2E_MANAGER_USERNAME=$MARIA E2E_EMPLOYEE_USERNAME=$ANA E2E_TOUR_DIR=$HOME/tour-shots npx playwright test tour history)
pkill -f "vite preview --port 4173"
```

This calls Playwright directly, because `tools/e2e.sh` always points local runs at port 3000.

### 2.10 Accessibility scans (axe)

Where: the `scan` helper in [`frontend/e2e/tour.spec.js`](../frontend/e2e/tour.spec.js),
using `@axe-core/playwright` 4.13.0. Run: `./tools/e2e.sh tour` (about 3 minutes).

**Why we use it.** Accessibility is part of a UI that looks finished, and it is easy to break
without noticing. axe is the rule engine behind Lighthouse's accessibility score. Running it
inside the tour scans every screen in its real, signed-in, loaded state, with no second walk
through the app.

**What it does.** The tour runs one test per colour mode, role and width (2 x 2 x 2 = 8 tests,
each ending in `(axe)`). Each scans the sign-in page, every screen it opens and, at phone
width, the open menu: 50 scans per colour mode, 100 in all. It checks the WCAG 2.0 to 2.2 A
and AA rules a machine can decide: colour contrast, names on buttons, links and fields,
labels, list and table structure, valid ARIA, page language.

**Which part of the stack.** The page the browser ends up with. The API and database had to
run to put data on the page, but they are not what is checked.

**What the results mean.** When all 8 `(axe)` tests pass, no screen has a `serious` or
`critical` problem. When one fails, it lists each problem as
`<screen>: <rule> (<impact>, N elements: <first selector>)`. Read the rule name (for example
`color-contrast` or `list`), open that screen, fix the element named, and rerun
`./tools/e2e.sh tour`. `tools/test-all.sh` shows these 8 tests as their own row,
"Accessibility". Real finds so far, all fixed: the side menu's links not in list items, empty
allocation weeks in grey at 2.7:1, and red words on a see-through red wash in dark mode at
4.2:1 (AA needs 4.5:1).

**Coverage.** Counted in scans (100) and rules (every WCAG A and AA rule axe has), with
`serious` and `critical` as the failing level. Automated scanners find roughly a third to half
of accessibility problems. Not covered: screen readers (NVDA, VoiceOver), keyboard order
beyond the tests that press Tab, and dialogs and admin screens (the tour opens none).

### 2.11 k6 load test

File: [`tests/load/load.js`](../tests/load/load.js). About 1 minute 47 seconds locally, about
4 minutes on AWS.

**Why we use it.** Every other test runs one user at a time. The client will have many
managers on the dashboard at once, and slowness is a failure too. Pass or fail comes from
thresholds written in the script, so the answer is not a matter of opinion.

**What it does.** Up to 10 virtual managers locally (25 on AWS; `K6_VUS` changes it) each sign
in once, then repeat the reads their screens make (dashboard, at-risk panel, projects list,
allocation grid, unread count, one project's detail, budget and deliverables), one second
apart. Then 20 sign-ins are sent, 10 at a time. It only reads: nothing is written.

**Which part of the stack.** From the proxy (or CloudFront) down to Postgres, under load. k6
sends HTTP itself, so the website and browser are not involved.

**What the results mean.** k6 ends with a summary and a tick or cross beside each threshold
([`load.js:54-59`](../tests/load/load.js)): under 1% of requests fail; 95 in 100 reads answer
within 1 s; 95 in 100 sign-ins answer within 3 s; over 99% of checks (status 200, a token on
sign-in) pass. It exits 0 when all pass and 99 when one fails, with the cross on that line.
Slow reads point at a query; failed requests point at the Lambda or the database (on AWS, a
database that was asleep: warm it first). Sign-in gets a looser limit on purpose: the
password hash (PBKDF2, 600,000 rounds) is built to cost about a second of CPU, to make
guessing passwords expensive.

**Coverage.** None by lines; it measures speed and failures. Last local run (14 Oct, ramp to
10 users, k6 v2.2.0):

| Measure | Result | Threshold |
| --- | --- | --- |
| Requests | 4,038 (4,008 reads, 30 sign-ins), 37.7 a second | |
| Failed | 0 (0.00%) | under 1% |
| Checks | 4,038 of 4,038 | over 99% |
| Reads | median 24 ms, p95 67 ms | p95 under 1,000 ms |
| Sign-ins | median 599 ms, p95 1.3 s | p95 under 3,000 ms |

It can't catch anything that writes, a crowd above 10 locally (LocalStack itself fails past
about 15), or slow leaks over hours. Don't run it while browser tests use the same API.

### 2.12 npm audit

Command: `(cd frontend && npm audit --audit-level=high)`.

**Why we use it.** The website is built from hundreds of open-source packages. npm
audit compares them with the public list of known security holes, and CI fails on a high one.

**What it does.** Reads the package list (`frontend/package.json` and the lock file npm
writes beside it; the lock file is not committed) and reports each known problem by
package and severity.

**Which part of the stack.** The website's packages. Runs none of our code.

**What the results mean.** Passing prints `found 0 vulnerabilities` (or only low and moderate
ones) and exits 0. A high or critical finding names the package and usually the fix
(`npm audit fix`, or a version to move to). Run it before adding any package.

**Coverage.** A count of known problems: 0 high on 14 Oct.

### 2.13 The CI workflows on GitHub

Files: [`.github/workflows/`](../.github/workflows/). They run on every push and every pull
request, and show as a tick or a cross beside each commit on GitHub (the Actions tab has the
logs).

| Workflow | What it runs | Fails the build? |
| --- | --- | --- |
| [`python.actions.yml`](../.github/workflows/python.actions.yml) ("Security Check - Python") | `bandit -r ./backend` on Python 3.11 | Yes, on any finding |
| [`react.actions.yml`](../.github/workflows/react.actions.yml) ("Security Check - React") | `npm install`, then `npm audit --audit-level=high` on Node 24 | Yes, on a high or critical finding |
| [`terraform.actions.yml`](../.github/workflows/terraform.actions.yml) ("Security Check - Terraform") | Checkov, a scanner for risky cloud settings, on `infra/` | No: `soft_fail: true`, it reports only |

**Why we use it.** The workshop organisers set these up; they guard every push without
anyone remembering to run them.

**Which part of the stack.** Reads the backend code, the website's packages and the
Terraform. Runs none of our tests.

**What the results mean.** A red cross on Python or React: open the run's log, find the
finding, and fix it as in 2.5 or 2.12.

**Coverage.** These are scans, not tests. **The test suites do not run in CI**: the backend
tests need Postgres and the browser tests need the whole stack, so they run on a machine with
`tools/test-all.sh`. Adding a Postgres service to a workflow is the next step; not built.
`terraform -chdir=infra validate` is run by hand before committing infrastructure changes.

### 2.14 The live API walk (`tools/demo.py demo`)

File: [`tools/demo.py`](../tools/demo.py). Not a test suite, but a check of the business
rules over real HTTP, with no browser and no test database.

**Why we use it.** It shows the rules holding on a running system (the proxy or CloudFront,
the Lambda and the database), and it is the terminal half of the demo.

**On AWS it now stops early.** It signs in as Ana Ruiz, who is archived on the live site, and
a failed sign-in ends the script (`Login failed for AR553882`, `tools/demo.py:75-78`) right
after it prints the accounts. Run it on the local stack.

**What it does.** Signs in as the admin, Maria, Ana and Ben over HTTPS and prints the
accounts, the answers to the seven questions, then ten requests that break a rule (logging
past 40 hours, logging time tomorrow, opening another manager's project, an id that does not
exist, an employee creating a project, an employee approving time, a dependency loop, signing
off a deliverable with open tasks, a DELETE, a request with no token), then the integrity
check.

**Which part of the stack.** From the front door (CloudFront or the local proxy) down to
Postgres.

**What the results mean.** Healthy: every refusal line says `REFUSED as designed`, none says
`UNEXPECTED`, and the last line says `5 integrity checks, 0 violations`. An `UNEXPECTED` line
means a different status came back than the rule demands: a rule did not hold, or the data is
no longer the seed's. The script exits non-zero only when a request it needs fails, so read the
lines, not the exit code. It needs the seeded demo data.

**Coverage.** The seven questions and ten rules, once each, plus the invariant. A smoke test,
not a replacement for the backend suites.

## 3. What coverage means, and our numbers

**Coverage** is the share of our code that the tests ran. It says what was *run*, not what
was *checked*: it finds code no test touches, but can't prove the tested code is right.

| Measure | Plain words |
| --- | --- |
| **Line** | Of all the lines of code, how many ran at least once |
| **Statement** | The same, per instruction (one line can hold two) |
| **Branch** | Every `if` has two ways out (yes and no); how many of those ways were taken. The strictest |
| **Function** | How many functions were called at least once |

**Backend** (pytest-cov, configured by [`.coveragerc`](../.coveragerc) to measure our code only,
not the psycopg copy): **97% of statements** with 648 tests (15 Oct). The API layer (`api/`)
is 100% of lines and branches. With branches counted the total was 95% on 14 Oct. To see the
lines no test ran: `.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing`.

**Website** (Vitest with V8 coverage, the JavaScript engine inside Chrome and Node):
**98.04% of lines** with 846 tests (15 Oct). `npm run test:coverage` prints four lines,
Statements, Branches, Functions and Lines, each as a percentage and a count. The one module
that talks to the API, `services/request.js`, was at 100% of lines on 14 Oct.

**Browser tests, axe, k6, lint, bandit, npm audit:** no percentage, on purpose. Browser tests
count journeys, axe counts scans and rules, k6 measures speed and failures, and the scanners
are pass or fail.

**Against the workshop's targets:**

| Target | Goal | Today | Met? |
| --- | --- | --- | --- |
| Backend code coverage | 80% | 97% of statements | Yes |
| Website code coverage | 80% | 98.04% of lines | Yes |
| API endpoints | 90% | `api/` 100%; every route called by the two walks | Yes |
| Error handling | 90% | `api/errors.py` 100%; malformed input and a crash returning 500 are tested | Yes |
| Critical user paths end to end | 100% | Every journey in 2.9, in a real browser | Almost: the forced password change at first sign-in is covered by backend and unit tests, not walked in a browser |

**Not covered, and why:** guard branches for records that don't exist or are already
archived; the database going down in the middle of a request (hard to stage, and Postgres
rolls the transaction back); other browsers than Chromium; screen readers.

## 4. Set up a machine to run the tests

The machine needs the local stack's Postgres on port 5432 (user `postgres`, password
`postgres123`), as [SETUP.md](SETUP.md) sets up. The backend tests create and drop their own
databases (`tracker_test`, set in [`tests/backend/pg.py`](../tests/backend/pg.py)) and never
touch the app's data.

```sh
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt bandit
(cd frontend && npm install)
(cd frontend && npx playwright install chromium)
(cd frontend && sudo npx playwright install-deps chromium)
```

The last line installs the Linux libraries the browser needs and asks for your password.
`requirements-dev.txt` pins psycopg, pytest and pytest-cov; bandit is installed beside them.

**k6** (only for the load test) is one program. Download the Linux release from
github.com/grafana/k6/releases (v2.2.0 is the one used here), unpack it, and put `k6` in
`~/.local/bin`. `k6 version` should print `k6 v2.2.0`.

**The browser tests also need** the local stack running (`./bin/start-dev.sh`, which ends with
`All Components Verified!`) and the demo data seeded once (`tools/demo.py seed`; see
[SETUP.md](SETUP.md)). The seed gives every demo person the password `Demo-pass-2026`. Local
usernames are generated by the seed, so they differ on every machine: the scripts look them
up in the local database by email.

## 5. Run each suite

```sh
# Backend: all four kinds (648 tests, about 30 seconds), then with coverage
.venv/bin/pytest -q
.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing

# Backend: one kind, one file, or one rule by name
.venv/bin/pytest -q tests/backend/test_schema.py tests/backend/test_no_delete.py tests/backend/test_integrity.py tests/backend/test_migrate.py
.venv/bin/pytest -q tests/backend/test_api.py tests/backend/test_api_read_walk.py tests/backend/test_api_audit_walk.py tests/backend/test_function.py tests/backend/test_openapi.py
.venv/bin/pytest -q tests/backend/test_store_commits.py tests/backend/test_claim_race.py
.venv/bin/pytest -q -k byte_identical

# Bandit
.venv/bin/bandit -r backend/tracker -x backend/tracker/psycopg,backend/tracker/psycopg_binary,backend/tracker/psycopg_binary.libs

# Website unit tests (846 tests, 3 to 4 minutes), with coverage, one folder
(cd frontend && npm test)
(cd frontend && npm run test:coverage)
(cd frontend && npx vitest run src/pages/approvals)

# Lint, production build, npm audit
(cd frontend && npm run lint)
(cd frontend && npm run build)
(cd frontend && npm audit --audit-level=high)

# Browser tests and the axe scans (section 7 has every option)
./tools/e2e.sh
./tools/e2e.sh --aws
```

**k6, locally** (looks up Maria Lopez's local username, then runs 10 users through the proxy):

```sh
K6_USERNAME=$(PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -At -c "SELECT username FROM users WHERE email = 'maria.lopez@acme.test' AND NOT is_archived") K6_PASSWORD=Demo-pass-2026 k6 run tests/load/load.js
```

**k6, on AWS** (25 users as Maria, `ML662930`; warm the site first, as the database sleeps
when idle):

```sh
curl -s https://d1gov8jpsxhwer.cloudfront.net/api/tracker/health
K6_PROFILE=aws K6_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net/api/tracker K6_USERNAME=ML662930 K6_PASSWORD=Demo-pass-2026 k6 run tests/load/load.js
```

**The live API walk**, on the local stack (on AWS it stops at Ana's sign-in, section 2.14).
The local admin password is the one you chose at first sign-in. This asks for it without
showing it on screen:

```sh
read -rsp "Local admin password: " TRACKER_ADMIN_PASSWORD && export TRACKER_ADMIN_PASSWORD && echo && python3 tools/demo.py demo
```

## 6. Run everything with one command (`tools/test-all.sh`)

```sh
./tools/test-all.sh
```

[`tools/test-all.sh`](../tools/test-all.sh) runs, in order: the backend tests with coverage,
bandit, the website tests with coverage, lint, the production build, then the browser tests
if ports 3000 and 3001 are listening, with the axe scans as their own row. It looks up the
local Maria, Ana and Sam by email (or uses `E2E_MANAGER_USERNAME`, `E2E_EMPLOYEE_USERNAME`
and `E2E_ZEUS_MANAGER_USERNAME` if set). Its browser tests always go to the local stack,
never AWS, even if an AWS address is still exported, because four of the files add data.
About 10 minutes in all. It ends with a table, and exits 1 if any step failed. A clean run looks like this (counts
from 15 Oct):

```
=== Summary ===
Step            Result Detail
Backend tests   PASS   648 passed, coverage 97%
Bandit          PASS   no issues
Website tests   PASS   846 passed, lines 98.04%
Lint            PASS   clean
Build           PASS   frontend/dist
Browser tests   PASS   33 passed, 1 skipped; screenshots in /tmp/tmp.XXXXXXXXXX
Accessibility   PASS   axe on every tour screen, light and dark, 8 tests, 100 scans, WCAG A/AA
Full logs: /tmp/tmp.XXXXXXXXXX
```

`SKIP` on the last two rows means the local stack was not running; start it with
`./bin/start-dev.sh` in another terminal and run the script again. `FAIL` names the log to
read. Each run adds rows to the local database (a task, a rejected request, a time entry, an
archived project, audit rows and bell notifications), because nothing is ever deleted. The
one skipped test is `screenshots.spec.js`, which runs only on request.

## 7. Watching the tests (`tools/e2e.sh`)

[`tools/e2e.sh`](../tools/e2e.sh) runs the browser tests with one command, on the local stack
or the live site. It does the setup that is easy to get wrong (usernames, which address, a
warm database, a folder for screenshots), runs Playwright, and ends with the plain
"What this means" block from section 2.9. `./tools/e2e.sh --help` prints every option.

| You want | Command |
| --- | --- |
| Every browser test, local, no window (about 5 minutes) | `./tools/e2e.sh` |
| One file (any part of its name) | `./tools/e2e.sh demo` |
| Several files | `./tools/e2e.sh demo schedule` |
| **Watch it**: a real window, half a second between steps | `./tools/e2e.sh --show demo` |
| Watch it slower or faster (milliseconds between steps) | `E2E_SLOWMO=800 ./tools/e2e.sh --show demo` |
| **A video of every test**, then the report with the videos | `./tools/e2e.sh --video demo` |
| Playwright's own window: pick a test, run it, step back through it | `./tools/e2e.sh --ui` |
| The live AWS site: `demo`, `history`, `schedule` and `tour` (17 tests, about 2.5 minutes) | `./tools/e2e.sh --aws` |
| The live site, watching | `./tools/e2e.sh --aws --show demo` |
| A file that adds data, on the live site (asks you to be sure) | `./tools/e2e.sh --aws --allow-writes timelog` |
| Playwright's HTML report afterwards | `./tools/e2e.sh --report demo` |
| List the tests without running any (needs no server) | `./tools/e2e.sh --list` |
| Pass options straight to Playwright | `./tools/e2e.sh demo -- --repeat-each=3` |

**Good to know:**
- **Names.** A name is any part of a file name: `lifecycle` runs `project-lifecycle.spec.js`.
  A word that matches several runs them all (`time` runs `timeline` and `timelog`), and the
  script says so.
- **A screen is needed** for `--show` and `--ui`: run them from a terminal on the machine's
  desktop. Use `--show` on one file at a time; `demo` takes about 20 seconds that way, and
  `tour` about 3 minutes even headless (run it beforehand and look at the pictures it saves in
  `~/tour-shots`, or the folder in `E2E_TOUR_DIR`).
- **Which files only read, and which add data.** `demo`, `tour`, `history`, `schedule`,
  `timeline`, `budget` and `workload` only read. `pull`, `requests`, `timelog` and
  `project-lifecycle` add data, and nothing is ever deleted, so each run leaves rows behind
  and rings bells (Maria's count goes up). `screenshots` rewrites `docs/screenshots/` and runs
  only when named with `E2E_SCREENSHOTS=1`.
- **AWS stays read-only by default.** With `--aws` the script refuses any file that adds data,
  before anything runs, unless you add `--allow-writes`, which warns first. It wakes the site
  first (the database sleeps when idle; the first answer can take 15 seconds) and never sends
  a local admin password to the live site.
- **Who signs in.** Locally, Maria Lopez (manager), Ana Ruiz (employee) and Sam Patel (a
  second manager), looked up in the local database by email. On AWS, Maria `ML662930`, Ben
  Okafor `BO435681` (Ana is archived there) and Sam `SP918535`, all with the password
  `Demo-pass-2026`. The admin's password is read only from `E2E_ADMIN_PASSWORD`; without it,
  `project-lifecycle` skips. Locally, this asks for it without showing it:
  `read -rsp "Local admin password: " E2E_ADMIN_PASSWORD && export E2E_ADMIN_PASSWORD && echo && ./tools/e2e.sh project-lifecycle`.
- **AWS runs whatever was last deployed.** A test can fail on the live site simply because
  the screen it expects is not deployed yet. Run `--aws` only after deploying the version you
  are testing.
- **When a test fails**, the script prints the command that opens its trace. To open the first
  one yourself: `(cd frontend && npx playwright show-trace "$(find test-results -name trace.zip | head -1)")`.
  `--report` opens the HTML report on `http://localhost:9323`; press Ctrl+C to close it.

**If it says...**

| Message | Why | Fix |
| --- | --- | --- |
| `The local stack is not running: nothing is listening on port 3000...` | `start-dev.sh` is not running | `source ~/.bashrc && ./bin/start-dev.sh` in another terminal, wait for `All Components Verified!`, run again |
| `Could not find Maria Lopez and Ana Ruiz in the local database` | The demo data was never seeded | Seed it ([SETUP.md](SETUP.md)) |
| `Refused: pull.spec.js ...` | A file that adds data, with `--aws` | Leave out `--aws`, pick a read-only file, or add `--allow-writes` if you mean it |
| `The live site did not answer ... health` | AWS is asleep or down, or the network is off | Wait a minute and run again; the local stack is the fallback |
| `--show needs a screen` | The shell has no display | Use a terminal on the machine's desktop |
| `Playwright is not installed here` | The website's packages or the browser are missing | Run the command it prints |

**Latest results:** the full local run on 15 Oct: 33 passed, 1 skipped on purpose (the
screenshots). `--aws` after the 15 Oct deploy: 17 of 17 passed.

## 8. Why these tools

- **pytest on a real Postgres, not mocks.** Half the rules live in Postgres (constraints,
  triggers, locks). A pretend database would test none of them. Rolling back each test keeps
  the real database fast and clean.
- **Vitest and React Testing Library.** Vitest is the test runner made for Vite, which builds
  the website: it reuses `frontend/vite.config.js`, so tests see the code exactly as the app
  does. Its API is Jest's (`describe`, `it`, `expect`). React Testing Library finds things by
  label, role and visible text, the way a person does.
- **Playwright, not Selenium.** Both drive a real browser, but Playwright waits by itself until
  a button is visible and clickable (a missed wait is the classic flaky test in Selenium), talks
  to the browser directly, records traces and videos, and installs its browsers with one
  command.
- **axe inside Playwright, not Lighthouse.** Lighthouse's accessibility score runs the same
  axe rules. Inside the tour, axe scans every screen signed in and loaded, at both widths and
  in both colour modes, with no second walk.
- **k6.** The common load-test tool, with pass or fail written as thresholds in the script. It
  replaced our own Python load test on 14 Oct, so there is one set of numbers to explain.
