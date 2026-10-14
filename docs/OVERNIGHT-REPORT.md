# Overnight report: the frontend build (13 to 14 Oct)

Written for David, to read first thing in the morning. It says what was built while you
slept, how each part was checked, what wasn't checked, and every decision made on your
behalf so you can overrule it. The plan being followed is
`docs/superpowers/plans/2026-10-14-frontend.md`.

## Status at a glance

| Task | Screen or part | State |
| --- | --- | --- |
| 1 | Tooling, API client, formatting | Done |
| 2 | Session, theme, layout, routing | Done |
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

### Task 2: Session, theme, layout, routing

- **Signing in is remembered for the browser tab** (`sessionStorage`), and checked with
  the server when the page loads. If the token has expired, any request that gets a 401
  signs you out in one place and the login page can say why.
- **Menu by role:** managers and admins get Dashboard, Allocation, Projects, Approvals,
  People, Requests and Notifications (admins also get Audit log). Employees get My tasks,
  Projects and Notifications. Typing the address of a screen your role can't use shows
  "This page is not available for your role" (the server refuses it too).
- **Layout:** a fixed sidebar on desktop; on phones (below 900 px wide) a menu button
  opens it as a drawer.
- **Theme:** navy and blue on light grey, with each colour's contrast ratio noted in
  `src/theme/theme.js` (all pass the 4.5:1 accessibility minimum).
- **Addresses use `#`** (`/#/projects/7`), so refreshing any page works on CloudFront
  without the rewrite rule we removed.
- **Screens not built yet** show "Coming soon" instead of a broken page.
- **Tests:** 42 in total, all passing; lint clean; the production build works.

## Decisions made for you

Each line is something the plan or your answers didn't settle, with what it costs if
it's wrong.

- **Worked directly on branch `David`** (no separate branch), so your morning push needs
  nothing extra. Cost if wrong: none.
- **Newer library versions than the plan named:** npm installed MUI 9, React Router 8 and
  Vitest 5 (the plan said 7, 7 and unspecified). These are the current stable releases
  and passed `npm audit`. Cost if wrong: an older-version tutorial may not match exactly.
- **Signed in per browser tab:** the login token is kept in `sessionStorage`, so closing
  the tab signs you out (safer on shared machines). Cost if wrong: switch to
  `localStorage` in `src/auth/AuthContext.jsx` to stay signed in across tabs.
- **The starter's `App.css` is still in the folder, unused.** Deleting files needs a
  command outside your pre-approved list. Delete it any time.
- **Dates on screen:** plain dates (due dates, start dates) are shown exactly as stored;
  timestamps (when something happened) are shown in Eastern time, like the server. Cost
  if wrong: a one-line change in `format.js`.

## Not verified

Filled in as the run goes.
