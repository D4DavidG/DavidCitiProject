# Schedule: a Float-style view of bookings (design)

Approved by David on 14 Oct. Built on branch `David2`. Website only: no backend change.

## 1. What and why

A **Schedule** screen (`#/schedule`, menu item right after Allocation, managers and admins
only). It has one row per person and the weeks across. Each booking is a bar in its
project's colour, spanning the weeks it runs, labelled "Apollo · 25 h/wk". It answers
questions 3 and 5 the way Float and Harvest Forecast draw them. The Allocation grid answers
them as numbers ("45 / 40 h"); the Schedule answers them as a picture (who is on what, for
how long, and where it piles up).

## 2. Data source

Only the existing `GET /dashboard/allocation` (`services/dashboard.py` `allocation`), through
`services/request.js`, exactly as `AllocationPage` calls it: `weekFrom`, `weeks` (8, 13 or
26; the server allows 1 to 26), `overOnly`, `page`, `pageSize`. For each person and week it
returns the booked hours, `overAllocated`, `overByHours` and `projects: [{ projectId, name,
hours }]`, plus the `weeks` list. The server has no name search on this route, so the screen
has none. Filtering only the current page would quietly miss people on other pages.

## 3. Decisions

| Decision | Rejected alternative, and why |
| --- | --- |
| Bars are built in the browser from the weekly shares (`scheduleBars` in `pages/schedule/schedule.js`): one bar per project per run of consecutive weeks with the **same** hours. A change of hours or a gap starts a new bar | Reading `assignments` directly: a new route or a second call for something the allocation answer already holds. Cost: a bar shows whole weeks, even when a booking starts mid-week |
| One lane per project in a person's row (lowest project id on top), so bars of one project stay on one line and several projects stack | Packing bars into as few lanes as possible: less height, but a project would jump between lines |
| Colours come only from `PROJECT_COLOURS` / `OTHER_COLOUR` in `theme/chartColours.js`. `keepColours` gives each project a colour the first time the screen sees it (lowest id first) and **never changes it** while the screen is open. Past the 5th project, the rest share the grey "Other" | `projectColours()`, the dashboard's helper: it colours by rank on the current page, so Zeus would turn from aqua to blue when a filter hides Apollo. `projectId % 5`: stable but two projects on screen can share a colour, and there is never an "Other". Cost of our choice: after a reload, colours can differ if the first page seen differs |
| Over-capacity week: a 2 px red outline over the whole week (`data-state="over"`, striped in print and forced colours, as the other charts) **plus** the warning icon and "+5 h over". A screen reader hears "Week of Oct 12: 45 of 40 hours booked, +5 h over" | Colour alone, or a red fill under the bars: fails "never colour alone" and hides the project colours |
| Each bar is a React Router `Link` to `/projects/:id`, named "Ben Okafor, Apollo, 25 hours a week, Oct 12 to Nov 1"; the tooltip says "Apollo · 25 h/wk · Oct 12 – Nov 1" on hover and keyboard focus | A button with an onClick: a link already gives Tab, Enter, middle-click and the URL in the status bar. The project page has no URL for its Resources tab (the tab is component state), so the link opens the project on its first tab. Adding `?tab=` was left out to keep this change on one screen |
| On a phone, the first tap on a bar shows the tooltip and the second opens the project | A tap is also a click, so the tooltip could never be read before the page changed |
| Previous/Next move one week, as on Allocation; any change of weeks or the filter goes back to page 1 (who is worst depends on the weeks shown) | Moving by the whole span: inconsistent with Allocation |
| The weeks scroll sideways inside the chart card (new `scroll` prop on `ChartFigure`), with the name column sticky. The legend sits above the rows (new `legendFirst` prop) | Letting the page scroll sideways: breaks the phone layout rule. Copying ChartFigure: two frames to keep in step |
| The bar's label text is dark ink on white above a 12 px coloured bar (`MARK.bar`), not white text inside the bar | Text inside the bar: yellow and grey fail contrast with white text, blue fails with dark text |
| Hours text through `formatPerWeek` in `services/format.js` ("25 h/wk", "25 hours a week"); dates through `formatDay`/`addDays`. "+5 h over" is written inline, as on Allocation and the workload chart | |

## 4. Files

- `frontend/src/pages/schedule/schedule.js`: `scheduleBars`, `keepColours`
- `frontend/src/pages/schedule/SchedulePage.jsx`: the screen
- `frontend/src/components/charts/ChartParts.jsx`: `scroll` and `legendFirst` on `ChartFigure`
- `frontend/src/services/format.js`: `formatPerWeek`
- `frontend/src/components/navigation.js`, `frontend/src/App.jsx`: menu item and route (`RequireRole roles={STAFF}`, as `/allocation`)

## 5. Tests

- `schedule.test.js` (8): bars span the right weeks, split on a change of hours or a gap;
  colours are kept, lowest id first, grey past the fifth, and the same map comes back when
  nothing is new.
- `SchedulePage.test.jsx` (18): bars and their accessible names and dates; colour by project in
  every row, and **kept when a filter leaves only another project** (this test fails with the
  dashboard's rank-based `projectColours`); the legend; "+5 h over" with the icon, the words
  and the outline; "Not booked"; tooltip on hover and on keyboard focus; first tap shows the
  tooltip and the second opens the project; click and Enter open the project; Previous, Next,
  This week, 8/13/26 and the switch change the request; paging; empty and error states
  through `PageState`.
- `ChartParts.test.jsx` (+2), `format.test.js` (+1), `AppLayout.test.jsx` (+1: Schedule right after
  Allocation for managers and admins, never for employees), `App.test.jsx` (+1: employees
  get "not available for your role", as on /allocation).
- `e2e/schedule.spec.js` (3, read-only, Maria): at 1440 and 390 px, Ben's row has an Apollo
  bar and a red-outlined "+N h over" week, and the page never scrolls sideways. On the phone
  the weeks scroll inside the card and Ben's name stays on screen. Tab onto a bar shows its
  tooltip, and Enter opens Apollo.

A jsdom quirk: it reports `:focus-visible` only for a test's first Tab, so the keyboard
tooltip test makes `:focus-visible` mean "has focus", as a browser does after Tab. The
Playwright spec checks the same thing in real Chromium.
