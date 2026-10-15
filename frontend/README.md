# ACME Project Tracker: the website

The screens managers, employees and admins use: the dashboard, allocation grid, schedule,
projects (deliverables, resources, budget, board, dependencies), my tasks, approvals,
people, requests, notifications, the audit log, and login. It talks to one API,
`/api/tracker`, and holds no business rules of its own: the server decides, the website
shows. The whole project (what it answers, how it is built and deployed) is described in the
[project README](../README.md); every kind of test is in [docs/TESTING.md](../docs/TESTING.md).

## Stack

React 19 (JavaScript, function components, PropTypes), Material UI 9, React Router 8
(`HashRouter`, so links like `#/projects/7` need no server rewrite), react-responsive for
the phone layout, built and served by Vite 7. Tests: Vitest with React Testing Library
(beside the code), and Playwright for real-browser tests in `e2e/`.

## Commands (run in `frontend/`)

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3000 (fails rather than moving port if 3000 is busy). Normally started by `../bin/start-dev.sh`, which also writes `.env.local` (`VITE_API_URL`, the API's address) |
| `npm test` | All website tests once (Vitest + React Testing Library, about 2 minutes on the VDI) |
| `npm run test:coverage` | The same, with a coverage table |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` (`../bin/deploy-frontend.sh` builds and uploads it to S3 and CloudFront) |
| `npm run e2e` | Playwright browser tests against the running app; needs the local stack and the demo data. Usernames and the base URL come from environment variables: see [docs/TESTING.md](../docs/TESTING.md) |

## Where things live

```
src/
  main.jsx, App.jsx    entry point; the route table (who may open which screen)
  services/            request.js: the one module that calls the API (token, JSON, errors;
                       a 401 signs out in one place); format.js: the only code that turns
                       cents, minutes and dates into text; useApi.js: loads data, reloads on request
  auth/                the session (AuthContext), and RequireRole, which guards each screen
  components/          shared pieces: layout and menu, DataTable (cards on phones),
                       FormDialog, PageState (loading, error with Retry, empty), ...
  components/charts/   the timeline, budget and workload charts and their shared figure
  pages/<screen>/      one folder per screen, its tests beside it
  theme/               MUI theme, chart colours, the phone breakpoint
  test/                test setup and helpers (render a screen signed in, fake the API)
e2e/                   Playwright specs: the demo walk, screen tour, charts, schedule, ...
```
