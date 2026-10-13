# CLAUDE.md

Working notes for Claude Code and the team: ACME Project Tracker, Citi coding workshop,
Tue 13 to Thu 15 Oct 2026. The product spec is `PROJECT_PLAN.md`, and section numbers
below (§) refer to it. If that file is missing, ask David for it rather than
reconstructing it. This file holds what the spec does not: how this repo actually runs
and deploys, the traps found by reading it, and how to work with David.

**Rule:** if something here goes out of date, fix it in the same commit as the code that
outdated it.

---

## 1. Working with David

David has to explain every line of this project to Citi evaluators, live, including the
parts nobody typed by hand. That shapes everything:

- **Explain as you go.** For every change, say what changed, why, where it sits in the
  request path (route, auth check, service rule, repository, Postgres, response), and
  which alternative you rejected. Plain words first, then the technical term.
- **Verify, don't assert.** The evidence must match the claim: test output with the
  count, `curl` against the running server, a request that breaks a rule and shows the
  refusal. A clean build is not a working feature.
- **End every task with two lists:** verified (and how), and not verified (and why).
  Layout, colour in context and hover states always go in "not verified".
- **Every behavioural fix ships with the test that fails without it.**
- **Brevity outranks completeness.** A feature nobody can explain is worse than no
  feature. The seven client questions come before anything clever.
- **Disagree with evidence.** If the plan is wrong, show the output that proves it.
- **Keep the README's architecture notes current.** When a layer is finished, add a few
  lines on it in the same commit. That is David's script for the code walkthrough.
- Don't commit, push or deploy unless asked. Follow the build order (§9): the API is
  stable before the UI starts.

Who David is, for priorities: UCF CS senior (graduating Dec 2026), Master's next spring.
PM and tech lead on Knights Counsel (a permission-aware RAG agent for a university legal
office), and PM and frontend lead on SimpleBank, the four-day build behind the workshop
playbook. Site: d4davidg.github.io, "building systems that tell you why they work".
David's angle here: a UI that looks finished, requirements visibly traced to screens,
and business rules you can watch being enforced.

## 2. What we are building

An ACME Inc. project tracker that answers seven client questions, each on a visible
screen. This list is also the demo running order:

1. Status of each active project: project list.
2. Projects at risk of missing deadlines: dashboard panel.
3. Resource allocation across projects: allocation grid, person by week.
4. Key deliverables and completion: milestone timeline.
5. Over-allocated team members: grid cells over 40 hours flagged.
6. Dependency chain between deliverables: dependency view.
7. Budget consumed versus planned: budget bar.

The brief fixes the stack: React with React Responsive and Material UI, Python, and
PostgreSQL, deployed to AWS (Lambda, Aurora, S3, CloudFront) through this repo's
Terraform.

## 3. Where things run (decided 13 Oct)

| Machine | Use |
| --- | --- |
| **VDI** (Amazon WorkSpaces, Ubuntu 22.04) | Everything that executes: setup scripts, `start-dev.sh`, tests, deploys, the demo |
| Windows laptop | Reading and editing only. Don't run `bin/` scripts or Terraform from it |

Why not Windows:

- Every `bin/` script assumes Ubuntu (`apt`, `snap`, `systemctl`, `ss`, `sudo`,
  `mongod --fork`).
- Terraform builds the Lambda zip on whichever machine runs it (`build_in_docker =
  false`, `infra/lambda.tf:14`). A Windows deploy ships Windows wheels of
  `psycopg-binary` to a Linux Lambda, which crashes on import.
- The VDI's default Python is 3.13, the same as the Lambda runtime. The laptop has 3.14.

Work happens on branch `David`. The VDI is wiped after the workshop, so push to GitHub
at least every evening.

## 4. Environment

| Setting | Value |
| --- | --- |
| AWS region | `us-east-2` (LocalStack always uses `us-east-1`) |
| Event ID | `01a127f2` |
| Participant ID | `c7dabfc1` (no `u`; the `u` belongs only to the WorkSpaces username) |
| Participant code, LocalStack token | In `~/.bashrc` on the VDI only. Never in the repo or a commit |

