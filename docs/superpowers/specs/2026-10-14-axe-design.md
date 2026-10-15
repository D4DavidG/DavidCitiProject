# Accessibility scan in the browser tests: design

Approved by David, 14 Oct evening. Plan: `docs/superpowers/plans/2026-10-14-axe.md`.

## 1. What and why

Evaluators may ask "did you run Lighthouse or an accessibility scan?". Today the answer is
"no" (`docs/REPOINFO.md` question 19). **axe** (axe-core, by Deque) is the rule engine
behind most accessibility scanners, Lighthouse's accessibility score included. Its
Playwright wrapper, `@axe-core/playwright`, runs it inside the page a Playwright test has
open and returns a list of rule violations, each with the elements that broke it.

The screen tour (`frontend/e2e/tour.spec.js`) already opens every screen a manager and an
employee can reach, at desktop and phone width, waits for the data to load, and checks
for sideways scrolling. The scan goes **into that same loop**: one more check per screen,
with no new test and no second walk through the app. Lighthouse was dropped by David: it
would run the same axe rules a second time, so Playwright plus axe is the one browser
testing tool.

**What a probe found (14 Oct, axe-core 4.13.0 injected into the running local app, all 21
tour screens for Maria and Ana at both widths, plus the sign-in page; read-only):**

| Rule (impact) | Where | Cause |
| --- | --- | --- |
| `list` (serious) | Every desktop screen (21 of 21) | The side menu (`components/AppLayout.jsx:18-30`): MUI `List` renders a `<ul>` whose children are `<a>` links (`ListItemButton component={NavLink}`). A `<ul>` may only hold `<li>`, so a screen reader can't announce "list, 9 items". Phone screens pass only because the menu is closed; open, it has the same fault |
| `color-contrast` (serious) | `/allocation`, both widths, 10 cells | Weeks with nothing booked show "0 / 40 h" in `text.disabled` (`pages/allocation/AllocationPage.jsx:40`): `#9e9e9e` on white, **2.67:1**; WCAG AA needs 4.5:1 for normal text |

Nothing else at WCAG A/AA, including 2.2 AA. The sign-in page is clean. Moderate and
minor findings from axe's non-WCAG "best-practice" rules (`heading-order`, `region`,
`empty-table-header`, `landmark-one-main` on the sign-in page) are out of scope (section 2).

## 2. Decisions (with the alternative rejected)

| Decision | Rejected alternative, and why |
| --- | --- |
| **Scan inside the tour loop** in `tour.spec.js`, after the existing waits (spinners gone, network idle, pointer parked, no tooltip) and before the screenshot | A separate `a11y.spec.js` walking the same screens: a duplicate test, twice the run time, and two lists of screens to keep in step |
| **`@axe-core/playwright` 4.13.0** as a devDependency (latest stable, published 11 Aug 2026; its only dependency is `axe-core ~4.13.0`) | Injecting `axe.min.js` by hand with `page.addScriptTag`: works (the probe did it), but the wrapper is the documented way and handles frames |
| **Tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`**: every WCAG A and AA rule axe has | WCAG 2.0 only: the probe shows 2.1 and 2.2 add no failures today, and 2.1 AA is the level US accessibility rules usually cite. Adding `best-practice`: those are not WCAG requirements and today give only moderate or minor items |
| **Fail on `serious` and `critical` only**, as David approved; moderate and minor are not failures | Fail on everything: there are no moderate or minor WCAG findings today, so this changes nothing now, but it would turn small advice into red builds later |
| **Collect every violation, assert once at the end**, like the overflow list (`expect(problems).toEqual([])`), each entry `"<screen>: <rule> (<impact>, N elements: <first selector>)"` | Fail on the first screen: one run would show one problem at a time |
| **Also scan the sign-in page** (signed out, once per test) **and, at phone width, the open menu** on the first screen | Only the tour's listed screens: the tour also visits the sign-in page, and the phone menu holds the same list fault as the desktop menu |
| **Fix the menu with `ListItem disablePadding` around each link** (`<li>` inside `<ul>`, MUI's documented pattern) | `<List component="div">`: valid HTML, but a screen reader no longer hears "list, 9 items" |
| **Fix the empty-week text with `text.secondary`** (`#4B5563`, 7.6:1 on white; the theme already uses it for quiet text) | Darkening the theme's `text.disabled`: it would change every disabled control, which should look disabled and are exempt from contrast rules anyway |
| **No rule excluded.** If one ever must be, `.exclude(selector)` or `.disableRules([id])` on that one call, with a one-line reason | Disabling `color-contrast` or `list` wholesale: hides the next real fault too |
| **`tools/test-all.sh` gets its own summary row, "Accessibility (axe)"**, read from the Playwright log (tour tests passed or failed) | A separate Playwright run for axe: the tour already runs in step 6 |
| **Light theme only** | Dark mode is out of the MVP (`theme/theme.js:5`) |

