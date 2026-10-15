# Requirements

> **For:** anyone checking the app against the brief. **Answers:** what was asked for, which
> screen meets each item, who may do what, and which rules the app enforces. Back to the
> [project README](../README.md); all guides: [docs/README.md](README.md).

The version that meets the workshop brief (Citi coding workshop, 13 to 15 Oct 2026), plus
what David added after the demo on 15 Oct. Stack fixed by the brief: React with React
Responsive and Material UI, Python on AWS Lambda, PostgreSQL, deployed with Terraform and
the repo's shell scripts. Why each choice was made: [DECISIONS.md](DECISIONS.md).

## The problem, in one line

ACME runs many projects and can't see their progress, who is working on what, or where
the money is going. The app answers seven questions, and each answer has its own screen.

| # | Client question | Screen that answers it |
| --- | --- | --- |
| 1 | What is the status of each active project? | Dashboard; Projects list, status column |
| 2 | Which projects are at risk of missing deadlines? | Dashboard, **At risk** column with the reason; a late deliverable's tooltip gives the due date, today and days late |
| 3 | How are resources allocated across projects? | Allocation grid and Schedule: people down, weeks across |
| 4 | What are the key deliverables and their completion status? | Deliverables tab: progress from tasks, timeline, sign-off; a timeline per project on the dashboard |
| 5 | Which team members are over-allocated? | Allocation grid and Schedule: projects and hours per person per week, flagged past capacity |
| 6 | What is the dependency chain between deliverables? | Dependency view on the project |
| 7 | How much budget is consumed versus planned? | Budget bar on the dashboard and on the project |

## Features the brief asks for

| Brief says | The app builds |
| --- | --- |
| User authentication and authorization | Login with a generated username and password, changed on first login; a signed token (JWT) that expires after 15 minutes, renewed by a refresh token (up to 8 hours); passwords hashed |
| Role-based access control | Admin, Manager, Employee. The server re-reads the role from the database on every request |
| CRUD for projects | Create, view, edit, archive and reactivate |
| CRUD for deliverables | Same, per project, plus tasks under each and "depends on" links between deliverables |
| CRUD for resources | Assign a person to a project for N hours per week over a date range |
| CRUD for budget tracking | A budget per project. Planned cost comes from bookings; consumed cost comes from approved logged hours |
| Search and filter | Name search and status filter on every list, done on the server, paginated; a search box in the top bar finds pages and projects (`/`, `Ctrl+K` or `Cmd+K`) |
| Responsive design | Tables turn into cards on phones; the allocation grid scrolls sideways |
| Real-time visibility | The dashboard, plus a notification bell that checks every 10 seconds |

## Accounts

An admin creates each account. The server generates the username (initials plus six
digits, e.g. `DG482913`, never changes) and a 12-character password, shown to the admin
once. The user must change it on first login. Users can then change their own name,
email and password. A forgotten password is reset by an admin.

Pay is at least $20 an hour: $41,600 a year, since the hourly rate is the annual salary
divided by 2,080 hours. A new account needs a salary, and the server refuses less when
anyone is created or a salary changed (400, `field: "annualSalaryCents"`). A lower salary
set before this rule stays until someone changes it; the first admin, `AD000001`, has none.

Archiving someone who is still on a live project (a booking that hasn't ended, or a task
not done) warns first: the dialog lists those projects in red and the button becomes
**Archive anyway**. The API answers 409 with `code: "ON_PROJECTS"` until the request says
`confirmOnProjects: true`. `GET /users/{id}/projects` lists them (for admins, the line
manager and the person; anyone else gets 404). Archiving ends the person's bookings; their
open tasks stay assigned to them until someone reassigns them.

## Tasks and time (how the work gets tracked)

Modelled on Jira, GitHub Projects and OpenProject, not on a payroll system.

- **Tasks:** each deliverable is broken into tasks. The project's manager creates them,
  gives each an estimate in hours and minutes, and assigns it to someone booked on the project.
- **Pull:** the manager can leave a task unassigned; it shows as Ready, and anyone booked
  on the project takes it with Take this, up to their task limit (default 2). Managers can
  still assign, even past it.
- **Ticking work off:** the assignee moves their task from To Do to In Progress to Done.
- **Progress** of a deliverable is the share of its estimated hours that are done.
  "Blocked" shows automatically while a deliverable it depends on isn't finished.
- **Sign-off:** the manager signs a deliverable off, and only once all its tasks and
  dependencies are done.
- **Logging time:** the assignee logs time on their task (a date, hours and minutes,
  a note). Their line manager, or any admin, approves or rejects it. Only approved time
  is charged to the project's budget, at the hourly rate the person had when they
  logged it.
- **Capacity:** each person has a weekly capacity (default 40 hours) and an "overtime
  allowed" switch, set by their line manager. With the switch off, logging hours past
  capacity asks "Log anyway?" first; if the person confirms, the entry is saved, marked
  "Over capacity", and their manager is told. With it on, the week is flagged as overtime. The same person also
  has a task limit (default 2, 1 to 10): how many unfinished tasks they may take themselves.