| Port | What |
| --- | --- |
| 3000 | Vite dev server (React) |
| 3001 | `bin/proxy-server.js`, forwards `/api/<service>/...` to the LocalStack Lambda URL |
| 4566 | LocalStack: fake AWS in Docker. Pro image, so it needs the auth token |
| 5432 | PostgreSQL 18 on the host: user `postgres`, password `postgres123`, database `postgres` |
| 27017 | MongoDB: installed but unused, because the requirements say Postgres |

Terraform injects these into every Lambda (`infra/locals.tf:98-114`):

| Variable | LocalStack | AWS |
| --- | --- | --- |
| `IS_LOCAL` | `true` | `false` |
| `POSTGRES_HOST` | `172.17.0.1` (the Docker bridge back to the host) | Aurora endpoint |
| `POSTGRES_NAME` / `_USER` / `_PASS` | `postgres` / `postgres` / `postgres123` | `codingworkshop` / `superadmin` / generated |

On AWS, add `sslmode=require` to the connection when `IS_LOCAL` is `false`.

### Scripts

| Script | What it actually does | Writes |
| --- | --- | --- |
| `setup-participant.sh` | Looks up the event's API via a DNS TXT record on `codingworkshop.net`, then trades participant ID and code for **temporary** AWS credentials. Needs `aws`, `curl`, `jq`, `dig` | `~/.aws/credentials`, and `ENVIRONMENT.config` (gitignored, holds the credentials) |
| `setup-environment.sh -d` | Installs the toolchain on Ubuntu 22.04. `-d` adds dnsmasq so `*.localhost.localstack.cloud` resolves locally. Idempotent, so rerun it on failure | log in `~/.local/share/workspace-setup/` |
| `start-dev.sh` | Rebinds Postgres and Mongo to `0.0.0.0` (pg_hba `trust`, dev only), starts LocalStack, deploys to it with Terraform, writes `frontend/.env.local`, starts the proxy on 3001, then runs Vite on 3000 in the foreground | `/tmp/tf-init.log`, `/tmp/backend-deploy.log`, `/tmp/npm-install.log`, `/tmp/proxy-server.log` |
| `deploy-backend.sh [aws\|local]` | `terraform apply`. Defaults to `aws`, and refreshes credentials first | |
| `deploy-frontend.sh` | `npm run build`, S3 sync, CloudFront invalidation, prints the URL | |
| `cleanup-environment.sh` | Zips the project to `s3://coding-workshop-tfstate-<id>/backup/`, then `terraform destroy`. Irreversible: never run it without asking | |

### First-time VDI setup

Run these after cloning our repo on branch `David`. The commented walkthrough was given in
chat on 13 Oct.

```sh
echo "export AWS_REGION='us-east-2'"           >> ~/.bashrc
echo "export EVENT_ID='01a127f2'"              >> ~/.bashrc
echo "export PARTICIPANT_ID='c7dabfc1'"        >> ~/.bashrc
echo "export PARTICIPANT_CODE='<from email>'"  >> ~/.bashrc
echo "export LOCALSTACK_AUTH_TOKEN='<token>'"  >> ~/.bashrc
source ~/.bashrc
./bin/setup-participant.sh && aws sts get-caller-identity
./bin/setup-environment.sh -d     # sudo password = VDI password; takes a long time
source ~/.bashrc
./bin/start-dev.sh                # done: "All Components Verified!" and :3000 loads
# End-to-end proof: cp -R backend/_examples/python-service backend/python-service,
# rerun start-dev.sh, curl http://localhost:3001/api/python-service (expect both DB
# versions), then delete that folder. Never commit it.
```

| Symptom | Fix |
| --- | --- |
| `'jq' is missing` | `sudo apt install -y jq` |
| `'aws' is missing` | Run `setup-environment.sh -d` first, then `setup-participant.sh` |
| `PARTICIPANT_URL not found` | Check `EVENT_ID`. Run `dig +short TXT codingworkshop.net`, and if `dig` is missing: `sudo apt install -y dnsutils` |
| `Workshop API returned HTTP 4xx` | Wrong participant ID or code |
| AWS calls fail later with `ExpiredToken` | Rerun `./bin/setup-participant.sh`. The credentials are temporary |
| `$'\r': command not found` | A script picked up Windows line endings: `sed -i 's/\r$//' bin/*.sh` |

