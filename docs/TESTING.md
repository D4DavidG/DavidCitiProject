# Testing: what we test, how, and what coverage means

Every number on this page was measured on the VDI on 14 Oct 2026, with the local stack
running (`bin/start-dev.sh`) and the demo data seeded (`tools/demo.py seed`).

**Read the counts as "before the redesign".** The test counts, coverage blocks and run times
below come from the full run of 14 Oct, night: 565 backend tests, 404 website tests, 30 browser
tests. The redesign adds tests (the backend alone now collects more than 600), so a run today
prints higher counts. What must not change is the result: every test passes. Where this page
says what to expect, it says "all passed" and gives the old count only as a reference. The
current facts are the route count (70), the browser file list (12 files, 30 tests; `./tools/e2e.sh
--list` prints it) and the AWS results. The final integration run re-measures the rest.

**One command runs everything:** `./tools/test-all.sh` (section 6).
**One command runs the browser tests alone, on your machine or against the live site:**
`./tools/e2e.sh` (section 8).

## 1. The kinds of test we have

A test is a small program that uses our code and checks the result. We have ten kinds of
test (1.1 to 1.9, and the live API walk, 1.11) and the checks that read the code (1.10). Each
one looks at a different part of the system, so each one catches a different sort of
mistake. This section gives every kind the same five headings: why we use it, what it does,
which part of the stack it tests, what the results mean, and what kind of coverage it gives.

### The stack, in layers

A click in the browser travels down this list, and the answer travels back up:

```
Browser                   what a person sees: layout, clicks, the phone width
  |
Website code              the React screens and components (frontend/src)
  |
request.js                the one module every website call goes through: token, refresh, errors
  |
CloudFront (on AWS) or the local proxy (port 3001)    pass /api/tracker/... on to the Lambda
  |
API layer (the Lambda)    route table, who may call what, error answers (backend/tracker/api)
  |
Services                  the business rules (backend/tracker/services)
  |
Store                     the connection, atomic() transactions, queries (backend/tracker/store)
  |
Postgres                  constraints, triggers, the 5 integrity queries
```

### Which kind of test looks at which layer

`yes` = the test runs that layer. `part` = some of it. `reads` = it reads the code without
running it. `-` = it does not touch that layer.

| Kind | Browser | Website code | request.js | Proxy or CloudFront | API layer | Services | Store | Postgres |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 Database rule tests | - | - | - | - | - | - | part (migrate, integrity) | yes |
| 1.2 Business-rule (service) tests | - | - | - | - | - | yes | yes | yes |
| 1.3 API tests | - | - | - | part (both path shapes, sent as events) | yes | yes | yes | yes |
| 1.4 "Writes really commit" test | - | - | - | - | - | - | yes | yes |
| 1.5 Race tests | - | - | - | - | - | yes (Take this) | yes | yes |
| 1.6 Website component tests | part (jsdom, a pretend browser) | yes | yes (fetch is faked) | - | - | - | - | - |
| 1.7 Browser tests (Playwright) | yes | yes | yes | yes | yes | yes | yes | yes |
| 1.8 Accessibility scan (axe) | yes | yes | - | - | - | - | - | - |
| 1.9 k6 load test | - | - | - | yes | yes | yes | yes | yes |
| 1.10 Lint | - | reads | - | - | - | - | - | - |
| 1.10 Bandit | - | - | - | - | reads | reads | reads | - |
| 1.10 npm audit, terraform validate | - | reads the package list | - | - | - | - | - | - (terraform validate reads `infra/`, which is not a layer above) |
| 1.11 Live API walk (`demo.py demo`) | - | - | - | yes | yes | yes | yes | yes |

Read the table by column to see how well a layer is guarded. Postgres is hit by eight kinds.
The browser, the proxy and CloudFront are hit only by the browser tests (and, for the proxy
and CloudFront, k6 and the live API walk). That is why the browser tests exist even though
they are the slowest.

### All kinds at a glance

Commands run from the repo root. Times and counts are from the last full run (14 Oct, night).

| Kind | Files | Command | Time | Count today |
| --- | --- | --- | --- | --- |
| 1.1 Database rule tests | `tests/backend/test_schema.py`, `test_no_delete.py`, `test_integrity.py`, `test_migrate.py` | `.venv/bin/pytest -q tests/backend/test_schema.py tests/backend/test_no_delete.py tests/backend/test_integrity.py tests/backend/test_migrate.py` | 2 s | 88 |
| 1.2 Business-rule tests | `tests/backend/test_users.py`, `test_work.py`, `test_projects.py`, `test_requests.py`, `test_dashboard.py`, `test_audit.py`, `test_domain.py`, `test_security.py`, `test_sessions.py` | `.venv/bin/pytest -q tests/backend/test_users.py tests/backend/test_work.py tests/backend/test_projects.py tests/backend/test_requests.py tests/backend/test_dashboard.py tests/backend/test_audit.py tests/backend/test_domain.py tests/backend/test_security.py tests/backend/test_sessions.py` | 7 s | 317 |
| 1.3 API tests | `tests/backend/test_api.py`, `test_api_read_walk.py`, `test_api_audit_walk.py`, `test_function.py`, `test_openapi.py` | `.venv/bin/pytest -q tests/backend/test_api.py tests/backend/test_api_read_walk.py tests/backend/test_api_audit_walk.py tests/backend/test_function.py tests/backend/test_openapi.py` | 4 s | 156 |
| 1.4 "Writes really commit" | `tests/backend/test_store_commits.py` | `.venv/bin/pytest -q tests/backend/test_store_commits.py` | under 1 s | 2 |
| 1.5 Race tests | `tests/backend/test_claim_race.py` | `.venv/bin/pytest -q tests/backend/test_claim_race.py` | under 1 s | 2 |
| 1.6 Website component tests | `frontend/src/**/*.test.jsx`, `*.test.js` (36 files, beside the code they test) | `cd frontend && npm test` | 118 s | 404 |
| 1.7 Browser tests | `frontend/e2e/*.spec.js` (12 files) | `./tools/e2e.sh` (section 8) | about 2.5 min | 30 tests in 12 files: 29 passed, 1 skipped (screenshots, on purpose), 14 Oct night |
| 1.8 Accessibility scan | inside `frontend/e2e/tour.spec.js` | `./tools/e2e.sh tour` | part of the browser run (not timed alone) | 50 scans in 4 tests, all passed |
| 1.9 k6 load test | `tools/k6/load.js` | `K6_USERNAME=ML460428 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js` (section 7; the AWS command is there too) | 107 s | 4,038 requests, 0 failed, all 4 thresholds passed (local, 14 Oct) |
| 1.10 Lint and bandit | the website code; `backend/tracker` | `cd frontend && npm run lint`; `.venv/bin/bandit -r backend/tracker -x backend/tracker/psycopg,backend/tracker/psycopg_binary,backend/tracker/psycopg_binary.libs` | 5 s; under 1 s | both clean |
| 1.10 npm audit, terraform validate | `frontend/package-lock.json`; `infra/` | `cd frontend && npm audit --audit-level=high`; `terraform -chdir=infra validate` | not timed | not run again for this page (CLAUDE.md: 0 high findings on 14 Oct) |
| 1.11 Live API walk | `tools/demo.py` | `TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py demo` (add `TRACKER_API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker` for AWS) | not timed | 7 questions answered, 10 rules refused, then `5 integrity checks, 0 violations` |

