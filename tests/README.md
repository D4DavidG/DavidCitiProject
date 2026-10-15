# tests/

For anyone looking for the tests: every test suite in the repo, where it lives, what it
covers, how to run it and how many tests it has. Back to the [root README](../README.md).
The full guide (why each kind exists, what a pass or a failure looks like, coverage, watching
the browser tests) is [docs/TESTING.md](../docs/TESTING.md).

Every command runs from the repo root.

## Every suite

| Suite | Where it lives | What it covers | Run it | Tests (15 Oct) |
| --- | --- | --- | --- | --- |
| Backend: database rules and integrity | [`tests/backend/`](backend/): `test_schema.py`, `test_no_delete.py`, `test_integrity.py`, `test_migrate.py` | Postgres refuses bad rows; nothing can be deleted; the 5 integrity queries; migrations | `.venv/bin/pytest -q tests/backend/test_schema.py tests/backend/test_no_delete.py tests/backend/test_integrity.py tests/backend/test_migrate.py` | 88 |
| Backend: business rules | [`tests/backend/`](backend/): `test_users.py`, `test_work.py`, `test_projects.py`, `test_requests.py`, `test_dashboard.py`, `test_audit.py`, `test_domain.py`, `test_security.py`, `test_sessions.py` | The rules in `backend/tracker/services`, called directly on a real Postgres | `.venv/bin/pytest -q -k capacity` (one rule by name) | 383 |
| Backend: API | [`tests/backend/`](backend/): `test_api.py`, `test_api_read_walk.py`, `test_api_audit_walk.py`, `test_function.py`, `test_openapi.py` | Every route, sign-in and role checks, 404 for "not yours", error and list shapes, the audit row on every write, the OpenAPI file | `.venv/bin/pytest -q tests/backend/test_api.py` | 173 |
| Backend: commit and race | [`tests/backend/`](backend/): `test_store_commits.py`, `test_claim_race.py` | Writes really save; two people can't take the same task | `.venv/bin/pytest -q tests/backend/test_store_commits.py tests/backend/test_claim_race.py` | 4 |
| **All backend tests** | [`tests/backend/`](backend/) | All of the above; 97% of statements | `.venv/bin/pytest -q` | **683** |
| Website unit tests | beside the code in [`frontend/src/`](../frontend/src/), named `*.test.jsx` or `*.test.js` | Each screen and component with the API faked (Vitest and React Testing Library); 98.11% of lines | `(cd frontend && npm test)` | **889** in 54 files |
| Browser tests | [`frontend/e2e/`](../frontend/e2e/), named `*.spec.js` | The whole app in a real Chromium, on the local stack or the live site (Playwright) | `./tools/e2e.sh` | **38** in 14 files |
| Accessibility scans | inside [`frontend/e2e/tour.spec.js`](../frontend/e2e/tour.spec.js) | WCAG A and AA problems on every screen, light and dark (axe) | `./tools/e2e.sh tour` | 8 tests, 100 scans |
| Load test | [`tests/load/load.js`](load/load.js) | Speed and failures with 10 managers at once locally, 25 on AWS (k6) | see [docs/TESTING.md, section 5](../docs/TESTING.md#5-run-each-suite) | 4 thresholds |

Plus the scans that read code without running it: bandit (Python security), ESLint, the
production build and npm audit. **One command runs everything:** `./tools/test-all.sh`.

## What is in this folder

| Path | What it is |
| --- | --- |
| [`backend/conftest.py`](backend/conftest.py) | Shared setup: builds the `tracker_test` database once, rolls back every test, freezes the clock at Wed 14 Oct 2026, runs the 5 integrity queries after each test |
| [`backend/pg.py`](backend/pg.py) | Creates and drops the test databases; they never touch the app's own data |
| [`backend/factories.py`](backend/factories.py) | Builds test data through the real services, so every row has its audit trail |
| [`backend/schema_rows.py`](backend/schema_rows.py) | Valid raw rows that the database rule tests break one field at a time |
| `backend/test_*.py` | The 20 test files in the table above |
| [`load/load.js`](load/load.js) | The k6 load test (read-only: it never writes) |

The backend tests need the local Postgres running (port 5432) and the Python environment
(`python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt bandit`).
[`pytest.ini`](../pytest.ini) points pytest at this folder and at `backend/tracker` for
imports; [`.coveragerc`](../.coveragerc) measures our code only.

## Why some tests live outside this folder

- **Website unit tests sit beside the code they test** (`PeoplePage.jsx` and
  `PeoplePage.test.jsx` in one folder). That is the React and Vitest convention: a test moves,
  and is reviewed, with its component. Vitest finds them with the pattern in
  [`frontend/vite.config.js`](../frontend/vite.config.js) (`src/**/*.test.{js,jsx}`).
- **Browser tests live in [`frontend/e2e/`](../frontend/e2e/)** because they need the
  website's own packages (Playwright and axe are installed in `frontend/node_modules`), and
  [`frontend/playwright.config.js`](../frontend/playwright.config.js) looks there.
- **Backend tests are here, not in `backend/`**, because only `backend/tracker/` is zipped
  into the Lambda, and the CI security scan (`bandit -r ./backend`) would fail on the `assert`
  lines every test uses.
