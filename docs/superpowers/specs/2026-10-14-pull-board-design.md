# Pull board design

Status: **Built 14 Oct 2026**; plan: `docs/superpowers/plans/2026-10-14-pull-board.md`.

**Why, in David's words:** "We don't want a push system, we want a pull system." Today a
manager hands each task to a person (push). With a pull board, the manager fills a column
of Ready work, and each employee takes the next task when they have room. A per-person
limit on unfinished tasks stops anyone from grabbing more than they can finish. This is
the Kanban pattern (pull plus a work-in-progress limit, "WIP limit").

## 1. Decisions

All three answered by David on 14 Oct.

| # | Question | Answer | What it rules out |
| --- | --- | --- | --- |
| 1 | Push or pull? | **Pull.** Employees take the next Ready task themselves | Automatic hand-out of work, queues, round-robin assignment |
| 2 | Where does the limit live? | **Per person**, set by the line manager or an admin, **default 2** | A per-column or per-project limit (the Jira/Trello board-level WIP limit) |
| 3 | When? | **Build now**, before the Thu 15 Oct demo, once David has reviewed this spec and the build plan | Leaving it as a "next step" slide |

## 2. Current state (opened 14 Oct)

`users.py`, `PeoplePage.jsx`, `TaskList.jsx`, `CLAUDE.md` and the docs were being edited
while this was checked, so those rows name the function or constant first; the line
numbers are as of 14 Oct midday.

| Fact | Where |
| --- | --- |
| Nothing assigns work automatically. The project's manager or an admin creates a task and may assign it to someone booked on the project | `backend/tracker/services/tasks.py:1-7`, `:65-82` |
| The booking check for an assignee: a live booking on that project, by a live user, any dates | `tasks.py:39-46` (`_check_assignee`, raises 400) |
| Loading a task locks its row: `SELECT ... FOR UPDATE` | `tasks.py:50` |
| Only the assignee moves status between TODO, IN_PROGRESS and DONE; another employee who can see the task gets 403. The status route is employees only | `move_task`, `tasks.py:101-117` (check at `:106-107`); `api/routes.py:90` |
| Only the assignee logs time on a task (403 otherwise) | `log_time`, `services/time_entries.py:87-88` |
| A task may have no assignee: `assignee_user_id` NULL means "not yet assigned" | `backend/tracker/store/migrations/001_init.sql:135` |
| The task list already shows a missing assignee as "Unassigned" | `frontend/src/pages/projects/TaskList.jsx:32` |
| The new-task form's Assignee field is already optional (no `required`); its hint today is "Only people booked on this project can be assigned." | the `assigneeUserId` entry in `fields`, `TaskList.jsx:26` |
| Employees see only live projects they have a live booking on; anything else is 404 | `can_see`, `backend/tracker/services/access.py:30-40` |
| Archiving a deliverable archives its live tasks; archiving a project archives its tasks too, and integrity query 2 checks it | `archive_milestone`, `services/milestones.py:158-178`; `archive_project`, `services/projects.py:133-134`; `store/integrity.py:25-38` |
| Capacity and overtime are set by the line manager or an admin through `set_capacity` | `set_capacity` in `services/users.py` (`:244-259`), `api/routes.py:57` |
| Capacity fields allowed today: `weekly_capacity_hours`, `overtime_allowed`. Admins can also set both through `PATCH /users/{id}` | `_CAPACITY_FIELDS` and `_ADMIN_FIELDS` in `services/users.py` (`:30-32`), validated in `_validate_fields` (`:64-67`) |
| The users service reads and returns a fixed column list (`_row`, `_update`), so a new `users` column must be added to it or it never reaches the screen | `COLUMNS` in `services/users.py` (`:26-28`) |
| The capacity check locks the person's row before counting | `services/time_entries.py:54` |
| The user serializer (fields by name, camelCase) | `_USER`, `services/views.py:21-27` |
| `audit_log.action` is free text, no CHECK, so new actions need no migration | `001_init.sql:213` |
| Migration file names must match `NNN_name.sql`; all run under one advisory lock | `store/migrate.py:20`, `:53` |
| The route table has 62 routes | `ROUTES` in `api/routes.py` (62 `_r(` entries; the 63rd `_r(` match is the helper `def _r` at `:42`) |
| The seed already makes one task with no assignee: "Go-live checklist" on Apollo's Launch deliverable | `tools/demo.py:163` |
| The CLAUDE.md decision "Tasks" says "The manager creates and assigns" | `CLAUDE.md`, "The stack", row "Tasks" (`:59`) |