## 5. How this repo turns code into a running API

**One folder directly under `backend/` is one Lambda.** Terraform finds Python services
by `backend/*/requirements.txt` (`infra/locals.tf:23-26`). The backend README says it
looks for `function.py`, which is wrong for Terraform, but `start-dev.sh` counts
`function.py`, so every service needs both files. The handler is `function.handler`, on
runtime `python3.13`, with 128 MB and a 300 s timeout. Folders starting with `_` are
skipped.

**Only that folder is zipped.** The plan's sibling folders (`backend/domain/`,
`backend/services/`, ... in §11) would deploy as nothing, and the API would crash on
`import domain`. All backend code lives inside one service folder:

```
backend/tracker/          # the Lambda; the folder name is the URL segment /api/tracker/...
├── function.py           # entry point: handler(event, context) hands off to api/
├── requirements.txt      # psycopg[binary]; drop pymongo, we are Postgres only
├── domain/               # exceptions, money, models
├── services/             # business rules, no framework imports
├── store/                # memory.py (tests) and postgres.py
└── api/                  # route table, authorise(), exception-to-status map
tests/                    # outside backend/ (trap 7); pytest pythonpath = backend/tracker
```

The name `tracker` is a proposal; rename it freely before the first deploy.

**The same request arrives with different paths:**

```
local: browser :3000 -> proxy :3001 /api/tracker/projects/7
         proxy strips /api/tracker -> Lambda sees /projects/7 (possibly //projects/7)
AWS:   browser -> CloudFront /api/tracker* -> Lambda URL, path untouched
         -> Lambda sees /api/tracker/projects/7
```

The router has to normalise both: drop a leading `/api/tracker` and collapse `//`. Test
both shapes.

**Event shape** (Function URL, payload format 2.0):

- path: `event["rawPath"]`
- method: `event["requestContext"]["http"]["method"]`
- headers: `event["headers"]`, with lower-cased keys
- query: `event.get("queryStringParameters")`, which may be absent
- body: `event["body"]`, a string, base64-encoded when `isBase64Encoded` is true

The handler returns `{"statusCode", "headers", "body": json.dumps(...)}`.

**Local hot reload.** LocalStack mounts the service folder, so Python edits are live
without a deploy. Adding or removing a service, or changing Terraform, needs a deploy.
`start-dev.sh` only redeploys when it finds more services on disk than are deployed, or
none responding, so force a deploy with
`(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)`. Without
`ENVIRONMENT.config`, the app id falls back to `abcd1234` and Terraform renames every
resource.

**Lambda is not a server.** Concurrent instances don't share memory, and an instance is
wiped when it is recycled. What that means for the plan:

- The in-memory store is a test double, never the deployed app's storage.
- Anything "generated on first run", such as the JWT signing key in §13, would differ per
  instance and cause random 401s. Use one stable secret: a Terraform `random_password`
  passed in as a Lambda environment variable, or a row in Postgres.
- Locks must live in Postgres. The 40-hour check needs `SELECT ... FOR UPDATE` on the
  user's row inside the transaction, or two concurrent assignments both pass.
- The Lambda clock is UTC. Decide whose "today" the at-risk rules use; the demo is in
  Eastern time.

## 6. Traps found by reading the code

Fix each one when the work reaches it, not before.

