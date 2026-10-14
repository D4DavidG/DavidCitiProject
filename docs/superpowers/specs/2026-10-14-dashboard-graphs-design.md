# Dashboard graphs design

Status: **Built 14 Oct (plan `docs/superpowers/plans/2026-10-14-dashboard-graphs.md`).**
Nothing here is built yet. Five changes from the chat design are marked **(changed)**;
each has its reason next to it, and David can reverse any of them with one word.

**Why:** the dashboard answers the client's questions in words and numbers today: cards,
chips, a grid of hours. Three of the questions are about shape, which a picture shows
faster: when deliverables land (question 4), how close each budget is to its limit
(question 7), and who is stretched this week and by which projects (questions 3 and 5).
The graphs add no new facts. They draw what the API already returns, so every value is
still in a list or table on the same screen.

The sketches below use the local seed's real figures (database read 14 Oct, today = 14 Oct).
The one over-budget row in the budget sketch is marked as an example: the seed has none.

## 1. Decisions

| # | Question | Answer | What it rules out |
| --- | --- | --- | --- |
| 1 | Which graphs? | **Three:** (a) deliverables timeline, (b) budget chart, (c) workload chart. (d) history charts are notes only | Pie charts, gauges, anything needing history the API doesn't keep |
| 2 | How are they drawn? | **Our own React components: plain HTML boxes sized in percent.** No chart library | Recharts, Chart.js, D3: the bundle is already 698,430 bytes (`frontend/dist/assets/index-BXPqWMMV.js`, built 14 Oct) and Vite warns about it, and a new package is a new `npm audit` surface |
| 3 | Who does the maths? | **The server, for money.** It adds `plannedPercent` and `pendingPercent`; the browser only turns server percentages into widths, as `BudgetBar.jsx` already does | Dividing cents in the browser (CLAUDE.md §9) |
| 4 | Colour rule | Colour has one job per chart: **status colours only mean state** (green done, red late or over); **project colours only mean "which project"** (chart c); everything else is navy or grey | Using red or green for a project; colour as the only signal |
| 5 | Never colour alone | Late and over carry **a word and a warning icon** ("Late", "Over budget", "+5 h over"). **(changed)** Stripes only for print and Windows high-contrast mode, see section 4 | A red bar with no words |
| 6 | Light mode only | Yes: dark mode is out of the MVP (CLAUDE.md, decision "Scope") | A dark palette now |

## 2. Current data (read 14 Oct, midday)

`ProjectDetailPage.jsx` and the projects folder are being edited by the pull-board build
right now, so those line numbers will move; the function names stay.

