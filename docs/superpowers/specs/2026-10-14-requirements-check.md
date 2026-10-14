# Requirements check (14 Oct 2026, afternoon)

What this is: every line of the workshop rubric and of `MVP.md`, checked against the code
as it stands on branch `David` (written against commit `88a052d` plus the pull board work
then in progress; line citations rechecked against `1aa55bd` at 14:48). Each row says **MET**, **PARTLY**, **MISSING** or **DELIBERATELY DIFFERENT**,
with the evidence, and for PARTLY or MISSING the smallest thing that would close it.

## Verdict

- **`oldmvp.md` is the rubric, unchanged.** `diff oldmvp.md docs/full-stack.md` prints
  one difference: `oldmvp.md` has no newline after the final `</nav>` (line 395). Every
  word is the same, so checking `docs/full-stack.md` checks both.
- **Everything in `MVP.md` is built.** Two items are thinner than their wording: no
  deliverable *timeline* drawing (question 4 shows due dates in a list), and "search and
  filter on every list" holds for the main lists only.
- **Against the rubric:** the core is met and tested: CRUD, validation, error shape,
  roles, persistence, responsive layout, deploy scripts, load test. The gaps are of three
  kinds:
  1. **Departures we chose:** archive instead of DELETE/204, PATCH instead of PUT, no
     refresh token.
  2. **Rubric extras we haven't built:** offline install (PWA), AI features, background
     (async) jobs.
  3. **End-to-end tests:** the browser tests cover the manager's read journey and the
     pull board, not yet the other write journeys (log time then approve; create then
     archive).
- **Coverage, measured today:** backend 96%, API layer 100%, frontend 93.6% statements
  and 95.2% lines. Every number-based goal is met. "100% of critical paths end to end" is
  only partly met (see Testing).
- **README test count:** `README.md:224` said 231 website tests when this was written; by
  14:48 the other workflow had changed it to 233, which matches today's run.

## Coverage, measured 14 Oct

| Goal (rubric `docs/full-stack.md:105-111`) | Target | Measured | Command and output |
| --- | --- | --- | --- |
| Backend components | 80% | **96%** (1,847 statements, 73 missed) | `.venv/bin/pytest --cov=backend/tracker -q`: `TOTAL 1847 73 96%`, `423 passed in 27.53s` |
| Frontend components | 80% | **93.62% statements, 95.18% lines** (branches 89.94%, functions 89.29%) | `npx vitest run --coverage`: `Tests 233 passed (233)` |
| API endpoints, all CRUD | 90% | **100%** of `api/` plus `domain/errors.py` (335 statements, 0 missed; `api/` alone 321): routing, handlers, error map | `.venv/bin/coverage report --include='backend/tracker/api/*,backend/tracker/domain/errors.py'`: `TOTAL 335 0 100%` |
| Error handling (validation and error cases) | 90% | **100%** of the error map (`api/errors.py`, `domain/errors.py`). Most of the 73 missed backend lines are guard branches for ids that don't exist (`README.md:240-256`) | same command as the row above |
| Critical user paths, end to end | 100% | **PARTLY**: see the Testing table | `frontend/e2e/*.spec.js` |

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
| 4.1 | Unit and integration tests for business logic and API | MET | 423 backend tests: `tests/backend/test_work.py`, `test_api.py`, both walk tests | |
| 4.2 | Frontend core journeys and error states | MET | 233 Vitest + RTL tests; refusals shown as written (`README.md:230-233`) | |
| 4.3 | Manual validation, UI through to the database | MET | `docs/superpowers/plans/2026-10-13-manual-verification.md`; `tools/demo.py demo` ends on the integrity check | |
| 4.4 | Test commands, results and gaps documented | MET | `README.md:190-256`; `docs/TESTING.md` | |
| 5.1 | Set up locally with documented commands | MET | `README.md:172-188`; CLAUDE.md §4 | |
| 5.2 | README covers architecture, trade-offs, assumptions | MET | `README.md:35-170`, `336-367` | |
| 5.3 | Clear loading, success and failure feedback | PARTLY | Loading and failure: `components/PageState.jsx:9` (spinner, error with Retry, empty). Success: mostly implied (the dialog closes and the list refreshes); an explicit message only on Requests (`RequestsPage.jsx:87`) | Show an MUI `Snackbar` saying "Saved" when `FormDialog` succeeds |
| 5.4 | Ownership, communication, pragmatic decisions | MET | `docs/OVERNIGHT-REPORT.md`, `docs/GUIDE.md`, the decision table in CLAUDE.md | |

### Testing expectations (`full-stack.md:86-111`)

| # | Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- |
| T1 | Backend unit tests | MET | `test_domain.py`, `test_security.py`, plus service rule tests that never import `api` | |
| T2 | Integration tests with a real database | MET | Every test runs on real Postgres (`tracker_test`), each one rolled back (`tests/backend/conftest.py`) | |
| T3 | Error tests for CRUD | MET | `test_api.py:177` (bad JSON is 400), `test_api_read_walk.py:206` (bad query is 400 naming the field), `:226` (a crash is a bare 500) | |
| T4 | Component tests (Jest + RTL) | MET | Vitest + RTL, Jest-compatible (CLAUDE.md §8); `*.test.jsx` beside each screen | |
| T5 | API service tests with mocked responses | MET | `services/request.test.js` (fetch stubbed) | |
| T6 | End-to-end tests (Cypress or Selenium) | MET (Playwright) | `e2e/demo.spec.js:37`, `pull.spec.js:69`, `tour.spec.js:47,74`. Playwright fills the same role as Selenium | |
| T7 | Load test (Artillery or JMeter) | MET (own tool) | `tools/loadtest.py`; on AWS, 25 users, 16,184 reads, 539 req/s, 2 failed (`README.md:269-275`) | **Queued:** k6 (notes.txt:6) |
| T8 | Performance monitoring | PARTLY | CloudWatch `REPORT` lines, 6 ms p50 inside Lambda (`README.md:276-277`); `tools/console.py logs`; no dashboard or alarm | Name the CloudWatch log command in the README (one line) |
| T9 | Critical user paths 100% end to end | PARTLY | Covered: sign-in, the seven questions (`demo.spec.js:37`), phone layout (`:67`), pull board (`pull.spec.js:69`), every screen for every role (`tour.spec.js:47`), deep-link refresh (`:74`). **Not covered:** an employee logs time and the manager approves it (`README.md:253-254`); an admin creates, edits, archives and reactivates a project; the forced password change at first sign-in | One Playwright spec per missing journey (gaps 4 and 5 below) |