| # | Trap | Where | Fix |
| --- | --- | --- | --- |
| 1 | The proxy forwards only `accept`, `content-type`, `user-agent` and `host`, so **`Authorization` never reaches the Lambda locally**, and every authenticated call returns 401 | `bin/proxy-server.js:95-106` | Forward `authorization`, and also `content-length` if POST bodies arrive empty |
| 2 | Preflight answers `Access-Control-Allow-Headers: *`, but the Fetch spec never lets `*` cover `Authorization`, so the browser blocks the call before trap 1 even matters | `bin/proxy-server.js:41` | Call relative `/api/...` URLs through Vite's `server.proxy`, which is same-origin both locally and on CloudFront, so CORS never applies. Or list `Authorization, Content-Type` explicitly |
| 3 | `.gitignore` silently drops any folder named `lib/`, `assets`, `build`, `dist`, `env/`, `var/`, `parts/`, `logs`, `tmp`, `coverage`, `target/` or `downloads/`, anywhere in the tree. For example, `frontend/src/lib/api.js` would never be committed. It also ignores `*.config` and `package-lock.json` | `.gitignore` | Avoid those names. When a file won't show in `git status`, run `git check-ignore -v <path>` |
| 4 | `start-dev.sh` pip-installs dependencies **into** the service folder, which leaves untracked clutter there | `bin/start-dev.sh:342` | Add `backend/tracker/.gitignore` for the vendored packages, and check `git status` after the first run |
| 5 | `npm run lint` fails: the config imports `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`, which aren't in `package.json` | `frontend/eslint.config.js:3-4` | `npm i -D` both |
| 6 | Vite silently moves to the next free port if 3000 is busy, so you can end up looking at a stale server | `frontend/vite.config.js` | Set `server.strictPort: true`, and keep exactly one listener per port (§11) |
| 7 | CI runs `bandit -r ./backend`. It fails on `assert` in tests (B101), `random` used for passwords (B311), string-built SQL (B608) and hard-coded seed passwords (B105/B106), and the red X shows on every push | `.github/workflows/python.actions.yml:27` | Keep tests in `tests/`, use `secrets` for the six-character password, use parameterised SQL only |
| 8 | The repo docs curl `https://localhost:3001`, but the proxy is plain HTTP | `docs/full-stack.md:121` | Use `http://` |
| 9 | The docs' local log command picks up your `us-east-2` region, but the functions live in LocalStack's `us-east-1` | `docs/full-stack.md:131` | Use the command in §11 |
| 10 | React 19 ignores `propTypes` at runtime, but the org's instructions still require them | `.github/instructions/react.instructions.md` | Write them as documentation; don't rely on them for validation |
| 11 | Postgres has no `CREATE TYPE ... IF NOT EXISTS`, and Aurora isn't publicly accessible, so the schema has to be applied from inside the Lambda | `infra/rds.tf` | Run an idempotent migration on cold start: enums inside a `DO` block, or `CHECK` constraints instead |
| 12 | Local Postgres is a single shared `postgres` database | | Tests hard-code their own database name. Never point the app at it |

## 7. Check on the first AWS deploy (Wednesday)

These are inferred from the Terraform but not yet observed. Check each against the
deployed URL:

1. **API 404s survive CloudFront.** `custom_error_response` rewrites 404 to
   `/index.html` with status 200 (`infra/cloudfront.tf:42-47`), and it applies to the
   whole distribution, API included. Our "not found or not yours" 404 may arrive as a 200
   carrying HTML. Likely fix: remove the block, and use `HashRouter` or a CloudFront
   Function for the single-page-app rewrites.
2. **Deep links.** S3 behind origin access control answers 403, not 404, for a missing
   key, so refreshing `/projects/7` may show an AccessDenied page. `HashRouter` avoids it.
3. **`Authorization` reaches the Lambda on GET requests through CloudFront.** CloudFront
   treats that header specially. If it is dropped, switch to a custom header.
4. **Login latency.** A 128 MB Lambda gets a small slice of a CPU, so PBKDF2 at 600k
   rounds can take seconds there, even though it is fast in LocalStack. Measure it, then
   either raise `memory_size` (`infra/lambda.tf:11`) or choose the round count
   deliberately and say so.
5. **First request after idle.** Aurora Serverless v2 with `min_capacity = 0`
   (`infra/rds.tf:27`) pauses itself. Resuming it, plus a Lambda cold start, takes many
   seconds. Warm the app up a minute before the demo.

## 8. Where the plan and the repo disagree

- **The §2 decisions are still open:** 2.1 the one-manager model, 2.2 planned versus
  logged hours, 2.4 wire naming. The recommendations are (a), elapsed weeks, and
  camelCase on the wire. Don't write code that depends on an open decision; ask. Money
  (2.3) is settled: integer cents.
- **§10 lists `implementation.md`, `testing.md` and `evaluation.md` to read.** They don't
  exist. That material is the three sections of `docs/full-stack.md`, which is the
  rubric.