## 3. Data, route and UI changes

- **Data, routes:** none. No migration, no backend change, no Lambda cold start.
- **UI:** two small fixes, no visible layout change.
  - `components/AppLayout.jsx` `NavList`: each `ListItemButton` is wrapped in
    `<ListItem key={to} disablePadding>`; the `key` moves to the `ListItem`. Same look
    (the `mx`, radius and active colours stay on the button).
  - `pages/allocation/AllocationPage.jsx:40`: `'text.disabled'` becomes `'text.secondary'`.
- **Tests:** `frontend/e2e/tour.spec.js` gains `AxeBuilder`, a `TAGS` constant, a
  `scan(page, where, problems)` helper (about 10 lines) and three calls (sign-in page,
  each screen, phone menu). The tour's test title becomes "every screen renders without
  sideways scrolling or serious accessibility problems (axe)".
- **Packages:** `@axe-core/playwright` 4.13.0 in `devDependencies`; `npm audit
  --audit-level=high` must still report 0.
- **`tools/test-all.sh`:** a new summary row (section 5).

## 4. Error cases

| Case | What happens |
| --- | --- |
| A future change brings a serious or critical WCAG fault on any toured screen | The tour test for that role and width fails, listing every screen, rule, impact, count and the first element's selector |
| A fault only at phone width (or only desktop) | Caught: both widths are scanned for both roles |
| A fault inside a dialog, a tooltip, or a screen the tour does not open (admin screens, forms) | **Not caught.** The tour opens no dialogs and has no admin role. Listed in TESTING.md as not covered |
| The tour is run against AWS before David deploys the website | Fails on `list` and `color-contrast`: the fixes are local until `./bin/deploy-frontend.sh`. Expected; the runbook says to deploy first |
| A page is scanned while still loading | Avoided by order: the scan runs after the tour's existing waits (no loading spinner, network idle) |
| A rule misfires on something that is not a real fault | Exclude that one element or rule on that one call, with a one-line reason in the code; never wholesale |

## 5. Tests that prove it

1. **The scan itself, red first.** Add the scan before either fix: the four tour tests
   fail, listing `list` on every desktop screen and `color-contrast` on `/allocation`
   (and `list` on the open phone menu). That run is the failing test for both fixes.
2. **Vitest, menu structure:** `AppLayout.test.jsx`, `it('puts each menu link in its own
   list item, so screen readers hear a list')`: inside the `navigation` named "Main
   menu", the number of `listitem`s equals the number of `link`s, and every link's
   `closest('li')` is not null. Fails today: no `listitem` exists.
3. **Contrast:** no jsdom test (jsdom computes no real colours or layout). The proof is
   the tour scan going from red to green on `/allocation`.
4. **Green:** the four tour tests pass with the fixes; the existing `AppLayout` and
   `AllocationPage` component tests still pass; lint clean; `npm audit
   --audit-level=high` reports 0.
5. **`tools/test-all.sh`:** run once; the summary shows "Accessibility (axe)  PASS  4 tour
   tests, 50 scans (48 before the Schedule screen joined the tour), no serious or critical WCAG problems".

What the tests can't prove: what a screen-reader user actually hears, keyboard order, or
anything axe has no rule for. That stays in "not verified".

## 6. What docs change

- `docs/TESTING.md`:
  - section 1, Browser tests row: the tour also runs axe on every screen;
  - a short "Accessibility scan (axe)" subsection: what it checks (WCAG 2.0 to 2.2 A and
    AA rules that a machine can decide: contrast, names on buttons, links and fields,
    labels, list and table structure, valid ARIA, page language), serious and critical
    fail; what it can't: automated scanners find roughly a third to half of
    accessibility problems; screen readers (NVDA, VoiceOver) are untested; keyboard order
    and focus are checked only where other tests press Tab; dialogs, tooltips and admin
    screens are not scanned; the moderate best-practice items found;
  - section 5, "Why these tools": Playwright plus axe, not Lighthouse (Lighthouse runs the
    same axe rules; no duplicate tests);
  - section 6: the new summary row.
- `docs/REPOINFO.md` question 19: from "Not built" to built: axe in the tour, what it
  found and fixed (the menu list and the empty-week contrast), what it can't catch,
  Lighthouse dropped on purpose.
- `docs/DEMO-RUNBOOK.md` (tour command, near line 358): the tour now also scans with axe;
  against AWS it passes only after `./bin/deploy-frontend.sh`.
- `CLAUDE.md`: "Where things stand" tour line (screenshots and axe) and the frontend
  packages line (`@axe-core/playwright`).
- Test counts: left to the checkpoint after this item, per the 19:50 ruling.
