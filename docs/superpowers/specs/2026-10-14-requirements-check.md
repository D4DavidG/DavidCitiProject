# Requirements check (14 Oct 2026, afternoon; statuses updated that night)

**Status update, 14 Oct night (merged branch `merge-prep`).** The rows below were written in the afternoon. Rows that changed since are marked **(night)** and carry the new evidence; the afternoon wording is kept where it explains the history. What changed: bell polling 30 s to 10 s; 15-minute tokens with refresh (**MET**); employee history built; Schedule screen built; forms locked while saving; a "Saved" message after every change; log-time-then-approve and project life cycle browser tests; k6; axe scan in the tour; pages load on first visit; the README's out-of-scope line for PWA, AI features and background jobs. Line-number citations to README.md and test files are the afternoon's and may have drifted; the new ones were checked tonight. Counts tonight: 565 backend, 404 website in 36 files, 30 browser tests in 12 files (29 passed, 1 skipped), 50 axe scans.

What this is: every line of the workshop rubric and of `MVP.md`, checked against the code
as it stands on branch `David` (written against commit `88a052d` plus the pull board work
then in progress; line citations rechecked against `1aa55bd` at 14:48). Each row says **MET**, **PARTLY**, **MISSING** or **DELIBERATELY DIFFERENT**,
with the evidence, and for PARTLY or MISSING the smallest thing that would close it.

## Verdict

- **`oldmvp.md` is the rubric, unchanged.** `diff oldmvp.md docs/full-stack.md` prints
  one difference: `oldmvp.md` has no newline after the final `</nav>` (line 395). Every
  word is the same, so checking `docs/full-stack.md` checks both.
- **Everything in `MVP.md` is built.** Two items were thinner than their wording in the
  afternoon: no deliverable *timeline* drawing (built since: night), and "search and
  filter on every list" holds for the main lists only (still true).
- **Against the rubric:** the core is met and tested: CRUD, validation, error shape,
  roles, persistence, responsive layout, deploy scripts, load test. The gaps are of three
  kinds:
  1. **Departures we chose:** archive instead of DELETE/204, PATCH instead of PUT. (Night:
     the refresh token is built, so it is no longer a departure.)
  2. **Rubric extras we haven't built:** offline install (PWA), AI features, background
     (async) jobs. (Night: the README now says so under "Trade-offs and assumptions".)
  3. **End-to-end tests:** (night) now built: `timelog.spec.js` (log time then approve) and
     `project-lifecycle.spec.js` (create, edit, archive, reactivate). Only the forced
     password change at first sign-in has no browser test.
- **Coverage, measured tonight:** backend 97%, API layer 100%, frontend 95.5% statements
  and 97.04% lines (afternoon: 96%, 100%, 93.6%, 95.2%). Every number-based goal is met. "100% of critical paths end to end" is
  only partly met (see Testing).
- **README test count:** `README.md:224` said 231 website tests when this was written; by
  14:48 the other workflow had changed it to 233, which matches today's run.

## Coverage, measured 14 Oct

| Goal (rubric `docs/full-stack.md:105-111`) | Target | Measured | Command and output |
| --- | --- | --- | --- |
| Backend components | 80% | **97%** (2,011 statements, 64 missed) (night; afternoon: 96%, 1,847 statements) | `bash tools/test-all.sh`: `TOTAL 2011 64 97%`, `565 passed in 27.19s` |
| Frontend components | 80% | **95.5% statements, 97.04% lines** (branches 93.72%, functions 91.4%) (night; afternoon: 93.62% and 95.18%) | `npm run test:coverage`: `Tests 404 passed (404)`, 36 files |
| API endpoints, all CRUD | 90% | **100%** of `api/` plus `domain/errors.py` (335 statements, 0 missed; `api/` alone 321): routing, handlers, error map | `.venv/bin/coverage report --include='backend/tracker/api/*,backend/tracker/domain/errors.py'`: `TOTAL 335 0 100%` |
| Error handling (validation and error cases) | 90% | **100%** of the error map (`api/errors.py`, `domain/errors.py`). Most of the 73 missed backend lines are guard branches for ids that don't exist (`README.md:240-256`) | same command as the row above |
| Critical user paths, end to end | 100% | **MET except one** (night): see the Testing table (T9) | `frontend/e2e/*.spec.js` |

