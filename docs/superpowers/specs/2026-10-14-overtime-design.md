# Overtime: a warning instead of a refusal (design)

Approved by David on 14 Oct. Plan: `docs/superpowers/plans/2026-10-14-overtime.md`.

## 1. What and why

Today, logging time that takes someone past their weekly capacity (Mon to Sun,
`users.weekly_capacity_hours`) is refused with a 409 unless their manager switched
`overtime_allowed` on (`_check_limits` in `services/time_entries.py:51-73`). That hides
real work: a person who did stay late can't record it, so cost and the allocation grid
under-report. Jira, Harvest and OpenProject all let you log the hours and flag them.

New behaviour:

| Overtime allowed? | The entry ends the week past capacity | What happens |
| --- | --- | --- |
| off | no `confirmOverCapacity` | **409**, `code: "OVER_CAPACITY"`, error: "This puts you 3 h over your 40 h week. Log anyway? Your manager will be told." Nothing saved |
| off | `confirmOverCapacity: true` | Saved, `over_capacity = true`, summary ends "(3 h over capacity)", so the line manager, project manager and admins are told (who is told is unchanged: `record_change`) |
| on | either | Saved as today, no mark; the week is flagged `overtime` in the allocation grid as today |
| either | entry stays within capacity | Saved as today; a `confirmOverCapacity: true` sent anyway is ignored (mark stays false) |

`N` is the amount past capacity after this entry (`hours_text(week + minutes - capacity * 60)`,
so "3 h", "1 h 30 min", "45 min"); `40` is the person's real capacity. All other rules
(booked that day, at most 24 h a day, no future dates, assignee only) are unchanged and
still hard refusals: confirming never overrides them.

## 2. Decisions

| Decision | Rejected alternative, and why |
| --- | --- |
| Keep **409** for the question, add a machine-readable `code` | 200 with a warning would save without consent. 428 Precondition Required is unfamiliar to evaluators and would need a second row in the status table for the same class. 409 already means "the current state refuses this as sent" |
| `code` is optional in every error body: `{ "error", "field"?, "code"? }`. Set by a class attribute `code = "OVER_CAPACITY"` on `OverCapacity`; `DomainError.code = None` | Matching the website on the message text: breaks the moment the wording changes |
| The website sends `confirmOverCapacity: true` and the server re-checks under the same lock | A separate "confirm" route, or a confirmation token: more code, and the lock gives the same guarantee |
| Store the mark: `time_entries.over_capacity BOOLEAN NOT NULL DEFAULT false` (migration `004_over_capacity.sql`) | Computing it on read: capacity can change later and earlier entries can be rejected, so the answer would drift. Frozen at logging, like `hourly_rate_cents` |
| The mark means "logged past capacity **without** overtime allowed", so it is set only on the confirmed path | Marking allowed overtime too: David's rule says the allowed case is "saved as today"; allowed overtime is already flagged per week in the allocation grid. Cost if wrong: one condition in `_check_limits` |
| Editing: PATCH accepts `confirmOverCapacity`. Only a change of hours or date rechecks the limits and the mark (an edit back under capacity clears it). A note-only edit checks nothing and keeps the mark. Logging less on the same date never asks, and never marks an entry that was inside capacity (fixed 14 Oct after review: a typo fix on Monday in an over week used to ask "Log anyway?" and mark Monday) | Recomputing on every edit: the mark stops meaning "this entry went past capacity", and the manager is told twice |
| Cancel on the confirm closes both dialogs; nothing is saved | Return to the filled form: needs FormDialog to stay open after its `onSubmit` resolves, which is more code for a rare path. Cost: retyping three boxes |
| Concurrency unchanged: `SELECT ... FOR UPDATE` on the user's row before the week sum | none. Two confirmed entries sent at once both save (each was confirmed); each one's mark and `N` are computed under the lock. An **unconfirmed** entry still can never slip past capacity |

## 3. Changes

**Data.** `004_over_capacity.sql`: one `ALTER TABLE time_entries ADD COLUMN over_capacity
BOOLEAN NOT NULL DEFAULT false;` (with the two-line header like `002`). Existing rows read
false. No CHECK needed (a boolean). Integrity queries unchanged.

