# Frontend: the website

For anyone reading or changing the website: what it is, what every folder holds, the
commands, and where to change colours and words. Back to the [project README](../README.md).

## What it is

The screens that admins, managers and employees use, written in React. The website holds no
business rules: the server decides, the website shows. Every call goes to one API,
`/api/tracker` (the [backend](../backend/README.md)), and every percentage, total and flag on
screen comes from the server.

- **Stack:** React 19 (JavaScript, function components, PropTypes), Material UI 9 for the
  components, React Router 8 with `HashRouter` (addresses look like `#/projects/7`, so
  refreshing a page needs no server rewrite), react-responsive for the phone layout, built
  and served by Vite 7.
- **Where it runs:** locally on http://localhost:3000; on AWS the built files sit in S3 behind
  CloudFront, at https://d1gov8jpsxhwer.cloudfront.net (every login is in the
  [project README](../README.md)).
- **Each page loads on its first visit** ([`src/components/lazyPage.js`](src/components/lazyPage.js)):
  the first download stays small, and if a page's file can't be fetched the screen offers
  Reload instead of going blank.

Who sees what (the menu, from [`src/components/navigation.js`](src/components/navigation.js);
the server enforces the same rules):

| Role | Menu |
| --- | --- |
| Admin | Dashboard, Allocation, Schedule, Projects, Approvals, People, Requests, Notifications, Audit log |
| Manager | The same, without Audit log |
| Employee | Dashboard (their own: their projects, then their tasks), Projects, Requests, Notifications |

Everyone also has the top bar: the search box (finds pages their role may open, and projects
by name; press `/` or Ctrl+K to jump into it), the sun/moon switch for light and dark mode,
the notification bell, and My account.

## Every folder

```
frontend/
├── README.md              this page
├── index.html             the one HTML page; React fills it
├── package.json           the packages and the npm commands below
├── vite.config.js         the dev server (port 3000, never another) and the Vitest settings
├── playwright.config.js   browser tests: which site (E2E_BASE_URL), slow motion, traces
├── eslint.config.js       the lint rules
├── public/favicon.svg     the browser-tab icon
├── e2e/                   Playwright browser tests, one *.spec.js per journey; people.js says
│                          who they sign in as
└── src/
    ├── main.jsx           starts React
    ├── App.jsx            the website's route table: each address, its page, who may open it
    ├── index.css          makes the page fill the window (MUI does the rest)
    ├── auth/              the session
    │   ├── AuthContext.jsx    who is signed in: checks the session on load, signs in and out;
    │   │                      the tokens live in this tab's sessionStorage
    │   ├── useAuth.js         the hook a page uses to read the session
    │   └── RequireRole.jsx    guards a page: signed out -> login; must change the generated
    │                          password -> that page first; wrong role -> a plain message
    ├── services/          talking to the API, and turning its values into words
    │   ├── request.js         the one way to call the API: address, token, JSON, errors; on a 401
    │   │                      it swaps the refresh token once and retries; a dead session signs out
    │   ├── format.js          the only place cents, minutes and dates become text (and typed
    │   │                      dollars become cents)
    │   ├── useApi.js          load a page's data: loading, failed, reload
    │   ├── useLastPage.js     step back a page when a change empties the last one
    │   ├── people.js          "Maria Lopez" from a user record
    │   └── personAccess.js    what the signed-in person may do to someone (hides what the
    │                          server would refuse)
    ├── components/        pieces the pages share
    │   ├── AppLayout.jsx      the frame of every signed-in page: top bar, side menu (icons only
    │   │                      when collapsed, a drawer on phones), the "Saved" message
    │   ├── navigation.js      the menu: labels, icons, order, and which roles see each item
    │   ├── TopSearch.jsx      the top bar's search: your pages, and projects by name (/ or Ctrl+K)
    │   ├── searchPages.js     which pages the search finds for each role, and other words for them
    │   ├── NotificationBell.jsx   the bell: unread count every 10 s, a pop-up for new ones
    │   ├── DataTable.jsx      a table on a computer, cards on a phone
    │   ├── FormDialog.jsx     every form: errors tied to their field, locked while saving, an
    │   │                      edit sends only the fields that changed
    │   ├── ConfirmDialog.jsx  confirm before archive or reject (a red button)
    │   ├── PageState.jsx      loading, failed (with Retry), empty, and the shared Pager
    │   ├── PageHeader.jsx     a page's title, one line of explanation, its buttons
    │   ├── SearchField.jsx, ProjectPicker.jsx    search boxes that wait for typing to pause
    │   ├── StatusChip.jsx, BudgetBar.jsx         a status label; budget consumed versus planned
    │   ├── OverCapacityMark.jsx, OverEstimateMark.jsx   warnings as an icon plus words
    │   ├── PersonActions.jsx  the Actions menu on a person: edit, capacity, reset password,
    │   │                      history, archive, reactivate
    │   ├── ArchivePersonDialog.jsx   archiving someone: a red warning listing the live projects
    │   │                      they are still on, and Archive anyway
    │   ├── HistoryPanel.jsx, AuditChanges.jsx, auditText.js   a person's history; audit wording
    │   ├── ProjectTimelines.jsx, projectTimelines.js   the project timelines on the dashboards
    │   ├── PasswordField.jsx  a password box with show and hide
    │   ├── AcmeLogo.jsx       the logo
    │   ├── lazyPage.js        load a page's code on its first visit
    │   └── charts/            the deliverables timeline, budget and workload charts (plain MUI
    │                          boxes, no chart library)
    ├── pages/             one folder per screen
    │   ├── login/             sign in, change the generated password, the card they share
    │   ├── dashboard/         managers and admins: At risk and On track, three projects each,
    │   │                      with See all (questions 1, 2 and 7)
    │   ├── mytasks/           an employee's dashboard: their projects, their tasks, log time
    │   ├── allocation/        people by weeks, over capacity flagged (questions 3 and 5)
    │   ├── schedule/          people by weeks, a bar per booking in its project's colour
    │   ├── projects/          the list; a project's tabs (Deliverables, Resources, Budget, Board);
    │   │                      the dependency view (questions 4, 6 and 7)
    │   ├── approvals/         approve or reject logged time
    │   ├── people/            accounts: create (at least $41,600 a year: $20 an hour), edit,
    │   │                      capacity, archive
    │   ├── requests/          ask, and decide what others asked
    │   ├── notifications/     every notification, read and unread
    │   ├── audit/             admins: every change ever made, with filters
    │   └── account/           your name, email and password; My history
    ├── theme/             the look
    │   ├── theme.js           every colour, light and dark, each with its contrast ratio; MUI settings
    │   ├── chartColours.js    the charts' colours
    │   ├── ColorModeProvider.jsx, ColorModeToggle.jsx, colorMode.js   light or dark, remembered
    │   │                      in this browser
    │   └── responsive.js      the phone width: below it the menu becomes a drawer, tables cards
    └── test/              test setup and helpers (render a screen signed in; contrast maths)
```