Note: the first frontend coverage run today showed `1 failed | 231 passed (232)`. That
run overlapped the other workflow's own vitest run and file edits. The rerun straight
after was clean (233 of 233). Treat it as noise from the shared checkout, not a known
failing test.

## 1. The rubric: `docs/full-stack.md` (same text as `oldmvp.md`)

### Evaluation expectations (`full-stack.md:51-84`)

| # | Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- |
| 1.1 | Runs locally and in the cloud | MET | `curl http://localhost:3001/api/tracker/health`: `{"status": "ok"} 200` (today); AWS checklist all done: `docs/superpowers/plans/2026-10-13-manual-verification.md` | |
| 1.2 | Front and back support full CRUD | MET (D = archive) | `api/routes.py:52-110`: create, read, update and archive/reactivate for projects, deliverables, resources, users | |
| 1.3 | API, storage and databases configured | MET | `infra/` Terraform; `store/migrate.py` runs on cold start; Aurora with `sslmode=require` (CLAUDE.md §4) | |
| 1.4 | Reproducible deploy with checkable output | MET | `bin/deploy-backend.sh`, `bin/deploy-frontend.sh` (prints the URL); `README.md:325-334` | |
| 2.1 | Intuitive, responsive, accessible UI | MET (layout not re-checked by eye today) | `e2e/tour.spec.js:47` (every screen, every role, desktop and phone, no sideways scroll); `theme/theme.js:6-14` (contrast ratios) | |
| 2.2 | Clear information architecture | MET | Screens in question order (`README.md:129-145`); nav differs per role (`components/navigation.js`) | |
| 2.3 | Consistent typography, spacing, colours, states | MET | One MUI theme (`theme/theme.js`); shared `StatusChip`, `PageState`, `FormDialog` | |
| 2.4 | Clean backend and frontend boundary | MET | One route table (`api/routes.py`); one fetch wrapper (`services/request.js`); camelCase only on the wire (`services/views.py`) | |
| 3.1 | Modular, organised by feature or domain | MET | `backend/tracker/{api,services,store,domain}`; `frontend/src/pages/` (one folder per screen, e.g. `pages/projects/`) | |
| 3.2 | Errors, validation and edge cases in both layers | MET | Server: `api/errors.py:17-29`; browser: `components/FormDialog.jsx:94-132` | |
| 3.3 | Naming, formatting, lint | MET | `npm run lint` clean (CLAUDE.md trap 5); CI runs bandit (`.github/workflows/python.actions.yml:27`) | |
| 3.4 | Reuse over copy-paste | MET | `DataTable` (table on desktop, cards on phone), `FormDialog`, `services/format.js`, `services/paging.py` | |
| 4.1 | Unit and integration tests for business logic and API | MET | 565 backend tests (night; 423 in the afternoon): `tests/backend/test_work.py`, `test_api.py`, both walk tests | |
| 4.2 | Frontend core journeys and error states | MET | 404 Vitest + RTL tests (night; 233 in the afternoon); refusals shown as written (`README.md:230-233`) | |
| 4.3 | Manual validation, UI through to the database | MET | `docs/superpowers/plans/2026-10-13-manual-verification.md`; `tools/demo.py demo` ends on the integrity check | |
| 4.4 | Test commands, results and gaps documented | MET | `README.md:190-256`; `docs/TESTING.md` | |
| 5.1 | Set up locally with documented commands | MET | `README.md:172-188`; CLAUDE.md §4 | |
| 5.2 | README covers architecture, trade-offs, assumptions | MET | `README.md:35-170`, `336-367` | |
| 5.3 | Clear loading, success and failure feedback | **MET (night)** | Loading and failure: `components/PageState.jsx:9` (spinner, error with Retry, empty). Success: after every successful change the layout shows "Saved" for 3 seconds (`components/AppLayout.jsx:53-118`, fed by `onWrite` in `services/request.js`). Afternoon status: PARTLY, only Requests said anything | |
| 5.4 | Ownership, communication, pragmatic decisions | MET | `docs/OVERNIGHT-REPORT.md`, `docs/GUIDE.md`, the decision table in CLAUDE.md | |