Backend total: `.venv/bin/pytest -q` printed `565 passed in 27.19s` (88 + 317 + 156 + 2 + 2) before the
redesign. `pytest --collect-only` in the redesign's worktree now lists more than 600 (1.2 and 1.3 grew; 1.1,
1.4 and 1.5 did not), and the integration run prints the new total.
Website total: `npm test` printed `Test Files  36 passed (36)`, `Tests  404 passed (404)`, `Duration  117.60s`.
Browser total: 30 tests in 12 files; Playwright printed 29 passed, 1 skipped (the skip is the README screenshots).
(14 Oct, night. Steps 1 to 5 from `tools/test-all.sh`; the browser tests were run by hand against this branch's own site, see section 6.)

The backend tests need local Postgres running. They build their own `tracker_test`
database (`tests/backend/pg.py:13`) and never touch the app's data.

### 1.1 Database rule tests

Run: `.venv/bin/pytest -q tests/backend/test_schema.py tests/backend/test_no_delete.py tests/backend/test_integrity.py tests/backend/test_migrate.py`. Takes 2 s. 88 tests.

#### Why we use it

The database is the last line of defence. If a bug in our Python lets a bad row through,
Postgres must still refuse it. These tests prove the refusal lives in Postgres itself, not
only in our code. That matters because every other kind of test would trust the database to
hold the line.

#### What it does

- `test_schema.py`: one test per rule. It builds valid rows, breaks exactly one thing (a
  booking of 41 hours a week, two overlapping bookings for one person on one project, a
  deliverable that depends on itself, a time entry over 24 hours) and checks that Postgres
  refused it by the named rule.
- `test_no_delete.py`: tries to delete a row from every table, and to change or delete an
  audit row. Postgres triggers refuse all of it.
- `test_integrity.py`: for each of the 5 integrity queries, checks it returns nothing on
  clean data and finds a problem planted on purpose.
- `test_migrate.py`: checks the migration runner applies numbered files once, in order, and
  all or nothing.

#### Which part of the stack it tests

Postgres (constraints, exclusion constraints, triggers), plus two files in the store
layer: the migration runner and the integrity queries. Nothing above the store.

#### What the results mean

When all is well the last line reads `88 passed in` and then the seconds (about 2).
A failure names the test, for example `FAILED tests/backend/test_schema.py::test_...`, and
shows the assertion. It means Postgres accepted something it should refuse, or refused it
by a different rule than the test expected. What to do: read the assertion. If a rule was
changed on purpose, change its test. Otherwise a migration is wrong. Never edit a migration
that has run on Aurora; add a new numbered one.

#### What kind of coverage it gives

It counts toward the backend line coverage (97%, section 2) for the migration runner and the
integrity queries. The real measure here is rules, not lines: one test per constraint, and
each of the 5 integrity queries has a clean case and a planted case. It can't catch a rule
that lives only in Python, a constraint nobody wrote a test for, or slowness on big tables.

### 1.2 Business-rule (service) tests

Run: `.venv/bin/pytest -q tests/backend/test_users.py tests/backend/test_work.py tests/backend/test_projects.py tests/backend/test_requests.py tests/backend/test_dashboard.py tests/backend/test_audit.py tests/backend/test_domain.py tests/backend/test_security.py tests/backend/test_sessions.py`. Takes 7 s. 317 tests before the redesign (more now).

#### Why we use it

The business rules are the heart of the product, so they get the most tests. These tests
call the rules directly, never through HTTP (they never import `api`). That makes them fast
and precise: when one fails, it points at the rule, not at the wiring.

#### What it does

It calls the services against a real Postgres database, not a pretend one. Each test runs
inside a transaction that is rolled back at the end, so tests can't see each other's data.
The clock is frozen to Wednesday 14 Oct 2026, and passwords hash at 1,000 rounds in tests
(production stays at 600,000; `test_security.py` checks that). After every test the 5
integrity queries must return nothing. The rules covered: who may do what, capacity and
overtime, sign-off, budget maths, audit rows and who gets notified, money, the clock,
password hashing, access tokens (15 minutes) and refresh tokens (rotation, reuse detection).

#### Which part of the stack it tests

The services, the store they call, and Postgres. Not the API layer, not the website.

#### What the results mean

Passing reads `N passed in` and then the seconds (about 7; N was 317 before the redesign). A failure shows the test name
(for example `tests/backend/test_work.py::test_logging_past_capacity_asks_first_without_overtime`)
and the assertion that did not hold. A failure at the end of a test with an integrity-check
message is different: the rule's own assertions passed, but it left the data broken, which
is a bug in the rule. What to do: rerun just that test with `-k` and part of its name, for
example `.venv/bin/pytest -q -k capacity`, and read the diff.

#### What kind of coverage it gives

Most of the backend line coverage comes from here: services 96.0%, store 93.9%, domain 99%
(all backend kinds together give 97%, section 2). It can't catch wiring mistakes (a route
pointing at the wrong service), anything about the real network, or anything on screen.
Five real rules still have no test; they are named in the README under **Known gaps**.

### 1.3 API tests

Run: `.venv/bin/pytest -q tests/backend/test_api.py tests/backend/test_api_read_walk.py tests/backend/test_api_audit_walk.py tests/backend/test_function.py tests/backend/test_openapi.py`. Takes 4 s. 156 tests before the redesign (more now).

#### Why we use it

The rules can be right and the wiring still wrong. These tests prove the web request
reaches the right rule, with the right checks, and comes back in the agreed shape.

#### What it does

It builds events shaped like the ones AWS hands the Lambda and sends them through the same
entry point (`dispatch()`, and `function.handler` in `test_function.py`). It checks:

- both path shapes: `/api/tracker/projects/7` as it arrives on AWS, and `//projects/7` as it
  arrives through the local proxy;
- every route needs a token, and the role is read from the database, never from the token;
- something that exists but isn't yours answers 404, not 403, with byte-identical messages;
- every error is `{ "error": ... }` and every list is `{ items, page, pageSize, total, totalPages }`;
- there is no DELETE route;
- two "walk" tests call every read route and every write route once, and the write walk
  fails if a route changes data without an audit row (add a route and forget it, and the
  suite fails);
- `docs/openapi.json` is the same as a fresh build from the route table.

#### Which part of the stack it tests

The API layer (route table, `authorise`, error table, serialisers), the services under it,
the store and Postgres. Not CloudFront or the proxy: it sends their path shapes as events,
but never runs them.

#### What the results mean

Passing reads `N passed in` and then the seconds (about 4; N was 156 before the redesign). A failure that says a route
was not walked means you added a route: add it to the walk. A failure in `test_openapi.py`
means the saved OpenAPI file is out of date; regenerate it with
`.venv/bin/python tools/openapi.py`. Any other failure shows the status or body that came
back against the one expected.

#### What kind of coverage it gives

The `api/` folder was 100% of lines and branches before the redesign, and all 70 routes (the
redesign added `GET /dashboard/timeline`) are called by the two walks. `api/errors.py` (the error table) is 100%. It can't catch real network problems, what
CloudFront does to headers (checked by hand on AWS: the `Authorization` header arrives), or
real-world speed.

### 1.4 The "writes really commit" test

Run: `.venv/bin/pytest -q tests/backend/test_store_commits.py`. Under 1 s. 2 tests.

#### Why we use it

Every other backend test rolls back on purpose. So a bug where nothing is ever really saved
would pass all of them. psycopg (the Postgres driver) has a trap: with its default setting it
opens a hidden transaction on the first statement, after which our `atomic()` blocks are only
savepoints and nothing commits. Only a test on its own database can see that.

#### What it does

It builds its own database (`tracker_commit_test`). One test checks the connection is in
autocommit mode. The other reads something first (as a service would), writes inside
`atomic()`, then asks a second, separate connection whether the row is there.

#### Which part of the stack it tests

The store (`connect()` and `atomic()` in `store/postgres.py`) and Postgres.

#### What the results mean

