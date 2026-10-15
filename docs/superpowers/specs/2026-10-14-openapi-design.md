# OpenAPI file for Postman and SwaggerHub: design

Approved by David, 14 Oct evening. Plan: `docs/superpowers/plans/2026-10-14-openapi.md`.

## 1. What and why

Evaluators may ask "can I open your API in Postman or SwaggerHub?". Today the answer is
"no" (`docs/REPOINFO.md` question 17). Both tools import an **OpenAPI** file: one JSON
document that lists every endpoint, its method, its path, who may call it, what it takes
and what it answers.

We already have one place that knows every endpoint: the route table,
`backend/tracker/api/routes.py` (69 routes). So the file is **generated from that table**
by a small script, `tools/openapi.py`, and saved as `docs/openapi.json`. A test regenerates
it and fails if the saved file differs, so the file can't drift from the code. Nothing in
the request path changes: this is documentation built from the code, not new behaviour.

## 2. Decisions (with the alternative rejected)

| Decision | Rejected alternative, and why |
| --- | --- |
| **Generate from `ROUTES`**, the one route table | Hand-write the file: 69 routes would drift the first time a route is added |
| **OpenAPI 3.0.3, JSON**, written with the standard `json` module | YAML (needs PyYAML, a new dependency); OpenAPI 3.1 (older Postman and SwaggerHub versions import 3.0 more reliably) |
| **A test compares the saved file with a fresh build** (`build() == json.load(...)`) | A CI step: CI runs no pytest today (REPOINFO question 18), so the test is where it gets caught |
| **Summary = first line of the handler's docstring.** Most handlers (68 of 69) have none today, so each gets a one-line docstring, and a test fails if one is missing | Turning the function name into words (`move_task` -> "Move task"): no code change, but vague, and CLAUDE.md §10 already asks for docstrings on everything public |
| **Request bodies listed by hand** in one dict in `tools/openapi.py`: handler name -> `{field: type}`, camelCase, as the client sends them | Reading them out of the services automatically: the services validate field by field, so there is nothing clean to read; guessing would be wrong |
| **Two tests keep the body list honest:** (a) the handlers that read `ctx.body` (found by reading each handler's source) are exactly the ones with a body entry; (b) where a service has an allow-list (`_FIELDS`, `_ADMIN_FIELDS`, ...), the documented fields equal it | Trusting the dict: a new field added to a service would silently be missing from Postman |
| **Responses name the envelope, not each record's fields.** List routes (handlers that call `_page` or `_whole`) answer the shared `Page` schema; others answer a plain JSON object; logout answers 204 with no body | Hand-writing a schema per record (user, project, task, ...): about a dozen schemas to keep in step with `services/views.py`, for little demo value |
| **Errors as one shared `Error` schema** `{ error, field?, code? }`, matching `api/errors.py`, listed on every route: 400, plus 401/403/404 for signed-in routes, plus 409 for writes | Per-route exact error lists: the services decide those, and the table can't know them |
| **Roles shown twice:** in the description ("Roles: ADMIN, MANAGER") and as `x-roles` (an OpenAPI extension field, ignored by tools that don't know it) | Only in prose: a test couldn't check it |
| **Bearer auth** as a security scheme (`bearerAuth`, JWT) applied to the whole API; public routes (`/health`, `/auth/login`, `/auth/refresh`, `/auth/logout`) override it with `security: []` | Per-route security on every route: same result, more noise |
| **Two servers:** local proxy `http://localhost:3001/api/tracker` and AWS `https://d1gov8jpsxhwer.cloudfront.net/api/tracker` | One server: Postman would only know one; both path shapes already work (`api/http.py:normalise_path`) |
| **Tags = the first path segment** (`users`, `projects`, `milestones`, ...), so Postman makes one folder each | No tags: one flat list of 69 requests |
| **Query parameters:** `page` and `pageSize` on every paginated route (found automatically), plus a short hand list of filters per handler (`search`, `status`, `includeArchived`, `unread`, ...) | Leaving filters out: "search and filter" is in the brief, so they belong in the file |
| **Output is deterministic:** route-table order, `indent=2`, a trailing newline, no dates or timestamps, `info.version` fixed at `1.0.0` | A generated-at time: every run would change the file and fail the test |
| **Keep `tools/tracker.http`** | Replace it: it works without a sign-in, and the runbook already uses it |

## 3. Data, route and UI changes

- **Data:** none. No migration.
- **Routes:** none. 69 routes before and after; `routes.py` is untouched. The handlers in
  `api/handlers.py` gain one-line docstrings (no behaviour change).
- **Types in bodies** come from how each service validates the field: `values.integer` ->
  `integer`, `values.boolean` -> `boolean`, `values.date` -> `string` with `format: date`,
  `values.text` / `values.choice` -> `string`. Money fields end in `Cents` and are integers.
- **UI:** none.
- **New files:** `tools/openapi.py` (builder and writer), `docs/openapi.json` (generated),
  `tests/backend/test_openapi.py`.

`tools/openapi.py` in outline (names fixed in the plan):

- `ROOT`, `OUT = ROOT / "docs" / "openapi.json"`; puts `backend/tracker` on `sys.path`
  so it can import `api.routes`.
- `BODIES`: handler name -> `{camelCaseField: openapi_type}` (23 entries: every handler that reads `ctx.body`).
- `FILTERS`: handler name -> list of query names beyond `page`/`pageSize`.
- `build() -> dict`: the whole document. `write() -> None`: saves it.
- Run: `.venv/bin/python tools/openapi.py` (prints "Wrote docs/openapi.json: 69 operations").

The `.venv` Python is used because importing the routes imports `psycopg` (via
`handlers.py`), which the system Python may not have.

## 4. Error cases

| Case | What happens |
| --- | --- |
| Someone adds a route and forgets to regenerate | `test_openapi_file_is_up_to_date` fails, and its message gives the command to run |
| A new handler has no docstring | `test_every_handler_has_a_one_line_docstring` fails, naming it |
| A new handler reads `ctx.body` but has no `BODIES` entry (or an entry is left for a handler that no longer reads one) | `test_bodies_are_listed_for_exactly_the_handlers_that_read_one` fails, naming it |
| A service adds or renames an allowed field | `test_body_fields_match_the_service_allow_lists` fails |
| A `$ref` points at a component that doesn't exist (the file would not import) | `test_every_ref_resolves` fails |
| Swagger "Try it out" from SwaggerHub's website against our server | Probably blocked by CORS (a browser on swaggerhub.com calling our domain). Not tested; Postman's desktop app is not a browser, so CORS does not apply there. Documented as a known limit |

## 5. Tests that prove it

All in `tests/backend/test_openapi.py`. None needs the database (no `conn` fixture).

1. `test_openapi_file_is_up_to_date`: `build()` equals the saved `docs/openapi.json`.
2. `test_every_route_is_documented_once`: each `(method, path)` in `ROUTES` is in
   `paths`, and the number of operations equals `len(ROUTES)` (no extras, none missing).
3. `test_every_handler_has_a_one_line_docstring`: each route's summary is non-empty and
   equals the docstring's first line.
4. `test_roles_and_auth_follow_the_route_table`: public routes have `security == []`;
   others have no override; `x-roles` equals the route's roles (absent for "any signed-in user").
5. `test_status_codes_follow_the_route_table`: `POST /users` documents 201,
   `POST /auth/logout` 204, `GET /projects` 200 with the `Page` schema.
6. `test_bodies_are_listed_for_exactly_the_handlers_that_read_one`.
7. `test_body_fields_match_the_service_allow_lists`: for example `PATCH /tasks/{id}` lists
   exactly `title, description, estimateMinutes, assigneeUserId`.
8. `test_every_ref_resolves` and `openapi == "3.0.3"`.

What the tests can't prove: that Postman and SwaggerHub actually import it. That is a
manual check (section 6), listed as not verified until done.

## 6. What docs change

- `README.md`: a short "API file (Postman, SwaggerHub)" subsection: what the file is,
  how it's generated, the import steps; `test_openapi.py` added to the test table.
- `docs/TESTING.md`: `test_openapi.py` in the API tests row, plus "Import into Postman
  or SwaggerHub" steps:
  - **Postman:** Import -> Files -> `docs/openapi.json` -> import as a Postman
    Collection. Set the collection's `baseUrl` variable to the local or AWS server. Send
    "Log in", copy `token` from the answer into the collection's Authorization tab
    (Bearer Token). Tokens last 15 minutes.
  - **SwaggerHub:** Create New -> Import and Document API -> upload `docs/openapi.json`.
    Browse and share it there; "Try it out" may be blocked by CORS (section 4).
- `docs/REPOINFO.md` question 17: from "Neither ... Not built" to: built; the file is
  generated from the route table, a test keeps it current, `tools/tracker.http` stays for
  VS Code.
- `docs/DEMO-RUNBOOK.md` (near line 448): Postman no longer needs requests built by hand;
  point at the import steps.
- `CLAUDE.md` "Read these first": mention `docs/openapi.json` beside `tools/tracker.http`,
  and that `tools/openapi.py` regenerates it after a route change.
- Test counts: left to the final verify, per the 19:50 ruling.