### Testing expectations (`full-stack.md:86-111`)

| # | Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- |
| T1 | Backend unit tests | MET | `test_domain.py`, `test_security.py`, plus service rule tests that never import `api` | |
| T2 | Integration tests with a real database | MET | Every test runs on real Postgres (`tracker_test`), each one rolled back (`tests/backend/conftest.py`) | |
| T3 | Error tests for CRUD | MET | `test_api.py:177` (bad JSON is 400), `test_api_read_walk.py:206` (bad query is 400 naming the field), `:226` (a crash is a bare 500) | |
| T4 | Component tests (Jest + RTL) | MET | Vitest + RTL, Jest-compatible (CLAUDE.md §8); `*.test.jsx` beside each screen | |
| T5 | API service tests with mocked responses | MET | `services/request.test.js` (fetch stubbed) | |
| T6 | End-to-end tests (Cypress or Selenium) | MET (Playwright) | 30 tests in 12 files (night): `e2e/demo.spec.js`, `pull.spec.js`, `requests.spec.js`, `history.spec.js`, `tour.spec.js`, `schedule.spec.js`, `timelog.spec.js`, `project-lifecycle.spec.js` and the chart specs. Playwright fills the same role as Selenium | |
| T7 | Load test (Artillery or JMeter) | MET (k6) | `tools/k6/load.js` (`docs/TESTING.md` section 7); the earlier `tools/loadtest.py` was removed on 14 Oct because k6 covers the same reads and logins; on AWS 13 Oct (measured with the removed script), 25 users, 16,184 reads, 539 req/s, 2 failed (README, "Load test") | Run k6 on AWS |
| T8 | Performance monitoring | PARTLY | CloudWatch `REPORT` lines, 6 ms p50 inside Lambda (`README.md:276-277`); `tools/console.py logs`; no dashboard or alarm | Name the CloudWatch log command in the README (one line) |
| T9 | Critical user paths 100% end to end | **MET except one (night)** | Covered: sign-in, the seven questions (`demo.spec.js`), phone layout, pull board (`pull.spec.js`), every screen for every role with an axe scan (`tour.spec.js`), deep-link refresh, **an employee logs time and the manager approves it** (`timelog.spec.js`), **an admin creates, edits, archives and reactivates a project** (`project-lifecycle.spec.js`). **Still not covered:** the forced password change at first sign-in. Afternoon status: PARTLY | A spec for the forced change |

### Implementation expectations (`full-stack.md:164-381`)

