# Notification delay: findings

Status: **debugging only**, 14 Oct 2026. Nothing in the app was changed, committed or
deployed. Code citations are `file:line` in the working tree on 14 Oct.

David's report (`notes.txt:5`): "Notifications should be faster. When I went on and did
something as Chloe it didn't pop up for her manager."

## 1. Verdict

| Question | Answer |
| --- | --- |
| Is the notification created? | **Yes, at once.** Sam's unread count went up within about 50 ms of Chloe's change (section 3) |
| Does it go to the right person? | **Yes, to Sam, Chloe's line manager.** It never goes to Maria. Chloe reports to Sam, not Maria |
| So why did nothing "pop up"? | Three reasons, all in the website: (1) the bell asks the server only **every 30 s**; (2) a background tab may ask even less often; (3) **there is no pop-up**: only the small number on the bell changes |
| Is there a real bug? | No missing notification and no wrong recipient. The delay and the lack of a pop-up are how the bell was built. The design has one gap you might call a bug: a **project manager who is not the person's line manager hears nothing** (section 5) |

## 2. How it works today (the request path)

1. Chloe's change, for example moving a task, runs `move_task`
   (`backend/tracker/services/tasks.py:105-121`). That function calls
   `audit.record_change` inside the same database transaction (`tasks.py:117`).
2. `record_change` writes one audit row, then one notification row for each person
   above Chloe (`backend/tracker/services/audit.py:39-46`). For an employee, that is
   her line manager (`users.manager_id`) and every admin (`audit.py:44`).
3. Nothing pushes the notification to Sam's browser. Lambda function URLs can't hold a
   live connection open (websockets), and the workshop account blocks API Gateway's
   WebSocket service (`docs/superpowers/specs/2026-10-14-websockets-findings.md`,
   section 1).
4. Sam's bell asks `GET /notifications/unread-count` when it first appears, then
   every 30 s (`frontend/src/components/NotificationBell.jsx:7`, `:22-23`).
5. It also asks straight after any change **made in the same tab**
   (`NotificationBell.jsx:24`). That signal comes from `request.js`, which tells its
   listeners after every non-GET call (`frontend/src/services/request.js:30-39`,
   `:99`). It lives in the tab's memory, so a change Chloe makes in another tab or
   browser never reaches Sam's tab.
6. The bell has **no check when you come back to the tab**. It doesn't listen for
   window focus or `visibilitychange`, so there are no such listeners in
   `NotificationBell.jsx:17-30`.
7. The bell only changes a number on a red badge (`NotificationBell.jsx:35`). There is
   no Snackbar (a pop-up message), and no sound or title change.
8. The Notifications page loads once and never checks again on its own
   (`frontend/src/pages/notifications/NotificationsPage.jsx:27-30`: one `useApi`
   load, no timer). If Sam is looking at that page, new items appear only after a
   reload or a click.

Each tab keeps its own sign-in (`sessionStorage`, `frontend/src/auth/AuthContext.jsx:11`),
so Chloe in one tab and Sam in another is a valid test. Logging in as one does not
replace the other.

## 3. Reproduction on the local stack

### 3a. Backend: is the notification created at once?

Script: Python `urllib` against `http://localhost:3001/api/tracker`. It signed in as
Chloe (CK260565, user 7, `managerId: 4`) and Sam (SP345715, user 4). Then it moved
Chloe's only task, "Cut over databases" (task 5, Zeus), to In Progress and back to To Do.

```
14:24:49.254 Sam unread BEFORE: 7
14:24:49.324 Chloe move -> IN_PROGRESS: 200 IN_PROGRESS 0.07s
14:24:49.375 Sam unread AFTER move: 8
   newest: 86 2026-10-14T14:24:49.266334-04:00 Chloe Kim moved task Cut over databases to in progress
14:24:49.481 Chloe move back -> TODO: 200 TODO 0.048s
14:24:49.515 Sam unread AFTER restore: 9
   newest: 88 2026-10-14T14:24:49.451705-04:00 Chloe Kim moved task Cut over databases to todo
task 5 now: ['TODO']
```

