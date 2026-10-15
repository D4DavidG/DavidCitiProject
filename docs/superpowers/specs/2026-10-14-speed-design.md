# Faster website, less code: design

Written 14 Oct evening, from David's note "decrease lines of code, make things faster".
Plan: `docs/superpowers/plans/2026-10-14-speed.md`. Website only, plus one small backend helper.
No route, migration or API change.

## 1. What and why

**Measured first (14 Oct, commit 5b544c0):**

| Measure | Today | How |
| --- | --- | --- |
| Website download | **one JavaScript file, 739.31 kB (227.17 kB gzip)** | `cd frontend && npm run build` (REPOINFO's "728 kB" is from before the later features). Vite warns: "Some chunks are larger than 500 kB" |
| Website source | **5,025 lines in 53 files** | tracked `.js`/`.jsx` under `frontend/src`, without `*.test.*`, `src/test/` and the test-only `pages/projects/fixtures.js` |
| Backend source | **3,980 lines in 34 files** | tracked `.py` under `backend/tracker` (the vendored driver is untracked) |

Every visitor downloads the code for all 12 signed-in screens before the sign-in page
appears, though one visit uses three or four of them. A **throwaway probe** (a copy of
`frontend/` in the scratchpad, the 12 pages switched to `React.lazy`, nothing committed)
measured what splitting buys:

| Probe result | Size (gzip) |
| --- | --- |
| First download (sign-in page, app shell, React, MUI parts they use) | **549.95 kB (174.66 kB)**: -26% raw, -23% gzip |
| Largest page file: project detail with its tabs and timeline | 21.81 kB (7.07 kB) |
| Largest shared file: MUI Tooltip and Popper, used by the charts | 31.25 kB (11.43 kB) |
| Dashboard page file | 14.94 kB (4.99 kB) |

What fills the 550 kB (a second probe giving each package its own file): react-dom
209 kB, the MUI pieces the shell and sign-in page use, react-router 37 kB, our own shell
code 31 kB. Getting under Vite's 500 kB warning would mean lazy-loading the sign-in page
too, which the brief for this item rules out (section 2). **The warning stays, and the
docs say why.**

The repeated-code hunt found one clear block: **the page-number control, copied ten
times** (5 lines each: `{data?.totalPages > 1 && (<Box …><Pagination … onChange={(_, value) => …} /></Box>)}`),
in Projects, People, Dashboard, Allocation, Approvals, Requests, Notifications, Audit
log, My tasks and the History panel. In the backend, **the "X is required." loop is
copied four times** (projects, deliverables, tasks, bookings), each rebuilding the label
text that `domain/values.py` already builds in `_label`. Nothing else qualifies (section 2).

## 2. Decisions (with the alternative rejected)

| Decision | Rejected alternative, and why |
| --- | --- |
| **Lazy-load the 12 signed-in pages** with `React.lazy` in `App.jsx`; the sign-in page, change-password page, `Home`, `NotFound`, `AppLayout`, `RequireRole` and `AuthProvider` stay in the first download | Lazy-load the sign-in page as well: it would clear the 500 kB warning, but the first screen everyone sees would then need two round trips. The item asks to keep login and the shell eager |
| **One `<Suspense>` inside `SignedIn`, around the `<Outlet />`**, so the app bar and menu stay on screen while a page's file arrives | A `<Suspense>` per route: 12 copies of the same wrapper. One at the top of the app: the whole screen, menu included, would blank on every first visit to a page |
| **Fallback is `<PageState loading />`**, the spinner every screen already shows while its data loads | A new spinner component: a second look for the same wait, and more code |
| **A failed page download shows a message with a Reload button**, through a 3-line helper `lazyPage(load)` that catches the failed `import()` and renders `PageLoadFailed` instead | No handling: `deploy-frontend.sh` runs `s3 sync --delete` (line 153), so after a deploy the old page files are gone, and someone with the site already open would get a blank white screen on their next new screen. A class-based error boundary: more code doing the same for this one case |
| **No vendor split** (`manualChunks`) | Splitting React and MUI into their own file only helps the second visit after a deploy; the first download stays the same size, and it is one more config block to explain |
| **No prefetching** of the next likely page | Page files are 2 to 22 kB; the round trip is the only cost, and it is under the spinner |
| **Keep the 500 kB warning**; explain it in REPOINFO | Raising `chunkSizeWarningLimit` would hide a true statement about the first download |
| **The pager becomes `Pager`, a named export of `components/PageState.jsx`**: `Pager({ page, totalPages, onChange })`, renders nothing when `totalPages` is 0, 1 or missing, and calls `onChange(newPage)` with the number, not the event | Its own file `components/Pager.jsx`: every one of the 10 call sites would gain an import line (net about -8 lines instead of about -20). All 10 already import `PageState` and put the pager inside it, so the import line just grows. A `pager` prop on `PageState` or `DataTable`: hides list controls inside components named for something else, and 4 of the 10 sites don't use `DataTable` |
| **One top margin for the pager (`mt: 2`)**; Projects and Dashboard used `mt: 3` | A margin prop for two screens: 8 px of difference is not worth a prop. Spacing only; goes under "not verified" |
| **Backend: `values.require(data, keys)`** in `domain/values.py` replaces the four copied loops; same message (`"Start date is required."`), same `field` | Leaving the copies: the error text format lives in five places. Changing `users.create_user` too: it calls `values.text`, which also refuses `null` and blank, so swapping it would change behaviour |
| **Not folded:** the search box (3 screens), the Apply/Clear filter form (Audit log, History), the Archived chip (2 screens), the two backend `_load` helpers | Search box: a component holding its own input state, with the filters as children, saves about 2 lines a screen and costs about 25. Filter form and chip: only two copies each. `_load` in `milestones.py` and `tasks.py`: they lock differently (`FOR UPDATE` on tasks, `lock=manage` on the project) and carry the 404-not-403 rule; merging them risks a rule for a dozen lines |
| **Lighthouse stays dropped.** Playwright plus its axe scan is the one browser-testing tool | Lighthouse's accessibility score runs the same axe rules the tour already runs. A grep found no "Lighthouse planned/queued" wording left: REPOINFO question 19 and TESTING section 5 already give the reason; the plan rechecks |

**Dead code:** every non-test source file is imported by another (checked with grep);
nothing to delete.

## 3. Data, routes and UI

- **Data and API:** no change. No migration, no Lambda cold start.
- **Website routes:** the same 15 paths, same guards. Only how each page's code arrives changes.
- **UI:** the first visit to a screen in a session may show the usual loading spinner under
  the app bar for a moment before the page's own spinner. Pager spacing on Projects and
  Dashboard moves from 24 px to 16 px.

## 4. Error cases

| Case | What happens |
| --- | --- |
| A page's file fails to download (offline, or a deploy deleted it) | `PageLoadFailed`: a warning "This page couldn't load. The website may have been updated since you opened it." with a **Reload** button (`window.location.reload()`). The app bar stays, so other screens still work if their files are already loaded. React caches a failed lazy load, so Reload is the fix, and the message says so |
| The page's file is slow | The app's spinner, under the app bar |
| A list with one page, or none, or still loading | `Pager` renders nothing, as each copy did |
| Backend create body missing a required field | Same 400 answer, text and `field` as today, now from `values.require`. Bookings pass a set (`_FIELDS`), so with several fields missing which one is named first can vary, as today |

## 5. Tests that prove it

| Test | Proves | Fails without the change because |
| --- | --- | --- |
| `App.test.jsx` "loads a page's code on first visit and shows it" | `lazyPage` renders the loaded page | `lazyPage` doesn't exist |
| `App.test.jsx` "shows Reload when a page's code can't be downloaded" | the error case above | no helper: a rejected `import()` throws, nothing renders |
| `App.test.jsx` "imports no signed-in page eagerly" (reads `App.jsx?raw`; no `import XPage from './pages/…'` outside `pages/login/`) | the split can't silently undo itself | today's `App.jsx` imports all 12 pages eagerly |
| The 6 existing route tests in `App.test.jsx` | landing pages and guards still work through `Suspense` | (guard: must stay green) |
| `PageState.test.jsx` (new file) "Pager: nothing for 0, 1 or missing pages" and "Pager: calls onChange with the page number" | `Pager`'s contract | `Pager` doesn't exist |
| Existing page tests, including "Go to page 2" in `DashboardPage.test.jsx` and `HistoryPanel.test.jsx` | every pager site still pages | (guard) |
| `tests/backend/test_domain.py` "require names the first missing field" and "require passes when all present" | the helper | `values.require` doesn't exist |
| `tests/backend/test_api.py` "each create names its missing field", written and run green **before** the change: POST to `/projects`, `/projects/{id}/milestones`, `/milestones/{id}/tasks`, `/projects/{id}/assignments` with one required field missing, expecting 400, the message and the camelCase field | the four call sites keep their answer | (characterisation: those four `raise` lines are uncovered by `test_projects`, `test_work` and `test_api` today: projects.py:73, milestones.py:121, tasks.py:73, assignments.py:53) |
| Playwright, **all specs**, against the dev server, and the **tour plus demo against the production build** (`vite preview`) | real lazy files load in a browser, screens and axe still pass | the dev server never builds chunks, so only the preview run exercises them |

Known before starting (progress log, checkpoint after the accessibility scan): `demo.spec`
and `timeline.spec` fail on the local data since Apollo's two deliverables were marked done
by hand at 20:54. Run Playwright **before** the change to record the baseline; this item must
not add failures. The local database is not reseeded.

## 6. Numbers to report (before and after)

Largest chunk kB and gzip, first-download kB and gzip, file count from `npm run build`;
website and backend lines with the commands in section 1. Expected: first download about
550 kB (175 kB gzip); website lines about -10 net (the pager saves about 20, the lazy
helper and its message add about 10); backend about -6.

## 7. Docs that change

- `README.md`, "The website": two lines on route-level splitting and the Reload message.
- `docs/REPOINFO.md` question 14: replace "Queued, not built" with the measured before
  and after, and why the 500 kB warning stays; question 29a: the bundle numbers.
- `docs/TESTING.md`: test counts (website +5, backend +6: 2 helper tests and 4 parameterised cases) and the production-build
  Playwright run.
- `CLAUDE.md` "Where things stand": one line (built, not deployed).
- Lighthouse: recheck with `grep -rni lighthouse --include=*.md`; any "planned/queued"
  wording becomes "dropped: Playwright plus axe is the one browser-testing tool; Lighthouse
  would rerun the same axe rules".
