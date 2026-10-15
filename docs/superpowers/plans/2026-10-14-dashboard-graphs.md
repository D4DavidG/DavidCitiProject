# Dashboard Graphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three pictures of what the API already sends: a deliverables timeline on the project page (question 4), a budget chart (question 7) and a workload chart (questions 3 and 5) on the dashboard.

**Architecture:** The server adds two whole-number percentages, `planned_percent` and `pending_percent`, to `_figures` in `services/dashboard.py`. Both the cards and the Budget tab use `_figures`, so they get them, and `camelize` names them on the wire. The website draws three charts from plain MUI `Box`es sized in percent, with no chart library. They share one file of colours (`theme/chartColours.js`) and one file of chart parts: the figure, the row with its tooltip, and the legend. The timeline makes the Deliverables tab load `/dependency-graph` instead of `/milestones`, so the chart and the cards come from the same one request. The workload chart makes its own `GET /dashboard/allocation?weeks=1&pageSize=8` request.

**Tech Stack:** Python 3.13, psycopg 3, PostgreSQL, pytest; React 19, MUI 9, react-responsive, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-dashboard-graphs-design.md`. David approved it on 14 Oct. Read it before any task. Section numbers below (spec §n) refer to it.

## Global Constraints

- Commit after each task (David approved subagent-driven execution); never push or deploy — David runs git push and the bin/ deploy scripts.
- Build starts only after the pull board plan (docs/superpowers/plans/2026-10-14-pull-board.md) is complete; re-read DashboardPage.jsx, DeliverablesTab.jsx and ProjectDetailPage.jsx at the start of each task because the pull board changed the project page.
- Commit messages are plain sentences in this repo's style ("Dashboard graphs: ..."), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No chart library** (spec decision 2). No new npm package of any kind.
- **The server does the money** (spec decision 3, CLAUDE.md §9). The browser never adds, multiplies or divides cents. It turns server percentages into widths, and its only arithmetic is on percentages, hours and day counts.
- Server change, verbatim (spec §3): `"planned_percent": (money["planned_cents"] * 100 // budget) if budget else None,` and `"pending_percent": (money["pending_cents"] * 100 // budget) if budget else None,`. There are no route, migration, serializer or audit changes.
- **Colour rule** (spec decision 4): "status colours only mean state (green done, red late or over); project colours only mean "which project" (chart c); everything else is navy or grey".
- **Never colour alone** (spec decision 5): "Late and over carry a word and a warning icon". The icon is `@mui/icons-material/WarningAmberRounded`, already used by the dashboard. Stripes appear only under `@media print, (forced-colors: active)`, on marks with `data-state="late"` or `data-state="over"`.
- Light mode only (spec decision 6).
- Marks (spec §4): bars 12 px thick; rounded 4 px at the data end, square at zero, a timeline bar rounded at both ends; a **2 px white gap** between touching segments; reference lines **2 px in dark ink `#1F2937`**; gridlines 1 px solid `#E5E7EB`; no fixed chart heights.
- Every hex value, every word and every tooltip sentence is copied from the spec tables (§5 to §7) as it stands. All chart colours live only in `frontend/src/theme/chartColours.js`, each with its contrast ratio in a comment.
- Positions and widths go in the `style` prop as percentages (`style={{ width: '16.8%' }}`), not in `sx`. That keeps the tests able to read them, and stops emotion from making a class per value. The only pixel sizes are minimum widths, such as the 8 px one-day bar, and they go in `style` too (`style={{ minWidth: '8px' }}`), because the tests read them with `toHaveStyle`. (Checked in jsdom on 14 Oct: `toHaveStyle({ minWidth: '8px', width: '0.8%' })` passes on a `style` prop.)
- Text: names sit **above** their bar and wrap (`overflow-wrap: anywhere`). Status words use `error.main`. Percent text goes through `spentPercent(percent, cents)` (`format.js`), so under 1% reads "<1%".
- Rows: each row is an `<li>` holding one `Box`, which is the target: at least 24 px tall, `tabIndex={0}`, `role="img"`, `aria-label` set to the tooltip sentence, and wrapped in a MUI `Tooltip` with `enterTouchDelay={0}`. Gridlines, ticks, arrows and stripes are `aria-hidden`.
- Every chart is a `<figure>` with a heading and a one-line summary built from server values (spec §8).
- Phone (spec §9): the breakpoint is 899 px (`useIsMobile()`, and MUI `md` from 900 px). There is no sideways page scroll at 375 px. The timeline shows at most 3 month labels on phones and 6 on desktop. A row's right-hand words drop under the bar on phones.
- CLAUDE.md §9 and §10: every call goes through `request()`; only `services/format.js` turns cents, dates and minutes into text; PropTypes and JSDoc go on every component and on public functions; `.jsx` files export only components (lint rule `react-refresh/only-export-components`); field names are exactly the API's camelCase.
- Every behavioural change ships with the test that fails without it. Rule tests never import `api`. The backend integrity check runs on teardown, as it already does.
- Leave alone what the spec puts out of scope (spec §12): (d) history charts, zoom, export, the charts' own filters, a dark palette, and keeping the old picture on screen while reloading.

**One departure from the suggested task list:** the dashboard gets no "charts row" and no phone stacking. Spec §7 puts (c) **above** the filters and §6 puts (b) **between the stat tiles and the cards**, both full width at every size (§9: "nothing changes at the breakpoint"). Each chart's task wires it into its place, and Task 6 makes the screen tour check them.

## Review Focus

1. **The workload request fails while the project cards load fine.** These are two requests. The chart area should show its own error with Retry, and the cards should still show. Test: `it('keeps the cards when the workload chart fails, with Retry on the chart only')` (Task 5).
2. **Spending just $5 over budget.** The server rounds down, so `consumedPercent` is 100 while `remainingCents` is -500. The row must still say "Over budget" in red, with the icon. Test: `it('says Over budget when $5 over still rounds to 100%')` (Task 4).
3. **A deliverable due today.** It is not late until tomorrow. ISO strings compare strictly with `<`. Test: `it('is not late on its due day')` in `timeline.test.js` (Task 3).
4. **Searching or filtering the dashboard.** The workload chart ignores the filters (its heading says "all projects"), so a search must not refetch it or empty it. Test: `it('leaves the workload chart alone when searching projects')` (Task 5).
5. **More than 8 employees.** The chart shows the 8 most over (the server sorts the worst first), and it must say that people are missing, or the summary undercounts silently. Tests: `it('says how many people are shown when there are more than 8')` for the chart, and the "Showing 1 of 12" line in `it('shows this week\'s workload above the filters, ...')` for the page passing the server's `total` (Task 5). The note reads "Showing 8 of 12 people, most over first."

---

### Task 1: The server sends `plannedPercent` and `pendingPercent`

**Files:**
- Modify: `backend/tracker/services/dashboard.py` (`_figures`, about lines 65-74)
- Test: `tests/backend/test_dashboard.py` (the loop at about `:70`, plus two new tests after it), `tests/backend/test_api_read_walk.py` (the card key set at about `:79`)

**Interfaces:**
- Produces: every dict from `_figures(project, money, today)` gains `planned_percent: int | None` and `pending_percent: int | None`. On the wire these are `plannedPercent` and `pendingPercent` in each item of `GET /dashboard/projects`, and in `GET /projects/{id}/budget`.

- [ ] **Step 1: Write the failing tests**

In `test_project_card_combines_status_progress_risk_and_money`, add `"planned_percent", "pending_percent"` to the key tuple of the card-equals-Budget-tab loop.

```python
def test_planned_and_pending_percent_are_whole_numbers_rounded_down(conn, org):
    approved = log(conn, org["alice"], org["task"], "2026-10-12", 2)
    log(conn, org["alice"], org["task"], "2026-10-13", 1)  # 4,807 c stays pending
    time_entries.decide_entry(conn, org["bob"], approved["entry_id"], approve=True)
    pid = org["apollo"]["project_id"]
    budget = dashboard.project_budget(conn, org["bob"], pid)
    assert (budget["planned_percent"], budget["pending_percent"]) == (25, 0)  # 1,263,554 of 5,000,000
    projects.update_project(conn, org["admin"], pid, {"budget_cents": 900_000})
    budget = dashboard.project_budget(conn, org["bob"], pid)
    assert budget["pending_percent"] == 0     # 0.53%: rounded down, not to nearest
    assert budget["planned_percent"] == 140   # bookings cost more than the budget: past 100


def test_no_budget_gives_no_percentages(conn, org):
    projects.update_project(conn, org["admin"], org["zeus"]["project_id"], {"budget_cents": 0})
    budget = dashboard.project_budget(conn, org["carol"], org["zeus"]["project_id"])
    assert (budget["consumed_percent"], budget["planned_percent"], budget["pending_percent"]) == (None, None, None)
```

In `test_api_read_walk.py`, add `"plannedPercent", "pendingPercent"` to the set of keys asserted on `board["items"][0]`.

- [ ] **Step 2: Run them to check they fail**

Run: `.venv/bin/pytest -q tests/backend/test_dashboard.py tests/backend/test_api_read_walk.py`
Expected: FAIL with `KeyError: 'planned_percent'` (and the walk's subset assertion fails).

- [ ] **Step 3: Add the two lines to `_figures` in `backend/tracker/services/dashboard.py`**

Paste the two lines from Global Constraints next to `consumed_percent`.

- [ ] **Step 4: Run the backend suite**

Run: `.venv/bin/pytest -q`
Expected: all pass. The count goes up by 2 from what the pull board left.

- [ ] **Step 5: Commit**

```bash
git add backend/tracker/services/dashboard.py tests/backend/test_dashboard.py tests/backend/test_api_read_walk.py
git commit -m "Dashboard graphs: the server sends planned and pending as a percent of the budget"
```

---

### Task 2: Chart colours and the shared chart parts

All three charts use these: the figure with its heading and summary, the row with its tooltip, the legend, the stripe rule and the colours. So they are built and tested once, here.

**Files:**
- Create: `frontend/src/theme/chartColours.js`, `frontend/src/theme/chartColours.test.js`
- Create: `frontend/src/components/charts/ChartParts.jsx`, `frontend/src/components/charts/ChartParts.test.jsx`

**Interfaces:**
- Produces (`chartColours.js`; every constant has its contrast ratio in a comment, copied from the spec):
  - `INK = '#1F2937'` and `GRID = '#E5E7EB'`.
  - `MARK = { bar: 12, radius: 4, gap: 2, line: 2, minDay: 8 }`, in pixels.
  - `STATE_COLOURS`, keyed `DONE`, `IN_PROGRESS`, `NOT_STARTED`, `BLOCKED` and `LATE`, each `{ fill, track }`, from spec §5. `BLOCKED` is the same as `NOT_STARTED`.
  - `BUDGET_COLOURS = { spent: '#0B3D91', waiting: '#AABBD8', track: '#EEEEEE', over: '#C62828' }`.
  - `OVER = '#C62828'`.
  - `PROJECT_COLOURS = ['#1c5cab', '#199e70', '#9085e9', '#e87ba4', '#eda100']` and `OTHER_COLOUR = '#D1D5DB'`.
  - `STRIPE = '#7F1D1D'`: the darker step of error red that the stripes are drawn in. This is a plan decision; the spec says only "a darker step of the fill".
  - `projectColours(projectIds: number[]) -> Map<number, string>`: distinct ids, lowest first. The first 5 take `PROJECT_COLOURS` in order, and the rest take `OTHER_COLOUR`.
- Produces (`ChartParts.jsx`; components only):
  - `ChartFigure({ title: string, summary: string, axis?: node, legend?: node, note?: node, children: node })`: a `<figure>` named by its `<h2>` title (through `aria-labelledby`), with the summary, the axis, the rows in a `<ul>`, the legend and the note, inside a white `Card`. Its `sx` gives every `[data-mark]` descendant `forcedColorAdjust: 'none'`. Under `@media print, (forced-colors: active)` it gives `[data-state="late"]` and `[data-state="over"]` a `repeating-linear-gradient(45deg, ...)` in `STRIPE`, with 2 px lines every 6 px.
  - `ChartRow({ tooltip: string, children: node })`: the `<li>` and its target `Box` (see Global Constraints).
  - `ChartLegend({ items: Array<{ label: string, colour: string, kind: 'swatch' | 'line' | 'problem' }> })`: a `<ul aria-label="Legend">`. A `problem` entry adds the warning icon, and a `line` entry draws a 2 px line key. The swatches are `aria-hidden`.

- [ ] **Step 1: Write the failing tests**

`chartColours.test.js`:

```js
it('colours projects by id, lowest first, whatever order they arrive in', () => {
  const expected = new Map([[3, '#1c5cab'], [7, '#199e70'], [9, '#9085e9']])
  expect(projectColours([7, 3, 9])).toEqual(expected)
  expect(projectColours([9, 3, 7, 3])).toEqual(expected)
})
it('folds the 6th project and later into Other', () => {
  const colours = projectColours([1, 2, 3, 4, 5, 6, 7])
  expect([colours.get(5), colours.get(6), colours.get(7)]).toEqual(['#eda100', '#D1D5DB', '#D1D5DB'])
})
```

`ChartParts.test.jsx`, rendered inside the app's `ThemeProvider`:

```js
it('is a figure named by its heading, with its summary', () => {
  render(<ChartFigure title="Budget by project" summary="0 of 2 projects are over budget."><li>row</li></ChartFigure>)
  expect(screen.getByRole('figure', { name: 'Budget by project' })).toHaveTextContent('0 of 2 projects are over budget.')
})
it('gives each row one focusable target that carries the tooltip sentence', async () => {
  render(<ul><ChartRow tooltip="45 h booked · Ben Okafor"><span>Ben</span></ChartRow></ul>)
  const target = screen.getByRole('img', { name: '45 h booked · Ben Okafor' })
  expect(target).toHaveAttribute('tabindex', '0')
  await userEvent.tab()
  expect(await screen.findByRole('tooltip')).toHaveTextContent('45 h booked · Ben Okafor')
})
it('names every legend entry and marks the problem one with the warning icon', () => {
  render(<ChartLegend items={[{ label: 'Spent', colour: '#0B3D91', kind: 'swatch' }, { label: 'Over budget', colour: '#C62828', kind: 'problem' }]} />)
  const legend = screen.getByRole('list', { name: 'Legend' })
  expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Spent', 'Over budget'])
  expect(within(legend).getAllByTestId('WarningAmberRoundedIcon')).toHaveLength(1)
})
it('adds stripes to problem marks only for print and high-contrast mode', () => {
  render(<ChartFigure title="T" summary="S"><li data-mark data-state="over">x</li></ChartFigure>)
  const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('')
  expect(css).toMatch(/forced-colors:\s*active/)
  expect(css).toMatch(/repeating-linear-gradient\(45deg/)
  expect(css).toMatch(/forced-color-adjust:\s*none/)
})
```

- [ ] **Step 2: Run them to check they fail**

Run: `(cd frontend && npx vitest run src/theme/chartColours.test.js src/components/charts/ChartParts.test.jsx)`
Expected: FAIL. The imports can't be resolved ("Failed to resolve import").

(Checked on 14 Oct in a scratch copy of this test setup: in jsdom, `userEvent.tab()` onto a `tabIndex={0}` `Box` does open a MUI `Tooltip`, and emotion writes the `forced-colors`, `repeating-linear-gradient(45deg` and `forced-color-adjust` text into `<style>` tags, so the last two tests can pass once the parts exist.)

- [ ] **Step 3: Write `chartColours.js` and `ChartParts.jsx` with the exports above**

- [ ] **Step 4: Run them to check they pass, then lint**

Run: `(cd frontend && npx vitest run src/theme/chartColours.test.js src/components/charts/ChartParts.test.jsx && npm run lint)`
Expected: 6 tests pass, and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme/chartColours.js frontend/src/theme/chartColours.test.js frontend/src/components/charts/
git commit -m "Dashboard graphs: chart colours, checked by the validator, and the shared figure, row and legend"
```

---

### Task 3: (a) The deliverables timeline on the project page

**Files:**
- Modify: `frontend/src/services/format.js` (add `daysBetween` next to `addDays`), `frontend/src/services/format.test.js`
- Create: `frontend/src/components/charts/timeline.js`, `timeline.test.js`, `TimelineChart.jsx`, `TimelineChart.test.jsx`
- Modify: `frontend/src/pages/projects/DeliverablesTab.jsx` (load, two new props, the chart above the cards), `ProjectDetailPage.jsx` (pass the props), `ProjectDetailPage.test.jsx` (the mocks)

**Interfaces:**
- Consumes: `ChartFigure`, `ChartRow`, `ChartLegend`, `STATE_COLOURS`, `INK`, `GRID` and `MARK` (Task 2); `formatDay`, `formatDate`, `todayIso` and `spentPercent` (`format.js`).
- Produces:
  - `daysBetween(fromIso: string, toIso: string) -> number` in `format.js`. This is whole days in UTC, like `addDays`.
  - `isLate(deliverable, today: string) -> boolean`: `status !== 'DONE' && dueDate < today`.
  - `timelineAxis(deliverables, projectStart: string, projectEnd: string) -> { from: string, to: string, days: number }`, where `from` is the earliest of the project start and every deliverable start, `to` is the latest of the project end and every due date, and `days = daysBetween(from, to) + 1`.
  - `offset(axis, iso) -> number`, the percent from the left: `daysBetween(axis.from, iso) * 100 / axis.days`.
  - `span(axis, start, due) -> { left: number, width: number }`, both in percent; the width counts the due day too: `(daysBetween(start, due) + 1) * 100 / axis.days`.
  - `monthTicks(from: string, to: string, max: number) -> string[]`: every first-of-month inside the axis (from `from` to `to`, both included, as spec §5 says), keeping every `Math.ceil(count / max)`-th, starting with the first.
  - `TimelineChart({ deliverables, edges, projectStart, projectEnd, today = todayIso() })`, titled **"Deliverables timeline"**.
  - `DeliverablesTab` gains the props `startDate: string` and `predictedEndDate: string`, and loads `GET /projects/{id}/dependency-graph`, reading `data.nodes` where it read `data.items`.

Wording for the chart (from spec §5 unless marked):

| | |
| --- | --- |
| Row title | `Build · after Design` (the names of the `to` nodes of the edges whose `from` is this row, joined with `, `; edges pointing at unknown ids are skipped) |
| Right-hand words | `Done`, `In progress 0%`, `Not started`, `Blocked`; late: warning icon + `Late, 0%` |
| Under the title, when the row is outside the project's dates | `Outside project dates` (`text.secondary`) |
| Tooltip | `0% done · Build · Oct 1 – Nov 12, 2026 · In progress · after Design` (`formatDay` start, en dash, `formatDate` due; the state word is `Late` when late) |
| Today | a 2 px `INK` line labelled `Today`; when outside the axis there is no line, and the note says `Today is before the start` / `Today is after the end` |
| Legend (spec §8, every chart with more than one colour) | `Done`, `In progress`, `Not started or blocked`, `Late` (problem) |
| Summary (plan wording) | `3 deliverables: 1 done, 1 late.` (`deliverable` when there is 1) |

- [ ] **Step 1: Write the failing helper tests**

`format.test.js`: `expect(daysBetween('2026-08-14', '2026-12-31')).toBe(139)` and `expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0)`.

`timeline.test.js`, with `BUILD` and `DESIGN` from `pages/projects/fixtures.js` and `MIGRATION = { ...BUILD, milestoneId: 13, name: 'Migration', startDate: '2026-08-14', dueDate: '2026-10-10' }`:

```js
it('is late once the due day has passed and it is not signed off', () => {
  expect(isLate(MIGRATION, '2026-10-14')).toBe(true)
  expect(isLate({ ...DESIGN, dueDate: '2026-10-06' }, '2026-10-14')).toBe(false) // DONE
})
it('is not late on its due day', () => {
  expect(isLate({ ...BUILD, dueDate: '2026-10-14' }, '2026-10-14')).toBe(false)
})
it('stretches the axis to every deliverable and counts the last day', () => {
  const axis = timelineAxis([BUILD, MIGRATION], '2026-10-01', '2026-12-31')
  expect(axis).toEqual({ from: '2026-08-14', to: '2026-12-31', days: 140 })
  expect(span(axis, '2026-08-14', '2026-10-10')).toEqual({ left: 0, width: 58 * 100 / 140 })
  expect(offset(axis, '2026-10-14')).toBe(61 * 100 / 140)
})
it('labels the first of each month, skipping evenly down to the maximum', () => {
  expect(monthTicks('2026-08-14', '2026-12-31', 6)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'])
  expect(monthTicks('2026-08-14', '2026-12-31', 3)).toEqual(['2026-09-01', '2026-11-01'])
})
```

- [ ] **Step 2: Write the failing chart tests in `TimelineChart.test.jsx`**

Render `<TimelineChart deliverables={[DESIGN, BUILD, MIGRATION]} edges={[{ from: 11, to: 10 }]} projectStart="2026-10-01" projectEnd="2026-12-31" today="2026-10-14" />` in the theme. A `row(name)` helper returns `screen.getByRole('img', { name: new RegExp(` · ${name} · `) })`.

```js
it('draws a row per deliverable, value first in its sentence', () => {
  expect(screen.getAllByRole('img').map((r) => r.getAttribute('aria-label'))).toEqual([
    '100% done · Design · Oct 1 – Oct 6, 2026 · Done',
    '0% done · Build · Oct 1 – Nov 12, 2026 · In progress · after Design',
    '0% done · Migration · Aug 14 – Oct 10, 2026 · Late',
  ])
  expect(within(row('Build')).getByText('Build · after Design')).toBeInTheDocument()
})
it('fills each bar to its progress', () => {
  expect(within(row('Design')).getByTestId('fill')).toHaveStyle({ width: '100%' })
  expect(within(row('Build')).getByTestId('fill')).toHaveStyle({ width: '0%' })
})
it('marks a past-due, unsigned deliverable Late with the icon; a done one stays Done', () => {
  const late = row('Migration')
  expect(within(late).getByText('Late, 0%')).toBeInTheDocument()
  expect(within(late).getByTestId('WarningAmberRoundedIcon')).toBeInTheDocument()
  expect(within(late).getByTestId('bar')).toHaveAttribute('data-state', 'late')
  expect(within(row('Design')).getByText('Done')).toBeInTheDocument()
  expect(within(row('Design')).getByTestId('bar')).not.toHaveAttribute('data-state')
})
it('says when a deliverable sits outside the project dates', () => {
  expect(within(row('Migration')).getByText('Outside project dates')).toBeInTheDocument()
  expect(within(row('Build')).queryByText('Outside project dates')).toBeNull()
  expect(within(row('Migration')).getByTestId('bar')).toHaveStyle({ left: '0%' })
})
it('draws the Today line, or says which side of the axis today is on', () => {
  expect(parseFloat(screen.getByTestId('today').style.left)).toBeCloseTo(43.57, 2)
  expect(screen.getByText('Today')).toBeInTheDocument()
  // re-render with today="2027-02-01": no 'today' test id, and the text 'Today is after the end'
  // re-render with today="2026-01-01": the text 'Today is before the start'
})
it('keeps a one-day deliverable at least 8 px wide', () => {
  // re-render with [{ ...BUILD, startDate: '2026-11-12' }]
  expect(within(row('Build')).getByTestId('bar')).toHaveStyle({ minWidth: '8px' })
})
it('sums it up and keys the colours', () => {
  expect(screen.getByRole('figure', { name: 'Deliverables timeline' })).toHaveTextContent('3 deliverables: 1 done, 1 late.')
  const legend = screen.getByRole('list', { name: 'Legend' })
  expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Done', 'In progress', 'Not started or blocked', 'Late'])
})
```

In `ProjectDetailPage.test.jsx`, replace every `'GET /projects/1/milestones'` mock with `'GET /projects/1/dependency-graph'`, and each `page([...])` answer with `{ nodes: [...], edges: [...] }`. Find them all with `grep -n "GET /projects/1/milestones" frontend/src/pages/projects/ProjectDetailPage.test.jsx`; on 14 Oct there were four (the pull board may have moved them):
- the default in `renderDetail`: `[200, { nodes: [DESIGN, BUILD], edges: [{ from: 11, to: 10 }] }]`;
- the sign-off refusal test: `[200, { nodes: [ready], edges: [] }]`;
- "offers sign-off only when the work is done": `[200, { nodes: [DESIGN, BUILD, launchReady, testsBlocked], edges: [] }]`;
- "gives both reasons": `[200, { nodes: [DESIGN, BUILD, launch], edges: [] }]`.

Leave `'POST /projects/1/milestones'` (creating a deliverable) alone: that route doesn't change. Then add:

```js
it('draws the deliverables timeline above the cards, from the one dependency-graph request', async () => {
  const calls = renderDetail()
  const chart = await screen.findByRole('figure', { name: 'Deliverables timeline' })
  expect(chart.compareDocumentPosition(screen.getByRole('region', { name: 'Build' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(calls.some((c) => c.path === '/projects/1/milestones' && c.method === 'GET')).toBe(false)
})
it('shows no chart when there are no deliverables', async () => {
  renderDetail(USERS.manager, { 'GET /projects/1/dependency-graph': [200, { nodes: [], edges: [] }] })
  expect(await screen.findByText('No deliverables yet.')).toBeInTheDocument()
  expect(screen.queryByRole('figure')).toBeNull()
})
```

- [ ] **Step 3: Run them to check they fail**

Run: `(cd frontend && npx vitest run src/services/format.test.js src/components/charts src/pages/projects/ProjectDetailPage.test.jsx)`
Expected: FAIL. `format.test.js` fails with `TypeError: daysBetween is not a function` (Vitest turns a missing named export into `undefined`, checked 14 Oct); `timeline.test.js` and `TimelineChart.test.jsx` fail with "Failed to resolve import"; and the project page tests fail because the tab still asks for `/milestones`, which now answers "No stub for GET /projects/1/milestones", so the Build card never appears.

- [ ] **Step 4: Implement**

- Add `daysBetween` to `format.js`.
- Write the helpers in `timeline.js`.
- Write `TimelineChart.jsx`, which uses `useIsMobile()` to choose `max` 3 or 6 for `monthTicks`. The test ids are `bar`, `fill` and `today`, and the marks carry `data-mark`.
- In `DeliverablesTab.jsx`, switch the load to `/dependency-graph`. Render `<TimelineChart deliverables={nodes} edges={edges} projectStart={startDate} projectEnd={predictedEndDate} />` first inside `PageState`, before the cards. Add the two PropTypes.
- In `ProjectDetailPage.jsx`, pass `startDate={p.startDate} predictedEndDate={p.predictedEndDate}`.

- [ ] **Step 5: Run the website suite and lint**

Run: `(cd frontend && npm test && npm run lint)`
Expected: all pass, and lint is clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/format.js frontend/src/services/format.test.js frontend/src/components/charts/ frontend/src/pages/projects/DeliverablesTab.jsx frontend/src/pages/projects/ProjectDetailPage.jsx frontend/src/pages/projects/ProjectDetailPage.test.jsx
git commit -m "Dashboard graphs: deliverables timeline on the project page, from the dependency graph"
```

---

### Task 4: (b) The budget chart on the dashboard

**Files:**
- Create: `frontend/src/components/charts/BudgetChart.jsx`, `BudgetChart.test.jsx`
- Modify: `frontend/src/pages/dashboard/DashboardPage.jsx` (between the stat tiles and the cards, inside the same `PageState`), `DashboardPage.test.jsx` (add `plannedPercent: 21, pendingPercent: 1` to `APOLLO`, and `plannedPercent: 0, pendingPercent: 0` to `HERMES`)

**Interfaces:**
- Consumes: Task 2's parts, `BUDGET_COLOURS`, `INK` and `MARK`; `formatCents` and `spentPercent`; the card fields `budgetCents`, `consumedCents`, `pendingCents`, `plannedCents`, `consumedPercent`, `pendingPercent`, `plannedPercent`, `remainingCents` and `plannedOverBudget` (Task 1).
- Produces: `BudgetChart({ projects })`, titled **"Budget by project"**. Each row is on a 0 to 125% scale: a percent `p` sits at `Math.min(p, 125) * 100 / 125` percent of the row.
  - Spent starts at 0. When `consumedCents > 0` and the percent is 0, it draws as 1 (the sliver).
  - Waiting starts where the drawn spent ends, with the same sliver rule on `pendingCents`.
  - The planned tick is drawn only when `plannedCents > 0`.
  - A bar or tick past 125% gets an `aria-hidden` arrow `▸`.
  - The Budget line sits at 80%, with the axis labels `0%`, `50%`, `100% Budget` and `125%`.
  - Over budget is `budgetCents > 0 && remainingCents < 0`.
  - The right-hand label is one text: `$52,900 of $40,000` (`formatCents` twice), plus ` · Planned 230%` only when `plannedPercent > 125` (spec §6: past 125% "the label gives the real figure").
  - When `plannedOverBudget` is true, the words `Planned cost is over budget` go under the bar, inside the row's target `Box` (plan wording: the card's full sentence in `BudgetBar.jsx` is too long for a chart row).
  - With no budget the row shows only the name and `No budget set · $1,370 spent`.

Fixtures in `BudgetChart.test.jsx`, as full cards (see `DashboardPage.test.jsx`):
- `APOLLO`: budget 15,000,000; consumed 137,000 at 0%; pending 153,800 at 1%; planned 3,197,600 at 21%; remaining 14,863,000.
- `ZEUS`: budget 4,000,000; consumed 288,500 at 7%; pending 0 at 0%; planned 2,535,600 at 63%; remaining 3,711,500.
- `HERMES`: budget 8,000,000; everything else 0 and 0%.
- `ARES`: budget 4,000,000; consumed 5,290,000 at 132%; pending 0; planned 9,200,000 at 230%; remaining -1,290,000; `plannedOverBudget: true`.
- `JUNO`: budget 0; consumed 137,000; every percent `null`; remaining -137,000.

- [ ] **Step 1: Write the failing tests**

```js
it('draws a row per project, in the order the server sent them', () => {
  render(<BudgetChart projects={[APOLLO, ZEUS, HERMES]} />)
  expect(screen.getAllByRole('img').map((r) => r.getAttribute('aria-label'))).toEqual([
    '$1,370 spent (<1%) · $1,538 waiting (1%) · $31,976 planned (21%) · budget $150,000 · Apollo',
    '$2,885 spent (7%) · $0 waiting (0%) · $25,356 planned (63%) · budget $40,000 · Zeus',
    '$0 spent (0%) · $0 waiting (0%) · nothing planned · budget $80,000 · Hermes',
  ])
})
it('places spent, waiting and planned from the server percentages, with a sliver under 1%', () => {
  // Apollo: spent width 0.8% (the 1% sliver); waiting left 0.8%, width 0.8%; planned left 16.8%
  // Zeus: spent width 5.6%; planned left 50.4%. Hermes: no 'planned' test id; text '$0 of $80,000'
})
it('turns red with words and the icon when over budget, with arrows past 125%', () => {
  // Ares: within its row 'Over budget', the icon, spent `data-state="over"` and width '100%',
  // the text '$52,900 of $40,000 · Planned 230%', two '▸', and 'Planned cost is over budget'
})
it('says Over budget when $5 over still rounds to 100%', () => {
  render(<BudgetChart projects={[{ ...ZEUS, consumedCents: 4_000_500, consumedPercent: 100, remainingCents: -500 }]} />)
  expect(within(screen.getByRole('img')).getByText('Over budget')).toBeInTheDocument()
})
it('shows No budget set with no bar, and never calls it over budget', () => {
  // Juno: 'No budget set · $1,370 spent'; no 'spent' test id; no 'Over budget' in its row
})
it('labels the budget line once, sums up and keys the colours', () => {
  // getAllByText('100% Budget') has length 1 (the axis label, not one per row)
  // summary for [APOLLO, ZEUS, HERMES, ARES]: '1 of 4 projects are over budget.'
  // legend: ['Spent', 'Waiting for approval', 'Planned', 'Over budget']
})
```

The bodies are written the way Task 3 writes them: `within(row).getByTestId('spent' | 'waiting' | 'planned')` and `toHaveStyle({ width })` or `toHaveStyle({ left })`, using the exact values in the comments.

In `DashboardPage.test.jsx`:

```js
it('draws the budget chart between the counts and the cards', async () => {
  renderDashboard()
  const chart = await screen.findByRole('figure', { name: 'Budget by project' })
  expect(screen.getByLabelText('At risk').compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(chart.compareDocumentPosition(screen.getByRole('article', { name: 'Apollo' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
```

- [ ] **Step 2: Run them to check they fail**

Run: `(cd frontend && npx vitest run src/components/charts/BudgetChart.test.jsx src/pages/dashboard)`
Expected: FAIL. `BudgetChart` can't be found, and the dashboard has no figure.

- [ ] **Step 3: Write `BudgetChart.jsx` and place it in `DashboardPage.jsx`**

The test ids are `spent`, `waiting` and `planned`, and each mark carries `data-mark`. The page renders `<BudgetChart projects={items} />` between the stat tiles and the card grid.

- [ ] **Step 4: Run the website suite and lint**

Run: `(cd frontend && npm test && npm run lint)`
Expected: all pass, and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/charts/BudgetChart.jsx frontend/src/components/charts/BudgetChart.test.jsx frontend/src/pages/dashboard/
git commit -m "Dashboard graphs: budget chart, each project against its own budget"
```

---

### Task 5: (c) The workload chart on the dashboard

**Files:**
- Create: `frontend/src/components/charts/WorkloadChart.jsx`, `WorkloadChart.test.jsx`
- Modify: `frontend/src/pages/dashboard/DashboardPage.jsx` (a `WorkloadPanel` above the filter form), `DashboardPage.test.jsx`

**Interfaces:**
- Consumes: Task 2's parts, `projectColours`, `OTHER_COLOUR`, `OVER`, `INK` and `MARK`; the allocation item fields `userId`, `name`, `capacityHours` and `weeks[0]` (`bookedHours`, `overByHours`, `overAllocated`, `projects[{ projectId, name, hours }]`).
- Produces:
  - `WorkloadChart({ people, total })`, titled **"Workload this week · all projects"**. The colours come from `projectColours` over every `projectId` in `people`. The hour axis runs from 0 to `Math.max(20, Math.ceil(max(bookedHours, capacityHours) / 20) * 20)`, with ticks every 20 h labelled `0 h`, `20 h` and so on.
  - Inside a bar, the segments go in slot order, then one `Other` segment. They fill up to capacity, and anything past capacity is one red segment `overByHours` wide, with `data-state="over"`.
  - The capacity line is per row.
  - The right-hand label is `45 / 40 h`.
  - In `DashboardPage.jsx`, a non-exported `WorkloadPanel()` runs its own `useApi` on `request('GET', '/dashboard/allocation', { query: { weeks: 1, pageSize: 8 } })`, wrapped in `useCallback(..., [])` (`useApi` re-runs whenever its function changes, so an unwrapped one would refetch on every search keystroke). It renders its own `PageState` (empty: `No employees to show.`) holding `<WorkloadChart people={data.items} total={data.total} />`, and then the link `All people and weeks in Allocation` to `/allocation`.

Wording (from spec §7 unless marked):

| | |
| --- | --- |
| Tooltip | `45 h booked, capacity 40 h · Apollo 25 h, Zeus 20 h · Ben Okafor`; with nothing booked: `0 h booked, capacity 20 h · Not booked · Dev Shah` (plan wording) |
| Over | warning icon + `+5 h over` beside the name |
| Not booked | `Not booked` beside the name, capacity line only, `0 / 20 h` |
| Summary | `1 person is over capacity this week: Ben Okafor, +5 h.` / `2 people are over capacity this week: Ben Okafor, +5 h; Chloe Kim, +2 h.` / `No one is over capacity this week.` |
| Note when `total > people.length` (plan wording) | `Showing 8 of 12 people, most over first.` |
| Legend | one entry per project in slot order, `Other (n)` if any, `Over capacity` (problem), `Capacity` (line) |

Fixtures: `BEN` (userId 4, capacity 40, week 2026-10-12, booked 45, over by 5, `overAllocated: true`, Apollo id 1 at 25 h, Zeus id 2 at 20 h), `ANA` (userId 3, capacity 40, booked 30, over by 0, Apollo id 1 at 30 h) and `DEV` (userId 5, capacity 20, booked 0, over by 0, no projects), in that order, each shaped like an item of `GET /dashboard/allocation` (`userId`, `name`, `capacityHours`, `peakOverByHours`, `weeks: [{ week, bookedHours, overByHours, overAllocated, projects }]`).

- [ ] **Step 1: Write the failing tests**

```js
it('draws a row per person, in server order, each with its sentence', () => {
  render(<WorkloadChart people={[BEN, ANA, DEV]} total={3} />)
  expect(screen.getAllByRole('img').map((r) => r.getAttribute('aria-label'))).toEqual([
    '45 h booked, capacity 40 h · Apollo 25 h, Zeus 20 h · Ben Okafor',
    '30 h booked, capacity 40 h · Apollo 30 h · Ana Ruiz',
    '0 h booked, capacity 20 h · Not booked · Dev Shah',
  ])
})
it('colours a project the same in every bar and fills to capacity, then red', () => {
  // Ben: segments [Apollo, Zeus, over]; Apollo #1c5cab width ≈ 41.67, Zeus #199e70 width 25 (15 h), over #C62828 width ≈ 8.33 with data-state="over"
  // Ana: Apollo segment is #1c5cab too; capacity line left ≈ 66.67 (Ben, Ana), ≈ 33.33 (Dev)
  // Ben's row shows '+5 h over' and the icon; labels '45 / 40 h', '0 / 20 h'; Dev's row shows 'Not booked'
})
it('folds the 6th project and later into Other, and lists them all in the sentence', () => {
  // one person, projects ids 1..7 at 2 h each: legend has 'Other (2)'; their last segment is #D1D5DB;
  // the aria-label names all seven projects
})
it('sums up who is over, or says no one is', () => {
  // [BEN, ANA, DEV] -> '1 person is over capacity this week: Ben Okafor, +5 h.'
  // [ANA, DEV] -> 'No one is over capacity this week.' and no element with data-state="over"
  // legend for [BEN, ANA, DEV]: ['Apollo', 'Zeus', 'Over capacity', 'Capacity']
})
it('says how many people are shown when there are more than 8', () => {
  render(<WorkloadChart people={[BEN, ANA, DEV]} total={12} />)
  expect(screen.getByText('Showing 3 of 12 people, most over first.')).toBeInTheDocument()
})
```

Widths are checked with `parseFloat(el.style.width)` and `toBeCloseTo(value, 2)`; colours with `toHaveStyle({ backgroundColor })`.

In `DashboardPage.test.jsx`, change `renderDashboard` so overrides **merge** into the defaults, as `renderDetail` does in `ProjectDetailPage.test.jsx`. Today its default is a parameter default, so any test that passes its own `'GET /dashboard/projects'` loses every other answer. Without this, the existing "shows the error and retries" test breaks: the workload request gets "No stub", its panel shows a second Retry button, and `getByRole('button', { name: /retry/i })` finds two.

```js
function renderDashboard(answers = {}) {
  const calls = stubApi({
    'GET /dashboard/projects': [200, page([APOLLO, HERMES])],
    'GET /dashboard/allocation': [200, { ...page([BEN], { total: 12 }), weeks: ['2026-10-12'] }],
    ...answers,
  })
  renderAt(<DashboardPage />, { path: '/dashboard' })
  return calls
}
```

(`BEN` copied in from the chart test.) Then:

```js
it('shows this week\'s workload above the filters, asking for one week of the 8 most over', async () => {
  const calls = renderDashboard()
  const chart = await screen.findByRole('figure', { name: 'Workload this week · all projects' })
  expect(chart.compareDocumentPosition(screen.getByLabelText(/search projects/i)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(calls.find((c) => c.path === '/dashboard/allocation').query).toMatchObject({ weeks: '1', pageSize: '8' })
  expect(within(chart).getByText('Showing 1 of 12 people, most over first.')).toBeInTheDocument() // the panel passes the server's total
  expect(screen.getByRole('link', { name: 'All people and weeks in Allocation' })).toHaveAttribute('href', '/allocation')
})
it('leaves the workload chart alone when searching projects', async () => {
  const calls = renderDashboard()
  await screen.findByRole('figure', { name: 'Workload this week · all projects' })
  await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
  await waitFor(() => expect(calls.at(-1).query.search).toBe('apo'))
  expect(calls.filter((c) => c.path === '/dashboard/allocation')).toHaveLength(1)
  expect(screen.getByRole('figure', { name: 'Workload this week · all projects' })).toBeInTheDocument()
})
it('keeps the cards when the workload chart fails, with Retry on the chart only', async () => {
  renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO, HERMES])], 'GET /dashboard/allocation': [500, { error: 'Database unavailable.' }] })
  expect(await screen.findByText('Database unavailable.')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
  expect(await screen.findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
})
it('says when there are no employees', async () => {
  renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO])], 'GET /dashboard/allocation': [200, { ...page([]), weeks: ['2026-10-12'] }] })
  expect(await screen.findByText('No employees to show.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to check they fail**

Run: `(cd frontend && npx vitest run src/components/charts/WorkloadChart.test.jsx src/pages/dashboard)`
Expected: FAIL. `WorkloadChart` can't be found, and the dashboard has no workload figure.

- [ ] **Step 3: Write `WorkloadChart.jsx` and `WorkloadPanel` in `DashboardPage.jsx`**

The test ids are `segment`, `over` and `capacity`, and the marks carry `data-mark`. `WorkloadPanel` sits between `PageHeader` and the filter form, outside the projects `PageState`.

- [ ] **Step 4: Run the website suite and lint**

Run: `(cd frontend && npm test && npm run lint)`
Expected: all pass, and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/charts/WorkloadChart.jsx frontend/src/components/charts/WorkloadChart.test.jsx frontend/src/pages/dashboard/
git commit -m "Dashboard graphs: this week's workload per person, by project, against capacity"
```

---

### Task 6: The screen tour checks the charts at 1440 and 375 px

**Files:**
- Modify: `frontend/e2e/tour.spec.js`

**Interfaces:**
- Consumes: the figure names from Tasks 3 to 5.
- Produces: `const FIGURES = { '/dashboard': ['Workload this week · all projects', 'Budget by project'], PROJECT: ['Deliverables timeline'] }`. After each screen loads, and before the overflow check, the tour runs `await expect(page.getByRole('figure', { name })).toBeVisible()` for every name in `FIGURES[screen] ?? []`. The existing sideways-scroll check then covers the charts at both widths.

- [ ] **Step 1: Add `FIGURES` and the visibility check**

- [ ] **Step 2: Check that Playwright still lists every test**

Run: `(cd frontend && npx playwright test --list)`
Expected: the same test names as before this task, with no syntax error.

- [ ] **Step 3: Run the tour against the local stack, if `start-dev.sh` and the seed are running**

Run: `(cd frontend && E2E_TOUR_DIR=$HOME/tour-shots E2E_MANAGER_USERNAME=ML662930 E2E_EMPLOYEE_USERNAME=AR553882 npx playwright test tour)` (if the seed's usernames differ, `python3 tools/demo.py demo` prints them).
Expected: 5 passed (2 roles x 2 widths, plus the deep-link test). Open `$HOME/tour-shots/manager-desktop-dashboard.png`, `manager-phone-dashboard.png`, `manager-desktop-project.png` and `manager-phone-project.png` (the tour names a shot after the screen key, so `PROJECT` becomes `project`) and look at them: the validator checked the colours, not the layout. If the stack isn't running, say so under "not verified"; David runs this command.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/tour.spec.js
git commit -m "Tour: check the three charts are on screen at desktop and phone width"
```

---

### Task 7: Docs, and the full verification

**Files:**
- Modify: `README.md` ("The website" section; the test counts under "Tests")
- Modify: `docs/GUIDE.md` (§3 "The website script", steps 1 and 5)
- Modify: `docs/REPOINFO.md` (§10 "The question bank", its "Frontend" list: a new question; §12 "Honest gaps, what I'd do next, and AI use", its "Gaps and next steps" list: the (d) item)
- Modify: `docs/DEMO-RUNBOOK.md` (§2 Path A, steps 1 and 5, "You should see")
- Modify: `CLAUDE.md` ("Where things stand", and "Frontend rules in practice")
- Modify: `docs/superpowers/specs/2026-10-14-dashboard-graphs-design.md` (the Status line only)

**Interfaces:**
- Consumes: the real names, test counts and file paths from Tasks 1 to 6. Re-read each doc first: the pull board edited all of them.

- [ ] **Step 1: Write the doc changes**

- **README "The website":**
  - one sentence: "Three charts, drawn with plain MUI boxes and no chart library: a deliverables timeline on each project, and a budget chart and this week's workload on the dashboard. The server sends every percentage."
  - in the `frontend/src/` tree, add `components/charts/` (the timeline, budget and workload charts, and their shared figure, row and legend) and `theme/chartColours.js` (the only chart colours, checked with a colour-blindness validator);
  - update the Vitest and pytest counts.
- **GUIDE step 1** (Dashboard): add "The workload chart at the top: Ben's bar passes the capacity line, red, '+5 h over'. Under the counts, each project's budget as a bar against its own budget." **Step 5** (Apollo): "The timeline shows when each deliverable lands, and the Today line."
- **DEMO-RUNBOOK Path A step 1:** add what to see: "Workload this week · all projects" with Ben at "45 / 40 h" and "+5 h over"; "Budget by project" with Apollo's sliver of spend. **Step 5:** "Deliverables timeline" above the cards, Design green "Done", Build "In progress 0%", Launch "Blocked". Add the spec's tip: to show Over budget live, an admin sets Zeus's budget to $2,000 first (an audited edit).
- **REPOINFO §10 Frontend:** a new numbered question: **"Why no chart library?"** "The bundle was already 698 kB, and three charts didn't need one. Each is boxes sized in percent. The server sends every percentage, so the browser never touches cents. The project colours failed a colour-blindness validator on the first try, so I changed them." Cite `frontend/src/components/charts/` and `frontend/src/theme/chartColours.js`. **§12:** add the item "(d) History charts: a burn-up chart (work done over time) and budget spent over time. Both need history the API doesn't keep (no snapshots per day or week)."
- **CLAUDE.md "Where things stand":**
  - add the three charts to "Built", with the new test counts;
  - under "Frontend rules in practice", add "chart colours come only from `src/theme/chartColours.js`";
  - list deploying the graphs under "Open items" until David has run both deploy scripts.
- **Spec Status line:** "Built 14 Oct (plan `docs/superpowers/plans/2026-10-14-dashboard-graphs.md`)."

- [ ] **Step 2: Run every check**

```bash
.venv/bin/pytest -q
.venv/bin/bandit -r ./backend -x ./backend/tracker/psycopg,./backend/tracker/psycopg_binary,./backend/tracker/psycopg_binary.libs 2>/dev/null | grep -E 'No issues identified|Severity: (Medium|High)'
(cd frontend && npm test && npm run lint && npm run build && npm audit --audit-level=high)
(cd frontend && npx playwright test --list)
git status --short
```

Expected:
- pytest passes, with 2 more tests than after the pull board;
- bandit prints `No issues identified.` (the `-x` skips the psycopg packages that `start-dev.sh` copies into `backend/tracker/`, which are gitignored and not ours; the same command as the pull-board plan);
- Vitest passes, and lint is clean;
- the build succeeds, with only the existing chunk-size warning, and the bundle grows by a few kB at most;
- `npm audit` finds 0 high;
- Playwright lists every test;
- `git status` shows only the files this task changed.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/GUIDE.md docs/REPOINFO.md docs/DEMO-RUNBOOK.md CLAUDE.md docs/superpowers/specs/2026-10-14-dashboard-graphs-design.md
git commit -m "Docs: the three charts in the README, guide, runbook and interview prep"
```

- [ ] **Step 4: Hand David the deploy order**

Report two lists, verified (with each command and count) and not verified (layout, colour in context, hover states, and the tour if the stack wasn't running). Then give David the commands to run himself, in this order: `git push origin David`, `./bin/deploy-backend.sh`, `./bin/deploy-frontend.sh`.