The notification existed about 50 ms after Chloe's change. Sam's inbox already held
"Chloe Kim logged 10 h on task Cut over databases" (notification 69, from the seed),
so logging time notifies him as well.

### 3b. Website: how long until Sam's bell changes?

Script: Playwright (the project's own copy, `frontend/node_modules/@playwright/test`,
headless Chromium). It signed Sam in at `http://localhost:3000`. Chloe then moved task 5
from a **separate session**, like a second tab or browser. The script read the bell's
label once a second.

```
14:25:39 Sam signed in, bell: Notifications, 9 unread
14:25:39 Chloe moved task 5 -> IN_PROGRESS: 200
14:26:08 bell changed after 28.4 s: Notifications, 10 unread
14:26:20 pop-up elements on the page (alert/status/Snackbar): 0
14:26:20 Chloe moved task 5 back -> TODO: 200
```

The data was already there (3a), but the bell took **28.4 s** to change, and no pop-up
appeared. With a 30 s poll, the wait is anywhere from 0 to 30 s, depending on when the
last check happened.

### 3c. Background tabs (not measured here)

When a tab is hidden, Chrome slows its timers. After about 5 minutes hidden, a repeating
timer may run only **once a minute** ("intensive throttling", Chrome 88 and later:
https://developer.chrome.com/blog/timer-throttling-in-chrome-88; the websockets findings
read that page on 14 Oct and quote it in section 5). So if Sam's tab sat behind Chloe's, his bell could lag by up to about
a minute. It also doesn't check when he switches back (step 6). This is an inference.
Headless Playwright can't hide a tab, so it was not measured.

### 3d. Data left as found

- Task 5 is back to **To Do** (checked, last line of 3a).
- Sam's four test notifications (86, 88, 90, 92) were marked read, and his unread count
  is back to **7** (checked with `GET /notifications/unread-count`).
- What could not be undone: four audit rows (the log only grows, by design), and
  four unread notifications for each admin. Task 5's `updated_at` also changed.
- The local admin password was not used or changed, and nothing was reseeded.

## 4. Who is Chloe's manager, locally and on AWS?

- **Seed:** Chloe's line manager is **Sam Patel** (`tools/demo.py:37`). She is booked
  only on **Zeus**, which Sam manages (`tools/demo.py:166-174`). Maria manages Apollo
  and is line manager to Ana and Ben (`tools/demo.py:35-36`, `:142-149`).
- **Local, live:** `GET /auth/me` as Chloe returned `managerId: 4`, which is Sam.
- **Inboxes, local:** Maria has 18 notifications, **0 from Chloe**. Sam has 11, of which
  **10 are from Chloe** (`GET /notifications?pageSize=100` for each).
- **AWS:** the same seed script runs there, so Chloe reports to Sam there too, but the
  usernames differ per environment. **Not verified on AWS:** no AWS calls were made
  (read-only debugging, and the workshop credentials expired earlier today).
- **Could David have been watching the wrong manager?** Quite possibly. The demo runbook
  puts **Maria** in the manager window ("B (Maria)", `docs/DEMO-RUNBOOK.md:130`, `:149`),
  and the Playwright demo signs in as Maria (`frontend/e2e/demo.spec.js:31`). Chloe's
  changes **never** reach Maria, however long you wait. If David's manager tab was
  Maria, nothing would ever have appeared. If it was Sam, it would have appeared
  within 30 s, as a number only.

## 5. A gap worth deciding (not a bug in the code)

Notifications follow the **org chart** (line manager), not the **project**. Sam
happens to be both for Chloe. With the pull board, an employee can take a task on a
project run by someone who is not their line manager. That project manager then gets
no notification. Your note "If Chloe logs hours or completes a task then her manager
should be notified" (`notes.txt:23`) is met for the line manager. Whether the
project's manager should also hear about it is your call. The change would be one
extra `OR` in the recipient query at `audit.py:44`, plus tests for each case in the
CLAUDE.md recipients table.

