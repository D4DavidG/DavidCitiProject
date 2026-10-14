# Overnight report: the frontend build (13 to 14 Oct)

Written for David, to read first thing in the morning. It says what was built while you
slept, how each part was checked, what wasn't checked, and every decision made on your
behalf so you can overrule it. The plan being followed is
`docs/superpowers/plans/2026-10-14-frontend.md`.

## Status at a glance

| Task | Screen or part | State |
| --- | --- | --- |
| 1 | Tooling, API client, formatting | Done |
| 2 | Session, theme, layout, routing | Done |
| 3 | Login and change password | Done |
| 4 | Dashboard (questions 1, 2, 7) | Done |
| 5 | Allocation grid (questions 3, 5) | Done |
| 6 | Projects list and detail | Done |
| 7 | Dependency view and end-to-end tests | Done |
| 8 | My tasks | Done |
| 9 | Approvals | Done |
| 10 | People | Done |
| 11 | Project requests | Done |
| 12 | Notifications | Done |
| 13 | Audit log | Done |
| 14 | Finish: coverage, screenshots, README, guide | Done |
| Review | A fresh reviewer read all the night's work | Done: 5 fixes made (below) |

**In one line:** every screen in `MVP.md` is built and tested. That's 199 website tests
(93% coverage), 374 backend tests, and a real browser walking the demo. It's all committed
on `David`, but not pushed or deployed.

## What you need to do this morning

In your terminal on the VDI, in this order:

```sh
cd ~/DavidCitiProject && source ~/.bashrc
git log --oneline -25                 # tonight's commits, newest first
git push origin David                 # back them up to GitHub
./bin/deploy-backend.sh               # FIRST: two small backend fixes from tonight (names in lists,
                                      # audit snapshots); without it My tasks and Approvals show no names
./bin/deploy-frontend.sh              # builds the website, uploads it, prints the CloudFront URL
```

Then:

1. **Open the website:** `https://d1gov8jpsxhwer.cloudfront.net`. Sign in as Maria; her
   username is printed by `python3 tools/demo.py demo`, and the password is
   `Demo-pass-2026`. The first load can take 15 s while the database wakes up.
2. **Checklist step 3.5 (deep links):** open a project, press refresh, and check the page
   comes back. With `#` addresses it should; this is the last unchecked AWS item.
3. **Look at it yourself:** the layout and colours were checked only by screenshots (in
   `docs/screenshots/`, also shown in the README).
4. **Read "Decisions made for you" below,** and overrule anything you disagree with.
5. **Practise the website demo:** `docs/GUIDE.md` §3, "The website script".

If you'd rather not use the new permission setting during the day, remove the line
`"Bash",` from `.claude/settings.local.json` (see Decisions).

## Done, task by task

### Task 1: Tooling, API client, formatting

- **Libraries installed** (`npm audit`: 0 vulnerabilities): Material UI, React Router,
  react-responsive and PropTypes, plus Vitest, React Testing Library, Playwright and the
  two lint plugins the starter was missing. `npm run lint` now works (trap 5 fixed).
- **Dev server** refuses to start on another port if 3000 is busy (trap 6 fixed).
- **`src/services/request.js`:** the one module every API call goes through. It adds
  the address and login token, sends JSON, and turns failures into readable errors. A
  401 is handled in one place.
- **`src/services/format.js`:** the only place money, hours and dates become text.
- **Tests:** 18, all passing (`cd frontend && npm test`).

### Task 2: Session, theme, layout, routing

- **Signing in is remembered for the browser tab** (`sessionStorage`), and checked with
  the server when the page loads. If the token has expired, any request that gets a 401
  signs you out in one place and the login page can say why.
- **Menu by role:** managers and admins get Dashboard, Allocation, Projects, Approvals,
  People, Requests and Notifications (admins also get Audit log). Employees get My tasks,
  Projects and Notifications. Typing the address of a screen your role can't use shows
  "This page is not available for your role" (the server refuses it too).
- **Layout:** a fixed sidebar on desktop; on phones (below 900 px wide) a menu button
  opens it as a drawer.
- **Theme:** navy and blue on light grey, with each colour's contrast ratio noted in
  `src/theme/theme.js` (all pass the 4.5:1 accessibility minimum).
