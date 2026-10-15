# Employee history (design)

Written 14 Oct from David's note "want to see history for employees". Built in the same
run (controller ruling: no wait for review). Plan: `docs/superpowers/plans/2026-10-14-history.md`.

## 1. What and why

Today the only way to see what happened to or by one person is the admin audit log,
filtered by actor. That misses changes *to* the person made by someone else (an admin
reset their password, their manager changed their capacity), and managers can't open it
at all. The new **History** shows one person's trail:

- rows they made (`audit_log.actor_user_id = id`), and
- rows about their account (`entity_type = 'users' AND entity_id = id`),

newest first, paginated, filtered by action and date range. It is read-only and built
entirely on the existing append-only `audit_log`: no new table, no migration.

## 2. Who sees what

| Caller (stored role) | May read | Sees |
| --- | --- | --- |
| Admin | anyone, archived people included | when, who, action, record, summary **and** before/after state |
| Manager | their direct reports (`users.manager_id = me`) | when, who, action, record, summary. No state |
| Anyone | themselves | the same as a manager. No state |
| Anyone else | nobody | **404 "User not found."**, byte-identical to a missing id |

## 3. Decisions

| Decision | Rejected alternative, and why |
| --- | --- |
| **The person may read their own history** (ruling for David) | Staff only: the person then can't see who reset their password or changed their capacity, which is exactly what they'd ask. Cost if wrong: one condition and the "My history" card removed |
| A manager reads only their **direct reports'** history, and only while their stored role is MANAGER | Any manager (as `GET /users/{id}` allows): history summaries name projects the manager can't see, so it is more sensitive than a profile. Cost if wrong: one condition |
| **Before/after state only for admins.** For everyone else the `beforeState` and `afterState` keys are absent, not null | Strip `annualSalaryCents` from snapshots for managers: user snapshots carry salary on purpose (`users._snapshot`), and any later salary-derived field would leak silently. Dropping the whole state is one rule, easy to prove with a test, and the one-line summary never contains salary (`test_notification_text_is_a_summary_without_salary`) |
| The same rule for the person themself (no state) | Showing state to self: they may see their own salary, but other snapshots in their trail (a request, a task) are not shaped for them. One rule `include_states = actor.is_admin` is easier to explain |
| Rows about the person = their **account** (`users/{id}`) only | Also bookings, tasks and time entries that others changed about them: needs a join per table; their own work already appears as rows they made. Follow-up if David wants it |
| Actor name joined by the server (`actorName`, "System" on screen when null) | Look up names in the browser like the audit-log page: employees may not call `GET /users`, so self-history would show ids |
| No new index | `CREATE INDEX audit_actor ON audit_log (actor_user_id)` in a migration 006: the demo has thousands of rows, a scan is milliseconds. Cost if wrong: one new migration |
| Action filter is an exact match on the stored action (upper-cased, at most 64 characters); dates as in the admin log (`dateFrom` inclusive, `dateTo` inclusive of the whole day) | A fixed set of actions validated on the server: new actions get added as features grow, and an unknown action just matches nothing |
| Website: a **History** button on each People row opens a dialog (full screen on phones), and **My history** on the Account page; both use one `HistoryPanel` | A separate `/people/{id}` page: a new route and a profile page for one list |
| Listed with `DataTable` (table on desktop, cards on phones) and MUI `Pagination`, like every other list | "Load more": no other list does it |

## 4. Changes

**Route.** `GET /users/{id}/history` in `api/routes.py`, roles `ANY` (the service decides;
69 routes). Query: `action`, `dateFrom`, `dateTo`, `page`, `pageSize`. Answers the usual
`{ items, page, pageSize, total, totalPages }`. Reads are not audited.

**Service.** `services/audit.py`:
`person_history(conn, actor, user_id, filters, page, page_size) -> dict`. Checks access
as in section 2 (one `SELECT manager_id FROM users`), then
`SELECT a.*, (SELECT first_name || ' ' || last_name FROM users u WHERE u.user_id = a.actor_user_id) AS actor_name
FROM audit_log a WHERE (a.actor_user_id = %(uid)s OR (a.entity_type = 'users' AND a.entity_id = %(uid)s)) AND ...`,
ordered `audit_id DESC`. The scalar subquery (not a JOIN) keeps `created_at` unambiguous,
so the date filters are shared with `list_audit` through a small `_date_filters(filters,
where, params)` helper.

**View.** `services/views.py`: `audit_view(row, include_states=True)`; when false the two
state keys are left out; `actorName` is added when the row has `actor_name`. The handler
passes `include_states=ctx.actor.is_admin`.

**Website.**
- `components/auditText.js`: `ENTITY_LABELS`, `actionLabel`, `changedFields`, `show`, moved
  out of `AuditLogPage.jsx`; `components/AuditChanges.jsx`: the before/after table, moved
  too. The audit-log page imports them (no behaviour change). Its docstring wrongly says
  salaries are never in snapshots; corrected to "they are, which is why this page is admin only".
- `components/HistoryPanel.jsx` (`userId` prop): filters (Action select, From, To, Apply,
  Clear), a `DataTable` labelled "History" (When, Who, Action, Record, Summary, and for
  admins a **Show changes** button opening the before/after table in a dialog), empty text
  "No history matches.", `Pagination` when more than one page (page size 10).
- `PeoplePage.jsx`: a **History** button per row for admins (every row) and managers (their
  own reports); dialog titled "History: Ben Okafor", `fullScreen` on phones (`useIsMobile`).
- `AccountPage.jsx`: a "My history" card with `<HistoryPanel userId={user.userId} />`.

## 5. Errors

| Case | Answer |
| --- | --- |
| No such user, or one you may not read | 404 `{ "error": "User not found." }` (same bytes) |
| `dateFrom`/`dateTo` not YYYY-MM-DD | 400 with `field` |
| `action` longer than 64 | 400 with `field: "action"` |
| `dateFrom` after `dateTo`, or an unknown action | 200, empty page |

## 6. Tests that prove it

Backend (`test_audit.py` for the rule, `test_api.py` and the read walk for HTTP): the trail
holds rows by and about the person and nothing else, newest first; admin, line manager and
self may read; another manager and another employee get 404 identical to a missing id;
action and date filters; pagination; **a manager's response contains neither the salary
value nor `annualSalaryCents` nor any state key after an admin changed that salary**,
while the admin's response does show it; self gets no state; a bad date is 400.
Website (Vitest): the panel lists entries with names and "System"; Show changes appears only
when state is present; filters reach the query and reset to page 1; People shows History
to admins on every row and to managers only on their reports; Account shows My history.

## 7. Docs that change

`README.md` (API notes: the route, who sees what, why no state for non-admins), `CLAUDE.md`
("Where things stand": built, not deployed; route and test counts), `docs/REPOINFO.md`
(say-this line on history and salary), `docs/DEMO-RUNBOOK.md` (not-yet-deployed list),
`tools/tracker.http` (one GET).
