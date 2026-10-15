# Tools: scripts for testing, demos and the API

For anyone who wants to run the tests, watch the browser tests, fill a fresh database with demo
data, or try the API by hand: what each script in `tools/` does, when to use it, and one command
for each. Back to the [project README](../README.md).

Run every command from the repo root (`~/DavidCitiProject` on the VDI). The scripts for setting
up and deploying are in `bin/` instead ([bin/README.md](../bin/README.md)).

| Script | What it does | Use it when |
| --- | --- | --- |
| [`e2e.sh`](e2e.sh) | Runs the Playwright browser tests on the local stack or the live AWS site; can show the browser, record videos, or open Playwright's UI | You want to watch the app being tested, or check the live site |
| [`test-all.sh`](test-all.sh) | Every automated check in one go, then a PASS/FAIL table | Before a commit or a deploy |
| [`swagger.sh`](swagger.sh) | Serves Swagger UI, a web page to try every API endpoint | You want to call the API by hand, locally or on AWS |
| [`demo.py`](demo.py) | `seed` fills an empty database with demo data; `demo` walks the seven questions, then tries to break ten rules, each refused | A fresh local database; a terminal demo of the rules |
| [`openapi.py`](openapi.py) | Rebuilds `docs/openapi.json` (the API description Swagger and Postman read) from the route table | After adding or changing a route |
| [`tracker.http`](tracker.http) | Read-only API requests for VS Code's REST Client extension | You prefer VS Code to a browser for API calls |
| [`console.py`](console.py) | Opens the AWS web console, already signed in | You want the Lambda, its logs or the database in AWS |

The k6 load test (many people using the API at once) has moved to `tests/load/load.js`, with the
other tests: how to run it is in [tests/README.md](../tests/README.md).

## e2e.sh: the browser tests

Playwright drives a real Chromium through the website, as a person would, and checks what
appears. What each test file checks, and why, is in [docs/TESTING.md](../docs/TESTING.md).

**Before you run it:**

- **Local:** the local stack must be running (`./bin/start-dev.sh`, ports 3000 and 3001) with
  the demo data seeded (`demo.py seed`, below). The script looks up the demo usernames in the
  local database.
- **AWS:** nothing to start. The script wakes the live site first (its database sleeps when idle).
- **A visible browser** (`--show`, `--ui`) needs a screen: run it from a terminal on the VDI's
  own desktop (`echo "$DISPLAY"` prints something like `:1`).

| To | Run |
| --- | --- |
| Watch the demo walk in a real window (about 20 seconds) | `./tools/e2e.sh --show demo` |
| The same, slower | `E2E_SLOWMO=800 ./tools/e2e.sh --show demo` |
| The live AWS site, in a window | `./tools/e2e.sh --aws --show demo` |
| The live site's default set, no window: `demo`, `history`, `schedule`, `tour`, `search` and `archive-warning` (20 tests), the read-only files seen passing there (name `timeline`, `budget` or `workload` to add them) | `./tools/e2e.sh --aws` |
| Every browser test, local, no window | `./tools/e2e.sh` |
| Record a video of every test, then open the report that plays them | `./tools/e2e.sh --video demo` |
| The same on the live site | `./tools/e2e.sh --aws --video history` |
| Playwright's UI mode: pick a test, watch it, replay each step (not with `--list`, `--report` or `--video`) | `./tools/e2e.sh --ui` |
| Open Playwright's HTML report afterwards | `./tools/e2e.sh --report demo` |
| Pass any option straight to Playwright (everything after `--`) | `./tools/e2e.sh --aws demo -- --headed` |
| List the tests without running anything | `./tools/e2e.sh --list` |
| Every option | `./tools/e2e.sh --help` |

**Naming files:** any part of a file name picks it (`time` runs both `timeline` and `timelog`),
and several names are fine (`./tools/e2e.sh demo tour`).

| File | What it walks | Data |
| --- | --- | --- |
| `demo` | The seven questions, then the phone menu | Read-only |
| `tour` | Every screen, desktop and phone, light and dark, with the axe accessibility scan; screenshots go to `~/tour-shots` (about 3 minutes) | Read-only |
| `history` | A manager reads a person's history | Read-only |
| `schedule` | The Schedule bars | Read-only |
| `timeline`, `budget`, `workload` | The three charts | Read-only |
| `pull` | The employee takes a task from the board and puts it back | Adds data |
| `requests` | The employee asks, Maria rejects | Adds data |
| `timelog` | Ben logs time, Maria approves it | Adds data |
| `project-lifecycle` | An admin creates, edits, archives and reactivates a project | Adds data |
| `screenshots` | Rewrites the README screenshots in `docs/screenshots/`; runs only with `E2E_SCREENSHOTS=1` | Changes repo files |

**The live site stays read-only by default.** With `--aws` a file that adds data is refused
before anything runs. `--allow-writes` (with `--aws` only) lets those files run there after a
warning and a 5-second pause; the rows they add stay for good, and they ring real people's bells.
`./tools/e2e.sh --aws --allow-writes timelog` is the example.

**Who the tests sign in as:**