## Who can do what

| Action | Admin | Manager | Employee |
| --- | --- | --- | --- |
| Create, archive and restore users; reset passwords; edit salaries | yes | no | no |
| Set weekly capacity, "overtime allowed" and task limit | anyone | own reports | no |
| Edit own name and email; see own salary | yes | yes | yes |
| Create projects, assign managers, archive or restore projects | yes | no | no |
| Ask for a new project or to archive one (Requests) | n/a | yes | no |
| Ask for a higher task limit or overtime (Requests) | n/a | no | yes |
| Ask anything else (Requests, free text) | n/a | yes | yes |
| Decide requests | all | own reports' | no |
| Edit description, dates, budget and status; book people | all | own projects | no |
| Deliverables and dependencies: create, edit, sign off, archive | all | own projects | no |
| Tasks: create, assign, estimate | all | own projects | no |
| Move a task's status; log time on it | no | no | own assigned tasks |
| Take a Ready task; put back your own | no | no | booked on the project |
| Approve or reject logged time | anyone | own reports | no |
| See projects | all, including archived | the ones they manage | booked on, active only |
| Audit log | yes | no | no |

Usernames never change. Nobody changes their own role or salary, and nobody approves
their own time.

## Rules the app enforces (each one demoable as a refusal)

1. **Overtime is never silent.** Logging hours past someone's weekly capacity is
   refused until they confirm, unless their manager switched overtime on; confirmed
   time is marked and their manager is told. Booking someone past capacity is
   allowed but flagged red: that's the over-allocation answer.
2. **Nothing is deleted.** Records are archived and can be reactivated, so cost history
   survives. There is no DELETE route, and the database itself refuses deletes.
3. **Deliverable dependencies can't loop,** and they stay inside one project.
4. **A deliverable can't be signed off** while any of its tasks, or anything it depends
   on, isn't done.
5. **Money is whole cents.** Budgets and costs are integers on the server, formatted
   only on screen.
6. **Only approved time costs money,** and nobody approves their own.
7. **Every change is recorded.** Each change writes an audit-log row per record it
   touches, and the people above the actor get an in-app notification.
8. **Another manager's project answers "not found"**, not "forbidden", so ids can't be
   probed.
9. **An integrity check proves the data is consistent:** no dependency loops, nothing
   live under an archived project, every record has its audit row, no time logged
   outside a booking, and no signed-off deliverable with unfinished work.
10. **New accounts and pay changes are at least $20 an hour** ($41,600 a year).
11. **Archiving someone still on a live project asks first,** naming the projects.

## How the money works

```text
hourly rate   = annual salary / 2080            (40 h x 52 weeks; frozen on each time entry)
planned cost  = sum over bookings of (hours per week x weeks booked x hourly rate)
consumed cost = sum over approved time entries of (hours x the entry's hourly rate)
at risk       = past end date and not complete, OR a deliverable overdue,
                OR a deliverable's progress > 15 points behind its elapsed time,
                OR consumed share of budget > elapsed share of schedule + 15 points
```

## Screens

Login, Change password, Dashboard, Projects (list and detail, with Deliverables, Tasks,
Board, Resources and Budget tabs), Dependency view, Allocation grid, Schedule, People
(with each person's History), My tasks (the employee's Dashboard: Ready to take; update
status, log time), Approvals (logged time), Requests, Notifications, Account (with My
history), Audit log (admin). Every screen has the top-bar search and the notification bell.

## Changed after the demo (15 Oct)

David's demo prompted these; each is described above where it belongs.

| Change | Where it shows |
| --- | --- |
| Search pages (by role) and projects from the top bar; `/`, `Ctrl+K` or `Cmd+K` jumps to it | Top bar, every screen |
| Archiving someone still on a live project warns first and lists the projects | People, Archive |
| Minimum pay of $20 an hour | People, create and edit |
| For managers and admins, two columns of at most 3 projects each, **At risk** and **On track**, the most recently active first, with **See all**; `GET /dashboard/projects` gains `atRisk`, `sort=updated` and `lastActivityAt` | Dashboard |
| A late deliverable's tooltip: "was due … · today is … · N days late" | Dashboard and project timelines |
| The row of dates starts with "Week of" | Dashboard timelines (both kinds of dashboard), Schedule |
| **How to read this** says why only some names open a menu (you can act only on people you manage) | Allocation |
| No grid pattern behind the pages; the light page a little greener | Every screen |
| Browser tests can record a video (`./tools/e2e.sh --video`), open Playwright's UI (`--ui`), and on AWS run the tests that add data with `--allow-writes` | `tools/e2e.sh`; see [TESTING.md](TESTING.md) |

## Out of scope

Emailed password reset and text messages (the workshop's AWS account can't send email or
texts), email notifications, file attachments, drag-and-drop Gantt editing, multiple
organisations, and anything payroll-like: clock in/out, pay periods, overtime pay rates.
Dark mode and refresh tokens were first left out, then built on 14 and 15 Oct.