- **Addresses use `#`** (`/#/projects/7`), so refreshing any page works on CloudFront
  without the rewrite rule we removed.
- **Screens not built yet** showed "Coming soon" while the night went on. All were
  built by Task 13, and the placeholder is gone.
- **Tests:** 42 in total, all passing; lint clean; the production build works.

### Task 3: Login and change password

- **Sign in** with the generated username (typed in any case; it's upper-cased) and
  password. Managers and admins land on the Dashboard, employees on My tasks. A wrong
  password shows the server's own message; an expired session says so.
- **First sign-in:** anyone with a generated password goes straight to "Change password"
  and can't reach any other screen until they do (the server enforces the same).
- **Change password** checks that the confirmation matches before sending anything, and
  shows the server's errors on the field they're about (e.g. "at least 8 characters").
- **Tests:** 55 in total, all passing.

### Task 4: Dashboard (questions 1, 2 and 7)

- **One card per live project** (managers: theirs; admins: all), at-risk projects first:
  name, manager, status, a red "At risk" or green "On track" label with every reason
  in words, progress (% done, from tasks), end date, and the budget bar.
- **The budget bar** says it in words: "$1,370 spent of $150,000", planned cost, time
  waiting for approval, and warnings for "over budget" or "planned cost is over
  budget". Every figure comes from the server; the browser only formats it.
- **Search and status filter** run on the server; long lists page.
- **Two counters** at the top: projects shown and how many are at risk.
- **Loading, error (with Retry) and empty states** on every screen from here on, via one
  shared component. The loading text warns that the first request after a quiet spell
  can take 15 seconds.
- **Tests:** 83 in total, all passing.

### Task 5: Allocation grid (questions 3 and 5)

- **People down the side, six weeks across.** Each cell shows hours booked against that
  person's own capacity ("45 / 40 h"). Over capacity is red with "+5 h over"; logged
  time past capacity says "overtime" in orange.
- **Where the hours come from:** hover (or tab to) a cell to see "Apollo 25 h, Zeus 20
  h". Screen readers get the same sentence.
- **Worst first:** the server sorts by each person's worst week; each row says
  "Over-allocated" or "OK", plus their capacity and whether overtime is allowed.
- **"Only over-allocated" switch**, previous/next week and "This week" buttons. If
  nobody is over capacity, it says "No one is over capacity in these weeks."
- **On phones** the grid scrolls sideways with the name column pinned.
- **Tests:** 94 in total, all passing.

### Task 6: Projects list and project detail (questions 1, 4, 7; the CRUD)

- **Projects list:** search, status filter, and (admins) "Show archived". A table on
  desktop, cards on phones. Admins get "New project": name, manager, dates and a budget
  typed in dollars.
- **Project page:** status, % done, dates and manager, then three tabs (employees don't
  see Budget), plus a "Dependency view" button.
  - **Deliverables:** each shows status, progress ("0% · 0 of 2 tasks done") and due date.
    "Show tasks" lists the tasks with assignee, estimate and status. Managers can add or
    edit deliverables and tasks, sign off (the server refuses unfinished work and its
    message is shown, e.g. "2 tasks are not done yet"), reopen, and archive.
  - **Resources:** who's booked, hours per week and dates. "Book someone", edit, archive.
    A note explains that booking past capacity is allowed and shows on the Allocation grid.
  - **Budget:** the budget bar plus seven figures: budget, planned, spent, waiting for
    approval, remaining, % spent, % of schedule gone.
- **Archive, never delete:** every archive asks first, and explains that the record is
  kept and can be reactivated. The word "delete" appears nowhere.
- **Who can change what:** buttons only appear for the project's manager or an admin.
  Employees get a read-only view (the server enforces the same).
- **Tests:** 122 in total, all passing.

### Task 7: Dependency view (question 6) and end-to-end tests

- **Dependency view:** deliverables laid out left to right in steps. Each one comes after
  everything it needs, with its status, due date and "Needs Design". A blocked one says
  "Waiting for Build to be done." Managers can add a link (a loop is refused by the
  server, which says why) or remove one. On phones the steps stack top to bottom.
- **End-to-end tests (Playwright, a real browser against the real local API and
  database):**
  1. A manager signs in and walks the seven questions: Apollo "At risk" with its budget;
     Ben "Over-allocated" with "Apollo 25 h, Zeus 20 h"; Apollo's deliverables; Launch
     blocked by Build.
  2. At phone width: no sideways scrolling, and the menu opens from a button.

  Both pass. I also broke one detail on purpose (the "Apollo 25 h, Zeus 20 h" wording)
  and the walkthrough caught it.
- **`docs/GUIDE.md` §3** now opens with a click-through website demo script.
- **Tests:** 129 unit and component tests plus 2 end-to-end tests, all passing.

### A small backend fix (found while building Task 8)

The task and time-entry lists already looked up the project, deliverable, task and
person names, but the API dropped them before answering. So the website couldn't say
which project a task belongs to, or whose time is waiting for approval. Now they're
included (`projectName`, `milestoneName`, `assigneeName`, `taskTitle`, `personName`).
Two new backend tests failed first, then passed; the backend suite is at 372 passing and
bandit is clean. It's a separate commit ("Name the project, deliverable, task and person
…"). **AWS needs `./bin/deploy-backend.sh` to get it.**

### Task 8: My tasks (employees)

- **Open tasks as cards:** title, project and deliverable ("Apollo · Build"), estimate,
  and a Status dropdown (To do, In progress, Done) to tick work off.
- **Log time:** date (defaults to today, Eastern time), hours ("2.5") and a note. If it
  would take you past your weekly capacity without overtime allowed, the server's
  message appears in the dialog ("…past your capacity of 40 h. Ask your manager to allow
  overtime.").
- **My logged time:** a table with date, task, project, time, approval status and note.
  Editing an entry sends it back for approval.
- **Tests:** 137 in total, all passing.

### Task 9: Approvals

- **Time waiting for a decision:** person, task, project, date, time and note. Managers
  see their direct reports; admins see everyone.
- **Approve / Reject** on each row (each button names the entry for screen readers, e.g.
  "Approve 8 h by Ben Okafor"). A decided entry leaves the list, with a confirmation
  line. Server refusals are shown as they come.
- **Tests:** 141 in total, all passing.

### Task 10: People

- **Everyone in the organisation:** name, username, role, job title, capacity
  ("40 h/week · overtime"), and salary only where the server shares it (admins, or
  your own). Search by name, username or email; filter by role; admins can show
  archived accounts.
- **Admins:** "New person" (the server generates the username and a 12-character
  password, shown once with a Copy button and a "shown only once" warning), edit, reset
  password (also shown once), archive and reactivate.
- **Managers:** a Capacity button for their own direct reports only: weekly hours and
  "Overtime allowed".
- **Tests:** 149 in total, all passing.

### Task 11: Project requests

- **Managers:** "New request" with name, description, why it's needed, and proposed dates.
  They see their own requests and the decisions.
- **Admins:** every request, with who asked. "Approve" opens a form with the proposed
  dates already filled in, plus a budget and a note, and creates the project (the
  requester becomes its manager). "Reject" takes a note. Approved requests link to their
  project.
- **Status filter** on the server.
- **Tests:** 155 in total, all passing.

### Task 12: Notifications

- **A bell in the top bar** with a red count of unread notifications. It checks every 30
  seconds, and straight after any change you make in the app (Lambda can't push to the
  browser, so it asks).
- **Notifications page:** one-line summaries of what changed ("Ana Ruiz logged 8 h on
  task Portal UI"), when, and a "New" mark. "Mark as read", "Mark all as read" and
  "Unread only".
- **Tests:** 165 in total, all passing (the 30-second check is tested with a fake clock).

### Task 13: Audit log (admins)

- **Every change, newest first:** when (Eastern time), who (and their role), the action,
  the record ("Person #3"), and the one-line summary.
- **Filters on the server:** person, record type, record id, from and to dates.
- **"Show changes"** opens a small table of only the fields that changed, before and
  after (e.g. email: `ana@old.test` → `ana.ruiz@acme.test`). A newly created record shows
  its starting values.
- **Every menu item now has its real screen:** the "Coming soon" placeholder and the
  starter's `App.css` are removed.
- **Tests:** 169 in total, all passing; the production build works.

### Task 14: Finish

- **Coverage:** website 93% of statements and 94% of lines (goal 80%); backend 96%
  (100% for the API layer). The README lists what's uncovered, and why.
- **Screenshots** of the dashboard, allocation grid, project, dependency view and the
  phone layout, taken by Playwright against the local app (`docs/screenshots/`, shown in
  the README). Looking at them found two layout bugs the tests couldn't see, both fixed:
  - on phones the title was cut off and "Sign out" wrapped onto two lines;
  - the dependency view's steps weren't lined up along the top.
- **More tests** for the project page's manager actions (add/edit task, reopen, archive,
  change a booking, edit the budget).
- **README:** a "The website" section (screenshots, structure, rules) and "Frontend
  tests" (commands, results, known gaps). **`docs/GUIDE.md`:** the website demo script,
  updated numbers, the file map and the likely questions (e.g. "Where are the business
  rules in the website?"). **`CLAUDE.md`:** traps 5 and 6 marked fixed, and the frontend
  commands and conventions added.
- `npm run lint` clean, `npm audit`: 0 vulnerabilities, `npm run build` works.

### The fresh-eyes review, and what it changed

A separate reviewer (a new Claude with none of tonight's memory) read all 16 commits,
ran the tests, and checked the API contract. **No critical problems.** It found four
important ones; I fixed them and one of its "minor" ones, each with a test that failed
first:

1. **No "My account" screen.** `MVP.md` says anyone can change their own name, email and
   password and see their salary, and the guide's demo moment depends on it. **Added:**
   click your name in the top bar. Name and email can be edited; capacity and salary are
   shown; there's a link to Change password.
2. **Reloading while the database woke up signed you out.** Now only a real "session
   expired" (401) signs you out. A 503 keeps you signed in and shows "Can't reach the
   server … Retry".
3. **My backend change leaked into the audit log:** every time approval showed a fake
   "personName" change. Fixed in the backend (test-first; 373 backend tests pass).
4. **This report wasn't finished.** It is now.
5. **"Over budget" didn't show when a project was less than 1% over,** because the server
   rounds the percentage down (a bit over shows as 100%). Upgraded from minor because it
   shows wrong budget information. It now uses the server's "remaining" figure.

**Small things noted but not fixed** (your call; none affects the demo path):

- The dashboard's "At risk" counter counts only the current page (12 cards), while
  "Projects shown" is the total.
- A project's "Reactivate" button shows nothing if the server refuses.
- Archiving a deliverable says it "can be reactivated", but there's no screen to list
  archived deliverables or tasks yet.
- The dependency layout has no guard against a loop. The server already guarantees there
  are none.
- People dropdowns stop at 100 people; the line-manager dropdown leaves out admins; in
  the audit log, archived people show as "User #id".
- After an admin resets your password while you're signed in, you're blocked until you
  reload.
- Approving the last item on page 2 of Approvals shows an empty page instead of going
  back to page 1.
- The full "session expired → sign in → back where you were" path is tested in pieces,
  not as one test.

**Set aside by the reviewer, with my ruling:**

- **No name search** on Approvals, Requests and My logged time. Those endpoints don't
  take one; adding it is backend work outside tonight's plan.
- **Approving an already-decided entry again** is allowed, and so is a reset that leaves
  old tokens working for up to 8 h. Both are existing backend behaviour, unchanged tonight.
- **The demo password is in the public repo.** That was already true; the guide says so.
- **Phone layout** was checked in a browser only for the dashboard. The other pages are
  checked by code and component tests (see "Not verified"). *Morning update: the tour
  below now screenshots every page at phone width.*

## Morning: screenshot review of the live site (14 Oct)

`e2e/tour.spec.js` signs in as Maria and as Ana, visits every screen at 1440 px and 375 px
(no sideways scrolling allowed), and saves a screenshot of each: 36 in all. Independent
reviewers read those screenshots and reported 59 problems. Two skeptics then tried to
disprove each one, and 24 survived.

- **Fixed in `b880af9` and `64b3671`** (14 changes, each with a test):
  - empty fields show "—";
  - the project link uses the theme colour;
  - spending under 1% reads "Under 1%", not 0%;
  - "Sign off" is greyed out with the reason until it can succeed;
  - tapping a week on the allocation grid shows its projects on a phone;
  - wording now fits each role;
  - new logged-time notifications say which day the time is for.
- **Second review:** the tour ran again and a second set of reviewers compared before
  and after. 20 of the 24 were confirmed fixed.
  - Three of the four left open could not be judged: two screenshots caught a page still
    loading, and the notification rows were seeded before the change.
  - The fourth was real: the budget bar still drew nothing under 1%.
- **Fixed after the second review**, along with three small problems the first fixes
  caused:
  - the bar now shows a sliver whenever money has been spent;
  - the sign-off hint gives both reasons when both apply ("1 task left to finish and
    waiting for what it depends on");
  - dependency cards put the progress on its own line, worded like the project page;
  - the phone dashboard lets the progress label and end date wrap.
- **Tests:** 199 website tests and 374 backend tests pass, lint is clean, and the local
  tour passes 5 of 5.

## Decisions made for you

Each line is something the plan or your answers didn't settle, with what it costs if
it's wrong.

- **Worked directly on branch `David`** (no separate branch), so your morning push needs
  nothing extra. Cost if wrong: none.
- **Newer library versions than the plan named:** npm installed MUI 9, React Router 8 and
  Vitest 5 (the plan said 7, 7 and unspecified). These are the current stable releases
  and passed `npm audit`. Cost if wrong: an older-version tutorial may not match exactly.
- **Signed in per browser tab:** the login token is kept in `sessionStorage`, so closing
  the tab signs you out (safer on shared machines). Cost if wrong: switch to
  `localStorage` in `src/auth/AuthContext.jsx` to stay signed in across tabs.
- **The starter's `App.css` was removed** in Task 13, once you'd allowed all shell
  commands. Cost if wrong: none.
- **Your settings now allow me to run any shell command** (you asked at 11:15 pm). Your
  `deny` list is kept and slightly widened: no `git push` in any form, no deploy or
  cleanup script, no `terraform apply`/`destroy`. To go back, remove the line `"Bash",`
  from `.claude/settings.local.json`.
- **No money totals on the dashboard,** only counts (projects, at risk). Adding up money
  in the browser breaks the rule that money is only computed on the server. Cost if
  wrong: a small server endpoint for portfolio totals.
- **A "Search" button next to the search box:** pressing Enter alone can't submit that
  form because of how the status dropdown is built. Cost if wrong: none.
- **No "over capacity" warning on the booking itself:** the bookings endpoint doesn't
  return capacity, so the Resources tab points to the Allocation grid, where
  over-allocation is worked out. Cost if wrong: add capacity to the bookings endpoint.
- **Money and hours are typed in human units:** budgets in dollars ("150,000") and
  estimates in hours ("2.5"). They're converted to cents and minutes in one place, with
  text-based parsing (no rounding errors). Cost if wrong: none.
- **The bell refreshes after every change in the app**, not only every 30 seconds.
  The API module announces each successful change, and the bell listens. Cost if
  wrong: none.
- **Two backend changes tonight**, both test-first: lists now include the names they
  already looked up, and approval audit snapshots no longer include the author's name.
  The plan allowed backend changes only for bugs the website exposed; both were. Cost if
  wrong: none, but AWS needs `./bin/deploy-backend.sh`.
- **A "My account" page that wasn't in the plan:** the reviewer pointed out that `MVP.md`
  requires it. Cost if wrong: one route to remove.
- **"Edit project" and "Archive project"** instead of plain "Edit"/"Archive" on the project
  page, because each deliverable has its own Edit and Archive buttons. Cost if wrong: none.
- **Dates on screen:** plain dates (due dates, start dates) are shown exactly as stored;
  timestamps (when something happened) are shown in Eastern time, like the server. Cost
  if wrong: a one-line change in `format.js`.

## Not verified

- **Phone layout of pages other than the dashboard,** in a real browser. They use the
  same components (cards instead of tables, a drawer menu), but only the dashboard was
  checked at 375 px by Playwright.
- **The website on AWS.** Everything was tested locally: unit tests, and Playwright
  against the local API and database. It goes live only when you run
  `./bin/deploy-frontend.sh`, and checklist step 3.5 (refreshing a deep link) can only
  be checked then.
- **How it looks to a person.** Tests check what's on screen and that the phone layout
  doesn't scroll sideways, not whether it looks good. Spacing, colours in context and
  hover states need your eyes.