## 3. Rules

**Words.** A task is **Ready** when it has no assignee, is not DONE, and is not archived.
(Archived deliverables and projects archive their tasks, section 2, so "not archived"
covers them.) A person **holds** a task when they are its assignee, its status is TODO or
IN_PROGRESS, the task is not archived and its project is not archived. **Held** counts
across all projects. The **limit** is `users.task_limit`.

**Take this** (claim, `POST /tasks/{id}/claim`, employees only):

| Check, in this order | Refusal |
| --- | --- |
| The task exists and you can see its project (a live booking) | 404 "Task not found." (the existing 404-not-403 rule) |
| The task is not archived | 409 "This task is archived." |
| The task is not DONE | 409 "This task is already done." |
| It has no assignee | 409 "This task is already taken." (also when you hold it yourself) |
| Held < limit | 409 "You already hold 2 unfinished tasks, your limit. Finish one first, or ask your manager to raise it." (the numbers are the real ones) |

On success: assignee = you, status = IN_PROGRESS. One meaning picked: the plan's
"not booked on the project" check is the same live-booking test the visibility rule
already runs (`access.py:37-40`), so a person with no booking gets the 404 above. There is
no separate 409 for it.

**Put back** (release, `POST /tasks/{id}/release`, employees only):

| Check | Refusal |
| --- | --- |
| The task exists and you can see its project | 404 "Task not found." |
| You are its assignee | 403 "Only the task's assignee can put it back." (as `move_task`, `tasks.py:106-107`) |
| Not archived | 409 "This task is archived." |
| Not DONE | 409 "This task is done. Move it back to In progress first." |

On success: assignee = NULL, status = TODO. Time already logged stays yours, because each
entry carries its own `user_id` (`001_init.sql:162`). Nobody else can log on it until they
take it, because only the assignee logs time (`time_entries.py:87-88`).

**Managers still assign.** The project's manager or an admin can set the assignee through
the existing `PATCH /tasks/{id}`, **even past the person's limit.** That is allowed and
flagged ("3 / 2, over limit"), the same way over-allocated bookings are allowed and
flagged (CLAUDE.md decision "Over-allocation"). The limit is hard only for claims.

**The limit itself.** An integer from 1 to 10, default 2. Set next to weekly capacity and
overtime by the person's line manager or an admin. Lowering it below what someone holds
is allowed: they show as over, and their next claim is refused until they are under.

## 4. Database

New file `backend/tracker/store/migrations/002_task_limit.sql` (never edit `001`):

```sql
-- 002_task_limit: the most unfinished tasks a person may take themselves.
-- Design: docs/superpowers/specs/2026-10-14-pull-board-design.md
ALTER TABLE users ADD COLUMN task_limit INTEGER NOT NULL DEFAULT 2;
ALTER TABLE users ADD CONSTRAINT users_task_limit_range CHECK (task_limit BETWEEN 1 AND 10);
```

- Still 10 tables, plus `schema_migrations`. Two migration files.
- Applied by itself on the next cold start, under the existing advisory lock.
- Adding a column with a constant default is a metadata-only change in Postgres 11 and
  later: no table rewrite. The CHECK scans `users` once, a few dozen rows.
- Every existing person gets 2.

## 5. API

Four new routes, so 62 becomes 66. Errors go through the one error table
(`api/errors.py`); 409 is `Conflict` (`:26`).

| Method and path | Roles | Body | Returns |
| --- | --- | --- | --- |
| `POST /tasks/{id}/claim` | Employee | none | The task (`task_view`) |
| `POST /tasks/{id}/release` | Employee (the assignee) | none | The task |
| `GET /projects/{id}/board` | Anyone who can see the project | none | The list envelope of every live task on the project, with deliverable and assignee names, from one query; plus `people`: each person with a live booking, as `{ userId, name, held, limit }` |
| `GET /me/ready-tasks` | Employee | none | The list envelope of Ready tasks on projects you have a live booking on, plus your own `held` and `limit` |

