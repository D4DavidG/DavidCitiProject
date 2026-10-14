# ACME Project Tracker: MVP

The minimum version that meets the workshop brief. Citi coding workshop, 13 to 15 Oct
2026. Stack fixed by the brief: React with React Responsive and Material UI, Python on
AWS Lambda, PostgreSQL, deployed with Terraform and the repo's shell scripts.

## The problem, in one line

ACME runs many projects and can't see their progress, who is working on what, or where
the money is going. The MVP answers seven questions, and each answer has its own screen.

| # | Client question | Screen that answers it |
| --- | --- | --- |
| 1 | What is the status of each active project? | Project list, status column |
| 2 | Which projects are at risk of missing deadlines? | Dashboard, "At risk" panel with the reason |
| 3 | How are resources allocated across projects? | Allocation grid: people down, weeks across |
| 4 | What are the key deliverables and their completion status? | Deliverables tab: progress from tasks, timeline, sign-off |
| 5 | Which team members are over-allocated? | Allocation grid: projects and hours per person per week, flagged past capacity |
| 6 | What is the dependency chain between deliverables? | Dependency view on the project |
| 7 | How much budget is consumed versus planned? | Budget bar on the project |

## Features the brief asks for

| Brief says | MVP builds |
| --- | --- |
| User authentication and authorization | Login with a generated username and password, changed on first login; a signed token (JWT) that expires; passwords hashed |
| Role-based access control | Admin, Manager, Employee. The server checks the role on every request |
| CRUD for projects | Create, view, edit, archive and reactivate |
| CRUD for deliverables | Same, per project, plus tasks under each and "depends on" links between deliverables |
| CRUD for resources | Assign a person to a project for N hours per week over a date range |
| CRUD for budget tracking | A budget per project. Planned cost comes from bookings; consumed cost comes from approved logged hours |
| Search and filter | Name search and status filter on every list, done on the server, paginated |
| Responsive design | Tables turn into cards on phones; the allocation grid scrolls sideways |

## Accounts

An admin creates each account. The server generates the username (initials plus six
digits, e.g. `DG482913`, never changes) and a 12-character password, shown to the admin
once. The user must change it on first login. Users can then change their own name,
email and password. A forgotten password is reset by an admin.

## Tasks and time (how the work gets tracked)

Modelled on Jira, GitHub Projects and OpenProject, not on a payroll system.

- **Tasks:** each deliverable is broken into tasks. The project's manager creates them,
  gives each an estimate in hours, and assigns it to someone booked on the project.
- **Ticking work off:** the assignee moves their task from To Do to In Progress to Done.
- **Progress** of a deliverable is the share of its estimated hours that are done.
  "Blocked" shows automatically while a deliverable it depends on isn't finished.
- **Sign-off:** the manager signs a deliverable off, and only once all its tasks and
  dependencies are done.
- **Logging time:** the assignee logs hours on their task (a date, a number of hours,
  a note). Their line manager, or any admin, approves or rejects it. Only approved time
  is charged to the project's budget, at the hourly rate the person had when they
  logged it.
- **Capacity:** each person has a weekly capacity (default 40 hours) and an "overtime
  allowed" switch, set by their line manager. With the switch off, logging hours past
  capacity is refused. With it on, the week is flagged as overtime.

## Who can do what

| Action | Admin | Manager | Employee |
| --- | --- | --- | --- |
| Create, archive and restore users; reset passwords; edit salaries | yes | no | no |
| Set weekly capacity and "overtime allowed" | anyone | own reports | no |
| Edit own name and email; see own salary | yes | yes | yes |
| Create projects, approve requests, assign managers, archive or restore projects | yes | no | no |
| Request a new project | n/a | yes | no |
| Edit description, dates, budget and status; book people | all | own projects | no |
| Deliverables and dependencies: create, edit, sign off, archive | all | own projects | no |
| Tasks: create, assign, estimate | all | own projects | no |
| Move a task's status; log time on it | no | no | own assigned tasks |
| Approve or reject logged time | anyone | own reports | no |
| See projects | all, including archived | the ones they manage | booked on, active only |
| Audit log | yes | no | no |

Usernames never change. Nobody changes their own role or salary, and nobody approves
their own time.

## Rules the app enforces (each one demoable as a refusal)

1. **No overtime unless allowed.** Logging hours past someone's weekly capacity is
   refused unless their manager switched overtime on. Booking someone past capacity is
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
Resources and Budget tabs), Dependency view, Allocation grid, People, My tasks (update
status, log time), Approvals (logged time), Project requests, Notifications, Audit log
(admin).

## Out of the MVP

Dark mode, refresh tokens, emailed password reset (the workshop AWS account has no
email service), email notifications, file attachments, drag-and-drop Gantt editing,
multiple organisations, and anything payroll-like: clock in/out, pay periods, overtime
pay rates.
