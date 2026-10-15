# Where everything is

**How to use this page**

1. Looking for a file or folder? **Part A** draws the repo as a map: what each part is for and when you'd open it.
2. Asked "where is the data stored?" **Part B**: the database, the browser, secrets and settings, files and logs.
3. Asked "how is it secured?" **Part C**: one table in plain words, with where each measure lives and why, then the honest **Known gaps**.
4. Every fact has a source: `file:line`, or a command and what it printed. Line numbers drift as code changes; file names don't.
5. No secret values are on this page. Where a secret is kept, it says what kind of thing it is and where it lives, never the value.

Checked on 15 Oct 2026, morning, on branch `David-tweaks` at commit `d43d958`; fact-check
corrections about 09:45, at `b2cace1`. Paths start at the
repo root (`~/DavidCitiProject`). Inside the API, `services/...` is short for
`backend/tracker/services/...` (the same for `api/`, `domain/`, `store/`, `function.py`).

---

## A. The repo, as a map

**Legend:** **[W]** came with the workshop template and we left it alone. **[W, changed]** came
with the template and we edited it. No mark: we wrote it. The template's last commit is `56bd0bb`
(11 Oct); `git log 56bd0bb..HEAD -- <file>` shows whether we touched a file. `git ls-files | wc -l`
printed 317 tracked files.

```
DavidCitiProject/
├── README.md          The formal write-up: 7 questions, architecture, tests.   [W, rewritten]
│                      Open it when someone asks "what is this?"
├── MVP.md             Short public scope: the problem, the features, the screens.
├── CLAUDE.md          Working notes for Claude Code. Not for evaluators.
├── pytest.ini  .coveragerc  requirements-dev.txt
│                      Backend test settings: where the tests are, measure only our code.
├── .gitignore         What git must never save (env files, credentials, notes). [W, changed]
├── LICENSE  CODE_OF_CONDUCT.md  CONTRIBUTING.md  DCO.md  SECURITY.md            [W]
│
├── frontend/          THE WEBSITE (React + Material UI): what people click.  [W starter, now ours]
│   ├── index.html     The one page the browser loads; it pulls the fonts.     [W, changed]
│   ├── package.json   The libraries and the npm commands (dev, test, lint, e2e). [W, changed]
│   ├── vite.config.js Dev server on port 3000 (never moves port); test settings. [W, changed]
│   ├── playwright.config.js   Browser-test settings (2 min a test, E2E_SLOWMO).
│   ├── e2e/           Browser tests (Playwright): 12 files. Open to see what a test clicks.
│   └── src/
│       ├── main.jsx   Starts React.                                           [W]
│       ├── App.jsx    THE ROUTE LIST: which address shows which screen, and who may
│       │              see it. Open it first to find any screen.                [W, rewritten]
│       ├── pages/     One folder per screen: login dashboard allocation schedule projects
│       │              mytasks approvals people requests notifications audit account
│       ├── components/  Shared parts: the page frame and menu (AppLayout), the bell,
│       │              tables that turn into cards on phones (DataTable), every form
│       │              (FormDialog), the password box with the eye (PasswordField), a
│       │              person's Actions menu (PersonActions), charts/ (no chart library)
│       ├── services/  request.js: THE ONLY CODE THAT CALLS THE API. format.js: the only
│       │              place cents, minutes and dates become text. personAccess.js: which
│       │              actions to offer on a person (the server checks again)
│       ├── theme/     Colours, fonts, light and dark mode, the phone breakpoint
│       ├── auth/      Who is signed in (AuthContext); the "who may see this page" gate
│       └── test/      Helpers for the website tests. Each *.test.jsx sits next to the
│                      file it tests (51 test files)
│
├── backend/
│   ├── README.md      The workshop's backend guide.                            [W, changed]
│   ├── _examples/     The workshop's sample Lambda. Never deployed (a leading _ is skipped).
│   │                  We removed the Java and Node samples; only python-service is left. [W, changed]
│   └── tracker/       THE API: Python, one AWS Lambda, all the rules.
│       ├── function.py  Lambda entry: on a cold start connect, migrate, make the first
│       │              admin; then hand every request to api/app.py
│       ├── api/       HTTP only, no business rules. routes.py = THE ROUTE TABLE (70 routes
│       │              and who may call each). app.py = check the token, re-read the role
│       │              from the database. errors.py = the one error-to-status table
│       ├── services/  THE BUSINESS RULES, one file per subject (users, projects, tasks,
│       │              time_entries, requests, dashboard, audit, ...). Open the one named
│       │              for what you are asked about
│       ├── domain/    Small shared parts: error types, money in cents, "today" in Eastern
│       │              time, input checks
│       └── store/     THE DATABASE LAYER: postgres.py (connection, transactions),
│           │          migrate.py, integrity.py (the 5 checks that must find nothing)
│           └── migrations/  THE DATABASE SHAPE: 001_init.sql to 005_sessions.sql.
│                      Never edit one that has run on AWS; add the next number
│
├── tests/backend/     Backend tests (pytest): 648 tests, each rolled back afterwards.
│
├── tools/             Our scripts.
│   ├── test-all.sh    Every check, one after another, then a PASS/FAIL table.
│   ├── e2e.sh         The browser tests, local or AWS, visible and slowed (docs/DEMO-TESTS.md).
│   ├── demo.py        seed = make the demo data; demo = the 7 questions, then 10 refusals.
│   ├── k6/load.js     The load test.
│   ├── openapi.py     Rebuilds docs/openapi.json from the route table.
│   ├── tracker.http   Ready-made API requests for VS Code's REST Client.
│   └── console.py     Opens the AWS console, signed in.
│
├── infra/             Terraform: builds everything on AWS.                     [W, changed]
│   ├── lambda.tf      The Lambda (we raised memory to 512 MB for faster logins). [W, changed]
│   ├── cloudfront.tf  The front door: website from S3, /api/tracker* to the Lambda. [W, changed]
│   ├── rds.tf         The Aurora PostgreSQL database.                           [W]
│   ├── s3.tf          The bucket that holds the website files.                  [W]
│   ├── secrets.tf     Makes the token-signing key and the first admin's password.
│   ├── locals.tf      The settings each Lambda gets (we added the two secrets). [W, changed]
│   ├── output.tf      What Terraform prints after a deploy.                     [W, changed]
│   └── data.tf main.tf provider.tf variable.tf policy.tftpl README.md           [W]
│       documentdb.tf eks.tf helm/   Other workshop tracks, switched off.         [W]
│
├── bin/               Shell scripts: set up, start, deploy, clean up.            [W]
│   ├── setup-participant.sh   Trades your participant ID and code for temporary AWS keys. [W]
│   ├── setup-environment.sh   Installs the tools on the VDI.                    [W]
│   ├── start-dev.sh   Starts the local stack: website 3000, proxy 3001, LocalStack. [W]
│   ├── deploy-backend.sh  deploy-frontend.sh   Deploy to AWS (David runs them).  [W]
│   ├── generate-env.sh    Writes frontend/.env.local (the API address).         [W]
│   ├── cleanup-environment.sh   Backs up, then destroys everything. Irreversible. [W]
│   └── proxy-server.js    Local only: port 3001 to LocalStack.                  [W, changed]
│
├── .github/           CI on every push: bandit, npm audit, Checkov.              [W]
│
└── docs/
    ├── GUIDE.md       Your one-stop guide: demo script, how to reach everything, questions.
    ├── REPOINFO.md    What to say to evaluators, every claim checked against the code.
    ├── DEMO-RUNBOOK.md   What to click and run live, in order, with Plan B.
    ├── DEMO-TESTS.md  Running the tests live during the demo.
    ├── MAP.md         This page.
    ├── TESTING.md     Every kind of test, coverage, Playwright from scratch.
    ├── OVERNIGHT-REPORT.md   What was built on the night of 13 to 14 Oct.
    ├── openapi.json   The API for Postman or SwaggerHub (70 operations).
    ├── screenshots/   The five pictures in the README.
    ├── superpowers/specs/   One design write-up per feature, with the reasons (17 files).
    ├── superpowers/plans/   The step-by-step build plans (12 files).
    └── README.md  full-stack.md (the marking rubric)  validation.md            [W, changed]
```