Changed:

- `PATCH /users/{id}/capacity` also accepts `taskLimit` (1 to 10; outside that, 400 on
  the field): `task_limit` joins `_CAPACITY_FIELDS` and `_ADMIN_FIELDS`, so it is set
  wherever capacity is set today.
- `task_limit` joins `COLUMNS` in `services/users.py`, and the user serializer adds
  `taskLimit` (`_USER`, `services/views.py:21-27`).

Both reads are short and unpaginated, in the same envelope as other short lists
(`_whole`, `api/handlers.py:51-54`).

## 6. Screens

**Board tab** on the project page, after Deliverables, Resources and Budget
(`frontend/src/pages/projects/ProjectDetailPage.jsx:109-112`). Every role that can see
the project sees it.

Sketch with the seeded Apollo tasks (`tools/demo.py:155-163`). Buttons for both roles are
drawn together; each person sees only their own.

```
 People:  Ana Ruiz 1 / 2   Ben Okafor 1 / 2      (red when over the limit)
+----------------+----------------+----------------+----------------+
| Ready          | To do          | In progress    | Done           |
+----------------+----------------+----------------+----------------+
| Go-live        | Portal UI      | Portal API     | Wireframes     |
|   checklist    | Build · 40 h   | Build · 60 h   | Design · 16 h  |
| Launch · 8 h   | Ben Okafor     | Ana Ruiz       | Ana Ruiz       |
| Unassigned     | [Assign]       | [Put back]     |                |
| [Take this]    |                |                |                |
+----------------+----------------+----------------+----------------+
```

- Columns: Ready = no assignee and not DONE. To do = assigned and TODO. In progress =
  assigned and IN_PROGRESS. Done = DONE.
- A card shows the title, deliverable, estimate and who has it.
- The strip shows each booked person's "held / limit", red when held is over the limit.
- Managers and admins: **Assign** on every card outside Done (a picker of booked people;
  it calls the existing `PATCH /tasks/{id}`). Done cards are left alone, since reassigning
  finished work changes nothing.
- Employees: **Take this** on Ready cards, **Put back** on their own unfinished cards.
- Buttons, not drag-and-drop: they work by keyboard and on phones, and they are quicker
  to build well.
- On a phone, the columns stack.

**My tasks:** a "Ready to take" section with **Take this** on each card, and "You hold 1
of 2" above it.

**People, Capacity dialog:** a "Task limit" number box under weekly capacity and
overtime (`CAPACITY_FIELDS` in `frontend/src/pages/people/PeoplePage.jsx`, `:21-24`).

**New task form:** the Assignee field stays optional; its hint changes from "Only people
booked on this project can be assigned." to "Leave empty to put it on the board as Ready"
(the `assigneeUserId` entry in `fields`, `TaskList.jsx:26`).

## 7. Concurrency

Two problems, two locks. Claim and release both take them in the same order (task, then
person), so two claims cannot deadlock each other.

| Race | What stops it |
| --- | --- |
| Two people press Take this on one task | The task row is locked with `SELECT ... FOR UPDATE` (`tasks.py:50`). The second claim waits, then sees an assignee and gets 409 |
| One person claims two tasks from two tabs while at 1 of 2 | Their `users` row is locked `FOR UPDATE` before counting held tasks, as the capacity check does (`time_entries.py:54`). The second claim waits, counts 2, and gets 409 |

One edge stays: logging time locks the person first, then touches the task through its
foreign key (`time_entries.py:54`, `001_init.sql:172-173`), the opposite order. Hitting it
needs one person to log time on a task, put it back and take it again, all at the same
instant. Postgres would spot the deadlock and fail one request with an error rather than
hang. Accepted; not worth a fix the night before the demo.

## 8. Audit and notifications

- Claim and release each call `record_change` (`services/audit.py:27`) in the same
  transaction, entity `tasks`, actions `CLAIM` and `RELEASE`, before and after from
  `task_view`.
- Summaries: "Ana Ruiz took task Go-live checklist" and "Ana Ruiz put back task Go-live
  checklist".
- The claimer is an employee, so the existing table notifies their line manager and every
  admin.
- A manager's direct assign is already audited as `UPDATE` (`tasks.py:96-97`); no change.

