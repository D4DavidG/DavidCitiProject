# Decisions

For anyone who asks "why is it built this way?": every decision David made while building
the ACME Project Tracker, the reason, what was turned down, and where it lives in the code.
Back to the [main README](../README.md) · [docs index](README.md).

**Code comments that say "spec 6.4" refer to these numbers.** The design write-ups these
decisions came from were taken out of the working tree on 15 Oct and live on in git history
([last section](#14-original-write-ups-in-git-history)). Code comments still cite their
section numbers, so the numbers are kept here as labels:

| A code comment says | It means | Find it in |
| --- | --- | --- |
| `spec 6.2`, `spec 5a`, `redesign spec section 6`, `redesign-design.md, section 3` | the website redesign | section 9, labels **§1** to **§6.4** |
| `spec section 4` (`001_init.sql`, `tests/backend/test_schema.py`), `spec section 6` (`tests/backend/conftest.py`) | the database design | section 4, **Database spec §4** and **§6** |
| `spec section 5` (`chartColours.test.js`), `dashboard-graphs-design.md, section 5` (`charts/timeline.js`) | the charts | section 8, **Graphs spec §5** |
| `Design: docs/superpowers/specs/…` at the top of a migration | the write-up behind that migration | section 14 (migrations are never edited, so those paths stay) |

**Reading the tables:** *Decided*, then *Why* (the reason or the evidence), then *Turned
down* (and why), then *Where*. Backend paths are under `backend/tracker/` and website paths
under `frontend/src/` unless written in full. "Post-demo" marks what David asked for after
the 15 Oct demo.

**Contents:** [1 Product and scope](#1-product-framing-and-scope) ·
[2 Accounts, sign-in, tokens](#2-accounts-sign-in-and-tokens) ·
[3 Roles and access](#3-roles-and-access) ·
[4 Data and money](#4-data-model-and-money-database-spec-2-4-6) ·
[5 Audit and notifications](#5-audit-log-and-notifications) ·
[6 Overtime, capacity, requests](#6-overtime-capacity-and-requests) ·
[7 Tasks and the pull board](#7-tasks-and-the-pull-board) ·
[8 Dashboard, charts, allocation, schedule](#8-dashboard-charts-allocation-and-schedule) ·
[9 Website design](#9-website-design-redesign-spec-16) ·
[10 Performance](#10-performance) · [11 Testing](#11-testing) ·
[12 Deployment and AWS](#12-deployment-and-aws) ·
[13 Documentation and the repo](#13-documentation-and-the-repo) ·
[14 Original write-ups](#14-original-write-ups-in-git-history)

---

## 1. Product framing and scope

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Portfolio and resource management** (like Float, Harvest Forecast, Smartsheet RM), not task tracking. Screen order: dashboard, then allocation grid, then a task board last | ACME's seven questions cut across projects (status, risk, people, budget). Tasks exist only to make deliverable progress measurable | A Jira or Trello clone | `services/dashboard.py`; [REQUIREMENTS.md](REQUIREMENTS.md) |
| **The workshop email outranks the plan,** and screens use the brief's words: "Deliverables" (table `milestones`), "Resources" (bookings, table `assignments`); people stay "People" | Evaluators tick items off without translating | Internal names on screen | [REQUIREMENTS.md](REQUIREMENTS.md) |
| **Logged time, not payroll** (13 Oct): time logged on tasks (date, minutes, note), as in Jira and OpenProject | Clock in/out, pay periods, overtime review and overtime premiums are HR features (Workday's job); none of Jira, GitHub Projects, OpenProject, Float, Asana or Tempo has them | Workday-style timekeeping (in the first database design, removed in its third revision) | `time_entries` in `store/migrations/001_init.sql` |
| **Archive and reactivate, never DELETE:** `POST /{thing}/{id}/archive` and `/reactivate` | Deleting a project would wipe the logged hours behind its costs, so past spend could not be rebuilt | The rubric's DELETE answering 204. Still open: ask an evaluator whether archive counts as the D in CRUD | `no_delete` triggers in `001_init.sql`; `tests/backend/test_no_delete.py`; a test asserts no DELETE route exists |
| **PATCH with partial bodies;** the server refuses fields the caller's role may not change | A manager may change only some fields of a project | Whole-record PUT | `only_allowed` in `domain/values.py` |
| **Everything in the MVP ships;** nothing pre-cut, evenings absorb the overrun | David's call, 13 Oct | Cutting scope up front | [REQUIREMENTS.md](REQUIREMENTS.md) |
| **Out of scope on purpose:** installable or offline app (PWA), AI features, background jobs, email notifications, file attachments, drag-and-drop Gantt editing, several organisations | The brief names none of them. Every write finishes in one transaction in about 6 ms, so nothing needs a queue | | |
| **Two ideas from David's phone notes dropped (13 Oct):** an `/admin/capacity-check` that must return zero; "no time entries, derive spend from elapsed weeks" | The first contradicts the over-allocation rule (allowed and flagged, section 4). Spend stays real, approved time | | |
| **No FastAPI, no MongoDB** | The JUMP pre-training checklist mentions them, but it is generic bootcamp material; the workshop email says Python and PostgreSQL, and the repo's Lambda is a plain `handler(event, context)` | FastAPI, MongoDB (installed on the VDI, unused) | `backend/tracker/function.py` |
| **Stack fixed by the brief:** React with react-responsive and Material UI, Python, PostgreSQL, AWS (Lambda, Aurora, S3, CloudFront) through the repo's Terraform. **Vite** for the website | Vite: David's choice; reloads on save, builds in seconds, and Vitest reuses its config | | `frontend/vite.config.js`, `infra/` |
| **Dark mode:** first left out of the MVP, then built in the redesign | David asked for it on 14 Oct night | | §1 in section 9 |

## 2. Accounts, sign-in and tokens

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **An admin creates every account.** The server makes the username: two initials and six digits (`DG482913`, accents stripped, `X` when a name has no plain letter, a new number on a clash). **Usernames never change** | Audit rows and history point at a stable name; AWS can't email anyone (below) | Self sign-up; signing in by email (email is contact information only) | `services/users.py` |
| **A generated 12-character password** (`secrets`), shown once, only its hash stored; **changed at first sign-in** (until then every route but change-password and "who am I" answers 403). A new password has 8+ characters and differs from the old one | The admin saw the first password | `random` (bandit B311) | `api/app.py`, `api/routes.py` |
| **Self-edit is name and email only.** Admins edit everything but username and id, and never their own role or salary | Nobody can raise their own privileges | | `services/users.py` |
| **Forgotten password: an admin reset** (new password shown once, forced change) | AWS can't send email or texts. The Lambda runs on the organisers' role, which has no `ses:` permission, inside a private network (VPC) with no NAT gateway and no email or SNS endpoint, and our role can't create either. Claude did not edit the organisers' role without asking | Email from the Lambda (blocked); an in-app "Outbox" (the person who forgot can't read it); a `mailto:` button; a second mailer Lambda outside the VPC (untested, an organisation policy may block it); LocalStack's fake email (local only); texts (also sandboxed, and US numbers need registration) | `infra/lambda.tf` (role, subnets) |
| **Rules for any future emailed reset:** a single-use, expiring code or link, never the password; only its hash stored; the same answer and timing whether the account exists; a rate limit counted in Postgres; audit rows; old sessions ended; the current password before an email change | A mailbox can be read by others; Lambda instances share no memory, so limits must live in the database | | not built |
| **Passwords: PBKDF2-HMAC-SHA256, 600,000 rounds** (OWASP 2023), a random 16-byte salt, a constant-time compare. **An unknown username does the same hashing** as a wrong password | A stolen database reveals no passwords. Before 14 Oct the dummy hash used 1,000 rounds, so a fast "no" told an attacker which usernames exist. The test counts hashing work, not the clock, so it isn't flaky | | `services/passwords.py`; `login` in `services/users.py` |
| **Lambda memory 512 MB** | Login is CPU-bound and Lambda gives CPU in proportion to memory. 128 MB was estimated at about 2 s a login; AWS measured 1.15 s per warm login at 512 MB (the estimate was 0.5 s). 1024 MB would roughly halve it | 128 MB | `memory_size` in `infra/lambda.tf` |
| **Access token: a 15-minute HS256 JWT** (standard library only) carrying only the user id and issue time; its key is a Terraform `random_password` | A stolen token works for 15 minutes at most (an evaluator's question; the rubric lists "token expiration and refresh"). A key "generated on first run" would differ per Lambda instance and cause random 401s | The first 8-hour token | `services/tokens.py`, `infra/secrets.tf` |
| **Refresh tokens** (migration 005): 32 random bytes, only the SHA-256 stored, **rotated on every use**, **8 hours after login at most** (fixed, copied to each rotated token) | People stay signed in for a working day; a database leak gives nobody a usable token | Sliding expiry (a stolen token in regular use would never die) | `services/sessions.py`, `005_sessions.sql` |
| **Reusing a rotated refresh token ends every session of that user.** A token ended any other way (sign out, password change) is only refused | Someone holds a copy, so signing out everywhere is the safe answer. Refusing only keeps a second tab with a pre-change token from signing out the tab that changed the password | Tracking token "families" (more columns, for a case where everywhere is right) | `rotate` in `services/sessions.py` |
| **Refresh token in the response body and `sessionStorage`,** not a cookie | Locally the page (:3000) and the proxy (:3001) are different origins and the proxy answers `Access-Control-Allow-Origin: *`, which browsers never combine with cookies; Function URL cookies need new code LocalStack would have to prove; the access token sits in `sessionStorage` anyway | An HttpOnly, Secure, SameSite cookie: stronger against injected script. Cost accepted: an XSS bug could copy the token; React escapes all output, there is no `dangerouslySetInnerHTML`, and rotation signs both holders out on first overlap | `services/request.js`, `auth/AuthContext.jsx` |
| **A password change, admin reset or archive ends older sessions:** `users.password_changed_at`, and access tokens issued before it are refused. Your own change answers with a fresh session | A thief loses access when the password changes; your own tab stays signed in honestly | A per-user `token_version` counter (same effect; the timestamp also says when) | `services/actors.py`, `services/users.py` |
| **Sessions are not audited** (login, refresh, logout); reuse is logged as a warning with the user id, never the token | A refresh every 15 minutes would flood the audit log and every admin's bell | Auditing sessions | `services/sessions.py` |
| **`/auth/refresh` and `/auth/logout` need no Bearer token; logout answers 204 even for an unknown token** | The access token has usually just expired when refresh is called. A 401 on logout would say which tokens exist, and a double click would sign out other tabs | | `api/routes.py` |
| **Signed in per browser tab** (`sessionStorage`) | Closing the tab signs you out, safer on shared machines | `localStorage` (stays signed in across tabs) | `auth/AuthContext.jsx` |
| **The website refreshes once and retries once,** one refresh shared by every waiting call; **only an answer from `/auth/refresh` that says the token is dead signs you out** | Ten polling calls make one refresh; a network blip or a waking database (5xx) no longer signs anyone out | | `services/request.js` |
| **Known gaps, accepted and said out loud:** changing your own email needs no current password; no rate limit on login; one access token can't be revoked alone (it dies within 15 minutes); a duplicated tab copies the refresh token, and whichever copy refreshes second signs both out | Each is harmless at workshop scale or until an emailed reset exists | | `update_self` in `services/users.py` |

## 3. Roles and access

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Three roles, an org chart:** `users.manager_id` is the line manager. Any manager staffs anyone onto projects they manage; employees never choose projects | Decided on 13 Oct (option (a) of the plan's manager models) | | `001_init.sql` (`users`) |
| **Two gates.** The route table answers 403 when a role may never do something; the services check ownership. One route table, one `authorise()` | One place to read who may call what | Checks scattered through handlers | `api/routes.py`, `api/app.py`, `services/access.py` |
| **The role is re-read from the database on every request,** never taken from the token | A demotion or an archive takes effect on the next request | Trusting the token's claim | `authorise` in `api/app.py`; `services/actors.py` |
| **404, never 403, for something that exists but isn't yours,** with byte-identical messages | Nobody can probe which ids exist | 403 | `services/access.py` |
| **Who sees projects:** admins all (archived too), managers the ones they manage, employees the live ones they are booked on. Managers and admins have no tasks or hours and are never booked. A project's name is admin-only. Manager chains can't loop | Least access that still answers each role's questions | | `services/access.py` |
| **Time is approved by the line manager or any admin; nobody approves their own** | A second person checks every cost | | `time_entries_not_own_approval` CHECK in `001_init.sql` |
| **Archiving a person** also archives their live bookings; archiving a manager who still runs live projects or has live reports is refused (409) | Nothing live may hang off an archived record | | `services/users.py` |
| **Post-demo: archiving someone still on a live project warns first.** A booking ending today or later, or an open task, shows a red warning listing the projects and "Archive anyway"; the API answers 409 `code: "ON_PROJECTS"` unless the body has `confirmOnProjects: true`. New route `GET /users/{id}/projects` (admins, the line manager, the person; others 404) | David asked for "a flag warning", not a refusal. Same ask-first pattern as overtime (section 6) | A silent archive; refusing outright | `services/users.py`, `components/ArchivePersonDialog.jsx` |
| **Employee history:** `GET /users/{id}/history`, the rows a person made plus the rows about their account. Admins read anyone; a manager reads only direct reports; a person reads their own; anyone else gets 404 | A person can see who reset their password or changed their capacity; history names projects a manager may not see, so only direct reports | Staff only; any manager | `person_history` in `services/audit.py` |
| **Before/after state in history for admins only;** for everyone else the keys are absent | User snapshots carry salary on purpose, so dropping the whole state is one rule a test can prove; a salary never reaches a manager | Stripping salary out of snapshots (any later salary-derived field would leak silently); showing state to the person themself | `audit_view` in `services/views.py`; `test_history_never_shows_salary_to_a_manager` |
| History: rows about the person mean their account only; the server joins the actor's name; no new index; a dialog from People (Actions menu) and "My history" on Account | Their own work already appears as rows they made; employees can't call `GET /users`; a scan of thousands of rows takes milliseconds | Joins over every table; names looked up in the browser; a profile page per person | `components/HistoryPanel.jsx` |

The full who-can-do-what table is in [REQUIREMENTS.md](REQUIREMENTS.md).

## 4. Data model and money (database spec §2, §4, §6)

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Postgres only.** Tests use their own databases (`tracker_test` and two others), each test rolled back, never the app's `postgres` database | Lambda instances share no memory and are wiped when recycled; local Postgres has one shared database | An in-memory store | `store/postgres.py`, `tests/backend/conftest.py` |
| **SQL by hand with psycopg 3, no ORM.** Values are always parameters; table and column names that vary are composed with `psycopg.sql` | Every query is visible and explainable; bandit's B608 stays clean | An ORM; f-string SQL | `store/postgres.py` |
| **`TEXT` + named `CHECK`, not `ENUM`** | Postgres has no `CREATE TYPE … IF NOT EXISTS`, and changing an enum needs `ALTER TYPE`. A named CHECK is as strict, and its name maps to a friendly message | `ENUM` | `001_init.sql`; constraint names in `store/postgres.py` |
| **Numbered migrations with a sha256 each, applied on cold start in one transaction under `pg_advisory_xact_lock`** (10 s lock timeout). Never edit one that has run: fix forward | Aurora isn't reachable from outside, so the schema is applied from inside the Lambda; two cold starts must not both migrate | Applying SQL by hand | `store/migrate.py`, `store/migrations/` |
| **The first admin, `AD000001`, is created inside that locked transaction** from a Terraform-generated password, and must change it | No hand-made accounts; the secret never sits in the repo | | `store/migrate.py`, `infra/secrets.tf` |
| **Connections use `autocommit=True`, and every multi-statement write runs in `atomic()`** | With psycopg's default, the first statement opens a hidden transaction and every later block is only a savepoint, so nothing ever commits (reproduced 13 Oct: 0 rows seen from a second connection) | psycopg's default | `store/postgres.py`; `tests/backend/test_store_commits.py` |
| **The schema runs on Postgres 17 (Aurora 17.7) and 18 (local)** | No 18-only features | | `infra/rds.tf` |
| **One connection per warm Lambda;** connection failures become 503, constraint violations become domain errors looked up by constraint name; no psycopg error escapes the store | One translation point | | `store/postgres.py`, `domain/errors.py` |
| **Money is integer cents** (`BIGINT *_cents`). `domain/money.py` holds the formulas; the API refuses `12.5` for a cents field; the website types dollars and only `services/format.js` converts | Floats can't hold 0.1 exactly | Floats, decimals in the browser | `domain/money.py`, `frontend/src/services/format.js` |
| **The dashboard repeats the money formulas in one SQL aggregate,** with the same rounding; a test pins the two together | One query for every project, not a loop per project | A row-by-row loop | `services/dashboard.py` |
| **Hourly rate = annual salary ÷ 2,080** (40 h × 52 weeks), whole cents, **frozen on each time entry** | A later raise never rewrites past costs | Computing cost from today's salary | `hourly_rate_cents` in `001_init.sql`; `services/time_entries.py` |
| **Spent = approved entries only:** minutes × frozen rate ÷ 60, rounded down per entry. **Planned = live bookings:** hours a week × days ÷ 7 × today's rate, rounded once per booking | Only checked time costs money; planned cost is a forecast, so it isn't frozen | | `domain/money.py` |
| **At risk** when any of four holds, each named on screen: past the end date and not complete; a deliverable overdue; a deliverable more than 15 points behind its share of elapsed time; spend more than 15 points ahead of the schedule | One function serves every screen, so they never disagree | | `_risk_reasons` in `services/dashboard.py` |
| **A deliverable's status is computed, not typed:** Done (signed off), Blocked (a live dependency not done), In progress (a task started), Not started. Progress = done task estimates ÷ all live estimates. Sign-off is refused until every task and dependency is done; reopening or adding a task clears it | The status can't drift from the work | A status field people set | `services/milestones.py` |
| **Dependencies stay inside one project** (composite foreign keys); loops are refused; removing one archives the link | A chain across projects has no owner | | `001_init.sql`, `services/milestones.py` |
| **Over-allocation is allowed and flagged,** not refused (question 5). A booking is 1 to 40 h a week; one person can't hold two overlapping live bookings **on the same project** (an exclusion constraint, `btree_gist`); across projects is allowed, and that is the over-allocation | Managers must see overbooking to fix it; refusing it would hide it | Refusing bookings past capacity | `001_init.sql`; `services/assignments.py` |
| **Weeks run Monday to Sunday; "today" is Eastern time** from one constant | The Lambda and Aurora clocks are UTC | | `domain/clock.py` |
| **camelCase in JSON, snake_case in Python and Postgres,** converted only in `api/http.py` and `services/views.py`; each record is serialised field by field | `password_hash` can never leak through a dumped model | Dumping models | `api/http.py`, `services/views.py` |
| **One answer shape each:** lists `{items, page, pageSize, total, totalPages}` (at most 100 a page; lists inside one project come whole in the same envelope); writes return the new record; errors `{error, field?, code?}` from one exception-to-status table | The website handles every list and error one way | | `services/paging.py`, `api/errors.py` |
| **Search is `ILIKE`** with values as parameters | Small tables; `pg_trgm` is the answer at scale | | `services/` |
| **Known disclosure, accepted:** a manager who books one person can work out that person's rate from the planned cost | Said out loud rather than hidden | | |
| **Post-demo: minimum pay $20 an hour = $41,600 a year** (salary ÷ 2,080 = 4,160,000 cents). Salary is now required on every new account; creating anyone or changing a salary below the floor answers 400, `field: "annualSalaryCents"`. Older lower salaries stay until changed; the first admin has none | David's rule. The floor sits on the salary because the rate is derived from it | | `MIN_ANNUAL_SALARY_CENTS` in `domain/money.py`; `services/users.py` |

### Database spec §4: the schema, and what the database refuses

The schema itself is `backend/tracker/store/migrations/001_init.sql` (never edited; later
changes are migrations 002 to 005). What it refuses, against what the services refuse:

- **The database** refuses anything one row, a foreign key or an exclusion constraint can
  check: a malformed username or a negative budget; overlapping bookings on one project; a
  dependency across projects; a task on another project's deliverable, or time on another
  project's task; a task marked done without its timestamp; approving your own time; any
  `DELETE`; any edit of an audit row. One test per named constraint:
  `tests/backend/test_schema.py`.
- **The services** refuse what needs other rows, the clock or the caller: who may do what
  (only the assignee logs time or moves a task); the assignee must be booked; an entry dated
  inside a booking and not in the future; 24 hours a day per person; capacity (with
  `SELECT … FOR UPDATE` on the person's row, so two entries sent at once can't both slip
  under the limit); sign-off rules; dependency and manager-chain loops; archive and
  reactivate cascades.
- So "every rule is enforced twice" is wrong: booking hours, date order and "can't depend on
  itself" are in both; overlap and self-approval only in the database; capacity, sign-off
  and loops only in the services.

### Database spec §6: the five integrity queries

Each must return no rows. They run after every database test (`tests/backend/conftest.py`)
and at `GET /admin/integrity-check`; each has a test that plants a violation
(`tests/backend/test_integrity.py`). Code: `store/integrity.py`.

1. No dependency loops among live links.
2. Nothing live under an archived project.
3. Every record has its CREATE audit row.
4. No time logged on a day its author wasn't booked on that project (archived bookings
   count: archiving later doesn't make history wrong).
5. No signed-off deliverable with an unfinished task or dependency.

The audit rule behind query 3: one audit row per record changed (approving a request writes
two); archiving cascades write one row per child; dependency links, which have no id, are
audited as edits of the deliverable.

## 5. Audit log and notifications

**Every successful change writes one audit row per record it changes, and that row notifies
the people above the actor** (David's requirement, 13 Oct).

| Actor's stored role | Who is told |
| --- | --- |
| Employee | their line manager, every admin and, for a change to a project's work (task, logged time, booking, deliverable), that project's manager |
| Manager | every admin |
| Admin | every other admin |
| Anyone | also the person the record is about (redesign §4), and on a request decision the asker |

Never the actor, never an archived user, never twice for one change. An employee with no
manager notifies the admins; a lone admin's change notifies nobody, but the row is written.

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **One function, `record_change`, called inside the same transaction as the change;** it writes the audit row and its notifications together | Change, audit and notification commit together or not at all. A test calls every write route and fails if one leaves no audit row; integrity query 3 catches a record with no CREATE row | Separate inserts in each service (easy to forget) | `services/audit.py`; `tests/backend/test_api_audit_walk.py` |
| **Recipients come from the stored role,** never the token | Same rule as access (section 3) | | `services/audit.py` |
| **A notification is a one-line summary** ("Ana Ruiz changed the budget of Apollo"), never the before/after state | A manager never sees a salary through the bell | Showing the change | `notification_view` in `services/views.py` |
| **Append-only:** a trigger refuses `UPDATE` and `DELETE` on `audit_log`; notifications are marked read, never removed | History can't be rewritten | | `001_init.sql` |
| **Not logged:** reads, refused requests (they changed nothing), sessions (a flood every 15 minutes) | The log holds changes only | | |
| **The project's manager hears about an employee's work on their project** (14 Oct) | A finding: Chloe reports to Sam, so Maria, whose project it was, heard nothing when Chloe logged time there | Line manager only | `services/audit.py`; `tests/backend/test_audit.py` |
| **The person a record is about is told** when someone else changes it: their account, their booking, a task they hold (old and new assignee), their time | People learn what was done to their work | | §4 in section 9 |
| **The bell polls:** every 10 s while the tab is visible, at once on returning to the tab, after every change made in the app, with a pop-up when the count rises | WebSockets are blocked on the workshop account: our role has no API Gateway permission, and the Lambda's private network has no route out to push a message. Leaving that network loses the database. Polling costs about 6 tiny reads a minute per open tab, inside the free tier | WebSockets; Server-Sent Events (also blocked); the first 30 s poll with no pop-up | `components/NotificationBell.jsx` |
| **In-app notifications only** | Email can't leave the account (section 2) | Email notifications | |

## 6. Overtime, capacity and requests

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Each person has a weekly capacity** (default 40, 1 to 60 h), **an "overtime allowed" switch** (default off) and **a task limit** (section 7), set by their line manager or an admin | Float and Asana's model; the line manager knows the person's week | | `set_capacity` in `services/users.py` |
| **Overtime is a warning, not a refusal** (14 Oct). Logging past capacity in a Monday-to-Sunday week without overtime answers 409 `code: "OVER_CAPACITY"` ("This puts you 3 h over your 40 h week. Log anyway? Your manager will be told."); sent again with `confirmOverCapacity: true` it is saved, **marked "Over capacity"**, and the notification says by how much. With overtime allowed it is saved unmarked and the week is flagged | Refusing hid real work, so cost and the allocation grid under-reported. Jira, Harvest and OpenProject let you log and flag | 200 with a warning (saves without consent); 428 (unfamiliar, and a second row in the status table); a separate confirm route or token (the row lock gives the same guarantee) | `_check_limits` in `services/time_entries.py`; `pages/mytasks/MyTasksPage.jsx` |
| **The mark is stored** (`time_entries.over_capacity`, migration 004) and set only on the confirmed path | Capacity can change later and entries can be rejected, so a mark computed on read would drift; frozen like the rate | Computing it on read; marking allowed overtime too | `004_over_capacity.sql` |
| **Edits recheck the limits only when hours or date change;** an edit back under capacity clears the mark; a rejected entry is always rechecked (it rejoins the totals). Every other rule (booked that day, 24 h a day, no future dates, assignee only) stays a hard refusal | A typo fix must not ask "Log anyway?" or tell the manager twice | Rechecking on every edit | `services/time_entries.py` |
| **`code` is optional in every error body,** set by a class attribute on the domain error | The website must not match on wording that may change | Matching the message text | `domain/errors.py`, `api/errors.py` |
| **Requests for everyone** (14 Oct, migration 003). Employees ask their line manager (higher task limit, overtime, anything else); managers ask the admins (a new project, archiving one, anything else); admins have nothing to ask. Approving runs the existing service (`archive_project`, `set_capacity`) in the same transaction, and the asker's bell says so | David chose "everyone, more kinds". The same checks and audit rows run as for the buttons | A new `requests` table (would duplicate status, decider, trigger, routes and page) | `services/requests.py`, `pages/requests/RequestsPage.jsx` |
| **Who decides = who is told you asked:** an employee's request goes to their line manager or any admin, a manager's to the admins | It is exactly the notification rule, so creating a request needed no new recipient logic | Deciders listed per kind | `services/requests.py` |
| **Names kept:** table `project_requests`, URL `/project-requests`; the page says "Requests". The server writes each title ("Archive Apollo", "Allow overtime"); `kind` defaults to `NEW_PROJECT` | The append-only audit log already says `project_requests`; a rename would split the history. Old rows stay valid with no data migration | Renaming; a computed title | `003_request_kinds.sql` |
| **A decision also notifies the asker** (`also_notify`), with the same filters | One place still writes notifications; it also fixed managers not hearing their project request was decided | A second insert in `requests.py` | `services/audit.py` |
| Nobody decides their own request (also a database CHECK); a second decision is 409; a request you may not see is 404 | Same rules as everything else | | `003_request_kinds.sql` |

## 7. Tasks and the pull board

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Deliverables hold tasks** (estimate, assignee, To Do / In Progress / Done). The project's manager or an admin creates them; **only the assignee moves the status and logs time** | Jira and GitHub Projects' pattern; tasks make deliverable progress measurable | | `services/tasks.py` |
| **Pull, not push** (14 Oct): a task with no assignee is **Ready**, and an employee booked on the project presses **Take this**; **Put back** returns it. Time already logged stays with whoever logged it | David: "We don't want a push system, we want a pull system." The Kanban pattern: pull plus a work-in-progress limit | Automatic hand-out, queues, round-robin | `claim` and `release` in `services/tasks.py` |
| **The limit is per person:** `users.task_limit`, default 2, 1 to 10 (migration 002), set with capacity by the line manager or an admin | The person's own load is what matters | A per-column or per-project limit (Jira and Trello's board-level limit) | `002_task_limit.sql` |
| **Managers can still assign, even past the limit;** that is shown as over ("3 / 2, over limit"). The limit is hard only for taking | Same as over-allocation: allowed and flagged | A hard limit for managers too | `services/tasks.py` |
| **Two row locks, the task first and then the person,** stop two people taking one task and one person passing their limit | Concurrent claims are real on a board | | `tests/backend/test_claim_race.py` (on separate connections) |
| Known gap: a manager can't put a task back to Ready from the screen; the API allows it (`PATCH /tasks/{id}` with `assigneeUserId: null`) | | | |

## 8. Dashboard, charts, allocation and schedule

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **The dashboard** (`GET /dashboard/projects`) shows status, risk and budget per project, at risk first. **Total projects** and **Total at risk** count every page, from the server (`atRiskTotal`), following the search and status filter, with a note when a filter is on | The first counter counted one page of 12 cards, so page 3 could say "At risk 0" | A separate counts route (could disagree with the cards); counting in SQL (risk is computed in Python); ignoring filters; a browser fallback (would hide the bug) | `project_cards` in `services/dashboard.py` |
| **Post-demo: two columns, At risk and On track** (stacked on a phone, At risk first), each the 3 most recently changed projects with its count in the heading; each card says "Updated" and the day. **See all** opens that whole group 12 a page, kept in the address so Back works. `GET /dashboard/projects` gains `atRisk=true\|false` and `sort=updated` (default `risk`) and returns `lastActivityAt` (the latest change to the project, its deliverables, tasks, bookings or logged time, one query for all cards) | With hundreds of projects, a grid of every card doesn't scale (David) | A long grid of cards | `services/dashboard.py`, `pages/dashboard/` |
| **No money totals on the dashboard** | Adding money up in the browser would break "money only on the server" | Browser totals | |
| **Graphs spec §1: three charts,** a deliverables timeline (question 4), a budget chart (question 7) and this week's workload (questions 3 and 5). They add no new facts: each value is also in a list on the same screen | Shape is faster to read than numbers | Pie charts, gauges, history charts (no history kept per day or week) | `components/charts/` |
| **Our own React components** (plain boxes sized in percent), **no chart library** | The bundle was already 711 kB, and a package is a new `npm audit` surface; the three charts added about 18 kB | Recharts, Chart.js, D3 | `components/charts/` |
| **The server sends every percentage** (`plannedPercent`, `pendingPercent`, `consumedPercent`); the browser turns a percentage into a width | Money is never divided in the browser | | `services/dashboard.py` |
| **Colour has one job per chart:** status colours mean state (done, late, over), project colours mean "which project" and are never green; **never colour alone** (a word and a warning icon; stripes only in print and Windows high-contrast mode) | Colour-blind and screen-reader users get the same facts; the first project colours failed a colour-blindness check and were changed | Stripes on by default (a vestibular risk); red or green for a project | `theme/chartColours.js` |
| **Graphs spec §4, shared rules:** names above the bar (long ones wrap), values in text colours, tooltips that open on tap and keyboard focus and repeat only what the list shows, each row one focusable image with the full sentence as its name | Readable on phones and with a screen reader | | `components/charts/` |
| **Allocation grid:** people by weeks, sorted by each person's worst week; `?overOnly=true`; each cell lists the projects its hours come from; paginated by person; over capacity in red with an icon and words | Question 5 asks for over-allocated people, worst first | | `allocation` in `services/dashboard.py`; `pages/allocation/AllocationPage.jsx` |
| **A name on the grid opens an Actions menu only when you may act on that person** (admins everyone, managers their own reports); post-demo, "How to read this" says why | A manager's power over capacity and history covers their own reports only | A menu for every name that then refuses | `pages/allocation/AllocationPage.jsx` |
| **Schedule (Float-style):** a bar per booking in its project's colour, built in the browser from the allocation answer; one lane per project; colours fixed per visit (past the 5th project, a shared grey "Other"); an over week outlined red with "+5 h over"; a bar is a link to its project (first tap on a phone shows the tooltip); labels in dark ink above the bar; a project filter (`projectIds`) that still counts every booking for over capacity | No new route; colours that don't jump; text in a bar fails contrast for some colours | Reading bookings directly; packing lanes; colouring by rank; drag-to-schedule (bookings are edited in a form) | `pages/schedule/` |

### Graphs spec §5: the deliverables timeline

On each project's Deliverables tab: one bar per deliverable from start to due date, the inner
fill showing the share done, and a dark "Today" line (not red: red already means late, and a
red line across a red bar reads as one mark). **Late** (not done and past due) wins over the
other states. Blocked stays grey here although its chip is red: blocked means waiting, and on
this chart red means a missed date. A deliverable outside the project's dates stretches the
axis and says "Outside project dates"; a one-day deliverable is drawn at least 8 px wide.

| State | Fill | Track (the unfilled span) | Word |
| --- | --- | --- | --- |
| Done | `#165E26` (the site's one green) | `#B3C9B5` | "Done" |
| In progress | `#0B3D91` | `#AABBD8` | "In progress" and the % done |
| Not started | `#6B7280` | `#CBCED3` | "Not started" |
| Blocked | `#6B7280` | `#CBCED3` | "Blocked" |
| Late | `#C21F1F` (the site's red) | `#EDB6B6` | warning icon, "Late" and the % done |

These are the values `STATE_COLOURS` must equal (`theme/chartColours.test.js`); the green
and red changed from the first write-up's when the redesign set one green and one red. Date
maths: `components/charts/timeline.js`.

## 9. Website design (redesign spec §1–§6)

David's notes of 14 Oct night ("Big changes to ACME Project Manager", mostly website), built
that night. **§6 (15 Oct morning) wins wherever it disagrees with §1 to §5c.** Where the
labels below say "replaced", follow the later section.

**§1 Look and feel.** Forest green with gold highlights, calm like Float (gold never for
status, never as text on a light background, since it can't reach 4.5:1 there). Every text
and button colour pair passes WCAG AA, with its ratio noted beside the token in
`theme/theme.js`. Square corners on cards, fields and dialogs. A dark-mode switch (sun or
moon) in the top bar and on the sign-in page: the first visit follows the system setting, the
choice is remembered in `localStorage` (inside try/catch). The **logo** is drawn in SVG: the
word ACME with a taller A and a gold shine at its tip ("acme" means the high point),
`components/AcmeLogo.jsx`. Sign-in page: the logo large beside the card (above it on a phone).
A side menu that collapses to icons on desktop. *(The colours, the glows and the collapse
button were replaced in §5c and §6.)*

**§2 Search on every list, live and on the server.** One `components/SearchField.jsx`:
filters as you type (300 ms pause), sends `q`, goes back to page 1, has a clear button, and
(§5c) ignores a slow reply that arrives after a newer one. New `q` on My tasks, Ready to take,
Approvals, Requests (plus `scope`: sent or to decide), Notifications and the Audit log;
People and Projects already had it. Rule kept: search is server side and paginated.

**§3 Pages.** Home pages start with a **timeline of your projects**: `GET /dashboard/timeline`
(any signed-in user; 10 a page; a fixed number of queries whatever the page size), each item
`{projectId, name, status, startDate, endDate, atRisk, deliverables: [{milestoneId, name,
dueDate, status}], bookings: [{userId, name, startDate, endDate, hoursPerWeek}]}`, an employee
seeing only their own bookings; drawn by `components/ProjectTimelines.jsx` (week maths in
`components/projectTimelines.js`). For employees, "My tasks" became **Dashboard** (route
`/my-tasks` kept). Logging time: an Hours box and a Minutes box (0 to 59), still at most 24 h
an entry. A project's name in a list is a button that opens it; Archive (admins) or Request
archive (managers) sit on each row and in the project's header. The Resources tab is called
**People** for employees. Requests has two tabs, **My requests** and **Approve or deny**.
Allocation gained a "How to read this" panel.

**§4 Notifications for the person a change is about** (section 5): the account itself, the
booked person, a task's assignee (old and new), the person whose time it is. Never the actor,
never an archived user, one notification per person per change.

**§5a Errors show on the field.** David: "If there is an error when writing out a field I want
that field to glow red, not a message at the top of a card." The field gets a red border and
one short reason under it, tied with `aria-describedby` (words stay, because colour alone
tells a colour-blind or screen-reader user nothing); focus moves to the first bad field. The
browser checks what it can before sending (a required field, Minutes of 60 or more, a number
out of range, an end before a start); server errors with a `field` land on that field, others
on one line above the buttons. A wrong sign-in marks both boxes. Code: `theme/theme.js`,
`components/FormDialog.jsx`.

**§5b Fewer clicks.** David: "in the past you had to press Projects, open it, and look
somewhere else to archive a project." Common tasks happen on the row you are looking at
(archive, approve or reject, take a task, log time, book a person, reset a password); a
confirm step stays only where an action is hard to undo. One main button per screen in the
same place, body text at least 14 px, spacing rather than lines.

**§5c One design language** (from David's site d4davidg.github.io and the SimpleBank app David led):
"everything should rhyme." Kept from it: every screen is the same shell (page header with
actions top right, then search and filters, then content, then the pager); lists are tables
on desktop and cards on phones from one component; empty, loading and error states from
`components/PageState.jsx`; status always from `StatusChip` (icon, word and colour); success
confirmed by the one "Saved" pop-up; anything that does something is a button, never a bare
word; disabled controls never in a tinted brand colour; a visible focus ring on every control.
*Replaced by §6:* its glows, outlined buttons and capital titles.

**§5 Not changing.** Routes, roles and rules other than the above, the API shapes, and the
database schema (no migration).

**§6 David's tweaks after seeing it (15 Oct, morning):** welcoming, not military; easy to
read; everything consistent.

- **§6.1 Look.** Square boxes kept. **No glows anywhere**: depth from a thin border and a
  soft shadow. **One green** for every green, `#165E26` (white on it about 7.9:1): top bar,
  buttons, links, selected menu item, timeline bars; chart categories use other hues, and
  project colours are never green. A warm light page (`#E8ECDC` then) with warm white cards
  `#FAFBF5`; dark mode a warm dark green (`#18221A` page, `#1F2B21` cards) with the same green
  top bar. A true red, not salmon. Titles in **Poppins** 600 to 700 in normal case (capitals
  read stiff); body text Inter at weight 500; names in tables 600.
- **§6.2 Buttons.** **Every button is filled:** the green, white words, 8 px rounded corners,
  a small shadow, no outline-only buttons. **Danger** actions (Archive, Reject, Revoke) are
  filled red with white words; in a menu, red words. Dark mode: the same green with a thin
  white outline. The top bar's words (your name and role, the bell, dark mode, Sign out) are
  bare, with no boxes. Icon-only buttons keep tooltips. Set once in the theme
  (`theme/theme.js`, tested in `theme/theme.test.jsx`).
- **§6.3 Shell.** The logo in Poppins bold; the A a sharp point with three gold sparkles and
  a soft gold glow (the one glow on the site, at David's request). The side menu collapses
  from a small bookmark tab on its right edge.
- **§6.4 Pages.** Dashboard (managers, admins): My projects this week (one short line at
  most), Workload this week, the project search with small Total projects / Total at risk
  counts beside it, the project cards, and Budget by project last. Employee dashboard: My
  tasks and Ready to take side by side (stacked on phones), My logged time below. Allocation:
  "How to read this" folded away by default, a people search, and a name opens that person's
  Actions. People: one **Actions** menu per person, Archive last in red. Schedule: a project
  filter that searches the server (works with hundreds of projects). Approvals: an **"Over
  estimate"** mark beside "Over capacity", computed by the server. Notifications: "New" in
  filled red.

**After the demo (15 Oct, afternoon).** No graph-paper grid in light or dark mode, and the
light page a touch greener (`#E2EBD5`). A **search box in the top bar** finds pages (only
those your role can open) and projects by name; "/" or Ctrl+K puts the cursor in it
(`components/TopSearch.jsx`, `components/searchPages.js`): pages by name or another word
(home, time, history), up to 5 projects from `GET /projects` after 2 characters, and a late
older answer is dropped. On the dashboard's project timelines, hovering a late deliverable
says "was due Mon, Oct 12 · today is Thu, Oct 15 · 3 days late" (`formatLateness` in
`services/format.js`); "Week of" starts the row of dates there and on the Schedule.
The dashboard's two columns and the allocation note are in section 8.

**Website rules that don't bend** (also in [CLAUDE.md](../CLAUDE.md)): every call goes
through `services/request.js`; 401s are handled in one place (sign-in exempt); the session
is probed on load; every storage access is in try/catch; theme tokens carry their contrast
ratios; field errors are tied to their field; no money arithmetic in the browser (only
`services/format.js` turns cents, minutes and dates into text); forms are
`components/FormDialog.jsx` (an edit sends only the changed fields), and every field and
button is disabled while a request is in flight, so one press sends one request; **hash
links** (`/#/projects/7`), so the server only ever serves `index.html` (section 12); phones
at 899 px and below get cards instead of tables and a drawer instead of the side menu
(`theme/responsive.js`).

## 10. Performance

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Each signed-in page is its own file,** downloaded on first visit; the sign-in page and the app shell stay in the first download. First download: 739 kB to 560 kB | The first screen everyone sees stays one round trip | Lazy-loading the sign-in page too (clears Vite's 500 kB warning but costs the first screen a second trip); splitting React and MUI into their own file (helps only the visit after a deploy); prefetching (page files are 2 to 22 kB) | `components/lazyPage.js`, `App.jsx` |
| **One loading boundary around the page area,** so the menu stays on screen; the fallback is the usual spinner | | One boundary per route (12 copies) or around the whole app (blanks the menu) | `App.jsx` |
| **A page file that fails to download shows a Reload message** | `deploy-frontend.sh` syncs with `--delete`, so after a deploy an open tab would get a blank screen | No handling | `components/lazyPage.js` |
| **Keep Vite's 500 kB warning** | It is a true statement about the first download | Raising the limit to hide it | `frontend/vite.config.js` |
| **Copies folded:** one `Pager` (in `components/PageState.jsx`) for ten page-number blocks; `values.require` for four "X is required." loops | Less code to explain | Folding the search box and filter forms (saves little, costs more) | `components/PageState.jsx`, `domain/values.py` |
| **A fixed number of queries per screen,** money for every project in one query | No query per row | | `services/dashboard.py` (no test counts queries yet) |
| **Check whether the first admin exists before hashing** on cold start | Each cold start re-hashed the admin's password (about 1 s) inside the migration lock, so 25 cold starts queued in a 1.3, 2.4 … 9.8 s staircase, 0.2 s from the 10 s lock limit. After the fix each answered in 0.17 to 0.30 s | | `services/users.py`; `test_bootstrap_admin_skips_the_hash_once_the_admin_exists` |
| **Warm the site up before a demo** | Aurora pauses itself (`min_capacity = 0`); waking takes about 15 s | | `infra/rds.tf` |
| **k6 for load tests** (`tests/load/load.js`; it replaced a Python script on 14 Oct). Each virtual user signs in once and loops a manager's reads, then a burst of logins; thresholds: under 1% failed, reads p95 under 1 s, logins p95 under 3 s | One standard tool covers the reads and the login burst | Keeping the Python script | [TESTING.md](TESTING.md) |
| **What breaks at 10x, said up front:** one connection per Lambda (no RDS Proxy); the dashboard computes every project to sort at-risk first in Python; the allocation grid computes every cell to sort by worst week; the audit and notification tables grow without limit | Honest limits | | |

## 11. Testing

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **Backend tests (pytest) run against a real Postgres,** each in a rolled-back transaction, with the integrity check after every database test | Mocks can't show constraint names, the exclusion constraint or transactions | Mocked databases | `tests/backend/conftest.py` |
| **Three backend layers:** database rules (one test per constraint), business rules (never import `api`), API (every route called in-process with a Lambda-shaped event) | Each layer proves one thing | Real HTTP for every route (covered by `tools/demo.py` and the browser tests instead) | `tests/backend/` |
| **Two walk tests:** every route answers; every write route leaves an audit row | Add a route and forget either, and the suite fails | | `tests/backend/test_api_read_walk.py`, `test_api_audit_walk.py` |
| **Website: Vitest with React Testing Library,** `fetch` stubbed, tests beside the code | Jest-compatible (the rubric says Jest), reuses Vite's config | Jest itself | `frontend/src/**/*.test.jsx` |
| **Browser: Playwright** | Waits by itself for a button to be ready (hand-written waits are the usual cause of flaky Selenium tests), a trace viewer, one command installs the browsers | Selenium | `frontend/e2e/` |
| **An axe accessibility scan inside the screen tour,** every WCAG 2.0 to 2.2 A and AA rule; serious or critical problems fail; light and dark; no rule switched off | axe is the engine behind Lighthouse's accessibility score. Its first run found two real problems (menu links not in list items; grey text at 2.7:1), both fixed | Lighthouse (the same rules again); a separate accessibility test file (twice the run time); failing on moderate advice | `frontend/e2e/tour.spec.js` |
| **Every behavioural fix ships with the test that fails without it** | Proof the test tests something | | |
| **Coverage targets:** 80% overall, 90% on the API and error paths, every critical path walked in a browser; the numbers are printed and every uncovered area listed with a reason | The rubric's targets; evaluators ask why coverage is what it is | | [TESTING.md](TESTING.md) |
| **The AWS site is read-only to tests by default.** Tests that add data (`pull`, `requests`, `timelog`, `project-lifecycle`) skip themselves on the live site; post-demo, `--aws --allow-writes` lets them run there after a warning. On AWS the tests sign in as Ben Okafor | The live site is the demo; Ana Ruiz is archived there | Writing to the live site by default | `tools/e2e.sh` |
| **Post-demo: `--video`** records every test and opens the report with the videos; **`--ui`** opens Playwright's UI mode | David asked to watch the tests run against AWS | | `tools/e2e.sh` |
| **CI stays the workshop's three checks** (bandit, `npm audit`, Checkov reporting only); the full suite runs with `./tools/test-all.sh` | Our tests need a Postgres service in CI, not built | | `.github/workflows/`, `tools/test-all.sh` |

## 12. Deployment and AWS

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **One Lambda, `backend/tracker`, with all backend code inside it** | Terraform zips each `backend/*/` folder that has a `requirements.txt` as one Lambda, so sibling folders would deploy as nothing; one database and one rule set want one deploy | One Lambda per resource | `infra/locals.tf` |
| **The router accepts both path shapes:** `/projects/7` (local proxy) and `/api/tracker/projects/7` (CloudFront), collapsing `//` | The same request arrives differently locally and on AWS; both are tested | | `api/http.py` |
| **Everything runs on the VDI (Ubuntu 22.04),** not the Windows laptop | The `bin/` scripts assume Ubuntu, and Terraform zips the Lambda on the machine that runs it, so a Windows deploy would ship Windows wheels of `psycopg-binary` | Deploying from Windows | [SETUP.md](SETUP.md) |
| **CloudFront's "404 becomes index.html" rule removed; the website uses hash links** | The rule covered the API too: a "not found" turned into a 200 page (observed on the first deploy as S3's 403 XML). Hash links mean deep links never reach S3 | A CloudFront Function for rewrites | `infra/cloudfront.tf`, `App.jsx` |
| **The local proxy forwards `Authorization`, and CORS lists the headers by name** (the proxy, and since 15 Oct the Lambda URL, on AWS after the next backend deploy) | The template's proxy dropped `Authorization` (every call was 401), and the Fetch standard never lets `*` cover `Authorization` | `*` | `bin/proxy-server.js`, `infra/lambda.tf` |
| **Secrets are generated by Terraform** (`random_password` for the token key and the first admin) and live in its state | Nothing secret in the repo; the forced first-login change limits the admin password's exposure | Hard-coded or "first run" secrets | `infra/secrets.tf` |
| **Database connections on AWS use `sslmode=require`** | Aurora is reached over the network | | `store/postgres.py` |
| **Deploy the backend and the website together** | The old website knows no refresh and would sign people out after 15 minutes | | [SETUP.md](SETUP.md) |
| **David pushes and deploys; Claude edits, tests and commits.** Claude's settings deny `git push`, the deploy and cleanup scripts, and `terraform apply`/`destroy` | Nothing reaches GitHub or AWS without David | | `.claude/settings.local.json` (on the VDI); [AI-WORKFLOW.md](AI-WORKFLOW.md) |
| **Workshop traps fixed when the work reached them:** Vite `strictPort` (no silent move to another port); folder names the template's `.gitignore` drops (`lib`, `build`, `dist`, …) avoided; `backend/tracker/.gitignore` for the packages `start-dev.sh` vendors; tests outside `backend/` so CI's bandit doesn't flag test `assert`s | Each one was found by reading the template's code | | `frontend/vite.config.js`, `.gitignore` |
| **Swagger UI** (15 Oct): `docs/swagger.html` loads Swagger UI 5.33.0 from jsDelivr, pinned with integrity hashes, served on this machine by `./tools/swagger.sh` (port 8090); signing in fills Authorize with the token | Evaluators can try every route on Local or AWS without Postman | | [API.md](API.md) |
| **Every AWS login is published, the admin's too** (15 Oct), although the GitHub repo is public | The repo is for David's employers, who must be able to do everything David does from the repo alone. The site holds demo data only, and its accounts belong to the temporary workshop account | Keeping passwords out of the repo | [main README](../README.md) |

## 13. Documentation and the repo

| Decided | Why | Turned down | Where |
| --- | --- | --- | --- |
| **A README in the root and in each important folder;** `docs/` holds the guides, indexed by [docs/README.md](README.md) | A first-time reader can reach every file from the root README | Guides spread across the root and `docs/` | [main README](../README.md) |
| **`tests/` is the one place to find tests:** backend in `tests/backend`, the load test in `tests/load`. The website's unit tests stay beside their code (Vitest and React convention), and the browser tests stay in `frontend/e2e` (they need the website's packages); [tests/README.md](../tests/README.md) lists them all | One place to look, without breaking the tools | Moving every test | [TESTING.md](TESTING.md) |
| **The day-by-day write-ups (specs, plans, guides, the overnight report) were removed on 15 Oct;** their decisions are on this page and they stay in git history (section 14) | David: "remove all unnecessary documentation"; a first-time reader should meet only what they need | Keeping them in the tree | |
| **Workshop template documents removed** (code of conduct, contributing, DCO, security policy, the rubric and validation guides); `LICENSE` and `.github/` kept (CI and the organisation's coding instructions for AI assistants) | They described the template, not this app | | |
| **`CLAUDE.md` stays in the root** (Claude Code reads it); rule: fix it in the same commit as the code that outdated it | It is how Claude knows the project's rules | | [CLAUDE.md](../CLAUDE.md) |
| **The product plan stays private** (`private/`, gitignored) | David's own notes; earlier copies are in the history | | |
| **`docs/openapi.json` is generated from the route table** (`tools/openapi.py`), OpenAPI 3.0.3 JSON, and a test fails if the saved file is stale. Each handler's docstring is its summary; request bodies are listed by hand and two tests keep the list honest; responses name the shared envelope; one shared error schema; roles in each description and as `x-roles`; two servers (Local, AWS); output fixed (no timestamps) | A hand-written file would drift the first time a route changes | Hand-writing it; YAML (a new dependency); OpenAPI 3.1 (older Postman imports 3.0 more reliably); a schema per record | `tools/openapi.py`, `tests/backend/test_openapi.py`; [API.md](API.md) |
| **Plain words first, then the technical term; claims checked against the code** | David must explain every line to evaluators | | |
| **How Claude Code was used** (agents, parallel lanes, reviews, guardrails) | | | [AI-WORKFLOW.md](AI-WORKFLOW.md) |

## 14. Original write-ups in git history

Each was removed on 15 Oct. Read any of them, as it stood at the last commit before the
clean-up, from the repo folder:

| Write-up | What it held | Read it with |
| --- | --- | --- |
| Database design | schema, migrations, integrity queries, first tests (cited by `001_init.sql`) | `git show 4d8b949:docs/superpowers/specs/2026-10-13-database-design.md` |
| Pull board | Take this, Put back, the task limit (cited by `002_task_limit.sql`) | `git show 4d8b949:docs/superpowers/specs/2026-10-14-pull-board-design.md` |
| Requests | five kinds of request (cited by `003_request_kinds.sql`) | `git show 4d8b949:docs/superpowers/specs/2026-10-14-requests-design.md` |
| Overtime | the warning instead of the refusal (cited by `004_over_capacity.sql`) | `git show 4d8b949:docs/superpowers/specs/2026-10-14-overtime-design.md` |
| Tokens | 15-minute access tokens, refresh tokens (cited by `005_sessions.sql`) | `git show 4d8b949:docs/superpowers/specs/2026-10-14-tokens-design.md` |
| Redesign | §1 to §6.4 of section 9 | `git show 4d8b949:docs/superpowers/specs/2026-10-14-redesign-design.md` |
| Dashboard graphs | the three charts (§5: the timeline) | `git show 4d8b949:docs/superpowers/specs/2026-10-14-dashboard-graphs-design.md` |
| Dashboard counts | Total projects, Total at risk | `git show 4d8b949:docs/superpowers/specs/2026-10-14-atrisk-design.md` |
| Employee history | who reads what | `git show 4d8b949:docs/superpowers/specs/2026-10-14-history-design.md` |
| Schedule | the Float-style screen | `git show 4d8b949:docs/superpowers/specs/2026-10-14-schedule-design.md` |
| Speed | pages on first visit, less copied code | `git show 4d8b949:docs/superpowers/specs/2026-10-14-speed-design.md` |
| Accessibility scan | axe in the tour | `git show 4d8b949:docs/superpowers/specs/2026-10-14-axe-design.md` |
| OpenAPI file | generated from the route table | `git show 4d8b949:docs/superpowers/specs/2026-10-14-openapi-design.md` |
| Email and texts | why AWS can't send them; rules for a future reset | `git show 4d8b949:docs/superpowers/specs/2026-10-14-email-and-sms-findings.md` |
| WebSockets | why the bell polls | `git show 4d8b949:docs/superpowers/specs/2026-10-14-websockets-findings.md` |
| Notification delay | the 30 s bell; the project manager left out | `git show 4d8b949:docs/superpowers/specs/2026-10-14-notification-delay-findings.md` |
| Requirements check | the rubric and `MVP.md`, line by line | `git show 4d8b949:docs/superpowers/specs/2026-10-14-requirements-check.md` |
| Build plans (12) | step-by-step build plans | `git show 4d8b949:docs/superpowers/plans/` lists them; then `git show 4d8b949:docs/superpowers/plans/2026-10-14-pull-board.md` (for example) |
| Interview prep | what to say, "say this, not that" | `git show 4d8b949:docs/REPOINFO.md` |
| Guide, demo runbook, demo tests, repo map | demo scripts, how to reach everything | `git show 4d8b949:docs/GUIDE.md` (also `DEMO-RUNBOOK.md`, `DEMO-TESTS.md`, `MAP.md`) |
| Overnight report | the 13 to 14 Oct website build and the decisions made for David | `git show 4d8b949:docs/OVERNIGHT-REPORT.md` |
| The rubric | the workshop's evaluation guide | `git show 4d8b949:docs/full-stack.md` |
| MVP scope | now [REQUIREMENTS.md](REQUIREMENTS.md) | `git show 4d8b949:MVP.md` |
