# Setup: run it yourself, deploy it, fix it

For anyone who wants the tracker running on their own machine or on AWS. It answers: what you
need, how to start everything, how to sign in and add demo data, how to deploy, and what to
do when something breaks. Back to the [README](../README.md).

**Only want to look?** You don't need any of this. The live site is
<https://d1gov8jpsxhwer.cloudfront.net>, and every login is in the [README](../README.md).

| Section | Read it when |
| --- | --- |
| [1. What you need](#1-what-you-need) | before anything else |
| [2. First-time setup](#2-first-time-setup-once-per-machine) | once per machine |
| [3. Start everything locally](#3-start-everything-locally) | every time you sit down to work |
| [4. Sign in locally and add demo data](#4-sign-in-locally-and-add-demo-data) | once, after the first start |
| [5. Day-to-day work on the local copy](#5-day-to-day-work-on-the-local-copy) | while changing code |
| [6. Deploy to AWS](#6-deploy-to-aws) | to put your changes on the live site |
| [7. Wake the site before a demo](#7-wake-the-site-before-a-demo) | a few minutes before showing it |
| [8. See what is on AWS](#8-see-what-is-on-aws) | to show or debug the cloud side |
| [9. Troubleshooting](#9-troubleshooting) | when a command fails |
| [10. Danger: cleanup-environment.sh](#10-danger-cleanup-environmentsh) | before you even think of running it |

Each script in `bin/` is described in [bin/README.md](../bin/README.md), and each Terraform
file in [infra/README.md](../infra/README.md). Tests are in [TESTING.md](TESTING.md).

---

## 1. What you need

| What | Why |
| --- | --- |
| A machine running **Ubuntu 22.04**: the workshop's VDI (an Amazon WorkSpaces virtual desktop) | Every `bin/` script assumes Ubuntu: `apt`, `snap`, `systemctl`, `ss`, `sudo` |
| Your **sudo password** (on the VDI, the password you sign in with) | `setup-environment.sh` installs system packages |
| A **LocalStack auth token**, from <https://app.localstack.cloud/getting-started> | LocalStack is fake AWS in Docker, so the whole app runs on your machine. The repo uses its Pro image, which needs the token |
| **For AWS only:** the workshop's Event ID, Participant ID and Participant Code, from the organisers' invitation email | `bin/setup-participant.sh` trades them for temporary AWS credentials. David's are event `01a127f2` and participant `c7dabfc1`; the code is a secret and is never in the repo |

**Not Windows, and not macOS.** Besides the Ubuntu-only commands, Terraform builds the
Lambda's zip on whichever machine runs it (`build_in_docker = false`,
[`infra/lambda.tf`](../infra/lambda.tf)). A deploy from Windows ships Windows builds of
`psycopg-binary` (the Postgres driver) to a Linux Lambda, which then crashes on
`import psycopg`. Edit anywhere you like; run the commands on Ubuntu.

Python is 3.13 everywhere: the same version as the Lambda runtime (`python3.13` in
[`infra/locals.tf`](../infra/locals.tf)). `setup-environment.sh` makes it the default
(`PYENV_VERSION`, [`bin/setup-environment.sh`](../bin/setup-environment.sh) line 13).

## 2. First-time setup (once per machine)

Paste these one block at a time. The `read` lines ask for a secret without showing it on
screen, and save it to `~/.bashrc`, so nothing secret goes into the repo.

```sh
cd ~
git clone https://github.com/D4DavidG/DavidCitiProject.git
cd ~/DavidCitiProject
```

```sh
echo "export AWS_REGION='us-east-2'"     >> ~/.bashrc
echo "export EVENT_ID='01a127f2'"        >> ~/.bashrc
echo "export PARTICIPANT_ID='c7dabfc1'"  >> ~/.bashrc
read -rsp 'LocalStack token: ' secret; echo; echo "export LOCALSTACK_AUTH_TOKEN='$secret'" >> ~/.bashrc
read -rsp 'Participant code: ' secret; echo; echo "export PARTICIPANT_CODE='$secret'" >> ~/.bashrc; unset secret
source ~/.bashrc
```

The event and participant IDs above are David's. For another workshop event, use the ones
from its email. `AWS_REGION` must be `us-east-2`: the event's DNS record has one entry per
region, and without it the scripts pick `us-east-1`.

Install the toolchain (Docker, LocalStack, the AWS command line, Terraform, PostgreSQL,
Node.js, Python 3.13, VS Code and more). It asks for your sudo password once and takes a
long time. It is safe to run again if it fails part way:

```sh
cd ~/DavidCitiProject
./bin/setup-environment.sh -d
source ~/.bashrc
```

`-d` adds dnsmasq, so names like `x.localhost.localstack.cloud` resolve to your own machine.
It also installs tools for the workshop's other tracks (Jupyter, Spark, Trino, kubectl,
Helm); failures there don't matter to this app.

Get AWS credentials (AWS only; skip it if you only run locally):

```sh
cd ~/DavidCitiProject
./bin/setup-participant.sh && aws sts get-caller-identity
```

It prints your AWS account and role. The credentials are **temporary**: when an AWS command
later says `ExpiredToken`, run `./bin/setup-participant.sh` again.

Finally, the Python environment for the backend tests and tools:

```sh
cd ~/DavidCitiProject
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
pip --version
```

`pip --version` must name Python 3.13. If it names 3.14, see the `psycopg` row in
[Troubleshooting](#9-troubleshooting).

## 3. Start everything locally

```sh
cd ~/DavidCitiProject
source ~/.bashrc && ./bin/start-dev.sh
```

It checks and repairs each piece in order, then prints `All Components Verified!`:

1. **PostgreSQL** on port 5432 (rebinds it to `0.0.0.0` with `trust` sign-in, so the
   LocalStack Lambda can reach it from Docker; development only).
2. **MongoDB** on 27017 (installed by the workshop, unused by this app).
3. **LocalStack** on 4566 (starts its Docker container).
4. **The backend**: installs `psycopg` into `backend/tracker/` (ignored by git through
   `backend/tracker/.gitignore`), then deploys to LocalStack with Terraform if any service
   is missing or not answering.
5. **The website**: `npm install` when needed, writes `frontend/.env.local`, restarts the
   proxy on 3001, then runs Vite on 3000 **in the foreground**.

That terminal is now the website's. `Ctrl+C` stops the website and the proxy; Postgres and
LocalStack keep running. Logs go to `/tmp/tf-init.log`, `/tmp/backend-deploy.log`,
`/tmp/npm-install.log` and `/tmp/proxy-server.log`.

Check it from a second terminal:

```sh
ss -ltnp | grep -E ':(3000|3001|4566|5432)'
curl -s http://localhost:3001/api/tracker/health
```

Expect one listener per port (5432 shows two lines, IPv4 and IPv6: the same Postgres) and
`{"status": "ok"}`. Open <http://localhost:3000>.

| Port | What runs there |
| --- | --- |
| 3000 | The website: Vite's development server (React). `strictPort` is on, so it fails rather than move to another port |
| 3001 | `bin/proxy-server.js`: passes `/api/tracker/...` to the Lambda inside LocalStack |
| 4566 | LocalStack: fake AWS (Lambda, S3) in Docker |
| 5432 | PostgreSQL on the host: user `postgres`, password `postgres123`, database `postgres` (development only) |
| 8090 | Swagger UI, only while `./tools/swagger.sh` runs (see [API.md](API.md)) |
| 27017 | MongoDB: installed by the workshop, not used |

The same request takes two routes, and the backend accepts both:

```
local: browser :3000 -> proxy :3001 /api/tracker/projects/7
         the proxy drops /api/tracker, so the Lambda sees /projects/7
AWS:   browser -> CloudFront /api/tracker/projects/7 -> Lambda URL, path untouched
```

`backend/tracker/api/http.py` (line 54 on) collapses `//` and drops a leading `/api/tracker`
before routing, so both arrive at the same handler.

## 4. Sign in locally and add demo data

A fresh local database has one account: the first admin, **`AD000001`**. Its first password
is generated by Terraform. Print it (this talks to LocalStack, not AWS):

```sh
cd ~/DavidCitiProject
(export AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_ENDPOINT_URL_S3=http://s3.localhost.localstack.cloud:4566 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1; unset AWS_SESSION_TOKEN; terraform -chdir=infra output -raw bootstrap_admin_password; echo)
```

It works only until someone changes it. The first sign-in forces a new password (at least 8
characters); until then, every request except changing the password and reading your own
account answers 403.

Add the demo data: people, the projects Apollo, Zeus and Hermes, an archived Legacy CRM,
bookings, deliverables, tasks and logged time. The script signs in as the admin, so give it
the admin's password now. On the very first run, also give the new password it should set:

```sh
cd ~/DavidCitiProject
read -rsp 'Admin password now: ' TRACKER_ADMIN_PASSWORD; echo; export TRACKER_ADMIN_PASSWORD
read -rsp 'New admin password (first run only, 8+ characters): ' TRACKER_NEW_ADMIN_PASSWORD; echo; export TRACKER_NEW_ADMIN_PASSWORD
python3 tools/demo.py seed
```

After the first run, the admin's password is the new one. `seed` stops at once if project
Apollo already exists (`Already seeded`), so it never doubles the data. Every seeded person's
password is `Demo-pass-2026` (`DEMO_PASSWORD` in [`tools/demo.py`](../tools/demo.py)).

**Local usernames differ on every machine.** The server makes each one from the person's
initials plus 6 digits when the account is created. Two ways to list them (run the first in
the same terminal, so `TRACKER_ADMIN_PASSWORD` is still set):

```sh
cd ~/DavidCitiProject
python3 tools/demo.py demo
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -c "SELECT username, first_name, last_name, role FROM users ORDER BY user_id"
```

`demo.py demo` prints the usernames first, then walks the seven client questions, then tries
to break ten rules and prints `REFUSED as designed` for each. The AWS logins are fixed, and
listed in the [README](../README.md).

## 5. Day-to-day work on the local copy

| You changed | What to do |
| --- | --- |
| Python under `backend/tracker/` | Nothing. LocalStack mounts the folder, so the next request runs the new code |
| The website under `frontend/src/` | Nothing. Vite reloads the page |
| Added a database migration in `backend/tracker/store/migrations/` | The Lambda applies it itself on its next cold start (`store/migrate.py`), locally and on AWS. Never edit a migration that has already run on AWS; add a new numbered file |
| Terraform, or added or removed a folder under `backend/` | Redeploy to LocalStack: `(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)` |

Run that redeploy with `ENVIRONMENT.config` loaded, as shown. Without it, the app id falls
back to `abcd1234` and Terraform renames every resource.

The local Lambda's logs (LocalStack uses its own region and fake credentials):

```sh
AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --follow --format short
```

The local database, in a terminal (`\dt` lists the tables, `\q` quits). The tests use their
own databases (`tracker_test` and similar) and never touch this one:

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres
```

How to run the tests: [TESTING.md](TESTING.md). How to call the API by hand (Swagger, curl,
VS Code): [API.md](API.md).

## 6. Deploy to AWS

You need working AWS credentials ([section 2](#2-first-time-setup-once-per-machine)). Commit
first, then run both scripts, one after the other, from your own terminal:

```sh
cd ~/DavidCitiProject
source ~/.bashrc
./bin/deploy-backend.sh
./bin/deploy-frontend.sh
```

**Always deploy both together.** The website and the API change together. A new website
calls routes an old API doesn't have, and an old website doesn't send what a new API asks for
(for example `confirmOnProjects` when archiving someone who is still on a project).

**What `deploy-backend.sh` does and prints:**

1. Runs `setup-participant.sh` first, so the temporary credentials are fresh.
2. Points Terraform at the state bucket `coding-workshop-tfstate-c7dabfc1`, then runs
   `terraform apply -auto-approve`: **it does not stop to ask**.
3. Prints Terraform's list of changes, then `Apply complete! Resources: ... added, ...
   changed, ... destroyed.`, then `Outputs:` (`api_base_url`, `website_url`, ... and
   `bootstrap_admin_password = <sensitive>`, which Terraform hides), then
   `INFO: Infrastructure deployment complete!`.

New database migrations are not applied by the deploy. The Lambda applies them itself on its
first cold start afterwards (`backend/tracker/store/migrate.py`), under a Postgres lock, so
two Lambdas starting at once never both migrate. Aurora is in a private network, so nothing
outside the Lambda could reach it anyway.

**What `deploy-frontend.sh` does and prints:**

1. Refreshes the credentials, then reads the website bucket's name and the API address from
   Terraform's outputs. It stops with `Could not get S3 bucket name` if the backend was
   never deployed.
2. Runs `npm run build` (the production build in `frontend/dist/`).
3. Uploads it with `aws s3 sync ... --delete`, so old files are removed from the bucket.
4. Asks CloudFront to forget its cached copies (an invalidation of `/*`).
5. Prints `INFO: Frontend deployment complete!` and `CloudFront URL:
   https://d1gov8jpsxhwer.cloudfront.net`.

CloudFront can serve the old files until the invalidation finishes (usually a few minutes).
A hard refresh in the browser (`Ctrl+Shift+R`) helps.

**Check the deploy:**

```sh
curl -s https://d1gov8jpsxhwer.cloudfront.net/api/tracker/health
cd ~/DavidCitiProject && ./tools/e2e.sh --aws
```

The first should print `{"status": "ok"}`. The second runs the browser tests that only read
data against the live site (17 tests, about 2.5 minutes); details in [TESTING.md](TESTING.md).

**A brand-new AWS environment** starts with only `AD000001`, created on the first cold start
with the generated password. Read it right after `deploy-backend.sh`, in the same terminal:

```sh
cd ~/DavidCitiProject
(set -a; source ENVIRONMENT.config; terraform -chdir=infra output -raw bootstrap_admin_password; echo)
```

On David's environment that step is long done: the admin's password is in the
[README](../README.md), and `tools/demo.py seed` was run against AWS with
`TRACKER_API=https://d1gov8jpsxhwer.cloudfront.net/api/tracker`.

**One Terraform folder, two targets.** `start-dev.sh` points Terraform's state at LocalStack;
`deploy-backend.sh` points it at AWS. A plain `terraform output` answers for whichever ran
last, and fails with `ExpiredToken` if the AWS credentials have run out.

## 7. Wake the site before a demo

The AWS database (Aurora Serverless v2) pauses itself when nobody uses it (`min_capacity =
0.0`, [`infra/rds.tf`](../infra/rds.tf)). The first request after a pause takes about 15
seconds while it wakes. Wake it a few minutes before you show anything:

```sh
curl -s https://d1gov8jpsxhwer.cloudfront.net/api/tracker/health
```

- `{"status": "ok"}`: awake.
- `503` with `{"error": "The database is not ready. Please try again shortly."}`: still
  waking. Wait 30 seconds and run it again. The website shows the same message with a
  **Retry** button.

A signed-in browser tab asks the server for new notifications every 10 seconds while it is
visible, which probably keeps the database awake during a demo (an inference, not measured).
`./tools/e2e.sh --aws` wakes the site by itself before its tests.

Each sign-in takes about 1 second on AWS on purpose: passwords are hashed with PBKDF2 at
600,000 rounds, which is slow by design so stolen hashes are slow to crack. The Lambda has
512 MB of memory partly for this ([infra/README.md](../infra/README.md)).

## 8. See what is on AWS

Everything was made by Terraform from `infra/`; nothing was clicked together in the console.

| AWS service | What it does here | Name |
| --- | --- | --- |
| CloudFront | The one public HTTPS address. `/api/tracker*` goes to the Lambda; everything else is the website | `d1gov8jpsxhwer.cloudfront.net` |
| Lambda | Runs the Python backend only when a request arrives | `coding-workshop-tracker-c7dabfc1` (Python 3.13, 512 MB) |
| Aurora Serverless v2 | The PostgreSQL 17 database; private network only | `coding-workshop-rds-c7dabfc1` |
| CloudWatch Logs | Every request's log lines and timings, kept 7 days | `/aws/lambda/coding-workshop-tracker-c7dabfc1` |
| S3 | The website's files | `coding-workshop-website-c7dabfc1` |

Open the AWS console already signed in, on the right page (`tools/console.py`; other pages:
`lambda`, `rds`, `cloudfront`, `s3`):

```sh
cd ~/DavidCitiProject
(set -a; source ENVIRONMENT.config; python3 tools/console.py logs)
```

Or read the logs in the terminal:

```sh
cd ~/DavidCitiProject
(set -a; source ENVIRONMENT.config; aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --since 15m --format short)
```

In the logs, each request ends with a `REPORT` line giving its duration; `Init Duration`
marks a cold start (a fresh copy of the function starting). If either command says the
credentials are refused, they expired: run `./bin/setup-participant.sh`, then try again.

The AWS database can't be opened directly from your machine; that is on purpose. See its
data through the website, Swagger or curl ([API.md](API.md)).

## 9. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERROR: 'aws' is missing` | The toolchain isn't installed yet | `./bin/setup-environment.sh -d` first, then `./bin/setup-participant.sh` |
| `ERROR: 'jq' is missing` | | `sudo apt install -y jq` |
| `dig: command not found`, or `PARTICIPANT_URL not found` | `dig` is missing, or `EVENT_ID` is wrong | `sudo apt install -y dnsutils`; check `dig +short TXT codingworkshop.net` prints a record |
| `PARTICIPANT_URL` ends in `us-east-1` | `AWS_REGION` isn't set | `export AWS_REGION=us-east-2`, then run the script again |
| `Workshop API returned HTTP 4xx` | Wrong participant ID or code | Fix them in `~/.bashrc`, `source ~/.bashrc`, run again |
| `ExpiredToken` or `InvalidClientTokenId` from any AWS command | The workshop's credentials are temporary | `./bin/setup-participant.sh` |
| `PARTICIPANT_ID not found` when a tool or another program runs a script | Ubuntu's `~/.bashrc` loads nothing in a non-interactive shell | Run the script in your own terminal |
| `$'\r': command not found` | A script picked up Windows line endings | `sed -i 's/\r$//' bin/*.sh` |
| Local API answers 502, and the Lambda log says `No module named 'psycopg'` | pip ran Python 3.14 instead of 3.13 and installed nothing usable; `start-dev.sh` hides pip's error (`bin/start-dev.sh` line 342) | `python3 -m pip install --user --force-reinstall pip`, check `pip --version` names 3.13, then `./bin/start-dev.sh` |
| Every local request answers 401, even right after signing in | The sign-in token isn't reaching the Lambda. The workshop's original proxy dropped the `Authorization` header | Check `bin/proxy-server.js` still forwards `authorization` ([bin/README.md](../bin/README.md)) |
| Vite won't start: port 3000 in use | An old server still holds 3000 (`strictPort` refuses to move) | `ss -ltnp \| grep -E ':(3000\|3001\|4566\|5432)'`, stop the old process, run `start-dev.sh` again |
| `Cannot start dnsmasq: port 5353 already in use` in the setup summary | dnsmasq is already running | Harmless if `getent hosts x.localhost.localstack.cloud` prints `127.0.0.1` |
| `terraform output` prints nothing useful | `start-dev.sh` pointed Terraform at LocalStack ([section 6](#6-deploy-to-aws)) | Use the live address <https://d1gov8jpsxhwer.cloudfront.net>, or run `./bin/deploy-backend.sh` first |
| AWS: `503 The database is not ready` | Aurora is waking up | Wait 30 seconds and retry ([section 7](#7-wake-the-site-before-a-demo)) |
| AWS: the first page or sign-in takes about 15 seconds | Aurora was asleep | Expected; wake it first |
| Signed out in two tabs at once | A duplicated browser tab copies the sign-in; when both renew it, the server treats the reuse as theft and ends every session of that person | Sign in again; open a new tab and type the address instead of duplicating one |

## 10. Danger: cleanup-environment.sh

**Don't run `./bin/cleanup-environment.sh` unless the whole AWS deployment should be gone for
good.** It cannot be undone, and it does not ask for confirmation:

1. It zips the project folder (without `.git`, `node_modules`, `.venv` and caches) to
   `s3://coding-workshop-tfstate-c7dabfc1/backup/backup-c7dabfc1.zip`.
2. Then it runs `terraform destroy -auto-approve`, which deletes the CloudFront address,
   the Lambda, the website bucket (`force_destroy = true`, files and all) and the Aurora
   database **with every record in it**: `skip_final_snapshot = true` in
   [`infra/rds.tf`](../infra/rds.tf), so AWS keeps no final copy.

After it, the live site and every login in the README stop working, and a new deploy starts
from an empty database with a new admin password. The backup zip holds the code, not the
data.
