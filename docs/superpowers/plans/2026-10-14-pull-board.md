# Pull Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees take the next Ready task themselves ("Take this"), up to a per-person limit of unfinished tasks (default 2), and managers still assign. A Board tab shows it all on the project page.

**Architecture:** One new migration adds `users.task_limit`. Four new routes (62 to 66) sit in the one route table. Each calls one service in `services/tasks.py`. Claim and release lock the task row and then the person's row, and write `CLAIM` / `RELEASE` audit rows through `record_change` in the same `atomic()`. Two read services, one per screen, each run without N+1 queries. The website gets a Board tab, a "Ready to take" section on My tasks, and a Task limit box in the People Capacity dialog. All of these call through `request()`.

**Tech Stack:** Python 3.13, psycopg 3, PostgreSQL 18 / Aurora, pytest; React 19, MUI 9, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-pull-board-design.md`. David approved it on 14 Oct ("pull board spec looks good"). Read it before any task.

## Global Constraints

- Commit only when David has chosen an execution method (that choice is his go-ahead to commit); never push or deploy — David runs git push and the bin/ deploy scripts.
- Build on the working tree as it is. Earlier today's work (the `duration` field type in `FormDialog`, "Copy username and password" in `PeoplePage`, the `users.login` timing fix) is committed in `5af40a4`. Don't revert or reformat it.
- David renamed the interview-prep doc on 14 Oct: `docs/INTERVIEW-PREP.md` is now `docs/REPOINFO.md` (same content). Every "REPOINFO" below means that file. Task 1's commit includes the rename if it's still uncommitted.
- Schema: `TEXT` + `CHECK`, never `ENUM`. A new numbered file `store/migrations/002_task_limit.sql`. **Never edit `001_init.sql`**, because the runner refuses any applied file whose sha256 has changed (`store/migrate.py:66-67`).
- SQL values are always parameters. Varying names go through `store.postgres` helpers (`insert`, `update`, `columns`) or `psycopg.sql`, never f-strings. Bandit B608 must stay clean.
- Every change calls `audit.record_change(...)` inside the same `atomic(conn)` block as the change.
- Something that exists but isn't yours answers 404 with a byte-identical message: `"Task not found."` for tasks, `"Project not found."` for projects.
- There is one route table (`api/routes.py`) and one exception-to-status table (`api/errors.py`). There are no new exception classes: 409 is `Conflict`, 403 is `Forbidden`, 404 is `NotFound`, 400 is `ValidationError(field=...)`.
- camelCase appears only in `services/views.py` (explicit field maps), `api/http.py`, and the envelope keys `api/handlers.py` builds (`pageSize`, `totalPages`; this plan adds `people`, `held`, `limit`). Services return snake_case rows, and `holder_view` maps `task_limit` to `limit`.
- Money is untouched. Nothing in this plan reads or writes cents.
- There is no DELETE anywhere. The walk tests must call the 4 new routes, or they fail.
- Frontend: every call goes through `request()` in `src/services/request.js`. Only `src/services/format.js` turns minutes into text (`formatHours`). Forms are `components/FormDialog.jsx`, whose server field errors are already tied with `aria-describedby` through MUI `helperText`. Every component gets PropTypes and JSDoc. No new icons are needed. If one is added, it is named `…Outlined` and `node_modules/@mui/icons-material/<Name>.js` must exist.
- Copy (verbatim from the spec):
  - Buttons and labels: **Take this**, **Put back**, **Assign**, **Task limit**, **Board**, **Ready to take**, "You hold 1 of 2".
  - Columns: **Ready**, **To do**, **In progress**, **Done**.
  - Audit actions: `CLAIM`, `RELEASE`.
  - Limit: default **2**, range **1..10**.
  - After a claim: `status = 'IN_PROGRESS'`, assignee = you. After a release: `status = 'TODO'`, `assignee_user_id = NULL`.
- Refusals (verbatim, spec section 3):
  - `"Task not found."` (404)
  - `"This task is archived."` (409)
  - `"This task is already done."` (409, claim)
  - `"This task is already taken."` (409)
  - `"You already hold 2 unfinished tasks, your limit. Finish one first, or ask your manager to raise it."` (409, with the real number)
  - `"Only the task's assignee can put it back."` (403)
  - `"This task is done. Move it back to In progress first."` (409, release)
- Audit summaries: `"{name} took task {title}"` and `"{name} put back task {title}"`.
- New-task hint: `"Leave empty to put it on the board as Ready"`. It replaces `"Only people booked on this project can be assigned."`.

## Review Focus

1. **The demo's only Ready task is on a blocked deliverable.** "Go-live checklist" sits on Launch, which waits for Build. Ready doesn't depend on deliverable status, so taking it must work. Test: `test_a_task_on_a_blocked_deliverable_can_still_be_taken` (Task 3).
2. **The limit is lowered below what someone holds.** The save succeeds. Their next claim is refused with a message giving both real numbers, not "your limit" at a number that isn't their limit. Test: `test_lowering_the_limit_below_what_someone_holds_then_refuses_claims` (Task 3).
3. **Put back after logging time.** The time stays the person's, and they can't log more until they take the task again. Test: `test_put_back_keeps_logged_time_and_stops_further_logging` (Task 3).
4. **Someone's booking ends while they hold a task.** They can't see the project, so Put back answers 404. The manager can still clear the assignee through `PATCH /tasks/{id}` with `assigneeUserId: null`, after which the task is Ready again and no longer counts against them. On screen the manager can only reassign: the Assign picker lists booked people and has no empty choice (spec section 6). Test: `test_manager_clears_a_task_held_by_someone_no_longer_booked` (Task 5).
5. **A stale board.** Someone presses Take this on a card another person took a moment ago. The 409 "This task is already taken." shows, and the board reloads so the card moves to its real column. Test: `it('shows "already taken" and reloads the board when someone got there first')` (Task 7).

---

### Task 1: Migration 002 adds `users.task_limit`

**Files:**
- Create: `backend/tracker/store/migrations/002_task_limit.sql`
- Modify: `tests/backend/test_migrate.py:32-40`
- Test: `tests/backend/test_migrate.py`, `tests/backend/test_schema.py` (users section, after `test_capacity_is_1_to_60_hours`)

**Interfaces:**
- Produces: column `users.task_limit INTEGER NOT NULL DEFAULT 2`, constraint `users_task_limit_range`.

- [ ] **Step 1: Write the failing tests**

```python
# test_migrate.py: change the two existing assertions
def test_fresh_database_reaches_the_latest_version(mconn):
    assert migrate.run(mconn) == [1, 2]
    ...