**Domain and API.**
- `domain/errors.py`: `DomainError.code: str | None = None`; `OverCapacity.code = "OVER_CAPACITY"`.
- `api/errors.py` `to_response`: add `body["code"] = exc.code` when it is set. The table's
  `OverCapacity` row comment becomes "past capacity without overtime: ask to confirm".
  The module docstring names the optional `code`.
- No new route. `POST /tasks/{id}/time-entries` and `PATCH /time-entries/{id}` accept
  `confirmOverCapacity` (boolean). `entry_view` adds `overCapacity`.

**Service** (`services/time_entries.py`):
- `_FIELDS` gains `confirm_over_capacity`; `_clean` pops it out (it is not a column) and
  validates it with `values.boolean(..., required=False)`.
- `_check_limits(..., ignore_entry, confirmed: bool) -> int` returns the minutes past
  capacity this entry accepted (0 when within capacity or overtime is allowed); raises
  `OverCapacity(new message)` when over, not allowed, and not confirmed.
- `log_time` and `edit_entry` store `over_capacity = over > 0` and append
  `f" ({hours_text(over)} over capacity)"` to the audit summary when `over > 0`.
- Module docstring: the capacity bullet describes the warning.

**Website.**
- `services/request.js`: `ApiError` carries `code` (4th constructor argument, from `payload?.code`).
- `pages/mytasks/MyTasksPage.jsx`: the log and edit `onSubmit` catch `failure.code ===
  'OVER_CAPACITY'`, keep `{ message, send }` in state and return (the form closes); a
  `ConfirmDialog` titled "Over your weekly capacity" shows the server's message with
  "Log anyway" / "Cancel". Log anyway resends the same body plus `confirmOverCapacity: true`.
  Any other error still shows in the form as today.
- A small `OverCapacityMark` (icon `WarningAmberOutlined` + the words "Over capacity", an
  outlined warning Chip) in `components/StatusChip.jsx`'s file or its own file; shown in
  the Time column of **My logged time** (the person's week) and of **Approvals** when
  `overCapacity` is true. Word plus icon, never colour alone.
- `pages/people/PeoplePage.jsx` capacity helper text: "Logging past this asks the person
  to confirm and tells their manager, unless overtime is allowed."

## 4. Error cases

| Case | Answer |
| --- | --- |
| Over, overtime off, not confirmed | 409 `{error, code: "OVER_CAPACITY"}`, nothing saved, no audit row |
| `confirmOverCapacity: "yes"` | 400, `field: "confirmOverCapacity"` |
| Confirmed but past 24 h that day / not booked / future date / not the assignee | the same refusal as today (409 / 409 / 400 / 403), no `code` |
| Any other error | body has no `code` key (shape unchanged) |

## 5. Tests that prove it

Backend (`tests/backend/test_work.py`, `test_api.py`, `test_schema.py`, `test_migrate.py`):
the unconfirmed refusal and its exact message; confirm saves and marks; the notification
summary says "(N over capacity)" and reaches the line manager; allowed overtime saves with
no mark and no prompt; within capacity a confirm is ignored; edit asks, then marks, and an
edit back under clears it; the 24 h rule still refuses a confirmed entry; the API body has
`code` on this 409 and none on another 409; `overCapacity` is in the entry view; the
column defaults to false; the migration count is 4.

Website (Vitest + RTL): `ApiError.code` is read from the body; MyTasks shows the confirm
with the server's text, Log anyway resends with `confirmOverCapacity: true`, Cancel sends
nothing more; Approvals and My logged time show "Over capacity" for a marked entry and
not for an unmarked one.

Not tested by machine: how the chip looks, and the stacked-dialog focus with a screen reader.

## 6. Docs that change (same commits as the code)

- `CLAUDE.md`: the "Overtime" decision row; §9 rule "Every error has the shape
  `{ "error": "..." }`" becomes "`{ "error": "..." }`, plus `field` or `code` when they apply".
- `MVP.md` (capacity bullet and rule 1), `README.md` (capacity bullet, the 409 line in the
  error list, the migration list, test counts).
- `tools/demo.py`: the refusal "Ben logs 2 more hours ... 409" still holds (no confirm is
  sent). Only its label changes to say "asked to confirm". No reseed.
