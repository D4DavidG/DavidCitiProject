# Requests for everyone: design

Status: **Designed 14 Oct 2026 (evening)**; plan: `docs/superpowers/plans/2026-10-14-requests.md`.

**Why:** today only a manager can ask for something (a new project). David chose
"Everyone, more kinds": employees ask their line manager, managers ask the admins, and
every answer is audited and lands in the asker's bell.

## 1. What changes, in one table

| Kind (`kind`) | Who sends | Who decides | The asker fills in | Approving does |
| --- | --- | --- | --- | --- |
| `NEW_PROJECT` (exists) | Manager | Any admin | name, description, why, proposed dates | Creates the project, managed by the asker (unchanged) |
| `ARCHIVE_PROJECT` | Manager, for a live project they manage | Any admin | the project, why | `projects.archive_project()`: the same rules, child archiving and audit rows as the Archive button |
| `TASK_LIMIT` | Employee | Their line manager or any admin | a number 1 to 10, above their current limit; why | `users.set_capacity(..., {"task_limit": n})` |
| `OVERTIME` | Employee, while overtime is off | Their line manager or any admin | why | `users.set_capacity(..., {"overtime_allowed": True})` |
| `OTHER` (free text) | Employee or manager | As for any request from that role | subject, message | Nothing: the decision is the answer |

Rules for every kind: the asker's note (`justification`) is required; the decision note
is optional; `PENDING` becomes `APPROVED` or `REJECTED` once (a second decision is 409);
nobody decides their own request; a request you may not see is 404, never 403.

## 2. Decisions (alternative rejected, and why)

| # | Decision | Rejected | Why |
| --- | --- | --- | --- |
| 1 | **Generalise `project_requests`** with a `kind` column (migration `003_request_kinds.sql`) | A new `requests` table | The table already has the status, decider, decision note, the no-delete trigger, the row in integrity query 3, the routes, `request_view` and the page. A new table would duplicate all of that, or the list would need a `UNION` of two tables. Old rows become `kind = 'NEW_PROJECT'` through the column default, so they stay valid without a data migration |
| 2 | Keep the names `project_requests` and `/project-requests` | Renaming the table and URL to `requests` | `audit_log` is append-only and its old rows say `entity_type = 'project_requests'`; a rename would split the history in two. Read the name as "requests in the project tracker". The page and menu say "Requests" |
| 3 | **Who decides follows the asker's stored role**: an employee's request goes to their line manager or any admin; a manager's goes to the admins | Deciders listed per kind | It is exactly the notification rule in `services/audit.py` (employee: line manager + admins; manager: admins). So "who is told you asked" and "who may answer" are the same people, and creating a request needs **no change** to the recipient rule |
| 4 | `name` becomes the request's title for every kind, filled by the server for the fixed kinds: "Archive Apollo", "Raise my task limit to 4", "Allow overtime"; the subject for `OTHER` | A computed title in the view | The column is already `NOT NULL` with a non-blank check; lists, notifications and the audit summary read one field with no joins |
| 5 | Approval reuses the existing service (`archive_project`, `set_capacity`) inside the request's transaction (`atomic()` nests as a savepoint) | Updating `projects` or `users` directly | The same checks run (a manager can only change their own reports; admin-only archive; "already archived" is 409), and those services write their own audit rows. Approving writes two audit rows, as approving a new project already does |
| 6 | **A decision also notifies the asker**: `record_change(..., also_notify=asker_id)` adds one optional recipient | A second insert into `notifications` in `requests.py` | One place still writes notifications. The same filters apply (never yourself, never an archived user). This also fixes a gap: a manager is not told today when their project request is decided |
| 7 | A manager may also send `OTHER` | Free text for employees only | "Everyone" was David's choice; it costs one entry in the kind table. Cost if wrong: remove `MANAGER` from that entry |
| 8 | Keep the column default `'NEW_PROJECT'` | Dropping the default after backfilling | The service always sends `kind`; the default keeps old rows and older test inserts valid. Cost: a raw `INSERT` that forgets `kind` makes a project request, which the other kind checks still constrain |
| 9 | Approve/Reject buttons appear on the **To decide** tab only | A `canDecide` field from the server | Everything on that tab is decidable by definition (the server filters it); the server still refuses anything else |

## 3. Data: `003_request_kinds.sql`

```sql
ALTER TABLE project_requests
    ADD COLUMN kind       TEXT    NOT NULL DEFAULT 'NEW_PROJECT',
    ADD COLUMN project_id BIGINT  REFERENCES projects(project_id),   -- ARCHIVE_PROJECT only
    ADD COLUMN task_limit INTEGER,                                    -- TASK_LIMIT only
    ADD CONSTRAINT requests_kind_valid CHECK
        (kind IN ('NEW_PROJECT', 'ARCHIVE_PROJECT', 'TASK_LIMIT', 'OVERTIME', 'OTHER')),
    ADD CONSTRAINT requests_project_iff_archive CHECK ((kind = 'ARCHIVE_PROJECT') = (project_id IS NOT NULL)),
    ADD CONSTRAINT requests_limit_iff_task_limit CHECK
        ((kind = 'TASK_LIMIT') = (task_limit IS NOT NULL) AND (task_limit IS NULL OR task_limit BETWEEN 1 AND 10)),
    ADD CONSTRAINT requests_dates_only_new_project CHECK
        (kind = 'NEW_PROJECT' OR (proposed_start IS NULL AND proposed_end IS NULL)),
    ADD CONSTRAINT requests_not_self_decided CHECK (decided_by <> requested_by),
    DROP CONSTRAINT requests_project_iff_approved;
ALTER TABLE project_requests ADD CONSTRAINT requests_project_iff_approved
    CHECK ((kind = 'NEW_PROJECT' AND status = 'APPROVED') = (created_project_id IS NOT NULL));
```