Passing reads `2 passed in` and then the seconds (under 1). A failure means a write would
look fine in the app and vanish. What to do: treat it as urgent; look at how `connect()` sets
up the connection and at `atomic()`.

#### What kind of coverage it gives

One property, fully: "committed writes are visible to other connections". It adds a few
lines to the store's coverage, but that is not its point. It can't tell you anything else.

### 1.5 Race (concurrency) tests

Run: `.venv/bin/pytest -q tests/backend/test_claim_race.py`. Under 1 s. 2 tests.

#### Why we use it

Two people can press **Take this** at the same moment. A race like that never shows in a
single-connection test, and it would hand one task to two people or push someone past their
task limit.

#### What it does

It uses real, separate database connections. Connection A takes a task inside an open
transaction. Connection B tries to take it in another thread. A third connection watches
Postgres (`pg_stat_activity`) and the test waits until B is reported blocked on a lock, and
only then lets A commit. Two cases: two people and one Ready task (the second is refused),
and one person at 1 of 2 tasks taking two Ready tasks at once (one is refused). The second
case fails if the lock on the person's row (`SELECT ... FOR UPDATE`) is removed.

#### Which part of the stack it tests

The Take-this rule in the services, the store and Postgres' row locks.

#### What the results mean

Passing reads `2 passed in` and then the seconds (under 1). A failure means a lock is
missing or in the wrong place, so two people could both win. What to do: look at the locking
in `claim_task` before anything else.

#### What kind of coverage it gives

By scenario, not by percentage: these two races. Other concurrent paths are guarded by
Postgres rules (the exclusion constraint on overlapping bookings, tested in 1.1 on one
connection) or by a lock (the capacity check) but are not raced here. It can't find a race
nobody thought to write.

### 1.6 Website component tests (Vitest and React Testing Library)

Run: `cd frontend && npm test`. Takes 118 s. 404 tests in 36 files, beside the code they test.

#### Why we use it

They check the website without a browser or a server, so they are fast and can run
anywhere. They catch the mistakes a person would see: a wrong label, a missing button, a
form that sends the wrong field. React Testing Library finds things the way a person does (by
label, role and visible text), so a test breaks only when the user would notice.

#### What it does

Vitest renders each screen in jsdom (a pretend browser written in JavaScript) and fakes the
API at `fetch`. It checks that each screen shows the right thing and sends the right request:
field names exactly as the API spells them, money as cents, only the fields that changed,
refusals shown as the server wrote them, buttons per role, and the phone layout switch. The
real `request.js` runs (tokens, refresh, error handling); only the network is faked. Pass or
fail comes from `expect(...)` lines in each test.

#### Which part of the stack it tests

The website code and `request.js`. jsdom stands in for the browser, so the browser is only
partly tested. Nothing behind the network call is touched.

#### What the results mean

Passing prints:

```
Test Files  36 passed (36)
     Tests  404 passed (404)
  Duration  117.60s
```

A failure prints `FAIL`, the file and test name, and a diff of what the screen showed
against what was expected; the totals then read `Test Files  1 failed | 35 passed (36)`.
What to do: rerun one folder, for example `cd frontend && npx vitest run src/pages/approvals`
(2.3 s), and read the diff. If you changed a label on purpose, update the test.

#### What kind of coverage it gives

Line, statement, branch and function coverage, measured by V8 (section 2):
95.5% of statements, 97.04% of lines, 93.72% of branches, 91.4% of functions. Run it with
`cd frontend && npm run test:coverage`. It can't catch what jsdom has no layout for
(sideways scrolling, overlap, colour contrast), or a faked API drifting away from the real
one. The browser tests (1.7) cover both.

### 1.7 Browser tests (Playwright)

Run: `./tools/e2e.sh` (section 8), or `cd frontend && npx playwright test` with the variables
in section 3. About 2.5 min. 30 tests in 12 files: 29 passed, 1 skipped (screenshots, on purpose), 14 Oct night.

#### Why we use it

It is the only test that sees what David sees: a real browser, a real login, the real API,
the real database and the real layout. It catches what every other kind misses: a screen
that renders but is wired to nothing, a page that scrolls sideways on a phone, a menu that
can't be reached. Playwright waits for the page by itself, which makes it steadier than
Selenium (section 5).

#### What it does

A real Chromium signs in and clicks through the app, checking what appears. The 12 files:

- `demo.spec.js`: the demo walk (the seven questions, plus the phone menu).
- `pull.spec.js`: the pull board (Ana takes a task and puts it back).
- `requests.spec.js`: requests (Ana asks, Maria rejects with a note, Ana reads it on a phone).
- `tour.spec.js`: every screen for a manager and an employee, desktop and phone, no sideways
  scrolling, an accessibility scan of each (1.8), a deep-link refresh.
- `history.spec.js`: a manager reads a report's history without the before/after state; an
  employee sees My history.
- `timeline.spec.js`, `budget.spec.js`, `workload.spec.js`: the three charts (timeline: Late
  words and icon, tooltips on hover, tap and focus, print stripes; budget: the Budget line's
  position, tooltips; workload: gridlines and bars line up, Tab opens the tooltip, print
  stripes, contrast).
- `schedule.spec.js`: the Schedule screen (a bar per booking, the over week outlined,
  keyboard tooltip and Enter).
- `timelog.spec.js`: log time then approve (Ben logs, Maria approves, spent goes up).
- `project-lifecycle.spec.js`: an admin's project life cycle (create, edit, archive,
  reactivate).
- `screenshots.spec.js`: README screenshots, only when asked.

#### Which part of the stack it tests

All of it: the browser, the website code, `request.js`, the proxy (or CloudFront on AWS), the
API layer, the services, the store and Postgres. It runs on the local stack or on the live
site.

#### What the results mean

Passing ends like this (the counts change with the files you ran; this is the whole local
suite on 14 Oct night):

```
  1 skipped
  29 passed (2.5m)
```

A skipped test is not a failure: it needs a variable that was not set (section 3 says which)
or runs only when asked. A failure prints the test, the line and what it expected, for
example `Error: expect(locator).toBeVisible() failed`. Playwright keeps a **trace** for every
failed test: a recording of each step with screenshots, the network calls and the console.
What to do: open it with `cd frontend && npx playwright show-trace test-results/*/trace.zip`
(the script prints the exact command), or rerun with `./tools/e2e.sh --show demo` and watch.
If a failure only happens after you changed a label or a layout on purpose, update the test.

#### What kind of coverage it gives

Not lines: **journeys**. Today it walks the manager's demo (all seven questions), an
employee on the pull board, a request and its answer, every screen for both roles at two
widths, the person history, the three charts, the Schedule screen, log time then approve,
and an admin creating, editing, archiving and reactivating a project. A line percentage
would mix in code the component tests already cover and tell us nothing. It can't catch:
other browsers (it runs Chromium only), the forced password change at first sign-in (not
walked), real traffic, and anything after the data has changed from the seed.

### 1.8 Accessibility scan (axe, inside Playwright)

Run: `./tools/e2e.sh tour`. Part of the browser run; not timed on its own. 50 scans in 4 tests, all passed.

#### Why we use it

Accessibility is part of "a UI that looks finished", and it is easy to break without
noticing. **axe** (`@axe-core/playwright` 4.13.0) is the rule engine behind Lighthouse's
accessibility score. Running it inside the tour means every screen is scanned in its real,
signed-in, loaded state at both widths, with no second walk through the app. Running
Lighthouse as well would repeat the same rules.

#### What it does

The screen tour (`frontend/e2e/tour.spec.js`, the `scan` helper) runs axe on the sign-in
page, on every screen it opens, and at phone width on the open menu. It checks the WCAG 2.0
to 2.2 A and AA rules a machine can decide: colour contrast, names on buttons, links and
fields, labels, list and table structure, valid ARIA, page language.