## Commands

Run them in `frontend/`. Run `npm install` once first.

| Command | What it does |
| --- | --- |
| `npm run dev` | The website on http://localhost:3000 (stops rather than move to another port if 3000 is busy). Normally `../bin/start-dev.sh` starts it, after writing `.env.local` with `VITE_API_URL`, the API's address |
| `npm test` | Every website unit test once (Vitest with React Testing Library) |
| `npm run test:watch` | The same, rerun on every save |
| `npm run test:coverage` | The same, with the coverage table |
| `npm run lint` | ESLint |
| `npm run build` | The production build, into `dist/` (`../bin/deploy-frontend.sh` builds it and uploads it to S3) |
| `npm run e2e` | The Playwright browser tests. Easier from the repo root: `./tools/e2e.sh` finds the usernames, can show the browser, record videos or test the live site ([tools/README.md](../tools/README.md)) |

## Tests

- **Unit tests sit beside the code they test:** `DashboardPage.test.jsx` next to
  `DashboardPage.jsx`, and so on. That is where Vitest looks (`src/**/*.test.{js,jsx}`,
  [`vite.config.js`](vite.config.js)) and the usual React layout. Each renders a screen with
  a fake API and checks what a person would see.
- **Browser tests are in [`e2e/`](e2e/):** a real Chromium drives the real site, local or
  AWS. They live here because they use this folder's packages.

What each test file does, and the latest results: [tests/README.md](../tests/README.md) and
[docs/TESTING.md](../docs/TESTING.md).

## The look, and where to change it

David's design language: welcoming, not military. One forest green for everything green
(top bar, buttons, links, the selected menu item); a plain, warm matcha page with no grid;
square boxes; filled, rounded buttons; soft shadows and no glows. Status colours mean only
state: blue for done and approved (so it is never mistaken for the green), a true red for late
and over, orange-brown for pending. A warning is never colour alone: it is an icon plus words.
Every colour works in light and dark mode, with its contrast ratio written beside it.

| To change | Edit |
| --- | --- |
| A colour | [`src/theme/theme.js`](src/theme/theme.js): the `light` and `dark` sets at the top. Keep the contrast comment true: [`src/theme/theme.test.jsx`](src/theme/theme.test.jsx) checks the ratios |
| A chart colour | [`src/theme/chartColours.js`](src/theme/chartColours.js) (project colours are never green) |
| A menu label, its order or who sees it | [`src/components/navigation.js`](src/components/navigation.js) (the top-bar search finds pages from the same list) |
| Other words the search accepts for a page | `src/components/searchPages.js` |
| A page's words | That page's file in `src/pages/`, for example [`src/pages/dashboard/DashboardPage.jsx`](src/pages/dashboard/DashboardPage.jsx): the words are plain text in the file |
| How money, hours and dates read | [`src/services/format.js`](src/services/format.js) |
| The phone width | [`src/theme/responsive.js`](src/theme/responsive.js) |

Tests find things by the words a person sees, so a reworded button can fail a test: run
`npm test`, and `./tools/e2e.sh` for the browser tests, after changing words.

## The conventions

- Every API call goes through [`src/services/request.js`](src/services/request.js). A 401 is
  handled there, in one place; the login call is exempt.
- Only [`src/services/format.js`](src/services/format.js) turns cents, minutes and dates into
  text. The browser never does money arithmetic.
- Field names are exactly the API's camelCase (`annualSalaryCents`, `weeklyCapacityHours`).
- Every form is a [`FormDialog`](src/components/FormDialog.jsx): a field's error is tied to
  its box (`aria-describedby`), and one press sends one request.
- Every browser-storage access is wrapped in `try`/`catch` (private windows can refuse it).
- Components have PropTypes and JSDoc; MUI icons are the `…Outlined` ones.
- Before adding a package, run `npm audit`: CI fails on a high-severity finding.
