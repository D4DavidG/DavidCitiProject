# Dashboard counts: total projects and at risk across every page (design)

Written 14 Oct from David's note "total number of projects" and the known bug listed in
`docs/OVERNIGHT-REPORT.md` and `docs/REPOINFO.md` ("the At risk counter counts one page").
Built in the same run (controller ruling: no wait for review). Plan:
`docs/superpowers/plans/2026-10-14-atrisk.md`.

## 1. What and why

The dashboard shows two counters above the project cards
(`frontend/src/pages/dashboard/DashboardPage.jsx:150-151`):

- "Projects shown" = `data.total`, the server's count for the current search and status.
  Correct, but the label reads like "cards on this page".
- "At risk" = `items.filter((p) => p.atRisk).length`, **the current page only** (12
  cards). With 30 projects and 7 at risk, page 3 can say "At risk 0". Wrong.

The fix: `GET /dashboard/projects` also returns **`atRiskTotal`**, the number of at-risk
projects across every page for the same scope and filters, and the two tiles become
**Total projects** and **Total at risk**, both read from the server.

It costs no extra query. `project_cards()` already computes every card in scope (risk is
worked out in Python by `_risk_reasons()`, then `page_of()` slices one page), so the count
is `sum(card["at_risk"] for card in cards)` taken before the slice.

## 2. Decisions

| Decision | Rejected alternative, and why |
| --- | --- |
| One extra key, `atRiskTotal`, beside the standard `{ items, page, pageSize, total, totalPages }` | A new `GET /dashboard/counts` route: a 70th route and a second request for one number, which could disagree with the cards if data changes between the two calls |
| The handler adds the key the way `allocation` already adds `weeks` (`api/handlers.py:347-348`): `{**_page(result, camelize), "atRiskTotal": ...}` | Changing `_page()` or `page_of()` for every list: only this list has a risk count |
| Counted in Python from the cards already built | Counting in SQL: risk is not a column, it comes from dates, deliverables and money in `_risk_reasons()`; duplicating that in SQL would let the tile and the cards disagree |
| Same scope and filters as the cards: live projects only, managers see their own, `search` and `status` apply | Ignore the filters (like `GET /dashboard/at-risk`): then "Total at risk 3" sits above a search that shows one card, which looks like a bug |
| Website reads `GET /dashboard/projects` only, not `/dashboard/at-risk` | Calling `/dashboard/at-risk` and counting: it ignores search and status, so the tile would not match the cards |
| Labels **Total projects** and **Total at risk**; when a search or status filter is set, one line under the tiles: "Counts are for the current search and status." | "Projects shown" (sounds like this page), or "Projects (all pages)" (clunky to say aloud). The note keeps "Total" honest when a filter narrows it |
| No fallback in the browser if `atRiskTotal` is missing | Falling back to the page count: it would hide the bug again if the website is deployed without the backend. Deploy order is already "backend and website together" (tokens) |

## 3. Changes

**Service.** `services/dashboard.py`, `project_cards()`: after sorting,
`return {**page_of(cards, page, page_size), "at_risk_total": sum(c["at_risk"] for c in cards)}`.
Docstring gains: "at_risk_total counts every page, not just this one."

**Route and handler.** Same route (`GET /dashboard/projects`, STAFF, 69 routes
unchanged). `api/handlers.py`, `project_cards()`: build `result` once, return
`{**_page(result, camelize), "atRiskTotal": result["at_risk_total"]}`. No migration, no
new error, nothing audited (it is a read).

**Website.** `DashboardPage.jsx`: the two `Stat` tiles become
`<Stat label="Total projects" value={data?.total ?? 0} />` and
`<Stat label="Total at risk" value={data?.atRiskTotal ?? 0} color="error.main" />`; the
filter note renders when `search || status`. The budget chart still uses the page's
items (it charts the cards you can see; unchanged).

## 4. Error cases (unchanged, listed so nothing is assumed)

- Employee calls the route: 403 by the route's roles, as today.
- Bad `status`: 400 from `values.choice`, as today.
- A page past the last one: empty `items`, but `total` and `atRiskTotal` still count
  everything. The website resets to page 1 on any filter change, so it never asks for one.
- No projects in scope: `total` 0, `atRiskTotal` 0; the website shows "No projects to
  show." and no tiles, as today.

## 5. Tests that prove it

| Layer | Test | Fails today because |
| --- | --- | --- |
| Service (`test_dashboard.py`) | `test_at_risk_total_counts_every_page_not_just_this_one`: three projects, two at risk, page size 1; page 3 holds the one healthy card and still says `at_risk_total == 2`; a search narrows it | the key does not exist (and a per-page count would give 0 on page 3) |
| Service | `test_at_risk_total_follows_the_managers_scope`: Bob (manager) sees only his own | the key does not exist |
| API (`test_api_read_walk.py`) | the existing `/dashboard/projects` walk also asserts `board["atRiskTotal"]` with `pageSize=1` equals the at-risk count of the full list | the wire key does not exist |
| Website (`DashboardPage.test.jsx`) | `counts every project and every at-risk project, not just this page`: a page of 2 cards (1 at risk) with `total: 30, atRiskTotal: 7` shows 30 and 7 | the page counts its own cards, so it shows 1 |
| Website | `says the counts follow the filter`: no note at first; after a search the note appears | no note exists |

Mutation check, done during the build: change the service to count `page["items"]` and the
page-3 assertion must fail.

## 6. Docs that change

- `docs/REPOINFO.md`: answer 10 ("Total number of projects?") rewritten with the new
  labels and line numbers; the "At risk counter counts one page" line in the known-gaps
  list removed.
- `docs/OVERNIGHT-REPORT.md`: the "small things noted but not fixed" bullet marked fixed
  on 14 Oct.
- `docs/DEMO-RUNBOOK.md` and `CLAUDE.md` ("Where things stand"): add the counters to the
  "not on AWS yet" list.
- `README.md`: question 2's row mentions `atRiskTotal`.
- `tools/tracker.http`: the dashboard request's comment mentions `atRiskTotal`.
- Test counts in the docs are left to the checkpoint step (19:50 ruling).