- **The §11 ownership paths** become `backend/tracker/domain/` and so on (§5 above).
- **The rubric expects DELETE.** `docs/full-stack.md` asks for DELETE with 204 and says
  "deleted records are properly removed"; we archive instead (plan §4). Keep archiving,
  explain why in the README and the demo, and ask an evaluator early whether archive
  satisfies the D in CRUD.
- **The rubric expects token refresh.** It lists "token expiration and refresh". We do
  expiry plus a clean re-login, and list refresh tokens as a deliberate omission (§16).
- **How scoring works.** Five technical scores (Implementation, Design, Code, Testing,
  Experience) and three soft-skill scores (Curious, Observant, Driven), each 1 to 10. The
  final score is the average of the two averages, and 9 or above is excellent.
- **Coverage targets:** 80% for backend and frontend, 90% for API and error paths, 100%
  of critical paths end to end. The README must cover the architecture, trade-offs,
  assumptions, test commands, results and known gaps.
- **Frontend test runner.** The rubric names Jest with React Testing Library. With Vite,
  Vitest is the native fit and has a Jest-compatible API. Decide before the first test is
  written.

## 9. Rules that don't bend

The detail is in the plan:

- Money is integer cents everywhere except on screen, and one module converts it (§2.3).
- Nothing is deleted: archive and reactivate. There is no DELETE route and no `delete`
  method, and tests assert their absence (§4).
- The invariant: nobody is allocated over 40 hours in any week. Every test's teardown
  checks it, and so does `GET /admin/capacity-check` (§5).
- Answer 404, never 403, for something that exists but isn't yours, with byte-identical
  messages (§7).
- Authorise from the role stored in the database, never from the token's claim (§7).
- One route table and one `authorise()` (§7).
- One exception-to-status table (§7).
- Every error has the shape `{ "error": "..." }` (§7).
- Lists return `{ items, page, pageSize, total, totalPages }` (§7).
- Write endpoints return the new resource (§7).
- Serialise fields by name, never by dumping the model (§7).
- Services raise domain exceptions and import no framework. Rule tests never import
  `api` (§9).
- Frontend (§8):
  - one `request()` module for every backend call;
  - 401s handled in one place, with login exempt;
  - the session probed on load;
  - every storage access wrapped in try/catch;
  - MUI theme tokens for light and dark, each annotated with its contrast ratio;
  - field errors tied to their field with `aria-describedby`;
  - no money arithmetic in the browser.

## 10. Conventions

- **Python:** PEP 8, snake_case, and type hints plus docstrings on everything public
  (from `.github/instructions/`). Target 3.13; don't use 3.14-only features.
- **React:** function components, camelCase names, PascalCase components, Airbnb style,
  PropTypes and JSDoc on components and public functions. Stay with JavaScript (`.jsx`),
  since the scaffold is JS.
- **Frontend packages still to add:** `@mui/material @emotion/react @emotion/styled
  react-router react-responsive prop-types`. CI fails on high-severity `npm audit`
  findings, so check before adding anything else.
- **Terraform:** snake_case, a comment on every resource, and `terraform validate`
  before committing.

## 11. Commands (VDI)

```sh
source ~/.bashrc && ./bin/start-dev.sh                         # start or repair everything
(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)   # force a LocalStack redeploy
curl http://localhost:3001/                                     # proxy lists deployed services
ss -ltnp | grep -E ':(3000|3001|4566|5432)'                     # exactly one listener per port

# Lambda logs in LocalStack (region and credentials must be LocalStack's)
AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
  aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --follow --format short

./bin/deploy-backend.sh && ./bin/deploy-frontend.sh            # AWS; prints the CloudFront URL
```

Tests: one command that prints the count. It isn't built yet; record it here when it is.

## 12. Safe to ignore

- `data/`, `infra/eks.tf`, `infra/helm/`, and `infra/documentdb.tf` (off by default).
- `backend/_examples/java-service` and `backend/_examples/nodejs-service`.
- Every guide in `docs/` except `full-stack.md` and `validation.md`.
- Jupyter, Spark, Trino, kubectl and Helm, which `setup-environment.sh` installs for
  other tracks. Their install failures don't matter to us.