def test_second_run_applies_nothing(mconn):
    ...
    assert mconn.execute("SELECT count(*) AS n FROM schema_migrations").fetchone()["n"] == 2

# new: Aurora is at version 1 with data; 002 must apply on top of it (add `import shutil` at the top)
def test_002_adds_task_limit_to_existing_people(mconn, tmp_path):
    shutil.copy(migrate.MIGRATIONS_DIR / "001_init.sql", tmp_path)
    assert migrate.run(mconn, directory=tmp_path) == [1]
    mconn.execute("INSERT INTO users (username, first_name, last_name, email, role, password_hash)"
                  " VALUES ('AA000001', 'A', 'B', 'a@acme.test', 'EMPLOYEE', 'x')")
    assert migrate.run(mconn) == [2]
    assert mconn.execute("SELECT task_limit FROM users").fetchone()["task_limit"] == 2
```

```python
# test_schema.py
def test_task_limit_defaults_to_2(conn):
    assert rows.user(conn)["task_limit"] == 2

@pytest.mark.parametrize("limit", [0, 11])
def test_task_limit_is_1_to_10(conn, limit):
    person = rows.user(conn)
    assert refused(conn, "UPDATE users SET task_limit = %s WHERE user_id = %s",
                   (limit, person["user_id"])) == "users_task_limit_range"
```

- [ ] **Step 2: Run them and expect failures**

Run: `.venv/bin/pytest tests/backend/test_migrate.py tests/backend/test_schema.py -q`
Expected: FAIL. The lists are `[1]` not `[1, 2]`, and `KeyError: 'task_limit'`.

- [ ] **Step 3: Create `002_task_limit.sql` with exactly the spec's SQL** (spec section 4: the two comment lines and the two `ALTER TABLE` statements).

- [ ] **Step 4: Run the whole backend suite and expect it to pass**

Run: `.venv/bin/pytest -q`
Expected: all pass. `conftest.test_database` migrates `tracker_test` to version 2.

- [ ] **Step 5: Commit**

```bash
git add backend/tracker/store/migrations/002_task_limit.sql tests/backend/test_migrate.py tests/backend/test_schema.py
git commit -m "Add migration 002: users.task_limit, 1 to 10, default 2"
```

---

### Task 2: Task limit through the users service

**Files:**
- Modify: `backend/tracker/services/users.py`: `COLUMNS` (`:26-28`), `_ADMIN_FIELDS` / `_CAPACITY_FIELDS` (`:30-32`), `_validate_fields` (`:47-68`), and the summary in `set_capacity` (`:258`)
- Modify: `backend/tracker/services/views.py`: `_USER` (`:21-27`)
- Test: `tests/backend/test_users.py` ("capacity and overtime" section), `tests/backend/test_api.py`

**Interfaces:**
- Consumes: the `users.task_limit` column (Task 1).
- Produces: `users.set_capacity(conn, actor, user_id, {"task_limit": int})`. User rows carry `task_limit`, and `user_view` carries `"taskLimit"`. `PATCH /users/{id}/capacity` and `PATCH /users/{id}` accept `taskLimit`.

- [ ] **Step 1: Write the failing tests**

```python
# test_users.py
def test_line_manager_sets_the_task_limit(conn, org):
    row = users.set_capacity(conn, org["boss"], org["alice"].user_id, {"task_limit": 3})
    assert row["task_limit"] == 3

@pytest.mark.parametrize("limit, message", [(0, "between 1 and 10"), (11, "between 1 and 10"),
                                            ("3", "a whole number"), (2.5, "a whole number")])
def test_task_limit_must_be_1_to_10(conn, org, limit, message):
    # The message matters: before Task 2, only_allowed already raises a ValidationError on
    # field task_limit ("Task limit can't be changed here."), so checking the field alone passes early.
    with pytest.raises(ValidationError, match=f"^Task limit must be {message}.$") as caught:
        users.set_capacity(conn, org["boss"], org["alice"].user_id, {"task_limit": limit})
    assert caught.value.field == "task_limit"

def test_a_new_persons_task_limit_is_2(conn, org):
    assert users.get_user(conn, org["admin"], org["alice"].user_id)["task_limit"] == 2

def test_an_admin_sets_the_task_limit_through_the_account_edit(conn, org):
    assert users.admin_update(conn, org["admin"], org["alice"].user_id, {"task_limit": 4})["task_limit"] == 4
```

```python
# test_api.py
def test_capacity_takes_task_limit_and_names_the_field_when_out_of_range(conn, org):
    b = client_for(conn, org, "bob")
    uid = org["alice"].user_id
    status, payload = b.call("PATCH", f"/users/{uid}/capacity", {"taskLimit": 11})
    assert (status, payload) == (400, {"error": "Task limit must be between 1 and 10.", "field": "taskLimit"})
    status, payload = b.call("PATCH", f"/users/{uid}/capacity", {"taskLimit": 3})
    assert (status, payload["taskLimit"]) == (200, 3)
```

- [ ] **Step 2: Run them and expect failures**

Run: `.venv/bin/pytest tests/backend/test_users.py tests/backend/test_api.py -q -k task_limit`
Expected: 8 selected, 8 failed. `values.only_allowed` refuses `task_limit` ("Task limit can't be changed here."), and the user row has no `task_limit` key (`KeyError`), because `COLUMNS` doesn't list it yet.

- [ ] **Step 3: Implement**
  - Add `"task_limit"` to `COLUMNS`, `_ADMIN_FIELDS` and `_CAPACITY_FIELDS`.
  - In `_validate_fields`, add `clean["task_limit"] = values.integer(data, "task_limit", minimum=1, maximum=10)`. Its message is "Task limit must be between 1 and 10."
  - In `_USER`, add `"taskLimit": "task_limit"`.
  - Change the `set_capacity` summary to `f"{actor.name} updated capacity, overtime and task limit settings for {_name(row)}"`.

- [ ] **Step 4: Run the whole backend suite and expect it to pass**

Run: `.venv/bin/pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tracker/services/users.py backend/tracker/services/views.py tests/backend/test_users.py tests/backend/test_api.py
git commit -m "Task limit: set with capacity by the line manager or an admin, shown as taskLimit"
```

---

### Task 3: Take this and Put back (claim and release services)

**Files:**
- Modify: `backend/tracker/services/tasks.py`. Update the module docstring (`:1-7`) to describe pull plus a manager's assign. Add a `held_count` helper, `claim_task` and `release_task` after `move_task`.
- Test: `tests/backend/test_work.py`. Add a section `# --- the pull board`, plus an `org` booking for a second project where a test needs it.