#### Which part of the stack it tests

The page in the browser: the website code's output (the HTML the browser ends up with) as
seen by a real browser. It does not test the API or anything behind it, though those had to
run to put data on the page.

#### What the results mean

The four tour tests are named `... (axe)`. When all four pass, there is no `serious` or
`critical` problem on any screen. When one fails, it lists every problem at the end as
`<screen>: <rule> (<impact>, N elements: <first selector>)`. What to do: read the rule name
(for example `color-contrast` or `list`), open that screen, fix the element named, rerun
`./tools/e2e.sh tour`. `tools/test-all.sh` shows these four tests as their own row,
"Accessibility".

What it found on its first run (14 Oct), both fixed:

- `list` (serious) on every desktop screen and the phone menu: the side menu's `<ul>` held
  `<a>` links directly, so a screen reader could not announce "list, 9 items". Fixed with a
  `ListItem` around each link (`components/AppLayout.jsx`).
- `color-contrast` (serious, 10 cells) on `/allocation`: empty weeks ("0 / 40 h") were
  `#9e9e9e` on white, 2.7:1 (AA needs 4.5:1). Now `text.secondary`, which was `#4B5563`, 7.6:1,
  when this was fixed; the redesign's theme makes it `#4A564F`, 7.7:1 on white
  (`theme/theme.js`, checked by `theme.test.jsx`). The cell's code is in
  `pages/allocation/AllocationPage.jsx`.

#### What kind of coverage it gives

Counted in **scans** and **rules**: 50 scans over the four role-by-width tests, every
WCAG 2.0 to 2.2 A and AA rule axe has. The threshold: a `serious` or `critical` problem
fails the test. What it can't catch: automated scanners find roughly a third to half of
accessibility problems. Screen readers (NVDA, VoiceOver) are untested; keyboard order and
focus are checked only where other tests press Tab; dialogs, tooltips and the admin screens
are not scanned (the tour opens none). axe's moderate, non-WCAG best-practice items
(`heading-order`, `region`, `empty-table-header`, `landmark-one-main` on the sign-in page)
are left as they are.

### 1.9 k6 load test

Run: `K6_USERNAME=ML460428 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js` (details and
the AWS command in section 7). 107 s locally. 4,038 requests, 0 failed, all 4 thresholds passed.

#### Why we use it

Everything above runs one user at a time. The client will have many managers on the
dashboard at once, and slowness is a failure too. k6 is the industry's load-test tool (named
in our meeting notes, which are not in the repo), and pass or fail comes from thresholds
written in the script, so the answer is not a matter of opinion.

#### What it does

Up to 10 virtual managers (25 on AWS) each log in once, then repeat the reads their screens
make (dashboard cards, the at-risk panel, the projects list, the allocation grid, the unread
count, one project's detail, budget and deliverables), one second apart. Then 20 logins are
sent, 10 at a time. It only reads: nothing is written.

#### Which part of the stack it tests

From the proxy (or CloudFront) down: the API layer, the services, the store and Postgres,
under load. k6 sends HTTP itself, so the website and the browser are not involved.

#### What the results mean

k6 ends with a summary and puts a tick or a cross beside each threshold. It exits 0 when all
pass. It exits 99 when a threshold fails, and the cross is on the line that failed. The four
thresholds: under 1% of requests fail; 95 in 100 reads answer within 1 s; 95 in 100 logins
answer within 3 s; over 99% of checks (status 200, a token on login) pass. What to do on a
failure: look at which line has the cross. Slow reads point at a query; failed requests point
at the Lambda or the database (on AWS, a database that was asleep, so warm it up first).

#### What kind of coverage it gives

None by lines. It measures speed and failures: requests per second, how long the slowest 5%
took (p95), how many failed. Last local run: reads median 24 ms and p95 67 ms, logins median
599 ms and p95 1.3 s (the full table is in section 7). It can't catch: anything that writes
(it only reads), a crowd bigger than 10 locally (LocalStack itself fails past about 15) or 25
on AWS, or slow leaks over hours.

### 1.10 The two checks: lint and bandit

These are not tests of behaviour. They read the code for mistakes and run next to the tests.

#### Why we use it

Some mistakes are visible without running anything: an unused variable, a hook used wrongly,
an `assert` left in app code, a password written in the source, SQL built from a string.
They are cheap to find early, and CI runs bandit on every push (`.github/workflows/python.actions.yml`).

#### What it does

- **Lint** (ESLint, `cd frontend && npm run lint`): reads the website code against the
  recommended JavaScript rules, the React hooks rules and the Vite refresh rules.
- **Bandit** (`.venv/bin/bandit -r backend/tracker -x backend/tracker/psycopg,backend/tracker/psycopg_binary,backend/tracker/psycopg_binary.libs`,
  which leaves out the psycopg copy `start-dev.sh` vendors there): a security scanner for the
  Python. It flags `assert`
  (B101), `random` used for passwords (B311), SQL built from strings (B608) and hard-coded
  passwords (B105, B106).
- **npm audit** (`cd frontend && npm audit --audit-level=high`): lists known security
  problems in the website's packages. CI runs it and fails on a high one
  (`.github/workflows/react.actions.yml`). **terraform validate**
  (`terraform -chdir=infra validate`): checks the infrastructure files are well formed. We run
  it by hand before committing infra changes; CI runs Checkov instead, which reports but never
  fails the build (`soft_fail: true`). Neither runs our code. A failure of either names the
  package or the file.

#### Which part of the stack it tests

Lint reads the website code. Bandit reads the backend code (API layer, services, store,
domain). Neither runs anything, and neither touches Postgres.

#### What the results mean

Lint passing prints only the two npm banner lines (`> frontend@0.0.1 lint`, `> eslint .`) and
exits 0. A failure lists `file:line:column error rule-name` and ends with
`✖ N problems`. Bandit passing prints `No issues identified.` and
`Total issues (by severity)` all 0 (`tools/test-all.sh` runs it with `-q`, which prints nothing unless there is a problem). A failure prints `Issue: [B608:...]` with the file and
line. What to do: fix the line it names. A bandit finding that is a deliberate exception gets
a `# nosec` with the reason (two exist today).

#### What kind of coverage it gives

None by lines; each is pass or fail over every file in scope. Lint: clean in 5 s on 14 Oct.
Bandit: clean in under 1 s, 3,150 lines scanned on 14 Oct night. Neither can find a logic
error: code can pass both and still be wrong. `npm audit` is a count of known problems
(0 high on 14 Oct); `terraform validate` is pass or fail.

### 1.11 Live API walk (`tools/demo.py demo`)

Run: `TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py demo`; for AWS add
`TRACKER_API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker` (the full steps are in
`docs/DEMO-RUNBOOK.md`, section 3). Not timed here.

#### Why we use it

It is the one check of the business rules that runs against the real AWS system (CloudFront,
the Lambda and Aurora) with no browser and no test database. Everything else runs on the VDI.
It is also the demo's terminal half: the seven questions answered, then ten requests that try to
break a rule, with the server's own refusal text shown for each.

#### What it does

It signs in as the admin, Maria, Ana and Ben over HTTPS and prints, in order: the accounts, the
answers to the seven questions (dashboard, allocation, deliverables, dependency chain), then ten
requests that break a rule (logging past 40 hours, logging time tomorrow, opening another
manager's project, an id that does not exist, an employee creating a project, an employee
approving time, a dependency loop, signing off a deliverable with open tasks, a DELETE, a request
with no token), then the integrity check. Each rule line is marked `REFUSED as designed` when the
server answered the status the rule demands, `OK` when a success was expected, and `UNEXPECTED`
for anything else.

#### Which part of the stack it tests

From the front door down: CloudFront (or the local proxy), the API layer, the services, the
store and Postgres. It sends HTTP itself, so the website and the browser are not involved.

#### What the results mean

Healthy: every refusal line says `REFUSED as designed`, nothing says `UNEXPECTED`, and the last
line says `5 integrity checks, 0 violations`. An `UNEXPECTED` line means the server answered
with a different status than the rule demands: either a rule did not hold, or the data is no
longer the seed's (from Mon 19 Oct the first refusal is accepted, and writes a real entry: see
the line about it in `docs/DEMO-RUNBOOK.md`, section 1). The script exits non-zero only when a
request it needs fails (a sign-in, a read), not for an `UNEXPECTED` line, so read the lines
rather than the exit code.