## 9. Tests

| Layer | Tests |
| --- | --- |
| Backend rules (`tests/backend/test_work.py`) | Each refusal in section 3; a successful claim and release; held counts only unfinished, live tasks on live projects; a manager can assign past the limit; one audit row per claim and release; the line manager gets the notification |
| Concurrency | Two connections on their own database (the pattern of `test_store_commits.py:17-23`, since the main suite rolls back). Two claims on one task: one 409. One person at 1 of 2 claiming two tasks: one 409 |
| Database | 002 applies; default 2; 0 and 11 refused by the CHECK. `test_migrate.py:33` changes from `[1]` to `[1, 2]` |
| API | The read and write walk tests (`test_api_read_walk.py:105`, `test_api_audit_walk.py:100-101`) fail until the 4 routes are called, so they must be added there |
| Website (Vitest) | The Board tab's columns and buttons per role; Ready to take on My tasks; the Task limit box |
| Browser (Playwright) | An employee takes a Ready task. This puts an employee in a browser test for the first time, but the named gap, "log time, then the manager approves", stays open (`docs/REPOINFO.md`, answer 30 "What isn't tested?"; `docs/DEMO-RUNBOOK.md`, "What no browser test covers") |
| Integrity check | No new query: the limit is soft for managers by design, so "nobody over the limit" is not an invariant |

## 10. Docs to update when it is built

- `README.md`: architecture notes and the feature list.
- `MVP.md`: the Tasks bullets (`:46-48`) and the permissions table (`:72-73`).
- `CLAUDE.md`, "The stack", decision "Tasks": "The manager creates; employees pull Ready
  tasks; managers can still assign."
- Route count 62 to 66: every "62" in `docs/GUIDE.md` and `docs/REPOINFO.md`
  (`grep -n '62' docs/GUIDE.md docs/REPOINFO.md`; README has none).
- Migrations 1 to 2: lines that say the whole schema is in `001_init.sql` (README "Data
  model", REPOINFO "The ten tables", GUIDE's file map).
- `docs/REPOINFO.md`: "What isn't tested?" and the next-steps list both name
  concurrency as untested; the claim tests cover the two row locks in section 7, not the
  exclusion constraint or the advisory lock.
- `docs/REPOINFO.md` and `docs/DEMO-RUNBOOK.md`: a "push versus pull" answer and
  the demo steps.

## 11. Deploy

David runs, in this order:

```sh
./bin/deploy-backend.sh
./bin/deploy-frontend.sh
```

The new column applies itself on AWS at the first cold start afterwards.

## 12. Out of scope

- Drag-and-drop.
- Per-column or per-project WIP limits.
- Automatic assignment or queues: the push model David rejected.
- Emailing anyone.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| A migration the night before the demo | It only adds a column with a default. Run the tests, then LocalStack, before AWS. Demo data is untouched |
| No Ready task to take in the demo | The seed already made one: "Go-live checklist" on Apollo, no assignee (`tools/demo.py:163`); Ana or Ben, both booked on Apollo and holding 1, can take it. If it was assigned on the live site since, the manager creates a task with no assignee first. (`demo.py seed` does nothing once Apollo exists, `tools/demo.py:117-119`) |
| `tools/demo.py demo` looks up "Portal UI" in Ben's own tasks (`tools/demo.py:252-253`) | Don't put back Portal UI as Ben, or that script stops |
| The screen tour lists project tabs by name (`frontend/e2e/tour.spec.js:15-24`) | Add `PROJECT:Board` for both roles |
| The project's manager is not told about a claim unless they are the line manager (the notification table is by role, not by project) | The board shows it. Say so if asked |

## 14. How to explain it

- **Pull:** "Managers fill the Ready column; people take the next task when they have
  room. Nobody gets work pushed on them."
- **Per-person limit:** "Each person may hold two unfinished tasks unless their manager
  raises it. Finishing beats starting, and it shows who is stretched."
- **Managers can still assign:** "Sometimes a task must go to one person. The manager can
  do that past the limit, and the board flags it in red, like over-allocated bookings."
- **No double take:** "Taking a task locks its row in Postgres. If two people press Take
  this together, the second waits, sees it's taken, and gets a clear refusal."
