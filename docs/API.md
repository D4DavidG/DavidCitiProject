# The API

For anyone who wants to call the tracker's API directly (Swagger UI, Postman, VS Code, curl) or
see how it decides who may do what. Back to the [project README](../README.md) ·
[all the docs](README.md).

**Contents:** [What it is](#1-what-the-api-is) · [Who may do what](#2-who-may-do-what) ·
[Answers and errors](#3-the-shape-of-every-answer) · [Logins](#4-logins) ·
[Swagger UI](#5-swagger-ui-step-by-step) · [Postman](#6-postman-and-swaggerhub) ·
[VS Code](#7-vs-codes-rest-client) · [curl](#8-curl) · [The OpenAPI file](#9-the-openapi-file) ·
[CORS](#10-cors-why-swagger-ui-can-call-the-api) · [Every route](#11-every-route-by-group)

## 1. What the API is

- **One program answers every call:** a Python function on AWS Lambda,
  [`backend/tracker/function.py`](../backend/tracker/function.py), a plain `handler(event, context)`
  with no web framework. The website uses the same API you call here.
- **Two addresses, same API:**

  | Where | Base URL | Needs |
  | --- | --- | --- |
  | AWS (live) | `https://d1gov8jpsxhwer.cloudfront.net/api/tracker` | nothing |
  | Your machine | `http://localhost:3001/api/tracker` | `./bin/start-dev.sh` running ([SETUP.md](SETUP.md)) |

- **One route table:** [`backend/tracker/api/routes.py`](../backend/tracker/api/routes.py) lists
  every endpoint: method, path, which roles may call it, and the function that answers. 71
  operations (section 11 lists them all). Every call goes the same way
  ([`api/app.py`](../backend/tracker/api/app.py)):

  ```
  request -> http.parse -> routes.match -> authorise -> handler -> service (the business rules) -> Postgres
          <- http.respond <-------------- errors.to_response (when a rule refuses)
  ```

- **JSON in and out, camelCase names** (`budgetCents`, `pageSize`). Money is whole cents
  (`budgetCents: 12000000` is $120,000.00). Dates are `YYYY-MM-DD`; "today" and weeks use
  Eastern time.
- **Nothing is ever deleted.** Records are archived and reactivated
  (`POST /projects/7/archive`, `POST /projects/7/reactivate`). There is no DELETE route:
  `DELETE /projects/1` answers 405 `{"error": "DELETE is not allowed on /projects/1."}`, and
  `test_there_is_no_delete_route_anywhere` in
  [`tests/backend/test_api.py`](../tests/backend/test_api.py) keeps it that way. Why:
  [DECISIONS.md](DECISIONS.md).

## 2. Who may do what

Three roles: **admin**, **manager**, **employee**. Every call passes three checks, in this order.

| Check | Where | Refusal |
| --- | --- | --- |
| 1. Signed in? | `authorise()` in [`api/app.py`](../backend/tracker/api/app.py) checks the `Authorization: Bearer ...` token | 401 `Your session is invalid or has expired. Please sign in again.` |
| 2. Can this role ever do this? | the route table's roles column | 403 `Your role can't do this.` |
| 3. Is this record yours to see or change? | the services (for example [`services/access.py`](../backend/tracker/services/access.py)) | 404, the same answer as a record that doesn't exist |

- **The role comes from the database on every call, never from the token.** The token only
  proves who signed in. Demote someone and they lose access on their next call.
- **404, never 403, for something that exists but isn't yours.** A manager asking for another
  manager's project gets exactly the bytes a missing project gives (`{"error": "Project not
  found."}`), so the API never confirms that a record exists. Tested by
  `test_another_managers_project_is_byte_identical_to_a_missing_one`
  ([`tests/backend/test_api.py`](../tests/backend/test_api.py)).
- **Who sees which records:** admins see everything, archived records too. Managers see the
  projects they manage. Employees see the projects they are booked on, and only their own
  account. Salaries: admins and the person only.
- **First sign-in:** an account starts with a generated password. Until it is changed, every
  route except `GET /auth/me` and `POST /auth/change-password` answers 403
  `Change your generated password before continuing.`
- **Tokens:** `POST /auth/login` returns a `token` that lasts 15 minutes and a `refreshToken`
  (good for 8 hours from sign-in). `POST /auth/refresh` trades the refresh token for a new pair;
  each refresh token works once, and reusing an old one ends every session of that person.
  `POST /auth/logout` ends the session.

## 3. The shape of every answer

**Errors** are always `{"error": "a sentence a person can read"}`, plus `field` when one input is
at fault (the website uses it to mark that box red) or `code` when the caller can act on it. One
table maps each kind of refusal to a status ([`api/errors.py`](../backend/tracker/api/errors.py)):

| Status | Meaning | Example |
| --- | --- | --- |
| 400 | Bad input | `{"error": "First name is required.", "field": "firstName"}` |
| 401 | Not signed in, token expired, wrong password | `Username or password is incorrect.` |
| 403 | Your role can never do this, or the first-sign-in password change is pending | `Your role can't do this.` |
| 404 | Doesn't exist, or isn't yours | `Project not found.` |
| 405 | The path exists, the method doesn't | `DELETE is not allowed on /projects/1.` |
| 409 | Well formed, but the current state refuses it | a dependency loop, signing off unfinished work |
| 500 | A bug (logged on the server; no details sent) | `Something went wrong on our side. Nothing was changed.` |
| 503 | Database not reachable yet (Aurora waking up) | `The database is not ready. Please try again shortly.` |

Two 409s carry a `code` and can be confirmed by sending the same request again with one extra
field:

| `code` | When | Send again with |
| --- | --- | --- |
| `OVER_CAPACITY` | logging time past the person's weekly capacity, with overtime off | `"confirmOverCapacity": true` (the entry is saved and marked "Over capacity") |
| `ON_PROJECTS` | archiving a person still on a live project (a booking that hasn't ended, or an open task); the message names the projects | `"confirmOnProjects": true` (their bookings end; their open tasks stay assigned to them) |

**Lists** are always one page: `{"items": [...], "page": 1, "pageSize": 20, "total": 57,
"totalPages": 3}`. Ask with `?page=2&pageSize=50`; the default page size is 20 (10 on the
timeline) and the most is 100. The lists that have a search box on screen take `q`: people,
projects, your tasks, approvals, requests, notifications, the audit log, the dashboard and the
allocation grid. **Writes** return the record as it now is; a create answers 201, logout 204.

## 4. Logins

**On AWS** (the live site, https://d1gov8jpsxhwer.cloudfront.net). These are published on
purpose, so anyone reviewing the project can sign in as each role:

| Person | Role | Username | Password |
| --- | --- | --- | --- |
| System Administrator | Admin | `AD000001` | `gusmao123` |
| Maria Lopez | Manager | `ML662930` | `Demo-pass-2026` |
| Sam Patel | Manager | `SP918535` | `Demo-pass-2026` |
| Guy Gardner | Employee | `GG530359` | `bobyboby` |
| Ben Okafor | Employee | `BO435681` | `Demo-pass-2026` |
| Chloe Kim | Employee | `CK971979` | `Demo-pass-2026` |
| Dev Shah | Employee | `DS516414` | `Demo-pass-2026` |
| Ana Ruiz | Employee | `AR553882` | archived on AWS, so her sign-in is refused |

Usernames are initials plus six digits, made by the server and never changed. If one of these
passwords stops working, someone changed it: the admin can set a new one (People > Actions >
Reset password, or `POST /users/{id}/reset-password`).

**On your machine** the usernames are different: they are generated when
`tools/demo.py seed` fills the local database ([SETUP.md](SETUP.md)). List them with:

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -c "SELECT username, first_name || ' ' || last_name AS name, role, is_archived FROM users ORDER BY user_id;"
```

- Every seeded person's password is `Demo-pass-2026` (`DEMO_PASSWORD` in
  [`tools/demo.py`](../tools/demo.py)).
- The local admin is also `AD000001`. Its first password comes from Terraform, and must be
  changed at the first sign-in:

  ```sh
  terraform -chdir=infra output -raw bootstrap_admin_password
  ```

## 5. Swagger UI, step by step

Swagger UI is a web page that lists every API call and lets you send them with a button. Ours
is [`docs/swagger.html`](swagger.html); it reads [`docs/openapi.json`](openapi.json).

1. From the repo folder, start it (it serves `docs/` to this machine only; Ctrl+C stops it):

   ```sh
   ./tools/swagger.sh
   ```

2. Open http://localhost:8090/swagger.html in a browser on the same machine. (Opening the
   file straight from disk can't read `openapi.json`.)
3. **Pick the server** in the Servers list at the top:
   - `http://localhost:3001/api/tracker - Local: the proxy started by bin/start-dev.sh`
     (needs `./bin/start-dev.sh` running), or
   - `https://d1gov8jpsxhwer.cloudfront.net/api/tracker - AWS: CloudFront`.
4. **Sign in.** Open **auth > POST /auth/login**. The boxes are already editable. Body:

   ```json
   {"username": "ML662930", "password": "Demo-pass-2026"}
   ```

   Press **Execute**. 200 means signed in, and the padlocks close: the page copies the token
   into **Authorize** for you (the `responseInterceptor` in `swagger.html`). On AWS, the first
   call after a quiet spell can take about 15 seconds while the database wakes up.
5. **Call anything**, for example **dashboard > GET /dashboard/projects > Execute**. The
   filter box at the top finds a group by name. Each answer shows a ready-made curl command
   and how long the call took.
6. **After 15 minutes** every call answers 401: sign in again.
7. **To switch users, sign in again** as someone else. The new token replaces the old one.

**On AWS, stay with GET.** Anything else changes the live data and rings people's bells. Try
POST and PATCH on Local.

### Things to try

**A. Watch a notification being made (Local).** Ana is an employee whose line manager is
Maria.

1. Sign in as Ana. **users > PATCH /users/me** with `{"lastName": "Ruiz-Test"}`: 200.
2. Sign in as Maria. **notifications > GET /notifications/unread-count**, then
   **GET /notifications** with `unread` = true: the newest is "Ana Ruiz changed ...".
3. **POST /notifications/{id}/read** with that notification's `notificationId`: `isRead` is
   true and the count drops by one.
4. Undo: sign in as Ana and send `{"lastName": "Ruiz"}`.

The change, its audit row and its notifications are saved together or not at all; how is in
[ARCHITECTURE.md](ARCHITECTURE.md).

**B. Read the audit log as the admin** (reads only, so fine on AWS too):

1. Sign in as `AD000001`.
2. **users > GET /users** with `q` = Ana: note her `userId`.
3. **admin > GET /admin/audit-log** with `entityType` = users, `entityId` = her `userId`,
   `pageSize` = 5: each row has `beforeState` and `afterState`, newest first. Other filters:
   `q`, `actorId`, `dateFrom`, `dateTo`.
4. **users > GET /users/{id}/history** with her `userId`: what she did and what was done to her
   account, newest first.
5. **admin > GET /admin/integrity-check**: every list is empty when the data is healthy.

**C. Watch the API refuse** (sign in as an employee: Ana locally, Ben on AWS). None of these
changes anything:

| Call | Answer | What it shows |
| --- | --- | --- |
| `GET /admin/audit-log` | 403 `Your role can't do this.` | the route table: admins only |
| `GET /users/{id}` with someone else's id | 404 `User not found.` | not yours is answered as if it didn't exist |
| `PATCH /users/me` with `{"firstName": ""}` | 400 `First name is required.`, `field: firstName` | the server checks every input |
| **Authorize > Logout**, then `GET /auth/me` | 401 `Your session is invalid or has expired. Please sign in again.` | no token, no access |

## 6. Postman and SwaggerHub

1. In Postman: **Import > Upload files**, pick [`docs/openapi.json`](openapi.json), import it
   as a collection. Every call arrives, in the same groups as Swagger UI.
2. The collection's base URL is the first server in the file (Local). For AWS, change it to
   `https://d1gov8jpsxhwer.cloudfront.net/api/tracker`.
3. Send **POST /auth/login** with a body from section 4, copy `token` from the answer, and
   paste it as the collection's **Bearer Token** (the Authorization tab).

SwaggerHub imports the same file (**Import API**).

## 7. VS Code's REST Client

[`tools/tracker.http`](../tools/tracker.http) is a list of ready requests, all reads, for the
REST Client extension (`humao.rest-client`).

1. Install **REST Client** in VS Code and open `tools/tracker.http`.
2. The `@baseUrl = {{aws}}` line picks the server; change it to `{{local}}` for your machine.
3. Press **Send Request** above "Log in as the admin". It asks for `AD000001`'s password
   (`gusmao123` on AWS); nothing secret is stored in the file.
4. Press **Send Request** above any other request; they reuse the token. After 15 minutes they
   answer 401: log in again.

## 8. curl

Checked against the live API on 15 Oct. For your machine, set `API` to
`http://localhost:3001/api/tracker` and use your local Maria's username (section 4).

```sh
API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker
curl -s -w '\n' $API/health                           # {"status": "ok"}: Lambda and database are up

# Sign in as Maria and keep the token
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"username": "ML662930", "password": "Demo-pass-2026"}' | jq -r .token)

# The dashboard, one project per page (total and atRiskTotal still count every page)
curl -s "$API/dashboard/projects?pageSize=1" -H "Authorization: Bearer $TOKEN" | jq '{total, atRiskTotal, totalPages}'

# Four refusals; each prints the answer, then the status
curl -s -w ' %{http_code}\n' $API/admin/audit-log -H "Authorization: Bearer $TOKEN"        # 403: managers can't read the audit log
curl -s -w ' %{http_code}\n' $API/projects/999999 -H "Authorization: Bearer $TOKEN"        # 404: Project not found.
curl -s -w ' %{http_code}\n' $API/auth/me                                                    # 401: no token
curl -s -w ' %{http_code}\n' -X DELETE $API/projects/1 -H "Authorization: Bearer $TOKEN"   # 405: nothing is deleted
```

## 9. The OpenAPI file

[`docs/openapi.json`](openapi.json) describes every call (path, method, roles as `x-roles`,
body fields, filters, answers) in the OpenAPI 3.0.3 format that Swagger UI, Postman and
SwaggerHub read. It is **built from the route table**, not written by hand, by
[`tools/openapi.py`](../tools/openapi.py). After adding or changing a route, rebuild it:

```sh
.venv/bin/python tools/openapi.py
```

[`tests/backend/test_openapi.py`](../tests/backend/test_openapi.py) fails until you do
(`test_openapi_file_is_up_to_date`). Its other tests check that every route appears once, that
the roles and status codes match the route table, and that the documented body fields match what
the services accept. More on the tests: [TESTING.md](TESTING.md).

## 10. CORS: why Swagger UI can call the API

The website and the API share one address on AWS (CloudFront sends `/api/tracker*` to the
Lambda), so the browser never has to ask permission there. Swagger UI is different: it runs on
`http://localhost:8090`, another address, so before a call with a token the browser first asks
the API whether that is allowed (a "preflight", the CORS rules). The answer must **name** the
`Authorization` header, because the Fetch standard says `*` never covers it.

| Where | Who answers the preflight | Headers it names |
| --- | --- | --- |
| Local | the proxy, [`bin/proxy-server.js`](../bin/proxy-server.js) (line 42) | `Authorization, Content-Type` |
| AWS | the Lambda's Function URL, [`infra/lambda.tf`](../infra/lambda.tf) (lines 46 to 50) | `authorization`, `content-type` |

The AWS setting changed from `*` on 15 Oct and reaches AWS with the next
`./bin/deploy-backend.sh`. Swagger UI on AWS already worked in Chromium and Firefox that day, but
Firefox warns that it will stop accepting `*`.

## 11. Every route, by group

From [`backend/tracker/api/routes.py`](../backend/tracker/api/routes.py). "Who may call" is the
route table's gate (403 for any other role); the services then narrow it to your own records
(404). The status is 200 unless shown. Each route's text is the first line of its function's
description, which is also its summary in Swagger UI.

### Health and sign-in

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /health` | anyone (no token) | Check the API and the database are up. |
| `POST /auth/login` | anyone (no token) | Log in with username and password; get a 15-minute token and a refresh token. |
| `POST /auth/refresh` | anyone (no token) | Trade a refresh token for a new token pair. |
| `POST /auth/logout` (204) | anyone (no token) | End the session that owns this refresh token. |
| `GET /auth/me` | any signed-in user | Get your own account. |
| `POST /auth/change-password` | any signed-in user | Change your password (required on first login); get a new token pair. |

### People (`/users`)

Employees see only their own account. History and a person's projects: admins, the person's line
manager and the person; anyone else gets 404. Only admins see the before/after state.

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /users` | admin, manager | List people, with search and filters. |
| `POST /users` (201) | admin | Create an account; the answer shows the generated password once. |
| `PATCH /users/me` | any signed-in user | Change your own name or email. |
| `GET /users/{id}` | any signed-in user | Get one person. |
| `GET /users/{id}/history` | any signed-in user | One person's trail; only admins get the before/after state. |
| `GET /users/{id}/projects` | any signed-in user | List the live projects a person is on: bookings from today on, and open tasks. (The archive warning shows this list.) |
| `PATCH /users/{id}` | admin | Change a person's account details (admin). |
| `PATCH /users/{id}/capacity` | admin, manager | Set a person's weekly capacity, overtime and task limit. |
| `POST /users/{id}/reset-password` | admin | Reset a person's password; the answer shows the new one once. |
| `POST /users/{id}/archive` | admin | Archive a person (there is no delete); someone on live projects needs confirmOnProjects. Without `"confirmOnProjects": true` in the body: 409 `ON_PROJECTS`, and nothing changes. |
| `POST /users/{id}/reactivate` | admin | Reactivate an archived person. |

**Minimum pay:** creating anyone, or changing a salary, refuses less than $20 an hour. Pay is
yearly, and an hour is the yearly pay / 2,080, so the least is $41,600 a year
(`annualSalaryCents` of at least `4160000`). Less answers 400
`{"error": "Pay must be at least $20 an hour ($41,600 a year).", "field": "annualSalaryCents"}`
(`MIN_ANNUAL_SALARY_CENTS` in [`domain/money.py`](../backend/tracker/domain/money.py)). A
salary set before the rule stays until someone changes it.

### Projects

Admins see every project; managers the ones they manage; employees the ones they are booked on.

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /projects` | any signed-in user | List projects, with search and filters. |
| `POST /projects` (201) | admin | Create a project. |
| `GET /projects/{id}` | any signed-in user | Get one project. |
| `PATCH /projects/{id}` | admin, manager | Change a project's details or budget. |
| `POST /projects/{id}/archive` | admin | Archive a project (there is no delete). |
| `POST /projects/{id}/reactivate` | admin | Reactivate an archived project. |
| `GET /projects/{id}/budget` | admin, manager | Get a project's budget: planned and consumed cost against the budget. |
| `GET /projects/{id}/dependency-graph` | any signed-in user | Get a project's Deliverables and the dependencies between them. |
| `GET /projects/{id}/board` | any signed-in user | Get a project's pull board: its tasks and who holds them. |

### Resources (bookings: a person's hours per week on a project)

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /projects/{id}/assignments` | any signed-in user | List a project's Resources (bookings: person x hours per week). |
| `POST /projects/{id}/assignments` (201) | admin, manager | Book a person onto a project (a Resource). |
| `PATCH /assignments/{id}` | admin, manager | Change a booking's hours or dates. |
| `POST /assignments/{id}/archive` | admin, manager | Archive a booking (there is no delete). |

### Deliverables (`milestones` in the code)

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /projects/{id}/milestones` | any signed-in user | List a project's Deliverables. |
| `POST /projects/{id}/milestones` (201) | admin, manager | Add a Deliverable to a project. |
| `GET /milestones/{id}` | any signed-in user | Get one Deliverable. |
| `PATCH /milestones/{id}` | admin, manager | Change a Deliverable's details. |
| `POST /milestones/{id}/archive` | admin, manager | Archive a Deliverable (there is no delete). |
| `POST /milestones/{id}/reactivate` | admin, manager | Reactivate an archived Deliverable. |
| `POST /milestones/{id}/sign-off` | admin, manager | Sign off a Deliverable (refused until its tasks and dependencies are done). |
| `POST /milestones/{id}/reopen` | admin, manager | Reopen a signed-off Deliverable. |
| `POST /milestones/{id}/dependencies` | admin, manager | Make a Deliverable depend on another one (loops are refused). |
| `POST /milestones/{id}/dependencies/{other_id}/archive` | admin, manager | Remove a dependency between two Deliverables. |

### Tasks

Managers create and assign; an employee takes Ready tasks up to their task limit and moves only
their own.

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /milestones/{id}/tasks` | any signed-in user | List a Deliverable's tasks. |
| `POST /milestones/{id}/tasks` (201) | admin, manager | Add a task to a Deliverable. |
| `PATCH /tasks/{id}` | admin, manager | Change a task's title, description, estimate or assignee. |
| `POST /tasks/{id}/status` | employee | Move your task to To Do, In Progress or Done. |
| `POST /tasks/{id}/claim` | employee | Take a Ready task from the pull board (up to your task limit). |
| `POST /tasks/{id}/release` | employee | Put your task back on the pull board. |
| `POST /tasks/{id}/archive` | admin, manager | Archive a task (there is no delete). |
| `POST /tasks/{id}/reactivate` | admin, manager | Reactivate an archived task. |
| `GET /me/tasks` | any signed-in user | List the tasks assigned to you. |
| `GET /me/ready-tasks` | employee | List the Ready tasks you can take, with how many you hold and your limit. |

### Logged time

Only the task's assignee logs time. The person's line manager or any admin approves it, never
their own. Only approved time counts as money spent.

| Route | Who may call | What it does |
| --- | --- | --- |
| `POST /tasks/{id}/time-entries` (201) | employee | Log time on your task. 409 `OVER_CAPACITY` past weekly capacity without overtime, unless the body has `"confirmOverCapacity": true`. |
| `GET /me/time-entries` | any signed-in user | List the time you have logged. |
| `PATCH /time-entries/{id}` | employee | Change your own time entry; it goes back to pending approval. |
| `POST /time-entries/{id}/approve` | admin, manager | Approve a time entry (never your own). |
| `POST /time-entries/{id}/reject` | admin, manager | Reject a time entry (never your own). |
| `GET /approvals/time-entries` | admin, manager | List the time entries waiting for your approval. |

### Requests

Employees ask their line manager (a higher task limit, overtime, anything else); managers ask
the admins (a new project, archiving one, anything else). Whoever was told when it was sent may
decide it: the employee's line manager or any admin, and for a manager's request any admin.
Approving applies the change at once. `GET /project-requests?scope=sent` lists the ones you
sent, `scope=decide` the ones you may decide.

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /project-requests` | any signed-in user | List the requests you sent or may decide. |
| `POST /project-requests` (201) | any signed-in user | Send a request (new project, archive, task limit, overtime or other). |
| `GET /project-requests/{id}` | any signed-in user | Get one request. |
| `POST /project-requests/{id}/approve` | admin, manager | Approve a request; the change it asks for is applied at once. |
| `POST /project-requests/{id}/reject` | admin, manager | Reject a request, with an optional note. |

### Dashboard

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /dashboard/projects` | admin, manager | Get the dashboard: each project's status, risk and budget, at risk first. `atRisk=true` keeps the at-risk projects, `atRisk=false` the on-track ones (the dashboard's two columns). `sort=updated` puts the latest change first; each project carries `lastActivityAt`, the latest change to it or anything in it (deliverables, tasks, bookings, logged time). `total` counts the filtered list across every page; `atRiskTotal` counts every at-risk project, whatever `atRisk` says. |
| `GET /dashboard/at-risk` | admin, manager | List the projects at risk of missing a deadline. |
| `GET /dashboard/allocation` | admin, manager | Get the allocation grid: people x weeks, flagged past capacity. Filters: `weekFrom`, `weeks`, `overOnly`, `projectIds`. |
| `GET /dashboard/timeline` | any signed-in user | Get a timeline of your projects: their dates, Deliverables and bookings. |

### Admin

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /admin/integrity-check` | admin | Run the integrity queries; every list must be empty. |
| `GET /admin/audit-log` | admin | List the audit log, with filters by actor, entity and date. |

### Notifications (the bell)

Your own only: someone else's notification id answers 404.

| Route | Who may call | What it does |
| --- | --- | --- |
| `GET /notifications` | any signed-in user | List your notifications. |
| `GET /notifications/unread-count` | any signed-in user | Count your unread notifications. |
| `POST /notifications/read-all` | any signed-in user | Mark all your notifications as read. |
| `POST /notifications/{id}/read` | any signed-in user | Mark one of your notifications as read. |