| Where | Manager | Employee | Second manager | Admin |
| --- | --- | --- | --- | --- |
| Local | Maria Lopez | Ana Ruiz | Sam Patel | AD000001, only if you set `E2E_ADMIN_PASSWORD`; without it `project-lifecycle` skips |
| AWS | Maria Lopez, `ML662930` | Ben Okafor, `BO435681` (chosen while Ana Ruiz was archived in the demo) | Sam Patel, `SP918535` | AD000001, password `gusmao123`, used only with `--allow-writes` |

Every demo person's password is `Demo-pass-2026`. Locally the usernames differ on every
machine, so the script reads them from the local database.

**What you get:** `PASSED` or `FAILED` with a count. A failed test keeps a trace (a step-by-step
recording), and the script prints where the full log is. Videos are copied into a new dated folder
under `~/e2e-videos` (change it with `E2E_VIDEO_DIR`). Exit code 0: all passed; 1: a test failed or Playwright could
not run; 2: a mistake in the command.

## test-all.sh: every check, one table

```sh
./tools/test-all.sh
```

Six steps, one after another: the backend tests with coverage, the bandit security scan, the
website tests with coverage, lint, the production build, then the browser tests with the axe
accessibility scan. The browser step runs only when the local stack is up (ports 3000 and 3001),
and always against the local stack, never AWS. It runs every browser file, so the ones that add
data (see the table under e2e.sh) add rows and notifications to the local database. The end is a PASS/FAIL table; exit code 0 means every step
that ran passed. What each step proves: [docs/TESTING.md](../docs/TESTING.md).

## swagger.sh: try the API in a browser

```sh
./tools/swagger.sh
```

Then open http://localhost:8090/swagger.html (only this machine can reach it; Ctrl+C stops it;
`SWAGGER_PORT=8091 ./tools/swagger.sh` picks another port).

1. In **Servers**, pick **Local** (needs `./bin/start-dev.sh` running) or **AWS** (the live site).
2. Open **auth > POST /auth/login**, put `{"username": "ML662930", "password": "Demo-pass-2026"}`
   in the body (Maria on AWS; every login is in the [project README](../README.md)) and press
   **Execute**. The page fills **Authorize** with the token for you.
3. Try any endpoint. The token lasts 15 minutes; sign in again after that, or as someone else to
   switch people.

On AWS, anything but a GET changes the live data and rings people's bells: use Local for
POST and PATCH. Worked examples (watching the audit log and notifications, refusals to try) are in
[docs/API.md](../docs/API.md).

## demo.py: demo data, and the rules in a terminal

```sh
python3 tools/demo.py seed   # once per database: people, projects, bookings, deliverables, tasks, time
python3 tools/demo.py demo   # the seven questions, then ten attempts to break a rule, each refused
```

It talks to the API over HTTP only (Python's standard library), at `TRACKER_API` (default
`http://localhost:3001/api/tracker`, the local stack). It signs in as the admin, AD000001, with
`TRACKER_ADMIN_PASSWORD`. Every person it creates gets the password `Demo-pass-2026`; `demo`
prints their usernames.

The very first time, the local admin still has the generated password, which must be changed
([SETUP.md, section 4](../docs/SETUP.md#4-sign-in-locally-and-add-demo-data) prints it).
Give both the generated one and the new one you choose (at least 8 characters); from then on,
`TRACKER_ADMIN_PASSWORD` is your new one:

```sh
read -rsp 'Admin password now: ' TRACKER_ADMIN_PASSWORD; echo; export TRACKER_ADMIN_PASSWORD
read -rsp 'New admin password (first run only, 8+ characters): ' TRACKER_NEW_ADMIN_PASSWORD; echo; export TRACKER_NEW_ADMIN_PASSWORD
python3 tools/demo.py seed
```

- `seed` stops at once if the project Apollo already exists, so running it twice is harmless.
  The live site is already seeded.
- `demo` changes no data: its attempts are refused. It works locally and on AWS (it signs in as
  Ana Ruiz, so Ana's account must be live; it was again from 15 Oct, 16:07).

## openapi.py: rebuild the API description

```sh
.venv/bin/python tools/openapi.py
```

Rebuilds [`docs/openapi.json`](../docs/openapi.json) from the route table
([`backend/tracker/api/routes.py`](../backend/tracker/api/routes.py)): each path, method, roles,
status code and one-line summary. Run it after any route change:
`tests/backend/test_openapi.py` fails until the saved file matches a fresh build.

## tracker.http: API requests in VS Code

Open [`tracker.http`](tracker.http) in VS Code with the REST Client extension
(`humao.rest-client`). Choose the server on the `@baseUrl` line (`{{aws}}` or `{{local}}`), then
press **Send Request** above "login": it asks for the admin's password (`gusmao123` on AWS) and
every later request reuses the token. Every request in the file only reads, so nothing changes.

## console.py: the AWS console, signed in

```sh
(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)
```

The workshop gives access keys, not a console password; this swaps them for a one-off sign-in
link and opens it in your browser. Pages: `lambda` (the default), `logs`, `rds`, `cloudfront`,
`s3`. `ENVIRONMENT.config` comes from `./bin/setup-participant.sh`; rerun it if the credentials
have expired. The link signs you in, so never paste it anywhere; it stops working after 15 minutes.
