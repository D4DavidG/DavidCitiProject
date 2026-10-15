# Redesign: forest green and gold, search everywhere, a timeline home page

David's notes (14 Oct, night, "Big changes to ACME Project Manager") asked for these, "mostly
frontend". Built on branch `David3`; the deployed `545f991` stays the demo fallback. Where the
notes were ambiguous, the ruling is written here so it can be corrected.

## 1. Look and feel

- **Colours.** Forest green with gold-yellow highlights (David, 14 Oct night: gold yellow, not
  orange), styled like Float: calm, readable, plenty of space.
  - **Light mode:** page background light grey with a faint graph-paper grid; cards white;
    accent dark forest green; buttons forest green with white text; gold yellow for highlights
    (the logo's shine, the "today" line, focus accents), never for status and never as text
    on a light background (it can't reach 4.5:1 there). On light backgrounds a highlight line
    or marker uses a deep gold that reaches 3:1 against its surface, or a bright gold with a
    dark green edge; in dark mode a bright gold, which reads well on dark green.
  - **Dark mode:** dark green background, the same faint grid; neutral grey accent; buttons
    white with forest green text.
  - **Header bar:** dark green in light mode, light grey in dark mode.
  - Every text and button colour pair passes WCAG AA (4.5:1 for text, 3:1 for large text and
    UI parts), noted beside each token in `theme/theme.js`, as today. Status colours (error,
    warning, success) stay distinct from the forest green primary and pass in both modes.
  - Chart colours: a dark-mode set, validated against the dark surface (the dataviz
    validator: `node /tmp/claude-1980801627/bundled-skills/2.1.296/104329731c503dd23a1df9f189adfae9/dataviz/scripts/validate_palette.js "<hex,...>" --mode dark`), next to the light set in `theme/chartColours.js`.
- **Sharp corners.** `shape.borderRadius` 0 across cards, buttons, fields, chips, dialogs and
  chart bars ("sharp angles, not soft squares").
- **Dark mode switch.** A sun/moon button in the header and on the sign-in page
  (`aria-label` "Switch to dark mode" / "Switch to light mode"). First visit follows the
  system setting (`prefers-color-scheme`); the choice is remembered in `localStorage`
  (every access in try/catch, as the rules require). This replaces "dark mode is out of the
  MVP" in `CLAUDE.md`.
- **Logo.** `components/AcmeLogo.jsx`, inline SVG: the word ACME in dark green (light grey
  or white in dark mode), the **A** a little taller than the other letters, with a small
  gold shine at its tip ("acme" means the high point). `role="img"`, `<title>ACME</title>`.
  Also the browser tab icon (`frontend/public/`, `index.html`).
- **Sign-in page.** Desktop: the logo large on the left with one line under it ("Project
  tracker: status, people, deliverables and budget in one place"), the sign-in card on the
  right. Phone: the logo smaller, on top, the card below. Change-password shares the layout.
- **Sidebar.** Collapsible on desktop: a button at its foot ("Collapse menu" / "Expand
  menu") shrinks it to icons only (about 64 px), each icon with a tooltip and its label as
  the accessible name; the choice is remembered (try/catch). Phones keep the drawer.

## 2. Search: on every list, live, server side

- **Rule kept:** search is server side and paginated (CLAUDE.md "Search and filter").
- **One component,** `components/SearchField.jsx`: filters as you type (300 ms debounce),
  sends `q`, goes back to page 1, a clear button, `aria-label` "Search <things>". It sits at
  the top of each list, under the page header.
- **New `q` parameters** (case-insensitive substring, `ILIKE`, values always parameters,
  same pattern as `services/users.py:297`):

  | Route | `q` matches |
  | --- | --- |
  | `GET /me/tasks`, `GET /me/ready-tasks` | task title, deliverable name, project name |
  | `GET /approvals/time-entries` | person's name, task title, project name |
  | `GET /project-requests` | request name, requester's name |
  | `GET /notifications` | message text |
  | `GET /admin/audit-log` | actor's name, entity type, action |

  `GET /project-requests` also takes `scope`: `sent` (requests you sent) or `decide`
  (requests you may decide, i.e. not your own); without it, both, as today. The Requests
  page's two tabs use it, so each tab stays server-side paginated.

  Existing: `GET /users` and `GET /projects`. People's search becomes live (it already
  searches on the server).
- `docs/openapi.json` regenerated (`.venv/bin/python tools/openapi.py`).

## 3. Pages

- **Home pages (the first page you land on) show a timeline of each of your projects first,**
  then the rest:
  - **New route `GET /dashboard/timeline`** (any signed-in user; standard list shape
    `{items, page, pageSize, total, totalPages}`, default pageSize 10): the caller's
    projects (admin: every live project; manager: the projects they manage; employee: the
    projects they have a live booking or a task on), each
    `{projectId, name, status, startDate, endDate, atRisk, deliverables: [{milestoneId, name, dueDate, status}], bookings: [{userId, name, startDate, endDate, hoursPerWeek}]}`,
    where an employee sees only their own bookings. A fixed number of queries whatever the
    page size (no query per project).
  - **`components/ProjectTimelines.jsx`:** one row per project across weeks (Float-like):
    the project's span as a bar, deliverables as markers on their due dates (status by
    icon and text, never colour alone), a gold "today" line, this week highlighted, the
    project name a link to it. Paginated with `Pager`; scrolls sideways inside its own box
    on phones (the page never does). Hover and keyboard focus show a tooltip.
  - **Managers and admins:** the Dashboard starts with "My projects this week"
    (`ProjectTimelines`), then the cards and charts it has today.
  - **Employees:** the menu item "My tasks" becomes **"Dashboard"** (route `/my-tasks`
    kept). The page: "My projects" (`ProjectTimelines`), then **My tasks** (with search),
    Ready to take (with search), then **My logged time in a dropdown** (an accordion,
    closed by default, its summary showing the count).
- **Logging time:** the Hours box takes any whole number; Minutes must be 0 to 59 (field
  error "Minutes must be under 60"). One entry still holds at most 24 h (the database rule
  `time_entries_minutes_range`), with a clear message if the total goes past it.
- **Projects list:** the project name is a real button-style link that opens it (not a
  hover row). Search at the top. A per-row action: managers **Request archive** (opens the
  archive request for that project), admins **Archive** (confirm dialog). Same button in
  the project page's header, so you can archive or ask to while inside a project.
- **Resources tab:** called **People** for employees; managers and admins keep
  **Resources** (the brief's word).
- **Requests:** two tabs, **My requests** (what you sent) and **Approve or deny** (what is
  waiting for your decision; only shown to someone who can decide), each with search.
- **Approvals, Notifications, Audit log:** search at the top.
- **Allocation:** a short "How to read this" panel at the top: each row a person, each
  column a week, hours booked against their weekly capacity, red with an icon means over
  capacity; use it to spot overbooking before it happens. Plus a one-line legend.

## 4. Notifications for the person a change is about

Today a change notifies everyone above the actor (and the project's manager for an
employee's project work). Added: **the person a record is about is told when someone else
changes it**, whatever the actor's role. "About" means:

| Entity | Person |
| --- | --- |
| `users` | the user themselves (role, title, capacity, overtime, task limit, password reset, archive) |
| `assignments` (bookings) | `userId` |
| `tasks` | `assigneeId`, before and after (both the old and new assignee on a reassignment) |
| `time_entries` | `userId` (approved, rejected, edited by someone else) |

Never the actor; archived users get nothing; one notification per person per change
(no duplicates when they are also above the actor). Request decisions already notify the
asker (`also_notify`). Tests: one per entity row, plus actor-is-subject and archived-subject.

## 5a. Errors show on the field (David, 14 Oct night)

"If there is an error when writing out a field I want that field to glow red, not a message
at the top of a card."

- **The field glows red:** the theme gives an outlined field in error a red border and a
  soft red glow (both modes; the border reaches 3:1 against its surface), and the reason in
  one short line right under the field. The words stay: colour alone can't tell a
  colour-blind or screen-reader user what is wrong (WCAG 3.3.1). The line is tied to the
  field with `aria-describedby`, and focus moves to the first field with a problem.
- **Checked before sending** wherever the browser can tell: a required field left empty,
  Minutes of 60 or more, a number out of range, an end date before the start date. No round
  trip, no extra click.
- **Server errors with a `field`** land on that field (as today). Errors with no field show
  as one line just above the dialog's buttons, next to where you pressed, never at the top
  of the card.
- **Sign-in:** a wrong username or password makes both boxes glow red, with the message
  under the password box.

## 5b. Fewer clicks, easier on the eyes (David, 14 Oct night)

"Minimize the amount of clicks to do a task: in the past you had to press Projects, open
it, and look somewhere else to archive a project."

- **Do it where you see it.** Common tasks happen from the row you are looking at, not on
  another page: archive or request archive from the Projects list; approve or reject logged
  time from its row (reject asks only for the note); take a task from Ready to take; log
  time and move status from a task's row; book a person from the Resources tab; reset a
  password or change capacity from a person's row. A confirm step stays only where the
  action is hard to undo.
- **A click count.** For each common task per role: clicks before, clicks after. It goes
  in `docs/REPOINFO.md`, so David can say it.
- **Easy on the eyes:** one main button per screen, always in the same place (page actions
  top right, row actions at the end of the row), body text at least 14 px with comfortable
  line spacing, spacing rather than lines to separate things, no walls of borders, and the
  same order of sections on every page. Checked by looking at real screenshots of every
  screen, light and dark, desktop and phone.

## 5. Not changing

Routes, roles and rules other than the above; the API shapes; the database schema (no
migration needed).