#### What kind of coverage it gives

By rules, not lines: the seven questions and ten refused requests, each once, plus the
invariant. It is a smoke test of the deployed system, not a replacement for the 88 database
and 300-odd rule tests behind it. It needs the seeded demo data.

### Import the API into Postman or SwaggerHub

Not a test, but useful in a demo. `docs/openapi.json` is generated from the route table
(`.venv/bin/python tools/openapi.py` after any route change; `test_openapi.py` fails if you
forget).

- **Postman:** Import, Files, choose `docs/openapi.json`, import as a Postman Collection.
  Set the collection variable `baseUrl` to `http://localhost:3001/api/tracker` (local) or
  `https://d1gov8jpsxhwer.cloudfront.net/api/tracker` (AWS). Send "Log in", copy `token`
  from the answer into the collection's Authorization tab (Bearer Token). Tokens last 15
  minutes.
- **SwaggerHub:** Create New, Import and Document API, upload `docs/openapi.json`. Browse
  and share it there; "Try it out" may be blocked by CORS (a page on swaggerhub.com
  calling our server). Not tried.

## 2. What coverage means for each kind of test

**Coverage** is the share of our code that the tests actually ran. It says what was
*run*, not what was *checked*: a line can run without the test looking at its result.
So it finds code no test touches; it can't prove the tested code is right.

Four ways to count it:

| Measure | Plain words | Example |
| --- | --- | --- |
| **Line** | Of all the lines of code, how many ran at least once | 95% lines = 5 in 100 lines never ran in any test |
| **Statement** | The same, counted per instruction (one line can hold two) | Usually close to the line number |
| **Branch** | Every `if` has two ways out (yes and no). How many of those ways were taken | An `if` tested only on "yes" is half covered, even though its line ran |
| **Function** | How many functions were called at least once | A helper nobody calls lowers it |

Branch coverage is the strictest: it catches the "what if this is empty?" side that line
coverage misses.

### Backend (pytest-cov)

`.venv/bin/pytest --cov=backend/tracker -q` printed:

```
TOTAL                                        2011     64    97%
565 passed in 27.19s
```

97% means: of the 2,011 statements in our backend, the tests ran all but 64. It
measures our code only; `.coveragerc` leaves out the psycopg library that
`start-dev.sh` copies into the folder. All five backend test kinds (1.1 to 1.5) count toward it.

With branches too (`--cov-branch`) the total is 95% (616 branches, 59 partly taken).
The API layer (`api/`: routes, auth, error mapping, every handler) is **100%**, lines and
branches. The lowest files, counting branches, are `services/milestones.py` (86%),
`store/postgres.py` (82%) and `services/assignments.py` (88%). Counting statements only
(the 97% run above), the same three are 89%, 89% and 91%.

To see which lines were missed: `.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing`.

### Website (Vitest with V8 coverage)

`cd frontend && npm run test:coverage` printed:

```
Statements   : 95.5% ( 1510/1581 )
Branches     : 93.72% ( 1075/1147 )
Functions    : 91.4% ( 532/582 )
Lines        : 97.04% ( 1280/1319 )
```

V8 is the JavaScript engine inside Chrome and Node; it counts what ran while the
component tests ran. Read the four lines as: 1,510 of 1,581 instructions ran; 1,075 of 1,147
yes/no paths were taken; 532 of 582 functions were called (many of the missing ones are
small click handlers on rarely used buttons); 1,280 of 1,319 lines ran. The one module that
talks to the API, `services/request.js`, is at 100% of lines and functions and 97.8% of
branches.

### Browser tests, the accessibility scan, load tests, lint and bandit: no percentage, on purpose

- **Browser tests** run the real app in a real browser. Their measure is **which
  journeys they walk**, not lines: today the manager's demo (all seven questions), an
  employee using the pull board, an employee's request answered by her manager, every screen
  for both roles at two widths, a manager reading a report's history, the timeline, budget and
  workload charts (alignment, tooltips, print stripes, contrast), the Schedule screen, an
  employee logging time and the manager approving it (spent goes up), and an admin creating,
  editing, archiving and reactivating a project. A line percentage would mix in code the
  component tests already cover and add nothing.
- **The accessibility scan** is counted in scans (50) and rules (every WCAG 2.0 to 2.2 A and
  AA rule axe has), with `serious` and `critical` as the failing level.
- **Load tests** measure **speed and failures**: requests per second, how long the
  slowest 5% took (p95), and how many failed. Coverage doesn't apply.
- **Lint and bandit** are pass or fail over every file in scope.

### Against the rubric's targets (`docs/full-stack.md:105-111`)

| Rubric target | Goal | Today | Met? |
| --- | --- | --- | --- |
| Backend code coverage | 80% | 97% of statements (95% with branches) | Yes |
| Frontend code coverage | 80% | 95.5% statements, 97.04% lines, 93.72% branches, 91.4% functions | Yes |
| API endpoints (all CRUD) | 90% | `api/` 100%; every route called by the two walk tests | Yes |
| Error handling | 90% | `api/errors.py` 100%; `test_api_read_walk.py` covers malformed input and a crash returning 500 | Yes |
| Critical user paths end to end | 100% | Walked end to end in a browser: the manager's demo, the pull board, an employee's request and its answer, log time then approve (`timelog.spec.js`), an admin creating, editing, archiving and reactivating a project (`project-lifecycle.spec.js`), and every screen for manager and employee | Almost. One path is not walked in a browser: the forced password change at first sign-in (covered by backend and component tests only) |

### What is not covered, and why

The full list is in the README under **Known gaps**. In short: guard
branches for records that don't exist or are already archived, a handful of real rules
with no test yet (named with file and line there), the database going down in the
middle of a request, and the People screen's less used paths.

## 3. Set up Playwright from scratch

**Playwright** drives a real browser from a script: it clicks, types and checks what
appears on the page. On this VDI it is already set up: `@playwright/test` 1.64.0 is in
`frontend/package.json`, and Chromium is downloaded (`~/.cache/ms-playwright/chromium-1248`).
On a fresh machine:

```sh
cd ~/DavidCitiProject/frontend
npm ci                                   # installs exactly what package-lock.json lists
npx playwright install chromium          # downloads the browser into ~/.cache/ms-playwright
sudo npx playwright install-deps chromium   # Linux libraries the browser needs; asks for the VDI password
```

Before running: start the stack (`./bin/start-dev.sh`) and seed it once (`tools/demo.py seed`).

**The easy way is `./tools/e2e.sh` (section 8).** It looks up the usernames, points the tests
at the right site and explains the result. The plain Playwright commands below are what it
runs underneath.

**What each test file needs:**

