# Overnight report: the frontend build (13 to 14 Oct)

Written for David, to read first thing in the morning. It says what was built while you
slept, how each part was checked, what wasn't checked, and every decision made on your
behalf so you can overrule it. The plan being followed is
`docs/superpowers/plans/2026-10-14-frontend.md`.

## Status at a glance

| Task | Screen or part | State |
| --- | --- | --- |
| 1 | Tooling, API client, formatting | Done |
| 2 | Session, theme, layout, routing | Not started |
| 3 | Login and change password | Not started |
| 4 | Dashboard (questions 1, 2, 7) | Not started |
| 5 | Allocation grid (questions 3, 5) | Not started |
| 6 | Projects list and detail | Not started |
| 7 | Dependency view and end-to-end tests | Not started |
| 8 | My tasks | Not started |
| 9 | Approvals | Not started |
| 10 | People | Not started |
| 11 | Project requests | Not started |
| 12 | Notifications | Not started |
| 13 | Audit log | Not started |
| 14 | Finish: coverage, README, guide | Not started |

## What you need to do this morning

Filled in at the end of the run.

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

## Decisions made for you

Each line is something the plan or your answers didn't settle, with what it costs if
it's wrong.

- **Worked directly on branch `David`** (no separate branch), so your morning push needs
  nothing extra. Cost if wrong: none.
- **Newer library versions than the plan named:** npm installed MUI 9, React Router 8 and
  Vitest 5 (the plan said 7, 7 and unspecified). These are the current stable releases
  and passed `npm audit`. Cost if wrong: an older-version tutorial may not match exactly.
- **Dates on screen:** plain dates (due dates, start dates) are shown exactly as stored;
  timestamps (when something happened) are shown in Eastern time, like the server. Cost
  if wrong: a one-line change in `format.js`.

## Not verified

Filled in as the run goes.