**Interfaces:**
- Consumes: `users.task_limit` (Task 1). Existing `_load(conn, actor, task_id, manage=False)` (it locks the task row and returns 404 "Task not found." when hidden). `audit.record_change`. `task_view`.
- Produces:
  - `HELD: psycopg.sql.SQL`: the one SQL definition of "held", a scalar subquery correlated on the outer alias `u` (a `users` row): `(SELECT count(*) FROM tasks t JOIN projects p ON p.project_id = t.project_id WHERE t.assignee_user_id = u.user_id AND t.status IN ('TODO', 'IN_PROGRESS') AND NOT t.is_archived AND NOT p.is_archived)`. It has no parameter, so the same text serves one person (`held_count`) and every booked person at once (Task 5's `board`). Compose it only with `sql.SQL("... {} ...").format(HELD)`, the way `users._row` composes `COLUMNS`. An f-string whose literal holds `SELECT ... FROM` is what bandit B608 flags; the existing `f"{_WITH_NAMES} WHERE ..."` passes only because its literal part starts at `WHERE`.
  - `held_count(conn: psycopg.Connection, user_id: int) -> int`: `SELECT {HELD} AS held FROM users u WHERE u.user_id = %s`.
  - `claim_task(conn: psycopg.Connection, actor: Actor, task_id: int) -> dict`: the updated task row.
  - `release_task(conn: psycopg.Connection, actor: Actor, task_id: int) -> dict`: the updated task row.

- [ ] **Step 1: Write the failing tests** (the fixture `org` already books Alice and Eve on Apollo; Alice's line manager is Bob, Eve's is Carol. `ready(conn, org, ms="design", **kw)` is a local helper: `f.task(conn, org["bob"], org[ms], title="Ready one", **kw)`. Add `projects` and `assignments` to the `from services import ...` line.)

```python
def test_take_this_assigns_me_and_starts_the_task(conn, org):
    row = tasks.claim_task(conn, org["alice"], ready(conn, org)["task_id"])
    assert (row["assignee_user_id"], row["status"]) == (org["alice"].user_id, "IN_PROGRESS")

def test_only_employees_take_tasks(conn, org):            # Forbidden for bob
def test_a_task_on_a_project_you_are_not_booked_on_is_not_found(conn, org):
    outsider, _ = f.person(conn, org["admin"], manager=org["bob"])
    with pytest.raises(NotFound, match="^Task not found.$"): tasks.claim_task(conn, outsider, ...)
def test_an_archived_task_cannot_be_taken(conn, org):     # Conflict "This task is archived."
def test_a_done_task_cannot_be_taken(conn, org):
    # assigned to alice, moved DONE, then bob clears the assignee -> eve claims
    # Conflict "This task is already done."
def test_a_taken_task_cannot_be_taken_again_even_by_its_holder(conn, org):
    # alice claims; eve claims -> "This task is already taken."; alice again -> same
def test_the_limit_refuses_a_third_task(conn, org):
    # two tasks assigned to alice by bob, then alice claims a Ready one
    with pytest.raises(Conflict) as caught: ...
    assert str(caught.value) == ("You already hold 2 unfinished tasks, your limit."
                                 " Finish one first, or ask your manager to raise it.")
def test_the_limit_message_is_singular_at_a_limit_of_1(conn, org):
    # bob sets alice's limit to 1 and assigns her one task; her claim ->
    assert str(caught.value) == ("You already hold 1 unfinished task, your limit."
                                 " Finish one first, or ask your manager to raise it.")
def test_held_counts_only_unfinished_live_tasks_on_live_projects(conn, org):
    # alice: one TODO (counts), one DONE, one archived, one on Zeus (carol books her there:
    # f.booking(conn, org["carol"], org["zeus"], org["alice"])) that admin then archives with
    # projects.archive_project -> held_count(conn, alice.user_id) == 1
def test_a_manager_can_assign_past_the_limit(conn, org):
    # alice holds 2; tasks.update_task(bob, third, {"assignee_user_id": alice}) succeeds
    assert tasks.held_count(conn, org["alice"].user_id) == 3

def test_put_back_returns_the_task_to_ready(conn, org):
    # claim then release -> (row["assignee_user_id"], row["status"]) == (None, "TODO")
def test_only_the_holder_puts_a_task_back(conn, org):     # eve -> Forbidden "Only the task's assignee can put it back."
def test_an_archived_task_cannot_be_put_back(conn, org):  # Conflict "This task is archived."
def test_a_done_task_cannot_be_put_back(conn, org):       # Conflict "This task is done. Move it back to In progress first."

def test_take_and_put_back_each_write_one_audit_row_and_notify_the_line_manager(conn, org):
    # after claim: the newest audit_log row has (action, entity_type, summary) ==
    #   ("CLAIM", "tasks", "Alice Tester took task Ready one"), and its notifications
    #   (notifications.recipient_user_id for that audit_id) go to exactly
    #   sorted([bob, admin]) user ids, not carol or eve; after release: ("RELEASE", "tasks",
    #   "Alice Tester put back task Ready one"); exactly 1 new audit row each time

# Review Focus 1-3
def test_a_task_on_a_blocked_deliverable_can_still_be_taken(conn, org):
    milestones.add_dependency(conn, org["bob"], org["build"]["milestone_id"], org["design"]["milestone_id"])
    assert status_of(conn, org["bob"], org["build"]) == "BLOCKED"
    assert tasks.claim_task(conn, org["alice"], ready(conn, org, ms="build")["task_id"])["status"] == "IN_PROGRESS"
def test_lowering_the_limit_below_what_someone_holds_then_refuses_claims(conn, org):
    # alice holds 2; users.set_capacity(bob, alice, {"task_limit": 1}) succeeds; claim ->
    assert str(caught.value) == ("You already hold 2 unfinished tasks, over your limit of 1."
                                 " Finish one first, or ask your manager to raise it.")
def test_put_back_keeps_logged_time_and_stops_further_logging(conn, org):
    # claim, log(conn, alice, t, "2026-10-13", 1), release;
    # the entry's user_id is still alice; log again -> Forbidden
```

- [ ] **Step 2: Run them and expect failures**

Run: `.venv/bin/pytest tests/backend/test_work.py -q`
Expected: FAIL with `AttributeError: module 'services.tasks' has no attribute 'claim_task'`.

- [ ] **Step 3: Implement in `services/tasks.py`**
  - `claim_task`:
    - If `not actor.is_employee`, raise `Forbidden("Only employees take tasks.")`.
    - Then `with atomic(conn)`: `_load(..., manage=False)` locks the task. Check in the spec's order: archived, done, taken.
    - Then lock the person with `SELECT task_limit FROM users WHERE user_id = %s FOR UPDATE`, then `held_count` (a new statement, so under READ COMMITTED it sees a claim that committed while this one waited; Task 4 depends on this).
    - If `held >= limit`, raise `Conflict(_limit_message(held, limit))`.
    - `UPDATE tasks SET assignee_user_id = %s, status = 'IN_PROGRESS', updated_at = now() ... RETURNING *`. `completed_at` stays NULL.
    - `record_change(conn, actor, "CLAIM", "tasks", task_id, task_view(before), task_view(row), f"{actor.name} took task {row['title']}")`.
  - `_limit_message(held: int, limit: int) -> str`:
    - When `held == limit`: the spec's sentence with `held`, and "task" singular when `held == 1`.
    - When `held > limit`: `f"You already hold {held} unfinished tasks, over your limit of {limit}. Finish one first, or ask your manager to raise it."`
  - `release_task`:
    - `with atomic(conn)`: `_load(..., manage=False)`.
    - Assignee check, raising `Forbidden("Only the task's assignee can put it back.")`. Then archived, then DONE.
    - Lock the person's row (`SELECT 1 FROM users WHERE user_id = %s FOR UPDATE`) so both write paths take task then person (spec section 7).
    - `UPDATE tasks SET assignee_user_id = NULL, status = 'TODO', updated_at = now() ... RETURNING *`.
    - `record_change(..., "RELEASE", ..., f"{actor.name} put back task {row['title']}")`.

- [ ] **Step 4: Run them and expect them to pass**

Run: `.venv/bin/pytest tests/backend/test_work.py -q`, then `.venv/bin/pytest -q`
Expected: all pass. The integrity check runs after each test.

- [ ] **Step 5: Commit**

```bash
git add backend/tracker/services/tasks.py tests/backend/test_work.py
git commit -m "Take this / Put back: employees pull Ready tasks up to their limit; audited CLAIM and RELEASE"
```

---

### Task 4: The two races, on real separate connections

**Files:**
- Create: `tests/backend/test_claim_race.py`

**Interfaces:**
- Consumes: `tasks.claim_task` (Task 3), `factories`, `pg.recreate_database/drop_database/open_connection/settings`, `store.migrate.run`, `store.postgres.connect/atomic`.

- [ ] **Step 1: Write the tests** (mirror `test_store_commits.py:17-23`)
  - Use fixture `race_db` on database `tracker_claim_test`: recreate it, `migrate.run`, build the world through `factories` on an autocommit connection (admin, manager Bob, Alice and Eve under Bob, both booked on Apollo, one deliverable), yield the ids, then drop the database.
  - Helper `wait_until_waiting_on_a_lock(watch, pid)`: poll `SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s` until it is `'Lock'`, every 0.05 s for up to 5 s. Fail if it never waits.
  - Each test:
    1. Connection A opens `with atomic(a):` and claims inside it, so the transaction stays open.
    2. Connection B claims in a `ThreadPoolExecutor` worker.
    3. Wait until B's backend (`b.info.backend_pid`) waits on a lock, then leave A's block (commit).
    4. Collect B's result.

```python
def test_two_people_take_one_task_and_the_second_is_refused(race_db):
    # A = Alice, B = Eve, same Ready task
    with pytest.raises(Conflict, match="^This task is already taken.$"):
        future.result(timeout=10)
    assert assignee_of(task) == alice_id

def test_one_person_at_1_of_2_takes_two_tasks_at_once_and_one_is_refused(race_db):
    # Alice already holds 1 (assigned by Bob); A claims task X, B (also Alice) claims task Y
    with pytest.raises(Conflict, match="your limit"):
        future.result(timeout=10)
    assert held_count == 2
```

- [ ] **Step 2: Run them and check that they pass**

Run: `.venv/bin/pytest tests/backend/test_claim_race.py -v`
Expected: 2 passed. Then prove the test can fail: temporarily delete the `FOR UPDATE` from the person-lock line in `claim_task`. Test 2 must fail, because B never waits. Restore the line.

- [ ] **Step 3: Commit**

```bash
git add tests/backend/test_claim_race.py
git commit -m "Test the two claim races on separate connections: one task, and one person's limit"
```

---

### Task 5: Board and Ready-tasks reads

**Files:**
- Modify: `backend/tracker/services/tasks.py`: add `board` and `ready_tasks` after `my_tasks`. Reuse `_WITH_NAMES` (`:150-152`) and `HELD`.
- Modify: `backend/tracker/services/views.py`: add `holder_view`.
- Test: `tests/backend/test_work.py`

**Interfaces:**
- Consumes: `visible_project` (404 "Project not found."), `HELD` and `held_count` (Task 3).
- Produces:
  - `board(conn: psycopg.Connection, actor: Actor, project_id: int) -> dict` returns `{"items": list[dict], "people": list[dict]}`.
    - Items: every live task on the project, with `milestone_name` and `assignee_name`, ordered by `m.due_date, t.task_id`. One query.
    - People: each live user with a live booking on the project, **once each**, as `{user_id, name, held, task_limit}`, ordered by `last_name, first_name`. One query over `users u`, with `held` from `HELD` and the booking test as `EXISTS (SELECT 1 FROM assignments a WHERE ...)`, not a join: a person may hold two non-overlapping live bookings on one project, and a join would list them twice.
  - `ready_tasks(conn: psycopg.Connection, actor: Actor) -> dict` returns `{"items": list[dict], "held": int, "limit": int}`.
    - Items: tasks with `assignee_user_id IS NULL AND status <> 'DONE' AND NOT t.is_archived AND NOT p.is_archived` on projects where the actor has a live booking (again `EXISTS`, so two bookings don't repeat a task). Ordered by `m.due_date, t.task_id`. One query.
  - `holder_view(row: dict) -> dict` returns `{"userId", "name", "held", "limit"}` from `user_id, name, held, task_limit`.

- [ ] **Step 1: Write the failing tests**

```python
def test_board_lists_every_live_task_and_each_booked_persons_load(conn, org):
    r = ready(conn, org)
    mine = f.task(conn, org["bob"], org["build"], assignee=org["alice"], title="Mine")
    gone = f.task(conn, org["bob"], org["design"], title="Gone")
    tasks.archive_task(conn, org["bob"], gone["task_id"])
    result = tasks.board(conn, org["alice"], org["apollo"]["project_id"])
    assert {t["title"] for t in result["items"]} == {"Ready one", "Mine"}
    by_title = {t["title"]: t for t in result["items"]}
    assert (by_title["Mine"]["milestone_name"], by_title["Mine"]["assignee_name"]) == ("Build", "Alice Tester")
    assert result["people"] == [
        {"user_id": org["alice"].user_id, "name": "Alice Tester", "held": 1, "task_limit": 2},
        {"user_id": org["eve"].user_id, "name": "Eve Tester", "held": 0, "task_limit": 2}]

def test_two_bookings_on_one_project_list_a_person_and_a_task_once(conn, org):
    f.booking(conn, org["bob"], org["apollo"], org["alice"], start_date="2027-01-01", end_date="2027-03-31")
    ready(conn, org)
    assert [p["name"] for p in tasks.board(conn, org["bob"], org["apollo"]["project_id"])["people"]] == [
        "Alice Tester", "Eve Tester"]
    assert [t["title"] for t in tasks.ready_tasks(conn, org["alice"])["items"]] == ["Ready one"]

def test_board_of_a_project_you_cannot_see_is_not_found(conn, org):
    with pytest.raises(NotFound, match="^Project not found.$"):
        tasks.board(conn, org["carol"], org["apollo"]["project_id"])

def test_ready_tasks_are_unassigned_unfinished_live_tasks_on_my_booked_projects(conn, org):
    # in: "Ready one" on Apollo. out: one assigned to eve (not alice, so alice still holds 0),
    # one DONE then unassigned (assigned to eve, moved DONE by eve, cleared by bob), one archived,
    # and a Ready task carol makes on Zeus (alice isn't booked there)
    result = tasks.ready_tasks(conn, org["alice"])
    assert ([t["title"] for t in result["items"]], result["held"], result["limit"]) == (["Ready one"], 0, 2)

# Review Focus 4
def test_manager_clears_a_task_held_by_someone_no_longer_booked(conn, org):
    # alice claims; bob archives her Apollo booking (assignments.archive_booking; the id is
    # f.booking's return in org, or SELECT it from assignments); release by alice -> NotFound "Task not found."
    # bob: update_task(..., {"assignee_user_id": None}); held_count(alice) == 0;
    # the task is back in ready_tasks(conn, eve)
```

- [ ] **Step 2: Run them and expect failures**

Run: `.venv/bin/pytest tests/backend/test_work.py -q -k "board or ready_tasks or no_longer_booked or two_bookings"`
Expected: 5 selected, 5 failed, each with `AttributeError: module 'services.tasks' has no attribute 'board'` (or `'ready_tasks'`).

- [ ] **Step 3: Implement `board`, `ready_tasks` and `holder_view` with the signatures above.** Reading the project goes through `visible_project` first, for the 404. The person's limit for `ready_tasks` comes from `SELECT task_limit FROM users WHERE user_id = %s`, and `held` from `held_count`.

- [ ] **Step 4: Run them and expect them to pass**

Run: `.venv/bin/pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tracker/services/tasks.py backend/tracker/services/views.py tests/backend/test_work.py
git commit -m "Board and Ready-to-take reads: one query for tasks, one for each person's held / limit"
```

---

### Task 6: Four routes, handlers and API tests (62 to 66)

**Files:**
- Modify: `backend/tracker/api/routes.py`. Add 2 rows after `_r("POST", "/tasks/{id}/status", ...)` (`:90`), 1 after `/me/tasks` (`:93`), and 1 after `/projects/{id}/dependency-graph` (`:69`).
- Modify: `backend/tracker/api/handlers.py`: tasks section (`:217-244`), and import `holder_view`.
- Modify: `tests/backend/test_api_read_walk.py`, `tests/backend/test_api_audit_walk.py`, `tests/backend/test_api.py`

**Interfaces:**
- Consumes: `tasks.claim_task`, `tasks.release_task`, `tasks.board`, `tasks.ready_tasks`, `views.holder_view`.
- Produces (wire):
  - `POST /tasks/{id}/claim` (EMPLOYEE) returns `task_view`.
  - `POST /tasks/{id}/release` (EMPLOYEE) returns `task_view`.
  - `GET /projects/{id}/board` (any role) returns `{items, page, pageSize, total, totalPages, people: [{userId, name, held, limit}]}`.
  - `GET /me/ready-tasks` (EMPLOYEE) returns `{items, page, pageSize, total, totalPages, held, limit}`.

- [ ] **Step 1: Write the failing tests**

```python
# test_api_read_walk.py, inside test_every_read_route_answers_in_shape, before the final set check
# (`board` is already taken there by /dashboard/projects, :77; in world, only Alice is booked
# on Apollo and Sketch is hers, TODO)
pull = get(b, "/projects/{id}/board", f"/projects/{pid}/board")
assert PAGE_KEYS <= pull.keys() and [t["title"] for t in pull["items"]] == ["Sketch"]
assert pull["people"] == [{"userId": world["alice"].user_id, "name": "Alice Tester", "held": 1, "limit": 2}]
ready = get(e, "/me/ready-tasks", "/me/ready-tasks")
assert (ready["total"], ready["held"], ready["limit"]) == (0, 1, 2)
```

```python
# test_api_audit_walk.py, after `other = hit(... "Spare" ...)` and before archiving it
# (Sketch is DONE by then, so Alice holds 0)
hit(e, "POST", "/tasks/{id}/claim", f"/tasks/{other['taskId']}/claim")
hit(e, "POST", "/tasks/{id}/release", f"/tasks/{other['taskId']}/release")
```

```python
# test_api.py (its org fixture has no deliverable: make one with f.deliverable(conn, org["bob"], org["apollo"]))
def test_only_employees_take_tasks_from_the_board(conn, org):
    # bob creates an unassigned task on Apollo; bob POST /tasks/{id}/claim -> 403;
    # alice -> 200 with payload["status"] == "IN_PROGRESS" and payload["assigneeUserId"] == alice
def test_the_limit_refusal_is_409_with_the_server_message(conn, org):
    # alice holds 2 (assigned by bob); claim a third -> (409, {"error": "You already hold 2 unfinished
    # tasks, your limit. Finish one first, or ask your manager to raise it."})
def test_another_managers_board_is_byte_identical_to_a_missing_one(conn, org):
    # carol GET /projects/{apollo}/board and /projects/999999/board -> same (404, payload)
```

- [ ] **Step 2: Run them and expect failures**

Run: `.venv/bin/pytest tests/backend/test_api.py tests/backend/test_api_read_walk.py tests/backend/test_api_audit_walk.py -q`
Expected: FAIL. The new paths answer `404 {"error": "No such endpoint."}` (`api/routes.py:132`): the read walk's `get` asserts 200, the audit walk's `hit` asserts 200/201, and the three `test_api.py` tests see 404.

- [ ] **Step 3: Implement the 4 `_r(...)` rows and 4 handlers**
  - `claim_task(ctx) -> dict` and `release_task(ctx) -> dict` return `task_view(...)`.
  - `board(ctx) -> dict` returns `{**_whole(result["items"], task_view), "people": [holder_view(p) for p in result["people"]]}`.
  - `ready_tasks(ctx) -> dict` returns `{**_whole(result["items"], task_view), "held": result["held"], "limit": result["limit"]}`.

- [ ] **Step 4: Run them and expect them to pass**

Run: `.venv/bin/pytest -q` and `grep -c '^    _r(' backend/tracker/api/routes.py`
Expected: all pass, and `66` (it prints `62` before this task).

- [ ] **Step 5: Commit**

```bash
git add backend/tracker/api/routes.py backend/tracker/api/handlers.py tests/backend/test_api.py tests/backend/test_api_read_walk.py tests/backend/test_api_audit_walk.py
git commit -m "Routes: claim, release, project board, my Ready tasks (62 -> 66)"
```

---

### Task 7: The Board tab

**Files:**
- Create: `frontend/src/pages/projects/BoardTab.jsx`
- Modify: `frontend/src/pages/projects/ProjectDetailPage.jsx`. Add `<Tab value="board" label="Board" />` after Budget (`:109-113`), and render `<BoardTab projectId={projectId} canManage={canManage} />`.
- Modify: `frontend/src/pages/projects/fixtures.js` (add `BOARD_TASKS` and `BOARD_PEOPLE` as plain objects; fixtures.js imports nothing, so `page()` stays in the test file), `frontend/src/pages/projects/ProjectDetailPage.test.jsx`

**Interfaces:**
- Consumes: `GET /projects/{id}/board`, `POST /tasks/{id}/claim`, `POST /tasks/{id}/release`, `PATCH /tasks/{id}` with `{ assigneeUserId }`, `useAuth().user` (`userId`, `role`), and `formatHours`.
- Produces: `BoardTab({ projectId: number, canManage: bool })`, the default export.
  - A people strip. Each person is a `Chip` labelled `` `${name} ${held} / ${limit}` ``. When `held > limit`, add `", over limit"` and `color="error"`.
  - Four `section`s labelled by their headings Ready / To do / In progress / Done, in a grid with `xs: '1fr', md: 'repeat(4, 1fr)'`, so the columns stack on phones.
  - The column rule: no assignee and not DONE means Ready. Otherwise DONE means Done, TODO means To do and IN_PROGRESS means In progress.
  - Each card is an `article` labelled by its title. It shows `` `${milestoneName} · ${formatHours(estimateMinutes)}` `` and `assigneeName ?? 'Unassigned'`.
  - Buttons:
    - Employees: **Take this** on Ready cards, and **Put back** on cards whose `assigneeUserId === user.userId` outside Done.
    - When `canManage`: **Assign** on every card outside Done. It opens `FormDialog`: title `` `Assign ${title}` ``, submitLabel `"Assign"`, one select field `{ name: 'assigneeUserId', label: 'Assignee', type: 'select', numeric: true, options: people.map(p => [p.userId, p.name]) }`, `initial={task}`.
    - After any success, reload. On failure, show the server's message in an `Alert` and reload.

- [ ] **Step 1: Write the failing tests** (in the test file: `const BOARD = page(BOARD_TASKS, { people: BOARD_PEOPLE })`; people entries are `{ userId, name, held, limit }`, tasks carry `milestoneName` and `assigneeName` as the API sends them)
  - Tasks: Go-live checklist (30, Launch, 480 min, unassigned, TODO); Portal UI (31, Build, 2400, Ben 4, TODO); Portal API (32, Build, 3600, Ana 3, IN_PROGRESS); Wireframes (33, Design, 960, Ana 3, DONE).
  - People: Ana 3 (1/2) and Ben 4 (1/2).
  - The employee session (`USERS.employee`) has `userId` 3, so in this fixture they hold Portal API. (`USERS.employee` is named Ben Okafor while userId 3 is Ana Ruiz in `BOOKINGS`; assert by card title and request path, never by the session user's name.)

```js
it('has a Board tab with Ready, To do, In progress and Done columns', async () => {
  renderDetail(USERS.manager, { 'GET /projects/1/board': [200, BOARD] })
  await userEvent.click(await screen.findByRole('tab', { name: 'Board' }))
  for (const [column, title] of [['Ready', 'Go-live checklist'], ['To do', 'Portal UI'], ['In progress', 'Portal API'], ['Done', 'Wireframes']]) {
    expect(within(await screen.findByRole('region', { name: column })).getByRole('article', { name: title })).toBeInTheDocument()
  }
  expect(screen.getByText('Ana Ruiz 1 / 2')).toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'Portal UI' })).getByText('Build · 40 h')).toBeInTheDocument()
})
it('flags anyone holding more than their limit', ...)          // Ben held 3 limit 2 -> 'Ben Okafor 3 / 2, over limit'
it('lets an employee take a Ready task and put back their own', ...)
  // Take this in 'Go-live checklist' -> POST /tasks/30/claim; Put back in 'Portal API' -> POST /tasks/32/release;
  // 'Portal UI' has no buttons; no 'Assign' anywhere
it("shows the server's refusal at the limit", ...)            // 409 with the spec sentence -> text shown
it('lets the manager assign every card outside Done', ...)
  // 3 'Assign' buttons, none in the Done region, no 'Take this'; Assign on Go-live -> pick 'Ben Okafor'
  // -> PATCH /tasks/30 body { assigneeUserId: 4 }
it('shows "already taken" and reloads the board when someone got there first', ...)   // Review Focus 5
  // POST /tasks/30/claim -> 409 { error: 'This task is already taken.' }: text shown, and
  // await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path === '/projects/1/board')).toHaveLength(2))
```

Also update `'has Deliverables, Resources and Budget tabs, …'` so it expects `Board` too.

- [ ] **Step 2: Run them and expect failures**

Run: `(cd frontend && npx vitest run src/pages/projects)`
Expected: FAIL. There is no tab named "Board".

- [ ] **Step 3: Implement `BoardTab.jsx` and wire the tab** as in the Interfaces block above.

- [ ] **Step 4: Run the tests and lint, and expect them to pass**

Run: `(cd frontend && npm test && npm run lint)`
Expected: all pass, and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/projects/BoardTab.jsx frontend/src/pages/projects/ProjectDetailPage.jsx frontend/src/pages/projects/fixtures.js frontend/src/pages/projects/ProjectDetailPage.test.jsx
git commit -m "Board tab: Ready, To do, In progress, Done; Take this, Put back, Assign; held / limit per person"
```

---

### Task 8: Ready to take on My tasks, Task limit in People, and the new-task hint

**Files:**
- Modify: `frontend/src/pages/mytasks/MyTasksPage.jsx` and its test
- Modify: `frontend/src/pages/people/PeoplePage.jsx` (`CAPACITY_FIELDS`, `:21-24`) and its test
- Modify: `frontend/src/pages/projects/TaskList.jsx` (the `assigneeUserId` field, `:26`), and `ProjectDetailPage.test.jsx`

**Interfaces:**
- Consumes: `GET /me/ready-tasks`, `POST /tasks/{id}/claim`, `PATCH /users/{id}/capacity` with `{ taskLimit }`.
- Produces:
  - **My tasks.** After the open-tasks grid, add an `h2` "Ready to take", a line `` `You hold ${held} of ${limit}` ``, and one card per Ready task: an `article` labelled by its title, showing `projectName · milestoneName`, `Estimate …` and **Take this**.
  - When there are none: "No Ready tasks on your projects right now."
  - Take this, on success: reload both `/me/tasks` and `/me/ready-tasks`, and show a success Alert `` `You took ${title}.` ``. On failure, show the server's message in the page Alert.
  - The button stays enabled at the limit, so the server's refusal is what the person sees.
  - **People.** Add `{ name: 'taskLimit', label: 'Task limit', type: 'number', helper: 'The most unfinished tasks they can take from the board themselves, 1 to 10. Managers can still assign past it.' }` to `CAPACITY_FIELDS`.
  - **TaskList.** The helper becomes `'Leave empty to put it on the board as Ready'`.

- [ ] **Step 1: Write the failing tests**

```js
// MyTasksPage.test.jsx: renderPage() also stubs 'GET /me/ready-tasks': [200, page([], { held: 1, limit: 2 })],
// so the existing tests don't hit "No stub". New fixture beside PORTAL:
const GO_LIVE = {
  taskId: 30, milestoneId: 12, projectId: 1, title: 'Go-live checklist', description: null,
  assigneeUserId: null, status: 'TODO', estimateMinutes: 480, projectName: 'Apollo', milestoneName: 'Launch',
}
it('offers Ready tasks to take, and says how many I hold', async () => {
  const calls = renderPage({
    'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })],
    'POST /tasks/30/claim': [200, { ...GO_LIVE, assigneeUserId: 3, status: 'IN_PROGRESS' }],
  })
  expect(await screen.findByRole('heading', { name: 'Ready to take' })).toBeInTheDocument()
  expect(screen.getByText('You hold 1 of 2')).toBeInTheDocument()
  await userEvent.click(within(screen.getByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toBe(true))
  expect(await screen.findByText('You took Go-live checklist.')).toBeInTheDocument()
})
it("shows the server's refusal when I'm at my limit", ...)   // 409 spec sentence -> text shown
```

```js
// PeoplePage.test.jsx
it('sets the task limit, and shows an out-of-range refusal on that box', async () => {
  // PATCH /users/4/capacity -> 400 { error: 'Task limit must be between 1 and 10.', field: 'taskLimit' }
  // as the manager, open Ben's Capacity dialog as 'sets weekly capacity and overtime' does (:116);
  // type 11 in getByLabelText(/task limit/i), Save ->
  // expect(screen.getByLabelText(/task limit/i)).toHaveAccessibleDescription('Task limit must be between 1 and 10.')
  // and the PATCH body was { taskLimit: 11 }
})
```

```js
// ProjectDetailPage.test.jsx
it('tells the manager an empty assignee puts the task on the board as Ready', ...)
  // open Add task on Build -> getByText('Leave empty to put it on the board as Ready')
```

- [ ] **Step 2: Run them and expect failures**

Run: `(cd frontend && npx vitest run src/pages/mytasks src/pages/people src/pages/projects)`
Expected: FAIL. The heading, field and text are missing.

- [ ] **Step 3: Implement the three changes** as in the Interfaces block above.

- [ ] **Step 4: Run the tests and lint, and expect them to pass**

Run: `(cd frontend && npm test && npm run lint)`
Expected: all pass, and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/mytasks frontend/src/pages/people frontend/src/pages/projects/TaskList.jsx frontend/src/pages/projects/ProjectDetailPage.test.jsx
git commit -m "My tasks: Ready to take; People: Task limit; new-task hint points at the board"
```

---

### Task 9: Browser test, an employee takes a Ready task (plus the screen tour)

**Files:**
- Create: `frontend/e2e/pull.spec.js`
- Modify: `frontend/e2e/tour.spec.js` (`:15-24`). Add `'PROJECT:Board'` to both the manager and employee `screens`.

**Interfaces:**
- Consumes: the seeded data (`tools/demo.py seed`). Uses Maria (`maria.lopez@acme.test`) and Ana (`ana.ruiz@acme.test`), password `Demo-pass-2026`.
  - Usernames come from `E2E_MANAGER_USERNAME` / `E2E_EMPLOYEE_USERNAME`, or are looked up with `E2E_ADMIN_PASSWORD`, as in `demo.spec.js:13-27`.

- [ ] **Step 1: Write the test** (it makes its own Ready task, so the seeded "Go-live checklist" stays for the live demo and `demo.spec.js` stays read-only)
  - `beforeAll`: Maria, through the API, finds Apollo (`GET /projects?search=Apollo`) and its Launch deliverable (`GET /projects/{id}/milestones`). She creates ``{ title: `E2E pull ${Date.now()}`, estimateMinutes: 60 }`` there with no assignee.
  - `afterAll`: Maria posts `POST /tasks/{id}/archive`. Archived tasks never count as held.
  - The test, `'an employee takes a Ready task from the board and puts it back'`:
    1. Ana signs in and opens Projects, then Apollo, then the **Board** tab.
    2. `page.getByRole('region', { name: 'Ready' }).getByRole('article', { name: title })`, then click **Take this**.
    3. Expect that article inside `region 'In progress'`, with the text `Ana Ruiz`.
    4. Click **Put back**. Expect it back inside `region 'Ready'`, showing `Unassigned`.
  - Precondition, in a comment: Ana holds at most 1 unfinished task (the seed gives her Portal API).
  - API calls use `const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'`, as `demo.spec.js:9` does.
  - Header comment: run it locally only. Unlike `demo.spec.js` and `tour.spec.js` it writes: a task, CREATE / CLAIM / RELEASE / ARCHIVE audit rows, and bell notifications for Ana's line manager and every admin. Against AWS those would show up in the live demo.

- [ ] **Step 2: Run it against the local stack** (needs `./bin/start-dev.sh` running and the seed)

Run (the password prompt is hidden, so it stays out of the shell history):
```sh
read -rsp 'Local admin password: ' E2E_ADMIN_PASSWORD && export E2E_ADMIN_PASSWORD
(cd frontend && npx playwright test pull tour --list)
(cd frontend && npx playwright test pull)
```
Expected: the list shows the new test and the Board tour entries, and the run reports `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/pull.spec.js frontend/e2e/tour.spec.js
git commit -m "Browser test: an employee takes a Ready task and puts it back; tour shows the Board"
```

---

### Task 10: Docs, then full verification

**Files:**
- Modify: `README.md` (architecture notes for `tasks.py` claim and release with their two locks, the feature list, and "Data model": two migration files)
- Modify: `MVP.md`:
  - The Tasks bullets: add "**Pull:** the manager can leave a task unassigned; it shows as Ready, and anyone booked on the project takes it with Take this, up to their task limit (default 2). Managers can still assign, even past it."
  - The permissions table: the capacity row reads "Set weekly capacity, "overtime allowed" and task limit". Add a row "Take a Ready task; put back your own" with no / no / booked on the project.
- Modify: `CLAUDE.md`:
  - Decision row "Tasks" becomes "The manager creates; employees pull Ready tasks; managers can still assign."
  - Drop the open item "pull board designed …".
  - The read-first entry says "built 14 Oct".
  - Test counts in "Where things stand".
- Modify: `docs/GUIDE.md` and `docs/REPOINFO.md`:
  - Every route count "62" becomes "66" (`grep -n '62' docs/GUIDE.md docs/REPOINFO.md`).
  - "Migration files | 1" becomes 2, and "all in one file, `001_init.sql`" becomes "`001_init.sql` plus `002_task_limit.sql`".
  - REPOINFO answer 5a changes from "designed, not built" to built, with file:line citations into `services/tasks.py` and `tests/backend/test_claim_race.py`.
  - Answer 30 and the next-steps list no longer say "no concurrency tests". They now say the two claim row locks are tested, and the exclusion constraint and advisory lock are not.
  - Next-steps item 7 and the line at `:756` are removed or marked built.
- Modify: `docs/DEMO-RUNBOOK.md`:
  - Add a "Pull board" step to Path A: Ana opens Apollo, then Board, presses Take this on Go-live checklist, and Maria's bell shows 1.
  - Note the `tools/demo.py:252-253` risk: don't put back Portal UI as Ben.
  - "What no browser test covers" keeps "log time, then the manager approves".
- Modify: `docs/superpowers/specs/2026-10-14-pull-board-design.md`: the status line becomes "**Built 14 Oct 2026**; plan: `docs/superpowers/plans/2026-10-14-pull-board.md`".
- Modify: `tools/tracker.http`: add `GET {{baseUrl}}/projects/{{projectId}}/board` and `GET {{baseUrl}}/me/ready-tasks`, each with `Authorization: Bearer {{token}}`, the variables that file defines (`:13-19`).
- Modify: `docs/superpowers/specs/2026-10-13-database-design.md`. CLAUDE.md calls it "the full SQL", so the users section gets `task_limit` (1 to 10, default 2) with a pointer to `002_task_limit.sql`. The file map (`:168`) lists both migration files. Leave section 4's `001_init.sql` text alone, since that file never changes.
- Re-check citations into files this plan changed, because inserted lines shift them. Examples: `test_api_read_walk.py:105-107` (REPOINFO, the "3. API" row), `services/users.py` and `services/tasks.py` line ranges, and `api/routes.py`. `grep -rn 'test_api_read_walk.py:\|services/users.py:\|services/tasks.py:\|api/routes.py:' README.md MVP.md CLAUDE.md docs/GUIDE.md docs/DEMO-RUNBOOK.md` plus the REPOINFO file lists them.

- [ ] **Step 1: Make the doc edits above.** Cite only lines you opened. Use the on-screen labels exactly as they appear in the code.

- [ ] **Step 2: Check the counts agree**

Run (swap `docs/REPOINFO.md` for `docs/REPOINFO.md` if the rename has landed):
```sh
grep -rnE '62[ -]route|We have 62|\| 62 \|' README.md MVP.md CLAUDE.md docs/GUIDE.md docs/REPOINFO.md docs/DEMO-RUNBOOK.md
grep -rn 'not built' README.md MVP.md CLAUDE.md docs/GUIDE.md docs/REPOINFO.md docs/DEMO-RUNBOOK.md
grep -rn 'one migration file\|Migration files | 1' README.md CLAUDE.md docs/GUIDE.md docs/REPOINFO.md
```
Expected: no output from any of the three. Before this task, the first grep prints 9 lines: CLAUDE.md:54, GUIDE.md:43, 410, 532, and REPOINFO:167, 358, 397, 740, 756. The second prints CLAUDE.md:38, GUIDE.md:487, and REPOINFO:709, 756. The third prints CLAUDE.md:54 and REPOINFO:214. A plain `\b62\b` also matches line ranges such as `dashboard.py:48-62`, so don't use it.

- [ ] **Step 3: Full verification**

Run:
```sh
.venv/bin/pytest -q
(cd frontend && npm test && npm run lint && npm run build)
.venv/bin/bandit -r ./backend -x ./backend/tracker/psycopg,./backend/tracker/psycopg_binary,./backend/tracker/psycopg_binary.libs 2>/dev/null | grep -E 'No issues identified|Severity: (Medium|High)'
(cd frontend && npx playwright test --list)
```
Expected:
- Every backend test passes, with the count above 375.
- Every website test passes, with the count above 219. Lint is clean and the build succeeds.
- Bandit prints exactly one line, `No issues identified.` With `-q` it prints no summary at all, only two harmless `nosec encountered (B105)` warnings for `services/users.py`, so don't add `-q` here.
- The Playwright list includes `pull.spec.js`.

- [ ] **Step 4: Commit**

```bash
git add README.md MVP.md CLAUDE.md docs/GUIDE.md docs/REPOINFO.md docs/DEMO-RUNBOOK.md docs/superpowers/specs/2026-10-14-pull-board-design.md docs/superpowers/specs/2026-10-13-database-design.md tools/tracker.http
# if the rename has landed, use docs/REPOINFO.md instead, and stage the deletion only if David said the rename goes in this commit
git commit -m "Docs: pull board built; 66 routes, 2 migrations; demo steps and interview answers"
```

- [ ] **Step 5: Hand David the commands he runs**, in this order (spec section 11):

```sh
git push origin David
./bin/deploy-backend.sh
./bin/deploy-frontend.sh
```