| File | Needs | Writes data? | On AWS? |
| --- | --- | --- | --- |
| `demo.spec.js` | `E2E_MANAGER_USERNAME` (or `E2E_ADMIN_PASSWORD` to look it up) | No | Yes |
| `pull.spec.js` | `E2E_MANAGER_USERNAME` and `E2E_EMPLOYEE_USERNAME` (or `E2E_ADMIN_PASSWORD`); Ana must hold at most 1 unfinished task | **Yes**: a task, audit rows, bell notifications (it archives the task afterwards) | No |
| `requests.spec.js` | `E2E_MANAGER_USERNAME` and `E2E_EMPLOYEE_USERNAME` | **Yes**: one rejected request, audit rows, bell notifications (it skips itself unless the site is on localhost) | No |
| `history.spec.js` | `E2E_MANAGER_USERNAME` and `E2E_EMPLOYEE_USERNAME` | No | Yes |
| `schedule.spec.js` | `E2E_MANAGER_USERNAME` (defaults to local Maria) | No | Yes |
| `timeline.spec.js` | `E2E_ZEUS_MANAGER_USERNAME` (Sam; or `E2E_ADMIN_PASSWORD` to look him up); its last test signs in as `E2E_MANAGER_USERNAME` | No | Reads only, but 1 of 4 tests failed there on 14 Oct night (the Late-row icon was not found); run it only when named |
| `budget.spec.js` | `E2E_MANAGER_USERNAME` (defaults to local Maria) | No | Yes (3 of 3 passed there, 14 Oct night) |
| `workload.spec.js` | `E2E_MANAGER_USERNAME` (defaults to local Maria) | No | Reads only, but 1 of 5 tests failed there on 14 Oct night (`Not booked` matched 3 people, not 1); run it only when named |
| `timelog.spec.js` | `E2E_MANAGER_USERNAME` | **Yes**: one approved 15-minute entry, audit rows, bell notifications (it skips itself unless the site is on localhost) | No |
| `project-lifecycle.spec.js` | `E2E_ADMIN_PASSWORD` | **Yes**: one archived project, audit rows, notifications (it skips itself unless the site is on localhost) | No |
| `tour.spec.js` | `E2E_TOUR_DIR` (a folder for screenshots) and both usernames | No | Yes |
| `screenshots.spec.js` | `E2E_SCREENSHOTS=1` and `E2E_ADMIN_PASSWORD`; overwrites `docs/screenshots/` | No (but changes repo files) | No |

A file whose variables are missing is **skipped**, not failed, with a message saying what
to set.

**Run them:**

```sh
cd ~/DavidCitiProject/frontend
export E2E_MANAGER_USERNAME=ML460428 E2E_EMPLOYEE_USERNAME=AR836183 E2E_TOUR_DIR=$HOME/tour-shots
npx playwright test                      # all, in the terminal
npx playwright test demo                 # one file (matches the name)
npx playwright test --headed             # watch the browser do it
npx playwright test --ui                 # the Playwright window: pick a test, watch it, step back in time
npx playwright test --reporter=html && npx playwright show-report   # a web page of results
npx playwright test --trace on demo      # record a trace of every step
```

**Traces** are a recording of a test: every click, a screenshot before and after, the
network calls and the console. Our config keeps one for every failed test
(`playwright.config.js`: `trace: 'retain-on-failure'`) in `frontend/test-results/`
(gitignored). Open one with:

```sh
npx playwright show-trace test-results/*/trace.zip
```