Dry run on 14 Oct (local Postgres 18, scratch database, 001 + 002 + an old-shaped row,
then this SQL): it applies, the old row reads `NEW_PROJECT`, a `TASK_LIMIT` row without a
limit is refused, and a self-decision is refused.

No new table, so the no-delete trigger and integrity query 3 (every request has its
CREATE audit row) already cover every kind. `001_init.sql` is not edited.

## 4. Routes (same five paths; only the role gate changes)

| Route | Gate before → after | Service rule |
| --- | --- | --- |
| `GET /project-requests` | staff → **any** | `?scope=MINE\|TO_DECIDE`, `?status=`, `?kind=`; paginated; each item carries `requesterName` |
| `POST /project-requests` | manager → **any** | body `kind` plus that kind's fields; a kind your role may not send is 403 |
| `GET /project-requests/{id}` | staff → **any** | 404 unless you asked it or may decide it |
| `POST /project-requests/{id}/approve` | admin → **staff** | 404 unless you may decide it; `NEW_PROJECT` still takes dates and budget, other kinds only `decisionNote` |
| `POST /project-requests/{id}/reject` | admin → **staff** | as approve; body `decisionNote` |

Employees never decide, so the gate on approve and reject stays at staff (403 for an
employee, as today for every approval route). "May see" = you asked it, or you are an
admin, or the asker is an `EMPLOYEE` whose `manager_id` is you. One SQL condition in
`requests.py` serves both the list and the single read.

## 5. Website

One page, `pages/requests/RequestsPage.jsx`, now in everyone's menu (`navigation.js`,
`App.jsx` route opened to all roles).

- **New request** button (managers and employees; admins have nothing to ask) opens a
  menu of only the kinds your role may send; picking one opens `FormDialog` with that
  kind's fields. `ARCHIVE_PROJECT` offers a select of your live projects (`GET /projects`).
- **Tabs Mine / To decide** for managers. An employee sees only Mine and an admin only
  To decide, so neither gets tabs.
- Filters: status and kind, both sent to the server. Columns: request, kind, asked by,
  note, status, decision note, actions. `DataTable` already becomes cards at phone width.
- On To decide, pending rows get Approve and Reject. Approve opens the existing
  new-project form for `NEW_PROJECT`, otherwise a dialog with only a note and a line
  saying what approving does ("This turns overtime on for Ana Ruiz").

## 6. Error cases

| Case | Answer |
| --- | --- |
| Admin sends any request; employee sends `NEW_PROJECT`/`ARCHIVE_PROJECT`; manager sends `TASK_LIMIT`/`OVERTIME` | 403 |
| Unknown `kind`, missing note, task limit outside 1 to 10 or not above the current one, a field from another kind | 400, tied to the field |
| Archive request for a project you don't manage or that doesn't exist | 404 (same message as a missing project) |
| Archive request for an archived project; overtime request while overtime is on | 409 |
| Seeing or deciding a request you may not see (another manager's report, another manager's request) | 404, same bytes as a missing id |
| Employee calls approve or reject | 403 (route gate) |
| Deciding twice; approving an archive for a project archived meanwhile | 409, and nothing changes |
| A decider who is the asker | impossible through the rules above; `requests_not_self_decided` refuses it in Postgres too |

## 7. Tests that prove it

- **Schema** (`test_schema.py`): one test per new CHECK, plus an old-shaped insert
  (no `kind`) that still succeeds as `NEW_PROJECT`.
- **Rules** (`test_requests.py`, never imports `api`): each kind can be sent only by its
  role; each approval has its effect (project archived with its children, limit set,
  overtime on), and `OTHER` changes nothing but status; line manager and admin may
  decide an employee's request, another manager gets 404; scopes Mine and To decide;
  kind filter; decide once; validation cases from section 6.
- **Audit** (`test_audit.py`): an employee's request notifies their manager and the
  admins, not another manager; a decision notifies the asker; `also_notify` never
  notifies the actor or an archived user.
- **API**: the read walk gets the employee's 404-not-403 case; the audit walk adds an
  employee's overtime request and the manager's decision.
- **Website** (`RequestsPage.test.jsx`, `navigation`): the kind menu per role, the tabs
  per role, the scope sent, approve of a non-project kind sends only the note.
- Integrity check runs after every database test, as always.

## 8. Docs that change in the same commits

`CLAUDE.md` (where things stand: migration 003, test counts, "requests" in the audit
list), `README.md` (architecture note on requests), `docs/REPOINFO.md` (the
`project_requests` row and diagram), `docs/GUIDE.md` (a demo line: employee asks,
manager approves, bell), `tools/tracker.http` (a request per kind), and
`tools/demo.py` seed (one pending overtime request), without reseeding the local
database.