| Fact | Where |
| --- | --- |
| A deliverable carries `startDate`, `dueDate` (ISO `YYYY-MM-DD` strings), `completedAt`, `status`, `progressPercent` | `milestone_view`, `backend/tracker/services/views.py:64-77` |
| Status is computed: `DONE` (signed off), `BLOCKED` (waits on an unsigned dependency), `IN_PROGRESS` (a task started), `NOT_STARTED`. Progress = done estimate / total estimate, rounded down | `_decorate`, `services/milestones.py:57-72` |
| The only date rule on a deliverable is due >= start. **Nothing keeps it inside the project's dates** | `_check_dates`, `milestones.py:97-99` |
| The dependency graph returns `{nodes, edges}`: the same deliverable rows (same `decorated()` call, same order) plus edges `{from, to}`, where `from` depends on `to`. Any signed-in user who can see the project may call it | `dependency_graph`, `milestones.py:318-324`; handler `api/handlers.py:151-153`; route `api/routes.py:69` |
| The Deliverables tab loads `GET /projects/{id}/milestones` (`{items}`) and gets only `projectId`, `canManage`, `people`: **not the project's dates** | `frontend/src/pages/projects/DeliverablesTab.jsx:99-101` |
| The project page has the dates and renders the tab | `ProjectDetailPage.jsx:106` and `:117` |
| Money per project, one query: `planned_cents` (bookings), `consumed_cents` (approved time), `pending_cents` (waiting for approval) | `_money`, `services/dashboard.py:48-62` |
| `consumed_percent = consumed * 100 // budget`, `None` when there is no budget; `remaining_cents`; `planned_over_budget` | `_figures`, `dashboard.py:65-74` |
| Cards and the Budget tab both use `_figures`, so they never disagree | `project_cards` `:148`, `project_budget` `:161` |
| Cards: at-risk first, then by name; the dashboard asks for 12 per page | `dashboard.py:150`; `DashboardPage.jsx:18`, `:100-103` |
| Dashboard results are camelCased by `camelize`, so a new key needs no serializer change | `api/handlers.py:314-315`, `api/http.py:42-47` |
| A budget can be 0 (no budget), never negative | `001_init.sql:46`, `:56` |
| Allocation response: `items[]` (one per person) with `userId`, `name`, `capacityHours` (the person's, not per week), `peakOverByHours`; each person's `weeks[]` has `week`, `bookedHours`, `overByHours`, `overAllocated`, and `projects: [{projectId, name, hours}]` (server order: most hours first). The response's top-level `weeks` is only the list of week dates. Employees only; people sorted by peak "over by" across the weeks shown, then name | `allocation`, `dashboard.py:195-253` (sort at `:213`) |
| `weeks` may be 1 to 26 (default 8); with `weeks=1` the sort is by this week alone; `pageSize` is capped at 100 | `dashboard.py:203`; `services/paging.py:12` |
| The budget bar draws `consumedPercent`, a 1% sliver when spending rounds to 0, and "Over budget" from `remainingCents < 0` | `frontend/src/components/BudgetBar.jsx:13-33` |
| Money and dates become text only in `format.js`: `formatCents`, `spentPercent`, `formatDate` ("Oct 14, 2026"), `formatDay` ("Oct 14"), `todayIso` (Eastern), `addDays` | `frontend/src/services/format.js:19`, `:48`, `:92`, `:100`, `:108`, `:113` |
| Theme: primary navy `#0B3D91`, error `#C62828`, warning `#A15C00`, success `#2E7D32`; page `#F4F6F8`, cards `#FFFFFF`; text `#1F2937` / `#4B5563` | `frontend/src/theme/theme.js:11-17` |
| Status chip colours: In progress = navy, Blocked = red, Done = green, Not started = outlined grey | `components/StatusChip.jsx:12-15` |
| Phone breakpoint 899 px (react-responsive); MUI's `md` starts at 900 px, the same line | `frontend/src/theme/responsive.js:4-8` |
| The allocation cell tooltip already opens on tap (`enterTouchDelay={0}`) | `pages/allocation/AllocationPage.jsx:29` |
| The dashboard swaps its whole content for a spinner while it reloads | `components/PageState.jsx:10-16` |
| The screen tour shoots `/dashboard` and the project page (Deliverables is the default tab) at 1440 and 375 px and fails on sideways scroll | `frontend/e2e/tour.spec.js:14`, `:18`, `:60`; `ProjectDetailPage.jsx:62` |
| Local seed: Apollo $1,370 spent, $1,538 waiting, $31,976 planned of $150,000; Zeus $2,885 spent, $25,356 planned of $40,000; Hermes $0 of $80,000, nothing booked. Nobody over budget or planned over budget. This week: Ben Okafor 45 / 40 h (Apollo 25, Zeus 20), Ana Ruiz 30 / 40, Chloe Kim 30 / 40, Dev Shah 0 / 20 | `tools/demo.py:140-199`; local `postgres` database, read 14 Oct |

## 3. Server change

One edit, in `_figures` (`dashboard.py:65-74`), next to `consumed_percent` and written the
same way:

```python
"planned_percent": (money["planned_cents"] * 100 // budget) if budget else None,
"pending_percent": (money["pending_cents"] * 100 // budget) if budget else None,
```

- Whole numbers, rounded down, like `consumed_percent`. `None` (JSON `null`) with no budget.
- They can pass 100 when the bookings cost more than the budget. The seed has no such
  project (Zeus plans 63%), so the backend test builds one.
- Both the cards (`GET /dashboard/projects`) and the Budget tab
  (`GET /projects/{id}/budget`) get them, because both call `_figures`.
- On the wire they are `plannedPercent` and `pendingPercent` (`camelize`). No route,
  migration or serializer changes. Reads are not audited, so no audit change.

## 4. Shared rules for all three charts

**Marks.** Bars 12 px thick (thin, never filling the row). Rounded 4 px at the data end,
square at the zero line; a timeline bar has two data ends, so both are rounded. A **2 px
white gap** between touching segments, never a border. Reference marks (Today, Budget,
Planned, Capacity) are **2 px lines in dark ink** `#1F2937`. Gridlines are 1 px solid
`#E5E7EB`, never dashed. No fixed chart heights: each chart grows with its rows, so the
axis labels are never cut off.

**Problem marks** (late and over). **(changed)** The chat had stripes on every late or
over mark. The dataviz skill's anti-pattern list says texture must never be on by default
(dense angled fields are a vestibular risk). So by default a problem mark is error red
plus its word and a warning icon (`WarningAmberRounded`, already on the dashboard). Each
problem mark carries `data-state="late"` or `data-state="over"`, and only under
`@media print, (forced-colors: active)` does that add stripes:
`repeating-linear-gradient(45deg, ...)` in a darker step of the fill, 2 px lines every 6 px.
Stripes then mean the same thing in every chart. **(changed)** The chat allowed
"lighter/hatched" for money waiting for approval; it is lighter only, so stripes never
mean "pending" on one chart and "problem" on another.

**Text.** Labels and values use the theme's text colours, never the bar colour. Status
words ("Late", "Over budget", "+5 h over") use `error.main`, like the allocation grid
(`AllocationPage.jsx:43`); `#C62828` on white is 5.6:1. Names sit **above** their bar, so
a long name wraps (`overflow-wrap: anywhere`) and is never cut off. Percent text goes
through `spentPercent(percent, cents)` (`format.js:48`), so under 1% reads "<1%", never "0%".

**Hover and focus.** In each row, the name, the bar and the right-hand words sit in one
`Box` inside the `<li>`. That `Box` is the target: at least 24 px tall, wrapped in a MUI
`Tooltip` that opens on tap (`enterTouchDelay={0}`, as `AllocationPage.jsx:29`), focusable
(`tabIndex={0}`) so the keyboard gets the same text, with `role="img"` and an `aria-label`
holding the tooltip's sentence. The value comes first in the tooltip, then the name. React
escapes the text, so names from the API can't inject markup. Tooltips only repeat what the
list or table already shows.

**Files.** `frontend/src/theme/chartColours.js` (the colours below, each with its contrast
ratio, as `theme.js` does, plus the project-slot function), and one component per chart:
`components/charts/TimelineChart.jsx`, `BudgetChart.jsx`, `WorkloadChart.jsx`. Each file
has its test beside it (`chartColours.test.js`, `TimelineChart.test.jsx`, ...).
`git check-ignore -v` returns nothing for these paths (checked 14 Oct).

## 5. (a) Deliverables timeline

**Where:** top of the project page's Deliverables tab, above the existing cards
(`DeliverablesTab.jsx:129`). Every role that can see the project sees it.

**Form:** a Gantt-style range bar per deliverable. The job is "when does each piece happen,
and how far along is it", which is a span on a date axis with a fill for progress.

Apollo in the seed (project Sep 8 to Dec 12):

```
                      Oct 1   Today        Nov 1             Dec 1
Design                          |
[████████████████]  Done        |
Build · after Design            |
                 [░░░░░░░░░░░░░░|░░░░░░░░░░░░░░░░░]  In progress 0%
Launch · after Build            |
                                |              [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒]  Blocked
```

Zeus's one deliverable, Migration (Aug 14 to Oct 10, nothing done), shows as a red bar
with "⚠ Late, 0%".

**Data:** the tab loads `GET /projects/{id}/dependency-graph` **instead of**
`/projects/{id}/milestones`, and reads `data.nodes` where it read `data.items`. The nodes
are the same rows from the same `decorated()` call, so the cards below use them unchanged,
and `edges` give "after ...". One request, so the chart and the cards can never disagree.
The project page passes the project's `startDate` and `predictedEndDate` into the tab as
two new props with those names.

| What you see | Encodes | From |
| --- | --- | --- |
| Horizontal position | Date | `startDate`, `dueDate` |
| Bar | The planned span, start to due | the deliverable |
| Inner fill, from the left | Share done | `progressPercent` |
| Fill colour + word | State | `status`, plus "late" (below) |
| "after Design, Build" | Dependencies | names of the `to` nodes of the `edges` whose `from` is this deliverable |
| Dark vertical line, labelled "Today" | Today | `todayIso()` (Eastern) |

**Axis:** from the earlier of the project start and the first deliverable start, to the
later of the predicted end and the last due date. Hairlines and short month labels
(`formatDay`, e.g. "Oct 1") on the first day of each month inside the axis, at most 6 on
desktop and 3 on phones, skipping evenly. Positions are day counts on ISO dates, in UTC
like `addDays`: date maths, not money.

**Colours (status job, each with its word):**

| State | Rule | Fill | Track (unfilled span) | Word |
| --- | --- | --- | --- | --- |
| Done | `status = DONE` | success `#2E7D32` | `#B6D2B7` (35% tint, 1.63:1) | "Done" |
| In progress | `IN_PROGRESS` | primary navy `#0B3D91` (matches its chip) | `#AABBD8` (35% tint, 1.94:1) | "In progress 0%" |
| Not started | `NOT_STARTED` | grey `#6B7280` (4.8:1) | `#CBCED3` (35% tint, 1.58:1) | "Not started" |
| Blocked | `BLOCKED` | grey `#6B7280` | `#CBCED3` | "Blocked" |
| **Late** | not `DONE` and `dueDate < todayIso()` (ISO strings compare as dates) | error `#C62828` | `#EBB4B4` (35% tint, 1.79:1) | warning icon + "Late" + the % done |

Tracks are 35% tints (not 20%) so an unstarted bar never looks like a `#E5E7EB` gridline;
they stay under 3:1, and the dates are in the cards below. Late wins over the other three
states. Blocked stays grey here although its chip is red (`StatusChip.jsx:14`): blocked
means waiting, and in this chart red means "a date was missed". See Risks.

**(changed) Today line** is dark ink, not red as in the chat: red already means "late" in
this chart, and a red line crossing a red late bar reads as one mark. The word "Today"
labels it.

**Tooltip:** "0% done · Build · Oct 3 – Nov 12, 2026 · In progress · after Design"
(`formatDay` for the start, `formatDate` for the due date).

**Edge states:**

| Case | Behaviour |
| --- | --- |
| No deliverables | No chart; the existing "No deliverables yet." stays |
| Deliverable outside the project's dates | The axis stretches to include it, and its row adds "Outside project dates" in grey text (`text.secondary`) |
| Start = due (one day) | Drawn at least 8 px wide |
| Today outside the axis | No Today line; the caption says "Today is before the start" or "Today is after the end" |
| No tasks yet | Server sends 0% (100% when signed off); the bar shows only its track |
| Very long names | Wrap above the bar; the bar keeps its full width |
| Archived project | Same chart, read-only, like the rest of the tab |

## 6. (b) Budget chart

**Where:** Dashboard, between the stat tiles and the cards (`DashboardPage.jsx:123-127`),
full width, inside the same `PageState`, so it sits under the search and status filters
it follows. Managers and admins only, as the dashboard already is.

**Form:** one bullet-style bar per project, each scaled to its **own** budget. The job is
"how close is each project to its limit", a part of a whole against a target, so each row
is 0 to 100% of that project's budget. Comparing dollars between projects is not the job;
the label carries the dollars.

```
                      0%          50%        100% Budget   125%
Apollo                                        |
[▌▒       |                                   |              $1,370 of $150,000
Zeus                                          |
[████          |                              |              $2,885 of $40,000
Hermes                                        |              $0 of $80,000
Example (not in the seed)  ⚠ Over budget      |
[█████████████████████████████████████████████|█████████▸   $52,900 of $40,000 · Planned 230%
Example · No budget set · $1,370 spent
```

`█` spent, `▒` waiting for approval, `|` inside a row the Planned tick.

**Data:** the same `GET /dashboard/projects` response as the cards. No extra request, same
rows, same order (at risk first), same page and filters.

| What you see | Encodes | From |
| --- | --- | --- |
| Solid bar from 0 | Spent (approved time) | `consumedPercent`; 1% sliver if `consumedCents > 0` but the percent is 0 |
| Lighter bar after a 2 px gap | Waiting for approval | `pendingPercent`, starting at `consumedPercent`; same sliver rule with `pendingCents` |
| Dark tick, 2 px by 20 px | Planned cost (bookings) | `plannedPercent` |
| Dark line at 100%, full chart height, labelled "Budget" once at the top | The budget | fixed |
| Right label | Spent of budget | `formatCents(consumedCents)` of `formatCents(budgetCents)` |

**Scale:** every row runs 0 to 125%, so rows line up and "over" has room to show. Past
125% a bar or tick stops at the edge with a small arrow (▸), and the label gives the real
figure ("Planned 230%"). Adding the two percentages to place the lighter bar is position
only; no cents are touched in the browser.

**Colours:** spent navy `#0B3D91` (10:1, the colour of today's budget bar); waiting navy at
35% (`#AABBD8`, 1.94:1, a lighter step of the same hue, the "meter" rule; the legend and
tooltip carry it); track `#EEEEEE`, as `BudgetBar.jsx:32`. **Over budget**
(`remainingCents < 0`, the server's figure, as `BudgetBar.jsx:15`): the spent bar turns
error red and the row shows the warning icon and the words "Over budget". The words carry
it even when the bar barely passes 100% (the percent rounds down, so $5 over can still
read 100%). "Planned over budget" (from `plannedOverBudget`) shows as words under the row,
as the card does today.

**Legend** (always; 4 entries): solid navy swatch "Spent", light swatch "Waiting for
approval", line key "Planned", red swatch with the warning icon "Over budget".

**Tooltip:** "$1,370 spent (<1%) · $1,538 waiting (1%) · $31,976 planned (21%) · budget
$150,000 · Apollo".

**Edge states:**

| Case | Behaviour |
| --- | --- |
| No budget (`budgetCents = 0`, percents `null`) | Name and "No budget set · $1,370 spent"; no bar |
| Nothing spent | Empty track, the Planned tick, "$0 of $150,000" |
| Nothing planned (Hermes in the seed) | No tick; tooltip says "nothing planned" |
| More than 125% | Arrow at the edge; the label carries the number |
| No projects on the page | No chart; the page's existing "No projects to show." |
| Long names | Wrap above the bar |

## 7. (c) Workload chart

**Where:** **(changed)** Dashboard, directly under the page header and **above** the
search and status filters, full width, with the heading "Workload this week · all
projects". The chat put it beside (b), under the filters, but it ignores them (the
allocation API has no project filter), and the dataviz anti-pattern list says a filter row
must sit above only what it scopes. Managers and admins only.

**Form:** one stacked horizontal bar per person, for **this week**. The job is "who is past
capacity, and which projects put them there": a part-to-whole (projects within a person's
hours) against a limit (capacity). Horizontal because names are long.

```
                0h          20h          40h          60h
Ben Okafor  ⚠ +5 h over                   |
[███████████████████▌███████████████|████]                45 / 40 h
Ana Ruiz                                  |
[███████████████████████                  |                30 / 40 h
Chloe Kim                                 |
[███████████████████████                  |                30 / 40 h
Dev Shah · Not booked     |                                 0 / 20 h
 ■ Apollo  ■ Zeus  ■ Over capacity  | Capacity
```

**Data:** its own request, `GET /dashboard/allocation?weeks=1&pageSize=8`. With one week
the server's "worst first" sort is by this week (`dashboard.py:213`). Under the chart, a
link: "All people and weeks in Allocation". For each person `p` in `items`, the chart reads
`p.weeks[0]` (this week) and `p.capacityHours`.

| What you see | Encodes | From |
| --- | --- | --- |
| Bar length, shared hour axis | Hours booked this week | `p.weeks[0].bookedHours` |
| Segments, 2 px gaps | Hours per project | `p.weeks[0].projects[].hours` |
| Segment colour | Which project | `p.weeks[0].projects[].projectId`, fixed palette below |
| Dark line, 2 px, per row | That person's capacity | `p.capacityHours` |
| Red part past the line + warning icon + "+5 h over" | Over capacity | `p.weeks[0].overByHours`, `p.weeks[0].overAllocated` |
| Right label | "45 / 40 h" | `bookedHours` / `capacityHours` |

**Axis:** one hour scale for every row, 0 to the larger of the biggest booking and the
biggest capacity, rounded up to the next 20 h; ticks every 20 h (seed: 45 h, so 0 to 60 h).

**Order inside a bar:** projects in palette-slot order, then Other, so a project sits in
the same place in every bar. Segments fill up to the capacity line; whatever is past it is
drawn as one red segment (`overByHours` wide). The tooltip still lists every project's
full hours.

**Project colours (categorical job).** Assigned by `projectId`, lowest first, among the
projects in the chart; **never by rank or size**, so reordering people never repaints a
project. Projects 6 and later fold into **Other** (light grey), named in the legend with a
count ("Other (2)") and listed in full in the tooltip.

**(changed) 5 colours, not 6.** The validator showed that six distinct colours that
avoid red and green can't all be told apart (results below), so it is 5 project colours
plus Other: six classes in all.

| Slot | Hue | Hex | Contrast on white | Note |
| --- | --- | --- | --- | --- |
| 1 | blue | `#1c5cab` | 6.63:1 | |
| 2 | aqua | `#199e70` | 3.41:1 | |
| 3 | violet | `#9085e9` | 3.13:1 | |
| 4 | magenta | `#e87ba4` | 2.69:1 | below 3:1: legend + tooltip + Allocation table are the relief |
| 5 | yellow | `#eda100` | 2.17:1 | below 3:1: same relief |
| Other | grey | `#D1D5DB` | 1.47:1 | deliberately quiet; the row's "45 / 40 h" label gives the length |

The five project colours are steps from the validated reference palette (`dataviz`
skill, `palette.md`), so none is hand-mixed; Other is a neutral grey, not a hue. Red,
green and orange are left out: red and green are status, and orange measured ΔE 14.1 from
error red, too close beside the red "over" segment. All five are at least ΔE 20 from error
red with normal vision and 9.8 under deuteranopia (aqua, the closest).

**Why checked "all pairs":** a person's bar only shows their own projects, so any two slots
can end up touching (slot 1 next to slot 3). The skill's default "adjacent only" test
assumes slots always appear in order, which isn't true here.

**Validator runs** (`validate_palette.js` from the `dataviz` skill, run 14 Oct and re-run
in review the same day with identical output). First try, the six non-status hues of the
reference palette, all pairs on the white card:

```
node validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#6250d6" --mode light --surface "#FFFFFF" --pairs all
Palette (light, surface #FFFFFF, categorical): 6 slots
  [PASS] Lightness band         all 6 inside L 0.43–0.77
  [PASS] Chroma floor           all 6 >= 0.1
  [FAIL] CVD separation         worst all-pairs #6250d6↔#2a78d6 ΔE 4.5 (deutan) · tritan 5.8
  [FAIL] Normal-vision floor    worst all-pairs #6250d6↔#2a78d6 ΔE 10.5 (normal) — below 15, hard to tell apart even with full color vision
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#1baf7a",2.82],["#eda100",2.17],["#e87ba4",2.69]]
  → FAILED — fix the marked checks
```

Fix: dropped orange, and snapped blue, aqua and violet to other documented steps
(blue 550, the aqua and violet dark-column steps), searching every 4- and 5-colour set for
the best worst pair. Final palette, on the card (`#FFFFFF`):

```
node validate_palette.js "#1c5cab,#199e70,#9085e9,#e87ba4,#eda100" --mode light --surface "#FFFFFF" --pairs all
Palette (light, surface #FFFFFF, categorical): 5 slots
  [PASS] Lightness band         all 5 inside L 0.43–0.77
  [PASS] Chroma floor           all 5 >= 0.1
  [PASS] CVD separation         worst all-pairs #e87ba4↔#199e70 ΔE 8.3 (protan) · tritan 5.8
  [PASS] Normal-vision floor    worst all-pairs #e87ba4↔#9085e9 ΔE 17.2 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#e87ba4",2.69],["#eda100",2.17]]
  → ALL CHECKS PASS
```

(The tool also prints two fixed note lines after the verdict; they are left out here.)
The adjacent run on `#FFFFFF` passes too (worst CVD 11.3, normal 17.2). On the page
background `#F4F6F8` the results are the same except contrast: violet 2.89, magenta 2.49,
yellow 2.00, all relieved the same way. The charts sit on white cards, so `#FFFFFF` is the
surface that counts. Other grey `#D1D5DB` against the five: at least ΔE 20.1 normal and
15.0 colour-blind (checked with the same functions).

**Legend:** always shown: one swatch per project in the chart, "Other (n)" if any, a red
swatch with the warning icon "Over capacity", and a line key "Capacity".

**Tooltip:** "45 h booked, capacity 40 h · Apollo 25 h, Zeus 20 h · Ben Okafor".

**Edge states:**

| Case | Behaviour |
| --- | --- |
| Everyone under capacity | No red; the caption says "No one is over capacity this week." |
| Someone not booked | "Not booked" next to the name, the capacity line only, "0 / 20 h" (Dev Shah in the seed) |
| No employees | No chart; "No employees to show." (the allocation page's words, `AllocationPage.jsx:120`) |
| More than 5 projects | The rest are "Other (n)" |
| Overtime allowed | Booked hours past capacity still show as over; this chart is bookings, not logged time |
| Long names | Wrap above the bar; legend items wrap |

## 8. Accessibility

- Every chart is a `<figure>` with a heading and a one-line summary built from server
  values, e.g. "0 of 3 projects are over budget." and "1 person is over capacity this
  week: Ben Okafor, +5 h."
- Rows are a `<ul>`; each row's target `Box` is described in section 4 (`role="img"`,
  `aria-label`, `tabIndex={0}`). Gridlines, ticks and stripes are `aria-hidden`.
- Every value is also in text on the same screen: the deliverable cards under (a), the
  project cards under (b), and the Allocation page for (c).
- Never colour alone: late and over have words and a warning icon; every chart with more
  than one colour has a legend; reference lines are labelled.
- Contrast: names and values use theme text colours (13.5:1 and 7.0:1), status words error
  red (5.6:1). Mark colours are in the tables above; the ones under 3:1 are relieved by
  legend, tooltip and table.
- No animation, so nothing to switch off for reduced motion.
- Bars set `forced-color-adjust: none`, so Windows high-contrast mode still shows them,
  and that mode adds the stripes (section 4); the words carry the state either way.

## 9. Phone layout (375 px)

- (b) and (c) are full width at every size, so nothing changes at the breakpoint.
- Names and labels above each bar, so bars use the full width. All widths are percentages
  (only minimum widths, like the 8 px one-day bar, are in pixels), so no sideways page
  scroll (the tour checks this, `tour.spec.js:60`).
- The timeline shows at most 3 month labels on phones (`useIsMobile()`); the right-hand
  words drop under the bar.
- Tooltips open on tap.

## 10. Tests

| Layer | Tests |
| --- | --- |
| Backend (`tests/backend/test_dashboard.py`) | Add `planned_percent` and `pending_percent` to the card-equals-Budget-tab loop at `:70`. With the fixture's budget of 5,000,000 cents: planned 25, pending 0. With Apollo's budget changed to 900,000 cents: pending 0 (4,807 cents is 0.53%, so this proves rounding down, not to nearest) and planned 140 (planned over budget passes 100). Budget 0 gives `None` for both |
| `chartColours.test.js` | Same projects in any order get the same colours; colour depends on `projectId`, not on hours; the 6th project and later become Other |
| `TimelineChart.test.jsx` | One row per deliverable with its name and "after ..."; fill width = `progressPercent`; a past-due, unsigned deliverable shows "Late", the warning icon and `data-state="late"`; DONE shows "Done"; the Today line and its label; the axis stretches for a deliverable outside the project; tooltip text on focus; the figure's summary |
| `BudgetChart.test.jsx` | Rows in card order; spent, waiting and planned positions from the server percents; the sliver for spending under 1%; "Over budget", the icon and `data-state="over"` when `remainingCents < 0`; "No budget set" with null percents; the arrow and real number past 125%; legend entries; summary |
| `WorkloadChart.test.jsx` | Rows in server order; one segment per project with its colour; the capacity line; "+5 h over", the icon and the red over segment; "Other (n)" with 6+ projects; "Not booked"; "No one is over capacity this week."; legend; tooltip lists every project's hours |
| Page tests | `DashboardPage.test.jsx` shows both charts, the workload chart above the filters, and requests `weeks=1`; `ProjectDetailPage.test.jsx` switches its `GET /projects/1/milestones` mocks (`:15`, `:57`) to `/dependency-graph` returning `{nodes, edges}` |
| Browser (Playwright) | The tour's existing `/dashboard` and project-page shots at 1440 and 375 now include the charts, and its sideways-scroll check covers them. Look at the shots: the validator checks colour, not layout |

## 11. Build order

Subagent-driven, after the pull board is finished and committed, one task each:

1. Backend: the two percentages and their tests.
2. Timeline (a), with `chartColours.js` and the print/high-contrast stripe style.
3. Budget chart (b).
4. Workload chart (c).
5. Docs: README architecture notes, `docs/GUIDE.md` demo lines, and (d) in
   `docs/REPOINFO.md` section 12 ("Honest gaps, what I'd do next, and AI use").

## 12. Out of scope

- A chart library (decision 2).
- Dark mode, so no dark palette run (decision 6).
- **(d) History charts**, to go in `docs/REPOINFO.md` section 12: a burn-up chart (work
  done over time) and budget spent over time. Both need history the API doesn't keep (no
  snapshots per day or week).