**In VS Code:** the extension "Playwright Test for VSCode" by Microsoft is **not
installed** yet (`code --list-extensions` doesn't list it). Install it:

```sh
code --install-extension ms-playwright.playwright
```

Then open the Testing panel (the flask icon on the left). It finds `frontend/playwright.config.js`
and lists every test; press the green triangle next to one to run it, or tick
"Show browser" to watch. A green triangle also appears next to each `test(` line in the
spec files. The extension doesn't read your terminal's `export`s, so start VS Code from a
terminal that has them:

```sh
cd ~/DavidCitiProject && E2E_MANAGER_USERNAME=ML460428 E2E_EMPLOYEE_USERNAME=AR836183 E2E_TOUR_DIR=$HOME/tour-shots code .
```

Not tried here: the extension is not installed, so these editor steps are from its
documentation, not from a run.

### The production build, locally

The dev server never splits the website into page files; only `npm run build` does. To
check the real split files before a deploy, serve the build on 4173 and run the read-only
specs against it (14 Oct: `tour` and `history`, 7 passed, axe included):

```sh
cd ~/DavidCitiProject/frontend
npm run build && (npx vite preview --port 4173 --strictPort > /dev/null 2>&1 &)
E2E_BASE_URL=http://localhost:4173 E2E_API=http://localhost:3001/api/tracker E2E_MANAGER_USERNAME=ML460428 E2E_EMPLOYEE_USERNAME=AR836183 E2E_TOUR_DIR=$HOME/tour-shots npx playwright test tour history
pkill -f "vite preview --port 4173"
```

## 4. Browser tests against AWS

The easy way: `./tools/e2e.sh --aws demo tour` (section 8). It sets the address and the AWS
usernames, warms the site up first and refuses any file that writes. By hand, point the tests
at the deployed site with `E2E_BASE_URL`. The AWS usernames differ from the local ones (the
Accounts table in `docs/DEMO-RUNBOOK.md`). Run only the read-only files there:

```sh
cd ~/DavidCitiProject/frontend
E2E_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net E2E_MANAGER_USERNAME=ML662930 E2E_EMPLOYEE_USERNAME=AR553882 E2E_TOUR_DIR=$HOME/tour-shots npx playwright test demo tour
```

- **Safe on AWS, and seen passing there:** `demo`, `tour`, `history` and `schedule` (they only
  read; signing in writes no audit row, `tests/backend/test_api_audit_walk.py:3-5`).
  `./tools/e2e.sh --aws` with no names runs exactly these four.
- **Read-only, but not in that default set:** `budget` (3 of 3 passed on AWS, 14 Oct night),
  `timeline` (3 of 4 passed) and `workload` (4 of 5 passed). The one failure in each comes from
  the live data, not from a write: the live database has two people left over from manual
  testing, so `workload.spec.js` finds three people marked `Not booked` where its test expects
  one (Playwright's strict mode refuses an ambiguous match), and `timeline.spec.js` does not
  find the Late row's warning icon on Zeus's Migration (most likely the live data differs from
  the seed; the exact difference was not looked into). Name them (`./tools/e2e.sh --aws
  budget`) if you want to run them.
- **Not on AWS:** `pull.spec.js` writes a task and sends notifications to Maria and every
  admin, which would show up in the live demo. It also calls the API at `E2E_API`, which
  defaults to the local one. `requests`, `timelog` and `project-lifecycle` write too (the
  three skip themselves unless the site is on localhost), and `screenshots` rewrites repo
  files.
- Warm the site up first (`curl -s https://d1gov8jpsxhwer.cloudfront.net/api/tracker/health`):
  the database sleeps when idle and the first request can take 15 s.

Results against AWS:

- `demo.spec.js` alone, 14 Oct: `2 passed (7.0s)`.
- `demo`, `history`, `schedule` and `tour` together, 14 Oct, night, after the deploy:
  13 passed in 1.4 minutes. That run included the axe scan of every tour screen, and it passed.
  A later review run through `tools/e2e.sh --aws` saw the same: `demo` 2 passed, then
  `history schedule tour` 11 passed (13 tests in all, the default set).
- `timeline`, `budget` and `workload` together through `tools/e2e.sh --aws`, same review run:
  10 passed, 2 failed, exit code 1 (the two failures are described above).

## 5. Why these tools

**Playwright, not Selenium.** Both drive a real browser. Selenium is the older tool
(first released in 2004, now built on the W3C WebDriver standard) and works fine, but:

- Playwright **waits by itself** until a button is visible and clickable. With Selenium
  you write the waits, and a missed wait is the classic "flaky test" (passes, then fails
  for no reason).
- It is faster: it talks to the browser directly, not through a separate driver program.
- The **trace viewer** shows exactly what happened in a failed test.
- One API for Chromium, Firefox and WebKit (Safari's engine), and the browsers are
  installed with one command. Selenium needs a matching driver per browser.

**Playwright plus axe, not Lighthouse.** Lighthouse's accessibility score runs the same
axe rules, so a Lighthouse run would repeat checks the tour already makes. axe inside the
tour scans every screen in its loaded state, signed in, at both widths, with no second
walk through the app.

**Vite and Vitest.** David chose Vite to build and serve the website: the dev server
reloads the page on save, and the production build takes about 4 s here. **Vitest** is the test runner made for Vite: it reuses
the same config (`frontend/vite.config.js`, the `test:` block), so tests see the code
exactly as the app does, with no second build setup. Its API is the same as Jest's
(`describe`, `it`, `expect`), which answers the rubric's "Jest".

**React Testing Library** finds things the way a person does (by label, by role, by
visible text), not by internal names, so a test breaks only when the user would notice.

## 6. Run everything

```sh
cd ~/DavidCitiProject && ./tools/test-all.sh
```

It runs, in order: backend tests with coverage, bandit, website tests with coverage, lint,
the production build, then the browser tests if ports 3000 and 3001 are listening, with
their own "Accessibility" row for the axe scan inside the tour (PASS when all four tour
tests pass, FAIL if any fails, SKIP when the tour did not run). It
finds the local Maria and Ana usernames in the local database by itself (or uses
`E2E_MANAGER_USERNAME` / `E2E_EMPLOYEE_USERNAME` if set). The browser tests always go
to the local stack, even if `E2E_BASE_URL` is still set from an AWS run, because
`pull.spec.js`, `requests.spec.js`, `timelog.spec.js` and `project-lifecycle.spec.js` write data. Each run therefore adds one archived
task, one rejected request from Ana, audit rows and bell notifications (for Ana, Maria and
every admin) to the local database. It ends with a table
and exits with an error code if any step failed. Last results, 14 Oct, night, before the redesign (one real `bash tools/test-all.sh` run on the merged branch; its browser and accessibility rows were SKIP because the script's site on port 3000 served another folder's code, so those two steps were run by hand against this branch's own site on port 3002, and passed):

```
Step            Result Detail
Backend tests   PASS   565 passed, coverage 97%
Bandit          PASS   no issues
Website tests   PASS   404 passed, lines 97.04%
Lint            PASS   clean
Build           PASS   frontend/dist
Browser tests   SKIP   local stack not running   (run by hand: 29 passed, 1 skipped)
Accessibility   SKIP   local stack not running   (run by hand: 4 tour tests, 50 scans, WCAG A/AA, all passed)
```

The one failure on the first browser run was a wrong test, not the app: `project-lifecycle.spec.js` clicked
**Save** in the New project dialog, whose button has said **Create** since 13 Oct. The spec had always been
skipped (it needs the admin password), so this was its first real run. Fixed to click **Create**; it then passed in 6.2 s.

`tools/test-all.sh` looks up Maria's, Ana's and Sam's usernames in the local database, so every browser test runs except the README screenshots one (it only runs with `E2E_SCREENSHOTS=1`). `tools/e2e.sh` (section 8) does the same lookup and runs just the browser step, one file at a time if you like.

**Automated on every push?** Not yet. GitHub CI today runs only the bandit scan
(`.github/workflows/python.actions.yml:27`), `npm audit`
(`.github/workflows/react.actions.yml:27`) and a Terraform check. The tests run on the VDI,
by hand or through `tools/test-all.sh`. Running them in CI would need a Postgres service
in the workflow; that is a possible next step, not built.

## 7. Load test with k6

**What it measures.** `tools/k6/load.js` plays managers using the site at the same time.
Each virtual user logs in once, then repeats one round of the reads a manager's screens make
(dashboard cards, the at-risk panel, the projects list, the allocation grid, the unread
count, and one project's detail, budget and deliverables), with 1 s between rounds. After
that, a second part sends 20 logins, 10 at a time. It only reads: nothing is written.

**Pass or fail is in the script** (k6 calls these thresholds): under 1% of requests fail;
95 in 100 reads answer within 1 s; 95 in 100 logins answer within 3 s. Login gets its own,
looser limit because it is slow on purpose: the password hash (PBKDF2, 600,000 rounds) is
built to cost about a second of CPU, so guessing passwords is expensive, and a person logs in
once per session. Mixing logins into the read figures would hide a slow read behind them.

**Install** (no sudo; done on the VDI on 14 Oct): the official release v2.2.0 from
github.com/grafana/k6/releases, checksum checked, unpacked into `~/.local/bin/k6`.
`k6 version` prints `k6 v2.2.0`.

**Run it locally** (through the proxy on 3001; 10 users at most, because LocalStack itself
fails past about 15). Don't run it while browser tests run against the same API, or they may
turn flaky:

```sh
K6_USERNAME=ML460428 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js
```

**Run it on AWS** (David runs this; 25 users, as the removed Python load test did on 13 Oct; the
thresholds are the same; about 4 minutes):

```sh
K6_PROFILE=aws K6_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net/api/tracker \
K6_USERNAME=ML662930 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js
```

`ML662930` is Maria's username on AWS (`ML460428` is her local one). Warm the app up first
(section 7 of `CLAUDE.md`: Aurora pauses itself). `K6_VUS=50` raises the number of users.

**Last local run, 14 Oct** (ramp to 10 users over 1 minute, hold 30 s, then the login
burst; 107 s in all). k6 exited 0:

| Measure | Result | Threshold |
| --- | --- | --- |
| Requests | 4,038 (4,008 reads, 30 logins), 37.7 per second | |
| Failed | 0 (0.00%) | under 1% |
| Checks (status 200, a token on login) | 4,038 of 4,038 | over 99% |
| Reads | median 24 ms, p95 67 ms, max 1.8 s | p95 under 1,000 ms |
| Logins | median 599 ms, p95 1.3 s, max 2.1 s | p95 under 3,000 ms |

One read took 1.8 s while users were still being added; that is most likely LocalStack
starting another Lambda container, but it was not checked in the logs.

**What happened to `tools/loadtest.py`.** It was our own Python load test (13 Oct: 25 users on
AWS, 16,184 reads, 539 requests per second, 2 failed). It was removed on 14 Oct because k6
covers the same reads and the login burst, and keeping two tests that do the same thing
would only give two sets of numbers to explain. Two things were given up: its per-endpoint
timing table (k6 can produce one with `--out json`, but not in its default summary) and its
no-pause peak-throughput measure; k6's 1 s pause is closer to people clicking.

## 8. Run the browser tests yourself

`tools/e2e.sh` is your own runner for the Playwright tests. One command, on the local stack
or against the live AWS site. It does the setup that is easy to get wrong (usernames, which
address, a warm database, a folder for screenshots), runs Playwright, and ends with a plain
line saying what the result means.

### The commands

Run them from `~/DavidCitiProject`:

```sh
./tools/e2e.sh --list              # first of all: shows the tests without running them (needs no server)
./tools/e2e.sh                     # every browser test, on the local stack
./tools/e2e.sh demo                # one file (any part of a spec file name)
./tools/e2e.sh demo tour           # several files
./tools/e2e.sh --show demo         # a real browser window, slowed down so people can watch
./tools/e2e.sh --aws               # the live AWS site, the four files seen passing there (13 tests)
./tools/e2e.sh --aws demo tour     # the live AWS site, just those files; read-only files only
./tools/e2e.sh --aws --show demo   # the live site, with a visible window
./tools/e2e.sh --report demo       # then open Playwright's HTML report
./tools/e2e.sh --help              # the same list, from the script itself
```

A name is any part of a file name: `demo` is `demo.spec.js`, `lifecycle` is
`project-lifecycle.spec.js`. A word that matches more than one runs them all (`time` runs
`timeline` and `timelog`); the script says so. It matches against the file names only, so a
word can't match the folder path by accident.

### What it does for you

- **Local:** checks that ports 3000 (the website) and 3001 (the API proxy) are listening and,
  if not, prints the fix (`./bin/start-dev.sh`). Looks up Maria's, Ana's and Sam's usernames
  in the local database, the same way `tools/test-all.sh` does. Always points the tests at
  `http://localhost:3000`, even if an AWS address is still exported in your shell.
- **Admin password:** read only from `E2E_ADMIN_PASSWORD`. If it is not set, the script says
  the admin-only test (`project-lifecycle`) will skip.
- **AWS:** points the tests at `https://d1gov8jpsxhwer.cloudfront.net`, sets the AWS
  usernames (Maria `ML662930`, Ana `AR553882`, Sam `SP918535`), and wakes the site first with
  a call to `/api/tracker/health` (the database sleeps when idle). It clears
  `E2E_ADMIN_PASSWORD` so a local password is never sent to the live site. It **refuses** any
  file that writes data, before anything runs. With no file named, it runs the four seen
  passing there: `demo`, `history`, `schedule` and `tour` (13 tests). `timeline`, `budget` and
  `workload` also only read, so you may name them, but on the live data `timeline` and
  `workload` each have one failing test (section 4).
- **Screenshots:** the tour saves one per screen in `E2E_TOUR_DIR` (default `$HOME/tour-shots`).
- **`--show`:** opens a visible browser and waits 500 ms between steps (`E2E_SLOWMO=250`
  makes it faster, `E2E_SLOWMO=1000` slower). It also lifts the two-minute limit, because the
  slow steps would otherwise run out of time. It needs a screen, so run it from a terminal on
  the VDI's desktop. Use it on one file: `--show demo` took about 16 s of test time at the
  default 500 ms (a review run on 14 Oct night); the whole suite would take far longer.
- **`--report`:** writes Playwright's HTML report (`frontend/playwright-report/`) and opens
  it when the run is over. Press Ctrl+C in the terminal to close it.

### The files

| Name | What it checks | Writes data? | `--aws` |
| --- | --- | --- | --- |
| `demo` | The seven questions, then the phone menu | No | Yes (default set) |
| `tour` | Every screen, desktop and phone, with the axe accessibility scan | No | Yes (default set) |
| `history` | A manager reads a person's history | No | Yes (default set) |
| `schedule` | The Schedule bars | No | Yes (default set) |
| `budget` | The budget chart | No | Yes when named (3 of 3 passed there) |
| `timeline`, `workload` | The timeline and workload charts | No | Yes when named, but one test in each failed on the live data (section 4) |
| `pull` | Ana takes a task and puts it back | **Yes** | Refused |
| `requests` | Ana asks, Maria rejects | **Yes** | Refused |
| `timelog` | Ben logs time, Maria approves | **Yes** | Refused |
| `project-lifecycle` | An admin creates, edits, archives and reactivates a project | **Yes** (needs `E2E_ADMIN_PASSWORD`) | Refused |
| `screenshots` | Rewrites the README pictures (needs `E2E_SCREENSHOTS=1`) | Changes repo files | Refused |

Run locally with no name, the script also runs the four that write, and says so. They add
rows to the local database (never to AWS). There is no delete, so each run adds a few.

### What the last line means

The script ends with a block headed "What this means":

| It says | What happened | What to do |
| --- | --- | --- |
| `PASSED: N tests passed` | In a real browser, the app did what each test expects | Nothing |
| `FAILED: N tests failed` | A check did not hold. The error above the block names the file and the line | Open the trace it prints (`npx playwright show-trace ...`), or rerun that file with `--show` and watch |
| `SKIPPED: N` with a list | Those tests did not have what they need. Not a failure | Set the variable it names (usually `E2E_ADMIN_PASSWORD`) if you want them to run |
| `COULD NOT RUN` | Playwright stopped before any test finished | Read the first error above; a missing browser is fixed with `npx playwright install chromium` |

The exit code is 0 when everything passed, 1 for a failure or a run that could not start,
and 2 for a request the script refused.

### If it says...

| Message | Why | Fix |
| --- | --- | --- |
| `The local stack is not running: nothing is listening on port 3000...` | `start-dev.sh` is not running (or the website died) | `cd ~/DavidCitiProject && source ~/.bashrc && ./bin/start-dev.sh`, wait for `All Components Verified!`, run again |
| `Could not find Maria Lopez and Ana Ruiz in the local database` | The demo data was never seeded | `TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py seed` |
| `Refused: pull.spec.js ...` | You asked for a file that writes, with `--aws` | Leave out `--aws` (local), or pick a read-only file |
| `The live site did not answer ... health` | AWS is asleep, down, or the network is off | Wait a minute and run again; Plan B is the local stack |
| `--show needs a screen` | The shell has no display | Use a terminal on the VDI's desktop |

### Before the demo

1. Warm AWS and check the live site end to end: `./tools/e2e.sh --aws` (the four files seen
   passing there, 13 tests, about 1.4 minutes), or just `./tools/e2e.sh --aws demo tour` for
   the two that matter most.
2. Rehearse the live moment: `./tools/e2e.sh --aws --show demo`.
3. If the live site is down, the same on the local stack: `./tools/e2e.sh --show demo`.

### How the script was checked

On 14 Oct, night, in the redesign worktree, and again after an independent review.

Checked for real (no browser needed): the syntax (`bash -n`), `shellcheck` (clean), `--help`,
`--list` (30 tests in 12 files locally; 13 tests in 4 files with `--aws`), the refusals
(`--aws pull`, `--aws time`, `--aws project`, `--aws screenshots`, an unknown name, an unknown
option, `--show` with no display), the missing-port message, the usernames it looks up locally
(Maria `ML460428`, Ana `AR836183`, Sam `SP345715`), and the AWS usernames (Maria `ML662930`, Ana
`AR553882`, Sam `SP918535`, Ben `BO435681`, all read from the live site's people list or signed in
with).

Checked with a stand-in for Playwright, before and after each review fix: with `--aws` and no
name the stand-in is handed exactly `demo history schedule tour` (before the fix it was handed
all seven read-only files); with `--aws timeline budget workload` it is handed those three and the
script prints a note about the two with a failing test; an exported `E2E_SCREENSHOTS=1` is dropped
on a run with no names and kept when `screenshots` is named (before the fix a run with no names
kept it and would have rewritten `docs/screenshots`). The summary block for passed, failed,
skipped and could-not-run, and that `E2E_ADMIN_PASSWORD` is cleared for `--aws`, were checked the
same way.

Seen by a review run against the live site, with a real browser: `--aws demo` 2 passed;
`--aws history schedule tour` 11 passed; `--aws timeline budget workload` 10 passed, 2 failed,
`FAILED: 2 tests failed`, exit 1 (section 4 says why); `--show demo` on the VDI's display took
16.3 s of test time at the default 500 ms and 18 s counting the script's own lines; headless
with `E2E_SLOWMO=1500` the file took 24 s (its first test 14.4 s, against 4.8 s with no slowMo).

A real local run through the script got through its first 20 tests before it was stopped:
18 passed (budget, demo, history, pull, requests, schedule, timeline, timelog) and 2 skipped
(project-lifecycle had no `E2E_ADMIN_PASSWORD`; screenshots runs only on request). Not run for
real by the author of this page: a whole local run to the end, `--report`, and `--aws` with
a browser. The integration run replaces this paragraph with a full local run.