**1. Backend service (`:174-187`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Store and manage data | MET | 11 tables plus `schema_migrations`, `store/migrations/001_init.sql`, `005_sessions.sql` | |
| Authenticate and authorise | MET | See section 6 below | |
| API endpoints | MET | 69 routes (night; 66 in the afternoon), `api/routes.py` | |
| Business logic | MET | `services/`; rules listed in `MVP.md:86-105` | |
| Real-time | PARTLY (night: poll is now 10 s) | The bell asks every 10 s while the tab is visible (`POLL_MS`, `components/NotificationBell.jsx:8`), at once on returning to the tab, and after a write made in the same tab, and shows a pop-up when the count rises; no push. Afternoon status: 30 s | WebSockets researched: not possible on the workshop account (`2026-10-14-websockets-findings.md`), so polling stays |
| Async tasks where sync isn't feasible | DELIBERATELY DIFFERENT | Nothing needs it: every write finishes inside one transaction in about 6 ms. The Lambda has a dead-letter queue (`infra/lambda.tf:42`), but nothing runs in the background | One README sentence: no work in the app is slow enough to need a queue |
| Reliability, high availability | MET | Lambda + Aurora Serverless v2; advisory-lock migrations; 503 when the database is down (`api/errors.py:27`) | |
| Security, performance | MET | PBKDF2 at 600k rounds; role re-read from the database; load test | |
| Maintainability, modularity | MET | Layered imports (`README.md:37-62`) | |
| Monitoring, observability | PARTLY | `logger.exception` on every crash (`api/app.py:48`); migration logs (`function.py:54`); audit log; integrity check | as T8 |
| Docs and API standards | MET | `README.md` endpoint table; `tools/tracker.http` | |

**2. Data persistence (`:252-256`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Created records persist | MET | `test_store_commits.py` (writes really commit) | |
| Updates are accurate | MET | `test_api_audit_walk.py` (every write route) | |
| "Deleted records are properly removed" | DELIBERATELY DIFFERENT | Archive and reactivate; a trigger refuses DELETE (`test_no_delete.py`); `README.md:338-340` explains why | Ask an evaluator (gap 2) |
| Reads match what was stored | MET | Round-trip tests in `test_projects.py`, `test_work.py` | |
| Database errors handled | MET | psycopg errors become domain errors (`store/postgres.py`); 503 when the database is unreachable (`test_function.py`) | |

**3. Data validation (`:264-268`) and 8. Backend validation (`:349-353`)**

| Expectation | Status | Evidence |
| --- | --- | --- |
| Required fields present and non-empty | MET | Today: `POST /project-requests {}` returned `{"error": "Name is required.", "field": "name"} 400` |
| Formats and limits | MET | `test_domain.py:33,89`; `test_projects.py:44`; Postgres CHECKs (`test_schema.py`) |
| References exist before accepting | MET | `test_work.py:120` (dependency across projects), `:149` (assignee must be booked); foreign keys |
| Meaningful messages | MET | Messages name the field (`api/errors.py:37-39`) |
| Malformed input | MET | Today: `POST /auth/login` with body `{bad` returned `{"error": "The request body is not valid JSON."} 400` |
| Duplicates refused | MET | `001_init.sql:26` (username unique), `:36` (email unique, ignoring case), `:234` (one notification per change and recipient) |

**4. API design (`:276-280`) and 9. Error handling (`:363-381`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| POST, GET, PUT, DELETE | DELIBERATELY DIFFERENT | POST, GET, PATCH; no PUT or DELETE. `test_api.py:229` asserts there is no DELETE. Today: `DELETE /projects/1` returned `405` | Already explained (`README.md:338-341`) |
| 201 create, 200 success, 400, 404 | MET | `test_api.py:209` (201 and the new resource); `/projects/999999` returned `{"error": "Project not found."} 404` today | |
| 204 on delete | DELIBERATELY DIFFERENT | Archive returns 200 and the archived record | |
| JSON responses | MET | Every handler returns a dict (`api/handlers.py`) | |
| Consistent error format | MET | Always `{"error": ...}`, plus `field` when one input is at fault (`api/errors.py:1-5`) | |
| Query parameters for filtering | MET | Today: `GET /projects?search=apo&status=ACTIVE` returned 200 with Apollo; filters: `api/http.py:20-21` | |
| 500 for server errors | MET | Generic message, details logged (`test_api_read_walk.py:226,235`) | |
| Friendly errors in the browser | MET | The server's message is shown on its field (`FormDialog.jsx:128`) | |
| Network errors handled | MET | `services/request.js:93`: a failed fetch becomes one plain message | |
| No inconsistent data after a failure | MET | Every write runs inside `atomic()`, together with its audit row; the integrity check runs after every test | |

**5. Frontend UI (`:290-296`) and 8. Frontend validation (`:357-361`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Responsive and adaptive | MET | `theme/responsive.js:1-8` (react-responsive); `tour.spec.js:47` at phone width | |
| High performance | **MET (night)** | Each signed-in page is its own file (`lazyPage`, defined in `components/lazyPage.js`): first download 739 kB to 560 kB. Afternoon status: one 703 KB file | |
| Real-time data | PARTLY (night: 10 s) | 10 s polling plus a pop-up (as above) | |
| Accessibility | MET (night: not tried with a screen reader) | Contrast notes (`theme.js:6-14`); `aria-describedby` on fields; tests find elements by role and name; **an axe scan in the tour: 50 scans, no serious or critical problems** (`e2e/tour.spec.js:51,68`) | |
| State and feedback | **MET (night)** | as 5.3 | |
| PWA | MISSING | No manifest or service worker (`frontend/public` holds only two SVGs) | Say it's out of scope in the README; a manifest alone would make it installable, but not offline |
| AI features | MISSING | None | Say it's out of scope in the README; "intelligent features" aren't in the brief's feature list |
| Required fields marked | MET | `required` on fields (`FormDialog.jsx:50,154`), which shows MUI's asterisk | |
| Validate before submit | MET | Native `required` plus checks on money and duration (`FormDialog.jsx:97-114`) | |
| Error next to its field | MET | `helperText` (`FormDialog.jsx:42,162`) | |
| No submit until valid | MET | `if (Object.keys(problems).length) return` (`FormDialog.jsx:118`) | |
| Loading disables the form | **MET (night)** | While saving, every field and both buttons are disabled (`FormDialog.jsx:158,175,187-188`); confirm dialogs, sign-in, change-password, sign-off and My tasks cards do the same. Afternoon status: PARTLY | |

**6. Authentication, authorisation and roles (`:302-333`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Authenticate first, then authorise | MET | `api/app.py`: token, then the role from the database, then the route's roles | |
| Permission checks in one place | MET | One route table (`api/routes.py`), one `authorise` | |
| Hide actions the user can't take | MET | e.g. "Archive project" for admins only (`ProjectDetailPage.jsx:94`); role-based buttons tested in RTL | |
| Secure login (JWT) | MET | `services/tokens.py` | |
| Password hashing | MET | PBKDF2-SHA256, 600k rounds (`README.md:104-106`) | |
| A token on every endpoint | MET | `test_api.py:111` (every non-public route needs one); today, no token gave `401` | |
| Token expiry **and refresh** | **MET (night)** | Access token 15 minutes (`tokens.py:20`); refresh token rotated on each use, 8 hours from login, reuse ends every session (`services/sessions.py:30, 57-82`); `POST /auth/refresh` and `/auth/logout`; the website refreshes once on a 401 and keeps the session through a network blip (`services/request.js`). Afternoon status: PARTLY, 8 h token and no refresh | |
| Middleware before CRUD | MET | `api/app.py` runs before every handler | |
| Clear error for a bad or expired token | MET | "Your session is invalid or has expired. Please sign in again." (`tokens.py:21`) | |
| Roles defined | MET (named differently) | Admin, Manager, Employee (`routes.py:21`), not the rubric's example of Admin, Manager, Contributor, Viewer | |
| Endpoints limited by role | MET | Today: manager `POST /projects` returned `{"error": "Your role can't do this."} 403` | |
| Unauthorised writes refused | MET | `test_api.py:157`; `test_work.py:156,197,256` | |
| Read-only for limited roles | MET | Employees read projects but every project write is STAFF or ADMIN (`routes.py:63-67`) | |
| No privilege escalation | MET | Today: employee `PATCH /users/me {"role":"ADMIN"}` returned `{"error": "Role can't be changed here.", "field": "role"} 400`; `test_users.py:177` (no one edits their own role), `:196` (not even an admin); role re-read from the database (`test_api.py:144`) | |
| Consistent "access denied" | MET | 403 with one message; 404 for things that exist but aren't yours, word for word the same as missing (`test_api.py:283`, `test_api_read_walk.py:195`) | |

**7. Endpoint reference (`:337-343`):** DELIBERATELY DIFFERENT. Same resource shape, but
PATCH for PUT and `POST /{id}/archive` for DELETE (see API design above).

## 2. `MVP.md`

| Line | Item | Status | Evidence |
| --- | --- | --- | --- |
| 14 | Q1 status of each project | MET | `GET /dashboard/projects`, `/projects`; `DashboardPage.jsx`, `ProjectsPage.jsx`; `demo.spec.js:37` |
| 15 | Q2 at risk, with the reason | MET | `GET /dashboard/at-risk`; `test_dashboard.py:59` |
| 16 | Q3 allocation grid | MET | `GET /dashboard/allocation`; `AllocationPage.jsx` |
| 17 | Q4 deliverables: progress, **timeline**, sign-off | **MET (night)** | Progress and sign-off: `DeliverablesTab.jsx`, `test_work.py:68-87`. Timeline: the drawn deliverables timeline on each project (`components/charts/`, `e2e/timeline.spec.js`). Afternoon status: PARTLY, a list with no drawn timeline |
| 18 | Q5 over-allocated, flagged | MET | `?overOnly=true`; `demo.spec.js` (Ben "Over-allocated", Apollo 25 h, Zeus 20 h) |
| 19 | Q6 dependency view | MET | `GET /projects/{id}/dependency-graph`; `DependencyPage.jsx`; `demo.spec.js` (Launch blocked) |
| 20 | Q7 budget bar | MET | `GET /projects/{id}/budget`; `BudgetBar.jsx`; `BudgetTab.jsx`. Demo gap: no seeded project is over budget (set Zeus's budget to $2,000 live) |
| 26 | Login, forced change, JWT, hashing | MET | `routes.py:48-50`; `ChangePasswordPage.jsx`; `RequireRole.jsx` |
| 27 | Three roles, checked on the server | MET | `routes.py:21` |
| 28 | CRUD projects (archive and reactivate) | MET | `routes.py:62-67` |
| 29 | CRUD deliverables, tasks, dependencies | MET | `routes.py:77-95` |
| 30 | CRUD resources (bookings) | MET | `routes.py:72-75`; `ResourcesTab.jsx`. Note: bookings can be archived but have no reactivate route; a new booking replaces one |
| 31 | Budget: planned and consumed | MET | `services/dashboard.py`; `test_work.py:187` (rate frozen on the entry) |
| 32 | Search and filter **on every list**, on the server, paginated | PARTLY | Name search: Projects, People, Dashboard. Filters: status (Projects, Dashboard, Requests), role (People), actor/entity/date (Audit), over-only (Allocation), unread (Notifications). None on Approvals, My tasks or the per-project tabs (`list_bookings`, `list_milestones`, `list_tasks` return the whole list, `handlers.py:156,174,219`). Smallest fix: change the wording to "every top-level list" (per-project lists are short) |
| 33 | Phones: tables become cards; the grid scrolls | MET | `DataTable.jsx`; `tour.spec.js:47` |
| 37-40 | Accounts: generated username and password, self-edit, admin reset | MET | `routes.py:53-58`; `test_users.py` |
| 46-50 | Tasks; pull board (Ready, Take this, limit 2) | MET | `routes.py:91-97`; `test_claim_race.py`; `pull.spec.js:69` |
| 51-55 | Status moves; progress; Blocked; sign-off | MET | `test_work.py:63-98` |
| 56-59 | Log time; line manager or admin approves; approved time only, at the frozen rate | MET | `test_work.py:187-256` |
| 60-63 | Capacity, overtime switch, task limit | MET | `test_work.py:224,233`; `test_users.py:215-240` |
| 67-81 | Who can do what | MET | `routes.py`; `test_api_audit_walk.py`; `tour.spec.js` per role. "Manager: request a new project" is `routes.py:107` |
| 88-90 | Rule 1: overtime refused; over-booking flagged | MET | `test_work.py:224`; `test_dashboard.py:160` |
| 91-92 | Rule 2: nothing deleted | MET | `test_no_delete.py`; `test_api.py:229,233` |
| 93 | Rule 3: no dependency loops, none across projects | MET | `test_work.py:112,120` |
| 94-95 | Rule 4: sign-off waits for all work | MET | `test_work.py:68,74` |
| 96-97 | Rule 5: whole cents | MET | `test_domain.py:84-89`; `services/format.js` |
| 98 | Rule 6: approved time only; nobody approves their own | MET | `test_work.py:248,256`; a database CHECK (`README.md:82`) |
| 99-100 | Rule 7: every change audited, people above notified | MET | `test_audit.py:33-74`; `test_api_audit_walk.py` |
| 101-102 | Rule 8: "not found", not "forbidden" | MET | `test_api.py:283` |
| 103-105 | Rule 9: integrity check | MET | `GET /admin/integrity-check`; `test_integrity.py` |
| 109-116 | Money and risk formulas | MET | `services/dashboard.py`; `domain/money.py` |
| 120-123 | Screens list | MET | `frontend/src/pages/*`: all 12 listed screens, plus My account |
| 127-130 | Out of the MVP | MET (as scoped; night: refresh tokens have since been built) | Dark mode and email: absent, as listed |
| (night) | Schedule: people by weeks, a bar per booking | MET, new | `pages/schedule/SchedulePage.jsx`; `e2e/schedule.spec.js`; managers and admins only. Not in the afternoon list |
| (night) | Employee history | MET, new | `GET /users/{id}/history`; `e2e/history.spec.js` |

## 3. CLAUDE.md, "The brief's feature list"

Each row matches a row above, so this is only a cross-reference.

| Brief says | Status | See |
| --- | --- | --- |
| Authentication and authorisation | MET | Rubric section 6 |
| Role-based access control | MET | Rubric section 6 |
| CRUD: projects, deliverables, resources, budget | MET (D = archive) | MVP lines 28-31 |
| Search and filter | PARTLY | MVP line 32 |
| Responsive design | MET | MVP line 33 |
| "Real-time visibility" | PARTLY (polling every 10 s, as decided) | Rubric section 1, real-time |
| Git, Terraform, shell scripts, AWS serverless | MET | `bin/*.sh`, `infra/`; rubric 1.4 |
| Deliverables labelled "Deliverables", resources labelled "Resources" | MET | `DeliverablesTab.jsx`, `ResourcesTab.jsx` |

## Already queued (not counted as gaps here)

Night update: every item in this table is now built and committed (none is on AWS yet).

| Item | Closes | Source |
| --- | --- | --- |
| Dashboard graphs | Q4 timeline wording, "real-time visibility" | `docs/superpowers/plans/2026-10-14-dashboard-graphs.md` |
| 15-minute token plus refresh | Rubric "token expiration and refresh" | notes.txt:15 |
| Employee history | not a rubric line (David's request) | notes.txt:21 |
| k6 load test | T7 (named tool) | notes.txt:6 |
| Code splitting and cleanup | Frontend "high performance" | notes.txt:26 |
| Archive as a request (a manager asks, an admin approves) | not a rubric line; helps "how can you delete projects" | notes.txt:20,33 |
| Faster bell: 10 s visible polling, check on return, Snackbar (WebSockets ruled out, research done) | Real-time | notes.txt:5,38; `2026-10-14-websockets-findings.md`; `2026-10-14-notification-delay-findings.md` |

## Gaps worth closing before the demo (smallest first)

Night update: gaps 1, 3, 4 and 5 are closed (1: README, "Trade-offs and assumptions"; 3: forms locked while saving; 4: `frontend/e2e/timelog.spec.js`; 5: `frontend/e2e/project-lifecycle.spec.js`). Gap 2 (ask an evaluator about archive) is still open. The text below is the afternoon's.

1. **Say "not built, on purpose" for PWA, AI features and background jobs.** Add three
   lines under "Trade-offs" in `README.md`. Evaluators tick these off the rubric's list,
   and a stated reason scores better than silence. Docs only, no code.
2. **Ask an evaluator whether archive counts as the D in CRUD.** This is still open
   (CLAUDE.md, open items). No code; it settles three DELIBERATELY DIFFERENT rows at
   once.
3. **Lock the form while it saves.** In `components/FormDialog.jsx`, wrap the fields in
   `<fieldset disabled={busy}>`, and add one RTL test that the fields are disabled while
   the request is pending. About 5 lines. This closes "loading states should disable
   form interaction".
4. **Browser test: an employee logs time, then the manager approves it.** One new
   `frontend/e2e/approve.spec.js`: Chloe logs 1 h, Sam opens Approvals and approves, the
   budget's consumed figure goes up. This closes the biggest critical-path gap the README
   names (`README.md:253-254`) and shows the bell on screen (notes.txt:5).
5. **Browser test: an admin creates, edits, archives and reactivates a project.** One
   spec. With gap 4, every CRUD write journey would then have a browser test, which makes
   "100% of critical paths end to end" defensible.