### Implementation expectations (`full-stack.md:164-381`)

**1. Backend service (`:174-187`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Store and manage data | MET | 10 tables, `store/migrations/001_init.sql`, `002_task_limit.sql` | |
| Authenticate and authorise | MET | See section 6 below | |
| API endpoints | MET | 66 routes, `api/routes.py:46-122` | |
| Business logic | MET | `services/`; rules listed in `MVP.md:86-105` | |
| Real-time | PARTLY | The bell polls every 30 s, and at once after a write made in the same tab (`components/NotificationBell.jsx:7`, `:24`); no push. David saw the delay in practice (notes.txt:5) | WebSockets researched: not possible on the workshop account (`2026-10-14-websockets-findings.md`). Recommended instead: poll every 10 s while the tab is visible, check on return to the tab, and show a Snackbar (`2026-10-14-notification-delay-findings.md`, section 6) |
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
| High performance | PARTLY | One 703 KB JavaScript file (`frontend/dist/assets/index-*.js`, built 14 Oct 14:22) | **Queued:** split the code per screen (`React.lazy`) |
| Real-time data | PARTLY | 30 s polling (as above) | As above: 10 s visible polling plus a Snackbar |
| Accessibility | MET (not re-checked with a screen reader) | Contrast notes (`theme.js:6-14`); `aria-describedby` on fields (`FormDialog.jsx:52`); tests find elements by role and name; no axe scan | Optional: add `@axe-core/playwright` to the tour |
| State and feedback | PARTLY | as 5.3 | Snackbar |
| PWA | MISSING | No manifest or service worker (`frontend/public` holds only two SVGs) | Say it's out of scope in the README; a manifest alone would make it installable, but not offline |
| AI features | MISSING | None | Say it's out of scope in the README; "intelligent features" aren't in the brief's feature list |
| Required fields marked | MET | `required` on fields (`FormDialog.jsx:50,154`), which shows MUI's asterisk | |
| Validate before submit | MET | Native `required` plus checks on money and duration (`FormDialog.jsx:97-114`) | |
| Error next to its field | MET | `helperText` (`FormDialog.jsx:42,162`) | |
| No submit until valid | MET | `if (Object.keys(problems).length) return` (`FormDialog.jsx:118`) | |
| Loading disables the form | PARTLY | Only the submit button is disabled while saving (`FormDialog.jsx:175`); the fields stay editable | Wrap the fields in `<fieldset disabled={busy}>` (gap 3) |

**6. Authentication, authorisation and roles (`:302-333`)**

| Expectation | Status | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Authenticate first, then authorise | MET | `api/app.py`: token, then the role from the database, then the route's roles | |
| Permission checks in one place | MET | One route table (`api/routes.py`), one `authorise` | |
| Hide actions the user can't take | MET | e.g. "Archive project" for admins only (`ProjectDetailPage.jsx:94`); role-based buttons tested in RTL | |
| Secure login (JWT) | MET | `services/tokens.py` | |
| Password hashing | MET | PBKDF2-SHA256, 600k rounds (`README.md:104-106`) | |
| A token on every endpoint | MET | `test_api.py:111` (every non-public route needs one); today, no token gave `401` | |
| Token expiry **and refresh** | PARTLY | Expiry: 8 h (`tokens.py:20`; `test_security.py:68`). Refresh: none, by decision (`MVP.md:127`, `README.md:348-349`) | **Queued:** 15-minute token plus refresh (notes.txt:15) |
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
| 17 | Q4 deliverables: progress, **timeline**, sign-off | PARTLY | Progress and sign-off: MET (`DeliverablesTab.jsx`, `test_work.py:68-87`). Timeline: a list ordered by position, then due date (`milestones.py:77`), with no drawn timeline. **Queued:** the dashboard graphs (`docs/superpowers/plans/2026-10-14-dashboard-graphs.md`). Smallest fix: change the MVP wording to "due dates" |
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
| 127-130 | Out of the MVP | MET (as scoped) | Dark mode, refresh tokens, email: absent, as listed |

## 3. CLAUDE.md, "The brief's feature list"

Each row matches a row above, so this is only a cross-reference.

| Brief says | Status | See |
| --- | --- | --- |
| Authentication and authorisation | MET | Rubric section 6 |
| Role-based access control | MET | Rubric section 6 |
| CRUD: projects, deliverables, resources, budget | MET (D = archive) | MVP lines 28-31 |
| Search and filter | PARTLY | MVP line 32 |
| Responsive design | MET | MVP line 33 |
| "Real-time visibility" | PARTLY (polling, as decided) | Rubric section 1, real-time |
| Git, Terraform, shell scripts, AWS serverless | MET | `bin/*.sh`, `infra/`; rubric 1.4 |
| Deliverables labelled "Deliverables", resources labelled "Resources" | MET | `DeliverablesTab.jsx`, `ResourcesTab.jsx` |

## Already queued (not counted as gaps here)

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
