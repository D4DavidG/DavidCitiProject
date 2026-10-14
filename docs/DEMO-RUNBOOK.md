# Demo runbook

What to run and click, in order, during a live demo, and what you should see.
**Last checked:** 14 Oct 2026, about 09:30 EDT, at commit `a52da44` (AWS up and warm, every website fix live).
**Not on AWS yet.** Everything built on 14 Oct after that check is committed and runs on the
local stack (section 7), but reaches AWS only after `./bin/deploy-backend.sh` and
`./bin/deploy-frontend.sh`:

- the **Hours** and **Minutes** boxes for typed time (AWS: one hours box);
- the **Copy username and password** button (AWS: **Copy password**, password only);
- the login-timing fix;
- the pull board: the **Board** tab, **Take this** and **Put back**, Ready to take on My
  tasks, Task limit on People (4 routes and migration `002_task_limit.sql`);
- the bell: asks every 10 s while the tab is visible, at once when you come back, with a
  pop-up when the count rises (AWS: every 30 s, no pop-up);
- the three charts: **Workload this week** and **Budget by project** on the Dashboard, and
  the **Deliverables timeline** on each project;
- requests for everyone: **Requests** in every role's menu, **New request** with the kinds
  your role may send, **Mine** / **To decide** tabs for managers (migration
  `003_request_kinds.sql`, applied by the Lambda's first cold start after the deploy).
  The seed's pending overtime request from Ben exists only in a database seeded after
  this change; on AWS, make a request live instead (GUIDE §3, step 10);
- overtime as a warning: logging past capacity without overtime opens **Over your weekly
  capacity** with **Log anyway** / **Cancel**; confirmed time shows **Over capacity** on
  My logged time and Approvals (migration `004_over_capacity.sql`, same cold start).
  AWS today: the old flat refusal, "... Ask your manager to allow overtime."

Until you deploy, Path A on AWS has no charts in steps 1 and 5, no Board (so no "The
pull-board moment"), and a slower bell with no pop-up in "The audit-log moment". Demo
those on the local stack, or deploy first.

For the story behind each step, see [GUIDE.md §3](GUIDE.md#3-the-5-minute-demo) and the
evaluator questions in [GUIDE.md §8](GUIDE.md#8-questions-you-will-probably-be-asked).
This file is only the "do this, see that" part.

- [1. Checklist](#1-checklist)
- [2. Path A: the website on AWS](#2-path-a-the-website-on-aws)
- [3. Path B: the terminal](#3-path-b-the-terminal)
- [4. Running the tests live](#4-running-the-tests-live)
- [5. Looking at the data yourself](#5-looking-at-the-data-yourself)
- [6. Plan B: if something breaks](#6-plan-b-if-something-breaks)
- [7. Local stack quick start](#7-local-stack-quick-start)

---

## 1. Checklist

### Accounts (same password for every seeded person: `Demo-pass-2026`)

| Who | AWS username | Local username | Role |
| --- | --- | --- | --- |
| Maria Lopez | `ML662930` | `ML460428` | Manager (Apollo). Line manager of Ana and Ben |
| Ana Ruiz | `AR553882` | `AR836183` | Employee, reports to Maria |
| Ben Okafor | from `demo.py demo` | `BO547130` | Employee, reports to Maria. Booked 45 h against 40 |
| Sam Patel | from `demo.py demo` | `SP345715` | Manager (Zeus) |
| Admin | `AD000001` | `AD000001` | Admin. **Not** `Demo-pass-2026`: it's the password you chose on 13 Oct |

The AWS usernames for Maria, Ana and the admin were checked on 14 Oct by signing in. For the
others, the first block of `python3 tools/demo.py demo` prints every username.

### 30 minutes before

1. **Terminal tab 1 (the demo tab).** Paste this, then type the admin password at the hidden prompt:

   ```sh
   cd ~/DavidCitiProject
   export TRACKER_API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker
   read -rsp 'Admin password: ' TRACKER_ADMIN_PASSWORD; echo; export TRACKER_ADMIN_PASSWORD
   curl -s $TRACKER_API/health
   ```

   Expect `{"status": "ok"}`. If the database was asleep this takes about 15 s (Aurora, the
   AWS database, pauses itself when idle: `min_capacity = 0.0`, `infra/rds.tf:27`). A
   `503 "The database is not ready"` just means it's still waking up: wait 30 s and repeat.

2. **Run the demo script once** to confirm the data is in shape and to get the usernames:

   ```sh
   python3 tools/demo.py demo
   ```

   Every line under "Trying to break the rules" should say `REFUSED as designed`, and the last
   line should say `5 integrity checks, 0 violations`. Any `UNEXPECTED` means the data changed;
   see [Plan B](#6-plan-b-if-something-breaks).

3. **Clear Maria's bell.** On 14 Oct she had 14 unread notifications, so the demo moment would
   go from 14 to 15 instead of showing 1. Sign in as Maria, open **Notifications**, click
   **Mark all as read**. (The server marks all of them read, `services/notifications.py:46-51`.)

4. **Terminal tab 2 (tests).** `cd ~/DavidCitiProject`, ready for section 4.

5. **VS Code files to have open:** `README.md`, `backend/tracker/api/routes.py` (who may do
   what), `backend/tracker/services/time_entries.py` (the 40-hour rule),
   `backend/tracker/store/migrations/001_init.sql` (constraints and the no-delete trigger),
   `backend/tracker/store/integrity.py` (the 5 checks), `tools/tracker.http`.

### Don't do these before the demo

| Don't | Why |
| --- | --- |
| Reject Ben's pending time, or turn on his overtime | Rejected time doesn't count toward the week (`time_entries.py:75, 81`), so the 409 refusal becomes a real 201 entry. Approving is safe |
| Change Ana's **email** | `demo.py` finds people by email (`demo.py:94-96`). Change her name only |
| Run `demo.py demo` on or after Mon 19 Oct | "Last week" is worked out from today (`demo.py:28-30`). From 19 Oct Ben's 40 h are two weeks back, so refusal 1 is accepted (201) and writes a real entry. Reseeding can't fix it: `seed` stops when Apollo exists (`demo.py:116-118`) |

### 5 minutes before

1. Run `curl -s $TRACKER_API/health` again (warm-up).
2. **Browser windows.** Your sign-in is kept per tab (sessionStorage), so each tab can be a
   different person. Open three tabs on `https://d1gov8jpsxhwer.cloudfront.net`:
   - Tab A: Ana (`AR553882`)
   - Tab B: Maria (`ML662930`)
   - Tab C: Admin (`AD000001`)

   Type the address into each new tab. **Don't use "Duplicate tab"**: it copies the sign-in.
   A signed-in tab keeps Aurora awake, because the bell asks the server every 10 s while it is visible
   (`NotificationBell.jsx:8`). That is an inference, not measured.
3. Maximise the browser (desktop width). Keep a phone, or the browser's device toolbar
   (F12, then Ctrl+Shift+M), ready for the phone-width step.

---

## 2. Path A: the website on AWS

Start in **Tab B (Maria)**. Every label below was checked against the frontend code on 14 Oct.

| # | Click | You should see | Say |
| --- | --- | --- | --- |
| 1 | You land on **Dashboard** | Apollo's card with a red **At risk** chip and the reason "Deliverable Build is 0% done with 27% of its time gone." (27% on 14 Oct; it rises 2.5 points a day, so 30% on Thu 15 Oct.) Budget: the amount "spent of $150,000", and "**Under 1%** of budget spent". Above the filters, **Workload this week · all projects** with Ben at "45 / 40 h" and "+5 h over". **Budget by project** with Apollo's sliver of spend | "Questions 1, 2 and 7: status, risk with the reason in words, budget spent against planned. At-risk first." |
| 2 | **Allocation** in the menu | People down the side, weeks across. Ben's row shows **Over-allocated**; his cells for the weeks of 12 and 19 Oct read "45 / 40 h" and "+5 h over" | "Questions 3 and 5. Ben is booked 25 h on Apollo and 20 h on Zeus. Neither manager could see that alone." |
| 3 | Hover (or tap) Ben's red cell | "Apollo 25 h, Zeus 20 h" | "Each cell says where its hours come from." |
| 4 | Switch on **Only over-allocated** | Only people over capacity in a shown week | "The server filters and sorts the worst first." |
| 5 | **Projects**, then **Apollo** | Tabs **Deliverables**, **Resources**, **Budget**, **Board**. **Deliverables timeline** above the cards: Design green "Done", Build "In progress 0%", Launch "Blocked". Design **Signed off**; Build "0 of 2 tasks done"; Launch blocked | "Question 4: progress comes from the tasks." |
| 6 | **Show tasks** on Build | Portal API (Ana, in progress), Portal UI (Ben, to do) | |
| 7 | Point at **Sign off** on Build | Greyed out, with "Sign-off opens when it's done: 2 tasks left to finish." | "The screen says why, and the server enforces the same rule." |
| 8 | **Resources**, then **Budget** tabs | Bookings in hours per week; planned from bookings, spent from approved time | "Spend only counts approved time, at the rate frozen when it was logged." |
| 9 | **Dependency view** | Launch is blocked, "Waiting for Build to be done." | "Question 6. A loop would be refused; the terminal shows it." |
| 10 | Make the window narrow (375 px) | **Open menu** button replaces the sidebar; tables turn into cards | "Responsive: drawer menu, cards, the grid scrolls sideways." |

Maria's dashboard shows only Apollo. Zeus is Sam's project, and Maria gets a 404 on it.

To show **Over budget** live in the budget chart, an admin sets Zeus's budget to $2,000 first (an audited edit). Zeus is Sam's, so look at it as the admin, not as Maria.

### The pull-board moment (Ana and Maria)

Maria's bell counts every unread notification, so after this moment and the audit-log moment
it shows a running total, not exactly 1. Ana holds Portal API (1 of her limit of 2), so she
can take one more.

| # | Tab | Click | You should see |
| --- | --- | --- | --- |
| 1 | A (Ana) | **Projects**, then **Apollo**, then the **Board** tab | Four columns: **Ready**, **To do**, **In progress**, **Done**. **Go-live checklist** is in Ready, with a **Take this** button |
| 2 | A (Ana) | **Take this** on Go-live checklist | The card moves to **In progress** with Ana's name on it. She now holds 2 of 2 |
| 3 | B (Maria) | **Reload the page** (F5), then click the bell | The bell shows **1** more than before, and the notification reads "Ana Ruiz took task Go-live checklist" |
| 4 | A (Ana) | **Put back** on that card | The card returns to Ready as "Unassigned". Do this last, so the seed is as the terminal demo expects |

Say: "Employees pull work instead of waiting to be assigned, up to a limit their manager
sets. Two people pressing Take this at the same moment can't both get it: a row lock in
Postgres decides, and a test runs that race on two database connections." (`services/tasks.py`
`claim_task`, `tests/backend/test_claim_race.py`.) The task sits on the Launch deliverable,
which is blocked, and it can still be taken: Ready doesn't depend on deliverable status.

**Don't put back Portal UI as Ben.** `tools/demo.py:252-253` looks up Ben's "Portal UI" in his
own task list, so a put-back (which unassigns it) makes the terminal demo fail with
`StopIteration`. Putting back Go-live checklist is safe.

### The audit-log moment (three tabs)

| # | Tab | Click | You should see |
| --- | --- | --- | --- |
| 1 | A (Ana) | Your name in the top bar (**My account**), then **Edit my details** | A form with First name, Last name, Email |
| 2 | A (Ana) | Change **First name** to `Anna`, click **Save** | The account page shows the new name. The server wrote one audit row: "Anna Ruiz updated their profile" |
| 3 | B (Sam or Maria: whoever is Ana's line manager; Chloe reports to Sam, Ana and Ben to Maria, so watch the right manager) | Wait up to 10 s, or just switch to this window | The bell shows **1** and a pop-up with the summary and a **View** button appears (6 s). The bell updates within 10 s while the tab is visible, and at once when you switch back to it |
| 4 | B (Maria) | Click the bell | The notification "Anna Ruiz updated their profile" |
| 5 | C (Admin) | **Audit log** in the menu (admins only). Optional: **Record type** filter, then **Apply** | Newest row at the top: Ana's profile change |
| 6 | C (Admin) | **Show changes** on that row | A Field / Before / After table listing only what changed: `firstName` `Ana` → `Anna` (and probably `updatedAt`) |
| 7 | A (Ana) | Change the name back to `Ana`, **Save** | Leaves the data as the terminal demo expects |

Say: "Every change writes one audit row in the same transaction as the change, and that row
notifies everyone above the person who made it. An employee's change goes to their line
manager and every admin." (`services/audit.py`; who is notified is worked out from the role
stored in the database, not from the login token.)

### Creating an account (optional, two minutes)

Shows the brief's "user authentication": the server makes the username and password, and
the new person must change the password before doing anything else. Use **Tab C (Admin)**,
plus a private window (Ctrl+Shift+N) for the new person. It works on AWS today; until the
deploy above, only the copy button differs (step 3).

| # | Where | Click | You should see |
| --- | --- | --- | --- |
| 1 | C (Admin) | **People** in the menu, then **New person** | A form: First name, Last name, Email, Role, Job title, Line manager, Annual salary ($) |
| 2 | C (Admin) | Fill in First name `Test`, Last name `Person`, Email `test.person@acme.local`, Role **Employee**, Line manager **Maria Lopez**; click **Create** | An **Account created** dialog: the name, the **Username** (initials plus 6 digits, like `TP123456`) and the **Temporary password** (12 characters), with "This password is shown only once" |
| 3 | C (Admin) | **Copy username and password**, then **Done**. On AWS, until the next `./bin/deploy-frontend.sh`, the button is **Copy password** and copies only the password: read the username aloud | The button says **Copied**. The clipboard holds two lines: `Username: ...` and `Temporary password: ...` |
| 4 | Private window | Open the site, paste the username and password into **Sign in** | The **Change password** page: "Choose your own password before continuing. The one you were given only works once." |
| 5 | Private window | **Current password** (the temporary one), **New password** and **Confirm new password** (8 characters or more), then **Change password** | The person's home screen. Until this step, the website sends every other screen back to **Change password** (`RequireRole.jsx:26-27`); only the API answers 403 (`api/app.py:29-30`) |

Say: "Usernames are generated and never change, the password is random and shown once,
and the person can't do anything until they choose their own." If the dialog says
"Couldn't copy", the browser blocked the clipboard: select the username and password by
hand. Each email can be used only once, so pick a new one for every rehearsal. The test
person stays in the People list; archive them afterwards if you like.

**Optional: show the 403 itself** (in terminal tab 1, after step 3 and before step 5; it
prompts for the new person's username and temporary password; not run on 14 Oct):

```sh
read -rp 'New username: ' NEW_USER
read -rsp 'Temporary password: ' NEW_PASS; echo
NEW_TOKEN=$(curl -s -H 'content-type: application/json' \
  -d "{\"username\":\"$NEW_USER\",\"password\":\"$NEW_PASS\"}" $TRACKER_API/auth/login \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')
curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $NEW_TOKEN" $TRACKER_API/projects
```

Expect `{"error": "Change your generated password before continuing."}` and `403`.

**If they ask about email:** the organisers' role has no email permission and the Lambda's
network has no way out, so passwords are shown once instead. The full answer is
[REPOINFO.md, answer 22a](REPOINFO.md#10-the-question-bank).

---

## 3. Path B: the terminal

In terminal tab 1 (with `TRACKER_API` and `TRACKER_ADMIN_PASSWORD` set, section 1):

```sh
python3 tools/demo.py demo
```

It talks to the live AWS API over HTTPS and prints, in order: the accounts, the seven
questions, "Trying to break the rules", then "The invariant".

### The refusals (each line reads `[status] REFUSED as designed: ...`)

| # | Request | Status | Why |
| --- | --- | --- | --- |
| 1 | Ben logs 2 more hours last week (he is at 40 h, overtime off) | 409, asked to confirm (`code: OVER_CAPACITY`; the script never confirms) | Weekly capacity rule (`time_entries.py:83-90`) |
| 2 | Ben logs time tomorrow | 400 | No future dates |
| 3 | Maria opens Zeus, which Sam manages | 404 | Not yours looks exactly like missing |
| 4 | Project 999999 | 404 | Same wording as 3, so ids can't be probed |
| 5 | Ana (employee) creates a project | 403 | Route table: employees may not |
| 6 | Ana approves time | 403 | Route table: employees may not |
| 7 | Design depends on Launch (a loop) | 409 | Dependency loop refused |
| 8 | Sign off Build while its tasks are open | 409 | Sign-off needs all work done |
| 9 | DELETE a project | 405 | There is no DELETE: records are archived |
| 10 | A request with no token | 401 | Not signed in |

Last line: `5 integrity checks, 0 violations`. These five database queries must always return
nothing: no dependency loops, nothing live under an archived project, every record has its
"created" audit row, no time logged outside a booking, no signed-off deliverable with
unfinished work (`store/integrity.py`).

To show the integrity check as raw JSON from the API:

```sh
TOKEN=$(curl -s -H 'content-type: application/json' \
  -d "{\"username\":\"AD000001\",\"password\":\"$TRACKER_ADMIN_PASSWORD\"}" $TRACKER_API/auth/login \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" $TRACKER_API/admin/integrity-check | python3 -m json.tool
```

You should see `"checks": 5` and `"violations": {}`, an empty object: it maps each failing
check's name to its offending rows, so healthy means no keys (`services/dashboard.py:258-262`,
`store/integrity.py:82-91`). The curl itself was not run on 14 Oct.

---

## 4. Running the tests live

All counts and times measured on the VDI on 14 Oct 2026.

### The suites

| What | Command (from `~/DavidCitiProject`) | Takes | The line that proves it passed |
| --- | --- | --- | --- |
| Backend (pytest) | `.venv/bin/pytest -q` | about 15 s (10.5 to 20 s) | `506 passed in 19.44s` |
| Website (Vitest + React Testing Library) | `cd frontend && npm test` | about a minute and a half | `Test Files  31 passed (31)` and `Tests  302 passed (302)` |
| Lint | `cd frontend && npm run lint` | a few seconds | prints nothing (exit code 0) |

The backend tests run against a real local Postgres database (`tracker_test`), each test
rolled back afterwards. The 302 website tests do **not** touch a database: they fake the
API at `fetch`. Say it that way.

### Coverage

| Command | Takes | Numbers (14 Oct) |
| --- | --- | --- |
| `.venv/bin/pytest --cov=backend/tracker --cov-report=term-missing -q` | about 20 s | `TOTAL 1920 68 96%`: api 100%, function.py 100%, domain 99%, services 95.5%, store 93.9% |
| `cd frontend && npm run test:coverage` | about a minute and a half (115 s) | Statements 94.78%, Branches 91.24%, Functions 90.63%, Lines 95.88% |

The rubric asks for 80% overall and 90% on API and error paths. What the missing 4% is,
honestly: mostly guards (already archived, not found, nothing to change), **plus five real
rules with no test**: reactivating a deliverable clears its sign-off (`milestones.py:197`),
reactivating a task clears its deliverable's sign-off (`tasks.py:215`), adding a dependency
clears a sign-off (`milestones.py:291`), archived deliverables can't take part in
dependencies (`milestones.py:268`), and refusing to demote a manager who still runs live
projects (`users.py:239`). The service's "can't depend on itself" check (`milestones.py:266`)
is untested too, but the database's own CHECK for that rule is. Also the database going
down mid-request (`postgres.py:121`) and turning a foreign-key violation into a 404
(`postgres.py:117-119`). Don't say "it's only repeat guards".

### Run ONE test to show a rule

| Rule | Command | Result (14 Oct) |
| --- | --- | --- |
| 40-hour week | `.venv/bin/pytest -q -k capacity` | `17 passed, 485 deselected` (about 1 s) |
| Not yours = 404, word for word | `.venv/bin/pytest -q -k byte_identical` | `3 passed, 499 deselected` (about 0.4 s) |
| Nothing can be deleted | `.venv/bin/pytest -q -k delete` | `14 passed, 488 deselected` (about 0.5 s) |
| Unknown usernames cost the same hashing as real ones | `.venv/bin/pytest -q -k unknown_username_costs` | `1 passed, 501 deselected` |
| The 5 integrity queries catch planted problems | `.venv/bin/pytest -q tests/backend/test_integrity.py` | `10 passed in 0.36s` |
| Approvals screen | `cd frontend && npx vitest run src/pages/approvals` | `Tests  5 passed (5)`, 2.3 s |

Good single tests to open in VS Code: `test_logging_past_capacity_asks_first_without_overtime`
(`tests/backend/test_work.py`), `test_another_managers_project_is_byte_identical_to_a_missing_one`
and `test_role_comes_from_the_database_not_the_token` (`tests/backend/test_api.py`).

### Browser tests (Playwright)

Every spec signs in with `Demo-pass-2026`. Without the right variables, a spec skips itself
instead of failing.

| Spec | Checks | Needs |
| --- | --- | --- |
| `demo.spec.js` (2 tests) | Manager walks the seven questions: Apollo "At risk", Ben "Over-allocated" with "Apollo 25 h, Zeus 20 h", the Build deliverable, Launch "Blocked". Then at 375x812: no sideways scroll, **Open menu** shows Allocation | `E2E_MANAGER_USERNAME`, or `E2E_ADMIN_PASSWORD` to look Maria up |
| `pull.spec.js` (1 test) | An employee takes a Ready task from the Board and puts it back. **Writes data** (makes and archives its own Ready task, plus audit rows and bell notifications), so **run it locally only, never against AWS**. "Go-live checklist" stays free for the live demo | `E2E_ADMIN_PASSWORD`, or `E2E_MANAGER_USERNAME` and `E2E_EMPLOYEE_USERNAME`. Ana must hold at most 1 task |
| `tour.spec.js` (5 tests) | Every screen for manager and employee, desktop and phone, fails on sideways scroll, saves a screenshot of each. Plus: refreshing a deep link keeps the page. Read-only, safe on AWS | `E2E_TOUR_DIR`, `E2E_MANAGER_USERNAME`, `E2E_EMPLOYEE_USERNAME` |
| `timeline.spec.js` (4 tests) | Zeus's late Migration says **Late** with the icon; its tooltip opens on hover and on a phone tap with no sideways scroll; stripes only in print and forced colours; Apollo reads Design **Done**, Build **In progress 0%**, Launch **Blocked**. Read-only. Local only until the charts are deployed | `E2E_ZEUS_MANAGER_USERNAME` (Sam, `SP345715` locally), or `E2E_ADMIN_PASSWORD` |
| `budget.spec.js` (3 tests) | The Budget line sits at 100 of 125 of the bar column, desktop and phone; a row's tooltip opens on hover and on Tab. Read-only. Local only until the charts are deployed | `E2E_MANAGER_USERNAME` (defaults to local Maria, `ML460428`) |
| `workload.spec.js` (5 tests) | Gridlines, hour labels and Ben's bar line up, desktop and phone, no sideways scroll; Tab opens a row's tooltip (whose sentence includes "+5 h over"); the over segment is striped only in print and forced colours; words and marks clear contrast. Read-only. Local only until the charts are deployed | `E2E_MANAGER_USERNAME` (defaults to local Maria, `ML460428`) |
| `screenshots.spec.js` (1) | Not a test: rewrites the README pictures in `docs/screenshots/` | `E2E_SCREENSHOTS=1` and `E2E_ADMIN_PASSWORD`. Don't run it live |

**Best live option: against AWS, no local stack needed** (14 Oct: `2 passed (7.0s)`):

```sh
cd ~/DavidCitiProject/frontend
E2E_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net E2E_MANAGER_USERNAME=ML662930 npx playwright test demo
```

The full tour against AWS (5 tests, a screenshot of every screen; not run or timed on 14 Oct):

```sh
cd ~/DavidCitiProject/frontend
mkdir -p ~/tour-shots
E2E_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net E2E_MANAGER_USERNAME=ML662930 E2E_EMPLOYEE_USERNAME=AR553882 E2E_TOUR_DIR=$HOME/tour-shots npx playwright test tour
```

Against the local stack instead (needs section 7 running first; local usernames differ):

```sh
cd ~/DavidCitiProject/frontend
E2E_MANAGER_USERNAME=ML460428 npx playwright test demo
```

**What no browser test covers:** the employee journey, "log time, then the manager approves".
It is covered by website screen tests with a faked API (`MyTasksPage.test.jsx`,
`ApprovalsPage.test.jsx`), backend tests (`test_work.py`, "line manager or admin approves")
and by `demo.py seed` against the real API, but not end to end in a browser. The README
already says so (`README.md:253-254`).

---

## 5. Looking at the data yourself

### The AWS database: not directly, by design

Aurora sits in a private network and isn't reachable from the internet, so you see AWS data
through the API (the website, `demo.py`, curl or `tools/tracker.http`). The AWS console's
Query Editor can't open it either: `infra/rds.tf` doesn't switch on the Data API
(`enable_http_endpoint`). Turning it on would need that line, a backend deploy by you, and
the database login stored in Secrets Manager. Whether the workshop's AWS role allows that is
**untested**, and nothing was changed.

### The local database: three ways

Connection details for all of them: host `localhost`, port `5432`, user `postgres`,
password `postgres123`, database `postgres`. (The other database, `tracker_test`, belongs to
the tests: leave it alone.) On 14 Oct it held 8 users, 4 projects, 66 audit rows (newest
13 Oct 17:25) and 72 notifications.

**1. VS Code, PostgreSQL extension (already installed, `ms-ossdata.vscode-pgsql`).**
Click the elephant icon in the left bar, then **Add Connection**. The Server name is
`localhost`, not the project name. Server `localhost`, Port
`5432`, Authentication Password, User `postgres`, Password `postgres123`, Database
`postgres`, Name `tracker local`. Then open Tables, right-click `audit_log`, **Select Top
1000**. (Not tried on 14 Oct: no connection is saved yet.)

**2. Terminal, `psql` (installed).**

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres
```

`\dt` lists the tables, `\q` quits. **The audit log, newest first:**

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -c "SELECT audit_id, created_at, actor_role, action, entity_type, entity_id, summary FROM audit_log ORDER BY audit_id DESC LIMIT 20;"
```

With before and after state (wide; press `q` to leave the pager):

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -x -c "SELECT audit_id, created_at, summary, before_state, after_state FROM audit_log ORDER BY audit_id DESC LIMIT 5;"
```

Prove the log can't be changed. The `append_only` trigger (`001_init.sql`, checked on the
local database on 14 Oct) refuses with "DELETE on audit_log is not allowed: this table keeps
its full history", and nothing changes:

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -c "DELETE FROM audit_log WHERE audit_id = 1;"
```

**3. DBeaver (a separate app; not installed).** `sudo snap install dbeaver-ce --classic`
(asks for your VDI password), then the same connection details. Not tried.

### The API from VS Code: `tools/tracker.http`

A file of 17 requests (a health check, the admin login, then 15 reads), each labelled with
what it shows. None of them changes data.

1. Install the REST Client extension: `code --install-extension humao.rest-client`
2. Open `tools/tracker.http`. Click **Send Request** above `login`; it asks for AD000001's
   password (nothing secret is stored in the file).
3. Click **Send Request** above any other request; they reuse the login token for 8 hours.
4. To use the local copy instead of AWS, change `@baseUrl = {{aws}}` to `@baseUrl = {{local}}`
   (needs section 7 running).

Notes: `@projectId = 1` is Apollo locally; on AWS, check the projects list for its id first.
The audit-log request with the filter `entityType=projects&dateFrom=2026-10-13` is the API
version of the admin screen. **Not verified:** the signed-in requests were never sent, and
REST Client wasn't installed, on 14 Oct.

Postman is also installed in VS Code, but it wants a sign-in and each request built by hand;
skip it.

---

## 6. Plan B: if something breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| `503 "The database is not ready. Please try again shortly."` | Aurora is waking up | Wait 30 s and retry, up to 3 times. The website keeps you signed in and offers **Retry** |
| First page or login takes about 15 s | Aurora was asleep | Expected. Warm up with `curl -s $TRACKER_API/health` before you start |
| Every login takes about 1.1 s | Deliberately slow password hashing (PBKDF2, 600,000 rounds) | Nothing to fix. Say why |
| Signed out after 8 hours (401) | The login token expired; no refresh tokens, by design | Sign in again |
| Maria's bell shows 15, not 1 | Old unread notifications | As Maria: **Notifications**, **Mark all as read**, before the demo |
| The manager's bell doesn't move | Wrong manager (Chloe reports to Sam, Ana and Ben to Maria), or the tab is hidden (it pauses, then checks at once when you switch back) | Watch the right manager's window; wait 10 s |
| `demo.py` refusal 1 says `UNEXPECTED` (201) | Ben's pending time was rejected, his overtime was turned on, or it's 19 Oct or later | Explain the rule from `time_entries.py` instead; don't rerun it |
| `demo.py` crashes looking up a person | Someone's email was changed | Change it back in the website |
| `ExpiredToken` or `InvalidClientTokenId` from AWS commands | Workshop AWS credentials are temporary | `./bin/setup-participant.sh` in your own terminal |
| `PARTICIPANT_ID not found` | `~/.bashrc` loads nothing in a non-interactive shell | Run the command in your own terminal tab |
| `terraform output` prints nothing | `start-dev.sh` re-pointed Terraform at LocalStack | Use the URL in this file: `https://d1gov8jpsxhwer.cloudfront.net` |
| Local: 502, or the Lambda log says `No module named 'psycopg'` | pip ran Python 3.14 | `python3 -m pip install --user --force-reinstall pip`, check `pip --version` says 3.13, rerun `./bin/start-dev.sh` |
| Local: Vite won't start, port 3000 busy | An old server still holds 3000 (`strictPort` refuses to move) | `ss -ltnp \| grep -E ':(3000\|3001\|4566\|5432)'`, stop the old one |
| `$'\r': command not found` | A script has Windows line endings | `sed -i 's/\r$//' bin/*.sh` |

### Fallback order

1. **AWS** website and `demo.py demo` (this file, sections 2 and 3).
2. **Local stack** (section 7): same website and script on the VDI.
3. **Screenshots** in `docs/screenshots/`: `dashboard.png`, `allocation.png`,
   `project.png`, `dependencies.png`, `phone-dashboard.png`.
4. **README.md**: the seven-questions table, architecture and test results. The tests
   (section 4) run without AWS or the local stack, only local Postgres.

---

## 7. Local stack quick start

Use this when AWS is unavailable. On 14 Oct, Postgres (5432) and LocalStack (4566) were up,
but the website (3000) and the proxy (3001) were **not** running.

```sh
cd ~/DavidCitiProject
source ~/.bashrc && ./bin/start-dev.sh
```

Wait for `All Components Verified!`; Vite then runs in that terminal. In a second tab:

```sh
ss -ltnp | grep -E ':(3000|3001|4566|5432)'
```

Expect one listener on each of the four ports (5432 prints two lines, `0.0.0.0` and `[::]`:
that's the same Postgres on IPv4 and IPv6).

| What | Address |
| --- | --- |
| Website | `http://localhost:3000` |
| API | `http://localhost:3001/api/tracker` |
| Health check | `curl -s http://localhost:3001/api/tracker/health` |

The local database is already seeded (Apollo, Zeus, Hermes; Legacy CRM archived), so don't
run `seed` again. Local usernames are in the table in section 1. The local admin password is
the one you set on 13 Oct (the Terraform bootstrap password no longer works locally).

Run the terminal demo locally (`TRACKER_API` is set on the command, because tab 1 exported the
AWS address):

```sh
cd ~/DavidCitiProject
read -rsp 'Local admin password: ' TRACKER_ADMIN_PASSWORD; echo; export TRACKER_ADMIN_PASSWORD
TRACKER_API=http://localhost:3001/api/tracker python3 tools/demo.py demo
```

Local Lambda logs:

```sh
AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --follow --format short
```