## 6. Proposed fix (not implemented)

All in the website. The backend needs no change.

1. **Check more often, but only when someone is looking.** Poll every **10 s** while the
   tab is visible (`document.visibilityState === 'visible'`), and pause while it is
   hidden.
2. **Check at once when you come back.** On `visibilitychange` (to visible) and window
   `focus`, call `check()` straight away. This fixes the "I switched tabs and nothing
   happened" case.
3. **Pop up when the count goes up.** If the new count is higher than the last one,
   fetch `GET /notifications?unread=true&pageSize=1`. Show an MUI **Snackbar** with the
   summary, for example "Chloe Kim moved task Cut over databases to in progress", and
   a **View** button that opens `/notifications`. Use `role="status"` so screen readers
   announce it. Don't pop up on the first load, only when the count rises.
4. **Let the Notifications page refresh itself.** Give it the same signal, for example a
   small `onUnreadChange` listener exported beside `onWrite` in `request.js`. When the
   count changes, it reloads its list.
5. **Cost.** At 10 s, each open tab makes 6 small reads a minute instead of 2. Each read
   is one indexed `count(*)`; the whole round trip, sign-in check included, took 34 to
   51 ms in 3a. A tab that is open and
   visible already keeps Aurora awake at 30 s (`docs/DEMO-RUNBOOK.md:94-95`), so this
   changes little.

Rejected: WebSockets (blocked in the workshop account, see the websockets findings
spec). Also `BroadcastChannel`, which only links tabs in the same browser, so it helps
one person testing in two tabs but not Sam on another machine.

### Tests that would prove it (Vitest + React Testing Library, fake timers)

Beside the existing three in `frontend/src/components/NotificationBell.test.jsx:10-39`:

1. **Polls every 10 s while visible.** Use `vi.useFakeTimers({ shouldAdvanceTime: true })`,
   then advance 10 000 ms and expect a second `unread-count` call. This fails today:
   the next call only comes at 30 000 ms.
2. **Pauses while hidden.** Set `document.visibilityState` to `'hidden'` (with
   `Object.defineProperty`), dispatch `visibilitychange`, then advance 60 000 ms. Expect
   no new calls.
3. **Checks at once on return.** Set it back to `'visible'`, dispatch
   `visibilitychange`, and expect a call **without** advancing the timers. This fails
   today.
4. **Pops up when the count rises.** Stub the count as 1 and then 2, and stub
   `GET /notifications` with one item. Expect
   `findByRole('status')` to contain "Chloe Kim moved task …" and a **View** link to
   `/notifications`.
5. **No pop-up on first load or when the count falls.** Load with a count of 3, then
   drop it to 0, and expect `queryByRole('status')` to be null.
6. **Notifications page refreshes.** Render `NotificationsPage`, fire the new
   count-changed signal, and expect the new item in the list.

Plus one Playwright check (local only, because it writes data). Sam's page is open.
Chloe moves a task through `page.request`, and Sam's Snackbar appears within 12 s. This
is the script in 3b with the timeout cut from 40 s to 12 s.

## 7. Verified and not verified

**Verified:**

- The notification is created within about 50 ms, for the right recipient (Sam), with
  the right text (3a, `curl`-style calls with timestamps).
- The browser bell lagged 28.4 s and showed no pop-up (3b, Playwright against
  `localhost:3000`).
- Maria never receives Chloe's notifications; Sam does (section 4, inbox counts).
- The test data was restored, except for the append-only rows (3d).

**Not verified:**

- Hidden-tab throttling delays (3c). This is from Chrome's published behaviour (read on
  14 Oct for the websockets findings), not measured.
- AWS: Chloe's manager there, and David's actual session on AWS. No AWS calls were made.
- Which manager window David was actually watching. Ask him: Sam or Maria?
- The proposed fix. It isn't built, so its timings and layout are untested.
