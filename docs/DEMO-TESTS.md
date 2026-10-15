# Run the tests live during the demo

A step-by-step guide to showing the tests working in front of the evaluators: a real browser
clicking through the app, slowed down so the room can follow, plus a quick "everything passes"
moment. Every command runs from `~/DavidCitiProject` and is ready to copy.

**The 30-second version:**

```sh
cd ~/DavidCitiProject
./tools/e2e.sh --show demo
```

A Chrome window opens by itself, signs in as Maria (a manager) and walks the seven questions,
waiting half a second between steps. It takes about 18 seconds and ends with
`PASSED: 2 tests passed`.

Words used here: a **browser test** (Playwright) drives a real browser against the real website,
API and database. **Headless** means no window: it runs faster and prints the results. A
**trace** is a recording of every step a failed test took.

---

## 1. Before the demo (15 minutes before)

**Step 1. Use a terminal on the VDI's own desktop.** A visible browser needs a screen. Check:

```sh
echo "$DISPLAY"
```

It should print something like `:1`. An empty line means this terminal can't open a window, and
`--show` will refuse (`tools/e2e.sh:97-101`). Open the Terminal app on the VDI's desktop instead.

**Step 2. Start the local stack** (terminal 1). It keeps running, so leave this terminal alone:

```sh
cd ~/DavidCitiProject && source ~/.bashrc && ./bin/start-dev.sh
```

Wait for `All Components Verified!`. That gives the website on port 3000 and the API on port
3001, which is what `tools/e2e.sh` tests locally (`tools/e2e.sh:170, 190-200`).

**Step 3. Wake AWS up** (terminal 2). The AWS database sleeps when idle, and the first answer can
take about 15 seconds (`infra/rds.tf:27`; CLAUDE.md §7):

```sh
curl -s https://d1gov8jpsxhwer.cloudfront.net/api/tracker/health
```

It should print `{"status": "ok"}` (`backend/tracker/api/handlers.py:63-66`, sent with
`json.dumps` at `backend/tracker/api/http.py:107`).
`./tools/e2e.sh --aws` also does this itself, up to four tries (`tools/e2e.sh:174-188`).

**Step 4. Check the test list.** This needs no server and runs nothing:

```sh
cd ~/DavidCitiProject && ./tools/e2e.sh --list
```

The last lines should read `Total: 34 tests in 12 files` and `Nothing was run.` (printed on 15 Oct
on branch `David-tweaks`). For the AWS set:

```sh
cd ~/DavidCitiProject && ./tools/e2e.sh --aws --list
```

That prints `Total: 17 tests in 4 files` (demo, history, schedule, tour).

**Step 5. Rehearse once, headless, on the exact version you will show:**

```sh
cd ~/DavidCitiProject && ./tools/e2e.sh demo schedule history
```

Expect `PASSED: 8 tests passed`, with about 25 seconds of test time (8 + 12 + 5 s, section 3).
If `history` fails, read the first bullet below. If it says
`Could not find Maria Lopez and Ana Ruiz`, the local data was never seeded: run the seed command
it prints (it needs your local admin password, so type it yourself, not in front of the room).

Two things to know before you rehearse:

- **The browser tests follow the newest screens.** The 15 Oct tweaks turned each person's buttons
  on People into one **Actions** menu (`frontend/src/components/PersonActions.jsx:243`, "Actions
  for ..."), but `history.spec.js` still presses a button named "History for Ana Ruiz"
  (`frontend/e2e/history.spec.js:105-106`). Rehearse `history` after the tweaks are merged; if it
  fails, leave it out of the live set.
- **AWS runs whatever was last deployed.** Run a file with `--aws` only after the version you are
  showing is deployed there. Otherwise a test can fail simply because the screen it expects isn't
  live yet.

---

## 2. The live moment: a real browser, slowed down

```sh
cd ~/DavidCitiProject
./tools/e2e.sh --show demo
```

What happens, in order:

1. The script prints four lines: `Target`, `Files`, `Users` and `Mode : a visible browser, 500 ms
   between steps` (`tools/e2e.sh:245-248`).
2. A Chrome window opens and signs in as Maria. It checks the dashboard card for Apollo ("At
   risk", and its budget), the allocation grid with Ben "Over-allocated" (Apollo 25 h, Zeus 20 h),
   Apollo's page with its Build deliverable, and the dependency view with Launch "Blocked"
   (`frontend/e2e/demo.spec.js:37-62`).
3. A second, phone-sized window (375 pixels wide) signs in, checks nothing scrolls sideways, and
   opens the menu (`frontend/e2e/demo.spec.js:64-75`).
4. The terminal ends with `=== What this means (took N s, ...) ===` and
   `PASSED: 2 tests passed. In a real browser, the app did what each test expects.`
   (`tools/e2e.sh:279-281`).

It took 16.3 s of test time at the default speed, about 18 s with the script's own lines
(measured 14 Oct night, `docs/TESTING.md` section 8). Plan on 20 seconds.

### Slower or faster

`--show` waits 500 ms between browser steps unless you say otherwise (`tools/e2e.sh:237`;
Playwright's `slowMo`, `frontend/playwright.config.js:21`). It also raises the time limit from
2 minutes to 10, so slow runs don't time out (`tools/e2e.sh:238`).

| You want | Command | About how long (demo file) |
| --- | --- | --- |
| Easier to follow in a room | `E2E_SLOWMO=800 ./tools/e2e.sh --show demo` | About 20 s (not timed: between the measured 16 s at 500 ms and 24 s at 1500 ms) |
| The default | `./tools/e2e.sh --show demo` | 16 to 18 s (measured) |
| Faster | `E2E_SLOWMO=300 ./tools/e2e.sh --show demo` | Under 16 s (not timed) |

### Against the live AWS site

```sh
cd ~/DavidCitiProject
./tools/e2e.sh --aws --show demo
```

The script wakes the site first, uses the AWS usernames, and refuses any file that writes data,
before anything runs (`tools/e2e.sh:128-140, 162-166`). Use it only once the version you are
showing is deployed (section 1, step 5).

---

## 3. Which tests fit a live demo

Times are headless, from the full `tools/test-all.sh` run on 15 Oct, 08:26 to 08:36, in the main
folder on `David` at `cac33d7`, on the local stack (its browser log: 33 passed, 1 skipped on
purpose, 4.7 minutes in all). With `--show`, only
`demo` was timed (8 s headless became 16 s), so expect the others to take roughly twice their
headless time. That is an estimate, not a measurement.

| File | Tests | Headless time | Changes data? | Where it can run | What the audience sees |
| --- | --- | --- | --- | --- | --- |
| `demo` | 2 | 8 s | No | Local or AWS | The seven questions on screen, then the phone menu (section 2). **The best one to show** |
| `schedule` | 4 | 12 s | No | Local or AWS | The Schedule at desktop and phone width: Ben's Apollo bar and his red-outlined "+5 h over" week, no sideways scrolling; then Tab reaches a bar, its tooltip opens, and Enter opens Apollo (`frontend/e2e/schedule.spec.js:1-11`). **A good second one**: it shows keyboard use |
| `history` | 2 | 5 s | No | Local or AWS | Maria opens Ana's history and sees no before/after values (admin only); Ana sees My history on Account. See the warning in section 1, step 5 |
| `requests` | 1 | 11 s | **Yes** | Local only | Three windows: Ana sends a question, Maria rejects it with a note, Ana reads the answer at phone width (`frontend/e2e/requests.spec.js:1-8`) |
| `timelog` | 1 | 9 s | **Yes** | Local only | Ben logs 15 minutes, Maria approves it ("Saved"), Ben sees Approved, and Apollo's "Spent (approved time)" goes up (`frontend/e2e/timelog.spec.js:1-6`) |
| `pull` | 1 | 4 s | **Yes** | Local only | Ana presses **Take this** on a Ready task on Apollo's Board, it moves to In progress with her name, then she puts it back (`frontend/e2e/pull.spec.js:69-88`) |
| `budget`, `timeline`, `workload` | 3, 4, 5 | 9 s, 12 s, 17 s | No | Local; on AWS only if you name them | Chart checks: lines and bars in the right places, tooltips on hover and on Tab. Correct, but little to watch |
| `tour` | 9 | about 3 min | No | Local or AWS | Every screen for a manager and an employee, desktop and phone, light and dark, with an accessibility scan (axe) on each. **Too long to watch**: run it beforehand and show the pictures it saves in `~/tour-shots` (`tools/e2e.sh:157`) |
| `project-lifecycle` | 1 | 9 s | **Yes** | Local only | An admin creates, edits, archives and reactivates a project. **Skip it live**: it needs the admin password typed into the terminal |
| `screenshots` | 1 | skipped | Rewrites `docs/screenshots` | Never live | Not a demo |

Which files change data: `tools/e2e.sh:16-25` and its read-only list at `tools/e2e.sh:53`. The
files that write add rows to the **local** database each run (there is no delete), and they ring
bells: `pull`, for example, notifies Maria and every admin (`frontend/e2e/pull.spec.js:3-5`). So
if you demo the website locally as Maria afterwards, her bell count will be higher.

**Suggested live sets:**

```sh
cd ~/DavidCitiProject && ./tools/e2e.sh --show demo
```

```sh
cd ~/DavidCitiProject && ./tools/e2e.sh --show demo schedule
```

```sh
cd ~/DavidCitiProject && ./tools/e2e.sh --show timelog
```

The first is about 20 seconds (measured). The second adds the Schedule, about a minute in all
(estimate). The third, on the local stack only, shows question 7 being enforced: time costs money
only once it is approved.

**Don't** run `--show` with no file named (the script warns that it is slow, `tools/e2e.sh:239`),
and don't name `pull`, `requests`, `timelog` or `project-lifecycle` with `--aws`: the script
refuses them (`tools/e2e.sh:128-140`).

---

## 4. The "everything passes" moment

| Suite | Command | How long | The line that proves it |
| --- | --- | --- | --- |
| Backend (pytest), against a real local Postgres | `cd ~/DavidCitiProject && .venv/bin/pytest -q` | About 30 s (`610 passed in 29.26s`, 15 Oct, the run in section 3, with coverage on) | `N passed in ...s` and no `failed`. 648 tests are collected now (`pytest --collect-only -q`, 15 Oct) |
| One rule only: "not yours" answers 404, word for word | `cd ~/DavidCitiProject && .venv/bin/pytest -q -k byte_identical` | Under a second (0.4 s on 14 Oct) | `3 passed` and a `deselected` count (14 Oct; `docs/DEMO-RUNBOOK.md` section 4) |
| Website (Vitest + React Testing Library) | `cd ~/DavidCitiProject && (cd frontend && npm test)` | 3 to 4 minutes (`761 passed`, 221.81 s with coverage, the run in section 3) | `Test Files  N passed (N)` and `Tests  N passed (N)` |
| One screen's website tests | `cd ~/DavidCitiProject && (cd frontend && npx vitest run src/pages/approvals)` | A few seconds (2.3 s on 14 Oct) | `Tests  N passed (N)` |

- The website suite is too long to watch. Start it in a spare terminal at the start of your talk,
  and point at the result at the end.
- Don't start the backend tests while another test run is going: they rebuild the same test
  databases (`tests/backend/pg.py:13`).

---

## 5. What to say while it runs

| While this runs | Say |
| --- | --- |
| `demo` | "This is a real browser, driven by a script, against the real API and database. It signs in as a manager and checks that the answer to each of the seven questions is on screen." |
| `schedule` | "This checks what unit tests can't: where the bars are drawn, that a phone never scrolls sideways, and that someone using only a keyboard can reach a bar and open its project." |
| `history` | "A manager can see what happened to someone they manage, but not the before-and-after values. Those are admin only, so a salary never reaches a manager." |
| `requests` | "Three separate browsers: the employee asks, the manager rejects it with a note, the employee reads it on a phone. Each step writes an audit row and rings the right bell." |
| `timelog` | "Only approved time costs money. Watch Spent: it goes up only after the manager approves." |
| `pull` | "Employees pull work up to their task limit instead of being assigned it. The server holds that limit with a database row lock, so two clicks can't both get through." |
| Backend suite | "Six hundred and forty-eight tests against a real Postgres. Each runs in a transaction that is rolled back, and after each one the five integrity checks must find nothing." (`tests/backend/conftest.py:3-7`) |
| Website suite | "Every screen tested on its own with the API faked, so these need no server." |
| The tour pictures | "Every screen, both roles, desktop and phone, light and dark, each with an automatic accessibility scan. A serious problem fails the test." (`frontend/e2e/tour.spec.js:1-6`) |

---

## 6. Plan B: if a test fails live

**First, say what it means:** "A check didn't hold. The test tells us exactly which one, and it
kept a recording." Then:

1. **Read the block at the end.** `FAILED: N tests failed` comes with the file, the line and what
   was expected, just above it (`tools/e2e.sh:283`).
2. **Open the recording (the trace).** Every failed test keeps one
   (`frontend/playwright.config.js:19`), and the script prints the exact command to open it
   (`tools/e2e.sh:286-289`). Or copy this, which opens the first one it finds:

   ```sh
   cd ~/DavidCitiProject/frontend && npx playwright show-trace "$(find test-results -name trace.zip | head -1)"
   ```

   A window shows every step with a picture before and after it, and the network calls. Open it
   before you run anything again: the folder is emptied at the start of every run.
3. **Or open the HTML report.** This reruns the file, then opens Playwright's report in the
   browser at `http://localhost:9323`. Press Ctrl+C in the terminal to close it
   (`tools/e2e.sh:310-313`):

   ```sh
   cd ~/DavidCitiProject && ./tools/e2e.sh --report demo
   ```

**Common causes:**

| You see | Why | Do this |
| --- | --- | --- |
| `--show needs a screen to open the browser on` | This terminal has no display | Run it without the window: `./tools/e2e.sh demo`. The test lines still scroll by |
| `The local stack is not running` | `start-dev.sh` isn't running | Section 1, step 2; or use AWS (`./tools/e2e.sh --aws demo`) |
| `The live site did not answer ... health`, or a timeout on AWS | The AWS database was asleep, or the site is down | Wait 30 seconds and run it again; then fall back to the local stack |
| `Could not find Maria Lopez and Ana Ruiz in the local database` | The local data was never seeded | Seed it with the command it prints (type your admin password yourself) |
| Passes locally, fails on AWS | AWS has an older version, or extra people in the live data (`docs/TESTING.md` section 4) | Show the local run instead |

**If nothing will run at all:** show `./tools/e2e.sh --list` (it needs no server), the tour
pictures in `~/tour-shots`, and the backend suite (`.venv/bin/pytest -q`), which needs only the
local Postgres.

More detail on every file and option: `docs/TESTING.md` section 8 and `docs/DEMO-RUNBOOK.md`
section 4.