Sources: the folder walk and origins in this part come from `git ls-files`, `git log 56bd0bb..HEAD
-- <file>` per file, and the file headers (for example `api/routes.py:1-9`, `function.py:1-10`,
`frontend/src/services/request.js:1-10`, `frontend/src/services/personAccess.js:1-5`).
`grep -c '_r("' backend/tracker/api/routes.py` printed 70; `pytest --collect-only -q` printed
`648 tests collected`; `git ls-files frontend/src | grep -c '\.test\.'` printed 51.
`git log --oneline 56bd0bb..HEAD -- backend/_examples` printed one commit, `271e1f7` ("Remove the
workshop's other-track guides and examples"), and `ls backend/_examples` printed `python-service`.

### One request, folder by folder

Say it in this order when you walk through the code:

```
browser  ->  frontend/src/services/request.js     the one place the website calls the API
         ->  local: bin/proxy-server.js (:3001)    AWS: CloudFront
         ->  backend/tracker/function.py           Lambda entry: connect, migrate, hand over
         ->  api/app.py                            find the route, check the token, re-read the role
         ->  api/routes.py, api/handlers.py        which endpoint, who may call it
         ->  services/*.py                         the business rules
         ->  store/postgres.py                     one transaction
         ->  PostgreSQL                            constraints refuse bad rows
```

(`api/app.py:1-5` draws the same chain; `function.py:58` is `handler`, `api/app.py:22` is
`authorise`, `api/app.py:41` is `dispatch`.)

### On the VDI only, never in git

Each is outside the repo folder, or listed in `.gitignore` or `.git/info/exclude`. Names only,
never contents.

| Name | What kind of thing it holds |
| --- | --- |
| `~/.claude/` (your home folder) | Claude Code's own files: session transcripts, memory notes, settings. REPOINFO section 14 quotes them |
| `.superpowers/` | The agents' build ledgers (`.superpowers/sdd/`), one progress file per build (`.git/info/exclude:7`) |
| `.worktrees/` | A second checkout of the repo on another branch; now `.worktrees/tweaks` on `David-tweaks` (`.git/info/exclude:8`) |
| `~/.bashrc` (your home folder) | The participant code and the LocalStack token, as environment variables (CLAUDE.md §4) |
| `ENVIRONMENT.config` | The workshop's temporary AWS credentials, written by `bin/setup-participant.sh:153-166` (`.gitignore:215`) |
| `~/.aws/credentials` | The same temporary credentials, for the `aws` command (`bin/setup-participant.sh:117-119`) |
| `private/` | Your personal documents, including the product plan (`.gitignore:262`) |
| `notes.txt` | Your own scratch notes (`.gitignore:270`) |
| `frontend/.env.local` | The API address only, no secrets (`bin/generate-env.sh:104-109`; `.gitignore:213`) |
| `.venv/`, `node_modules/` | Installed Python test tools and website libraries |
| `infra/.terraform/` | Terraform's downloaded plugins; the real state is in S3, not here (`.gitignore:166`) |
| `.claude/` | Claude Code's settings, including the deny list (`.gitignore:266`) |
| `.worktrees/tweaks/frontend/vite.3002.config.js` | A second local site on port 3002 for testing a branch (`.git/info/exclude:10`). It exists only in that worktree, not in the main folder's `frontend/`. Its Vite cache sits in a Claude scratchpad folder under `/tmp` (`vite.3002.config.js:7`) |
| `/tmp/e2e-XXXXXX.log` (6 random characters) | One full log per `tools/e2e.sh` run (`tools/e2e.sh:257`), named on its last lines as `Full output:` (`:308`). Gone when the VDI restarts |

---

## B. Where the data lives

### B1. The database

All business data (people, projects, bookings, time, requests, the audit trail) lives in
PostgreSQL and nowhere else. The API keeps nothing in memory between requests except one
database connection per warm Lambda (`function.py:26-27`), and writes no files (a grep for
`open(`, `write_text`, `tempfile` and `/tmp` in the API code found none).

| | Local (your VDI) | AWS |
| --- | --- | --- |
| What | PostgreSQL 18.6, installed on the VDI itself (`select version()`) | Aurora PostgreSQL 17.7, Serverless v2 (`infra/rds.tf:11-13, 39`) |
| Database name | `postgres`, the shared one (`infra/locals.tf:106-107`) | `codingworkshop`: the project name `coding-workshop` without its dash (`infra/rds.tf:16`, `infra/variable.tf:4`) |
| Where the files are | `/var/lib/postgresql/18/main` (`show data_directory`) | Managed by AWS, encrypted at rest (`infra/rds.tf:20`) |
| How the API reaches it | The Docker bridge address `172.17.0.1`, port 5432 (`infra/locals.tf:104-105`) | Lambda settings built from the cluster's address; the connection is encrypted (`sslmode=require`, `store/postgres.py:62-63`) |
| Sleeps when idle? | No | Yes (`min_capacity = 0.0`, `infra/rds.tf:27`): the first request after a pause takes about 15 s (CLAUDE.md §7) |
| Backups | None | Automatic, kept 7 days (`infra/rds.tf:17-18`). No last copy on `terraform destroy` (`skip_final_snapshot`, `infra/rds.tf:19`) |
| Who sets up the tables | The Lambda, on its first cold start: `function.py:45-55` runs `store/migrate.py` under a lock | The same |

**The test databases are separate.** `tracker_test` is rebuilt at the start of each run and stays
afterwards (`tests/backend/conftest.py:3, 37-38`). The other four (`tracker_migrate_test`,
`tracker_function_test`, `tracker_commit_test`, `tracker_claim_test`) are made and dropped by their
tests (for example `tests/backend/test_migrate.py:11, 20`). Their names are fixed in the test code,
so a test can never touch the app's data (`tests/backend/pg.py:3-4, 13`). The local server also
holds a leftover `tracker_pm_test` from an old branch: `select datname from pg_database` listed it,
and no test code names it now (`grep -rhoE 'tracker_[a-z_]*test' tests/ tools/` found only the five).

#### Every table

Twelve tables: our eleven plus `schema_migrations` (`select relname from pg_stat_user_tables` on the
local database listed exactly these).

| Table | What it holds | Made by | Can a row be removed? |
| --- | --- | --- | --- |
| `users` | Every person: username, name, email, job title, role, line manager, yearly salary in cents, weekly hours, overtime on/off, task limit, the password **hash** | `001_init.sql:7`; `task_limit` from `002_task_limit.sql:3`; `password_changed_at` from `005_sessions.sql:3` | No. Archived instead |
| `projects` | Name, description, manager, start and end date, budget in cents, status | `001_init.sql:39` | No. Archived |
| `assignments` | "Resources" on screen: one person booked on one project for N hours a week over some dates. Two live bookings for the same person and project may not overlap | `001_init.sql:63`; the overlap rule at `:78-80` | No. Archived |
| `milestones` | "Deliverables" on screen: name, dates, the manager's sign-off. Status is worked out, not stored | `001_init.sql:87` | No. Archived |
| `milestone_dependencies` | "A waits for B", both in the same project | `001_init.sql:111` | No. Archived |
| `tasks` | Work under a deliverable: title, who has it, To Do / In Progress / Done, estimate in minutes | `001_init.sql:129` | No. Archived |
| `time_entries` | Logged time: day, minutes, note, the hourly rate frozen when logged, Pending / Approved / Rejected, who decided, the "over capacity" mark | `001_init.sql:158`; `over_capacity` from `004_over_capacity.sql:3` | No. Its status moves instead |
| `project_requests` | Every kind of request (new project, archive a project, task limit, overtime, other), the decision and who made it | `001_init.sql:185`; `kind`, `project_id`, `task_limit` from `003_request_kinds.sql:3-6` | No |
| `audit_log` | One row per successful change: who, their role then, what, before and after (as JSON), when | `001_init.sql:209` | No, and it can't be edited either |
| `notifications` | One row per person told about a change; read or unread | `001_init.sql:227` | No. Marked read |
| `refresh_tokens` | Only a SHA-256 fingerprint of each refresh token, its expiry, when it was revoked, what replaced it | `005_sessions.sql:6` | No. Nothing cleans it up, so it only grows |
| `schema_migrations` | Which migration files have run, each with its own SHA-256 | `store/migrate.py` itself | (no rule) |

Postgres itself refuses `DELETE` on all eleven of our tables, through the trigger function
`refuse_change` (`001_init.sql:240-255`, `005_sessions.sql:20`), and refuses `UPDATE` on
`audit_log` (`001_init.sql:255`). "Remove" on screen means archive: a flag plus a date, which the
database forces to agree (for example `001_init.sql:34`). The full design is in
`docs/superpowers/specs/2026-10-13-database-design.md`.

**How money and time are stored:** money is whole cents in `BIGINT` columns
(`001_init.sql:16, 46, 166`). `domain/money.py` holds the formulas (`domain/money.py:28-40`); the
dashboard repeats them in SQL so Postgres can add them up (`services/dashboard.py:55-65`), and works
out remaining and percent at `services/dashboard.py:77-79`. Time worked is whole minutes; bookings
are whole hours a week (1 to 40).
"Today" and weeks are Eastern time, although the servers run in UTC (`domain/clock.py:1-19`).
The website does no money arithmetic.

**What a database leak would and wouldn't give away:**

- **No passwords.** Only `pbkdf2_sha256$600000$salt$hash`, with a random salt per person (`services/passwords.py:17, 26-31`).
- **No usable refresh tokens.** Only their SHA-256 (`005_sessions.sql:5`, `services/sessions.py:33-38`).
- **No access tokens.** They are never stored; each carries only a user number and two times, no role (`services/tokens.py:20, 49`).
- **Salaries, yes.** In `users.annual_salary_cents`, and in the audit log's before/after for user changes, which only admins can read (`services/users.py:39-40`).

### B2. The browser

A search of `frontend/src` for `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`,
`serviceWorker` and `caches.` found only these four keys.

| Kind of storage | Key | What it holds | Where in the code | How long it lasts |
| --- | --- | --- | --- | --- |
| `sessionStorage` | `acme.token` | The access token (15 minutes) | `frontend/src/auth/AuthContext.jsx:8, 12-27` | Until the tab closes (`AuthContext.jsx:43`); the token itself dies after 15 min (`services/tokens.py:20`) |
| `sessionStorage` | `acme.refresh` | The refresh token, swapped for a new one each time it is used | `AuthContext.jsx:9, 12-27` | Until the tab closes; the server ends it 8 hours after sign-in (`services/sessions.py:30`) |
| `localStorage` | `acme.colorMode` | `light` or `dark` | `frontend/src/theme/colorMode.js:4, 17, 28` | Until you clear the browser's data |
| `localStorage` | `acme.menuCollapsed` | Whether the side menu is folded | `frontend/src/components/AppLayout.jsx:22, 27, 35` | Until you clear the browser's data |

- **No cookies.** The refresh token travels in the response body. The tokens design explains why it isn't an HttpOnly cookie (`docs/superpowers/specs/2026-10-14-tokens-design.md`, section 2).
- Both tokens are also held in memory (`frontend/src/services/request.js:36-37`), so the page still works if storage is blocked. Every storage read and write is wrapped in try/catch.
- **Passwords you type** live only in the page's memory while you type: the sign-in page's state (`frontend/src/pages/login/LoginPage.jsx:24`) and the change-password page's (`frontend/src/pages/login/ChangePasswordPage.jsx:25`). Nothing stores them: only `AuthContext.jsx`, `colorMode.js` and `AppLayout.jsx` touch browser storage (the search above). The eye that shows them is `frontend/src/components/PasswordField.jsx:15-44`.
- **The clipboard counts too.** "Copy username and password" puts a new person's username and temporary password on your clipboard until you copy something else (`frontend/src/components/PersonActions.jsx:67`).
- Each address has its own storage: `localhost:3000` and the CloudFront site never share it.

### B3. Secrets and settings (where, what kind; never the value)

| Secret or setting | What kind of thing | Where it lives | Who can read it | How long |
| --- | --- | --- | --- | --- |
| Token-signing key (`JWT_SECRET`) | 48 random letters and digits, made once by Terraform (`infra/secrets.tf:6-9`) | Terraform state; the Lambda's settings (`infra/locals.tf:115`) | Anyone who can read the state bucket or the Lambda's settings | Until `terraform destroy`. Changing it signs everyone out |
| AWS database password | Three random words (`random_pet`, `infra/rds.tf:15`) | Terraform state; the Lambda's settings; Aurora | Same | Until destroy |
| First admin's password | 16 random characters, made by Terraform (`infra/secrets.tf:14-17`) | Terraform state; the Lambda's settings (`infra/locals.tf:116`); shown by `terraform -chdir=infra output -raw bootstrap_admin_password` (marked `sensitive`, `infra/output.tf:49-53`) | Same | Used only to create `AD000001` if it doesn't exist (`services/users.py:105-114`); that account must change it at first sign-in |
| Local database password | A throwaway dev password (`infra/locals.tf:108`, `tests/backend/pg.py:22`) | The repo (public) | Anyone | It only opens the VDI's own Postgres |
| Demo people's password | One shared password for every seeded person (`tools/demo.py:27`) | The repo (public): demo, tests and docs | Anyone | See Known gaps, item 1 |
| Participant code | From the workshop email | `~/.bashrc` on the VDI | You | Until the VDI is wiped |
| LocalStack token | From LocalStack | `~/.bashrc` on the VDI | You | Same |
| Temporary AWS credentials | Access key, secret key, session token | `ENVIRONMENT.config` and `~/.aws/credentials` | You | They expire; rerun `./bin/setup-participant.sh` |

- **Terraform state** is kept in an S3 bucket named `coding-workshop-tfstate-` followed by your
  participant ID (`bin/deploy-backend.sh:91`). It holds the three generated secrets above in plain
  text: `sensitive` only hides them on screen. The Lambda's code zip sits in the same bucket
  (`infra/lambda.tf:16-18`).
- **No Secrets Manager.** Every secret reaches the Lambda as an environment variable, read with
  `os.getenv` (`function.py:50, 60`; `store/postgres.py:55-62`).

### B4. Files and logs

| What | Where | Lasts |
| --- | --- | --- |
| The built website | `frontend/dist` locally; on AWS an S3 bucket only CloudFront may read (`infra/s3.tf:34`, `infra/cloudfront.tf:120-146`) | Until the next build or deploy |
| CloudFront's copies of the website files | CloudFront: 1 hour by default, 24 hours at most (`infra/cloudfront.tf:91-93`); the API is never cached (`:63-64`) | Each deploy clears them (`bin/deploy-frontend.sh:162-166`) |
| Screen-tour pictures | `~/tour-shots` (`tools/e2e.sh:157`), outside the repo | Until you delete them |
| README pictures | `docs/screenshots/` (public). Rewritten only by `screenshots.spec.js` with `E2E_SCREENSHOTS=1` | In git |
| Failed browser-test recordings | `frontend/test-results/` (a trace per failed test, `frontend/playwright.config.js:19-20`); the HTML report in `frontend/playwright-report/` | Emptied at the start of every run |
| Backend coverage | `.coverage` at the repo root | Overwritten each run |
| Lambda logs on AWS | CloudWatch, `/aws/lambda/coding-workshop-tracker-` plus your participant ID | 7 days (`infra/lambda.tf:36`) |
| Aurora's own log | CloudWatch (`infra/rds.tf:23`) | No limit set |
| Lambda logs locally | `docker logs localstack-main`, or the command in CLAUDE.md §11 | Until LocalStack is removed |
| Start-up logs | `/tmp/tf-init.log`, `/tmp/backend-deploy.log`, `/tmp/npm-install.log`, `/tmp/proxy-server.log` (`bin/start-dev.sh:382, 414, 437, 471`) | Until the VDI restarts |
| `test-all.sh` logs | A fresh temp folder per run, named on its last line ("Full logs:", `tools/test-all.sh:23`) | Until the VDI restarts |

**What our code writes to the log:** migrations applied, a missing signing key, "database not
ready", an unexpected error with its path, and a reused refresh token with the user's number
(`function.py:54, 62, 68`; `api/app.py:53`; `services/sessions.py:80`). Our code never logs a
password, token or request body on purpose. But an unexpected database error is logged with its
traceback (`api/app.py:52-53`; unlisted constraint violations are re-raised, `store/postgres.py:20-21,
118`), and that can include the failing row's values. Not reproduced.

---

## C. Security, in plain words

**Say it in one breath:** "Every request passes two gates. The first is one route table that says
which roles may ever call each address. The second is in the business rules, and it checks whose
record it is. The role is never taken from the sign-in token: it is read from the database on
every request, so demoting or archiving someone works on their very next click. Passwords are
stored only as slow, salted hashes; sign-ins are 15-minute tokens renewed by a rotating refresh
token; and every change is written to an audit log that Postgres itself refuses to edit or delete."

The request's path through the locks:

1. **Browser to CloudFront** over HTTPS only.
2. **CloudFront to the Lambda.** The Lambda's own address is public, so our code is the lock.
3. **Who are you?** Check the signed token, then load you from the database (`api/app.py:29-33`).
4. **May your role ever do this?** The route table (`api/routes.py:46-127`, checked at `api/app.py:36-37`).
5. **Is this yours?** The service checks, and says 404 (not 403) when it isn't.
6. **The database** takes values only as parameters, and its own rules catch what code misses.
7. **The answer** names each field it sends; salary only for admins and the person.

"Came with the repo" means the workshop template already had it. "Added" means we wrote it.

### Passwords and signing in

| Measure | What it does (plain) | Where | Why | Came with the repo or added |
| --- | --- | --- | --- | --- |
| Slow, salted password hash | The database never holds a password, only a scrambled version that takes about half a second to make, with a different random salt per person (PBKDF2-SHA256, 600,000 rounds) | `services/passwords.py:17, 26-31` | A stolen database can't be cheaply turned back into passwords | Added |
| One answer for every failed sign-in | Wrong username, wrong password and archived account all get the same sentence, and an unknown username still does one full slow hash | `services/users.py:23, 153-170` | Nobody can learn which usernames exist, from the words or from the reply time | Added |
| Constant-time comparison | Checking a password or a token signature takes the same time whatever is wrong | `services/passwords.py:41`, `services/tokens.py:59` | Timing can't leak the answer | Added |
| Generated first password | The server makes a 12-character password from a secure random source and shows it once | `services/passwords.py:46-48`, `services/users.py:135, 148` | No admin chooses or keeps a lasting password for someone | Added |
| Forced change at first sign-in | Until you change it, every address except "who am I" and "change password" answers 403 | `api/app.py:34-35`, `api/routes.py:51-52`, flag `001_init.sql:20` | The password an admin saw can't be used for real work | Added |
| You edit only your name and email | Nobody, not even an admin, can change their own role or salary | `services/users.py:29, 221-241` | No one can promote themselves | Added |
| Admin reset instead of emailed reset | A forgotten password is reset by an admin, with a new forced change | `services/users.py:202-216` | AWS here can't send email (`docs/superpowers/specs/2026-10-14-email-and-sms-findings.md`) | Added |
| The eye on password boxes | Press it to see what you typed; press again to hide. Screen readers hear "Show password" | `frontend/src/components/PasswordField.jsx:15-44` | Fewer typing mistakes. A convenience, not a protection | Added (`e5c984a`) |

### Sign-in tokens and sessions

| Measure | What it does (plain) | Where | Why | Came with the repo or added |
| --- | --- | --- | --- | --- |
| 15-minute access token (a signed JWT) | A signed note: "user number N, issued at T, good for 15 minutes". It holds no role and no name | `services/tokens.py:20, 46-51` | A stolen token is useful for 15 minutes at most | Added |
| Signature first, one error for all | The signature is checked before anything inside is trusted, whatever the token claims about itself; bad, expired and forged tokens get the same 401 | `services/tokens.py:54-66` | A forger learns nothing | Added |
| Signing key from Terraform | One random key for every copy of the Lambda; it refuses to serve (503) if the key is missing or short | `infra/secrets.tf:6-9`, `infra/locals.tf:115`, `function.py:60-63` | A key made "on first run" would differ per copy and sign people out at random | Added |
| Refresh token, stored as a fingerprint | Sign-in also gives a long random refresh token; only its SHA-256 is saved. It dies 8 hours after sign-in | `services/sessions.py:30, 33-47`; `005_sessions.sql:6-19` | A database leak gives nobody a usable token | Added |
| Rotation and reuse alarm | Each refresh swaps the token for a new one. If an old one comes back, someone has a copy: every session of that person ends | `services/sessions.py:57-82` | Catches a stolen token | Added |
| Sessions really end | Sign out revokes the token on the server; a password change, reset or archive ends older sessions | `services/sessions.py:85-89`; `services/users.py:197, 215, 329`; `services/actors.py:59-61` | A thief doesn't keep access after the password changes | Added |

### Who may do what

| Measure | What it does (plain) | Where | Why | Came with the repo or added |
| --- | --- | --- | --- | --- |
| Role read from the database every time | The token says only who you are; your role is looked up fresh on every request | `api/app.py:22-38`, `services/actors.py:46-62` | A demoted or archived person loses power on their next click | Added |
| One route table, one gate | Every address, its method and the roles allowed are one list; only health, sign-in, refresh and sign-out are public | `api/routes.py:46-127` (public ones `:47-50`) | You can check all access by reading one file | Added |
| 404, not 403, for other people's things | A project that exists but isn't yours gets word for word the same answer as one that doesn't exist | `services/access.py:16-49` | Nobody can probe which records exist | Added |
| Search can't see more than you can | Your visibility rule is part of the same database query as the search | `services/projects.py:93-111`, `services/requests.py:99-118` | Search isn't a side door | Added |
| Allowed fields only | Each edit lists the fields it accepts; anything else is refused by name | `domain/values.py:143-147` | Nobody slips `role` or `salary` into an edit | Added |
| Salary stays private | Salary is sent only to admins and the person; history's before/after only to admins; the bell's text is a one-line summary | `services/views.py:30-35`; `services/audit.py:20-21` | Managers never see pay | Added |
| Nobody approves their own time | The database itself refuses it | `001_init.sql:179` | Honest cost figures | Added |
| The website hides what you can't use | Menus and pages a role can't use are hidden, but the server checks again | `frontend/src/auth/RequireRole.jsx:7-12`, `frontend/src/services/personAccess.js:1-5` | Tidy screens. Not the security itself | Added |

### Data and the database

| Measure | What it does (plain) | Where | Why | Came with the repo or added |
| --- | --- | --- | --- | --- |
| Values never pasted into SQL | Values travel separately from the SQL text; names that vary are built safely | `store/postgres.py:75-96` | Stops SQL injection. Bandit found 0 issues | Added |
| Input checks | Text trimmed and length-capped, numbers must be real numbers, dates `YYYY-MM-DD`, the body must be a JSON object | `domain/values.py:39-140`, `api/http.py:60-89` | Refuse rather than guess | Added |
| Page size capped | At most 100 rows a page, whatever is asked | `services/paging.py:12` | No giant queries | Added |
| Plain errors, no internals | Every error is `{ "error": "..." }`; a real bug says only "Something went wrong on our side. Nothing was changed." and the details go to the log | `api/errors.py:18-45`, `api/app.py:50-54` | Attackers learn nothing about the inside | Added |
| No secrets logged on purpose | Only the messages listed at the end of B4; an unexpected database error's traceback can still carry the failing row | `function.py:54, 62, 68`; `api/app.py:52-53`; `services/sessions.py:80` | Logs are kept 7 days | Added |
| The database's own rules | Allowed values, foreign keys, and a rule that no two live bookings of one person on one project overlap | `001_init.sql:27-34, 78-80, 174-179` | A last line of defence, even under parallel requests | Added |
| Nothing can be deleted | No DELETE address, and a Postgres trigger refuses DELETE on every table | `001_init.sql:240-255`, `005_sessions.sql:20` | Nothing is lost by mistake or on purpose | Added |
| An audit log nobody can edit | Every change writes an audit row in the same transaction; Postgres refuses to edit or delete those rows | `services/audit.py:37-66`, `001_init.sql:255` | "Who did what, when" always has an answer | Added |
| Five integrity checks | Five questions that must always find nothing, run after every database test and at `GET /admin/integrity-check` | `store/integrity.py:10-79` | Catches quiet damage, including a change that forgot its audit row | Added |
| Tamper-evident migrations | Each applied migration's SHA-256 is recorded; an edited one stops the Lambda. A lock stops two cold starts migrating at once | `store/migrate.py:50-73` | The database shape can't drift quietly | Added |
| Row locks | Two requests can't both slip under a limit (capacity, task limit, taking a task) | `services/time_entries.py:71` (capacity), `services/tasks.py:156` (task limit), `services/tasks.py:53` (taking a task) | Correct even with many Lambdas at once | Added |

### The network and AWS

| Measure | What it does (plain) | Where | Why | Came with the repo or added |
| --- | --- | --- | --- | --- |
| HTTPS only | CloudFront turns plain HTTP into HTTPS, and talks to the Lambda over HTTPS (TLS 1.2) | `infra/cloudfront.tf:36-37, 61, 96` | Nobody can read or change traffic on the way | Came with the repo |
| Private website bucket | Only this CloudFront may read the website files | `infra/cloudfront.tf:1-7, 120-146`; `infra/s3.tf:32-37` | Nobody reads the bucket directly | Came with the repo |
| Database encrypted, not public | Aurora's storage is encrypted, and it has no public address | `infra/rds.tf:20` (no `publicly_accessible` set) | Nobody on the internet can connect to it | Came with the repo |
| Encrypted database connection | On AWS the API connects with `sslmode=require` | `store/postgres.py:62-63` | Traffic between the Lambda and Aurora is encrypted | Added |
| Logs kept 7 days; failed-call queue encrypted | CloudWatch drops Lambda logs after 7 days; the dead-letter queue is encrypted | `infra/lambda.tf:36, 63-70` | Tidy and bounded | Came with the repo |
| Local proxy passes named headers only | The local stand-in for CloudFront forwards a short list of headers | `bin/proxy-server.js:101-109` | Keeps the local path as narrow as AWS | Came with the repo; we added the `authorization` and `content-length` lines |

### Checks and guardrails

| Measure | What it does (plain) | Where | Why | Came with the repo or added |
| --- | --- | --- | --- | --- |
| Bandit on every push | Scans the Python for known unsafe patterns | `.github/workflows/python.actions.yml:26-27` | Unsafe code can't slip in quietly | Came with the repo |
| npm audit on every push | Fails if a website library has a known high-severity hole | `.github/workflows/react.actions.yml:26-27` | Supply-chain check | Came with the repo |
| Checkov on Terraform | Reports risky cloud settings (reports only, never blocks) | `.github/workflows/terraform.actions.yml:23` | Awareness | Came with the repo |
| Secrets kept out of git | `.gitignore` drops env files, credentials, Terraform state, your private folder and notes | `.gitignore:126, 167, 178, 212-215, 255` (template); `:262, 266, 270` (ours) | Credentials stay on the VDI | Both |
| Claude can't push or deploy | Claude may edit, test and commit. The deny list blocks the usual spellings of push, deploy, cleanup and `terraform apply`/`destroy`; other spellings (`bin/...` without `./`, `bash ...`, `terraform -chdir=... apply`) aren't on it (Known gaps, item 17) | `.claude/settings.local.json` (not in git) | A person, not Claude, should press the button that changes AWS or publishes code | Added |

### Known gaps (said plainly)

1. **The demo people share one password that is written in public files** (`tools/demo.py:27`, also in the tests and docs). Confirmed 14 Oct night: the `--aws` browser runs signed in as Maria and Ana with the public password (`docs/TESTING.md:1102-1103`; `frontend/e2e/demo.spec.js:32`, `frontend/e2e/history.spec.js:11`), and the live usernames are in `tools/e2e.sh:48-50`. So anyone who has read the repo can sign in to the live site as a seeded manager. To close it: on the live site, People, Actions, reset each seeded person's password. That also stops the `./tools/e2e.sh --aws` browser tests working, so decide before the demo which matters more, or say it is demo data.
2. **No rate limit or lockout.** Only the slow hash slows password guessing (about 1.1 s per warm sign-in on AWS, measured 13 Oct). A password you choose needs only 8 characters (`services/users.py:181`).
3. **Tokens live in `sessionStorage`, not in an HttpOnly cookie** (`frontend/src/auth/AuthContext.jsx:8-9`). A script injected into the page could copy them. Mitigations: React escapes what it shows, `frontend/src/` has no `dangerouslySetInnerHTML`, and a copied refresh token used twice ends both sessions.
4. **The Lambda's own address is public, takes any origin, and has no AWS-level check** (`infra/lambda.tf:41, 48`). Anyone can call it without going through CloudFront, so our code is the only lock. There is no firewall (WAF) in front.
5. **No browser security headers** (no HSTS or content-security policy) on CloudFront or in `frontend/index.html`.
6. **A stolen access token works for up to 15 minutes**, and one token can't be cancelled alone (a password change ends them all).
7. **Secrets sit in Terraform state and the Lambda's settings, not Secrets Manager**, and the AWS database password is three random words (`infra/rds.tf:15`).
8. **Changing your own email needs no current password** (`services/users.py:221-232`). Harmless while nothing is emailed.
9. **Managers see every employee's bookings on the allocation grid**, including project names and hours on other managers' projects (`services/dashboard.py:193-261`). That is how question 5 works; salary is never shown, and opening another manager's project is still a 404.
10. **"That email is already in use"** (`store/postgres.py:24`) lets a signed-in person test whether an address is in the system.
11. **Not checked from outside:** that the S3 bucket blocks public access, that Aurora refuses outside connections, and that `sslmode=require` is in effect.
12. **Older copies of the project plan are in the public repo's history** (committed before `private/` was ignored; `.gitignore:260-261`). Ignoring a folder doesn't remove old history.
13. **Local Postgres trusts every connection** (`bin/start-dev.sh:94, 97`). Fine on a private VDI, wrong anywhere else.
14. **`refresh_tokens` only grows**: rows can't be deleted and nothing prunes them.
15. **The cleanup script's backup zips the whole folder**, including `ENVIRONMENT.config`, `private/` and `notes.txt`, into the state bucket (`bin/cleanup-environment.sh:58-59`). Run it only on purpose.
16. **No lockfile in git** (`.gitignore:204`), so CI installs fresh versions each run; and Checkov never blocks (`soft_fail: true`).
17. **Claude's deny list matches command spellings, not intent.** Its rules are prefixes such as `./bin/deploy-backend.sh`, `../bin/deploy-backend.sh`, `terraform apply` and `git push` (`.claude/settings.local.json`). `bin/deploy-backend.sh` without `./`, `bash ./bin/deploy-frontend.sh`, a full path, or `terraform -chdir=infra apply` aren't on it. Read from the patterns, not tested (REPOINFO section 14 already notes `bash -c` was never tested).

**Checked for this page:** the line numbers above were opened and read on 15 Oct;
`bandit -r ./backend` printed "No issues identified"; `pytest tests/backend/test_security.py`
printed 23 passed; `npm audit --audit-level=high` printed 0 vulnerabilities; `git check-ignore -v`
confirmed the ignored files. **Not checked:** anything on live AWS (no calls were made), and the
contents of `~/.bashrc`, `ENVIRONMENT.config`, `private/` and `notes.txt` (never opened).
