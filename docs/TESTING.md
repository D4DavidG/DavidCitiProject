# Testing: what we test, how, and what coverage means

Every number on this page was measured on the VDI on 14 Oct 2026, with the local stack
running (`bin/start-dev.sh`) and the demo data seeded (`tools/demo.py seed`).

**One command runs everything:** `./tools/test-all.sh` (section 6).

## 1. The kinds of test we have

A test is a small program that uses our code and checks the result. Each kind below
checks one layer, from the database up to a real browser.

| Kind | What it proves | Why this kind | Files | Command (from the repo root) | Time | Count today |
| --- | --- | --- | --- | --- | --- | --- |
| **Database rule tests** | Postgres itself refuses bad rows (each by its named rule), nothing can be deleted, the 5 integrity queries each catch a planted problem, migrations run once and all-or-nothing | The last line of defence must hold even if the Python is wrong | `tests/backend/test_schema.py`, `test_no_delete.py`, `test_integrity.py`, `test_migrate.py` | `.venv/bin/pytest -q tests/backend/test_schema.py tests/backend/test_no_delete.py tests/backend/test_integrity.py tests/backend/test_migrate.py` | 2 s | 72 |
| **Business-rule (service) tests** | Every rule in `MVP.md`: who may do what, capacity and overtime, sign-off, budget maths, audit rows and who gets notified, money, the clock, password hashing, tokens | Fast and precise: they call the rules directly, never through HTTP (they never import `api`) | `tests/backend/test_users.py`, `test_work.py`, `test_projects.py`, `test_requests.py`, `test_dashboard.py`, `test_audit.py`, `test_domain.py`, `test_security.py` | `.venv/bin/pytest -q tests/backend/test_users.py tests/backend/test_work.py tests/backend/test_projects.py tests/backend/test_requests.py tests/backend/test_dashboard.py tests/backend/test_audit.py tests/backend/test_domain.py tests/backend/test_security.py` | 7 s | 233 |
| **API tests** | Routing (both path shapes), every route needs a token, the role is read from the database, 404 not 403, error and list shapes, no DELETE route; every read route and every write route called once; the Lambda entry point | Proves the wiring between the web request and the rules, using real Lambda-shaped events | `tests/backend/test_api.py`, `test_api_read_walk.py`, `test_api_audit_walk.py`, `test_function.py` | `.venv/bin/pytest -q tests/backend/test_api.py tests/backend/test_api_read_walk.py tests/backend/test_api_audit_walk.py tests/backend/test_function.py` | 4 s | 123 |
| **"Writes really commit" test** | A change is actually saved, not left in a transaction that is never committed | Every other test rolls back on purpose, so only a test on its own database can catch "nothing is ever saved" | `tests/backend/test_store_commits.py` | `.venv/bin/pytest -q tests/backend/test_store_commits.py` | under 1 s | 2 |
| **Race (concurrency) tests** | Two people pressing "Take this" at the same moment: only one wins, and nobody goes over their task limit | A race only shows up with two real database connections at once; the test waits until Postgres reports the second one blocked | `tests/backend/test_claim_race.py` | `.venv/bin/pytest -q tests/backend/test_claim_race.py` | under 1 s | 2 |
| **Website component tests** (Vitest + React Testing Library) | Each screen shows the right thing and sends the right request: field names, cents, only-changed fields, refusals shown as written, buttons per role, phone layout | Fast checks of the website without a browser or a server: the API is faked at `fetch` | `frontend/src/**/*.test.jsx`, `*.test.js` (31 files, beside the code they test) | `cd frontend && npm test` | 88 s | 291 |
| **Browser tests** (Playwright) | A real Chrome against the real running app: the demo walk (the seven questions, plus the phone menu), the pull board (Ana takes a task and puts it back), the screen tour (every screen for a manager and an employee, desktop and phone, no sideways scrolling, a deep-link refresh), the three charts (timeline: Late words and icon, tooltips on hover, tap and focus, print stripes; budget: the Budget line's position, tooltips; workload: gridlines and bars line up, Tab opens the tooltip, print stripes, contrast), README screenshots (only when asked) | The only test that sees what David sees: real login, real API, real database, real layout | `frontend/e2e/demo.spec.js`, `pull.spec.js`, `tour.spec.js`, `timeline.spec.js`, `budget.spec.js`, `workload.spec.js`, `screenshots.spec.js` | `cd frontend && E2E_MANAGER_USERNAME=ML460428 E2E_EMPLOYEE_USERNAME=AR836183 E2E_ZEUS_MANAGER_USERNAME=SP345715 E2E_TOUR_DIR=$HOME/tour-shots npx playwright test` | 58 s | 21 tests in 7 files: 20 passed, 1 skipped (screenshots, on purpose) |
| **Load test** | How fast the API answers with many users at once, and whether anything fails | Speed and failures under load can't be seen one request at a time | `tools/loadtest.py` | AWS (asks for the AWS admin password, then runs): `read -rsp 'Admin password: ' TRACKER_ADMIN_PASSWORD && export TRACKER_ADMIN_PASSWORD && TRACKER_API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker python3 tools/loadtest.py --users 25 --seconds 60`. Locally, leave out `TRACKER_API` and keep to 10 users or fewer: LocalStack itself fails past about 15 (`README.md:296-303`) | 20 to 60 s | Last run on AWS, 13 Oct: 16,184 reads at 539 per second, 2 failed (`README.md:269-275`). Not rerun today |
| **k6 load test (planned)** | The same as the load test, with the industry tool named in the meeting notes ("sk8", `notes.txt:6`) | Evaluators may expect a named tool; k6 also gives standard reports | not built yet | none yet; k6 is not installed on the VDI (`which k6` prints nothing) | | 0 |

Plus two checks that are not tests but run with them: **lint** (ESLint reads the website
code for mistakes: `cd frontend && npm run lint`, clean, 5 s) and **bandit** (a security
scanner for the Python, the same one CI runs: no issues, under 1 s).

Backend total: `.venv/bin/pytest -q` printed `432 passed in 18.99s`.
Website total: `npm test` printed `Test Files  31 passed (31)`, `Tests  291 passed (291)`, `Duration  87.70s`.

The backend tests need local Postgres running. They build their own `tracker_test`
database (`tests/backend/pg.py:13`) and never touch the app's data.

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
TOTAL                                        1847     73    96%
432 passed in 18.99s
```

96% means: of the 1,847 statements in our backend, the tests ran all but 73. It
measures our code only; `.coveragerc` leaves out the psycopg library that
`start-dev.sh` copies into the folder. All four backend test kinds count toward it.

With branches too (`--cov-branch`) the total is 94% (576 branches, 69 partly taken).
The API layer (`api/`: routes, auth, error mapping, every handler) is **100%**, lines and
branches. The lowest files, counting branches, are `services/milestones.py` (85%),
`store/postgres.py` (82%) and `services/assignments.py` (87%). Counting statements only
(the 96% run above), the same three are 89%, 89% and 90%.

To see which lines were missed: `.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing`.

### Website (Vitest with V8 coverage)

`cd frontend && npm run test:coverage` printed:

```
Statements   : 94.84% ( 1215/1281 )
Branches     : 90.64% ( 911/1005 )
Functions    : 91.02% ( 426/468 )
Lines        : 96.11% ( 1038/1080 )
```

V8 is the JavaScript engine inside Chrome and Node; it counts what ran while the
component tests ran. Read the four lines as: 1,215 of 1,281 instructions ran; 911 of 1,005
yes/no paths were taken; 426 of 468 functions were called (many of the missing ones are
small click handlers on rarely used buttons); 1,038 of 1,080 lines ran. The one module that
talks to the API, `services/request.js`, is at 100% of lines and functions and 97% of
branches.

### Browser tests and load tests: no percentage, on purpose

- **Browser tests** run the real app in a real browser. Their measure is **which
  journeys they walk**, not lines: today the manager's demo (all seven questions), an
  employee using the pull board, every screen for both roles at two widths, and the
  timeline, budget and workload charts (alignment, tooltips, print stripes, contrast). A line
  percentage would mix in code the component tests already cover and add nothing.
- **Load tests** measure **speed and failures**: requests per second, how long the
  slowest 5% took (p95), and how many failed. Coverage doesn't apply.

### Against the rubric's targets (`docs/full-stack.md:105-111`)

| Rubric target | Goal | Today | Met? |
| --- | --- | --- | --- |
| Backend code coverage | 80% | 96% of statements (94% with branches) | Yes |
| Frontend code coverage | 80% | 94.84% statements, 96.11% lines, 90.64% branches, 91.02% functions | Yes |
| API endpoints (all CRUD) | 90% | `api/` 100%; every route called by the two walk tests | Yes |
| Error handling | 90% | `api/errors.py` 100%; `test_api_read_walk.py` covers malformed input and a crash returning 500 | Yes |
| Critical user paths end to end | 100% | Manager's demo walk, pull board, every screen for manager and employee | Partly. Not end to end yet: an employee logs time and the manager approves it (component tests only, `README.md:253-254`); an admin creates, edits, archives and reactivates a project; the forced password change at first sign-in |

### What is not covered, and why

The full list is in the README under **Known gaps** (`README.md:240`). In short: guard
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

**What each test file needs:**

| File | Needs | Writes data? |
| --- | --- | --- |
| `demo.spec.js` | `E2E_MANAGER_USERNAME` (or `E2E_ADMIN_PASSWORD` to look it up) | No |
| `pull.spec.js` | `E2E_MANAGER_USERNAME` and `E2E_EMPLOYEE_USERNAME` (or `E2E_ADMIN_PASSWORD`); Ana must hold at most 1 unfinished task | **Yes**: a task, audit rows, bell notifications (it archives the task afterwards) |
| `tour.spec.js` | `E2E_TOUR_DIR` (a folder for screenshots) and both usernames | No |
| `screenshots.spec.js` | `E2E_SCREENSHOTS=1` and `E2E_ADMIN_PASSWORD`; overwrites `docs/screenshots/` | No (but changes repo files) |

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

## 4. Browser tests against AWS

Point the tests at the deployed site with `E2E_BASE_URL`. The AWS usernames differ from
the local ones (`docs/DEMO-RUNBOOK.md:31-32`). Run only the read-only files there:

```sh
cd ~/DavidCitiProject/frontend
E2E_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net E2E_MANAGER_USERNAME=ML662930 E2E_EMPLOYEE_USERNAME=AR553882 E2E_TOUR_DIR=$HOME/tour-shots npx playwright test demo tour
```

- **Safe on AWS:** `demo.spec.js` and `tour.spec.js` (they only read; signing in writes
  no audit row, `tests/backend/test_api_audit_walk.py:3-5`).
- **Not on AWS:** `pull.spec.js` writes a task and sends notifications to Maria and every
  admin, which would show up in the live demo. It also calls the API at `E2E_API`, which
  defaults to the local one.
- Warm the site up first (`curl -s https://d1gov8jpsxhwer.cloudfront.net/api/tracker/health`):
  the database sleeps when idle and the first request can take 15 s.

`demo.spec.js` alone was run against AWS on 14 Oct and printed `2 passed (7.0s)`
(`docs/DEMO-RUNBOOK.md:308`). The tour against AWS has not been run. The commands are
from `docs/DEMO-RUNBOOK.md:312-320`.

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
the production build, then the browser tests if ports 3000 and 3001 are listening. It
finds the local Maria and Ana usernames in the local database by itself (or uses
`E2E_MANAGER_USERNAME` / `E2E_EMPLOYEE_USERNAME` if set). The browser tests always go
to the local stack, even if `E2E_BASE_URL` is still set from an AWS run, because
`pull.spec.js` writes data. Each run therefore adds one archived task, audit rows and
bell notifications for Maria and every admin to the local database. It ends with a table
and exits with an error code if any step failed. Last run, 14 Oct (after the final fix
wave, after the project-manager notifications were merged):

```
Step            Result Detail
Backend tests   PASS   432 passed, coverage 96%
Bandit          PASS   no issues
Website tests   PASS   291 passed, lines 96.11%
Lint            PASS   clean
Build           PASS   frontend/dist
Browser tests   PASS   20 passed, 1 skipped; screenshots in /tmp/tmp.eQA5nKou6q
```

`tools/test-all.sh` looks up Maria's, Ana's and Sam's usernames in the local database, so every browser test runs except the README screenshots one (it only runs with `E2E_SCREENSHOTS=1`).

**Automated on every push?** Not yet. GitHub CI today runs only the bandit scan
(`.github/workflows/python.actions.yml:27`), `npm audit`
(`.github/workflows/react.actions.yml:27`) and a Terraform check. The tests run on the VDI,
by hand or through `tools/test-all.sh`. Running them in CI would need a Postgres service
in the workflow; that is a possible next step, not built.