- Zoom, export or print, and filters of the charts' own.
- Keeping the old picture on screen while the dashboard reloads: the whole page shows the
  spinner today (`PageState.jsx:10-16`), and the charts follow it.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| The pull-board build is editing `ProjectDetailPage.jsx` and the projects folder now | Start after it is committed; re-read the line numbers then |
| Switching the tab to `/dependency-graph` breaks the existing mocks in `ProjectDetailPage.test.jsx` | Expected; update them in the same task |
| Blocked is grey on the timeline but red on its chip | Say it: "Red means a date was missed; blocked is waiting." Changing the chip is a separate decision |
| (c) ignores the dashboard's search and status filters; (b) follows them | (c) sits above the filters, with "all projects" in its heading |
| A project's colour can change if a lower-id project leaves this week's chart | Colour never follows size or rank; this only happens when the bookings themselves change |
| Project blue in (c) is close to the navy "spent" in (b) (ΔE 9.5), on the same page | Each chart has its own legend and heading, and they are not side by side |
| Aqua `#199e70` is near success green (ΔE 10.7) | They never share a chart: green is only in (a) |
| The seed has no project over budget, planned over budget or without a budget, so the red states and "No budget set" don't show in the demo | They are covered by the Vitest tests. To show over budget live, an admin can set Zeus's budget to $2,000 in the app before the demo (an audited edit): $2,885 spent and $25,356 planned are then both over |
| The bundle grows a little | Three small components, no package; no change to the existing size warning |

## 14. How to explain it

- **"Three pictures, no new facts.** Each graph draws what the API already sends, and the
  same numbers are in a list on the same screen."
- **"The server still does all the money.** It sends percentages; the browser only turns a
  percentage into a width."
- **"Colour has one job.** Green and red only mean done and late or over, always with a
  word and a warning icon. Project colours were checked with a colour-blindness
  validator, and the first set failed, so I changed it."
- **"No chart library.** The bundle was already 698 kB; three small components were enough."
